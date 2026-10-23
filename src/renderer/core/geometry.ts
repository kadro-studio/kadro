import type { LayerPlan } from './scene';
import type { Clip, MediaAsset } from './types';

export interface Size {
  w: number;
  h: number;
}

/** Oriented rectangle of a layer's visible area, project pixels. */
export interface Box {
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** Degrees, clockwise. */
  rotation: number;
}

/** Size (project px, at scale 1) of a clip's uncropped content. */
export function contentSize(clip: Clip, media: MediaAsset | undefined, frameW: number, frameH: number, textSize?: Size): Size {
  if (clip.type === 'color' || clip.type === 'adjustment' || clip.type === 'overlay') return { w: frameW, h: frameH };
  if (clip.type === 'text') return textSize ?? { w: 0, h: 0 };
  if (clip.type === 'shape' && clip.shape) {
    // Same padding as the shape rasteriser (stroke plus a 2px margin).
    const pad = Math.ceil(clip.shape.strokeWidth) + 2;
    return { w: clip.shape.width + pad * 2, h: clip.shape.height + pad * 2 };
  }
  if (!media || !media.width || !media.height) return { w: frameW, h: frameH };
  const fit = Math.min(frameW / media.width, frameH / media.height);
  const s = stretchOf(clip);
  return { w: media.width * fit * s.x, h: media.height * fit * s.y };
}

/** Width and height stretch: pictures only (text and shapes keep their own sizes). */
export function stretchOf(clip: Clip): { x: number; y: number } {
  if (clip.type !== 'video' && clip.type !== 'image') return { x: 1, y: 1 };
  return { x: clip.transform.stretchX || 1, y: clip.transform.stretchY || 1 };
}

/** Scale at which a media clip (stretched or not) would cover the whole frame. */
export function fillScale(media: MediaAsset | undefined, frameW: number, frameH: number, stretch = { x: 1, y: 1 }): number {
  if (!media || !media.width || !media.height) return 1;
  const fit = Math.min(frameW / media.width, frameH / media.height);
  return Math.max(frameW / (media.width * fit * stretch.x), frameH / (media.height * fit * stretch.y));
}

export function layerBox(plan: LayerPlan, content: Size, frameW: number, frameH: number): Box {
  const { crop } = plan.clip;
  const x0 = -content.w / 2 + crop.left * content.w;
  const x1 = content.w / 2 - crop.right * content.w;
  const y0 = -content.h / 2 + crop.top * content.h;
  const y1 = content.h / 2 - crop.bottom * content.h;
  const rad = (plan.rotation * Math.PI) / 180;
  const lx = ((x0 + x1) / 2) * plan.scale;
  const ly = ((y0 + y1) / 2) * plan.scale;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    cx: frameW / 2 + plan.x + lx * cos - ly * sin,
    cy: frameH / 2 + plan.y + lx * sin + ly * cos,
    w: Math.max(0, (x1 - x0) * plan.scale),
    h: Math.max(0, (y1 - y0) * plan.scale),
    rotation: plan.rotation,
  };
}

export function pointInBox(box: Box, px: number, py: number): boolean {
  const rad = (-box.rotation * Math.PI) / 180;
  const dx = px - box.cx;
  const dy = py - box.cy;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(lx) <= box.w / 2 && Math.abs(ly) <= box.h / 2;
}
