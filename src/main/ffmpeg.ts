import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import type { HwEncoder } from '../shared/api';

/** Binaries inside app.asar cannot be executed; electron-builder unpacks them next to it. */
function unpacked(p: string): string {
  return p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

function resolveBinary(envVar: string, load: () => string | null | undefined, fallback: string): string {
  const fromEnv = process.env[envVar];
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  try {
    const p = load();
    if (p) {
      const fixed = unpacked(p);
      if (fs.existsSync(fixed)) return fixed;
    }
  } catch {
    // package missing: fall back to PATH
  }
  return fallback;
}

let ffmpegBin: string | null = null;
let ffprobeBin: string | null = null;

export function ffmpegPath(): string {
  if (!ffmpegBin) {
    ffmpegBin = resolveBinary('VR_FFMPEG', () => require('ffmpeg-static') as string, 'ffmpeg');
  }
  return ffmpegBin;
}

export function ffprobePath(): string {
  if (!ffprobeBin) {
    ffprobeBin = resolveBinary('VR_FFPROBE', () => (require('ffprobe-static') as { path: string }).path, 'ffprobe');
  }
  return ffprobeBin;
}

export interface RunResult {
  code: number | null;
  stdout: Buffer;
  stderr: string;
}

export interface RunOptions {
  onStdout?: (chunk: Buffer) => void;
  onStderr?: (text: string) => void;
  /** Keep stdout chunks in the result (default true unless onStdout given). */
  collectStdout?: boolean;
  /** Working directory (lets filter arguments use bare file names). */
  cwd?: string;
}

/** Runs a process to completion and collects its output. */
export function run(bin: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(bin, args, { windowsHide: true, cwd: opts.cwd });
    } catch (e) {
      reject(e);
      return;
    }
    const collect = opts.collectStdout ?? !opts.onStdout;
    const out: Buffer[] = [];
    let err = '';
    child.stdout?.on('data', (c: Buffer) => {
      if (collect) out.push(c);
      opts.onStdout?.(c);
    });
    child.stderr?.on('data', (c: Buffer) => {
      const s = c.toString();
      err += s;
      if (err.length > 64_000) err = err.slice(-32_000);
      opts.onStderr?.(s);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout: Buffer.concat(out), stderr: err }));
  });
}

/** Last meaningful lines of an ffmpeg log, for error messages. */
export function tailLog(stderr: string, lines = 6): string {
  return stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-lines)
    .join('\n');
}

const HW_TEST_CODEC: Record<HwEncoder, string> = { nvenc: 'h264_nvenc', qsv: 'h264_qsv', amf: 'h264_amf' };
let hwProbe: Promise<HwEncoder[]> | null = null;

/** GPU encoders that work here. ffmpeg lists them even without the hardware, so each is test-run. */
export function hwEncoders(): Promise<HwEncoder[]> {
  hwProbe ??= Promise.all(
    (Object.entries(HW_TEST_CODEC) as [HwEncoder, string][]).map(async ([name, codec]) => {
      try {
        const r = await run(ffmpegPath(), [
          '-hide_banner', '-loglevel', 'error',
          '-f', 'lavfi', '-i', 'color=black:s=256x256:d=0.1',
          '-c:v', codec, '-f', 'null', '-',
        ]);
        return r.code === 0 ? name : null;
      } catch {
        return null;
      }
    }),
  ).then((list) => list.filter((x): x is HwEncoder => x !== null));
  return hwProbe;
}

export async function ffmpegVersion(): Promise<string> {
  try {
    const r = await run(ffmpegPath(), ['-hide_banner', '-version']);
    return r.stdout.toString().split(/\r?\n/)[0] ?? 'unknown';
  } catch {
    return 'not found';
  }
}
