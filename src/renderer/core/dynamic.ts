// Dynamic editing: speed ramps, camera moves, effects on the beat and zoom cuts.
// Pure functions that work out pieces or keyframes; the store applies them as
// one undo step.
import { clamp, snapToFrame } from './time';
import type { AnimProp, Keyframe } from './types';

// ---------------------------------------------------------------------------
// Speed ramps (CapCut's "curve speed"): the clip becomes short pieces whose
// speeds follow a curve, so preview, export, sound and linked clips all keep
// working as with any clip.

export const RAMP_PRESETS = ['montage', 'hero', 'bullet', 'jumpCut', 'flashIn', 'flashOut', 'slowDown', 'speedUp'] as const;
export type RampPreset = (typeof RAMP_PRESETS)[number];

/** Speed at points spread evenly over the resulting piece of timeline. */
const RAMPS: Record<RampPreset, number[]> = {
  montage: [1.8, 2.6, 0.6, 0.45, 2.4, 2.8, 0.6, 0.5, 1.8],
  hero: [1, 1, 1.2, 0.3, 0.2, 0.3, 1.2, 1, 1],
  bullet: [3, 3, 2.2, 0.3, 0.15, 0.3, 2.2, 3, 3],
  jumpCut: [1, 1, 1.2, 4.5, 6, 4.5, 1.2, 1, 1],
  flashIn: [6, 5, 3, 1.6, 1, 1, 1, 1, 1],
  flashOut: [1, 1, 1, 1, 1, 1.6, 3, 5, 6],
  slowDown: [1.6, 1.3, 1, 0.75, 0.55, 0.42, 0.33, 0.3, 0.3],
  speedUp: [0.5, 0.6, 0.8, 1.1, 1.5, 2, 2.6, 3.2, 3.6],
};

/** Speed of a ramp at v (0..1 through it); `strength` scales how far it strays from 1×. */
export function rampSpeedAt(preset: RampPreset, v: number, strength = 1): number {
  const pts = RAMPS[preset];
  const x = clamp(v, 0, 1) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(x));
  const f = x - i;
  // Interpolated in log space: halving and doubling are equally far from 1×.
  const l = Math.log(pts[i]) * (1 - f) + Math.log(pts[i + 1]) * f;
  return clamp(Math.exp(l * strength), 0.1, 16);
}

export interface RampPiece {
  /** Offset from the clip's start and length on the timeline, seconds. */
  start: number;
  duration: number;
  /** Source offset and playback speed. */
  in: number;
  speed: number;
}

/**
 * Pieces of a ramp playing `sourceLen` seconds of source from `sourceIn`.
 * Pieces are about a quarter of a second long, so the steps between speeds
 * read as a curve.
 */
