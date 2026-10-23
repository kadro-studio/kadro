// One-time import of the user's own TikTok video by link, through yt-dlp.
// yt-dlp is not bundled: on first use the official build is downloaded from the
// project's GitHub releases and checked against the release's SHA2-256SUMS.
import { app } from 'electron';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { LinkVideo, LinkToolStatus } from '../shared/api';
import { ffmpegPath } from './ffmpeg';

const UA = 'Kadro/0.1 (free open-source video editor)';
const RELEASE_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const MAX_TOOL_BYTES = 64 * 1024 * 1024;
const MAX_VIDEO = '1500M';
/** TikTok changes often; a build older than this is replaced when a newer one exists. */
const REFRESH_DAYS = 14;
const RUN_TIMEOUT = 15 * 60_000;

const ASSET =
  process.platform === 'win32'
    ? 'yt-dlp.exe'
    : process.platform === 'darwin'
      ? 'yt-dlp_macos'
      : process.arch === 'arm64'
        ? 'yt-dlp_linux_aarch64'
        : 'yt-dlp_linux';

function toolsDir(): string {
  const dir = path.join(app.getPath('userData'), 'tools');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const toolPath = () => path.join(toolsDir(), ASSET);
const toolInfoPath = () => path.join(toolsDir(), 'yt-dlp.json');

interface ToolInfo {
  version: string;
  sha256: string;
  installed: number;
}

function readToolInfo(): ToolInfo | null {
  try {
    const info = JSON.parse(fs.readFileSync(toolInfoPath(), 'utf8')) as ToolInfo;
    return fs.existsSync(toolPath()) ? info : null;
  } catch {
    return null;
  }
}

export function linkToolStatus(): LinkToolStatus {
  const info = readToolInfo();
  return { installed: !!info, version: info?.version ?? null };
}

/** Whether a link points at TikTok. Other sites are not supported. */
export function isTikTokUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return (u.protocol === 'https:' || u.protocol === 'http:') && /(^|\.)tiktok\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

interface GhRelease {
  tag_name: string;
  assets: { name: string; browser_download_url: string; size: number }[];
}

function githubUrl(raw: string): string {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || u.hostname !== 'github.com' || !u.pathname.startsWith('/yt-dlp/yt-dlp/releases/download/')) {
    throw new Error(`Unexpected download address: ${raw}`);
  }
  return u.href;
}

async function download(url: string, max: number, onProgress?: (p: number) => void): Promise<Buffer> {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(10 * 60_000) });
  if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
  const total = Number(r.headers.get('content-length')) || 0;
  if (total > max) throw new Error('File is too large');
  const chunks: Uint8Array[] = [];
  let done = 0;
  let last = 0;
  const reader = r.body.getReader();
  for (;;) {
    const { done: end, value } = await reader.read();
    if (end) break;
    done += value.byteLength;
    if (done > max) throw new Error('File is too large');
    chunks.push(value);
    const now = Date.now();
    if (onProgress && total && now - last > 150) {
      last = now;
      onProgress(Math.min(0.99, done / total));
    }
  }
  return Buffer.concat(chunks);
}

