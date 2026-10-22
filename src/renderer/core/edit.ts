// Pure editing operations. They mutate the objects they receive and are meant
// to run inside immer recipes.
import { current, isDraft } from 'immer';
import { clipEnd, findClip, isTimeBased, maxClipDuration, sortClips, uid } from './project';
import { shiftKeyframes } from './keyframes';
import { EPS } from './time';
import type { Clip, MediaAsset, Project, Track } from './types';

export function cloneClip(c: Clip): Clip {
  // Immer drafts are proxies and cannot be structured-cloned directly.
  const plain = isDraft(c) ? current(c) : c;
  return { ...structuredClone(plain), id: uid() };
}

export function insertClip(track: Track, clip: Clip): void {
  track.clips.push(clip);
  sortClips(track);
}

/** Moves the clip's start edge to `newStart`, keeping its end fixed. */
export function trimStartTo(clip: Clip, newStart: number): void {
  const shift = newStart - clip.start;
  clip.start = newStart;
  clip.duration -= shift;
  clip.in = Math.max(0, clip.in + shift * clip.speed);
  shiftKeyframes(clip, -shift);
}

export function trimEndTo(clip: Clip, newEnd: number): void {
  clip.duration = newEnd - clip.start;
}

/**
 * Overwrite-edit: frees [start, end) on a track by trimming, splitting or
 * removing clips that overlap it. Clips listed in `exclude` are left alone.
 */
export function clearRange(track: Track, start: number, end: number, exclude: Set<string> = new Set()): void {
  if (end - start <= EPS) return;
  const result: Clip[] = [];
  for (const c of track.clips) {
    const cEnd = clipEnd(c);
    if (exclude.has(c.id) || cEnd <= start + EPS || c.start >= end - EPS) {
      result.push(c);
      continue;
    }
    const coversLeft = c.start < start - EPS;
    const coversRight = cEnd > end + EPS;
    if (coversLeft && coversRight) {
      const right = cloneClip(c);
      trimEndTo(c, start);
      c.animOut = { ...c.animOut, type: 'none' };
      c.fadeOut = 0;
      trimStartTo(right, end);
      right.animIn = { ...right.animIn, type: 'none' };
      right.transition = { ...right.transition, type: 'none' };
      right.fadeIn = 0;
      result.push(c, right);
    } else if (coversLeft) {
      trimEndTo(c, start);
      result.push(c);
    } else if (coversRight) {
      trimStartTo(c, end);
      result.push(c);
    }
    // fully covered clips are dropped
  }
  track.clips = result;
  sortClips(track);
}

/** Places a clip on a track, overwriting whatever was underneath. */
export function placeClip(track: Track, clip: Clip): void {
  clearRange(track, clip.start, clipEnd(clip), new Set([clip.id]));
  insertClip(track, clip);
}

/** Splits a clip at timeline time t. Returns the id of the right half. */
export function splitClip(track: Track, clipId: string, t: number, minLen: number): string | null {
  const clip = track.clips.find((c) => c.id === clipId);
  if (!clip) return null;
  if (t <= clip.start + minLen - EPS || t >= clipEnd(clip) - minLen + EPS) return null;
  const right = cloneClip(clip);
  trimEndTo(clip, t);
  clip.animOut = { ...clip.animOut, type: 'none' };
  clip.fadeOut = 0;
  trimStartTo(right, t);
  right.animIn = { ...right.animIn, type: 'none' };
  right.transition = { ...right.transition, type: 'none' };
  right.fadeIn = 0;
  insertClip(track, right);
  return right.id;
}

export function removeClips(p: Project, ids: Set<string>): void {
  for (const t of p.tracks) t.clips = t.clips.filter((c) => !ids.has(c.id));
}

/** Deletes clips and closes the gaps they leave on their own tracks. */
export function rippleDelete(p: Project, ids: Set<string>): void {
  for (const track of p.tracks) {
    const removed = track.clips.filter((c) => ids.has(c.id)).sort((a, b) => b.start - a.start);
    if (removed.length === 0) continue;
    track.clips = track.clips.filter((c) => !ids.has(c.id));
    for (const r of removed) {
      for (const c of track.clips) {
        if (c.start >= clipEnd(r) - EPS) c.start = Math.max(0, c.start - r.duration);
      }
    }
    sortClips(track);
  }
}

/** Removes empty space between clips on a track, keeping their order. */
export function closeGaps(track: Track): void {
  sortClips(track);
  let cursor = 0;
  for (const c of track.clips) {
    c.start = cursor;
    cursor = clipEnd(c);
  }
}

/** Shifts every clip starting at/after `from` on the track by dt. */
export function shiftClipsAfter(track: Track, from: number, dt: number, except: string): void {
  for (const c of track.clips) {
    if (c.id !== except && c.start >= from - EPS) c.start = Math.max(0, c.start + dt);
  }
  sortClips(track);
}

