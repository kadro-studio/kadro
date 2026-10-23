// The user's LUT library: .cube files kept in the profile (installed from the
// workshop or saved by the user), so looks that use them work in every project.
import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { LutFile } from '../shared/api';

const MAX_LUT_BYTES = 8 * 1024 * 1024;

export function lutsDir(): string {
  const dir = path.join(app.getPath('userData'), 'luts');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function inLutsDir(file: string): string {
  const resolved = path.resolve(lutsDir(), path.basename(file));
  if (path.dirname(resolved) !== path.resolve(lutsDir()) || !resolved.toLowerCase().endsWith('.cube')) throw new Error('Not a LUT in the library');
  return resolved;
}

export async function listLuts(): Promise<LutFile[]> {
  const names = await fs.promises.readdir(lutsDir()).catch(() => [] as string[]);
  return names
    .filter((n) => n.toLowerCase().endsWith('.cube'))
    .sort((a, b) => a.localeCompare(b))
    .map((n) => ({ file: n, path: path.join(lutsDir(), n), name: n.replace(/\.cube$/i, '') }));
}

/** Saves LUT text under a safe, unique-ish file name; returns the full path. */
export async function installLutText(name: string, text: string): Promise<string> {
  if (Buffer.byteLength(text, 'utf8') > MAX_LUT_BYTES) throw new Error('LUT is too large');
  if (!/LUT_3D_SIZE/i.test(text)) throw new Error('Not a 3D .cube LUT');
  const base = path.basename(name).replace(/\.cube$/i, '').replace(/[^\p{L}\p{N} ._-]/gu, '_').slice(0, 80) || 'LUT';
  const file = path.join(lutsDir(), `${base}.cube`);
  await fs.promises.writeFile(file, text, 'utf8');
  return file;
}

/** Copies .cube files chosen by the user into the library. */
export async function addLutFiles(paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const p of paths) {
    if (!p.toLowerCase().endsWith('.cube')) continue;
    const st = await fs.promises.stat(p).catch(() => null);
    if (!st?.isFile() || st.size > MAX_LUT_BYTES) continue;
    out.push(await installLutText(path.basename(p), await fs.promises.readFile(p, 'utf8')));
  }
  return out;
}

export async function removeLut(file: string): Promise<void> {
  await fs.promises.unlink(inLutsDir(file));
}

export function openLutsFolder(): void {
  void shell.openPath(lutsDir());
}
