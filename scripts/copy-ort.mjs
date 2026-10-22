// Copies the ONNX Runtime WebAssembly build used by transformers.js (WebGPU +
// WASM "asyncify" flavour) into the renderer's public folder, so AI features
// load it locally instead of from a CDN.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const from = path.join(root, 'node_modules', 'onnxruntime-web', 'dist');
const to = path.join(root, 'src', 'renderer', 'public', 'ort');

export function copyOrt() {
  fs.mkdirSync(to, { recursive: true });
  for (const name of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) {
    const src = path.join(from, name);
    const dst = path.join(to, name);
    if (!fs.existsSync(src)) throw new Error(`Missing ${src} — run npm install`);
    if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(src).size) fs.copyFileSync(src, dst);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) copyOrt();
