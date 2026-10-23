// Mod files (*.vrmod, JSON with a GLSL effect or transition). Installed mods
// live in the user data folder; example mods ship with the app as a catalog.
// Mods are data only: the renderer validates them and compiles their GLSL in
// WebGL, so they cannot touch files or run code outside the GPU sandbox.
import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ModFile } from '../shared/api';

const MAX_MOD_BYTES = 256 * 1024;

export function modsDir(): string {
  const dir = path.join(app.getPath('userData'), 'mods');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function catalogDir(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'mods') : path.join(app.getAppPath(), 'mods');
}

async function readMods(dir: string): Promise<ModFile[]> {
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return [];
  }
  const out: ModFile[] = [];
  for (const name of names.filter((n) => n.toLowerCase().endsWith('.vrmod')).sort()) {
    const file = path.join(dir, name);
    try {
      const st = await fs.promises.stat(file);
      if (!st.isFile() || st.size > MAX_MOD_BYTES) continue;
      out.push({ file, text: await fs.promises.readFile(file, 'utf8') });
    } catch {
      // unreadable file: skipped
    }
  }
  return out;
}

export const listMods = () => readMods(modsDir());
export const listCatalog = () => readMods(catalogDir());

export async function installMods(paths: string[]): Promise<number> {
  let count = 0;
  for (const p of paths) {
    if (!p.toLowerCase().endsWith('.vrmod')) continue;
    const st = await fs.promises.stat(p).catch(() => null);
    if (!st?.isFile() || st.size > MAX_MOD_BYTES) continue;
    await fs.promises.copyFile(p, path.join(modsDir(), path.basename(p)));
    count++;
  }
  return count;
}

export async function removeMod(file: string): Promise<void> {
  // Only files inside the mods folder may be deleted.
  const resolved = path.resolve(file);
  if (path.dirname(resolved) !== path.resolve(modsDir())) throw new Error('Not an installed mod');
  await fs.promises.unlink(resolved);
}

export function openModsFolder(): void {
  void shell.openPath(modsDir());
}

/** Saves a mod given as text (e.g. converted from Shadertoy) into the mods folder. */
export async function installModText(fileName: string, text: string): Promise<string> {
  const base = path.basename(fileName).replace(/[^A-Za-z0-9._-]/g, '_');
  if (!base.toLowerCase().endsWith('.vrmod')) throw new Error('Not a mod file name');
  if (Buffer.byteLength(text, 'utf8') > MAX_MOD_BYTES) throw new Error('Mod is too large');
  JSON.parse(text);
  const file = path.join(modsDir(), base);
  await fs.promises.writeFile(file, text, 'utf8');
  return file;
}
