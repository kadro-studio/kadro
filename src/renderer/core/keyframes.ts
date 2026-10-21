import type { AnimProp, Clip, Ease, Keyframe } from './types';

export const ANIM_PROPS: AnimProp[] = ['x', 'y', 'scale', 'rotation', 'opacity'];

export function applyEase(ease: Ease, p: number): number {
  switch (ease) {
    case 'hold':
      return 0;
    case 'easeIn':
      return p * p * p;
    case 'easeOut':
      return 1 - Math.pow(1 - p, 3);
    case 'easeInOut':
      return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    default:
      return p;
  }
}

export function evalKeyframes(kfs: Keyframe[], t: number): number {
  if (t <= kfs[0].t) return kfs[0].v;
  const last = kfs[kfs.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      const p = span > 0 ? (t - a.t) / span : 1;
      return a.v + (b.v - a.v) * applyEase(a.ease, p);
    }
  }
  return last.v;
}

/** Value of an animatable transform property at clip-local time. */
export function propValue(clip: Clip, prop: AnimProp, localT: number): number {
  const kfs = clip.keyframes[prop];
  if (kfs && kfs.length > 0) return evalKeyframes(kfs, localT);
  return clip.transform[prop];
}

export function isAnimated(clip: Clip, prop: AnimProp): boolean {
  return (clip.keyframes[prop]?.length ?? 0) > 0;
}

export function keyframeAt(clip: Clip, prop: AnimProp, localT: number, tol: number): Keyframe | null {
  return clip.keyframes[prop]?.find((k) => Math.abs(k.t - localT) <= tol) ?? null;
}

/**
 * Sets a property at a clip-local time. Animated properties get a keyframe
 * inserted/updated; static ones simply change. Mutates (use inside immer).
 */
export function setPropAt(clip: Clip, prop: AnimProp, localT: number, value: number, tol: number): void {
  const kfs = clip.keyframes[prop];
  if (!kfs || kfs.length === 0) {
    clip.transform[prop] = value;
    return;
  }
  const existing = kfs.find((k) => Math.abs(k.t - localT) <= tol);
  if (existing) existing.v = value;
  else {
    kfs.push({ t: localT, v: value, ease: 'easeInOut' });
    kfs.sort((a, b) => a.t - b.t);
  }
}

/** Adds a keyframe with the current value, or removes the one at this time. Mutates. */
export function toggleKeyframe(clip: Clip, prop: AnimProp, localT: number, tol: number): void {
  const current = propValue(clip, prop, localT);
  const kfs = clip.keyframes[prop] ?? [];
  const idx = kfs.findIndex((k) => Math.abs(k.t - localT) <= tol);
  if (idx >= 0) {
    kfs.splice(idx, 1);
    if (kfs.length === 0) {
      delete clip.keyframes[prop];
      clip.transform[prop] = current;
      return;
    }
  } else {
    kfs.push({ t: localT, v: current, ease: 'easeInOut' });
    kfs.sort((a, b) => a.t - b.t);
  }
  clip.keyframes[prop] = kfs;
}

export function clearKeyframes(clip: Clip, prop: AnimProp, localT: number): void {
  const v = propValue(clip, prop, localT);
  delete clip.keyframes[prop];
  clip.transform[prop] = v;
}

/** Shifts all keyframes by dt (used when the clip's start is trimmed). Mutates. */
export function shiftKeyframes(clip: Clip, dt: number): void {
  for (const prop of ANIM_PROPS) {
    const kfs = clip.keyframes[prop];
    if (kfs) for (const k of kfs) k.t += dt;
  }
}

/** All keyframe times of a clip (deduplicated, sorted). */
export function keyframeTimes(clip: Clip): number[] {
  const set = new Set<number>();
  for (const prop of ANIM_PROPS) for (const k of clip.keyframes[prop] ?? []) set.add(Math.round(k.t * 1000) / 1000);
  return [...set].sort((a, b) => a - b);
}
