// Per-frame layer modifiers produced by in/out animations and transitions.
// They are applied on top of a clip's own transform.

export type MaskKind = 'linear' | 'circle' | 'clock';

/**
 * Screen-space reveal mask, in normalised frame coordinates (0..1, origin top-left).
 * linear: visible where dot(pos, dir) <= offset
 * circle: visible inside radius around centre (aspect corrected)
 * clock:  visible where the clockwise angle from 12 o'clock < progress
 */
export interface Mask {
  kind: MaskKind;
  dirX: number;
  dirY: number;
  offset: number;
  cx: number;
  cy: number;
  radius: number;
  progress: number;
  feather: number;
}

export interface Modifier {
  /** Offset as a fraction of frame width/height. */
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  opacity: number;
  /** Extra blur, 0..100 like Adjust.blur. */
  blur: number;
  /** Mix towards a solid colour: [r, g, b, amount], 0..1. */
  fade: [number, number, number, number] | null;
  mask: Mask | null;
  /** Fraction of text characters revealed. */
  reveal: number;
}

export function identity(): Modifier {
  return { dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1, blur: 0, fade: null, mask: null, reveal: 1 };
}

export function combine(a: Modifier, b: Modifier): Modifier {
  let fade = a.fade;
  if (b.fade && (!fade || b.fade[3] > fade[3])) fade = b.fade;
  return {
    dx: a.dx + b.dx,
    dy: a.dy + b.dy,
    scale: a.scale * b.scale,
    rotation: a.rotation + b.rotation,
    opacity: a.opacity * b.opacity,
    blur: a.blur + b.blur,
    fade,
    mask: b.mask ?? a.mask,
    reveal: Math.min(a.reveal, b.reveal),
  };
}

function emptyMask(kind: MaskKind): Mask {
  return { kind, dirX: 0, dirY: 0, offset: 0, cx: 0.5, cy: 0.5, radius: 0, progress: 0, feather: 0.02 };
}

/** A wipe whose edge travels along `dir` as p goes 0 -> 1. */
export function linearWipe(dirX: number, dirY: number, p: number, feather = 0.03): Mask {
  const len = Math.hypot(dirX, dirY) || 1;
  const dx = dirX / len;
  const dy = dirY / len;
  const lo = Math.min(0, dx) + Math.min(0, dy);
  const hi = Math.max(0, dx) + Math.max(0, dy);
  const m = emptyMask('linear');
  m.dirX = dx;
  m.dirY = dy;
  m.feather = feather;
  m.offset = lo - feather + (hi - lo + 2 * feather) * p;
  return m;
}

export function circleWipe(p: number, aspect: number, feather = 0.02): Mask {
  const m = emptyMask('circle');
  const maxR = Math.hypot(0.5 * aspect, 0.5) + feather;
  m.radius = maxR * p;
  m.feather = feather;
  return m;
}

export function clockWipe(p: number, feather = 0.01): Mask {
  const m = emptyMask('clock');
  m.progress = p;
  m.feather = feather;
  return m;
}
