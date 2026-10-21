// Resolves what is visible/audible at a given time. Used identically by the
// live preview and by export, which keeps the two in sync.
import { clipAnimModifier, transitionModifiers } from './effects';
import { propValue } from './keyframes';
import { combine, type Mask, type Modifier } from './modifiers';
import { adjacentBefore, clipAtTime, clipEnd } from './project';
import type { Clip, MediaAsset, Project, Track } from './types';
import type { AudioSegment } from '../../shared/api';

export interface LayerPlan {
  clip: Clip;
  track: Track;
  /** Seconds since clip start (exceeds duration for transition tails). */
  localTime: number;
  /** Source media time for video clips. */
  sourceTime: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  blur: number;
  fade: [number, number, number, number] | null;
  mask: Mask | null;
  reveal: number;
  tail: boolean;
}

function planFor(
  p: Project,
  clip: Clip,
  track: Track,
  t: number,
  mod: Modifier,
  media: Map<string, MediaAsset>,
  tail: boolean,
): LayerPlan {
  const { width, height, fps } = p.settings;
  const local = t - clip.start;
  let sourceTime = clip.in + local * clip.speed;
  const m = clip.mediaId ? media.get(clip.mediaId) : undefined;
  if (m && m.duration > 0) sourceTime = Math.min(Math.max(0, sourceTime), Math.max(0, m.duration - 0.5 / fps));
  return {
    clip,
    track,
    localTime: local,
    sourceTime,
    x: propValue(clip, 'x', local) + mod.dx * width,
    y: propValue(clip, 'y', local) + mod.dy * height,
    scale: propValue(clip, 'scale', local) * mod.scale,
    rotation: propValue(clip, 'rotation', local) + mod.rotation,
    opacity: Math.max(0, Math.min(1, propValue(clip, 'opacity', local) * mod.opacity)),
    blur: mod.blur,
    fade: mod.fade,
    mask: mod.mask,
    reveal: mod.reveal,
    tail,
  };
}

/** Visual layers at time t, bottom-most first. */
export function resolveScene(p: Project, t: number, media: Map<string, MediaAsset>): LayerPlan[] {
  const layers: LayerPlan[] = [];
  const aspect = p.settings.width / p.settings.height;
  for (const track of p.tracks) {
    if (track.kind !== 'video' || track.hidden) continue;
    const clip = clipAtTime(track, t);
    if (!clip || clip.type === 'audio') continue;
    const local = t - clip.start;
    const anim = clipAnimModifier(clip, local);
    const tr = clip.transition;
    const d = Math.min(tr.duration, clip.duration);
    if (tr.type !== 'none' && d > 0 && local < d) {
      const { a, b } = transitionModifiers(tr.type, local / d, aspect);
      const prev = adjacentBefore(track, clip, p.settings.fps);
      if (prev && prev.type !== 'audio') layers.push(planFor(p, prev, track, t, a, media, true));
      layers.push(planFor(p, clip, track, t, combine(anim, b), media, false));
    } else {
      layers.push(planFor(p, clip, track, t, anim, media, false));
    }
  }
  return layers.filter((l) => l.opacity > 0.001);
}

/** How long past its end a clip keeps rendering because the next clip transitions from it. */
export function tailLength(p: Project, track: Track, clip: Clip): number {
  const tol = 0.5 / p.settings.fps;
  const next = track.clips.find((c) => c.id !== clip.id && Math.abs(c.start - clipEnd(clip)) <= tol);
  if (!next || next.transition.type === 'none') return 0;
  return Math.min(next.transition.duration, next.duration);
}

export function clipHasAudio(clip: Clip, media: Map<string, MediaAsset>): boolean {
  if (clip.type === 'audio') return true;
  if (clip.type !== 'video' || !clip.mediaId) return false;
  return media.get(clip.mediaId)?.hasAudio ?? false;
}

/** Linear gain of a clip at clip-local time (0 when muted). */
export function clipGain(clip: Clip, track: Track, local: number): number {
  if (clip.muted || track.muted) return 0;
  let g = clip.volume * track.volume;
  if (clip.fadeIn > 0 && local < clip.fadeIn) g *= Math.max(0, local / clip.fadeIn);
  const remaining = clip.duration - local;
  if (clip.fadeOut > 0 && remaining < clip.fadeOut) g *= Math.max(0, remaining / clip.fadeOut);
  return g;
}

/** Audio segments to be mixed for export. */
export function audioPlan(p: Project, media: Map<string, MediaAsset>): AudioSegment[] {
  const out: AudioSegment[] = [];
  for (const track of p.tracks) {
    if (track.muted) continue;
    for (const clip of track.clips) {
      if (clip.muted || !clipHasAudio(clip, media) || !clip.mediaId) continue;
      const m = media.get(clip.mediaId);
      if (!m) continue;
      const volume = clip.volume * track.volume;
      if (volume <= 0) continue;
      out.push({
        path: m.path,
        sourceIn: clip.in,
        sourceDuration: clip.duration * clip.speed,
        speed: clip.speed,
        start: clip.start,
        duration: clip.duration,
        volume,
        fadeIn: Math.min(clip.fadeIn, clip.duration),
        fadeOut: Math.min(clip.fadeOut, clip.duration),
      });
    }
  }
  return out;
}
