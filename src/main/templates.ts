// The user's project templates: .kadroitem files (kind "template") kept in the
// profile, saved from a project or installed from the workshop.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { TemplateFile } from '../shared/api';

const MAX_TEMPLATE_BYTES = 16 * 1024 * 1024;
const EXT = '.kadroitem';

function templatesDir(): string {
  const dir = path.join(app.getPath('userData'), 'templates');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function inTemplatesDir(file: string): string {
  const resolved = path.resolve(templatesDir(), path.basename(file));
  if (path.dirname(resolved) !== path.resolve(templatesDir()) || !resolved.toLowerCase().endsWith(EXT)) throw new Error('Not a template in the library');
  return resolved;
}

export async function listTemplates(): Promise<TemplateFile[]> {
  const names = await fs.promises.readdir(templatesDir()).catch(() => [] as string[]);
  const out: TemplateFile[] = [];
  for (const n of names) {
    if (!n.toLowerCase().endsWith(EXT)) continue;
    const p = path.join(templatesDir(), n);
    try {
      const st = await fs.promises.stat(p);
      if (st.size > MAX_TEMPLATE_BYTES) continue;
      out.push({ file: n, path: p, text: await fs.promises.readFile(p, 'utf8'), modified: st.mtimeMs });
    } catch {
      // unreadable file: skipped
    }
  }
  return out.sort((a, b) => b.modified - a.modified);
}

/** Saves template text under a safe, unique file name; returns the full path. */
export async function saveTemplateText(name: string, text: string): Promise<string> {
  if (Buffer.byteLength(text, 'utf8') > MAX_TEMPLATE_BYTES) throw new Error('Template is too large');
  const base = name.replace(/[^\p{L}\p{N} ._-]/gu, '_').trim().slice(0, 60) || 'template';
  let file = path.join(templatesDir(), `${base}${EXT}`);
  for (let i = 2; fs.existsSync(file); i++) file = path.join(templatesDir(), `${base} (${i})${EXT}`);
  await fs.promises.writeFile(file, text, 'utf8');
  return file;
}

export async function removeTemplate(file: string): Promise<void> {
  await fs.promises.unlink(inTemplatesDir(file));
}
