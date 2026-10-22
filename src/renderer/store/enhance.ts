// Clip enhancement tools: stabilisation, noise reduction, loudness and layouts.
import type { DenoiseOptions, StabilizeOptions } from '../../shared/api';
import { api } from '../api';
import { contentSize } from '../core/geometry';
import { setPropAt } from '../core/keyframes';
import { findClip, mediaMap } from '../core/project';
import { clipHasAudio } from '../core/scene';
import { clamp } from '../core/time';
import type { AnimProp, Clip } from '../core/types';
import { t } from '../i18n';
import { updateClip } from './actions';
import { edit, toast, useEditor } from './editor';
import { errText, importFiles } from './media';

/** Seconds of source kept around a processed range so the clip stays trimmable. */
const HANDLE = 2;
export const MAX_VOLUME = 4;

let taskSeq = 0;

function startTask(onProgress?: (p: number) => void): { id: string; done: () => void } {
  const id = `task-${++taskSeq}`;
  const off = onProgress ? api.onTaskProgress((tid, p) => tid === id && onProgress(p)) : () => undefined;
  return { id, done: off };
}

function clipMedia(clipId: string) {
  const p = useEditor.getState().project;
  const f = findClip(p, clipId);
  const m = f?.clip.mediaId ? p.media.find((x) => x.id === f.clip.mediaId) : undefined;
  return f && m ? { clip: f.clip, m } : null;
}

export async function stabilizeClip(clipId: string, opts: StabilizeOptions, onProgress?: (p: number) => void): Promise<boolean> {
  const found = clipMedia(clipId);
  if (!found || found.clip.type !== 'video') return false;
  const { clip, m } = found;
  const used = clip.duration * clip.speed;
  const head = Math.min(HANDLE, clip.in);
  const tail = clamp(m.duration - clip.in - used, 0, HANDLE);
  const task = startTask(onProgress);
  try {
    const out = await api.stabilize(m.path, clip.in - head, used + head + tail, opts, task.id);
    const [asset] = await importFiles([out]);
    if (!asset) return false;
    updateClip(clipId, (c) => {
      c.mediaId = asset.id;
      c.in = head;
      c.name = `${m.name} (${t('enh.stabilized')})`;
    });
    toast(t('enh.stabilizeDone'), 'success');
    return true;
  } catch (e) {
    toast(errText(e), 'error');
    return false;
  } finally {
    task.done();
  }
}

export async function denoiseClip(clipId: string, opts: DenoiseOptions, onProgress?: (p: number) => void): Promise<boolean> {
  const found = clipMedia(clipId);
  if (!found || !clipHasAudio(found.clip, mediaMap(useEditor.getState().project))) return false;
  const { m } = found;
  const task = startTask(onProgress);
  try {
    const out = await api.denoise(m.path, opts, task.id);
    const [asset] = await importFiles([out]);
    if (!asset) return false;
    updateClip(clipId, (c) => {
      c.mediaId = asset.id;
      c.name = `${m.name} (${t('enh.denoised')})`;
    });
    toast(t('enh.denoiseDone'), 'success');
    return true;
  } catch (e) {
    toast(errText(e), 'error');
    return false;
  } finally {
    task.done();
  }
}

/**
 * Sets clip volume so each clip's source reaches `target` LUFS, keeping the true
 * peak under -1 dBTP. Non-destructive: only the clip gain changes.
 */
export async function normalizeLoudness(clipIds: string[], target: number, onProgress?: (p: number) => void): Promise<number> {
  const gains = new Map<string, number>();
  const media = mediaMap(useEditor.getState().project);
  let done = 0;
  for (const id of clipIds) {
    const found = clipMedia(id);
    if (found && clipHasAudio(found.clip, media)) {
      const { clip, m } = found;
      try {
        const { lufs, peak } = await api.measureLoudness(m.path, clip.in, clip.duration * clip.speed);
        if (Number.isFinite(lufs)) {
          const db = Math.min(target - lufs, -1 - peak);
          gains.set(id, clamp(10 ** (db / 20), 0.05, MAX_VOLUME));
        }
      } catch (e) {
        toast(errText(e), 'error');
      }
    }
    onProgress?.(++done / clipIds.length);
  }
  if (gains.size === 0) return 0;
  edit((d) => {
    for (const tr of d.tracks) {
      for (const c of tr.clips) {
        const g = gains.get(c.id);
        if (g === undefined) continue;
        const keys = c.keyframes.volume;
        if (keys && keys.length > 0) {
          // Keep the envelope's shape; its loudest point gets the new gain.
          const k = g / Math.max(1e-3, ...keys.map((x) => x.v));
          for (const key of keys) key.v = Math.min(MAX_VOLUME, key.v * k);
        } else c.volume = Math.round(g * 1000) / 1000;
      }
    }
  });
  return gains.size;
}

// ---------------------------------------------------------------------------
// Layout presets

