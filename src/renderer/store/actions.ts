// High-level editing commands used by menus, shortcuts and panels.
import type { Draft } from 'immer';
import {
  clipEnd,
  createProject,
  DEFAULT_IMAGE_DURATION,
  DEFAULT_TEXT_DURATION,
  defaultShape,
  defaultTextStyle,
  findClip,
  findTrack,
  makeClip,
  makeTrack,
  mediaMap,
  nextTrackName,
  normalizeProject,
  projectDuration,
  tracksOfKind,
  uid,
} from '../core/project';
import {
  clearRange,
  closeGaps,
  cloneClip,
  insertClip,
  openGap,
  placeClip,
  removeClips,
  rippleDelete,
  setClipSpeed,
  splitClip,
} from '../core/edit';
import { TEXT_PRESETS } from '../core/textPresets';
import { clamp, EPS, snapToFrame } from '../core/time';
import type { Clip, ClipType, MediaAsset, Project, ShapeKind, Track, TrackKind } from '../core/types';
import type { I18nKey } from '../i18n';
import { clipHasAudio } from '../core/scene';
import { clearWaveforms } from '../engine/waveforms';
import { api } from '../api';
import { APP_NAME } from '../../shared/brand';
import { t } from '../i18n';
import { analyzeMedia, errText, importFiles } from './media';
import {
  commitPreview,
  edit,
  isDirty,
  loadProject,
  markSaved,
  select,
  toast,
  useEditor,
  type DialogKind,
  type LeftTab,
} from './editor';
import { forgetRecent, rememberRecent } from './prefs';
import { clearAutosave } from './autosave';
import { getFx } from '../engine/fx/registry';
import { registerProjectFx, withEmbeddedFx } from './fxProject';

const st = () => useEditor.getState();
const fps = () => st().project.settings.fps;
const frameLen = () => 1 / fps();

function trackIn(d: Draft<Project>, id: string): Track | undefined {
  return d.tracks.find((tr) => tr.id === id);
}

function isFree(track: Track, start: number, end: number): boolean {
  return !track.clips.some((c) => c.start < end - EPS && clipEnd(c) > start + EPS);
}

/** First unlocked track of a kind with free space in [start, end). */
function freeTrack(p: Project, kind: TrackKind, start: number, end: number, preferId?: string): Track | null {
  const tracks = tracksOfKind(p, kind).filter((tr) => !tr.locked);
  const preferred = preferId ? tracks.find((tr) => tr.id === preferId) : undefined;
  if (preferred && isFree(preferred, start, end)) return preferred;
  return tracks.find((tr) => isFree(tr, start, end)) ?? null;
}

/** Adds a new track and returns its id (inside a recipe). */
function addTrackDraft(d: Draft<Project>, kind: TrackKind): Track {
  const track = makeTrack(kind, nextTrackName(d as Project, kind));
  if (kind === 'video') {
    const lastVideo = d.tracks.map((tr) => tr.kind).lastIndexOf('video');
    d.tracks.splice(lastVideo + 1, 0, track);
  } else {
    d.tracks.push(track);
  }
  return d.tracks.find((tr) => tr.id === track.id)!;
}

// ---------------------------------------------------------------------------
// Adding clips

export interface PlaceOptions {
  /** Target track; when omitted a free track of the right kind is found or created. */
  trackId?: string;
  /** Timeline time; defaults to the playhead. */
  time?: number;
  /** Overwrite clips under the new clip instead of looking for free space. */
  overwrite?: boolean;
  /** Put the clip on a newly created track. */
  newTrack?: boolean;
  /** Insert edit on the target track: later clips move right to make room. */
  insert?: boolean;
}

