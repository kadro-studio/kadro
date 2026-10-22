// The user's own font files (TTF, OTF, WOFF, WOFF2), copied into the profile
// so they work in every project. The renderer reads them and registers them
// with the FontFace API; nothing is installed into Windows.
import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { FontFile } from '../shared/api';

const EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'];
const MAX_FONT_BYTES = 50 * 1024 * 1024;

export function fontsDir(): string {
  const dir = path.join(app.getPath('userData'), 'fonts');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const isFontFile = (p: string) => EXTENSIONS.includes(path.extname(p).toLowerCase());

/** Resolves a font file name inside the fonts folder (and nowhere else). */
function inFontsDir(file: string): string {
  const resolved = path.resolve(fontsDir(), path.basename(file));
  if (path.dirname(resolved) !== path.resolve(fontsDir()) || !isFontFile(resolved)) throw new Error('Not an installed font');
  return resolved;
}

export async function listFonts(): Promise<FontFile[]> {
  const names = await fs.promises.readdir(fontsDir()).catch(() => [] as string[]);
  const out: FontFile[] = [];
  for (const name of names.filter(isFontFile).sort((a, b) => a.localeCompare(b))) {
    const st = await fs.promises.stat(path.join(fontsDir(), name)).catch(() => null);
    if (st?.isFile() && st.size <= MAX_FONT_BYTES) out.push({ file: name, size: st.size });
  }
  return out;
}

export async function readFont(file: string): Promise<Uint8Array> {
  return fs.promises.readFile(inFontsDir(file));
}

/** Copies font files into the profile; returns the names that were added. */
export async function installFonts(paths: string[]): Promise<string[]> {
  const added: string[] = [];
  for (const p of paths) {
    if (!isFontFile(p)) continue;
    const st = await fs.promises.stat(p).catch(() => null);
    if (!st?.isFile() || st.size > MAX_FONT_BYTES) continue;
    const name = path.basename(p);
    await fs.promises.copyFile(p, path.join(fontsDir(), name));
    added.push(name);
  }
  return added;
}

export async function removeFont(file: string): Promise<void> {
  await fs.promises.unlink(inFontsDir(file));
}

export function openFontsFolder(): void {
  void shell.openPath(fontsDir());
}
