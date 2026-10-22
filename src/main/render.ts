// Export pipeline on the main-process side.
//  * Decoders: ffmpeg processes that stream raw RGBA frames of a source clip
//    to the renderer, which composites them exactly like the live preview.
//  * Encoder jobs: an ffmpeg process that receives composited RGBA frames on
//    stdin, mixes the audio plan with filters and writes the output file.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { ffmpegPath, hwEncoders, tailLog } from './ffmpeg';
import {
  AUDIO_FX,
  frameBytes,
  type AudioSegment,
  type DecoderSpec,
  type ExportResult,
  type ExportSpec,
  type HwEncoder,
  type MatteSpec,
} from '../shared/api';

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
    const finish = () => {
      this.ended = true;
      this.wake();
    };
    out.on('end', finish);
    out.on('close', finish);
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

/** Hardware-accelerated decoding ('auto' falls back to software when unsupported). */
const DECODE_HWACCEL = process.env.VR_DECODE_HWACCEL ?? 'none';

export function decoderOpen(spec: DecoderSpec): string {
  const w = Math.max(2, Math.round(spec.width / 2) * 2);
  const h = Math.max(2, Math.round(spec.height / 2) * 2);
  const speed = spec.speed > 0 ? spec.speed : 1;
  // Frames stay in YUV (source colour matrix, limited range): a third of the
  // RGBA size, and the GPU converts them during compositing.
  const format = spec.format ?? 'yuv420p';
  const vf = [
    `setpts=(PTS-STARTPTS)/${speed.toFixed(6)}`,
    `fps=${spec.fps}`,
    format === 'rgba' ? `scale=${w}:${h}:flags=bicubic` : `scale=${w}:${h}:flags=bicubic:out_range=tv`,
    `format=${format}`,
  ].join(',');
  const args = ['-hide_banner', '-loglevel', 'error'];
  if (DECODE_HWACCEL !== 'none' && format !== 'yuva420p') args.push('-hwaccel', DECODE_HWACCEL);
  // ffmpeg's native VP9 decoder drops the alpha plane; libvpx keeps it.
  if (format === 'yuva420p') args.push('-c:v', 'libvpx-vp9');
  args.push(
    '-ss', Math.max(0, spec.sourceIn).toFixed(6),
    '-i', spec.path,
    '-an', '-sn',
    '-vf', vf,
    '-t', (spec.duration + 2 / spec.fps).toFixed(6),
    '-f', 'rawvideo', '-pix_fmt', format, 'pipe:1',
  );
  const proc = spawn(ffmpegPath(), args, { windowsHide: true });
  proc.stderr?.resume();
  const id = newId('dec');
  decoders.set(id, { proc, reader: new FrameReader(proc, frameBytes(w, h, format)) });
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
  encoder: string;
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

/** Piecewise-linear ffmpeg expression of volume keyframes (t = segment time). */
function volumeExpr(keys: { t: number; v: number }[], scale: number): string {
  const k = [...keys].sort((a, b) => a.t - b.t);
  const n = (x: number) => x.toFixed(6);
  let expr = n(k[k.length - 1].v);
  for (let i = k.length - 2; i >= 0; i--) {
    const a = k[i];
    const b = k[i + 1];
    const span = Math.max(1e-6, b.t - a.t);
    expr = `if(lt(t,${n(b.t)}),${n(a.v)}+(${n(b.v - a.v)})*(t-${n(a.t)})/${n(span)},${expr})`;
  }
  return `${n(scale)}*if(lt(t,${n(k[0].t)}),${n(k[0].v)},${expr})`;
}

/** EQ and compressor matching the preview's Web Audio nodes (RBJ shelves with S=1). */
function audioFxFilters(seg: AudioSegment): string[] {
  const f: string[] = [];
  const eq = seg.eq;
  if (eq?.low) f.push(`bass=g=${eq.low}:f=${AUDIO_FX.lowFreq}:t=s:w=1`);
  if (eq?.mid) f.push(`equalizer=f=${AUDIO_FX.midFreq}:t=q:w=${AUDIO_FX.midQ}:g=${eq.mid}`);
  if (eq?.high) f.push(`treble=g=${eq.high}:f=${AUDIO_FX.highFreq}:t=s:w=1`);
  if (seg.compressor) {
    const threshold = Math.pow(10, AUDIO_FX.compThresholdDb / 20);
    f.push(
      `acompressor=threshold=${threshold.toFixed(5)}:ratio=${AUDIO_FX.compRatio}:attack=${AUDIO_FX.compAttack * 1000}` +
        `:release=${AUDIO_FX.compRelease * 1000}:knee=2:makeup=2`,
    );
  }
  return f;
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
    f.push(...audioFxFilters(seg));
    if (seg.volumeKeys?.length) f.push(`volume='${volumeExpr(seg.volumeKeys, seg.volume)}':eval=frame`);
    else if (Math.abs(seg.volume - 1) > 1e-4) f.push(`volume=${seg.volume.toFixed(4)}`);
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

type Quality = ExportSpec['quality'];
const pick = (q: Quality, high: number | string, medium: number | string, low: number | string) =>
  String(q === 'high' ? high : q === 'medium' ? medium : low);

function chooseEncoder(spec: ExportSpec, available: HwEncoder[]): HwEncoder | null {
  if (spec.encoder === 'cpu') return null;
  if (spec.encoder === 'auto') return (['nvenc', 'qsv', 'amf'] as HwEncoder[]).find((e) => available.includes(e)) ?? null;
  return available.includes(spec.encoder) ? spec.encoder : null;
}

/** Rate-control arguments for a target bitrate (Mbit/s): average, 1.5x peak, 2x buffer. */
function bitrateArgs(mbps: number): string[] {
  const k = (x: number) => `${Math.max(100, Math.round(mbps * x * 1000))}k`;
  return ['-b:v', k(1), '-maxrate', k(1.5), '-bufsize', k(2)];
}

/** Encoder arguments for H.264/HEVC on the GPU or the CPU. */
function videoCodecArgs(codec: 'h264' | 'hevc', hw: HwEncoder | null, q: Quality, bitrate?: number): string[] {
  const hevc = codec === 'hevc';
  if (bitrate) {
    switch (hw) {
      case 'nvenc':
        return ['-c:v', `${codec}_nvenc`, '-preset', pick(q, 'p6', 'p5', 'p3'), '-tune', 'hq', '-rc', 'vbr', ...bitrateArgs(bitrate), '-spatial-aq', '1'];
      case 'qsv':
        return ['-c:v', `${codec}_qsv`, '-preset', pick(q, 'slow', 'medium', 'faster'), ...bitrateArgs(bitrate), '-look_ahead', '0'];
      case 'amf':
        return ['-c:v', `${codec}_amf`, '-quality', pick(q, 'quality', 'balanced', 'speed'), '-rc', 'vbr_peak', ...bitrateArgs(bitrate)];
      default:
        return [
          '-c:v', hevc ? 'libx265' : 'libx264',
          '-preset', hevc ? pick(q, 'fast', 'faster', 'veryfast') : pick(q, 'medium', 'faster', 'veryfast'),
          ...bitrateArgs(bitrate),
        ];
    }
  }
  switch (hw) {
    case 'nvenc':
      return ['-c:v', `${codec}_nvenc`, '-preset', pick(q, 'p6', 'p5', 'p3'), '-tune', 'hq', '-rc', 'vbr',
        '-cq', hevc ? pick(q, 21, 26, 31) : pick(q, 19, 23, 28), '-b:v', '0', '-spatial-aq', '1'];
    case 'qsv':
      return ['-c:v', `${codec}_qsv`, '-preset', pick(q, 'slow', 'medium', 'faster'),
        '-global_quality', hevc ? pick(q, 22, 26, 31) : pick(q, 20, 24, 29), '-look_ahead', '0'];
    case 'amf': {
      const qp = Number(hevc ? pick(q, 22, 26, 31) : pick(q, 19, 23, 28));
      return ['-c:v', `${codec}_amf`, '-quality', pick(q, 'quality', 'balanced', 'speed'), '-rc', 'cqp',
        '-qp_i', String(qp), '-qp_p', String(qp + 2), '-qp_b', String(qp + 4)];
    }
    default:
      return hevc
        ? ['-c:v', 'libx265', '-preset', pick(q, 'fast', 'faster', 'veryfast'), '-crf', pick(q, 20, 25, 30)]
        : ['-c:v', 'libx264', '-preset', pick(q, 'medium', 'faster', 'veryfast'), '-crf', pick(q, 17, 21, 25)];
  }
}

const BT709 = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];

function buildArgs(spec: ExportSpec, hwAvailable: HwEncoder[]): { args: string[]; encoder: string } {
  const hasVideo = !['mp3', 'wav'].includes(spec.format);
  const hasAudio = spec.format !== 'gif';
  const yuvInput = hasVideo && spec.pixelFormat === 'yuv420p' && spec.format !== 'gif';
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  const filters: string[] = [];
  let encoder: string = spec.format;

  if (hasVideo) {
    args.push('-f', 'rawvideo', '-pix_fmt', yuvInput ? 'yuv420p' : 'rgba', '-s', `${spec.width}x${spec.height}`, '-r', String(spec.fps));
    if (yuvInput) args.push(...BT709);
    args.push('-i', 'pipe:0');
    if (spec.format === 'gif') {
      // RGBA readback rows are bottom-up.
      filters.push('[0:v]vflip,split[g0][g1];[g0]palettegen=stats_mode=diff[pal];[g1][pal]paletteuse=dither=bayer:bayer_scale=4[vout]');
    } else if (yuvInput) {
      filters.push('[0:v]null[vout]');
    } else {
      filters.push('[0:v]vflip,scale=out_color_matrix=bt709:out_range=tv[vout]');
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
  const audioRate = (fallback: number) => `${Math.round(spec.audioBitrate && spec.audioBitrate > 0 ? spec.audioBitrate : fallback)}k`;
  switch (spec.format) {
    case 'mp4':
    case 'mp4-hevc': {
      const codec = spec.format === 'mp4' ? 'h264' : 'hevc';
      const hw = chooseEncoder(spec, hwAvailable);
      const codecArgs = videoCodecArgs(codec, hw, q, spec.bitrate);
      encoder = codecArgs[1];
      args.push(...codecArgs, '-pix_fmt', 'yuv420p', ...BT709);
      if (codec === 'hevc') args.push('-tag:v', 'hvc1');
      args.push('-c:a', 'aac', '-b:a', audioRate(192), '-movflags', '+faststart');
      break;
    }
    case 'webm':
      encoder = 'libvpx-vp9';
      args.push('-c:v', 'libvpx-vp9', ...(spec.bitrate ? bitrateArgs(spec.bitrate) : ['-b:v', '0', '-crf', pick(q, 28, 32, 38)]), '-row-mt', '1', '-tile-columns', '2',
        '-deadline', q === 'low' ? 'realtime' : 'good', '-cpu-used', pick(q, 3, 5, 8),
        '-pix_fmt', 'yuv420p', ...BT709, '-c:a', 'libopus', '-b:a', audioRate(160));
      break;
    case 'mov-prores':
      encoder = 'prores_ks';
      args.push('-c:v', 'prores_ks', '-profile:v', pick(q, 3, 2, 0), '-pix_fmt', 'yuv422p10le', ...BT709, '-c:a', 'pcm_s16le');
      break;
    case 'gif':
      args.push('-loop', '0');
      break;
    case 'mp3':
      args.push('-c:a', 'libmp3lame', '-b:a', audioRate(q === 'high' ? 320 : q === 'medium' ? 192 : 128));
      break;
    case 'wav':
      args.push('-c:a', 'pcm_s16le');
      break;
  }
  args.push('-t', spec.duration.toFixed(6), spec.outPath);
  return { args, encoder };
}

export async function exportStart(spec: ExportSpec): Promise<string> {
  const { args, encoder } = buildArgs(spec, await hwEncoders());
  return startJob(args, spec.outPath, encoder);
}

/**
 * Bakes grey matte frames (sent with exportFrame) into a VP9 WebM with alpha:
 * the source range keeps its full resolution, the matte is scaled up to it.
 */
export function matteStart(spec: MatteSpec): string {
  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', spec.sourceIn.toFixed(6), '-t', spec.duration.toFixed(6), '-i', spec.source,
    '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${spec.matteWidth}x${spec.matteHeight}`, '-r', String(spec.fps), '-i', 'pipe:0',
    '-filter_complex',
    `[0:v]fps=${spec.fps},format=yuv420p[src];[1:v][src]scale2ref=flags=bicubic[m][s];[s][m]alphamerge,format=yuva420p[v]`,
    '-map', '[v]',
  ];
  if (spec.withAudio) args.push('-map', '0:a:0?', '-c:a', 'libopus', '-b:a', '160k');
  args.push(
    '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '28', '-row-mt', '1',
    '-deadline', 'good', '-cpu-used', '4', '-auto-alt-ref', '0',
    '-t', spec.duration.toFixed(6), spec.outPath,
  );
  return startJob(args, spec.outPath, 'libvpx-vp9');
}

function startJob(args: string[], outPath: string, encoder: string): string {
  const spec = { outPath } as ExportSpec;
  const proc = spawn(ffmpegPath(), args, { windowsHide: true });
  const job: Job = {
    proc,
    spec,
    encoder,
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
  if (code === 0 && !job.failed) return { ok: true, encoder: job.encoder };
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