function placeNewClip(clip: Clip, kind: TrackKind, opts: PlaceOptions): void {
  const p = st().project;
  clip.start = snapToFrame(Math.max(0, opts.time ?? st().playhead), fps());
  const end = clipEnd(clip);
  edit((d) => {
    if (opts.newTrack) {
      insertClip(addTrackDraft(d, kind), clip);
      return;
    }
    let track: Track | undefined;
    if (opts.trackId) {
      const target = trackIn(d, opts.trackId);
      if (target && target.kind === kind && !target.locked) track = target;
    }
    if (track && opts.insert) {
      // Split whatever straddles the insertion point, then push the rest right.
      const straddling = track.clips.find((c) => c.start < clip.start - EPS && clipEnd(c) > clip.start + EPS);
      if (straddling) splitClip(track, straddling.id, clip.start, frameLen());
      openGap(track, clip.start, clip.duration);
      insertClip(track, clip);
      return;
    }
    if (track && opts.overwrite) {
      placeClip(track, clip);
      return;
    }
    if (!track || !isFree(track, clip.start, end)) {
      const free = freeTrack(p, kind, clip.start, end, opts.trackId);
      track = free ? trackIn(d, free.id) : addTrackDraft(d, kind);
    }
    insertClip(track!, clip);
  });
  select([clip.id]);
}

function clipTypeFor(media: MediaAsset): ClipType {
  return media.kind === 'image' ? 'image' : media.kind === 'audio' ? 'audio' : 'video';
}

export function addMediaClip(mediaId: string, opts: PlaceOptions = {}): void {
  const media = st().project.media.find((m) => m.id === mediaId);
  if (!media) return;
  let type = clipTypeFor(media);
  let kind: TrackKind = type === 'audio' ? 'audio' : 'video';
  // A video dropped on an audio track contributes only its sound.
  const target = opts.trackId ? findTrack(st().project, opts.trackId) : null;
  if (target && target.kind === 'audio' && type === 'video' && media.hasAudio) {
    type = 'audio';
    kind = 'audio';
  }
  const timeBased = type === 'video' || type === 'audio';
  const duration = timeBased && media.duration > 0 ? media.duration : DEFAULT_IMAGE_DURATION;
  const clip = makeClip(type, { name: media.name, mediaId, duration });
  placeNewClip(clip, kind, opts);
}

export function addTextClip(presetId: string, opts: PlaceOptions = {}): void {
  const preset = TEXT_PRESETS.find((p) => p.id === presetId) ?? TEXT_PRESETS[0];
  const { width, height } = st().project.settings;
  const k = Math.min(width, height) / 1080;
  const style = { ...defaultTextStyle(), ...preset.style, content: t(preset.sampleKey) };
  style.fontSize = Math.round(style.fontSize * k);
  style.backgroundPadding = Math.round(style.backgroundPadding * k);
  style.strokeWidth = Math.round(style.strokeWidth * k * 10) / 10;
  style.shadowBlur = Math.round(style.shadowBlur * k);
  style.letterSpacing = Math.round(style.letterSpacing * k);
  const clip = makeClip('text', {
    name: style.content.split('\n')[0],
    duration: DEFAULT_TEXT_DURATION,
    text: style,
    animIn: { type: preset.animIn, duration: preset.animIn === 'typewriter' ? 1.5 : 0.5 },
    animOut: { type: preset.animOut, duration: 0.5 },
  });
  clip.transform.x = Math.round(preset.x * width);
  clip.transform.y = Math.round(preset.y * height);
  placeNewClip(clip, 'video', opts);
}

/** Adjustment layer: effects and colour on it apply to all tracks below. */
export function addAdjustmentClip(opts: PlaceOptions = {}): void {
  const clip = makeClip('adjustment', { name: t('elements.adjustment'), duration: DEFAULT_IMAGE_DURATION });
  placeNewClip(clip, 'video', opts);
}

export function addShapeClip(kind: ShapeKind, opts: PlaceOptions = {}): void {
  const clip = makeClip('shape', { name: t(`shape.${kind}` as I18nKey), duration: DEFAULT_IMAGE_DURATION, shape: defaultShape(kind) });
  placeNewClip(clip, 'video', opts);
}

export function addColorClip(color: string, opts: PlaceOptions = {}): void {
  const clip = makeClip('color', { name: color, color, duration: DEFAULT_IMAGE_DURATION });
  placeNewClip(clip, 'video', opts);
}

