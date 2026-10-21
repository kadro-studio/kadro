// Media analysis: probing, thumbnails, filmstrips, waveforms and playback proxies.
// Results are cached on disk keyed by file path + size + modification time.
import { app } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ffmpegPath, ffprobePath, run, tailLog } from './ffmpeg';
import { WAVEFORM_RATE, type FilmstripInfo, type MediaKind, type MediaProbe } from '../shared/api';

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
    args.push(
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
      '-vf', "scale=-2:'min(1080,ih)'",
      '-c:a', 'aac', '-b:a', '160k', '-ac', '2',
    );
  }
  args.push('-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', tmp);

  let lastReport = 0;
  const r = await run(ffmpegPath(), args, {
    onStdout: (chunk) => {
      const m = /out_time_us=(\d+)/g;
      let match: RegExpExecArray | null;
      let us = -1;
      const s = chunk.toString();
      while ((match = m.exec(s))) us = Number(match[1]);
      if (us >= 0 && duration > 0) {
        const p = Math.min(0.999, us / 1e6 / duration);
        const now = Date.now();
        if (now - lastReport > 200) {
          lastReport = now;
          onProgress(p);
        }
      }
    },
  });
  if (r.code !== 0 || !exists(tmp)) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // nothing to clean
    }
    throw new Error(tailLog(r.stderr) || 'Proxy transcode failed');
  }
  await fs.promises.rename(tmp, out);
  onProgress(1);
  return out;
}
