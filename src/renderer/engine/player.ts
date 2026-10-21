// Live preview: keeps a pool of <video>/<audio> elements in sync with the
// timeline clock, routes their sound through Web Audio (per-clip gain) and
// draws each frame with the WebGL compositor.
import { mediaUrl } from '../../shared/api';
import { clipEnd, mediaMap, projectDuration } from '../core/project';
import { clipGain, clipHasAudio, resolveScene, type LayerPlan } from '../core/scene';
import { snapToFrame } from '../core/time';
import type { Clip, MediaAsset, Project } from '../core/types';
import { setPlayhead, useEditor } from '../store/editor';
import { Compositor, type TexSource } from './gl';
import { buildItems, type SourceProvider } from './items';

interface MediaEl {
  el: HTMLMediaElement;
  src: string;
  gain: GainNode | null;
  lastUsed: number;
  clipId: string;
}

const PRELOAD_AHEAD = 2;
const MAX_IDLE_ELEMENTS = 8;

class Player implements SourceProvider {
  private comp: Compositor | null = null;
  private host: HTMLDivElement | null = null;
  private elements = new Map<string, MediaEl>();
  private images = new Map<string, HTMLImageElement>();
  private audioCtx: AudioContext | null = null;
  private master: GainNode | null = null;
  private raf = 0;
  private renderQueued = false;
  private startWall = 0;
  private startTime = 0;
  private unsub: (() => void) | null = null;

  attach(canvas: HTMLCanvasElement): void {
    this.detach();
    this.comp = new Compositor(canvas);
    if (!this.host) {
      this.host = document.createElement('div');
      this.host.style.cssText = 'position:fixed;left:-10px;top:-10px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
      document.body.appendChild(this.host);
    }
    let prev = useEditor.getState();
    this.unsub = useEditor.subscribe((s) => {
      if (
        s.project !== prev.project ||
        s.playhead !== prev.playhead ||
        s.previewScale !== prev.previewScale ||
        s.runtime !== prev.runtime
      ) {
        if (s.runtime !== prev.runtime) this.refreshSources(s.project);
        this.requestRender();
      }
      prev = s;
    });
    this.requestRender();
  }

  detach(): void {
    this.unsub?.();
    this.unsub = null;
    this.comp?.dispose(false);
    this.comp = null;
  }

  // -------------------------------------------------------------------------
  // Transport

  get playing(): boolean {
    return useEditor.getState().playing;
  }

