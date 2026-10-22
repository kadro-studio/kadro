// End-to-end smoke test: launches the built app, imports media, builds a small
// edit, plays it, exports it and reloads the saved project.
//
//   node scripts/smoke.mjs <media-dir> <out-dir>
//
// <media-dir> must contain clipA.mp4, clipB.mp4, green.mp4, tone.mp3, still.png, hevc.mkv
// (see README for the ffmpeg commands that generate them).
import { _electron as electron } from 'playwright-core';
import { execFileSync, spawnSync } from 'node:child_process';
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

const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, VR_DEV_SERVER_URL: '', KADRO_USER_DATA: path.join(outDir, 'profile') } });
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
    c.text.content = 'Kadro\nтест';
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

log('pro features: effects, shader transition, mask, LUT, audio FX, volume keys, mods');
// A small warm-looking 3D LUT written on the fly.
const lutPath = path.join(outDir, 'warm.cube');
{
  const n = 9;
  const lines = ['TITLE "warm"', `LUT_3D_SIZE ${n}`];
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
    const R = Math.min(1, (r / (n - 1)) * 1.1);
    const G = g / (n - 1);
    const B = (b / (n - 1)) * 0.8;
    lines.push(`${R.toFixed(4)} ${G.toFixed(4)} ${B.toFixed(4)}`);
  }
  fs.writeFileSync(lutPath, lines.join('\n'));
}
const catalogMod = path.join(root, 'mods', 'thermal-camera.vrmod');
const pro = await win.evaluate(
  async ({ ids, lutPath, catalogMod }) => {
    const vr = window.__vr;
    const s = vr.useEditor.getState();
    const clips = s.project.tracks.flatMap((t) => t.clips);
    const v1 = s.project.tracks.find((t) => t.name === 'V1');
    const second = v1.clips[1];
    const hevc = v1.clips.find((c) => c.start >= 10.9);
    vr.addEffect([second.id], 'fx.vhs');
    vr.addEffect([ids.b], 'fx.rgbSplit');
    vr.applyTransition(hevc.id, 'tr.heart');
    vr.updateClip(ids.img, (c) => {
      c.mask = { shape: 'ellipse', x: 0.5, y: 0.5, width: 0.8, height: 0.8, rotation: 0, feather: 0.1, invert: false };
    });
    await window.__vr.player.seek(0);
    vr.updateClip(ids.b, (c) => {
      c.lut = { path: lutPath, name: 'warm.cube', amount: 100 };
    });
    vr.updateClip(ids.tone, (c) => {
      c.audioFx = { low: 6, mid: -3, high: 2, compressor: true };
      c.keyframes.volume = [
        { t: 0, v: 0.2, ease: 'linear' },
        { t: 3, v: 1, ease: 'linear' },
      ];
    });
    await window.__vrMods.installMods([catalogMod]);
    const modOk = !!window.__vrFx.getFx('kadro.thermal-camera');
    vr.addEffect([ids.green], 'kadro.thermal-camera');
    // Autosave round trip.
    await window.api.autosaveWrite('{"name":"t"}', { filePath: null, name: 't' });
    const rec = await window.api.autosaveRead();
    await window.api.autosaveClear();
    return { modOk, autosaveOk: rec?.meta?.name === 't', clipCount: clips.length };
  },
  { ids, lutPath, catalogMod },
);
log('pro setup', JSON.stringify(pro));
if (!pro.modOk) problems.push('catalog mod did not install');
if (!pro.autosaveOk) problems.push('autosave round trip failed');
await seek(11.4, '05c-heart-transition.png');
await frameStats('t=11.4 heart');
await seek(8, '05d-mod-thermal.png');

log('freeze frame + reverse');
const editRes = await win.evaluate(async (ids) => {
  const vr = window.__vr;
  const before = vr.useEditor.getState().project.tracks.flatMap((t) => t.clips).length;
  vr.player.seek(4);
  vr.select([]);
  await vr.freezeFrame(1);
  const afterFreeze = vr.useEditor.getState().project.tracks.flatMap((t) => t.clips).length;
  await vr.reverseClip(ids.b);
  const b = vr.useEditor.getState().project.tracks.flatMap((t) => t.clips).find((c) => c.id === ids.b);
  const m = vr.useEditor.getState().project.media.find((x) => x.id === b.mediaId);
  return { before, afterFreeze, reversedMedia: m?.name };
}, ids);
log('edit tools', JSON.stringify(editRes));
if (editRes.afterFreeze < editRes.before + 2) problems.push('freeze frame did not insert a still');
if (!/rev/i.test(editRes.reversedMedia ?? '')) problems.push('reverse did not swap media');

