// Vector shape layers (rectangles, ellipses, arrows...) rasterised with Canvas 2D.
import type { ShapeStyle } from '../core/types';
import type { Size } from '../core/geometry';

export interface ShapeRaster {
  canvas: HTMLCanvasElement;
  /** Raster pixels per project pixel. */
  scale: number;
  key: string;
}

const MAX_RASTER = 4096;
const rasters = new Map<string, ShapeRaster>();

function rgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Outer size in project pixels (shape plus stroke). */
export function shapeSize(s: ShapeStyle): Size {
  const pad = Math.ceil(s.strokeWidth) + 2;
  return { w: Math.max(1, s.width) + pad * 2, h: Math.max(1, s.height) + pad * 2 };
}

function tracePath(g: CanvasRenderingContext2D, s: ShapeStyle, x: number, y: number, w: number, h: number, k: number): void {
  g.beginPath();
  const r = Math.min(s.radius * k, w / 2, h / 2);
  switch (s.kind) {
    case 'ellipse':
      g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'triangle':
      g.moveTo(x + w / 2, y);
      g.lineTo(x + w, y + h);
      g.lineTo(x, y + h);
      g.closePath();
      break;
    case 'star': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const f = i % 2 === 0 ? 1 : 0.42;
        const px = cx + Math.cos(a) * (w / 2) * f;
        const py = cy + Math.sin(a) * (h / 2) * f + h * 0.04;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      break;
    }
    case 'arrow': {
      const head = Math.min(w * 0.4, h);
      const shaft = h * 0.36;
      const cy = y + h / 2;
      g.moveTo(x, cy - shaft / 2);
      g.lineTo(x + w - head, cy - shaft / 2);
      g.lineTo(x + w - head, y);
      g.lineTo(x + w, cy);
      g.lineTo(x + w - head, y + h);
      g.lineTo(x + w - head, cy + shaft / 2);
      g.lineTo(x, cy + shaft / 2);
      g.closePath();
      break;
    }
    case 'line':
      g.roundRect(x, y, w, h, h / 2);
      break;
    case 'bubble': {
      const body = h * 0.8;
      g.roundRect(x, y, w, body, r);
      g.moveTo(x + w * 0.18, y + body - 1);
      g.lineTo(x + w * 0.12, y + h);
      g.lineTo(x + w * 0.34, y + body - 1);
      g.closePath();
      break;
    }
    default:
      g.roundRect(x, y, w, h, r);
  }
}

export function rasterizeShape(cacheId: string, s: ShapeStyle, wantedScale: number): ShapeRaster {
  const size = shapeSize(s);
  const scale = Math.max(0.1, Math.min(MAX_RASTER / Math.max(size.w, size.h), Math.ceil(wantedScale * 4) / 4));
  const key = `${JSON.stringify(s)}|${scale}`;
  const cached = rasters.get(cacheId);
  if (cached && cached.key === key) return cached;
  const canvas = cached?.canvas ?? document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(size.w * scale));
  canvas.height = Math.max(1, Math.ceil(size.h * scale));
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, canvas.width, canvas.height);
  const pad = ((size.w - s.width) / 2) * scale;
  tracePath(g, s, pad, pad, s.width * scale, s.height * scale, scale);
  if (s.fillOpacity > 0) {
    g.fillStyle = rgba(s.fill, s.fillOpacity / 100);
    g.fill();
  }
  if (s.strokeWidth > 0) {
    g.strokeStyle = s.stroke;
    g.lineWidth = s.strokeWidth * scale;
    g.lineJoin = 'round';
    g.stroke();
  }
  const raster = { canvas, scale, key };
  rasters.set(cacheId, raster);
  return raster;
}
