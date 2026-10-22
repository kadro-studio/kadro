// Live thumbnails for effect/transition cards: the real shader applied to a
// small test scene, so mods get previews for free.
import { makeClip, makeTrack } from '../../core/project';
import type { LayerPlan } from '../../core/scene';
import { Compositor, type DrawItem } from '../gl';
import { paramValues } from './registry';
import type { FxDef } from './types';

const W = 192;
const H = 108;
const cache = new Map<string, string>();
let comp: Compositor | null = null;
const scenes: HTMLCanvasElement[] = [];

function scene(variant: number): HTMLCanvasElement {
  if (scenes[variant]) return scenes[variant];
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  if (variant === 0) {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#3d7bd9');
    sky.addColorStop(0.55, '#8ec5ff');
    sky.addColorStop(0.551, '#3f8f4a');
    sky.addColorStop(1, '#2f6e3a');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffd27a';
    g.beginPath();
    g.arc(W * 0.72, H * 0.3, 13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8e8e8';
    g.fillRect(W * 0.18, H * 0.38, 34, 24);
    g.fillStyle = '#c0392b';
    g.beginPath();
    g.moveTo(W * 0.18 - 4, H * 0.38);
    g.lineTo(W * 0.18 + 17, H * 0.22);
    g.lineTo(W * 0.18 + 38, H * 0.38);
    g.fill();
  } else {
    const night = g.createLinearGradient(0, 0, 0, H);
    night.addColorStop(0, '#120a2e');
    night.addColorStop(1, '#3b1d5e');
    g.fillStyle = night;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) {
      const bw = 14 + ((i * 7) % 10);
      const bh = 30 + ((i * 23) % 50);
      const x = i * 22;
      g.fillStyle = '#1d1838';
      g.fillRect(x, H - bh, bw, bh);
      g.fillStyle = '#ffcf5a';
      for (let y = H - bh + 5; y < H - 4; y += 8) for (let wx = x + 3; wx < x + bw - 3; wx += 6) if ((wx + y + i) % 3) g.fillRect(wx, y, 2, 3);
    }
  }
  scenes[variant] = c;
  return c;
}

function plan(id: string): LayerPlan {
  const clip = makeClip('image', { id });
  return {
    clip,
    track: makeTrack('video', 'T'),
    localTime: 0.6,
    sourceTime: 0,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    blur: 0,
    fade: null,
    mask: null,
    reveal: 1,
    tail: false,
    group: null,
  };
}

function item(variant: number, p: LayerPlan, effects: DrawItem['effects']): DrawItem {
  const clip = p.clip;
  return {
    plan: p,
    content: { w: W, h: H },
    source: { key: `thumb${variant}`, kind: 'element', el: scene(variant), width: W, height: H, version: 1 },
    adjust: clip.adjust,
    wheels: null,
    colorize: null,
    chroma: clip.chroma,
    blend: 'normal',
    effects,
    lut: null,
    time: p.localTime,
  };
}

/** JPEG data URL of the definition applied to the test scene (null if it cannot render). */
export function fxThumbnail(def: FxDef): string | null {
  const key = `${def.id}:${def.glsl}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    if (!comp) {
      const canvas = document.createElement('canvas');
      comp = new Compositor(canvas, { preserve: true });
      comp.resize(W, H);
    }
    let items: DrawItem[];
    if (def.kind === 'effect') {
      items = [item(0, plan('fx'), [{ def, params: paramValues(def, undefined) }])];
    } else {
      const group = { key: 'g', type: def.id, progress: 0.5, params: undefined };
      const a = { ...plan('a'), group: { ...group, role: 'from' as const } };
      const b = { ...plan('b'), group: { ...group, role: 'to' as const } };
      items = [item(0, a, []), item(1, b, [])];
    }
    comp.render(items, { width: W, height: H, background: '#000000' });
    const url = comp.canvas.toDataURL('image/jpeg', 0.85);
    cache.set(key, url);
    return url;
  } catch (e) {
    console.warn('Thumbnail failed', def.id, e);
    return null;
  }
}
