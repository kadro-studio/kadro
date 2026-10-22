// Disk usage of the app's own data folders and clearing them on request.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { StorageInfo, StorageKind } from '../shared/api';

const FOLDERS: Record<StorageKind, string> = { cache: 'media-cache', library: 'library', models: 'models' };

async function folderSize(dir: string): Promise<number> {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += await folderSize(p);
    else total += (await fs.promises.stat(p).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

export async function storageInfo(): Promise<StorageInfo> {
  const root = app.getPath('userData');
  const sizes = await Promise.all(Object.values(FOLDERS).map((f) => folderSize(path.join(root, f))));
  return { root, cache: sizes[0], library: sizes[1], models: sizes[2] };
}

/** Empties one of the app's folders (only these three, never anything else). */
export async function clearStorage(kind: StorageKind): Promise<void> {
  const name = FOLDERS[kind];
  if (!name) throw new Error('unknown folder');
  const dir = path.join(app.getPath('userData'), name);
  await fs.promises.rm(dir, { recursive: true, force: true });
  await fs.promises.mkdir(dir, { recursive: true });
}