// ---------------------------------------------------------------------------
// Clip editing

export function updateClip(id: string, recipe: (c: Draft<Clip>) => void): void {
  edit((d) => {
    for (const tr of d.tracks) {
      const c = tr.clips.find((x) => x.id === id);
      if (c) {
        recipe(c);
        return;
      }
    }
  });
}

export function updateClips(ids: string[], recipe: (c: Draft<Clip>) => void): void {
  const set = new Set(ids);
  edit((d) => {
    for (const tr of d.tracks) for (const c of tr.clips) if (set.has(c.id)) recipe(c);
  });
}

function editableSelection(): string[] {
  const p = st().project;
  return st().selection.filter((id) => {
    const f = findClip(p, id);
    return f && !f.track.locked;
  });
}

export function splitAt(time: number, ids?: string[]): void {
  const p = st().project;
  const tt = snapToFrame(time, fps());
  let targets = ids ?? editableSelection();
  targets = targets.filter((id) => {
    const f = findClip(p, id);
    return f && tt > f.clip.start && tt < clipEnd(f.clip);
  });
  if (targets.length === 0) {
    for (const tr of p.tracks) {
      if (tr.locked) continue;
      for (const c of tr.clips) if (tt > c.start && tt < clipEnd(c)) targets.push(c.id);
    }
  }
  if (targets.length === 0) {
    toast(t('toast.noClipAtPlayhead'));
    return;
  }
  const newIds: string[] = [];
  edit((d) => {
    for (const id of targets) {
      const tr = d.tracks.find((x) => x.clips.some((c) => c.id === id));
      if (!tr) continue;
      const right = splitClip(tr, id, tt, frameLen());
      if (right) newIds.push(right);
    }
  });
  if (st().selection.length > 0) select(newIds);
}

export function splitAtPlayhead(): void {
  splitAt(st().playhead);
}

export function deleteSelection(ripple = false): void {
  const ids = new Set(editableSelection());
  if (ids.size === 0) return;
  edit((d) => {
    if (ripple) rippleDelete(d, ids);
    else removeClips(d, ids);
  });
  select([]);
}

export function duplicateSelection(): void {
  const ids = editableSelection();
  if (ids.length === 0) return;
  const newIds: string[] = [];
  edit((d) => {
    for (const id of ids) {
      const tr = d.tracks.find((x) => x.clips.some((c) => c.id === id));
      const src = tr?.clips.find((c) => c.id === id);
      if (!tr || !src) continue;
      const copy = cloneClip(src as Clip);
      copy.start = clipEnd(src);
      copy.transition = { ...copy.transition, type: 'none' };
      // Insert edit: push later clips on the track to make room.
      for (const c of tr.clips) if (c.start >= copy.start - EPS) c.start += copy.duration;
      insertClip(tr, copy);
      newIds.push(copy.id);
    }
  });
  select(newIds);
}

export function copySelection(): void {
  const p = st().project;
  const found = st().selection.map((id) => findClip(p, id)).filter((f) => !!f);
  if (found.length === 0) return;
  const minStart = Math.min(...found.map((f) => f.clip.start));
  useEditor.setState({
    clipboard: { clips: found.map((f) => ({ clip: { ...structuredClone(f.clip), start: f.clip.start - minStart }, trackId: f.track.id })) },
  });
}

export function cutSelection(): void {
  copySelection();
  deleteSelection(false);
}

export function paste(time = st().playhead): void {
  const cb = st().clipboard;
  if (!cb || cb.clips.length === 0) return;
  const at = snapToFrame(time, fps());
  const newIds: string[] = [];
  edit((d) => {
    for (const { clip, trackId } of cb.clips) {
      const kind: TrackKind = clip.type === 'audio' ? 'audio' : 'video';
      let tr = trackIn(d, trackId);
      if (!tr || tr.locked || tr.kind !== kind) tr = d.tracks.find((x) => x.kind === kind && !x.locked) ?? addTrackDraft(d, kind);
      const copy = { ...structuredClone(clip), id: uid(), start: at + clip.start };
      placeClip(tr, copy);
      newIds.push(copy.id);
    }
  });
  select(newIds);
}

