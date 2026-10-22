// Text layer rasteriser (Canvas 2D -> texture source).
import type { TextStyle } from '../core/types';
import type { Size } from '../core/geometry';
import { ensureFont, fontString, fontsVersion } from './fonts';

export interface TextRaster {
  canvas: HTMLCanvasElement;
  /** Raster pixels per project pixel. */
  scale: number;
  key: string;
}

const MAX_RASTER = 4096;

/** Text as drawn (case applied). */
function shown(s: TextStyle): string {
  return s.uppercase ? s.content.toUpperCase() : s.content;
}

function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

interface Layout {
  lines: string[];
  widths: number[];
  textW: number;
  lineH: number;
  bgPad: number;
  margin: number;
  width: number;
  height: number;
}

function layout(ctx: CanvasRenderingContext2D, s: TextStyle, scale: number): Layout {
  ctx.font = fontString(s, scale);
  ctx.letterSpacing = `${s.letterSpacing * scale}px`;
  const lines = shown(s).split('\n');
  const widths = lines.map((l) => ctx.measureText(l).width);
  const textW = Math.max(1, ...widths);
  const lineH = s.fontSize * s.lineHeight * scale;
  const bgPad = s.backgroundOpacity > 0 ? s.backgroundPadding * scale : 0;
  const shadow = s.shadowBlur > 0 || s.shadowX !== 0 || s.shadowY !== 0 ? (s.shadowBlur * 1.5 + Math.max(Math.abs(s.shadowX), Math.abs(s.shadowY))) * scale : 0;
  const margin = Math.ceil(Math.max(bgPad, s.strokeWidth * scale + shadow) + 4 * scale);
  return {
    lines,
    widths,
    textW,
    lineH,
    bgPad,
    margin,
    width: Math.ceil(textW + margin * 2),
    height: Math.ceil(lines.length * lineH + margin * 2),
  };
}

let measureCtx: CanvasRenderingContext2D | null = null;
const sizeCache = new Map<string, Size>();

/** Size of the rendered text box in project pixels (scale 1). */
export function measureText(style: TextStyle): Size {
  ensureFont(style);
  const key = `${fontsVersion()}|${JSON.stringify(style)}`;
  const cached = sizeCache.get(key);
  if (cached) return cached;
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  const l = layout(measureCtx, style, 1);
  const size = { w: l.width, h: l.height };
  if (sizeCache.size > 500) sizeCache.clear();
  sizeCache.set(key, size);
  return size;
}

const rasters = new Map<string, TextRaster>();

/**
 * Rasterises a text clip. `reveal` (0..1) shows only the first part of the text
 * for typewriter animations while keeping the layout stable.
 */
export function rasterizeText(cacheId: string, style: TextStyle, wantedScale: number, reveal: number): TextRaster {
  const box = measureText(style);
  const maxScale = MAX_RASTER / Math.max(1, box.w, box.h);
  const scale = Math.max(0.1, Math.min(maxScale, Math.ceil(wantedScale * 4) / 4));
  const total = style.content.replace(/\n/g, '').length;
  const shownChars = reveal >= 1 ? total : Math.floor(total * Math.max(0, reveal));
  const key = `${fontsVersion()}|${JSON.stringify(style)}|${scale}|${shownChars}`;
  const cached = rasters.get(cacheId);
  if (cached && cached.key === key) return cached;

  const canvas = cached?.canvas ?? document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const l = layout(ctx, style, scale);
  canvas.width = Math.max(1, l.width);
  canvas.height = Math.max(1, l.height);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Canvas resize resets state.
  ctx.font = fontString(style, scale);
  ctx.letterSpacing = `${style.letterSpacing * scale}px`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const textH = l.lines.length * l.lineH;
  if (style.backgroundOpacity > 0) {
    ctx.fillStyle = hexToRgba(style.background, style.backgroundOpacity / 100);
    const bx = l.margin - l.bgPad;
    const by = l.margin - l.bgPad;
    ctx.beginPath();
    ctx.roundRect(bx, by, l.textW + l.bgPad * 2, textH + l.bgPad * 2, style.backgroundRadius * scale);
    ctx.fill();
  }

  let remaining = shownChars;
  const positions = l.lines.map((line, i) => {
    let x = l.margin;
    if (style.align === 'center') x = l.margin + (l.textW - l.widths[i]) / 2;
    else if (style.align === 'right') x = l.margin + l.textW - l.widths[i];
    const visible = line.slice(0, Math.max(0, remaining));
    remaining -= line.length;
    return { text: visible, x, y: l.margin + i * l.lineH + l.lineH / 2 };
  });

  const hasShadow = style.shadowBlur > 0 || style.shadowX !== 0 || style.shadowY !== 0;
  const applyShadow = (on: boolean) => {
    ctx.shadowColor = on ? style.shadowColor : 'transparent';
    ctx.shadowBlur = on ? style.shadowBlur * scale : 0;
    ctx.shadowOffsetX = on ? style.shadowX * scale : 0;
    ctx.shadowOffsetY = on ? style.shadowY * scale : 0;
  };

  if (style.strokeWidth > 0) {
    applyShadow(hasShadow);
    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth = style.strokeWidth * 2 * scale;
    ctx.lineJoin = 'round';
    for (const p of positions) if (p.text) ctx.strokeText(p.text, p.x, p.y);
    applyShadow(false);
  } else {
    applyShadow(hasShadow);
  }
  ctx.fillStyle = style.gradient ? gradientFill(ctx, style, l, textH) : style.color;
  for (const p of positions) if (p.text) ctx.fillText(p.text, p.x, p.y);
  applyShadow(false);

  const raster = { canvas, scale, key };
  rasters.set(cacheId, raster);
  return raster;
}

/** Linear gradient across the text block at the style's angle (0° = bottom to top). */
function gradientFill(ctx: CanvasRenderingContext2D, style: TextStyle, l: Layout, textH: number): CanvasGradient {
  const cx = l.margin + l.textW / 2;
  const cy = l.margin + textH / 2;
  const a = ((style.gradientAngle ?? 90) * Math.PI) / 180;
  // Half the extent of the text block along the gradient direction.
  const r = (Math.abs(Math.sin(a)) * l.textW + Math.abs(Math.cos(a)) * textH) / 2;
  const dx = Math.sin(a) * r;
  const dy = -Math.cos(a) * r;
  const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  g.addColorStop(0, style.color);
  g.addColorStop(1, style.gradientColor ?? style.color);
  return g;
}

export function dropTextRaster(cacheId: string): void {
  rasters.delete(cacheId);
}
