// Production build: renderer via Vite, main + preload via esbuild.
import { build as viteBuild } from 'vite';
import * as esbuild from 'esbuild';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

export const nodeBuildOptions = {
  entryPoints: {
    'main/index': resolve(root, 'src/main/index.ts'),
    'preload/index': resolve(root, 'src/preload/index.ts'),
  },
  outdir: resolve(root, 'dist'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  external: ['electron', 'ffmpeg-static', 'ffprobe-static'],
  logLevel: 'info',
};

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  await viteBuild({ configFile: resolve(root, 'vite.config.mts'), mode: 'production' });
  await esbuild.build(nodeBuildOptions);
  console.log('Build complete.');
}
