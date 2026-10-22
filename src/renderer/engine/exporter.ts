// Export: renders every frame with the same compositor as the preview, using
// frames decoded by ffmpeg in the main process, and streams the result to the
// encoder.
//
// The loop is pipelined: while frame N is being read back from the GPU and
// sent to the encoder, frame N+1 is decoded and rendered. Frames travel as
// YUV 4:2:0 in both directions (decoders -> GPU, GPU -> encoder), converted on
// the GPU, which is ~2.7x less data than RGBA.
import { mediaWorker } from './mediaWorker';
import { loadProjectFonts } from './fonts';
import {
  mediaUrl,
  type EncoderChoice,
  type ExportFormat,
  type ExportQuality,
  type ExportResult,
  type ExportStats,
} from '../../shared/api';
import { clipEnd, mediaMap, projectDuration } from '../core/project';
import { audioPlan, resolveScene, tailLength, trimAudioPlan, type LayerPlan } from '../core/scene';
import { previewPath, type Clip, type MediaAsset, type MediaRuntime, type Project, type Track } from '../core/types';
import { useEditor } from '../store/editor';
import { canReadYuv, Compositor, type ReadbackFormat, type ReadbackHandle, type TexSource, type YuvMatrix } from './gl';
import { buildItems, type SourceProvider } from './items';
import { loadLut } from './lut';

export interface ExportSettings {
  outPath: string;
  format: ExportFormat;
  width: number;
  height: number;
  fps: number;
  quality: ExportQuality;
  encoder?: EncoderChoice;
  /** Export only this part of the timeline (seconds). */
  range?: { start: number; end: number };
}

export interface ExportProgress {
  phase: 'render' | 'finish';
  frame: number;
  total: number;
  fps: number;
  etaSeconds: number;
}

export interface CancelToken {
  cancelled: boolean;
}

export const AUDIO_ONLY: ExportFormat[] = ['mp3', 'wav'];

/** Encoder writes still queued in the main process before the loop waits. */
const MAX_PENDING_SENDS = 2;

function maxScale(clip: Clip): number {
  let s = Math.abs(clip.transform.scale);
  for (const k of clip.keyframes.scale ?? []) s = Math.max(s, Math.abs(k.v));
  return s * 1.25;
}

/** Colour matrix of a source: its tag when present, otherwise the HD/SD convention. */
export function yuvMatrix(m: MediaAsset): YuvMatrix {
  const cs = m.colorSpace ?? '';
  if (cs === 'bt709') return 'bt709';
  if (cs.startsWith('bt2020')) return 'bt2020';
  if (cs === 'bt470bg' || cs === 'smpte170m' || cs === 'fcc') return 'bt601';
  return m.height >= 720 ? 'bt709' : 'bt601';
}

interface DecoderState {
  id: string;
  index: number;
  frame: Uint8Array | null;
  /** Read already requested for the following frame. */
  next: Promise<Uint8Array | null> | null;
  width: number;
  height: number;
  alpha: boolean;
  matrix: YuvMatrix;
  ended: boolean;
  until: number;
}

class ExportProvider implements SourceProvider {
  private decoders = new Map<string, DecoderState>();
  private frames = new Map<string, TexSource>();
  private images = new Map<string, HTMLImageElement>();
  private tracks = new Map<string, Track>();

  constructor(
    private readonly project: Project,
    private readonly media: Map<string, MediaAsset>,
    private readonly runtime: Record<string, MediaRuntime>,
    private readonly fps: number,
    private readonly scale: number,
  ) {
    for (const tr of project.tracks) for (const c of tr.clips) this.tracks.set(c.id, tr);
  }

  async preloadImages(): Promise<void> {
    const ids = new Set<string>();
    for (const tr of this.project.tracks) for (const c of tr.clips) if (c.type === 'image' && c.mediaId) ids.add(c.mediaId);
    await Promise.all(
      [...ids].map(async (id) => {
        const m = this.media.get(id);
        if (!m) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        // Image proxies exist only for formats Chromium cannot decode.
        img.src = mediaUrl(previewPath(m, this.runtime[id], false));
        try {
          await img.decode();
          this.images.set(id, img);
        } catch {
          // unreadable image: layer is skipped
        }
      }),
    );
  }