export type AttrGroup = 'transform' | 'color' | 'effects' | 'mask' | 'animation' | 'audio';
export const ATTR_GROUPS: AttrGroup[] = ['transform', 'color', 'effects', 'mask', 'animation', 'audio'];

/** Copies chosen attribute groups of the copied clip onto the selected clips. */
export function pasteAttributes(groups: AttrGroup[]): void {
  const src = st().clipboard?.clips[0]?.clip;
  const ids = editableSelection();
  if (!src || ids.length === 0) return;
  const g = new Set(groups);
  const clone = <T,>(v: T): T => structuredClone(v);
  updateClips(ids, (c) => {
    if (c.id === src.id) return;
    if (g.has('transform')) {
      c.transform = clone(src.transform);
      for (const p of ['x', 'y', 'scale', 'rotation', 'opacity'] as const) {
        if (src.keyframes[p]) c.keyframes[p] = clone(src.keyframes[p]);
        else delete c.keyframes[p];
      }
    }
    if (g.has('color')) {
      c.adjust = clone(src.adjust);
      c.filter = clone(src.filter);
      c.lut = clone(src.lut);
      c.chroma = clone(src.chroma);
      c.blend = src.blend;
    }
    if (g.has('effects')) c.effects = src.effects.map((e) => ({ ...clone(e), id: uid() }));
    if (g.has('mask')) {
      c.mask = clone(src.mask);
      c.crop = clone(src.crop);
    }
    if (g.has('animation')) {
      c.animIn = clone(src.animIn);
      c.animOut = clone(src.animOut);
      c.transition = clone(src.transition);
    }
    if (g.has('audio')) {
      c.volume = src.volume;
      c.fadeIn = src.fadeIn;
      c.fadeOut = src.fadeOut;
      c.audioFx = clone(src.audioFx);
      if (src.keyframes.volume) c.keyframes.volume = clone(src.keyframes.volume);
      else delete c.keyframes.volume;
    }
  });
}

export function selectAll(): void {
  const p = st().project;
  select(p.tracks.filter((tr) => !tr.locked).flatMap((tr) => tr.clips.map((c) => c.id)));
}

export function detachAudio(clipId: string): void {
  const p = st().project;
  const f = findClip(p, clipId);
  if (!f || f.clip.type !== 'video' || !clipHasAudio(f.clip, mediaMap(p))) return;
  const src = f.clip;
  const audio = makeClip('audio', {
    name: src.name,
    mediaId: src.mediaId,
    start: src.start,
    duration: src.duration,
    in: src.in,
    speed: src.speed,
    volume: src.volume,
    fadeIn: src.fadeIn,
    fadeOut: src.fadeOut,
  });
  const free = freeTrack(p, 'audio', audio.start, clipEnd(audio));
  edit((d) => {
    const tr = free ? trackIn(d, free.id)! : addTrackDraft(d, 'audio');
    insertClip(tr, audio);
    const v = d.tracks.flatMap((x) => x.clips).find((c) => c.id === clipId);
    if (v) v.muted = true;
  });
}

export function setSpeed(clipId: string, speed: number): void {
  const p = st().project;
  const f = findClip(p, clipId);
  if (!f) return;
  const media = f.clip.mediaId ? p.media.find((m) => m.id === f.clip.mediaId) : undefined;
  edit((d) => setClipSpeed(d, clipId, clamp(speed, 0.1, 16), media));
}

function defaultParams(type: string): Record<string, number> | undefined {
  const def = getFx(type);
  return def ? Object.fromEntries(def.params.map((p) => [p.id, p.default])) : undefined;
}

export function applyTransition(clipId: string, type: string): void {
  const f = findClip(st().project, clipId);
  if (!f || f.clip.type === 'audio' || f.track.locked) return;
  updateClip(clipId, (c) => {
    c.transition.type = type;
    c.transition.params = defaultParams(type);
    if (c.transition.duration <= 0) c.transition.duration = 0.6;
  });
}

