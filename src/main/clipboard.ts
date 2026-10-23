// What other programs put on the system clipboard, for pasting into a project:
// files copied in Explorer, pictures (screenshots) and text. Our own clip copies
// leave a line of text there, so a later copy elsewhere wins over them.
import { app, clipboard } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClipboardContent } from '../shared/api';

const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };

function pastedDir(): string {
  const dir = path.join(app.getPath('userData'), 'pasted');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export async function readClipboard(): Promise<ClipboardContent> {
  const items = await clipboard.read();
  // Files copied in Explorer arrive as file:// addresses.
  for (const item of items) {
    if (!item.types.includes('text/uri-list')) continue;
    const list = await ((await item.getType('text/uri-list')) as Blob).text();
    const files = list
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('file:'))
      .flatMap((u) => {
        try {
          return [fileURLToPath(u)];
        } catch {
          return [];
        }
      })
      .filter(isFile);
    if (files.length) return { files, text: '' };
  }
  // A picture (a screenshot, an image copied in a browser) is saved once; the same
  // picture pasted again reuses its file.
  for (const item of items) {
    const type = item.types.find((x) => x in IMAGE_TYPES);
    if (!type) continue;
    const blob = (await item.getType(type)) as Blob;
    if (blob.size === 0 || blob.size > MAX_IMAGE_BYTES) continue;
    const bytes = Buffer.from(await blob.arrayBuffer());
    const hash = crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 12);
    const file = path.join(pastedDir(), `pasted-${hash}.${IMAGE_TYPES[type]}`);
    if (!isFile(file)) await fs.promises.writeFile(file, bytes);
    return { files: [file], text: '' };
  }
  return { files: [], text: await clipboard.readText().catch(() => '') };
}

export function writeClipboardText(text: string): Promise<void> {
  return clipboard.writeText(text);
}
