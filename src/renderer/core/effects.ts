import { combine, circleWipe, clockWipe, identity, linearWipe, type Modifier } from './modifiers';
import type { Adjust, Clip } from './types';

// ---------------------------------------------------------------------------
// Colour filter presets ("looks"). A preset adds adjustment values scaled by
// the clip's filter amount, optionally colourising the image.

export interface FilterPreset {
  id: string;
  adjust: Partial<Adjust>;
  colorize?: { color: [number, number, number]; amount: number };
  /** CSS filter approximating the look for the preset thumbnail. */
  swatch: string;
}

export const FILTERS: FilterPreset[] = [
  { id: 'none', adjust: {}, swatch: 'none' },
  { id: 'vivid', adjust: { saturation: 45, contrast: 15 }, swatch: 'saturate(1.7) contrast(1.15)' },
  { id: 'warm', adjust: { temperature: 35, saturation: 8 }, swatch: 'sepia(0.3) saturate(1.3)' },
  { id: 'cool', adjust: { temperature: -35, tint: -5 }, swatch: 'hue-rotate(20deg) saturate(0.9)' },
  { id: 'bw', adjust: { saturation: -100, contrast: 10 }, swatch: 'grayscale(1) contrast(1.1)' },
  { id: 'noir', adjust: { saturation: -100, contrast: 45, exposure: -10, vignette: 45 }, swatch: 'grayscale(1) contrast(1.6) brightness(0.85)' },
  { id: 'sepia', adjust: { contrast: 5 }, colorize: { color: [1.0, 0.78, 0.52], amount: 0.9 }, swatch: 'sepia(1)' },
  { id: 'vintage', adjust: { contrast: -15, saturation: -30, temperature: 25, vignette: 35, shadows: 15 }, swatch: 'sepia(0.45) contrast(0.85) saturate(0.8)' },
  { id: 'cinematic', adjust: { contrast: 25, saturation: -15, temperature: -12, highlights: -15, shadows: -10, vignette: 25 }, swatch: 'contrast(1.25) saturate(0.85) hue-rotate(-8deg)' },
  { id: 'faded', adjust: { contrast: -30, shadows: 30, saturation: -20 }, swatch: 'contrast(0.7) brightness(1.1) saturate(0.8)' },
  { id: 'dramatic', adjust: { contrast: 50, saturation: -25, exposure: -10, vignette: 30 }, swatch: 'contrast(1.5) saturate(0.75) brightness(0.9)' },
  { id: 'sunset', adjust: { temperature: 50, tint: 15, saturation: 20, highlights: 10 }, swatch: 'sepia(0.4) saturate(1.6) hue-rotate(-15deg)' },
  { id: 'neon', adjust: { tint: 40, temperature: -30, saturation: 30, contrast: 20 }, swatch: 'hue-rotate(40deg) saturate(1.8) contrast(1.2)' },
  { id: 'forest', adjust: { tint: -30, saturation: 10, temperature: 5 }, swatch: 'hue-rotate(-25deg) saturate(1.2)' },
  { id: 'dream', adjust: { brightness: 10, contrast: -20, saturation: 10, blur: 3 }, swatch: 'brightness(1.1) contrast(0.8) blur(0.6px)' },
  { id: 'duotone', adjust: { contrast: 20 }, colorize: { color: [0.55, 0.75, 1.0], amount: 0.85 }, swatch: 'grayscale(1) sepia(1) hue-rotate(170deg) saturate(2)' },
];

export const FILTER_MAP = new Map(FILTERS.map((f) => [f.id, f]));

/** Clip adjustment combined with its filter preset. */
export function effectiveAdjust(clip: Clip): { adjust: Adjust; colorize: [number, number, number, number] | null } {
  const preset = FILTER_MAP.get(clip.filter.id);
  if (!preset || preset.id === 'none') return { adjust: clip.adjust, colorize: null };
  const k = clip.filter.amount / 100;
  const adjust = { ...clip.adjust };
  for (const [key, v] of Object.entries(preset.adjust) as [keyof Adjust, number][]) {
    adjust[key] = adjust[key] + v * k;
  }
  const colorize = preset.colorize ? ([...preset.colorize.color, preset.colorize.amount * k] as [number, number, number, number]) : null;
  return { adjust, colorize };
}

// ---------------------------------------------------------------------------
// In/out animations. `p` goes 0 (hidden) -> 1 (fully shown).

export const ANIMATIONS = [
  'none', 'fade', 'slideLeft', 'slideRight', 'slideUp', 'slideDown',
  'zoomIn', 'zoomOut', 'pop', 'spin', 'blur', 'drop', 'typewriter',
] as const;
export type AnimationType = (typeof ANIMATIONS)[number];

const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const backOut = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};
const bounceOut = (p: number) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (p < 1 / d1) return n1 * p * p;
  if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75;
  if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375;
  return n1 * (p -= 2.625 / d1) * p + 0.984375;
};

