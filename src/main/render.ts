// Export pipeline on the main-process side.
//  * Decoders: ffmpeg processes that stream raw RGBA frames of a source clip
//    to the renderer, which composites them exactly like the live preview.
//  * Encoder jobs: an ffmpeg process that receives composited RGBA frames on
//    stdin, mixes the audio plan with filters and writes the output file.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { ffmpegPath, tailLog } from './ffmpeg';
import type { AudioSegment, DecoderSpec, ExportResult, ExportSpec } from '../shared/api';

let nextId = 1;
const newId = (prefix: string) => `${prefix}${nextId++}`;

// ---------------------------------------------------------------------------
// Decoders

class FrameReader {
  private chunks: Buffer[] = [];
  private buffered = 0;
  private ended = false;
  private waiter: (() => void) | null = null;
  private readonly highWater: number;

  constructor(
    private readonly proc: ChildProcess,
    private readonly frameSize: number,
  ) {
    this.highWater = frameSize * 4;
    const out = proc.stdout!;
    out.on('data', (c: Buffer) => {
      this.chunks.push(c);
      this.buffered += c.length;
      if (this.buffered > this.highWater) out.pause();
      this.wake();
    });
    out.on('end', () => {
      this.ended = true;
      this.wake();
    });
    proc.on('error', () => {
      this.ended = true;
      this.wake();
    });
  }

  private wake() {
    const w = this.waiter;
    this.waiter = null;
    w?.();
  }

  async read(): Promise<Buffer | null> {
    while (this.buffered < this.frameSize && !this.ended) {
      await new Promise<void>((r) => (this.waiter = r));
    }
    if (this.buffered < this.frameSize) return null;
    const frame = Buffer.allocUnsafe(this.frameSize);
    let filled = 0;
    while (filled < this.frameSize) {
      const head = this.chunks[0];
      const take = Math.min(head.length, this.frameSize - filled);
      head.copy(frame, filled, 0, take);
      filled += take;
      if (take === head.length) this.chunks.shift();
      else this.chunks[0] = head.subarray(take);
    }
    this.buffered -= this.frameSize;
    if (this.buffered <= this.highWater) this.proc.stdout!.resume();
    return frame;
  }
}

interface Decoder {
  proc: ChildProcess;
  reader: FrameReader;
}

const decoders = new Map<string, Decoder>();

export function decoderOpen(spec: DecoderSpec): string {
  const w = Math.max(2, Math.round(spec.width / 2) * 2);
  const h = Math.max(2, Math.round(spec.height / 2) * 2);
  const speed = spec.speed > 0 ? spec.speed : 1;
  const vf = [
    `setpts=(PTS-STARTPTS)/${speed.toFixed(6)}`,
    `fps=${spec.fps}`,
    `scale=${w}:${h}:flags=bicubic`,
    'format=rgba',
  ].join(',');
  const args = [
    '-hide_banner', '-loglevel', 'error',
    '-ss', Math.max(0, spec.sourceIn).toFixed(6),
    '-i', spec.path,
    '-an', '-sn',
    '-vf', vf,
    '-t', (spec.duration + 2 / spec.fps).toFixed(6),
    '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
  ];
  const proc = spawn(ffmpegPath(), args, { windowsHide: true });
  proc.stderr?.resume();
  const id = newId('dec');
  decoders.set(id, { proc, reader: new FrameReader(proc, w * h * 4) });
  return id;
}

export async function decoderRead(id: string): Promise<Buffer | null> {
  const d = decoders.get(id);
  if (!d) return null;
  return d.reader.read();
}

export function decoderClose(id: string): void {
  const d = decoders.get(id);
  if (!d) return;
  decoders.delete(id);
  d.proc.stdout?.destroy();
  d.proc.kill();
}

// ---------------------------------------------------------------------------
// Encoder jobs

interface Job {
  proc: ChildProcess;
  spec: ExportSpec;
  stderr: string;
  exited: Promise<number | null>;
  failed: boolean;
}

const jobs = new Map<string, Job>();

function atempoChain(speed: number): string[] {
  const parts: string[] = [];
  let s = speed;
  while (s < 0.5) {
    parts.push('atempo=0.5');
    s /= 0.5;
  }
  while (s > 100) {
    parts.push('atempo=100');
    s /= 100;
  }
  if (Math.abs(s - 1) > 1e-4) parts.push(`atempo=${s.toFixed(6)}`);
  return parts;
}

