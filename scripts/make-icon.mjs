// Builds build/icon.ico (16–256 px, PNG-compressed entries) from build/icon.png
// with the bundled FFmpeg, for the Windows executable and installer.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'build', 'icon.png');
const out = path.join(root, 'build', 'icon.ico');
const ffmpeg = require('ffmpeg-static');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-'));
const images = SIZES.map((size) => {
  const file = path.join(tmp, `${size}.png`);
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vf', `scale=${size}:${size}:flags=lanczos`, '-pix_fmt', 'rgba', file]);
  return { size, data: fs.readFileSync(file) };
});
fs.rmSync(tmp, { recursive: true, force: true });

// ICONDIR header, one ICONDIRENTRY per image, then the PNG payloads.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = 6 + 16 * images.length;
const entries = images.map(({ size, data }) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size >= 256 ? 0 : size, 0);
  e.writeUInt8(size >= 256 ? 0 : size, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += data.length;
  return e;
});
fs.writeFileSync(out, Buffer.concat([header, ...entries, ...images.map((i) => i.data)]));
console.log(`icon.ico: ${images.length} sizes, ${fs.statSync(out).size} bytes`);