log('elements, layouts, solo, track height, enhancement');
const toolsRes = await win.evaluate(async (ids) => {
  const vr = window.__vr;
  const all = () => vr.useEditor.getState().project.tracks.flatMap((t) => t.clips);
  const find = (id) => all().find((c) => c.id === id);
  const out = {};
  // Adjustment layer with colour wheels and a shape on new tracks.
  vr.addAdjustmentClip({ time: 0, newTrack: true });
  const adj = vr.useEditor.getState().selection[0];
  vr.updateClip(adj, (c) => {
    c.wheels.gain = { x: 0.3, y: 0, l: 0.1 };
    c.adjust.saturation = -40;
  });
  vr.addShapeClip('star', { time: 0, newTrack: true });
  out.shape = find(vr.useEditor.getState().selection[0])?.shape?.kind;
  // Split screen of the still and the keyed clip.
  vr.select([ids.img, ids.green]);
  vr.applyLayout('split-v');
  const img = find(ids.img);
  const green = find(ids.green);
  out.layout = { imgX: img.transform.x, greenX: green.transform.x, imgCrop: +img.crop.left.toFixed(3), greenScale: +green.transform.scale.toFixed(3) };
  vr.undo();
  // Solo and custom track height.
  const a1 = vr.useEditor.getState().project.tracks.find((t) => t.name === 'A1').id;
  vr.setTrackFlag(a1, 'solo', true);
  out.solo = vr.useEditor.getState().project.tracks.filter((t) => t.solo).length;
  vr.setTrackFlag(a1, 'solo', false);
  vr.edit((d) => void (d.tracks.find((t) => t.id === a1).height = 96));
  await new Promise((r) => setTimeout(r, 100));
  out.rowHeight = Math.round(document.querySelector(`[data-track-id="${a1}"]`).closest('.tl-row').getBoundingClientRect().height);
  // Loudness normalisation, noise reduction and stabilisation.
  const gainOf = (c) => JSON.stringify(c.keyframes.volume?.length ? c.keyframes.volume.map((k) => k.v) : c.volume);
  const before = gainOf(find(ids.tone));
  out.loudness = await vr.normalizeLoudness([ids.tone], -16);
  out.toneVolume = [before, gainOf(find(ids.tone))];
  out.denoised = await vr.denoiseClip(ids.tone, { strength: 40, voice: false });
  out.stabilized = await vr.stabilizeClip(ids.a, { smoothing: 40, zoom: true });
  out.stabName = find(ids.a).name;
  return out;
}, ids);
log('tools', JSON.stringify(toolsRes));
if (toolsRes.shape !== 'star') problems.push('shape clip not added');
if (!(toolsRes.layout.imgX < 0 && toolsRes.layout.greenX > 0)) problems.push(`split-screen layout wrong: ${JSON.stringify(toolsRes.layout)}`);
if (toolsRes.solo !== 1) problems.push('track solo flag not set');
if (toolsRes.rowHeight !== 96) problems.push(`track height not applied (${toolsRes.rowHeight})`);
if (toolsRes.loudness !== 1 || toolsRes.toneVolume[0] === toolsRes.toneVolume[1]) problems.push('loudness normalisation did not change the volume');
if (!toolsRes.denoised) problems.push('noise reduction failed');
if (!toolsRes.stabilized) problems.push('stabilisation failed');
await seek(1.5, '05e-adjustment-shape.png');
await frameStats('t=1.5 adjustment + shape');

