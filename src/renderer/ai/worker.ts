/// <reference lib="webworker" />
// AI worker: runs transformers.js models (speech recognition, background
// matting) off the UI thread, on the GPU through WebGPU when available.
// Models are downloaded from Hugging Face on first use and cached by the browser.
import { env, pipeline, RawImage } from '@huggingface/transformers';
import type { AiRequest, AiResponse, AsrChunk, CacheReply } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let current = 0;
const post = (msg: AiResponse) => self.postMessage(msg);

// Model files are cached on disk by the main process (the browser cache is not
// available to workers of a file:// page). Requests go through the UI thread.
let hostSeq = 1;
const hostPending = new Map<number, (data: Uint8Array | null) => void>();

function host(op: 'get' | 'put', url: string, data?: Uint8Array): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const hid = hostSeq++;
    hostPending.set(hid, resolve);
    self.postMessage({ id: 0, type: 'cache', hid, op, url, data } satisfies AiResponse, data ? [data.buffer] : []);
  });
}

const diskCache = {
  async match(request: string | Request): Promise<Response | undefined> {
    const data = await host('get', typeof request === 'string' ? request : request.url);
    if (!data) return undefined;
    return new Response(data.slice().buffer, { headers: { 'content-length': String(data.byteLength) } });
  },
  async put(request: string | Request, response: Response): Promise<void> {
    const data = new Uint8Array(await response.arrayBuffer());
    await host('put', typeof request === 'string' ? request : request.url, data);
  },
};

type Device = 'webgpu' | 'wasm';
let device: Device | null = null;

async function pickDevice(): Promise<Device> {
  if (device) return device;
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    device = gpu && (await gpu.requestAdapter()) ? 'webgpu' : 'wasm';
  } catch {
    device = 'wasm';
  }
  return device;
}

// transformers.js pipelines are loosely typed per task; the calls below are checked at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPipeline = (...args: any[]) => Promise<any>;
const pipes = new Map<string, Promise<AnyPipeline>>();

function progress(p: { status?: string; file?: string; progress?: number; loaded?: number; total?: number }) {
  if (p.status === 'progress' && p.file) {
    post({ id: current, type: 'progress', stage: 'download', file: p.file, progress: (p.progress ?? 0) / 100, loaded: p.loaded, total: p.total });
  }
}

async function getPipe(task: string, model: string, options: (d: Device) => Record<string, unknown>): Promise<AnyPipeline> {
  const key = `${task}|${model}`;
  let p = pipes.get(key);
  if (!p) {
    p = (async () => {
      const d = await pickDevice();
      try {
        return (await pipeline(task as never, model, { device: d, ...options(d), progress_callback: progress } as never)) as unknown as AnyPipeline;
      } catch (e) {
        if (d !== 'webgpu') throw e;
        // Some operators are missing on WebGPU for some models: fall back to WASM.
        device = 'wasm';
        return (await pipeline(task as never, model, { device: 'wasm', ...options('wasm'), progress_callback: progress } as never)) as unknown as AnyPipeline;
      }
    })();
    pipes.set(key, p);
    p.catch(() => pipes.delete(key));
  }
  return p;
}

async function transcribe(audio: Float32Array, model: string, language: string | null): Promise<AsrChunk[]> {
  const asr = await getPipe('automatic-speech-recognition', model, (d) => ({
    dtype: d === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
  }));
  post({ id: current, type: 'progress', stage: 'run', progress: 0 });
  const out = await asr(audio, {
    language: language ?? undefined,
    task: 'transcribe',
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  const chunks = (out?.chunks ?? []) as { text: string; timestamp: [number, number | null] }[];
  return chunks
    .map((c) => ({ text: c.text.trim(), start: c.timestamp[0] ?? 0, end: c.timestamp[1] ?? (c.timestamp[0] ?? 0) + 2 }))
    .filter((c) => c.text.length > 0);
}

async function matte(rgba: Uint8Array, width: number, height: number, model: string): Promise<Uint8Array> {
  const seg = await getPipe('background-removal', model, () => ({ dtype: 'fp32' }));
  const img = new RawImage(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), width, height, 4);
  const out = await seg(img);
  const res = (Array.isArray(out) ? out[0] : out) as RawImage;
  const src = res.width === width && res.height === height ? res : await res.resize(width, height);
  const alpha = new Uint8Array(width * height);
  const ch = src.channels;
  for (let i = 0; i < alpha.length; i++) alpha[i] = src.data[i * ch + ch - 1];
  return alpha;
}

self.onmessage = async (ev: MessageEvent<AiRequest | CacheReply>) => {
  if (ev.data.type === 'cacheReply') {
    const reply = ev.data;
    hostPending.get(reply.hid)?.(reply.data);
    hostPending.delete(reply.hid);
    return;
  }
  const req = ev.data;
  current = req.id;
  try {
    if (req.type === 'init') {
      env.allowLocalModels = false;
      // The runtime files ship with the app; caching file:// URLs is not supported anyway.
      const e = env as unknown as { useWasmCache: boolean; useBrowserCache: boolean; useCustomCache: boolean; customCache: unknown };
      e.useWasmCache = false;
      e.useBrowserCache = false;
      e.useCustomCache = true;
      e.customCache = diskCache;
      const wasm = env.backends.onnx.wasm as { wasmPaths?: unknown; numThreads?: number } | undefined;
      if (wasm) {
        wasm.wasmPaths = { mjs: `${req.ortBase}ort-wasm-simd-threaded.asyncify.mjs`, wasm: `${req.ortBase}ort-wasm-simd-threaded.asyncify.wasm` };
        wasm.numThreads = 1;
      }
      post({ id: req.id, type: 'result', result: { device: await pickDevice() } });
    } else if (req.type === 'asr') {
      post({ id: req.id, type: 'result', result: await transcribe(req.audio, req.model, req.language) });
    } else if (req.type === 'matte') {
      const alpha = await matte(req.rgba, req.width, req.height, req.model);
      self.postMessage({ id: req.id, type: 'result', result: alpha } satisfies AiResponse, [alpha.buffer]);
    }
  } catch (e) {
    post({ id: req.id, type: 'error', error: e instanceof Error ? e.message : String(e) });
  }
};