/** Appends a shader effect to the stack of each given clip. */
export function addEffect(clipIds: string[], type: string): void {
  const def = getFx(type);
  if (!def || def.kind !== 'effect') return;
  const p = st().project;
  const ids = clipIds.filter((id) => {
    const f = findClip(p, id);
    return f && f.clip.type !== 'audio' && f.clip.type !== 'color' && !f.track.locked;
  });
  if (ids.length === 0) {
    toast(t('toast.selectClipFirst'));
    return;
  }
  updateClips(ids, (c) => {
    c.effects.push({ id: uid(), type, enabled: true, params: defaultParams(type) ?? {} });
  });
}

export function removeEffect(clipId: string, effectId: string): void {
  updateClip(clipId, (c) => {
    c.effects = c.effects.filter((e) => e.id !== effectId);
  });
}

export function moveEffect(clipId: string, effectId: string, dir: -1 | 1): void {
  updateClip(clipId, (c) => {
    const i = c.effects.findIndex((e) => e.id === effectId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= c.effects.length) return;
    [c.effects[i], c.effects[j]] = [c.effects[j], c.effects[i]];
  });
}

export function applyFilter(clipIds: string[], filterId: string): void {
  const p = st().project;
  const ids = clipIds.filter((id) => {
    const f = findClip(p, id);
    return f && f.clip.type !== 'audio' && !f.track.locked;
  });
  if (ids.length === 0) {
    toast(t('toast.selectClipFirst'));
    return;
  }
  updateClips(ids, (c) => {
    c.filter.id = filterId;
    if (c.filter.amount <= 0) c.filter.amount = 100;
  });
}

/** Moves the selected clips by whole frames when nothing is in the way. */
export function nudgeSelection(frames: number): void {
  const ids = new Set(editableSelection());
  if (ids.size === 0) return;
  const dt = frames * frameLen();
  const p = st().project;
  for (const tr of p.tracks) {
    for (const c of tr.clips) {
      if (!ids.has(c.id)) continue;
      const start = c.start + dt;
      if (start < -EPS) return;
      const blocked = tr.clips.some((o) => !ids.has(o.id) && o.start < start + c.duration - EPS && clipEnd(o) > start + EPS);
      if (blocked) return;
    }
  }
  edit((d) => {
    for (const tr of d.tracks) {
      for (const c of tr.clips) if (ids.has(c.id)) c.start = Math.max(0, snapToFrame(c.start + dt, fps()));
      tr.clips.sort((a, b) => a.start - b.start);
    }
  });
}

/** Selects every clip starting at/after `time` (one track or all unlocked tracks). */
export function selectForward(time: number, trackId?: string): string[] {
  const p = st().project;
  const ids = p.tracks
    .filter((tr) => !tr.locked && (!trackId || tr.id === trackId))
    .flatMap((tr) => tr.clips.filter((c) => clipEnd(c) > time + EPS && c.start >= time - frameLen()).map((c) => c.id));
  select(ids);
  return ids;
}

function clipUnderPlayhead(types: Clip['type'][]): { clip: Clip; track: Track } | null {
  const s = st();
  const t0 = s.playhead;
  const inside = (c: Clip) => types.includes(c.type) && t0 >= c.start && t0 < clipEnd(c);
  for (const id of s.selection) {
    const f = findClip(s.project, id);
    if (f && inside(f.clip) && !f.track.locked) return f;
  }
  // Otherwise the topmost video track wins.
  const video = tracksOfKind(s.project, 'video').reverse();
  for (const tr of [...video, ...tracksOfKind(s.project, 'audio')]) {
    if (tr.locked) continue;
    const c = tr.clips.find(inside);
    if (c) return { clip: c, track: tr };
  }
  return null;
}

