// End-to-end smoke test: launches the built app, imports media, builds a small
// edit, plays it, exports it and reloads the saved project.
//
//   node scripts/smoke.mjs <media-dir> <out-dir>
//
// <media-dir> must contain clipA.mp4, clipB.mp4, green.mp4, tone.mp3, still.png, hevc.mkv
// (see README for the ffmpeg commands that generate them).
import { _electron as electron } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const mediaDir = path.resolve(process.argv[2] ?? 'test-media');
const outDir = path.resolve(process.argv[3] ?? 'smoke-out');
fs.mkdirSync(outDir, { recursive: true });

const names = ['clipA.mp4', 'clipB.mp4', 'green.mp4', 'tone.mp3', 'still.png', 'hevc.mkv'];
const files = names.map((n) => path.join(mediaDir, n));
for (const f of files) if (!fs.existsSync(f)) throw new Error(`Missing test media: ${f}`);

const log = (...a) => console.log('[smoke]', ...a);
const problems = [];

const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, VR_DEV_SERVER_URL: '' } });
const win = await app.firstWindow();
win.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
});
win.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await win.waitForSelector('.timeline', { timeout: 30000 });
await win.waitForTimeout(500);
await win.screenshot({ path: path.join(outDir, '01-start.png') });

log('importing media');
await win.evaluate(async (paths) => {
  await window.__vr.importFiles(paths);
}, files);
await win.waitForFunction(
  (n) => {
    const s = window.__vr.useEditor.getState();
    return s.project.media.length === n && s.project.media.every((m) => ['ready', 'error', 'missing'].includes(s.runtime[m.id]?.status));
  },
  names.length,
  { timeout: 180000, polling: 250 },
);
const statuses = await win.evaluate(() => {
  const s = window.__vr.useEditor.getState();
  return s.project.media.map((m) => ({ name: m.name, kind: m.kind, dur: +m.duration.toFixed(2), status: s.runtime[m.id].status, proxy: !!s.runtime[m.id].proxyPath, strip: !!s.runtime[m.id].filmstrip, wave: s.runtime[m.id].hasWaveform }));
});
console.table(statuses);
for (const st of statuses) if (st.status !== 'ready') problems.push(`media ${st.name} status ${st.status}`);

log('building timeline');
const ids = await win.evaluate(() => {
  const vr = window.__vr;
  const s0 = vr.useEditor.getState();
  const m = (n) => s0.project.media.find((x) => x.name === n).id;
  const track = (n) => s0.project.tracks.find((t) => t.name === n).id;
  const last = () => vr.useEditor.getState().selection[0];
  vr.addMediaClip(m('clipA.mp4'), { trackId: track('V1'), time: 0, overwrite: true });
  const a = last();
  vr.addMediaClip(m('clipB.mp4'), { trackId: track('V1'), time: 6, overwrite: true });
  const b = last();
  vr.addMediaClip(m('hevc.mkv'), { trackId: track('V1'), time: 11, overwrite: true });
  vr.addMediaClip(m('still.png'), { trackId: track('V2'), time: 1, overwrite: true });
  const img = last();
  vr.addMediaClip(m('green.mp4'), { trackId: track('V2'), time: 7, overwrite: true });
  const green = last();
  vr.addMediaClip(m('tone.mp3'), { trackId: track('A1'), time: 0, overwrite: true });
  const tone = last();
  vr.addTextClip('title', { time: 0.5 });
  const text = last();
  vr.applyTransition(b, 'wipeRight');
  vr.applyFilter([a], 'vintage');
  vr.updateClip(img, (c) => {
    c.transform.scale = 0.35;
    c.transform.x = 520;
    c.transform.y = -260;
    c.transform.rotation = 8;
    c.keyframes.x = [
      { t: 0, v: 520, ease: 'easeInOut' },
      { t: 3, v: -520, ease: 'easeInOut' },
    ];
  });
  vr.updateClip(green, (c) => {
    c.chroma.enabled = true;
    c.transform.scale = 0.6;
  });
  vr.updateClip(tone, (c) => {
    c.volume = 0.5;
    c.fadeIn = 1;
    c.fadeOut = 1;
  });
  vr.splitAt(3, [a]);
  vr.updateClip(text, (c) => {
    c.text.content = 'Videoredact\nтест';
  });
  vr.select([img]);
  return { a, b, img, green, tone, text };
});
log('clip ids', JSON.stringify(ids));

const summary = await win.evaluate(() => {
  const s = window.__vr.useEditor.getState();
  return s.project.tracks.map((t) => `${t.name}: ${t.clips.map((c) => `${c.type}@${c.start.toFixed(2)}+${c.duration.toFixed(2)}`).join(', ')}`);
});
log('tracks\n  ' + summary.join('\n  '));