export function rampPieces(preset: RampPreset, strength: number, sourceIn: number, sourceLen: number, fps: number): RampPiece[] {
  const N = 240;
  const cum = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) cum[i + 1] = cum[i] + rampSpeedAt(preset, (i + 0.5) / N, strength);
  const mean = cum[N] / N;
  const total = Math.max(2 / fps, snapToFrame(sourceLen / mean, fps));
  // Source used up to a fraction of the result: the integral of the speed.
  const sourceAt = (v: number) => {
    const x = clamp(v, 0, 1) * N;
    const i = Math.min(N - 1, Math.floor(x));
    return ((cum[i] + (cum[i + 1] - cum[i]) * (x - i)) / cum[N]) * sourceLen;
  };
  const count = clamp(Math.round(total / 0.25), 4, 16);
  const bounds: number[] = [];
  for (let k = 0; k <= count; k++) {
    const b = k === count ? total : snapToFrame((total * k) / count, fps);
    if (bounds.length === 0 || b - bounds[bounds.length - 1] >= 1 / fps - 1e-6) bounds.push(b);
  }
  if (bounds[bounds.length - 1] < total - 1e-6) bounds[bounds.length - 1] = total;
  const pieces: RampPiece[] = [];
  for (let k = 0; k < bounds.length - 1; k++) {
    const s0 = sourceAt(bounds[k] / total);
    const s1 = sourceAt(bounds[k + 1] / total);
    const duration = bounds[k + 1] - bounds[k];
    pieces.push({ start: bounds[k], duration, in: sourceIn + s0, speed: clamp((s1 - s0) / duration, 0.1, 16) });
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// Camera moves over a whole clip, as keyframes on its transform.

export const CAMERA_MOVES = ['zoomIn', 'zoomOut', 'panLeft', 'panRight', 'panUp', 'panDown', 'handheld', 'pulse', 'tilt'] as const;
export type CameraMove = (typeof CAMERA_MOVES)[number];

export interface TransformBase {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface MotionResult {
  keyframes: Partial<Record<AnimProp, Keyframe[]>>;
  /** Static values set alongside (e.g. a little zoom so a pan never shows the edge). */
  statics: Partial<TransformBase>;
}

/** Repeatable pseudo-random numbers in -1..1 (the same clip always shakes the same way). */
function wobble(seed: number): number {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

export function cameraMove(move: CameraMove, duration: number, base: TransformBase, frame: { w: number; h: number }, strength = 1): MotionResult {
  const d = Math.max(0.05, duration);
  const k = clamp(strength, 0.2, 3);
  const line = (v0: number, v1: number): Keyframe[] => [
    { t: 0, v: v0, ease: 'easeInOut' },
    { t: d, v: v1, ease: 'linear' },
  ];
  // A pan needs the picture a bit larger than the frame so its edges stay out of view.
  const zoom = 1 + 0.16 * k;
  const panX = ((zoom - 1) / 2) * frame.w * 0.9;
  const panY = ((zoom - 1) / 2) * frame.h * 0.9;
  switch (move) {
    case 'zoomIn':
      return { keyframes: { scale: line(base.scale, base.scale * (1 + 0.22 * k)) }, statics: {} };
    case 'zoomOut':
      return { keyframes: { scale: line(base.scale * (1 + 0.22 * k), base.scale) }, statics: {} };
    case 'panLeft':
      return { keyframes: { x: line(base.x + panX, base.x - panX) }, statics: { scale: base.scale * zoom } };
    case 'panRight':
      return { keyframes: { x: line(base.x - panX, base.x + panX) }, statics: { scale: base.scale * zoom } };
    case 'panUp':
      return { keyframes: { y: line(base.y + panY, base.y - panY) }, statics: { scale: base.scale * zoom } };
    case 'panDown':
      return { keyframes: { y: line(base.y - panY, base.y + panY) }, statics: { scale: base.scale * zoom } };
    case 'handheld': {
      // A slow, slightly uneven drift, like a camera held in hand.
      const step = 0.45;
      const xs: Keyframe[] = [];
      const ys: Keyframe[] = [];
      const rs: Keyframe[] = [];
      const ax = frame.w * 0.006 * k;
      const ay = frame.h * 0.006 * k;
      const n = Math.max(1, Math.ceil(d / step));
      for (let i = 0; i <= n; i++) {
        const t = Math.min(d, i * step);
        xs.push({ t, v: base.x + wobble(i + 1) * ax, ease: 'easeInOut' });
        ys.push({ t, v: base.y + wobble(i + 101) * ay, ease: 'easeInOut' });
        rs.push({ t, v: base.rotation + wobble(i + 201) * 0.5 * k, ease: 'easeInOut' });
      }
      return { keyframes: { x: xs, y: ys, rotation: rs }, statics: { scale: base.scale * (1 + 0.04 * k) } };
    }
    case 'pulse': {
      // Breathing zoom, about two beats a second.
      const ks: Keyframe[] = [];
      const half = 0.25;
      for (let i = 0; i * half <= d + 1e-6; i++) ks.push({ t: Math.min(d, i * half), v: base.scale * (i % 2 ? 1 + 0.05 * k : 1), ease: 'easeInOut' });
      return { keyframes: { scale: ks }, statics: {} };
    }
    case 'tilt':
      return {
        keyframes: { rotation: line(base.rotation - 2 * k, base.rotation + 2 * k) },
        statics: { scale: base.scale * (1 + 0.1 * k) },
      };
  }
}

// ---------------------------------------------------------------------------
// Effects on the beat: a short move at every beat, as keyframes.

export const BEAT_FX = ['punch', 'shake', 'swing', 'blink'] as const;
export type BeatFx = (typeof BEAT_FX)[number];

/**
 * Keyframes for an effect at each beat (clip-local seconds, sorted). Between
 * beats the property rests at its base value; each hit snaps in on the beat.
 */
export function beatKeyframes(fx: BeatFx, beats: number[], duration: number, base: TransformBase & { opacity: number }, frame: { w: number; h: number }, strength = 1): Partial<Record<AnimProp, Keyframe[]>> {
  const k = clamp(strength, 0.2, 3);
  const hits = beats.filter((b) => b >= 0 && b < duration - 0.02);
  const out: Partial<Record<AnimProp, Keyframe[]>> = {};
  const track = (prop: AnimProp, rest: number, shape: (i: number) => { dt: number; v: number }[]) => {
    const ks: Keyframe[] = [{ t: 0, v: rest, ease: 'hold' }];
    hits.forEach((b, i) => {
      const room = Math.min((hits[i + 1] ?? duration) - b, duration - b);
      const pts = shape(i);
      const span = pts[pts.length - 1].dt;
      const fit = Math.min(1, (room * 0.85) / span);
      // Hold the rest value up to the beat, then the hit.
      if (b > ks[ks.length - 1].t + 1e-4) ks.push({ t: b, v: rest, ease: 'hold' });
      else ks[ks.length - 1] = { t: ks[ks.length - 1].t, v: rest, ease: 'hold' };
      pts.forEach((pt, j) => ks.push({ t: b + 1e-3 + pt.dt * fit, v: pt.v, ease: j === pts.length - 1 ? 'hold' : 'easeOut' }));
    });
    out[prop] = ks;
  };
  switch (fx) {
    case 'punch': {
      const peak = base.scale * (1 + 0.12 * k);
      track('scale', base.scale, () => [
        { dt: 0, v: peak },
        { dt: 0.28, v: base.scale },
      ]);
      break;
    }
    case 'shake': {
      const ax = frame.w * 0.018 * k;
      const ay = frame.h * 0.012 * k;
      const shape = (a: number, phase: number) => () => [
        { dt: 0, v: a * phase },
        { dt: 0.04, v: -a * phase * 0.8 },
        { dt: 0.08, v: a * phase * 0.5 },
        { dt: 0.12, v: -a * phase * 0.25 },
        { dt: 0.17, v: 0 },
      ];
      const off = (rest: number, shapeFn: () => { dt: number; v: number }[]) => () => shapeFn().map((p) => ({ dt: p.dt, v: rest + p.v }));
      track('x', base.x, off(base.x, shape(ax, 1)));
      track('y', base.y, off(base.y, shape(ay, -1)));
      break;
    }
    case 'swing':
      track('rotation', base.rotation, (i) => [
        { dt: 0, v: base.rotation + (i % 2 ? -1 : 1) * 4 * k },
        { dt: 0.3, v: base.rotation },
      ]);
      break;
    case 'blink':
      track('opacity', base.opacity, () => [
        { dt: 0, v: base.opacity * clamp(1 - 0.8 * k, 0, 1) },
        { dt: 0.14, v: base.opacity },
      ]);
      break;
  }
  return out;
}

/** Every n-th beat (n = 1, 2 or 4). */
export function everyNth(beats: number[], n: number): number[] {
  return beats.filter((_, i) => i % Math.max(1, n) === 0);
}