/** Inserts a still of the current frame, pushing the rest of the track right. */
export async function freezeFrame(seconds = 3): Promise<void> {
  const f = clipUnderPlayhead(['video']);
  if (!f) {
    toast(t('toast.noClipAtPlayhead'));
    return;
  }
  const m = st().project.media.find((x) => x.id === f.clip.mediaId);
  if (!m) return;
  const at = snapToFrame(st().playhead, fps());
  const sourceTime = Math.min(m.duration - 0.5 / fps(), f.clip.in + (at - f.clip.start) * f.clip.speed);
  try {
    const png = await api.extractFrame(m.path, Math.max(0, sourceTime));
    const [still] = await importFiles([png]);
    if (!still) return;
    const freeze = makeClip('image', {
      name: `${t('tool.freeze')} · ${m.name}`,
      mediaId: still.id,
      start: at,
      duration: seconds,
      transform: structuredClone(f.clip.transform),
      crop: structuredClone(f.clip.crop),
      adjust: structuredClone(f.clip.adjust),
      filter: structuredClone(f.clip.filter),
      chroma: structuredClone(f.clip.chroma),
      blend: f.clip.blend,
      keyframes: {},
    });
    edit((d) => {
      const tr = trackIn(d, f.track.id);
      if (!tr) return;
      splitClip(tr, f.clip.id, at, frameLen());
      openGap(tr, at, seconds);
      insertClip(tr, freeze);
    });
    select([freeze.id]);
  } catch (e) {
    toast(errText(e), 'error');
  }
}

/** Replaces a clip's media with a reversed copy of the range it uses. */
export async function reverseClip(clipId: string): Promise<void> {
  const p = st().project;
  const f = findClip(p, clipId);
  if (!f || (f.clip.type !== 'video' && f.clip.type !== 'audio')) return;
  const m = p.media.find((x) => x.id === f.clip.mediaId);
  if (!m) return;
  toast(t('toast.reversing', { name: m.name }));
  try {
    const out = await api.reverseRange(m.path, f.clip.in, f.clip.duration * f.clip.speed, m.hasAudio);
    const [rev] = await importFiles([out]);
    if (!rev) return;
    updateClip(clipId, (c) => {
      c.mediaId = rev.id;
      c.in = 0;
      c.name = `${m.name} (${t('tool.reverse').toLowerCase()})`;
    });
    toast(t('toast.reversed'), 'success');
  } catch (e) {
    toast(errText(e), 'error');
  }
}

export function closeTrackGaps(trackId: string): void {
  edit((d) => {
    const tr = trackIn(d, trackId);
    if (tr) closeGaps(tr);
  });
}

// ---------------------------------------------------------------------------
// Tracks and markers

export function addTrack(kind: TrackKind): void {
  edit((d) => {
    addTrackDraft(d, kind);
  });
}

export function removeTrack(trackId: string): void {
  const p = st().project;
  const tr = findTrack(p, trackId);
  if (!tr) return;
  if (tracksOfKind(p, tr.kind).length <= 1) return;
  edit((d) => {
    d.tracks = d.tracks.filter((x) => x.id !== trackId);
  });
}

export function setTrackFlag(trackId: string, flag: 'muted' | 'hidden' | 'locked' | 'solo', value: boolean): void {
  edit((d) => {
    const tr = trackIn(d, trackId);
    if (tr) tr[flag] = value;
  });
}

export function renameTrack(trackId: string, name: string): void {
  edit((d) => {
    const tr = trackIn(d, trackId);
    if (tr && name.trim()) tr.name = name.trim();
  });
}

export function addMarker(time = st().playhead): void {
  const tt = snapToFrame(time, fps());
  if (st().project.markers.some((m) => Math.abs(m.time - tt) < EPS)) return;
  edit((d) => {
    d.markers.push({ id: uid(), time: tt, label: '', color: '#ffb300' });
    d.markers.sort((a, b) => a.time - b.time);
  });
}

/** Sets the in (I) or out (O) mark at the playhead; an inverted range is fixed up. */
export function setMark(which: 'in' | 'out', time = st().playhead): void {
  const tt = snapToFrame(time, fps());
  edit((d) => {
    if (which === 'in') d.markIn = tt;
    else d.markOut = tt;
    if (d.markIn != null && d.markOut != null && d.markOut <= d.markIn) {
      if (which === 'in') d.markOut = null;
      else d.markIn = null;
    }
  });
}

