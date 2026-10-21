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
