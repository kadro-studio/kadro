// Media worker (an Electron utility process). Runs the ffmpeg decoders and
// encoders and talks to the renderer over a MessagePort, so bulk frame data
// never passes through the main process. The app starts one worker for
// decoding and one for encoding, which lets both directions run in parallel.
import type { MessagePortMain } from 'electron';
import { hwEncoders } from '../main/ffmpeg';
import * as render from '../main/render';

type Handler = (...args: never[]) => unknown;

const handlers: Record<string, Handler> = {
  decoderOpen: render.decoderOpen,
  decoderRead: render.decoderRead,
  decoderClose: render.decoderClose,
  exportStart: render.exportStart,
  exportFrame: render.exportFrame,
  exportFinish: render.exportFinish,
  exportCancel: render.exportCancel,
  matteStart: render.matteStart,
};

interface Request {
  id: number;
  method: string;
  args: never[];
}

function serve(port: MessagePortMain): void {
  port.on('message', async (e) => {
    const { id, method, args } = e.data as Request;
    try {
      const fn = handlers[method];
      if (!fn) throw new Error(`Unknown method ${method}`);
      port.postMessage({ id, result: await fn(...args) });
    } catch (err) {
      port.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
    }
  });
  port.start();
}

process.parentPort.on('message', (e) => {
  if ((e.data as { type?: string })?.type === 'port' && e.ports[0]) serve(e.ports[0]);
});

process.on('exit', () => render.killAll());

// Encoders are probed once per process; do it before the first export asks.
void hwEncoders();
