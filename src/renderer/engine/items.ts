// Turns resolved layer plans into compositor draw items, given a source provider
// (live media elements for preview, decoded frames for export).
import { curvesActive, curvesTable, hslActive, hslVector } from '../core/curves';
import { effectiveAdjust } from '../core/effects';
import { contentSize } from '../core/geometry';
import type { LayerPlan } from '../core/scene';
import type { ChromaKey, ClipEffect, ClipLut, ColorWheels, MediaAsset, Project, Wheel } from '../core/types';
import type { FxDef } from './fx/types';
import { getLut } from './lut';
import { hexToRgb, type DrawItem, type TexSource } from './gl';
import { getFx, paramValues } from './fx/registry';
import { rasterizeText } from './text';
import { rasterizeShape } from './shape';

export interface SourceProvider {
  source(plan: LayerPlan, media: MediaAsset | undefined): TexSource | null;
}

export function buildItems(
  project: Project,
  plans: LayerPlan[],
  media: Map<string, MediaAsset>,
  provider: SourceProvider,
  renderScale: number,
  textCachePrefix = '',
): DrawItem[] {
  const { width: W, height: H } = project.settings;
  const items: DrawItem[] = [];
  for (let plan of plans) {
    const clip = plan.clip;
    let source: TexSource | null = null;
    let content = { w: W, h: H };
    if (clip.type === 'text' && clip.text) {
      const raster = rasterizeText(textCachePrefix + clip.id, clip.text, renderScale * Math.max(1, Math.abs(plan.scale)), plan.reveal);
      content = { w: raster.canvas.width / raster.scale, h: raster.canvas.height / raster.scale };
      source = {
        key: `t:${clip.id}`,
        kind: 'element',
        el: raster.canvas,
        width: raster.canvas.width,
        height: raster.canvas.height,
        version: raster.key,
      };
    } else if (clip.type === 'shape' && clip.shape) {
      const raster = rasterizeShape(textCachePrefix + clip.id, clip.shape, renderScale * Math.max(1, Math.abs(plan.scale)));
      content = { w: raster.canvas.width / raster.scale, h: raster.canvas.height / raster.scale };
      source = { key: `s:${clip.id}`, kind: 'element', el: raster.canvas, width: raster.canvas.width, height: raster.canvas.height, version: raster.key };
    } else if (clip.type === 'adjustment') {
      // Covers the frame and processes what is already drawn under it.
      source = { key: `adj:${clip.id}`, kind: 'adjust', width: W, height: H, version: 0 };
      plan = { ...plan, x: 0, y: 0, scale: 1, rotation: 0 };
    } else if (clip.type === 'overlay' && clip.overlay) {
      const def = getFx(clip.overlay.id);
      if (!def || def.kind !== 'generator') continue;
      // Drawn at output resolution, then placed like any full-frame layer.
      source = {
        key: `g:${clip.id}`,
        kind: 'generator',
        width: Math.max(2, Math.round(W * renderScale)),
        height: Math.max(2, Math.round(H * renderScale)),
        version: 0,
        gen: { def, params: paramValues(def, clip.overlay.params), colorA: hexToRgb(clip.overlay.colorA), colorB: hexToRgb(clip.overlay.colorB) },
      };
    } else if (clip.type === 'color') {
      source = { key: 'solid', kind: 'color', width: W, height: H, version: 0, color: [...hexToRgb(clip.color), 1] };
    } else {
      const m = clip.mediaId ? media.get(clip.mediaId) : undefined;
      source = provider.source(plan, m);
      content = contentSize(clip, m, W, H);
    }
    if (!source) continue;
    const { adjust, colorize } = effectiveAdjust(clip);
    let effects = source.kind === 'color' ? [] : resolveEffects(clip.effects);
    let chroma = clip.chroma;
    // The key must see the original colours: with effects present it runs as the first pass.
    if (chroma.enabled && effects.length > 0) {
      effects = [{ def: CHROMA_PASS, params: chromaParams(chroma) }, ...effects];
      chroma = { ...chroma, enabled: false };
    }
    items.push({
      plan,
      content,
      source,
      adjust,
      wheels: wheelVectors(clip.wheels),
      colorize,
      chroma,
      blend: clip.blend,
      effects,
      lut: resolveLut(clip.lut),
      curves: curvesActive(clip.curves) ? curvesTable(clip.curves) : null,
      hsl: hslActive(clip.hsl) ? hslVector(clip.hsl) : null,
      time: plan.localTime,
    });
  }
  return items;
}

const CHROMA_PASS: FxDef = {
  id: 'internal.chroma',
  kind: 'effect',
  name: 'Chroma key',
  source: 'builtin',
  params: ['kr', 'kg', 'kb', 'similarity', 'smoothness', 'spill'].map((id) => ({ id, name: id, min: 0, max: 1, default: 0 })),
  glsl: `
vec2 cbcr(vec3 c) {
  return vec2(-0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b, 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b);
}
vec4 effect(vec2 uv) {
  vec4 s = src(uv);
  float d = distance(cbcr(s.rgb), cbcr(vec3(kr, kg, kb)));
  float a = smoothstep(similarity, similarity + smoothness, d);
  float sp = (1.0 - smoothstep(similarity, similarity + smoothness + 0.2, d)) * spill;
  return vec4(mix(s.rgb, vec3(luma(s.rgb)), sp), s.a * a);
}`,
};

/** Same mapping as the compositor's built-in key (gl.ts). */
function chromaParams(k: ChromaKey): number[] {
  return [...hexToRgb(k.color), (k.similarity / 100) * 0.5, (k.smoothness / 100) * 0.3 + 0.001, k.spill / 100];
}

/** Colour-wheel position → per-channel offset (cosine hue spread, plus brightness). */
function wheelVector(w: Wheel, strength: number): [number, number, number] {
  const r = Math.min(1, Math.hypot(w.x, w.y));
  const a = Math.atan2(w.y, w.x);
  const t = (2 * Math.PI) / 3;
  return [Math.cos(a), Math.cos(a - t), Math.cos(a + t)].map((c) => (c * r * 0.5 + w.l * 0.5) * strength) as [number, number, number];
}

export function wheelVectors(w: ColorWheels): DrawItem['wheels'] {
  if (![w.lift, w.gamma, w.gain].some((x) => x.x || x.y || x.l)) return null;
  return { lift: wheelVector(w.lift, 0.5), gamma: wheelVector(w.gamma, 1), gain: wheelVector(w.gain, 1) };
}

function resolveLut(lut: ClipLut | null): DrawItem['lut'] {
  if (!lut || lut.amount <= 0) return null;
  const data = getLut(lut.path);
  return data ? { key: lut.path, size: data.size, data: data.data, amount: lut.amount / 100 } : null;
}

function resolveEffects(effects: ClipEffect[]): DrawItem['effects'] {
  const out: DrawItem['effects'] = [];
  for (const e of effects) {
    if (!e.enabled) continue;
    const def = getFx(e.type);
    if (def && def.kind === 'effect') out.push({ def, params: paramValues(def, e.params) });
  }
  return out;
}
