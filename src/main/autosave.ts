// Crash protection: the renderer periodically writes the open project here.
// A clean quit removes it, so a file found at start-up means the previous
// session ended unexpectedly and can be recovered.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AutosaveData, AutosaveMeta } from '../shared/api';

function dir(): string {
  const d = path.join(app.getPath('userData'), 'autosave');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

const projectFile = () => path.join(dir(), 'current.vrproj');
const metaFile = () => path.join(dir(), 'current.json');

async function writeAtomic(file: string, text: string): Promise<void> {
  const tmp = `${file}.tmp`;
  await fs.promises.writeFile(tmp, text, 'utf8');
  await fs.promises.rename(tmp, file);
}

export async function autosaveWrite(json: string, meta: AutosaveMeta): Promise<void> {
  await writeAtomic(projectFile(), json);
  await writeAtomic(metaFile(), JSON.stringify({ ...meta, savedAt: Date.now() }));
}

export async function autosaveRead(): Promise<AutosaveData | null> {
  try {
    const json = await fs.promises.readFile(projectFile(), 'utf8');
    const meta = JSON.parse(await fs.promises.readFile(metaFile(), 'utf8')) as AutosaveMeta & { savedAt: number };
    return { json, meta: { filePath: meta.filePath, name: meta.name }, savedAt: meta.savedAt };
  } catch {
    return null;
  }
}

export function autosaveClear(): void {
  for (const f of [projectFile(), metaFile()]) {
    try {
      fs.unlinkSync(f);
    } catch {
      // nothing saved
    }
  }
}