async function seek(t, shot) {
  await win.evaluate((tt) => window.__vr.player.seek(tt), t);
  await win.waitForTimeout(900);
  if (shot) await win.screenshot({ path: path.join(outDir, shot) });
}

async function frameStats(label) {
  const stats = await win.evaluate(async () => {
    const blob = await window.__vr.player.snapshot();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 36;
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0, 64, 36);
    const d = ctx.getImageData(0, 0, 64, 36).data;
    let sum = 0;
    let distinct = new Set();
    for (let i = 0; i < d.length; i += 4) {
      sum += d[i] + d[i + 1] + d[i + 2];
      distinct.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
    }
    return { mean: sum / (d.length / 4) / 3, colors: distinct.size, w: bmp.width, h: bmp.height };
  });
  log(`frame ${label}:`, JSON.stringify(stats));
  if (stats.mean < 3 || stats.colors < 4) problems.push(`frame ${label} looks empty: ${JSON.stringify(stats)}`);
  return stats;
}

await seek(2, '02-preview-2s.png');
await frameStats('t=2');
await seek(6.3, '03-transition.png');
await frameStats('t=6.3');
await seek(8, '04-chroma.png');
await frameStats('t=8');
await seek(12, '05-hevc-proxy.png');
await frameStats('t=12');

log('playback');
await seek(0.5);
await win.evaluate(() => window.__vr.player.play());
await win.waitForTimeout(2000);
const played = await win.evaluate(() => {
  const s = window.__vr.useEditor.getState();
  window.__vr.player.pause();
  return s.playhead;
});
log('playhead after 2s of playback:', played.toFixed(2));
if (played < 1.8 || played > 3.2) problems.push(`unexpected playhead after playback: ${played}`);

log('mouse + keyboard interactions');
await win.evaluate(() => window.__vr.setLang('ru'));
const state = () =>
  win.evaluate(() => {
    const s = window.__vr.useEditor.getState();
    const all = s.project.tracks.flatMap((t) => t.clips.map((c) => ({ id: c.id, track: t.name, start: c.start, duration: c.duration, x: c.transform.x, type: c.type })));
    return { clips: all, pps: s.pxPerSec, selection: s.selection, past: s.past.length };
  });
const clipBox = async (id) => {
  const handle = await win.evaluateHandle((cid) => {
    const s = window.__vr.useEditor.getState();
    const t = s.project.tracks.find((tr) => tr.clips.some((c) => c.id === cid));
    const idx = t.clips.findIndex((c) => c.id === cid);
    return document.querySelector(`[data-track-id="${t.id}"]`).querySelectorAll('.clip')[idx];
  }, id);
  return handle.asElement().boundingBox();
};

// Move the image clip 2 seconds to the right with the mouse.
let st = await state();
const imgBefore = st.clips.find((c) => c.id === ids.img);
let box = await clipBox(ids.img);
await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await win.mouse.down();
await win.mouse.move(box.x + box.width / 2 + st.pps, box.y + box.height / 2, { steps: 6 });
await win.mouse.move(box.x + box.width / 2 + st.pps * 2, box.y + box.height / 2, { steps: 6 });
await win.mouse.up();
st = await state();
const imgAfter = st.clips.find((c) => c.id === ids.img);
log(`drag move: start ${imgBefore.start.toFixed(2)} -> ${imgAfter.start.toFixed(2)}`);
if (Math.abs(imgAfter.start - imgBefore.start - 2) > 0.2) problems.push(`drag move moved by ${imgAfter.start - imgBefore.start}`);

// Trim the end of the music clip by ~1 second.
const toneBefore = st.clips.find((c) => c.id === ids.tone);
box = await clipBox(ids.tone);
await win.mouse.move(box.x + box.width - 3, box.y + box.height / 2);
await win.mouse.down();
await win.mouse.move(box.x + box.width - 3 - st.pps, box.y + box.height / 2, { steps: 8 });
await win.mouse.up();
st = await state();
const toneAfter = st.clips.find((c) => c.id === ids.tone);
log(`trim: duration ${toneBefore.duration.toFixed(2)} -> ${toneAfter.duration.toFixed(2)}`);
if (!(toneAfter.duration < toneBefore.duration - 0.5)) problems.push('trim did not shorten the clip');

// Split with the S key (layout independent) and undo with Ctrl+Z.
await win.evaluate((id) => {
  window.__vr.select([id]);
  window.__vr.player.seek(9);
}, ids.green);
await win.waitForTimeout(200);
const countBefore = (await state()).clips.length;
await win.keyboard.press('s');
const countSplit = (await state()).clips.length;
await win.keyboard.press('Control+z');
const countUndo = (await state()).clips.length;
log(`split via key: ${countBefore} -> ${countSplit}, undo -> ${countUndo}`);
if (countSplit !== countBefore + 1 || countUndo !== countBefore) problems.push('split/undo shortcut failed');