/** Inputs and a filter graph that mixes all audio segments into [aout]. */
function audioGraph(segments: AudioSegment[], firstInput: number, total: number) {
  const inputs: string[] = [];
  const chains: string[] = [];
  const labels: string[] = [];
  segments.forEach((seg, i) => {
    const idx = firstInput + i;
    inputs.push('-ss', seg.sourceIn.toFixed(6), '-t', seg.sourceDuration.toFixed(6), '-i', seg.path);
    const f = ['aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo', ...atempoChain(seg.speed), 'asetpts=PTS-STARTPTS'];
    if (Math.abs(seg.volume - 1) > 1e-4) f.push(`volume=${seg.volume.toFixed(4)}`);
    if (seg.fadeIn > 0) f.push(`afade=t=in:st=0:d=${seg.fadeIn.toFixed(4)}`);
    if (seg.fadeOut > 0) f.push(`afade=t=out:st=${Math.max(0, seg.duration - seg.fadeOut).toFixed(4)}:d=${seg.fadeOut.toFixed(4)}`);
    f.push(`atrim=0:${seg.duration.toFixed(6)}`);
    const delay = Math.max(0, Math.round(seg.start * 1000));
    if (delay > 0) f.push(`adelay=${delay}:all=1`);
    chains.push(`[${idx}:a]${f.join(',')}[a${i}]`);
    labels.push(`[a${i}]`);
  });
  if (segments.length === 0) {
    inputs.push('-f', 'lavfi', '-t', total.toFixed(6), '-i', 'anullsrc=r=48000:cl=stereo');
    chains.push(`[${firstInput}:a]apad[aout]`);
  } else if (segments.length === 1) {
    chains.push(`${labels[0]}apad[aout]`);
  } else {
    chains.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,apad[aout]`);
  }
  return { inputs, filter: chains.join(';') };
}

const CRF: Record<string, Record<ExportSpec['quality'], number>> = {
  x264: { high: 17, medium: 21, low: 26 },
  x265: { high: 20, medium: 25, low: 30 },
  vp9: { high: 26, medium: 32, low: 38 },
};

function buildArgs(spec: ExportSpec): string[] {
  const hasVideo = !['mp3', 'wav'].includes(spec.format);
  const hasAudio = spec.format !== 'gif';
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  const filters: string[] = [];

  if (hasVideo) {
    args.push('-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${spec.width}x${spec.height}`, '-r', String(spec.fps), '-i', 'pipe:0');
    // WebGL readPixels returns rows bottom-up.
    if (spec.format === 'gif') {
      filters.push('[0:v]vflip,split[g0][g1];[g0]palettegen=stats_mode=diff[pal];[g1][pal]paletteuse=dither=bayer:bayer_scale=4[vout]');
    } else {
      filters.push('[0:v]vflip[vout]');
    }
  }
  if (hasAudio) {
    const g = audioGraph(spec.audio, hasVideo ? 1 : 0, spec.duration);
    args.push(...g.inputs);
    filters.push(g.filter);
  }
  args.push('-filter_complex', filters.join(';'));
  if (hasVideo) args.push('-map', '[vout]');
  if (hasAudio) args.push('-map', '[aout]');

  const q = spec.quality;
  switch (spec.format) {
    case 'mp4':
      args.push('-c:v', 'libx264', '-preset', q === 'high' ? 'slow' : q === 'medium' ? 'medium' : 'veryfast',
        '-crf', String(CRF.x264[q]), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
      break;
    case 'mp4-hevc':
      args.push('-c:v', 'libx265', '-preset', q === 'low' ? 'veryfast' : 'medium', '-crf', String(CRF.x265[q]),
        '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
      break;
    case 'webm':
      args.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(CRF.vp9[q]), '-row-mt', '1', '-deadline', 'good',
        '-cpu-used', q === 'high' ? '2' : '4', '-pix_fmt', 'yuv420p', '-c:a', 'libopus', '-b:a', '160k');
      break;
    case 'mov-prores':
      args.push('-c:v', 'prores_ks', '-profile:v', q === 'high' ? '3' : q === 'medium' ? '2' : '0',
        '-pix_fmt', 'yuv422p10le', '-c:a', 'pcm_s16le');
      break;
    case 'gif':
      args.push('-loop', '0');
      break;
    case 'mp3':
      args.push('-c:a', 'libmp3lame', '-b:a', q === 'high' ? '320k' : q === 'medium' ? '192k' : '128k');
      break;
    case 'wav':
      args.push('-c:a', 'pcm_s16le');
      break;
  }
  args.push('-t', spec.duration.toFixed(6), spec.outPath);
  return args;
}

export function exportStart(spec: ExportSpec): string {
  const args = buildArgs(spec);
  const proc = spawn(ffmpegPath(), args, { windowsHide: true });
  const job: Job = {
    proc,
    spec,
    stderr: '',
    failed: false,
    exited: new Promise((resolve) => {
      proc.on('close', (code) => resolve(code));
      proc.on('error', (e) => {
        job.failed = true;
        job.stderr += `\n${e.message}`;
        resolve(-1);
      });
    }),
  };
  proc.stderr?.on('data', (c: Buffer) => {
    job.stderr += c.toString();
    if (job.stderr.length > 64_000) job.stderr = job.stderr.slice(-32_000);
  });
  proc.stdin?.on('error', () => {
    job.failed = true;
  });
  const id = newId('job');
  jobs.set(id, job);
  return id;
}

export async function exportFrame(id: string, rgba: Uint8Array): Promise<void> {
  const job = jobs.get(id);
  if (!job) throw new Error('Unknown export job');
  if (job.failed || job.proc.exitCode !== null) {
    throw new Error(tailLog(job.stderr) || 'Encoder stopped');
  }
  const stdin = job.proc.stdin!;
  const ok = stdin.write(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength));
  if (!ok) {
    await new Promise<void>((resolve) => {
      const done = () => {
        stdin.off('drain', done);
        job.proc.off('close', done);
        resolve();
      };
      stdin.on('drain', done);
      job.proc.on('close', done);
    });
  }
}

export async function exportFinish(id: string): Promise<ExportResult> {
  const job = jobs.get(id);
  if (!job) return { ok: false, error: 'Unknown export job' };
  job.proc.stdin?.end();
  const code = await job.exited;
  jobs.delete(id);
  if (code === 0 && !job.failed) return { ok: true };
  return { ok: false, error: tailLog(job.stderr) || `ffmpeg exited with code ${code}` };
}

export async function exportCancel(id: string): Promise<void> {
  const job = jobs.get(id);
  if (!job) return;
  jobs.delete(id);
  job.proc.stdin?.destroy();
  job.proc.kill();
  await job.exited;
  try {
    fs.unlinkSync(job.spec.outPath);
  } catch {
    // partial file may not exist
  }
}

export function killAll(): void {
  for (const id of [...decoders.keys()]) decoderClose(id);
  for (const job of jobs.values()) job.proc.kill();
  jobs.clear();
}