log('overlays, stickers, title fonts, curves, HSL, blend modes');
const looks = await win.evaluate(async (ids) => {
  const vr = window.__vr;
  const all = () => vr.useEditor.getState().project.tracks.flatMap((t) => t.clips);
  const out = {};
  vr.addOverlayClip('gen.lightLeak', { time: 0, newTrack: true });
  const leak = vr.useEditor.getState().selection[0];
  out.leakBlend = all().find((c) => c.id === leak)?.blend;
  vr.addSticker('🔥', { time: 0, newTrack: true });
  out.sticker = all().find((c) => c.id === vr.useEditor.getState().selection[0])?.text?.content;
  vr.addTextClip('retro', { time: 0.5, newTrack: true });
  out.retroFont = all().find((c) => c.id === vr.useEditor.getState().selection[0])?.text?.fontFamily;
  vr.updateClip(ids.green, (c) => {
    c.curves = { master: [{ x: 0, y: 0 }, { x: 0.3, y: 0.2 }, { x: 0.7, y: 0.85 }, { x: 1, y: 1 }], r: [{ x: 0, y: 0 }, { x: 1, y: 1 }], g: [{ x: 0, y: 0 }, { x: 1, y: 1 }], b: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
    c.hsl = { red: { h: 30, s: 20, l: 0 }, orange: { h: 0, s: 0, l: 0 }, yellow: { h: 0, s: 0, l: 0 }, green: { h: -20, s: 0, l: 0 }, aqua: { h: 0, s: 0, l: 0 }, blue: { h: 0, s: 0, l: 0 }, purple: { h: 0, s: 0, l: 0 }, magenta: { h: 0, s: 0, l: 0 } };
  });
  vr.updateClip(ids.img, (c) => void (c.blend = 'overlay'));
  return out;
}, ids);
log('looks', JSON.stringify(looks));
if (looks.leakBlend !== 'screen') problems.push('overlay element not added with its blend mode');
if (looks.sticker !== '🔥') problems.push('sticker not added');
if (looks.retroFont !== 'Rubik Mono One') problems.push('text style did not use its bundled font');
await seek(3.2, '05g-overlays.png');
await frameStats('t=3.2 overlays + blend');

log('scopes and level meter');
await win.click('.transport-right .icon-btn >> nth=1');
await win.evaluate(() => window.__vr.player.play());
await win.waitForTimeout(1200);
const meters = await win.evaluate(() => {
  const lit = (c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) n++;
    return n;
  };
  const scopes = [...document.querySelectorAll('.scopes canvas')].map(lit);
  const bars = [...document.querySelectorAll('.vu-bar')].map((b) => parseFloat(b.style.width) || 0);
  return { scopes, bars };
});
await win.screenshot({ path: path.join(outDir, '05f-scopes.png') });
await win.evaluate(() => window.__vr.player.pause());
await win.click('.transport-right .icon-btn >> nth=1');
log('scopes', JSON.stringify(meters));
if (meters.scopes.length !== 3 || meters.scopes.some((n) => n < 20)) problems.push(`scopes look empty: ${meters.scopes}`);
if (!meters.bars.some((w) => w > 5)) problems.push('level meter stayed at zero during playback');

log('UI tabs');
await win.click('.rail-btn:nth-child(2)');
await win.waitForTimeout(200);
await win.screenshot({ path: path.join(outDir, '06-text-tab.png') });
await win.click('.rail-btn:nth-child(3)');
await win.waitForTimeout(200);
await win.screenshot({ path: path.join(outDir, '07-transitions-tab.png') });
await win.click('.rail-btn:nth-child(1)');
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
  for (const tt of [2, 6.3, 8, 12.4]) {
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(tt), '-i', exportPath, '-frames:v', '1', path.join(outDir, `export-${tt}.png`)]);
  }
  // Audio must be present and audible.
  const vol = spawnSync(ffmpeg, ['-hide_banner', '-i', exportPath, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const mean = Number(/mean_volume: (-?[\d.]+) dB/.exec(vol)?.[1]);
  log(`exported audio mean volume: ${mean} dB`);
  if (!(mean > -60)) problems.push(`exported audio is silent (${mean} dB)`);
}

log('in/out range export');
const rangePath = path.join(outDir, 'export-range.mp4');
const rangeRes = await win.evaluate(async (out) => {
  const vr = window.__vr;
  vr.setMark('in', 2);
  vr.setMark('out', 4.5);
  const range = vr.markedRange();
  const r = await vr.runExport({ outPath: out, format: 'mp4', width: 640, height: 360, fps: 30, quality: 'low', range }, () => {}, { cancelled: false });
  vr.clearMarks();
  return { ok: r.ok, range };
}, rangePath);
if (!rangeRes.ok) problems.push('range export failed');
else {
  const ffprobe = require('ffprobe-static').path;
  const dur = Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', rangePath]).toString());
  log(`range ${JSON.stringify(rangeRes.range)} -> ${dur.toFixed(2)} s`);
  if (Math.abs(dur - 2.5) > 0.15) problems.push(`range export duration ${dur}, expected 2.5`);
}

log('save + reopen project');
const projPath = path.join(outDir, 'smoke.vrproj');
const reopened = await win.evaluate(async (p) => {
  const vr = window.__vr;
  vr.useEditor.setState({ filePath: p });
  await vr.saveProject();
  const saved = JSON.parse(await window.api.readText(p));
  if (!(saved.fx ?? []).some((d) => d.id === 'kadro.thermal-camera')) throw new Error('mod definition not embedded in project');
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
