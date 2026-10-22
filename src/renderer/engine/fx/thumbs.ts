// Thumbnails for effect, transition and filter cards: the real shader or
// colour preset applied to sample photos, so mods get previews for free.
import { effectiveAdjust } from '../../core/effects';
import { createProject, makeClip, makeTrack } from '../../core/project';
import type { Clip } from '../../core/types';
import { buildItems } from '../items';
import { loadLut } from '../lut';
import type { LayerPlan } from '../../core/scene';
import { Compositor, hexToRgb, type DrawItem } from '../gl';
import { loadSample, sampleIfLoaded, type SampleId } from '../samples';
import { paramValues } from './registry';
import type { FxDef } from './types';

const W = 256;
const H = 144;
const cache = new Map<string, string>();
let comp: Compositor | null = null;

function compositor(): Compositor {
  if (!comp) {
    comp = new Compositor(document.createElement('canvas'), { preserve: true });
    comp.resize(W, H);
  }
  return comp;
}

function plan(id: string, localTime: number): LayerPlan {
  return {
    clip: makeClip('image', { id }),
    track: makeTrack('video', 'T'),
    localTime,
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

function item(sample: SampleId, img: HTMLImageElement, p: LayerPlan, extra: Partial<DrawItem> = {}): DrawItem {
  return {
    plan: p,
    content: { w: W, h: H },
    source: { key: `sample:${sample}`, kind: 'element', el: img, width: img.naturalWidth, height: img.naturalHeight, version: 1 },
    adjust: p.clip.adjust,
    wheels: null,
    colorize: null,
    chroma: p.clip.chroma,
    blend: 'normal',
    effects: [],
    lut: null,
    curves: null,
    hsl: null,
    time: p.localTime,
    ...extra,
  };
}

/** Draws one frame of an effect (t = seconds) or transition (t = progress 0..1). Needs the samples loaded. */
function drawFx(def: FxDef, t: number): HTMLCanvasElement | null {
  const a = sampleIfLoaded('mountain');
  const b = sampleIfLoaded('street');
  if (!a || !b) return null;
  const c = compositor();
  let items: DrawItem[];
  if (def.kind === 'generator') {
    const colors = def.colors ?? ['#ffffff', '#ffffff'];
    const p = plan('thumb-gen', t);
    const genItem: DrawItem = {
      ...item('mountain', a, p),
      source: {
        key: `gen:${def.id}`,
        kind: 'generator',
        width: W,
        height: H,
        version: 0,
        gen: { def, params: paramValues(def, undefined), colorA: hexToRgb(colors[0]), colorB: hexToRgb(colors[1]) },
      },
      blend: (def.blend as DrawItem['blend']) ?? 'normal',
    };
    // Overlays are shown over a photo, backgrounds on their own.
    items = def.category === 'background' ? [genItem] : [item('mountain', a, plan('photo', 0)), genItem];
  } else if (def.kind === 'effect') {
    items = [item('mountain', a, plan('fx', t), { effects: [{ def, params: paramValues(def, undefined) }] })];
  } else {
    const group = { key: 'g', type: def.id, progress: t, params: undefined };
    items = [
      item('mountain', a, { ...plan('a', 0.5), group: { ...group, role: 'from' as const } }),
      item('street', b, { ...plan('b', 0.5), group: { ...group, role: 'to' as const } }),
    ];
  }
  c.render(items, { width: W, height: H, background: '#000000' });
  return c.canvas;
}

async function samplesReady(): Promise<boolean> {
  try {
    await Promise.all([loadSample('mountain'), loadSample('street')]);
    return true;
  } catch {
    return false;
  }
}

/** JPEG data URL of the definition applied to the sample photos (null if it cannot render). */
export async function fxThumbnail(def: FxDef): Promise<string | null> {
  const key = `${def.id}:${def.glsl}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (!(await samplesReady())) return null;
  try {
    const canvas = drawFx(def, def.kind === 'transition' ? 0.5 : def.kind === 'generator' ? 2.2 : 0.6);
    if (!canvas) return null;
    const url = canvas.toDataURL('image/jpeg', 0.86);
    cache.set(key, url);
    return url;
  } catch (e) {
    console.warn('Thumbnail failed', def.id, e);
    return null;
  }
}

/** Live frame for hover animation; draws into `target`. */
export function drawFxFrame(def: FxDef, t: number, target: CanvasRenderingContext2D): boolean {
  try {
    const canvas = drawFx(def, t);
    if (!canvas) return false;
    target.drawImage(canvas, 0, 0, target.canvas.width, target.canvas.height);
    return true;
  } catch {
    return false;
  }
}

/** A colour preset applied to the street photo. */
export async function filterThumbnail(filterId: string): Promise<string | null> {
  const key = `filter:${filterId}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const img = await loadSample('street');
    const p = plan('filter', 0);
    p.clip.filter = { id: filterId, amount: 100 };
    const { adjust, colorize } = effectiveAdjust(p.clip);
    const c = compositor();
    c.render([item('street', img, p, { adjust, colorize })], { width: W, height: H, background: '#000000' });
    const url = c.canvas.toDataURL('image/jpeg', 0.86);
    cache.set(key, url);
    return url;
  } catch (e) {
    console.warn('Filter thumbnail failed', filterId, e);
    return null;
  }
}

/**
 * A saved look (colour, curves, LUT and effects of a clip) applied to the
 * street photo through the same item builder as the preview.
 */
export async function lookThumbnail(look: Pick<Clip, 'adjust' | 'wheels' | 'curves' | 'hsl' | 'filter' | 'lut' | 'effects'>): Promise<string | null> {
  const key = `look:${JSON.stringify(look)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const img = await loadSample('street');
    if (look.lut) await loadLut(look.lut.path);
    const p = plan('look', 0.6);
    Object.assign(p.clip, structuredClone(look));
    const project = createProject();
    project.settings = { ...project.settings, width: W, height: H };
    const source = { key: 'sample:street', kind: 'element' as const, el: img, width: img.naturalWidth, height: img.naturalHeight, version: 1 };
    const c = compositor();
    c.render(buildItems(project, [p], new Map(), { source: () => source }, 1, 'thumb:'), { width: W, height: H, background: '#000000' });
    const url = c.canvas.toDataURL('image/jpeg', 0.86);
    cache.set(key, url);
    return url;
  } catch (e) {
    console.warn('Look thumbnail failed', e);
    return null;
  }
}

export const THUMB_SIZE = { w: W, h: H };
