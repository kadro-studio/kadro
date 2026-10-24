// Pointer gestures for the advanced timeline tools: ripple and roll trims on
// clip edges, slip and slide on clip bodies. Each gesture previews live and
// becomes a single undo step on release. Linked partners (a video's sound)
// get the same edit on their own tracks, so the pair stays in sync.
import type { Draft } from 'immer';
import { rippleTrimEnd, rippleTrimStart, rollEdit, slideClip, slipClip } from '../../core/edit';
import { edgePartners, partnersOf } from '../../core/links';
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

/** Partners edited along with the clip: those whose edge (or both edges) match, when linking is on. */
function along(p: Project, clip: Clip, side: 'l' | 'r' | 'both'): { clip: Clip; track: Track }[] {
  if (!useEditor.getState().linking) return [];
  if (side !== 'both') return edgePartners(p, clip, side).filter((x) => !x.track.locked);
  const ends = new Set(edgePartners(p, clip, 'r').map((x) => x.clip.id));
  return edgePartners(p, clip, 'l').filter((x) => ends.has(x.clip.id) && !x.track.locked);
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
  const fps = base.settings.fps;
  const minLen = 1 / fps;
  const all = [clip, ...along(base, clip, side).map((x) => x.clip)];
  const exclude = new Set(all.map((c) => c.id));
  runDrag(e.clientX, (dt, ev) => {
    if (side === 'r') {
      let end = clipEnd(clip) + dt;
      let at: number | null = null;
      if (!ev.altKey) ({ time: end, at } = ctx.snap(end, exclude));
      const longest = Math.min(...all.map((c) => c.start + maxClipDuration(c, c.mediaId ? ctx.media.get(c.mediaId) : undefined)));
      end = clamp(snapToFrame(end, fps), clip.start + minLen, longest);
      previewEdit((d) => {
        for (const c of all) {
          const tr = trackOf(d, c.id);
          if (tr) rippleTrimEnd(tr, c.id, end);
        }
      });
      return at;
    }
    // The head stays in place: dragging right drops content from the start.
    const lo = Math.max(...all.map((c) => (isTimeBased(c) ? -c.in / c.speed : -c.start)));
    const delta = clamp(snapToFrame(dt, fps), lo, clip.duration - minLen);
    previewEdit((d) => {
      for (const c of all) {
        const tr = trackOf(d, c.id);
        if (tr) rippleTrimStart(tr, c.id, delta);
      }
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
  const minLen = 1 / fps;
  // Pairs rolled together: this cut, plus the same cut between linked partners on other tracks.
  const pairs: { trackId: string; left: Clip; right: Clip }[] = [{ trackId: f.track.id, left, right }];
  for (const pl of along(base, left, 'r')) {
    const pr = partnersOf(base, right).find((x) => x.track.id === pl.track.id && adjacentAfter(x.track, pl.clip, fps)?.id === x.clip.id);
    if (pr) pairs.push({ trackId: pl.track.id, left: pl.clip, right: pr.clip });
  }
  let lo = -Infinity;
  let hi = Infinity;
  for (const q of pairs) {
    const mL = q.left.mediaId ? ctx.media.get(q.left.mediaId) : undefined;
    lo = Math.max(lo, q.left.start + minLen, isTimeBased(q.right) ? q.right.start - q.right.in / q.right.speed : -Infinity);
    hi = Math.min(hi, clipEnd(q.right) - minLen, isTimeBased(q.left) ? q.left.start + maxClipDuration(q.left, mL) : Infinity);
  }
  const exclude = new Set(pairs.flatMap((q) => [q.left.id, q.right.id]));
  runDrag(e.clientX, (dt, ev) => {
    let cut = right.start + dt;
    let at: number | null = null;
    if (!ev.altKey) ({ time: cut, at } = ctx.snap(cut, exclude));
    cut = clamp(snapToFrame(cut, fps), lo, hi);
    previewEdit((d) => {
      for (const q of pairs) {
        const tr = track(d, q.trackId);
        if (tr) rollEdit(tr, q.left.id, q.right.id, cut);
      }
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
  const all = [clip, ...along(base, clip, 'both').map((x) => x.clip).filter(isTimeBased)];
  runDrag(e.clientX, (dt) => {
    // Dragging right reveals earlier source material.
    const sourceDelta = snapToFrame(-dt, base.settings.fps) * clip.speed;
    previewEdit((d) => {
      for (const one of all) {
        const c = trackOf(d, one.id)?.clips.find((x) => x.id === one.id);
        if (c) slipClip(c, sourceDelta, one.mediaId ? ctx.media.get(one.mediaId) : undefined);
      }
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
  // The clip and its linked partner slide together, each between its own neighbours.
  const slides = [{ clip, tr }, ...along(base, clip, 'both').map((x) => ({ clip: x.clip, tr: x.track }))].map((x) => ({
    ...x,
    prev: adjacentBefore(x.tr, x.clip, fps),
    next: adjacentAfter(x.tr, x.clip, fps),
  }));
  let lo = -Infinity;
  let hi = Infinity;
  for (const { clip: c, tr: t, prev, next } of slides) {
    const gaps = gapBounds(t, c);
    lo = Math.max(lo, prev ? prev.start + minLen : gaps.prevEnd);
    hi = Math.min(hi, next ? clipEnd(next) - minLen - c.duration : gaps.nextStart - c.duration);
    if (prev && isTimeBased(prev)) hi = Math.min(hi, prev.start + maxClipDuration(prev, prev.mediaId ? ctx.media.get(prev.mediaId) : undefined));
    if (next && isTimeBased(next)) lo = Math.max(lo, next.start - next.in / next.speed - c.duration);
  }
  const exclude = new Set(slides.flatMap((x) => [x.clip.id, x.prev?.id ?? '', x.next?.id ?? '']));
  runDrag(e.clientX, (dt, ev) => {
    let start = clip.start + dt;
    let at: number | null = null;
    if (!ev.altKey) {
      const s = ctx.snap(start, exclude);
      start = s.time;
      at = s.at;
    }
    start = clamp(snapToFrame(start, fps), lo, hi);
    previewEdit((d) => {
      for (const x of slides) {
        const t = track(d, x.tr.id);
        if (t) slideClip(t, x.clip.id, start, x.prev?.id ?? null, x.next?.id ?? null);
      }
    });
    return at;
  });
}