export function animationModifier(type: string, rawP: number): Modifier {
  const m = identity();
  const p = Math.min(1, Math.max(0, rawP));
  const e = easeOutCubic(p);
  switch (type) {
    case 'fade':
      m.opacity = e;
      break;
    case 'slideLeft':
      m.dx = -(1 - e) * 0.3;
      m.opacity = Math.min(1, p * 2);
      break;
    case 'slideRight':
      m.dx = (1 - e) * 0.3;
      m.opacity = Math.min(1, p * 2);
      break;
    case 'slideUp':
      m.dy = (1 - e) * 0.3;
      m.opacity = Math.min(1, p * 2);
      break;
    case 'slideDown':
      m.dy = -(1 - e) * 0.3;
      m.opacity = Math.min(1, p * 2);
      break;
    case 'zoomIn':
      m.scale = 0.4 + 0.6 * e;
      m.opacity = e;
      break;
    case 'zoomOut':
      m.scale = 1.6 - 0.6 * e;
      m.opacity = e;
      break;
    case 'pop':
      m.scale = Math.max(0.001, backOut(p));
      m.opacity = Math.min(1, p * 3);
      break;
    case 'spin':
      m.rotation = -(1 - e) * 180;
      m.scale = Math.max(0.001, e);
      m.opacity = e;
      break;
    case 'blur':
      m.blur = (1 - e) * 60;
      m.opacity = e;
      break;
    case 'drop':
      m.dy = -(1 - bounceOut(p)) * 0.5;
      m.opacity = Math.min(1, p * 4);
      break;
    case 'typewriter':
      m.reveal = p;
      break;
  }
  return m;
}

/** Combined in/out animation modifier at clip-local time. */
export function clipAnimModifier(clip: Clip, local: number): Modifier {
  let m = identity();
  const dIn = Math.min(clip.animIn.duration, clip.duration);
  if (clip.animIn.type !== 'none' && dIn > 0 && local < dIn) {
    m = combine(m, animationModifier(clip.animIn.type, local / dIn));
  }
  const dOut = Math.min(clip.animOut.duration, clip.duration);
  const remaining = clip.duration - local;
  if (clip.animOut.type !== 'none' && dOut > 0 && remaining < dOut) {
    m = combine(m, animationModifier(clip.animOut.type, Math.max(0, remaining) / dOut));
  }
  return m;
}

// ---------------------------------------------------------------------------
// Transitions between the previous clip on a track (A) and this clip (B).

export const TRANSITIONS = [
  'none', 'dissolve', 'fadeBlack', 'fadeWhite',
  'wipeRight', 'wipeLeft', 'wipeDown', 'wipeUp', 'wipeDiagonal',
  'slideLeft', 'slideRight', 'slideUp', 'slideDown',
  'pushLeft', 'pushRight', 'pushUp', 'pushDown',
  'zoomIn', 'zoomOut', 'iris', 'clock', 'blur', 'spin',
] as const;
export type TransitionType = (typeof TRANSITIONS)[number];

export function transitionModifiers(type: string, rawP: number, aspect: number): { a: Modifier; b: Modifier } {
  const a = identity();
  const b = identity();
  const p = Math.min(1, Math.max(0, rawP));
  const e = easeInOut(p);
  switch (type) {
    case 'dissolve':
      b.opacity = p;
      break;
    case 'fadeBlack':
    case 'fadeWhite': {
      const c = type === 'fadeBlack' ? 0 : 1;
      if (p < 0.5) {
        a.fade = [c, c, c, p * 2];
        b.opacity = 0;
      } else {
        a.opacity = 0;
        b.fade = [c, c, c, (1 - p) * 2];
      }
      break;
    }
    case 'wipeRight':
      b.mask = linearWipe(1, 0, e);
      break;
    case 'wipeLeft':
      b.mask = linearWipe(-1, 0, e);
      break;
    case 'wipeDown':
      b.mask = linearWipe(0, 1, e);
      break;
    case 'wipeUp':
      b.mask = linearWipe(0, -1, e);
      break;
    case 'wipeDiagonal':
      b.mask = linearWipe(1, 1, e);
      break;
    case 'slideLeft':
      b.dx = 1 - e;
      break;
    case 'slideRight':
      b.dx = -(1 - e);
      break;
    case 'slideUp':
      b.dy = 1 - e;
      break;
    case 'slideDown':
      b.dy = -(1 - e);
      break;
    case 'pushLeft':
      a.dx = -e;
      b.dx = 1 - e;
      break;
    case 'pushRight':
      a.dx = e;
      b.dx = -(1 - e);
      break;
    case 'pushUp':
      a.dy = -e;
      b.dy = 1 - e;
      break;
    case 'pushDown':
      a.dy = e;
      b.dy = -(1 - e);
      break;
    case 'zoomIn':
      a.scale = 1 + e;
      a.opacity = 1 - e;
      b.scale = 0.8 + 0.2 * e;
      b.opacity = e;
      break;
    case 'zoomOut':
      a.scale = 1 - 0.3 * e;
      b.scale = 1.4 - 0.4 * e;
      b.opacity = e;
      break;
    case 'iris':
      b.mask = circleWipe(e, aspect);
      break;
    case 'clock':
      b.mask = clockWipe(p);
      break;
    case 'blur':
      a.blur = e * 60;
      b.blur = (1 - e) * 60;
      b.opacity = e;
      break;
    case 'spin':
      b.rotation = (1 - e) * -120;
      b.scale = Math.max(0.001, e);
      b.opacity = Math.min(1, p * 2);
      break;
  }
  return { a, b };
}
