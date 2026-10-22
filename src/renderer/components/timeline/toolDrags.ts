// Pointer gestures for the advanced timeline tools: ripple and roll trims on
// clip edges, slip and slide on clip bodies. Each gesture previews live and
// becomes a single undo step on release.
import type { Draft } from 'immer';
import { rippleTrimEnd, rippleTrimStart, rollEdit, slideClip, slipClip } from '../../core/edit';
import { adjacentAfter, adjacentBefore, clipEnd, findClip, isTimeBased, maxClipDuration } from '../../core/project';
import { clamp, EPS, snapToFrame } from '../../core/time';
import type { Clip, MediaAsset, Project, Track } from '../../core/types';
import { commitPreview, previewEdit, useEditor } from '../../store/editor';

export interface DragContext {
  media: Map<string, MediaAsset>;
  /** Snaps a timeline time to nearby edit points; returns the time and guide position. */
  snap: (time: number, exclude: Set<string>) => { time: number; at: number | null };
}

function trackOf(d: Draft<Project>, id: string): Draft<Track> | undefined {
  return d.tracks.find((tr) => tr.clips.some((c) => c.id === id));
}

function track(d: Draft<Project>, id: string): Draft<Track> | undefined {
  return d.tracks.find((tr) => tr.id === id);
}

/** Runs a horizontal drag; `update` receives the time offset and returns a guide position. */
function runDrag(startX: number, update: (dt: number, ev: PointerEvent) => number | null): void {
  const onMove = (ev: PointerEvent) => {
    const dt = (ev.clientX - startX) / useEditor.getState().pxPerSec;
    useEditor.setState({ snapLine: update(dt, ev) });
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    commitPreview();
    useEditor.setState({ snapLine: null });
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

/** Free space around a clip on its track (neighbour edges, or 0 / infinity). */
function gapBounds(tr: Track, clip: Clip): { prevEnd: number; nextStart: number } {
  let prevEnd = 0;
  let nextStart = Infinity;
  for (const c of tr.clips) {
    if (c.id === clip.id) continue;
    if (clipEnd(c) <= clip.start + EPS) prevEnd = Math.max(prevEnd, clipEnd(c));
    if (c.start >= clipEnd(clip) - EPS) nextStart = Math.min(nextStart, c.start);
  }
  return { prevEnd, nextStart };
}

export function startRipple(e: PointerEvent | React.PointerEvent, clipId: string, side: 'l' | 'r', ctx: DragContext): void {
  const base = useEditor.getState().project;
  const f = findClip(base, clipId);
  if (!f) return;
  const { clip } = f;
  const m = clip.mediaId ? ctx.media.get(clip.mediaId) : undefined;
  const fps = base.settings.fps;
  const minLen = 1 / fps;
  runDrag(e.clientX, (dt, ev) => {
    if (side === 'r') {
      let end = clipEnd(clip) + dt;
      let at: number | null = null;
      if (!ev.altKey) ({ time: end, at } = ctx.snap(end, new Set([clipId])));
      end = clamp(snapToFrame(end, fps), clip.start + minLen, clip.start + maxClipDuration(clip, m));
      previewEdit((d) => {
        const tr = trackOf(d, clipId);
        if (tr) rippleTrimEnd(tr, clipId, end);
      });
      return at;
    }
    // The head stays in place: dragging right drops content from the start.
    const lo = isTimeBased(clip) ? -clip.in / clip.speed : -clip.start;
    const delta = clamp(snapToFrame(dt, fps), lo, clip.duration - minLen);
    previewEdit((d) => {
      const tr = trackOf(d, clipId);
      if (tr) rippleTrimStart(tr, clipId, delta);
    });
    return null;
  });
}

/** Roll the cut on this edge; returns false when there is no adjacent clip to roll into. */
export function startRoll(e: PointerEvent | React.PointerEvent, clipId: string, side: 'l' | 'r', ctx: DragContext): boolean {
  const base = useEditor.getState().project;
  const f = findClip(base, clipId);
  if (!f) return false;
  const fps = base.settings.fps;
  const other = side === 'l' ? adjacentBefore(f.track, f.clip, fps) : adjacentAfter(f.track, f.clip, fps);
  if (!other) return false;
  const left = side === 'l' ? other : f.clip;
  const right = side === 'l' ? f.clip : other;
  const mL = left.mediaId ? ctx.media.get(left.mediaId) : undefined;
  const minLen = 1 / fps;
  const lo = Math.max(left.start + minLen, isTimeBased(right) ? right.start - right.in / right.speed : -Infinity);
  const hi = Math.min(clipEnd(right) - minLen, isTimeBased(left) ? left.start + maxClipDuration(left, mL) : Infinity);
  const trackId = f.track.id;
  runDrag(e.clientX, (dt, ev) => {
    let cut = right.start + dt;
    let at: number | null = null;
    if (!ev.altKey) ({ time: cut, at } = ctx.snap(cut, new Set([left.id, right.id])));
    cut = clamp(snapToFrame(cut, fps), lo, hi);
    previewEdit((d) => {
      const tr = track(d, trackId);
      if (tr) rollEdit(tr, left.id, right.id, cut);
    });
    return at;
  });
  return true;
}

export function startSlip(e: PointerEvent | React.PointerEvent, clipId: string, ctx: DragContext): boolean {
  const base = useEditor.getState().project;
  const f = findClip(base, clipId);
  if (!f || !isTimeBased(f.clip)) return false;
  const { clip } = f;
  const m = clip.mediaId ? ctx.media.get(clip.mediaId) : undefined;
  runDrag(e.clientX, (dt) => {
    // Dragging right reveals earlier source material.
    const sourceDelta = snapToFrame(-dt, base.settings.fps) * clip.speed;
    previewEdit((d) => {
      const c = trackOf(d, clipId)?.clips.find((x) => x.id === clipId);
      if (c) slipClip(c, sourceDelta, m);
    });
    return null;
  });
  return true;
}

export function startSlide(e: PointerEvent | React.PointerEvent, clipId: string, ctx: DragContext): void {
  const base = useEditor.getState().project;
  const f = findClip(base, clipId);
  if (!f) return;
  const { clip, track: tr } = f;
  const fps = base.settings.fps;
  const minLen = 1 / fps;
  const prev = adjacentBefore(tr, clip, fps);
  const next = adjacentAfter(tr, clip, fps);
  const gaps = gapBounds(tr, clip);
  let lo = prev ? prev.start + minLen : gaps.prevEnd;
  let hi = next ? clipEnd(next) - minLen - clip.duration : gaps.nextStart - clip.duration;
  if (prev && isTimeBased(prev)) hi = Math.min(hi, prev.start + maxClipDuration(prev, prev.mediaId ? ctx.media.get(prev.mediaId) : undefined));
  if (next && isTimeBased(next)) lo = Math.max(lo, next.start - next.in / next.speed - clip.duration);
  runDrag(e.clientX, (dt, ev) => {
    let start = clip.start + dt;
    let at: number | null = null;
    if (!ev.altKey) {
      const s = ctx.snap(start, new Set([clip.id, prev?.id ?? '', next?.id ?? '']));
      start = s.time;
      at = s.at;
    }
    start = clamp(snapToFrame(start, fps), lo, hi);
    previewEdit((d) => {
      const t = track(d, tr.id);
      if (t) slideClip(t, clipId, start, prev?.id ?? null, next?.id ?? null);
    });
    return at;
  });
}
