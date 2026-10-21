// Export: renders every frame with the same compositor as the preview, using
// frames decoded by ffmpeg in the main process, and streams the result to the
// encoder.
import { api } from '../api';
import { mediaUrl, type ExportFormat, type ExportQuality, type ExportResult } from '../../shared/api';
import { clipEnd, mediaMap, projectDuration } from '../core/project';
import { audioPlan, resolveScene, tailLength, type LayerPlan } from '../core/scene';
import type { Clip, MediaAsset, MediaRuntime, Project, Track } from '../core/types';
import { useEditor } from '../store/editor';
import { Compositor, type TexSource } from './gl';
import { buildItems, type SourceProvider } from './items';

export interface ExportSettings {
  outPath: string;
  format: ExportFormat;
  width: number;
  height: number;
  fps: number;
  quality: ExportQuality;
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

function maxScale(clip: Clip): number {
  let s = Math.abs(clip.transform.scale);
  for (const k of clip.keyframes.scale ?? []) s = Math.max(s, Math.abs(k.v));
  return s * 1.25;
}

interface DecoderState {
  id: string;
  index: number;
  frame: Uint8Array | null;
  width: number;
  height: number;
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
        img.src = mediaUrl(this.runtime[id]?.proxyPath ?? m.path);
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
    const id = await api.decoderOpen({
      path: m.path,
      sourceIn: clip.in,
      speed: clip.speed,
      fps: this.fps,
      width,
      height,
      duration: clip.duration + extra,
    });
    const state: DecoderState = { id, index: -1, frame: null, width, height, ended: false, until: clipEnd(clip) + extra };
    this.decoders.set(clip.id, state);
    return state;
  }

  async prepare(plans: LayerPlan[]): Promise<void> {
    for (const plan of plans) {
      const clip = plan.clip;
      if (clip.type !== 'video' || !clip.mediaId) continue;
      const m = this.media.get(clip.mediaId);
      if (!m) continue;
      const dec = this.decoders.get(clip.id) ?? (await this.open(plan, m));
      const target = Math.max(0, Math.round(plan.localTime * this.fps));
      while (dec.index < target && !dec.ended) {
        const f = await api.decoderRead(dec.id);
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
          kind: 'pixels',
          data: dec.frame,
          width: dec.width,
          height: dec.height,
          version: dec.index,
        });
      }
    }
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
        await api.decoderClose(d.id);
      }
    }
  }

  async dispose(): Promise<void> {
    for (const d of this.decoders.values()) await api.decoderClose(d.id);
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
  const duration = projectDuration(project);
  if (duration <= 0) return { ok: false, error: 'empty' };
  const fps = settings.fps;
  const total = Math.max(1, Math.round(duration * fps));

  const jobId = await api.exportStart({
    outPath: settings.outPath,
    format: settings.format,
    width: settings.width,
    height: settings.height,
    fps,
    duration,
    quality: settings.quality,
    audio: audioPlan(project, media),
  });

  let provider: ExportProvider | null = null;
  let comp: Compositor | null = null;
  try {
    if (!AUDIO_ONLY.includes(settings.format)) {
      const scale = settings.height / project.settings.height;
      const canvas = document.createElement('canvas');
      comp = new Compositor(canvas);
      comp.resize(settings.width, settings.height);
      provider = new ExportProvider(project, media, s.runtime, fps, scale);
      await provider.preloadImages();
      const started = performance.now();
      for (let k = 0; k < total; k++) {
        if (token.cancelled) throw new Error('cancelled');
        const t = k / fps;
        const plans = resolveScene(project, t, media);
        await provider.prepare(plans);
        comp.render(buildItems(project, plans, media, provider, scale, 'exp:'), project.settings);
        await api.exportFrame(jobId, comp.readPixels());
        await provider.release(t);
        if (k % 3 === 0 || k === total - 1) {
          const elapsed = (performance.now() - started) / 1000;
          const rate = (k + 1) / Math.max(0.001, elapsed);
          onProgress({ phase: 'render', frame: k + 1, total, fps: rate, etaSeconds: (total - k - 1) / rate });
        }
      }
    }
    onProgress({ phase: 'finish', frame: total, total, fps: 0, etaSeconds: 0 });
    if (token.cancelled) throw new Error('cancelled');
    return await api.exportFinish(jobId);
  } catch (e) {
    await api.exportCancel(jobId);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: token.cancelled ? 'cancelled' : msg };
  } finally {
    await provider?.dispose();
    comp?.dispose();
  }
}
