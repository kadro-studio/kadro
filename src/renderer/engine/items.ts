// Turns resolved layer plans into compositor draw items, given a source provider
// (live media elements for preview, decoded frames for export).
import { effectiveAdjust } from '../core/effects';
import { contentSize } from '../core/geometry';
import type { LayerPlan } from '../core/scene';
import type { MediaAsset, Project } from '../core/types';
import { hexToRgb, type DrawItem, type TexSource } from './gl';
import { rasterizeText } from './text';

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
  for (const plan of plans) {
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
    } else if (clip.type === 'color') {
      source = { key: 'solid', kind: 'color', width: W, height: H, version: 0, color: [...hexToRgb(clip.color), 1] };
    } else {
      const m = clip.mediaId ? media.get(clip.mediaId) : undefined;
      source = provider.source(plan, m);
      content = contentSize(clip, m, W, H);
    }
    if (!source) continue;
    const { adjust, colorize } = effectiveAdjust(clip);
    items.push({ plan, content, source, adjust, colorize, chroma: clip.chroma, blend: clip.blend });
  }
  return items;
}