  private ensureAudio(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.audioCtx.createGain();
      this.master.connect(this.audioCtx.destination);
    }
    return this.audioCtx;
  }

  play(): void {
    const s = useEditor.getState();
    if (s.playing) return;
    const ctx = this.ensureAudio();
    void ctx.resume();
    const dur = projectDuration(s.project);
    let t = s.playhead;
    if (dur > 0 && t >= dur - 1e-3) t = 0;
    this.startTime = t;
    this.startWall = performance.now();
    useEditor.setState({ playing: true, playhead: t });
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  pause(): void {
    if (!this.playing) return;
    cancelAnimationFrame(this.raf);
    useEditor.setState({ playing: false });
    for (const m of this.elements.values()) {
      m.el.pause();
      this.setGain(m, 0);
    }
    const s = useEditor.getState();
    setPlayhead(snapToFrame(s.playhead, s.project.settings.fps));
    this.requestRender();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(t: number): void {
    const s = useEditor.getState();
    const tt = Math.max(0, t);
    if (s.playing) {
      this.startTime = tt;
      this.startWall = performance.now();
      setPlayhead(tt);
    } else {
      setPlayhead(snapToFrame(tt, s.project.settings.fps));
    }
  }

  stepFrames(n: number): void {
    const s = useEditor.getState();
    this.pause();
    const fps = s.project.settings.fps;
    this.seek(snapToFrame(s.playhead, fps) + n / fps);
  }

  private tick = (): void => {
    const s = useEditor.getState();
    if (!s.playing) return;
    const dur = projectDuration(s.project);
    let t = this.startTime + (performance.now() - this.startWall) / 1000;
    if (t >= dur) {
      t = dur;
      setPlayhead(t);
      this.pause();
      return;
    }
    setPlayhead(t);
    this.renderFrame(t, true);
    this.raf = requestAnimationFrame(this.tick);
  };

  requestRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      if (!this.playing) this.renderFrame(useEditor.getState().playhead, false);
    });
  }

  // -------------------------------------------------------------------------
  // Rendering

  private renderFrame(t: number, playing: boolean): void {
    const comp = this.comp;
    if (!comp) return;
    const s = useEditor.getState();
    const p = s.project;
    const media = mediaMap(p);
    const plans = resolveScene(p, t, media);
    this.syncMedia(p, t, playing, plans, media);
    const scale = s.previewScale;
    comp.resize(p.settings.width * scale, p.settings.height * scale);
    const items = buildItems(p, plans, media, this, scale);
    comp.render(items, p.settings);
  }

  source(plan: LayerPlan, m: MediaAsset | undefined): TexSource | null {
    if (!m) return null;
    const clip = plan.clip;
    if (clip.type === 'video') {
      const entry = this.elements.get(clip.id);
      const el = entry?.el as HTMLVideoElement | undefined;
      if (!el) return null;
      return { key: `v:${clip.id}`, kind: 'element', el, width: el.videoWidth || m.width, height: el.videoHeight || m.height, version: 'dynamic' };
    }
    if (clip.type === 'image') {
      const img = this.image(m);
      if (!img.complete || img.naturalWidth === 0) return null;
      return { key: `i:${m.id}`, kind: 'element', el: img, width: img.naturalWidth, height: img.naturalHeight, version: img.src };
    }
    return null;
  }

  private image(m: MediaAsset): HTMLImageElement {
    const rt = useEditor.getState().runtime[m.id];
    const url = mediaUrl(rt?.proxyPath ?? m.path);
    let img = this.images.get(m.id);
    if (!img || img.src !== url) {
      img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => this.requestRender();
      img.src = url;
      this.images.set(m.id, img);
    }
    return img;
  }

  /** Recreates elements whose source changed (e.g. a proxy finished). */
  private refreshSources(p: Project): void {
    const runtime = useEditor.getState().runtime;
    const media = mediaMap(p);
    for (const [clipId, entry] of this.elements) {
      const clip = p.tracks.flatMap((tr) => tr.clips).find((c) => c.id === clipId);
      const m = clip?.mediaId ? media.get(clip.mediaId) : undefined;
      if (!m) continue;
      const url = mediaUrl(runtime[m.id]?.proxyPath ?? m.path);
      if (url !== entry.src) this.disposeElement(clipId);
    }
  }

  private element(clip: Clip, m: MediaAsset): MediaEl {
    const runtime = useEditor.getState().runtime[m.id];
    const src = mediaUrl(runtime?.proxyPath ?? m.path);
    let entry = this.elements.get(clip.id);
    if (entry && entry.src !== src) {
      this.disposeElement(clip.id);
      entry = undefined;
    }
    if (!entry) {
      const el = document.createElement(m.kind === 'audio' ? 'audio' : 'video');
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      el.muted = false;
      if (el instanceof HTMLVideoElement) el.playsInline = true;
      el.addEventListener('seeked', () => this.requestRender());
      el.addEventListener('loadeddata', () => this.requestRender());
      el.src = src;
      this.host?.appendChild(el);
      let gain: GainNode | null = null;
      const ctx = this.ensureAudio();
      try {
        const node = ctx.createMediaElementSource(el);
        gain = ctx.createGain();
        gain.gain.value = 0;
        node.connect(gain).connect(this.master!);
      } catch (e) {
        console.warn('Audio routing failed', e);
      }
      entry = { el, src, gain, lastUsed: performance.now(), clipId: clip.id };
      this.elements.set(clip.id, entry);
    }
    return entry;
  }

  private disposeElement(clipId: string): void {
    const entry = this.elements.get(clipId);
    if (!entry) return;
    entry.el.pause();
    entry.gain?.disconnect();
    entry.el.removeAttribute('src');
    entry.el.load();
    entry.el.remove();
    this.elements.delete(clipId);
  }

  private setGain(entry: MediaEl, value: number): void {
    if (!entry.gain || !this.audioCtx) return;
    const g = entry.gain.gain;
    if (Math.abs(g.value - value) < 1e-4) return;
    g.setTargetAtTime(value, this.audioCtx.currentTime, 0.012);
  }

  private syncMedia(p: Project, t: number, playing: boolean, plans: LayerPlan[], media: Map<string, MediaAsset>): void {
    const now = performance.now();
    const fps = p.settings.fps;
    interface Want {
      clip: Clip;
      m: MediaAsset;
      sourceTime: number;
      active: boolean;
      gain: number;
    }
    const wanted = new Map<string, Want>();

    for (const plan of plans) {
      const c = plan.clip;
      if (c.type !== 'video' || !c.mediaId) continue;
      const m = media.get(c.mediaId);
      if (m) wanted.set(c.id, { clip: c, m, sourceTime: plan.sourceTime, active: true, gain: 0 });
    }
    for (const track of p.tracks) {
      for (const c of track.clips) {
        if (!c.mediaId || (c.type !== 'video' && c.type !== 'audio')) continue;
        const m = media.get(c.mediaId);
        if (!m) continue;
        const inside = t >= c.start && t < clipEnd(c);
        if (inside && clipHasAudio(c, media)) {
          const local = t - c.start;
          const w = wanted.get(c.id);
          const gain = clipGain(c, track, local);
          if (w) w.gain = gain;
          else {
            const st = Math.min(Math.max(0, c.in + local * c.speed), Math.max(0, m.duration - 0.5 / fps));
            wanted.set(c.id, { clip: c, m, sourceTime: st, active: true, gain });
          }
        } else if (playing && !wanted.has(c.id) && c.start > t && c.start - t < PRELOAD_AHEAD) {
          wanted.set(c.id, { clip: c, m, sourceTime: c.in, active: false, gain: 0 });
        }
      }
    }

    for (const w of wanted.values()) {
      const entry = this.element(w.clip, w.m);
      entry.lastUsed = now;
      const el = entry.el;
      if (w.active) {
        const rate = Math.min(16, Math.max(0.0625, w.clip.speed));
        if (el.playbackRate !== rate) el.playbackRate = rate;
        if (playing) {
          const drift = Math.abs(el.currentTime - w.sourceTime);
          if (el.paused) {
            if (drift > 0.04) el.currentTime = w.sourceTime;
            void el.play().catch(() => undefined);
          } else if (drift > 0.3 && !el.seeking) {
            el.currentTime = w.sourceTime;
          }
          this.setGain(entry, w.gain);
        } else {
          if (!el.paused) el.pause();
          if (!el.seeking && Math.abs(el.currentTime - w.sourceTime) > 0.5 / fps) el.currentTime = w.sourceTime;
          this.setGain(entry, 0);
        }
      } else {
        if (!el.paused) el.pause();
        if (!el.seeking && Math.abs(el.currentTime - w.sourceTime) > 0.1) el.currentTime = w.sourceTime;
        this.setGain(entry, 0);
      }
    }

    // Park everything else and free long-idle elements.
    const idle: MediaEl[] = [];
    for (const [id, entry] of this.elements) {
      if (wanted.has(id)) continue;
      if (!entry.el.paused) entry.el.pause();
      this.setGain(entry, 0);
      idle.push(entry);
    }
    if (idle.length > MAX_IDLE_ELEMENTS) {
      idle.sort((a, b) => a.lastUsed - b.lastUsed);
      for (const e of idle.slice(0, idle.length - MAX_IDLE_ELEMENTS)) this.disposeElement(e.clipId);
    }
    for (const e of idle) if (now - e.lastUsed > 30000) this.disposeElement(e.clipId);
  }

  // -------------------------------------------------------------------------
  // Snapshot of the current frame at full project resolution.

  async snapshot(): Promise<Blob | null> {
    const s = useEditor.getState();
    const p = s.project;
    const canvas = document.createElement('canvas');
    const comp = new Compositor(canvas, { preserve: true });
    try {
      comp.resize(p.settings.width, p.settings.height);
      const media = mediaMap(p);
      const plans = resolveScene(p, s.playhead, media);
      comp.render(buildItems(p, plans, media, this, 1, 'snap:'), p.settings);
      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    } finally {
      comp.dispose();
    }
  }
}

export const player = new Player();
