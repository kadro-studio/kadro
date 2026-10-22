// Performance benchmark: export speed per encoder/format and preview playback
// smoothness on 1080p and 4K sources.
//
//   node scripts/bench.mjs <work-dir> [case ...]
//
// Test clips are generated into <work-dir> with the bundled ffmpeg on first run.
import { _electron as electron } from 'playwright-core';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static');
const root = path.resolve(import.meta.dirname, '..');
const work = path.resolve(process.argv[2] ?? 'bench-out');
const only = process.argv.slice(3);
fs.mkdirSync(work, { recursive: true });

function gen(name, args) {
  const out = path.join(work, name);
  if (!fs.existsSync(out)) {
    console.log(`[bench] generating ${name}`);
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  }
  return out;
}

const hd = gen('bench-1080.mp4', [
  '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=20',
  '-f', 'lavfi', '-i', 'sine=frequency=440:duration=20',
  '-c:v', 'libx264', '-preset', 'veryfast', '-g', '120', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
]);
const uhd = gen('bench-2160.mp4', [
  '-f', 'lavfi', '-i', 'testsrc2=size=3840x2160:rate=30:duration=10',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '120', '-pix_fmt', 'yuv420p',
]);

const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, VR_DEV_SERVER_URL: '', KADRO_USER_DATA: path.join(work, 'profile') } });
const win = await app.firstWindow();
win.on('pageerror', (e) => console.log('[pageerror]', e.message));
await win.waitForSelector('.timeline');

async function setupProject(file, { width, height }) {
  await win.evaluate(
    async ({ file, width, height }) => {
      const vr = window.__vr;
      vr.newProject();
      vr.edit((d) => {
        d.settings.width = width;
        d.settings.height = height;
        d.settings.fps = 30;
      });
      const [m] = await vr.importFiles([file]);
      const s = vr.useEditor.getState();
      const v1 = s.project.tracks.find((t) => t.name === 'V1').id;
      vr.addMediaClip(m.id, { trackId: v1, time: 0, overwrite: true });
      const id = vr.useEditor.getState().selection[0];
      vr.applyFilter([id], 'cinematic');
      vr.addTextClip('title', { time: 1 });
      vr.useEditor.setState((x) => ({ savedProject: x.project }));
      // Wait for analysis so preview/proxy state is settled.
      const t0 = performance.now();
      while (performance.now() - t0 < 120000) {
        const st = vr.useEditor.getState().runtime[m.id]?.status;
        if (st === 'ready' || st === 'error') break;
        await new Promise((r) => setTimeout(r, 200));
      }
    },
    { file, width, height },
  );
}

const results = [];

async function exportCase(name, settings) {
  if (only.length && !only.includes(name)) return;
  const out = path.join(work, `${name}.${settings.ext ?? 'mp4'}`);
  const r = await win.evaluate(
    (args) => window.__vr.runExport({ ...args.settings, outPath: args.out }, () => {}, { cancelled: false }),
    { settings, out },
  );
  if (!r.ok) {
    console.log(`[bench] ${name} FAILED: ${r.error}`);
    results.push({ case: name, ok: false });
    return;
  }
  const s = r.stats;
  const per = (ms) => (ms / s.frames).toFixed(1);
  // Guard against "fast but empty" output: average luma of a frame mid-way.
  const luma = (() => {
    if (settings.format === 'mp3' || settings.format === 'wav') return null;
    const res = spawnSync(ffmpeg, ['-hide_banner', '-ss', '5', '-i', out, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-frames:v', '1', '-f', 'null', '-'], { encoding: 'utf8' });
    const m = /YAVG=([\d.]+)/.exec(res.stderr);
    return m ? +Number(m[1]).toFixed(1) : null;
  })();
  const row = {
    case: name,
    seconds: +s.seconds.toFixed(1),
    fps: +(s.frames / s.seconds).toFixed(1),
    'decode ms/f': per(s.decode),
    'render ms/f': per(s.render),
    'readback ms/f': per(s.readback),
    'send ms/f': per(s.send),
    'finish ms': Math.round(s.finish),
    MB: +(fs.statSync(out).size / 1e6).toFixed(1),
    luma,
    encoder: r.encoder,
  };
  results.push(row);
  console.log('[bench]', JSON.stringify(row));
}

async function previewCase(name, seconds = 4) {
  if (only.length && !only.includes(name)) return;
  const r = await win.evaluate(async (sec) => {
    const vr = window.__vr;
    vr.player.seek(0.5);
    await new Promise((res) => setTimeout(res, 800));
    const a = vr.player.stats();
    vr.player.play();
    await new Promise((res) => setTimeout(res, sec * 1000));
    vr.player.pause();
    const b = vr.player.stats();
    return { fps: (b.renders - a.renders) / sec, dropped: b.dropped - a.dropped, decoded: b.decoded - a.decoded };
  }, seconds);
  const row = { case: name, 'render fps': +r.fps.toFixed(1), 'decoded frames': r.decoded, dropped: r.dropped };
  results.push(row);
  console.log('[bench]', JSON.stringify(row));
}

await setupProject(hd, { width: 1920, height: 1080 });
await previewCase('preview-1080');
await exportCase('x264-high-1080', { format: 'mp4', width: 1920, height: 1080, fps: 30, quality: 'high', encoder: 'cpu' });
await exportCase('x264-medium-1080', { format: 'mp4', width: 1920, height: 1080, fps: 30, quality: 'medium', encoder: 'cpu' });
await exportCase('nvenc-1080', { format: 'mp4', width: 1920, height: 1080, fps: 30, quality: 'high', encoder: 'nvenc' });
await exportCase('webm-1080', { format: 'webm', width: 1920, height: 1080, fps: 30, quality: 'medium', ext: 'webm' });

await setupProject(uhd, { width: 3840, height: 2160 });
await previewCase('preview-2160');
// Media above 1080p gets an editing proxy in the background; measure again with it.
await win.evaluate(async () => {
  const vr = window.__vr;
  const t0 = performance.now();
  while (performance.now() - t0 < 180000) {
    const rt = Object.values(vr.useEditor.getState().runtime)[0];
    if (rt && !rt.optimizing && rt.proxyPath) break;
    await new Promise((r) => setTimeout(r, 250));
  }
});
await previewCase('preview-2160-proxy');
await exportCase('x264-medium-2160', { format: 'mp4', width: 3840, height: 2160, fps: 30, quality: 'medium', encoder: 'cpu' });
await exportCase('nvenc-2160', { format: 'mp4', width: 3840, height: 2160, fps: 30, quality: 'high', encoder: 'nvenc' });

await win.evaluate(() => window.__vr.useEditor.setState((x) => ({ savedProject: x.project })));
await app.close();
console.table(results);
