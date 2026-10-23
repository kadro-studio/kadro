// Placeholder picture for template slots that have no file yet: stripes, the
// slot number and its name, at the slot's aspect ratio.
import type { MediaAsset } from '../core/types';
import type { TexSource } from './gl';

const MAX_SIDE = 640;
const cache = new Map<string, HTMLCanvasElement>();

function draw(m: MediaAsset): HTMLCanvasElement {
  const aspect = m.width > 0 && m.height > 0 ? m.width / m.height : 16 / 9;
  const w = Math.round(aspect >= 1 ? MAX_SIDE : MAX_SIDE * aspect);
  const h = Math.round(aspect >= 1 ? MAX_SIDE / aspect : MAX_SIDE);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#2b2d36');
  bg.addColorStop(1, '#1a1b22');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = Math.max(8, w / 40);
  const step = g.lineWidth * 3;
  for (let x = -h; x < w + h; x += step) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + h, h);
    g.stroke();
  }
  const unit = Math.min(w, h);
  const r = unit * 0.16;
  g.fillStyle = 'rgba(255,255,255,0.1)';
  g.beginPath();
  g.arc(w / 2, h / 2 - r * 0.35, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${Math.round(r * 1.1)}px Inter, "Segoe UI", sans-serif`;
  g.fillText(String(m.slot?.index ?? ''), w / 2, h / 2 - r * 0.35);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = `600 ${Math.round(unit * 0.07)}px Inter, "Segoe UI", sans-serif`;
  g.fillText(m.name, w / 2, h / 2 + r * 1.15, w * 0.9);
  return c;
}

export function slotSource(m: MediaAsset): TexSource {
  const key = `${m.id}:${m.width}x${m.height}:${m.slot?.index}:${m.name}`;
  let canvas = cache.get(key);
  if (!canvas) {
    canvas = draw(m);
    cache.set(key, canvas);
  }
  return { key: `slot:${m.id}`, kind: 'element', el: canvas, width: canvas.width, height: canvas.height, version: key };
}