  private async open(plan: LayerPlan, m: MediaAsset): Promise<DecoderState> {
    const clip = plan.clip;
    const { width: W, height: H } = this.project.settings;
    const fit = Math.min(W / m.width, H / m.height);
    const k = Math.min(1, fit * this.scale * Math.max(1, maxScale(clip)));
    const width = Math.max(2, Math.round((m.width * k) / 2) * 2);
    const height = Math.max(2, Math.round((m.height * k) / 2) * 2);
    const track = this.tracks.get(clip.id)!;
    const extra = tailLength(this.project, track, clip);
    // Exports of a range may begin in the middle of a clip: seek there instead of decoding from its start.
    const first = Math.max(0, Math.round(plan.localTime * this.fps));
    const skip = first / this.fps;
    const id = await mediaWorker.decoderOpen({
      path: m.path,
      sourceIn: clip.in + skip * clip.speed,
      speed: clip.speed,
      fps: this.fps,
      width,
      height,
      duration: clip.duration + extra - skip,
      format: m.hasAlpha ? 'yuva420p' : 'yuv420p',
    });
    const state: DecoderState = {
      id,
      index: first - 1,
      frame: null,
      next: null,
      width,
      height,
      alpha: !!m.hasAlpha,
      matrix: yuvMatrix(m),
      ended: false,
      until: clipEnd(clip) + extra,
    };
    this.decoders.set(clip.id, state);
    return state;
  }

  private async readFrame(dec: DecoderState): Promise<Uint8Array | null> {
    const f = await (dec.next ?? mediaWorker.decoderRead(dec.id));
    // Ask for the following frame right away so it arrives while we render.
    dec.next = f ? mediaWorker.decoderRead(dec.id) : null;
    return f;
  }

  private async prepareClip(plan: LayerPlan): Promise<void> {
    const clip = plan.clip;
    if (clip.type !== 'video' || !clip.mediaId) return;
    const m = this.media.get(clip.mediaId);
    if (!m) return;
    const dec = this.decoders.get(clip.id) ?? (await this.open(plan, m));
    const target = Math.max(0, Math.round(plan.localTime * this.fps));
    while (dec.index < target && !dec.ended) {
      const f = await this.readFrame(dec);
      if (!f) {
        dec.ended = true;
        break;
      }
      dec.frame = f;
      dec.index++;
    }
    if (dec.frame) {
      this.frames.set(clip.id, {
        key: `x:${clip.id}`,
        kind: 'yuv',
        data: dec.frame,
        width: dec.width,
        height: dec.height,
        version: dec.index,
        matrix: dec.matrix,
        alpha: dec.alpha,
      });
    }
  }

  /** Brings every visible video layer to the right frame (layers in parallel). */
  async prepare(plans: LayerPlan[]): Promise<void> {
    await Promise.all(plans.map((p) => this.prepareClip(p)));
  }

  source(plan: LayerPlan, m: MediaAsset | undefined): TexSource | null {
    const clip = plan.clip;
    if (clip.type === 'video') return this.frames.get(clip.id) ?? null;
    if (clip.type === 'image' && m) {
      const img = this.images.get(m.id);
      if (!img) return null;
      return { key: `i:${m.id}`, kind: 'element', el: img, width: img.naturalWidth, height: img.naturalHeight, version: 1 };
    }
    return null;
  }

  async release(t: number): Promise<void> {
    for (const [clipId, d] of this.decoders) {
      if (t > d.until + 1 / this.fps) {
        this.decoders.delete(clipId);
        this.frames.delete(clipId);
        await mediaWorker.decoderClose(d.id);
      }
    }
  }

  async dispose(): Promise<void> {
    for (const d of this.decoders.values()) await mediaWorker.decoderClose(d.id);
    this.decoders.clear();
    this.frames.clear();
  }
}

