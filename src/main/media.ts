// Media analysis: probing, thumbnails, filmstrips, waveforms and playback proxies.
// Results are cached on disk keyed by file path + size + modification time.
import { app } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ffmpegPath, ffprobePath, hwEncoders, run, tailLog } from './ffmpeg';
import {
  WAVEFORM_RATE,
  type DenoiseOptions,
  type FilmstripInfo,
  type Loudness,
  type MediaKind,
  type MediaProbe,
  type StabilizeOptions,
} from '../shared/api';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff', '.avif']);

let cacheRoot: string | null = null;
function cacheDir(): string {
  if (!cacheRoot) {
    cacheRoot = path.join(app.getPath('userData'), 'media-cache');
    fs.mkdirSync(cacheRoot, { recursive: true });
  }
  return cacheRoot;
}

async function cacheKey(file: string): Promise<string> {
  const st = await fs.promises.stat(file);
  return crypto.createHash('sha1').update(`${file}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 20);
}

async function cachePath(file: string, suffix: string): Promise<string> {
  return path.join(cacheDir(), `${await cacheKey(file)}${suffix}`);
}

function exists(p: string): boolean {
  try {
    return fs.statSync(p).size > 0;
  } catch {
    return false;
  }
}

function parseRate(r: string | undefined): number {
  if (!r) return 0;
  const [a, b] = r.split('/').map(Number);
  if (!b) return a || 0;
  return a / b;
}

interface FfStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
  tags?: Record<string, string>;
  color_space?: string;
  pix_fmt?: string;
  disposition?: Record<string, number>;
  side_data_list?: { rotation?: number }[];
}

export async function probe(file: string): Promise<MediaProbe> {
  const st = await fs.promises.stat(file);
  const r = await run(ffprobePath(), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  if (r.code !== 0) throw new Error(tailLog(r.stderr) || 'ffprobe failed');
  const info = JSON.parse(r.stdout.toString()) as {
    streams?: FfStream[];
    format?: { duration?: string; format_name?: string };
  };
  const streams = info.streams ?? [];
  const ext = path.extname(file).toLowerCase();
  const v = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const a = streams.find((s) => s.codec_type === 'audio');

  let width = v?.width ?? 0;
  let height = v?.height ?? 0;
  const rotation = Number(v?.side_data_list?.find((d) => d.rotation != null)?.rotation ?? v?.tags?.rotate ?? 0);
  if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];

  const isImage = IMAGE_EXT.has(ext) && !!v;
  const kind: MediaKind = isImage ? 'image' : v ? 'video' : 'audio';
  if (!v && !a) throw new Error('No audio or video streams');

  let duration = Number(info.format?.duration ?? v?.duration ?? a?.duration ?? 0);
  if (!Number.isFinite(duration)) duration = 0;
  if (kind === 'image') duration = 0;

  let fps = parseRate(v?.avg_frame_rate) || parseRate(v?.r_frame_rate);
  if (!Number.isFinite(fps) || fps <= 0 || fps > 240) fps = 30;

  return {
    path: file,
    name: path.basename(file),
    kind,
    duration,
    width,
    height,
    fps,
    hasVideo: !!v,
    hasAudio: !!a && kind !== 'image',
    videoCodec: v?.codec_name ?? null,
    audioCodec: a?.codec_name ?? null,
    container: info.format?.format_name ?? '',
    size: st.size,
    colorSpace: v?.color_space && v.color_space !== 'unknown' ? v.color_space : null,
    hasAlpha: kind === 'video' && (v?.tags?.alpha_mode === '1' || v?.tags?.ALPHA_MODE === '1' || /^(yuva|rgba|argb|bgra|abgr)/.test(v?.pix_fmt ?? '')),
  };
}

export async function thumbnail(file: string, kind: MediaKind, duration: number): Promise<string | null> {
  if (kind === 'audio') return null;
  const out = await cachePath(file, '.thumb.jpg');
  if (exists(out)) return out;
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (kind === 'video') args.push('-ss', Math.min(1, duration * 0.1).toFixed(3));
  args.push('-i', file, '-frames:v', '1', '-vf', "scale='min(320,iw)':-2", '-q:v', '4', out);
  const r = await run(ffmpegPath(), args);
  if (r.code !== 0 || !exists(out)) return null;
  return out;
}

const STRIP_TILE_H = 72;
const STRIP_MAX_TILES = 120;

export async function filmstrip(file: string, width: number, height: number, duration: number): Promise<FilmstripInfo | null> {
  if (!(duration > 0) || !width || !height) return null;
  const tileH = STRIP_TILE_H;
  const tileW = Math.max(32, Math.min(256, Math.round((tileH * width) / height / 2) * 2));
  const count = Math.max(1, Math.min(STRIP_MAX_TILES, Math.ceil(duration)));
  const interval = duration / count;
  const out = await cachePath(file, `.strip${count}.jpg`);
  const info: FilmstripInfo = { path: out, count, tileW, tileH, interval };
  if (exists(out)) return info;
  // Decoding only keyframes keeps this fast even for long files.
  const vf = `fps=${(count / duration).toFixed(6)},scale=${tileW}:${tileH},tile=${count}x1`;
  const r = await run(ffmpegPath(), [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-skip_frame', 'nokey', '-i', file,
    '-an', '-vf', vf, '-frames:v', '1', '-q:v', '5', out,
  ]);
  if (r.code !== 0 || !exists(out)) {
    // Some codecs reject skip_frame; retry with a full decode.
    const r2 = await run(ffmpegPath(), [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', file,
      '-an', '-vf', vf, '-frames:v', '1', '-q:v', '5', out,
    ]);
    if (r2.code !== 0 || !exists(out)) return null;
  }
  return info;
}

const WAVE_SAMPLE_RATE = 4000;

/** Peak amplitude envelope, WAVEFORM_RATE values per second, 0..255. */
export async function waveform(file: string): Promise<Uint8Array | null> {
  const out = await cachePath(file, '.peaks');
  if (exists(out)) return new Uint8Array(await fs.promises.readFile(out));

  const samplesPerPeak = WAVE_SAMPLE_RATE / WAVEFORM_RATE;
  const peaks: number[] = [];
  let leftover: Buffer | null = null;
  let count = 0;
  let max = 0;

  const r = await run(
    ffmpegPath(),
    ['-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(WAVE_SAMPLE_RATE), '-f', 's16le', '-acodec', 'pcm_s16le', 'pipe:1'],
    {
      onStdout: (chunk) => {
        let buf = leftover ? Buffer.concat([leftover, chunk]) : chunk;
        const usable = buf.length - (buf.length % 2);
        leftover = usable < buf.length ? buf.subarray(usable) : null;
        buf = buf.subarray(0, usable);
        for (let i = 0; i < buf.length; i += 2) {
          const v = Math.abs(buf.readInt16LE(i));
          if (v > max) max = v;
          if (++count === samplesPerPeak) {
            peaks.push(max);
            count = 0;
            max = 0;
          }
        }
      },
    },
  );
  if (count > 0) peaks.push(max);
  if (r.code !== 0 && peaks.length === 0) return null;

  // Perceptual scaling so quiet passages remain visible.
  const data = new Uint8Array(peaks.length);
  for (let i = 0; i < peaks.length; i++) {
    data[i] = Math.round(Math.sqrt(peaks[i] / 32768) * 255);
  }
  await fs.promises.writeFile(out, data);
  return data;
}

/** Mono 16 kHz float PCM of a source range, for speech recognition. */
export async function readPcm(file: string, start: number, duration: number): Promise<Float32Array> {
  const r = await run(ffmpegPath(), [
    '-hide_banner', '-loglevel', 'error',
    '-ss', Math.max(0, start).toFixed(6), '-t', Math.max(0.01, duration).toFixed(6), '-i', file,
    '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1',
  ]);
  if (r.code !== 0) throw new Error(tailLog(r.stderr) || 'Audio extraction failed');
  const buf = r.stdout;
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength - (buf.byteLength % 4)));
}

// AI model files downloaded by the renderer, cached on disk by URL.
function modelFile(url: string): string {
  const dir = path.join(app.getPath('userData'), 'models');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, crypto.createHash('sha1').update(url).digest('hex'));
}

export async function modelCacheGet(url: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await fs.promises.readFile(modelFile(url)));
  } catch {
    return null;
  }
}

export async function modelCachePut(url: string, data: Uint8Array): Promise<void> {
  const file = modelFile(url);
  await fs.promises.writeFile(`${file}.part`, data);
  await fs.promises.rename(`${file}.part`, file);
}

/** Unique path for generated files (AI results and similar). */
export async function workPath(name: string): Promise<string> {
  const dir = path.join(cacheDir(), 'work');
  await fs.promises.mkdir(dir, { recursive: true });
  const safe = name.replace(/[^\w.-]+/g, '_').slice(-80);
  return path.join(dir, `${Date.now().toString(36)}-${safe}`);
}

/** Full-resolution still of one source frame (freeze frames). */
export async function extractFrame(file: string, time: number): Promise<string> {
  const out = await cachePath(file, `.frame${Math.round(time * 1000)}.png`);
  if (exists(out)) return out;
  const r = await run(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-ss', time.toFixed(6), '-i', file, '-frames:v', '1', out]);
  if (r.code !== 0 || !exists(out)) throw new Error(tailLog(r.stderr) || 'Frame extraction failed');
  return out;
}

const REVERSE_CHUNK = 2;

/**
 * Reversed copy of a source range. ffmpeg's reverse filter buffers every frame,
 * so the range is reversed in short chunks that are then joined back to front.
 */
export async function reverseRange(
  file: string,
  start: number,
  duration: number,
  withAudio: boolean,
  onProgress: (p: number) => void,
): Promise<string> {
  const out = await cachePath(file, `.rev${Math.round(start * 1000)}_${Math.round(duration * 1000)}.mp4`);
  if (exists(out)) return out;
  const gpu = (await hwEncoders()).includes('nvenc');
  const video = gpu
    ? ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '18', '-b:v', '0']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16'];
  const count = Math.max(1, Math.ceil(duration / REVERSE_CHUNK - 1e-6));
  const parts: string[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const s = start + i * REVERSE_CHUNK;
      const d = Math.min(REVERSE_CHUNK, start + duration - s);
      const part = `${out}.part${i}.mp4`;
      const args = ['-hide_banner', '-loglevel', 'error', '-y', '-ss', s.toFixed(6), '-t', d.toFixed(6), '-i', file, '-vf', 'reverse'];
      args.push(...(withAudio ? ['-af', 'areverse', '-c:a', 'aac', '-b:a', '192k'] : ['-an']));
      args.push(...video, '-pix_fmt', 'yuv420p', part);
      const r = await run(ffmpegPath(), args);
      if (r.code !== 0 || !exists(part)) throw new Error(tailLog(r.stderr) || 'Reverse failed');
      parts.push(part);
      onProgress((i + 1) / (count + 1));
    }
    // Last chunk of the source plays first.
    const list = `${out}.txt`;
    await fs.promises.writeFile(list, [...parts].reverse().map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
    const tmp = `${out}.part.mp4`;
    const r = await run(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', tmp]);
    await fs.promises.unlink(list).catch(() => undefined);
    if (r.code !== 0 || !exists(tmp)) throw new Error(tailLog(r.stderr) || 'Reverse join failed');
    await fs.promises.rename(tmp, out);
    onProgress(1);
    return out;
  } finally {
    for (const p of parts) await fs.promises.unlink(p).catch(() => undefined);
  }
}

/** Parses `-progress pipe:1` output into progress over [from, from + span]. */
function progressReader(duration: number, onProgress: (p: number) => void, from = 0, span = 1): (chunk: Buffer) => void {
  let lastReport = 0;
  return (chunk) => {
    const re = /out_time_us=(\d+)/g;
    let match: RegExpExecArray | null;
    let us = -1;
    const s = chunk.toString();
    while ((match = re.exec(s))) us = Number(match[1]);
    if (us < 0 || !(duration > 0)) return;
    const now = Date.now();
    if (now - lastReport < 200) return;
    lastReport = now;
    onProgress(from + span * Math.min(0.999, us / 1e6 / duration));
  };
}

async function videoEncoderArgs(quality: number): Promise<string[]> {
  const gpu = (await hwEncoders()).includes('nvenc');
  return gpu
    ? ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', String(quality + 1), '-b:v', '0']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(quality)];
}

async function finishOutput(tmp: string, out: string, r: { code: number | null; stderr: string }, what: string): Promise<string> {
  if (r.code !== 0 || !exists(tmp)) {
    await fs.promises.unlink(tmp).catch(() => undefined);
    throw new Error(tailLog(r.stderr) || `${what} failed`);
  }
  await fs.promises.rename(tmp, out);
  return out;
}

/**
 * Stabilised copy of a source range: vid.stab analyses camera motion in a first
 * pass and smooths it out in a second one.
 */
export async function stabilize(
  file: string,
  start: number,
  duration: number,
  opts: StabilizeOptions,
  onProgress: (p: number) => void,
): Promise<string> {
  const smoothing = Math.round(4 + Math.max(0, Math.min(100, opts.smoothing)) * 0.56);
  const tag = `${Math.round(start * 1000)}_${Math.round(duration * 1000)}_${smoothing}${opts.zoom ? 'z' : ''}`;
  const out = await cachePath(file, `.stab${tag}.mp4`);
  if (exists(out)) return out;
  const dir = path.dirname(out);
  // Filter options cannot hold a Windows drive path unescaped, so the
  // transforms file is addressed by bare name from the cache directory.
  const trf = `${path.basename(out)}.trf`;
  const range = ['-ss', start.toFixed(6), '-t', duration.toFixed(6), '-i', file];
  const progress = ['-progress', 'pipe:1', '-nostats'];
  try {
    const detect = await run(
      ffmpegPath(),
      ['-hide_banner', '-loglevel', 'error', '-y', ...range, '-map', '0:v:0', '-vf', `vidstabdetect=shakiness=6:accuracy=15:result=${trf}`, ...progress, '-f', 'null', '-'],
      { cwd: dir, onStdout: progressReader(duration, onProgress, 0, 0.45) },
    );
    if (detect.code !== 0) throw new Error(tailLog(detect.stderr) || 'Motion analysis failed');
    const vf = [
      `vidstabtransform=input=${trf}:smoothing=${smoothing}:optzoom=${opts.zoom ? 1 : 0}:zoomspeed=0.2:interpol=bicubic:crop=black`,
      'unsharp=5:5:0.6:3:3:0.3',
      'format=yuv420p',
    ].join(',');
    const tmp = `${out}.part.mp4`;
    const r = await run(
      ffmpegPath(),
      [
        '-hide_banner', '-loglevel', 'error', '-y', ...range,
        '-map', '0:v:0', '-map', '0:a:0?', '-vf', vf,
        ...(await videoEncoderArgs(17)), '-c:a', 'aac', '-b:a', '192k',
        '-movflags', '+faststart', ...progress, tmp,
      ],
      { cwd: dir, onStdout: progressReader(duration, onProgress, 0.45, 0.55) },
    );
    await finishOutput(tmp, out, r, 'Stabilization');
    onProgress(1);
    return out;
  } finally {
    await fs.promises.unlink(path.join(dir, trf)).catch(() => undefined);
  }
}

const MP4_VIDEO = new Set(['h264', 'hevc', 'av1', 'vp9', 'mpeg4']);

/**
 * Copy of a file with background noise removed from its audio. The video stream
 * is copied untouched, so timing and quality are unchanged.
 */
export async function denoise(file: string, opts: DenoiseOptions, onProgress: (p: number) => void): Promise<string> {
  const info = await probe(file);
  const strength = Math.max(0, Math.min(100, opts.strength));
  const nr = Math.round(6 + strength * 0.3);
  const filters = [`afftdn=nr=${nr}:nf=-50:tn=1`];
  if (opts.voice) filters.unshift('highpass=f=80', 'lowpass=f=14000');
  const video = info.kind === 'video';
  const ext = !video ? '.m4a' : MP4_VIDEO.has(info.videoCodec ?? '') ? '.mp4' : '.mkv';
  const out = await cachePath(file, `.dn${nr}${opts.voice ? 'v' : ''}${ext}`);
  if (exists(out)) return out;
  const tmp = `${out}.part${ext}`;
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', file];
  if (video) args.push('-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy');
  else args.push('-map', '0:a:0', '-vn');
  args.push('-af', filters.join(','), '-c:a', 'aac', '-b:a', '192k');
  if (ext !== '.mkv') args.push('-movflags', '+faststart');
  args.push('-progress', 'pipe:1', '-nostats', tmp);
  const r = await run(ffmpegPath(), args, { onStdout: progressReader(info.duration, onProgress) });
  await finishOutput(tmp, out, r, 'Noise reduction');
  onProgress(1);
  return out;
}

/** EBU R128 integrated loudness (LUFS) and true peak (dBTP) of a source range. */
export async function measureLoudness(file: string, start: number, duration: number): Promise<Loudness> {
  const r = await run(ffmpegPath(), [
    '-hide_banner', '-nostats',
    '-ss', Math.max(0, start).toFixed(6), '-t', Math.max(0.05, duration).toFixed(6), '-i', file,
    '-vn', '-af', 'loudnorm=print_format=json', '-f', 'null', '-',
  ]);
  const json = r.stderr.slice(r.stderr.lastIndexOf('{'));
  try {
    const data = JSON.parse(json.slice(0, json.indexOf('}') + 1)) as { input_i: string; input_tp: string };
    const lufs = Number(data.input_i);
    const peak = Number(data.input_tp);
    return { lufs: Number.isFinite(lufs) ? lufs : -Infinity, peak: Number.isFinite(peak) ? peak : -Infinity };
  } catch {
    throw new Error(tailLog(r.stderr) || 'Loudness analysis failed');
  }
}

/** Transcodes media Chromium cannot play into an H.264/AAC (or AAC-only) proxy. */
export async function proxy(
  file: string,
  kind: MediaKind,
  duration: number,
  onProgress: (p: number) => void,
): Promise<string> {
  if (kind === 'image') {
    const png = await cachePath(file, '.proxy.png');
    if (exists(png)) return png;
    const r = await run(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-frames:v', '1', png]);
    if (r.code !== 0 || !exists(png)) throw new Error(tailLog(r.stderr) || 'Image conversion failed');
    onProgress(1);
    return png;
  }
  const audioOnly = kind === 'audio';
  const out = await cachePath(file, audioOnly ? '.proxy.m4a' : '.proxy.mp4');
  if (exists(out)) return out;
  const tmp = `${out}.part${audioOnly ? '.m4a' : '.mp4'}`;
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', file];
  if (audioOnly) {
    args.push('-vn', '-c:a', 'aac', '-b:a', '192k', '-ac', '2');
  } else {
    // The GPU encoder makes proxies several times faster when present.
    const gpu = (await hwEncoders()).includes('nvenc');
    const video = gpu
      ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '23', '-b:v', '0']
      : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22'];
    args.push(
      '-map', '0:v:0', '-map', '0:a:0?',
      ...video, '-pix_fmt', 'yuv420p', '-g', '30',
      '-vf', "scale=-2:'min(1080,ih)'",
      '-c:a', 'aac', '-b:a', '160k', '-ac', '2',
    );
  }
  args.push('-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', tmp);

  const r = await run(ffmpegPath(), args, { onStdout: progressReader(duration, onProgress) });
  await finishOutput(tmp, out, r, 'Proxy transcode');
  onProgress(1);
  return out;
}
