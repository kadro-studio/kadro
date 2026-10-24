// Live preview: keeps a pool of <video>/<audio> elements in sync with the
// timeline clock, routes their sound through Web Audio (per-clip gain) and
// draws each frame with the WebGL compositor.
import { AUDIO_FX, mediaUrl } from '../../shared/api';
import { clipEnd, emptySlot, mediaMap, projectDuration } from '../core/project';
import { clipGain, clipHasAudio, resolveScene, soloActive, type LayerPlan } from '../core/scene';
import { snapToFrame } from '../core/time';
import { previewPath, type Clip, type MediaAsset, type Project } from '../core/types';
import { setPlayhead, useEditor } from '../store/editor';
import { usePrefs } from '../store/prefs';
import { Compositor, type TexSource } from './gl';
import { buildItems, type SourceProvider } from './items';
import { onLutLoaded } from './lut';
import { feedScopes } from './scopes';
import { onFontsLoaded } from './fonts';

interface MediaEl {
  el: HTMLMediaElement;
  src: string;
  gain: GainNode | null;
  /** low shelf, peaking, high shelf (same settings as the export filters). */
  eq: BiquadFilterNode[];
  comp: DynamicsCompressorNode | null;
  /** Last applied audio settings, to avoid touching nodes every frame. */
  fxKey: string;
  lastUsed: number;
  clipId: string;
}

const PRELOAD_AHEAD = 2;

/**
 * Where playback stops: the end of the project, or with looping on the in/out
 * range (whole project when no marks are set) that it repeats.
 */
