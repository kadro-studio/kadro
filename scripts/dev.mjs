// Development runner: Vite dev server for the renderer, esbuild watch for
// main/preload, and an Electron process that restarts when main code changes.
import { createServer } from 'vite';
import * as esbuild from 'esbuild';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import electronPath from 'electron';
import { nodeBuildOptions } from './build.mjs';
import { copyOrt } from './copy-ort.mjs';

const root = resolve(import.meta.dirname, '..');
copyOrt();

const server = await createServer({ configFile: resolve(root, 'vite.config.mts'), mode: 'development' });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`[dev] renderer at ${url}`);

let child = null;
let restarting = false;

function startElectron() {
  child = spawn(electronPath, ['.'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, VR_DEV_SERVER_URL: url },
  });
  child.on('exit', () => {
    if (restarting) return;
    server.close();
    process.exit(0);
  });
}

const ctx = await esbuild.context({
  ...nodeBuildOptions,
  plugins: [
    {
      name: 'restart-electron',
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length) return;
          if (!child) {
            startElectron();
            return;
          }
          restarting = true;
          child.once('exit', () => {
            restarting = false;
            startElectron();
          });
          child.kill();
        });
      },
    },
  ],
});
await ctx.watch();