/** Changes playback speed, keeping the same source range and rippling the track. */
export function setClipSpeed(p: Project, clipId: string, speed: number, media: MediaAsset | undefined): void {
  const found = findClip(p, clipId);
  if (!found) return;
  const { clip, track } = found;
  const oldEnd = clipEnd(clip);
  const sourceLen = clip.duration * clip.speed;
  clip.speed = speed;
  let duration = sourceLen / speed;
  const max = maxClipDuration(clip, media);
  if (duration > max) duration = max;
  for (const prop of Object.keys(clip.keyframes) as (keyof Clip['keyframes'])[]) {
    const ratio = duration / (oldEnd - clip.start);
    for (const k of clip.keyframes[prop] ?? []) k.t *= ratio;
  }
  clip.duration = duration;
  shiftClipsAfter(track, oldEnd, clipEnd(clip) - oldEnd, clip.id);
}

// ---------------------------------------------------------------------------
// Advanced trims. All of these mutate drafts and leave the track sorted.

/** Ripple trim of the tail: later clips on the track follow the edge. */
export function rippleTrimEnd(track: Track, clipId: string, newEnd: number): void {
  const clip = track.clips.find((c) => c.id === clipId);
  if (!clip) return;
  const oldEnd = clipEnd(clip);
  const delta = newEnd - oldEnd;
  trimEndTo(clip, newEnd);
  for (const c of track.clips) if (c.id !== clipId && c.start >= oldEnd - EPS) c.start += delta;
  sortClips(track);
}

/**
 * Ripple trim of the head by `delta` seconds of timeline: the clip keeps its
 * position, its content starts later/earlier, and later clips close up.
 */
export function rippleTrimStart(track: Track, clipId: string, delta: number): void {
  const clip = track.clips.find((c) => c.id === clipId);
  if (!clip) return;
  const oldEnd = clipEnd(clip);
  clip.in = Math.max(0, clip.in + delta * clip.speed);
  clip.duration -= delta;
  shiftKeyframes(clip, -delta);
  for (const c of track.clips) if (c.id !== clipId && c.start >= oldEnd - EPS) c.start -= delta;
  sortClips(track);
}

/** Rolling edit: moves the cut between two adjacent clips. */
export function rollEdit(track: Track, leftId: string, rightId: string, cut: number): void {
  const left = track.clips.find((c) => c.id === leftId);
  const right = track.clips.find((c) => c.id === rightId);
  if (!left || !right) return;
  trimEndTo(left, cut);
  trimStartTo(right, cut);
  sortClips(track);
}

/** Slip: shows a different part of the source without moving the clip. */
export function slipClip(clip: Clip, sourceDelta: number, media: MediaAsset | undefined): void {
  const max = media && media.duration > 0 ? Math.max(0, media.duration - clip.duration * clip.speed) : Infinity;
  clip.in = Math.min(max, Math.max(0, clip.in + sourceDelta));
}

/** Slide: moves a clip between its neighbours, which give up or take the difference. */
export function slideClip(track: Track, clipId: string, newStart: number, prevId: string | null, nextId: string | null): void {
  const clip = track.clips.find((c) => c.id === clipId);
  if (!clip) return;
  const prev = prevId ? track.clips.find((c) => c.id === prevId) : undefined;
  const next = nextId ? track.clips.find((c) => c.id === nextId) : undefined;
  clip.start = newStart;
  if (prev) trimEndTo(prev, newStart);
  if (next) trimStartTo(next, newStart + clip.duration);
  sortClips(track);
}

/** Insert edit: opens a gap of `duration` at `time` on a track. */
export function openGap(track: Track, time: number, duration: number): void {
  for (const c of track.clips) {
    if (c.start >= time - EPS) c.start += duration;
  }
  sortClips(track);
}

/** Extent a clip edge can be trimmed to, given neighbours and source length. */
export function trimBounds(
  track: Track,
  clip: Clip,
  media: MediaAsset | undefined,
  minLen: number,
): { minStart: number; maxEnd: number; maxStartForMin: number; minEndForMin: number } {
  let prevEnd = 0;
  let nextStart = Infinity;
  for (const c of track.clips) {
    if (c.id === clip.id) continue;
    if (clipEnd(c) <= clip.start + EPS) prevEnd = Math.max(prevEnd, clipEnd(c));
    if (c.start >= clipEnd(clip) - EPS) nextStart = Math.min(nextStart, c.start);
  }
  let minStart = prevEnd;
  let maxEnd = nextStart;
  if (isTimeBased(clip) && media && media.duration > 0) {
    minStart = Math.max(minStart, clip.start - clip.in / clip.speed);
    maxEnd = Math.min(maxEnd, clip.start + maxClipDuration(clip, media));
  }
  return {
    minStart: Math.max(0, minStart),
    maxEnd,
    maxStartForMin: clipEnd(clip) - minLen,
    minEndForMin: clip.start + minLen,
  };
}