export function clearMarks(): void {
  edit((d) => {
    d.markIn = null;
    d.markOut = null;
  });
}

/** The marked range, completed with the project bounds when one mark is missing. */
export function markedRange(): { start: number; end: number } | null {
  const p = st().project;
  if (p.markIn == null && p.markOut == null) return null;
  const end = p.markOut ?? projectDuration(p);
  const start = p.markIn ?? 0;
  return end > start ? { start, end } : null;
}

export function removeMarker(id: string): void {
  edit((d) => {
    d.markers = d.markers.filter((m) => m.id !== id);
  });
}

/** Overwrites [start, end) on a track (used by drag & drop moves). */
export function clearTrackRange(d: Draft<Project>, trackId: string, start: number, end: number, exclude: Set<string>): void {
  const tr = trackIn(d, trackId);
  if (tr) clearRange(tr, start, end, exclude);
}

// ---------------------------------------------------------------------------
// Navigation helpers

export function editPoints(): number[] {
  const p = st().project;
  const set = new Set<number>([0]);
  for (const tr of p.tracks) for (const c of tr.clips) {
    set.add(Math.round(c.start * 1000) / 1000);
    set.add(Math.round(clipEnd(c) * 1000) / 1000);
  }
  for (const m of p.markers) set.add(Math.round(m.time * 1000) / 1000);
  return [...set].sort((a, b) => a - b);
}

export function setLeftTab(tab: LeftTab): void {
  useEditor.setState({ leftTab: tab });
}

export function zoomBy(factor: number): void {
  useEditor.setState((s) => ({ pxPerSec: clamp(s.pxPerSec * factor, 2, 1200) }));
}

export function zoomToFit(viewportWidth: number): void {
  const dur = Math.max(5, projectDuration(st().project));
  useEditor.setState({ pxPerSec: clamp((viewportWidth - 40) / dur, 2, 1200) });
}

// ---------------------------------------------------------------------------
// Project files

function closePrompt() {
  return { message: t('close.message'), detail: t('close.detail'), cancel: t('close.cancel'), discard: t('close.discard') };
}

export function syncDirtyFlag(): void {
  api.setDirty(isDirty(), closePrompt());
}

function confirmDiscard(): boolean {
  return !isDirty() || window.confirm(t('confirm.discard'));
}

export function newProject(): void {
  if (!confirmDiscard()) return;
  clearWaveforms();
  loadProject(createProject(t('top.untitled')), null);
}

export async function openProjectFile(path?: string): Promise<void> {
  if (!confirmDiscard()) return;
  const file = path ?? (await api.openProjectDialog());
  if (!file) return;
  if (!(await api.exists(file))) {
    forgetRecent(file);
    toast(t('toast.openFailed', { err: file }), 'error');
    return;
  }
  try {
    const text = await api.readText(file);
    const project = normalizeProject(JSON.parse(text));
    clearWaveforms();
    registerProjectFx(project);
    loadProject(project, file);
    rememberRecent(file, project.name);
    for (const m of project.media) void analyzeMedia(m);
  } catch (e) {
    toast(t('toast.openFailed', { err: errText(e) }), 'error');
  }
}

export async function saveProject(saveAs = false): Promise<boolean> {
  commitPreview();
  const s = st();
  let file = s.filePath;
  if (!file || saveAs) {
    const base = (s.project.name || t('top.untitled')).replace(/[\\/:*?"<>|]/g, '_');
    file = await api.saveFileDialog(`${base}.vrproj`, [{ name: `${APP_NAME} project`, extensions: ['vrproj'] }]);
    if (!file) return false;
  }
  try {
    await api.writeText(file, JSON.stringify(withEmbeddedFx(s.project), null, 1), true);
    markSaved(file);
    rememberRecent(file, s.project.name);
    clearAutosave();
    toast(t('toast.saved'), 'success');
    return true;
  } catch (e) {
    toast(t('toast.saveFailed', { err: errText(e) }), 'error');
    return false;
  }
}

export function openDialog(dialog: DialogKind): void {
  useEditor.setState({ dialog });
}