// Drag the selected image in the preview by 100 screen pixels.
await win.evaluate((id) => {
  window.__vr.select([id]);
  window.__vr.player.seek(5.5);
}, ids.img);
await win.waitForTimeout(600);
const sel = await win.$('.sel-box');
if (!sel) problems.push('no selection box in preview');
else {
  const xBefore = (await state()).clips.find((c) => c.id === ids.img).x;
  const b = await sel.boundingBox();
  await win.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await win.mouse.down();
  await win.mouse.move(b.x + b.width / 2 + 100, b.y + b.height / 2 + 10, { steps: 8 });
  await win.mouse.up();
  const kfx = await win.evaluate((id) => {
    const s = window.__vr.useEditor.getState();
    const c = s.project.tracks.flatMap((t) => t.clips).find((x) => x.id === id);
    return c.keyframes.x?.map((k) => +k.v.toFixed(1));
  }, ids.img);
  log(`preview drag: x keyframes now ${JSON.stringify(kfx)} (static x ${xBefore})`);
  if (!kfx || kfx.length < 3) problems.push('preview drag did not add a keyframe on the animated property');
}

// Drag a media card from the bin onto an empty audio track.
const a2 = await win.evaluate(() => window.__vr.useEditor.getState().project.tracks.find((t) => t.name === 'A2').id);
await win.dragAndDrop('.media-card:has-text("tone.mp3")', `[data-track-id="${a2}"]`, { targetPosition: { x: 400, y: 20 } });
const onA2 = await win.evaluate((id) => window.__vr.useEditor.getState().project.tracks.find((t) => t.id === id).clips.length, a2);
log(`drag from media bin onto A2: ${onA2} clip(s)`);
if (onA2 !== 1) problems.push('drag & drop from media bin failed');
await win.waitForTimeout(400);
await win.screenshot({ path: path.join(outDir, '05b-russian-ui.png') });

log('UI tabs');
await win.click('.tab:nth-child(2)');
await win.waitForTimeout(200);
await win.screenshot({ path: path.join(outDir, '06-text-tab.png') });
await win.click('.tab:nth-child(3)');
await win.waitForTimeout(200);
await win.screenshot({ path: path.join(outDir, '07-transitions-tab.png') });
await win.click('.tab:nth-child(1)');
await win.keyboard.press('Control+z');
await win.keyboard.press('Control+Shift+z');

log('exporting');
const exportPath = path.join(outDir, 'export.mp4');
const t0 = Date.now();
const res = await win.evaluate(
  (out) => window.__vr.runExport({ outPath: out, format: 'mp4', width: 640, height: 360, fps: 30, quality: 'low' }, () => {}, { cancelled: false }),
  exportPath,
);
log('export result', JSON.stringify(res), `${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (!res.ok) problems.push(`export failed: ${res.error}`);
else {
  const ffprobe = require('ffprobe-static').path;
  const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', exportPath]).toString());
  const v = probe.streams.find((s) => s.codec_type === 'video');
  const a = probe.streams.find((s) => s.codec_type === 'audio');
  log(`exported: ${v?.codec_name} ${v?.width}x${v?.height}, audio ${a?.codec_name}, duration ${probe.format.duration}`);
  if (!v || !a) problems.push('export missing a stream');
  const ffmpeg = require('ffmpeg-static');
  for (const tt of [2, 6.3, 8, 12]) {
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(tt), '-i', exportPath, '-frames:v', '1', path.join(outDir, `export-${tt}.png`)]);
  }
}

log('save + reopen project');
const projPath = path.join(outDir, 'smoke.vrproj');
const reopened = await win.evaluate(async (p) => {
  const vr = window.__vr;
  await window.api.writeText(p, JSON.stringify(vr.useEditor.getState().project));
  vr.markSaved(p);
  const before = vr.useEditor.getState().project.tracks.reduce((n, t) => n + t.clips.length, 0);
  await vr.openProjectFile(p);
  const after = vr.useEditor.getState().project.tracks.reduce((n, t) => n + t.clips.length, 0);
  return { before, after };
}, projPath);
log('clips before/after reopen', JSON.stringify(reopened));
if (reopened.before !== reopened.after) problems.push('project reopen changed clip count');
await win.waitForTimeout(1500);
await win.screenshot({ path: path.join(outDir, '08-reopened.png') });

await app.close();
if (problems.length) {
  console.log('\nPROBLEMS:\n- ' + problems.join('\n- '));
  process.exitCode = 1;
} else {
  console.log('\nSMOKE TEST PASSED');
}
