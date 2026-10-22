// Renders build/installer-art.html with Electron and saves the NSIS sidebar,
// header and portable splash as 24-bit BMPs (the format NSIS requires).
import { _electron as electron } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const ffmpeg = require('ffmpeg-static');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-art-'));
const main = path.join(tmp, 'main.cjs');
fs.writeFileSync(
  main,
  `const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const w = new BrowserWindow({ width: 600, height: 700, show: false, useContentSize: true });
  w.loadFile(${JSON.stringify(path.join(root, 'build', 'installer-art.html'))});
});`,
);

const app = await electron.launch({ args: [main] });
const win = await app.firstWindow();
await win.waitForLoadState('load');
await win.evaluate(() => document.fonts.ready);
await win.waitForTimeout(300);

const targets = [
  ['#sidebar', ['installerSidebar.bmp', 'uninstallerSidebar.bmp']],
  ['#header', ['installerHeader.bmp']],
  ['#splash', ['splash.bmp']],
];
for (const [selector, names] of targets) {
  const png = path.join(tmp, `${selector.slice(1)}.png`);
  await win.locator(selector).screenshot({ path: png });
  for (const name of names) {
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', png, '-pix_fmt', 'bgr24', path.join(root, 'build', name)]);
  }
  console.log(selector, '→', names.join(', '));
}
await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
