// Client for the media worker processes (see src/worker). Frame data goes over
// MessagePorts straight to the workers; if a port is not connected yet the call
// falls back to the main-process IPC handlers, which run the same code.
import { api } from '../api';
import type { DecoderSpec, ExportResult, ExportSpec, MatteSpec } from '../../shared/api';

type Role = 'decode' | 'encode';

const ports: Partial<Record<Role, MessagePort>> = {};
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let seq = 1;

window.addEventListener('message', (ev) => {
  const data = ev.data as { type?: string; role?: Role } | null;
  if (ev.source !== window || data?.type !== 'vr-media-port' || !data.role || !ev.ports[0]) return;
  const port = ev.ports[0];
  ports[data.role]?.close();
  port.onmessage = (m) => {
    const { id, result, error } = m.data as { id: number; result?: unknown; error?: string };
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error !== undefined) p.reject(new Error(error));
    else p.resolve(result);
  };
  port.start();
  ports[data.role] = port;
});

function call<T>(role: Role, method: keyof typeof api & string, args: unknown[]): Promise<T> {
  const port = ports[role];
  if (!port) return (api[method] as (...a: unknown[]) => Promise<T>)(...args);
  return new Promise<T>((resolve, reject) => {
    const id = seq++;
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    port.postMessage({ id, method, args });
  });
}

export function workersConnected(): boolean {
  return !!ports.decode && !!ports.encode;
}

export const mediaWorker = {
  decoderOpen: (spec: DecoderSpec) => call<string>('decode', 'decoderOpen', [spec]),
  decoderRead: (id: string) => call<Uint8Array | null>('decode', 'decoderRead', [id]),
  decoderClose: (id: string) => call<void>('decode', 'decoderClose', [id]),
  exportStart: (spec: ExportSpec) => call<string>('encode', 'exportStart', [spec]),
  // Not transferred: Electron drops messages that transfer ArrayBuffers to a
  // Node process, so the frame is copied into the message instead.
  exportFrame: (jobId: string, data: Uint8Array) => call<void>('encode', 'exportFrame', [jobId, data]),
  exportFinish: (jobId: string) => call<ExportResult>('encode', 'exportFinish', [jobId]),
  exportCancel: (jobId: string) => call<void>('encode', 'exportCancel', [jobId]),
  matteStart: (spec: MatteSpec) => call<string>('encode', 'matteStart', [spec]),
};
