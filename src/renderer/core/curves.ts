// Tone curves and HSL bands: pure helpers shared by the UI and the renderer.
import type { CurvePoint, Curves, HslAdjust, HslBand } from './types';

export const CURVE_CHANNELS = ['master', 'r', 'g', 'b'] as const;
export type CurveChannel = (typeof CURVE_CHANNELS)[number];

export const HSL_BANDS: HslBand[] = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
/** Band centres in degrees (also used by the shader). */
export const HSL_HUES = [0, 30, 60, 120, 180, 240, 270, 300];
export const HSL_SWATCH: Record<HslBand, string> = {
  red: '#ff4040',
  orange: '#ff9a2e',
  yellow: '#ffe14d',
  green: '#3ddc5f',
  aqua: '#2fd8d8',
  blue: '#3d7bff',
  purple: '#9b5cff',
  magenta: '#ff4fd0',
};

export function identityCurve(): CurvePoint[] {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];
}

export function defaultCurves(): Curves {
  return { master: identityCurve(), r: identityCurve(), g: identityCurve(), b: identityCurve() };
}

export function defaultHsl(): HslAdjust {
  return Object.fromEntries(HSL_BANDS.map((b) => [b, { h: 0, s: 0, l: 0 }])) as HslAdjust;
}

export function isIdentityCurve(pts: CurvePoint[]): boolean {
  return pts.every((p) => Math.abs(p.x - p.y) < 1e-4);
}

export function curvesActive(c: Curves | null): c is Curves {
  return !!c && CURVE_CHANNELS.some((ch) => !isIdentityCurve(c[ch]));
}

export function hslActive(h: HslAdjust | null): h is HslAdjust {
  return !!h && HSL_BANDS.some((b) => h[b].h || h[b].s || h[b].l);
}

/**
 * Monotone cubic (Fritsch–Carlson) through the points: smooth, and it never
 * overshoots between points, so a curve can't fold back on itself.
 */
export function curveFunction(points: CurvePoint[]): (x: number) => number {
  const p = [...points].sort((a, b) => a.x - b.x);
  const n = p.length;
  if (n < 2) return (x) => x;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(Math.max(1e-6, p[i + 1].x - p[i].x));
    m.push((p[i + 1].y - p[i].y) / dx[i]);
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  return (x: number) => {
    if (x <= p[0].x) return p[0].y;
    if (x >= p[n - 1].x) return p[n - 1].y;
    let i = 0;
    while (i < n - 2 && x > p[i + 1].x) i++;
    const h = dx[i];
    const s = (x - p[i].x) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * p[i].y + (s3 - 2 * s2 + s) * h * t[i] + (-2 * s3 + 3 * s2) * p[i + 1].y + (s3 - s2) * h * t[i + 1];
  };
}

const tableCache = new Map<string, Uint8Array>();

/** 256×1 RGBA table: master then the channel curve, per channel. */
export function curvesTable(c: Curves): { key: string; data: Uint8Array } {
  const key = JSON.stringify(c);
  let data = tableCache.get(key);
  if (!data) {
    const master = curveFunction(c.master);
    const ch = [curveFunction(c.r), curveFunction(c.g), curveFunction(c.b)];
    data = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const v = Math.min(1, Math.max(0, master(i / 255)));
      for (let k = 0; k < 3; k++) data[i * 4 + k] = Math.round(Math.min(1, Math.max(0, ch[k](v))) * 255);
      data[i * 4 + 3] = 255;
    }
    if (tableCache.size > 64) tableCache.clear();
    tableCache.set(key, data);
  }
  return { key, data };
}

/** Uniform vector for the shader: per band hue, saturation, lightness in -1..1. */
export function hslVector(h: HslAdjust): Float32Array {
  const out = new Float32Array(HSL_BANDS.length * 3);
  HSL_BANDS.forEach((b, i) => {
    out[i * 3] = h[b].h / 100;
    out[i * 3 + 1] = h[b].s / 100;
    out[i * 3 + 2] = h[b].l / 100;
  });
  return out;
}
