// UI-side client of the AI worker (started lazily, kept for reuse).
import { api } from '../api';
import type { AiProgress, AiRequest, AiResponse, AsrChunk, CacheReply } from './protocol';

let worker: Worker | null = null;
let device: string | null = null;

/** 'webgpu' or 'wasm' once the worker has started. */
export function aiDevice(): string | null {
  return device;
}
let ready: Promise<unknown> | null = null;
let seq = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (p: AiProgress) => void }>();

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

function request(req: WithoutId<AiRequest>, transfer: Transferable[] = [], onProgress?: (p: AiProgress) => void): Promise<unknown> {
  const w = ensureWorker();
  return new Promise((resolve, reject) => {
    const id = seq++;
    pending.set(id, { resolve, reject, onProgress });
    w.postMessage({ ...req, id } as AiRequest, transfer);
  });
}

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent<AiResponse>) => {
    const msg = ev.data;
    if (msg.type === 'cache') {
      const w = worker;
      const job = msg.op === 'get' ? api.modelCacheGet(msg.url) : api.modelCachePut(msg.url, msg.data!).then(() => null);
      void job
        .catch(() => null)
        .then((data) => w?.postMessage({ type: 'cacheReply', hid: msg.hid, data } satisfies CacheReply, data ? [data.buffer] : []));
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    if (msg.type === 'progress') p.onProgress?.({ stage: msg.stage, progress: msg.progress, file: msg.file });
    else {
      pending.delete(msg.id);
      if (msg.type === 'result') p.resolve(msg.result);
      else p.reject(new Error(msg.error));
    }
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'AI worker failed'));
    pending.clear();
    worker?.terminate();
    worker = null;
    ready = null;
  };
  ready = request({ type: 'init', ortBase: new URL('./ort/', location.href).href }).then((r) => {
    device = (r as { device: string }).device;
    return r;
  });
  return worker;
}

async function init(): Promise<void> {
  ensureWorker();
  await ready;
}

export async function transcribe(audio: Float32Array, model: string, language: string | null, onProgress?: (p: AiProgress) => void): Promise<AsrChunk[]> {
  await init();
  return (await request({ type: 'asr', audio, model, language }, [audio.buffer], onProgress)) as AsrChunk[];
}

/** Alpha matte (0..255 per pixel) of an RGBA frame. */
export async function matte(rgba: Uint8Array, width: number, height: number, model: string, onProgress?: (p: AiProgress) => void): Promise<Uint8Array> {
  await init();
  return (await request({ type: 'matte', rgba, width, height, model }, [rgba.buffer], onProgress)) as Uint8Array;
}

/** Frees the models (GPU memory) until the next AI request. */
export function disposeAi(): void {
  worker?.terminate();
  worker = null;
  ready = null;
}