export type LayoutKind = 'fit' | 'fill' | 'pip-tl' | 'pip-tr' | 'pip-bl' | 'pip-br' | 'split-v' | 'split-h' | 'thirds' | 'grid-4';

export const LAYOUTS: LayoutKind[] = ['fit', 'fill', 'pip-tl', 'pip-tr', 'pip-bl', 'pip-br', 'split-v', 'split-h', 'thirds', 'grid-4'];

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where a contained layer sits inside its cell (0 = left/top, 1 = right/bottom). */
  ax: number;
  ay: number;
}

const PIP_SIZE = 0.32;

/** Cells (fractions of the frame) and whether layers cover or fit inside them. */
export function layoutCells(kind: LayoutKind, W: number, H: number): { cells: Cell[]; cover: boolean } {
  const full = (x: number, y: number, w: number, h: number): Cell => ({ x, y, w, h, ax: 0.5, ay: 0.5 });
  switch (kind) {
    case 'fit':
      return { cells: [full(0, 0, 1, 1)], cover: false };
    case 'fill':
      return { cells: [full(0, 0, 1, 1)], cover: true };
    case 'split-v':
      return { cells: [full(0, 0, 0.5, 1), full(0.5, 0, 0.5, 1)], cover: true };
    case 'split-h':
      return { cells: [full(0, 0, 1, 0.5), full(0, 0.5, 1, 0.5)], cover: true };
    case 'thirds':
      return { cells: [0, 1, 2].map((i) => full(i / 3, 0, 1 / 3, 1)), cover: true };
    case 'grid-4':
      return { cells: [full(0, 0, 0.5, 0.5), full(0.5, 0, 0.5, 0.5), full(0, 0.5, 0.5, 0.5), full(0.5, 0.5, 0.5, 0.5)], cover: true };
    default: {
      // Picture in picture: same margin in pixels on both axes.
      const margin = Math.min(W, H) * 0.04;
      const mx = margin / W;
      const my = margin / H;
      const right = kind.endsWith('r');
      const bottom = kind.startsWith('pip-b');
      return {
        cells: [{ x: right ? 1 - mx - PIP_SIZE : mx, y: bottom ? 1 - my - PIP_SIZE : my, w: PIP_SIZE, h: PIP_SIZE, ax: right ? 1 : 0, ay: bottom ? 1 : 0 }],
        cover: false,
      };
    }
  }
}

const LAYOUT_TYPES = new Set<Clip['type']>(['video', 'image', 'color', 'shape']);

export function layoutTargets(): string[] {
  const s = useEditor.getState();
  return s.selection.filter((id) => {
    const f = findClip(s.project, id);
    return !!f && LAYOUT_TYPES.has(f.clip.type) && !f.track.locked;
  });
}

/** Arranges the selected visual clips (in selection order) into a layout. */
export function applyLayout(kind: LayoutKind): void {
  const ids = layoutTargets();
  if (ids.length === 0) return;
  const s = useEditor.getState();
  const { width: W, height: H, fps } = s.project.settings;
  const media = mediaMap(s.project);
  const { cells, cover } = layoutCells(kind, W, H);
  const tol = 0.5 / fps;
  edit((d) => {
    ids.forEach((id, i) => {
      const c = d.tracks.flatMap((tr) => tr.clips).find((x) => x.id === id);
      if (!c) return;
      const cell = cells[i % cells.length];
      const size = contentSize(c, c.mediaId ? media.get(c.mediaId) : undefined, W, H);
      if (!size.w || !size.h) return;
      const cw = cell.w * W;
      const ch = cell.h * H;
      // A layout is a static placement, so it replaces any motion keyframes.
      const put = (prop: AnimProp, v: number) => {
        delete c.keyframes[prop];
        setPropAt(c, prop, 0, v, tol);
      };
      let scale: number;
      let left: number;
      let top: number;
      let bw: number;
      let bh: number;
      if (cover) {
        scale = Math.max(cw / size.w, ch / size.h);
        const ex = (1 - cw / (size.w * scale)) / 2;
        const ey = (1 - ch / (size.h * scale)) / 2;
        c.crop = { left: ex, right: ex, top: ey, bottom: ey };
        [left, top, bw, bh] = [cell.x * W, cell.y * H, cw, ch];
      } else {
        scale = Math.min(cw / size.w, ch / size.h);
        c.crop = { left: 0, right: 0, top: 0, bottom: 0 };
        bw = size.w * scale;
        bh = size.h * scale;
        left = cell.x * W + (cw - bw) * cell.ax;
        top = cell.y * H + (ch - bh) * cell.ay;
      }
      put('scale', Math.round(scale * 10000) / 10000);
      put('x', Math.round(left + bw / 2 - W / 2));
      put('y', Math.round(top + bh / 2 - H / 2));
      put('rotation', 0);
    });
  });
}