function playRange(p: Project): { start: number; end: number; looping: boolean } {
  const dur = projectDuration(p);
  if (!usePrefs.getState().loopPlayback) return { start: 0, end: dur, looping: false };
  const start = Math.max(0, p.markIn ?? 0);
  const end = Math.min(dur, p.markOut ?? dur);
  return end > start ? { start, end, looping: true } : { start: 0, end: dur, looping: true };
}
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
    const unsubPrefs = usePrefs.subscribe((p, old) => {
      if (p.useProxies === old.useProxies) return;
      this.refreshSources(useEditor.getState().project);
      this.requestRender();
    });
    const unsubLut = onLutLoaded(() => this.requestRender());
    const unsubFonts = onFontsLoaded(() => this.requestRender());
    const unsubEditor = this.unsub;
    this.unsub = () => {
      unsubEditor();
      unsubPrefs();
      unsubLut();
      unsubFonts();
    };
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
    const range = playRange(s.project);
    let t = s.playhead;
    if (range.end > 0 && t >= range.end - 1e-3) t = range.start;
    else if (range.looping && t < range.start) t = range.start;
    this.startTime = t;
    this.startWall = performance.now();
    useEditor.setState({ playing: true, playhead: t });
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  /** Overall preview volume (0 silences the project, e.g. while recording a voice-over). */
  setMasterVolume(v: number): void {
    this.ensureAudio();
    this.master!.gain.value = v;
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
    const range = playRange(s.project);
    let t = this.startTime + (performance.now() - this.startWall) / 1000;
    if (t >= range.end) {
      if (range.looping && range.end - range.start > 0.05) {
        // Start over: the media elements re-sync to the new time on the next frame.
        this.startTime = t = range.start;
        this.startWall = performance.now();
      } else {
        setPlayhead(range.end);
        this.pause();
        return;
      }
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

  /** Diagnostics: frames drawn and frames the video decoders dropped. */
  stats(): { renders: number; dropped: number; decoded: number } {
    let dropped = 0;
    let decoded = 0;
    for (const m of this.elements.values()) {
      if (m.el instanceof HTMLVideoElement) {
        const q = m.el.getVideoPlaybackQuality();
        dropped += q.droppedVideoFrames;
        decoded += q.totalVideoFrames;
      }
    }
    return { renders: this.renders, dropped, decoded };
  }

  private renders = 0;

  private renderFrame(t: number, playing: boolean): void {
    const comp = this.comp;
    if (!comp) return;
    this.renders++;
    const s = useEditor.getState();
    const p = s.project;
    const media = mediaMap(p);
    const plans = resolveScene(p, t, media);
    this.syncMedia(p, t, playing, plans, media);
    const scale = s.previewScale;
    comp.resize(p.settings.width * scale, p.settings.height * scale);
    const items = buildItems(p, plans, media, this, scale);
    comp.render(items, p.settings);
    feedScopes(comp.canvas, playing);
  }

  // -------------------------------------------------------------------------
  // Audio level metering (master bus, per channel)

  private meter: { analysers: AnalyserNode[]; buf: Float32Array<ArrayBuffer> } | null = null;

  /** Peak levels 0..1 of the left and right master channels. */
  levels(): [number, number] {
    const ctx = this.ensureAudio();
    if (!this.meter) {
      const split = ctx.createChannelSplitter(2);
      this.master!.connect(split);
      const analysers = [0, 1].map((i) => {
        const a = ctx.createAnalyser();
        a.fftSize = 1024;
        split.connect(a, i);
        return a;
      });
      this.meter = { analysers, buf: new Float32Array(1024) };
    }
    const { analysers, buf } = this.meter;
    return analysers.map((a) => {
      a.getFloatTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
      return peak;
    }) as [number, number];
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
    const url = mediaUrl(previewPath(m, rt, usePrefs.getState().useProxies));
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
      const url = mediaUrl(previewPath(m, runtime[m.id], usePrefs.getState().useProxies));
      if (url !== entry.src) this.disposeElement(clipId);
    }
  }

  private element(clip: Clip, m: MediaAsset): MediaEl {
    const runtime = useEditor.getState().runtime[m.id];
    const src = mediaUrl(previewPath(m, runtime, usePrefs.getState().useProxies));
    let entry = this.elements.get(clip.id);
    if (entry && entry.src !== src) {
      this.disposeElement(clip.id);
      entry = undefined;
    }
    if (!entry) {
      // A video's sound on an audio track plays without decoding its picture.
      const el = document.createElement(m.kind === 'audio' || clip.type === 'audio' ? 'audio' : 'video');
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      el.muted = false;
      if (el instanceof HTMLVideoElement) el.playsInline = true;
      el.addEventListener('seeked', () => this.requestRender());
      el.addEventListener('loadeddata', () => this.requestRender());
      el.src = src;
      this.host?.appendChild(el);
      let gain: GainNode | null = null;
      let eq: BiquadFilterNode[] = [];
      let comp: DynamicsCompressorNode | null = null;
      const ctx = this.ensureAudio();
      try {
        const node = ctx.createMediaElementSource(el);
        const band = (type: BiquadFilterType, freq: number) => {
          const f = ctx.createBiquadFilter();
          f.type = type;
          f.frequency.value = freq;
          f.gain.value = 0;
          return f;
        };
        eq = [band('lowshelf', AUDIO_FX.lowFreq), band('peaking', AUDIO_FX.midFreq), band('highshelf', AUDIO_FX.highFreq)];
        eq[1].Q.value = AUDIO_FX.midQ;
        comp = ctx.createDynamicsCompressor();
        gain = ctx.createGain();
        gain.gain.value = 0;
        node.connect(eq[0]).connect(eq[1]).connect(eq[2]).connect(comp).connect(gain).connect(this.master!);
      } catch (e) {
        console.warn('Audio routing failed', e);
      }
      entry = { el, src, gain, eq, comp, fxKey: '', lastUsed: performance.now(), clipId: clip.id };
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

  private applyAudioFx(entry: MediaEl, clip: Clip): void {
    const fx = clip.audioFx;
    const key = `${fx.low}|${fx.mid}|${fx.high}|${fx.compressor}`;
    if (key === entry.fxKey || entry.eq.length !== 3) return;
    entry.fxKey = key;
    entry.eq[0].gain.value = fx.low;
    entry.eq[1].gain.value = fx.mid;
    entry.eq[2].gain.value = fx.high;
    const c = entry.comp;
    if (c) {
      // Threshold 0 dB with ratio 1 leaves the signal untouched.
      c.threshold.value = fx.compressor ? AUDIO_FX.compThresholdDb : 0;
      c.ratio.value = fx.compressor ? AUDIO_FX.compRatio : 1;
      c.knee.value = fx.compressor ? AUDIO_FX.compKneeDb : 0;
      c.attack.value = AUDIO_FX.compAttack;
      c.release.value = AUDIO_FX.compRelease;
    }
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
    const solo = soloActive(p);

    for (const plan of plans) {
      const c = plan.clip;
      if (c.type !== 'video' || !c.mediaId) continue;
      const m = media.get(c.mediaId);
      // Template slots are drawn as placeholders, with nothing to play.
      if (m && !emptySlot(m)) wanted.set(c.id, { clip: c, m, sourceTime: plan.sourceTime, active: true, gain: 0 });
    }
    for (const track of p.tracks) {
      for (const c of track.clips) {
        if (!c.mediaId || (c.type !== 'video' && c.type !== 'audio')) continue;
        const m = media.get(c.mediaId);
        if (!m || emptySlot(m)) continue;
        const inside = t >= c.start && t < clipEnd(c);
        if (inside && clipHasAudio(c, media)) {
          const local = t - c.start;
          const w = wanted.get(c.id);
          const gain = clipGain(c, track, local, solo);
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
      this.applyAudioFx(entry, w.clip);
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