/** Downloads (or refreshes) yt-dlp. Keeps a working older copy when the update fails. */
async function ensureTool(onProgress: (p: number) => void): Promise<string> {
  const info = readToolInfo();
  const fresh = info && Date.now() - info.installed < REFRESH_DAYS * 86_400_000;
  if (info && fresh) return toolPath();
  try {
    const r = await fetch(RELEASE_API, { headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`GitHub: HTTP ${r.status}`);
    const rel = (await r.json()) as GhRelease;
    if (info && info.version === rel.tag_name) {
      fs.writeFileSync(toolInfoPath(), JSON.stringify({ ...info, installed: Date.now() }));
      return toolPath();
    }
    const asset = rel.assets.find((a) => a.name === ASSET);
    const sums = rel.assets.find((a) => a.name === 'SHA2-256SUMS');
    if (!asset || !sums) throw new Error(`yt-dlp ${rel.tag_name}: ${ASSET} not found`);
    const sumsText = (await download(githubUrl(sums.browser_download_url), 1024 * 1024)).toString('utf8');
    const expected = sumsText
      .split(/\r?\n/)
      .map((l) => l.trim().split(/\s+\*?/))
      .find(([, name]) => name === ASSET)?.[0]
      ?.toLowerCase();
    if (!expected || !/^[0-9a-f]{64}$/.test(expected)) throw new Error('yt-dlp checksum not found');
    const bin = await download(githubUrl(asset.browser_download_url), MAX_TOOL_BYTES, onProgress);
    const actual = crypto.createHash('sha256').update(bin).digest('hex');
    if (actual !== expected) throw new Error('yt-dlp checksum mismatch: the download was damaged or altered');
    const tmp = `${toolPath()}.part`;
    await fs.promises.writeFile(tmp, bin, { mode: 0o755 });
    await fs.promises.rename(tmp, toolPath());
    fs.writeFileSync(toolInfoPath(), JSON.stringify({ version: rel.tag_name, sha256: actual, installed: Date.now() } satisfies ToolInfo));
    onProgress(1);
    return toolPath();
  } catch (e) {
    if (info) return toolPath();
    throw e;
  }
}

function videosDir(): string {
  const dir = path.join(app.getPath('userData'), 'library', 'tiktok');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** The most useful line of a yt-dlp error. */
function errorLine(stderr: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const err = lines.reverse().find((l) => l.startsWith('ERROR:'));
  return (err ?? lines[0] ?? 'yt-dlp failed').replace(/^ERROR:\s*(\[[^\]]+\]\s*)?(\S+:\s*)?/, '').slice(0, 300);
}

/**
 * Downloads a TikTok video once into the app's library folder.
 * Progress: the tool download (first use only), then the video.
 */
export async function importLinkVideo(url: string, onToolProgress: (p: number) => void, onProgress: (p: number) => void): Promise<LinkVideo> {
  if (!isTikTokUrl(url)) throw new Error('Only TikTok links are supported');
  const tool = await ensureTool(onToolProgress);
  const dir = videosDir();
  const args = [
    '--no-config',
    '--no-playlist',
    '--no-mtime',
    '--newline',
    '--progress',
    '--encoding',
    'utf-8',
    '--max-filesize',
    MAX_VIDEO,
    '--ffmpeg-location',
    ffmpegPath(),
    '-f',
    'b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b',
    '--merge-output-format',
    'mp4',
    '--progress-template',
    'download:KADRO-PROGRESS %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s',
    '--print',
    'after_move:KADRO-RESULT %(.{filepath,id,title,uploader,uploader_id,webpage_url,duration})j',
    '-P',
    dir,
    '-o',
    'tiktok-%(id)s.%(ext)s',
    '--',
    url.trim(),
  ];
  return new Promise<LinkVideo>((resolve, reject) => {
    const child = spawn(tool, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    const timer = setTimeout(() => child.kill(), RUN_TIMEOUT);
    let stdout = '';
    let stderr = '';
    let notes = '';
    let result: LinkVideo | null = null;
    const onLine = (line: string) => {
      if (line.startsWith('KADRO-PROGRESS ')) {
        const [done, total, estimate] = line.slice(15).split(' ').map(Number);
        const all = total || estimate;
        if (done && all) onProgress(Math.min(0.99, done / all));
      } else if (line.startsWith('KADRO-RESULT ')) {
        try {
          const j = JSON.parse(line.slice(13)) as Record<string, unknown>;
          const str = (v: unknown) => (typeof v === 'string' ? v : '');
          result = {
            path: str(j.filepath),
            id: str(j.id),
            title: str(j.title),
            author: str(j.uploader) || str(j.uploader_id),
            authorId: str(j.uploader_id),
            url: str(j.webpage_url) || url.trim(),
          };
        } catch {
          // reported below as a missing result
        }
      } else if (notes.length < 8000) {
        notes += `${line}\n`;
      }
    };
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString('utf8');
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? '';
      lines.forEach(onLine);
    });
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf8');
      if (stderr.length > 64_000) stderr = stderr.slice(-32_000);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (stdout) onLine(stdout);
      const found = result as LinkVideo | null;
      if (code === 0 && found?.path) {
        const resolved = path.resolve(found.path);
        // The file must be where it was asked to go.
        if (path.dirname(resolved) !== path.resolve(dir) || !fs.existsSync(resolved)) {
          reject(new Error('Downloaded file not found'));
          return;
        }
        onProgress(1);
        resolve({ ...found, path: resolved });
      } else if (code === 0) {
        // --max-filesize skips a file without failing.
        reject(new Error(/max-filesize|larger than max/i.test(stderr + notes) ? 'File is too large' : errorLine(stderr || notes)));
      } else {
        reject(new Error(errorLine(stderr)));
      }
    });
  });
}
