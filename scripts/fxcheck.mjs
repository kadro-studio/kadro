// Compiles and renders every built-in effect/transition and every catalog mod,
// reporting shader errors and blank output.
//
//   node scripts/fxcheck.mjs [out-dir]
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.resolve(process.argv[2] ?? 'fxcheck-out');
fs.mkdirSync(outDir, { recursive: true });

const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, VR_DEV_SERVER_URL: '', KADRO_USER_DATA: path.join(outDir, 'profile') } });
const win = await app.firstWindow();
win.on('pageerror', (e) => console.log('[pageerror]', e.message));
await win.waitForSelector('.timeline');
await win.click('.rail-btn:has-text("Mods"), .rail-btn:has-text("Моды")');
await win.waitForTimeout(1500);

const result = await win.evaluate(async () => {
  const { useFx } = window.__vrFx;
  const { fxThumbnail } = window.__vrFx;
  const mods = window.__vrMods.useMods.getState().catalog;
  // Catalog mods are registered temporarily so they render like installed ones.
  window.__vrFx.setFxSource('mod', mods.filter((m) => m.def).map((m) => m.def));
  const defs = Object.values(useFx.getState().defs);
  const rows = [];
  for (const def of defs) {
    const url = await fxThumbnail(def);
    rows.push({ id: def.id, kind: def.kind, source: def.source, ok: !!url, url });
  }
  return { rows, errors: useFx.getState().errors, catalogErrors: mods.filter((m) => m.error).map((m) => `${m.fileName}: ${m.error}`) };
});

let failures = 0;
for (const r of result.rows) {
  const err = result.errors[r.id];
  if (r.url) fs.writeFileSync(path.join(outDir, `${r.id}.jpg`), Buffer.from(r.url.split(',')[1], 'base64'));
  if (err || !r.ok) failures++;
  console.log(`${err || !r.ok ? 'FAIL' : 'ok  '} ${r.kind.padEnd(10)} ${r.source.padEnd(7)} ${r.id}${err ? `\n      ${err.split('\n').slice(0, 3).join('\n      ')}` : ''}`);
}
for (const e of result.catalogErrors) {
  failures++;
  console.log(`FAIL catalog ${e}`);
}
await app.close();
console.log(failures ? `\n${failures} problem(s)` : `\nAll ${result.rows.length} shaders compile and render.`);
process.exitCode = failures ? 1 : 0;