export async function runExport(
  settings: ExportSettings,
  onProgress: (p: ExportProgress) => void,
  token: CancelToken,
): Promise<ExportResult> {
  const s = useEditor.getState();
  const project = s.project;
  const media = mediaMap(project);
  const projectEnd = projectDuration(project);
  if (projectEnd <= 0) return { ok: false, error: 'empty' };
  // Text must never be drawn in a fallback font.
  await loadProjectFonts(project);
  const rangeStart = Math.max(0, settings.range?.start ?? 0);
  const rangeEnd = Math.min(projectEnd, settings.range?.end ?? projectEnd);
  const duration = rangeEnd - rangeStart;
  if (duration <= 0) return { ok: false, error: 'empty' };
  const fps = settings.fps;
  const total = Math.max(1, Math.round(duration * fps));
  const exportStarted = performance.now();
  const stats: ExportStats = { frames: total, seconds: 0, decode: 0, render: 0, readback: 0, send: 0, finish: 0 };
  const hasVideo = !AUDIO_ONLY.includes(settings.format);
  const readFormat: ReadbackFormat =
    settings.format !== 'gif' && settings.format !== 'mov-prores' && canReadYuv(settings.width, settings.height) ? 'yuv420p' : 'rgba';

  const jobId = await mediaWorker.exportStart({
    outPath: settings.outPath,
    format: settings.format,
    width: settings.width,
    height: settings.height,
    fps,
    duration,
    quality: settings.quality,
    audio: trimAudioPlan(audioPlan(project, media), rangeStart, rangeEnd),
    pixelFormat: readFormat,
    encoder: settings.encoder ?? 'auto',
  });

  let provider: ExportProvider | null = null;
  let comp: Compositor | null = null;
  const sends: Promise<void>[] = [];
  let sendError: unknown = null;
  const send = async (data: Uint8Array) => {
    const mark = performance.now();
    sends.push(
      mediaWorker.exportFrame(jobId, data).catch((e) => {
        sendError ??= e;
      }),
    );
    if (sends.length > MAX_PENDING_SENDS) await sends.shift();
    stats.send += performance.now() - mark;
    if (sendError) throw sendError;
  };

  try {
    if (hasVideo) {
      const scale = settings.height / project.settings.height;
      const canvas = document.createElement('canvas');
      comp = new Compositor(canvas);
      comp.resize(settings.width, settings.height);
      provider = new ExportProvider(project, media, s.runtime, fps, scale);
      await provider.preloadImages();
      const luts = new Set(project.tracks.flatMap((tr) => tr.clips.flatMap((c) => (c.lut ? [c.lut.path] : []))));
      await Promise.all([...luts].map(loadLut));
      const started = performance.now();
      // Readbacks in flight, oldest first. Each is read two frames after it was
      // queued, with its fence queried in between (see Compositor.touchReadback).
      const queue: ReadbackHandle[] = [];
      const drain = async (h: ReadbackHandle) => {
        const mark = performance.now();
        const data = comp!.finishReadback(h);
        stats.readback += performance.now() - mark;
        await send(data);
      };
      for (let k = 0; k < total; k++) {
        if (token.cancelled) throw new Error('cancelled');
        const t = rangeStart + k / fps;
        const plans = resolveScene(project, t, media);
        let mark = performance.now();
        await provider.prepare(plans);
        stats.decode += performance.now() - mark;
        mark = performance.now();
        comp.render(buildItems(project, plans, media, provider, scale, 'exp:'), project.settings);
        // Readback must be queued in the same task as the render.
        queue.push(comp.beginReadback(readFormat));
        stats.render += performance.now() - mark;
        for (const h of queue) comp.touchReadback(h);
        if (queue.length > 2) await drain(queue.shift()!);
        await provider.release(t);
        if (k % 3 === 0 || k === total - 1) {
          const elapsed = (performance.now() - started) / 1000;
          const rate = (k + 1) / Math.max(0.001, elapsed);
          onProgress({ phase: 'render', frame: k + 1, total, fps: rate, etaSeconds: (total - k - 1) / rate });
        }
      }
      while (queue.length) await drain(queue.shift()!);
      await Promise.all(sends);
      if (sendError) throw sendError;
    }
    onProgress({ phase: 'finish', frame: total, total, fps: 0, etaSeconds: 0 });
    if (token.cancelled) throw new Error('cancelled');
    const mark = performance.now();
    const result = await mediaWorker.exportFinish(jobId);
    stats.finish = performance.now() - mark;
    stats.seconds = (performance.now() - exportStarted) / 1000;
    return { ...result, stats };
  } catch (e) {
    await Promise.allSettled(sends);
    await mediaWorker.exportCancel(jobId);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: token.cancelled ? 'cancelled' : msg };
  } finally {
    await provider?.dispose();
    comp?.dispose();
  }
}
