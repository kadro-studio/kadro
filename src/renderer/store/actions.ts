// High-level editing commands used by menus, shortcuts and panels.
import type { Draft } from 'immer';
import {
  clipEnd,
  createProject,
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
  placeClip,
  removeClips,
  rippleDelete,
  setClipSpeed,
} from '../core/edit';
import { edgePartners, insertGap, relink, splitLinked, withPartners } from '../core/links';
import { TEXT_PRESETS } from '../core/textPresets';
import { clamp, EPS, snapToFrame } from '../core/time';
import type { Clip, ClipType, FadeCurve, Marker, MediaAsset, Project, ShapeKind, Track, TrackKind } from '../core/types';
import type { I18nKey } from '../i18n';
import { clipHasAudio } from '../core/scene';
import { clearWaveforms } from '../engine/waveforms';
import { api } from '../api';
import { ask, askText } from './prompt';
import { APP_NAME } from '../../shared/brand';
import { t, useLang } from '../i18n';
import { fxName } from '../engine/fx/types';
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
import { forgetRecent, rememberRecent, setPrefs, usePrefs } from './prefs';
import { applyLookTo, prepareLook, scaledTextStyle, usePresets } from './presets';

/** Length of photos, titles and elements when added (Preferences → General). */
function stillDuration(): number {
  return Math.max(0.5, usePrefs.getState().stillDuration || 5);
}
import { clearAutosave } from './autosave';
import { getFx } from '../engine/fx/registry';
import { loadLut } from '../engine/lut';
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
export function addTrackDraft(d: Draft<Project>, kind: TrackKind): Track {
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

/**
 * Audio track for the sound of a video placed on `video`: the one with the same
 * number (V1 → A1) when it has room, else any with room, else a new one. Music
 * already there is never overwritten. In an insert edit the same-number track
 * is used, as the insert makes room on it.
 */
function soundTrackFor(d: Draft<Project>, video: Track, sound: Clip, insert: boolean): Track {
  const audio = d.tracks.filter((tr) => tr.kind === 'audio');
  const same = audio[d.tracks.filter((tr) => tr.kind === 'video').indexOf(video)];
  if (same && !same.locked && (insert || isFree(same, sound.start, clipEnd(sound)))) return same;
  const free = insert ? undefined : audio.find((tr) => !tr.locked && isFree(tr, sound.start, clipEnd(sound)));
  return free ?? addTrackDraft(d, 'audio');
}

/** Puts a new clip on the timeline; `sound` is a video's own sound, placed on an audio track below it. */
function placeNewClip(clip: Clip, kind: TrackKind, opts: PlaceOptions, sound?: Clip): void {
  const p = st().project;
  clip.start = snapToFrame(Math.max(0, opts.time ?? st().playhead), fps());
  const end = clipEnd(clip);
  if (sound) sound.start = clip.start;
  edit((d) => {
    let track: Track | undefined;
    if (opts.trackId && !opts.newTrack) {
      const target = trackIn(d, opts.trackId);
      if (target && target.kind === kind && !target.locked) track = target;
    }
    if (opts.newTrack) {
      track = addTrackDraft(d, kind);
      insertClip(track, clip);
    } else if (track && opts.insert) {
      // Cut whatever straddles the insertion point and push the rest (with linked sound) right.
      const soundTrack = sound ? soundTrackFor(d, track, sound, true) : null;
      insertGap(d, soundTrack ? [track.id, soundTrack.id] : [track.id], clip.start, clip.duration, frameLen(), st().linking);
      insertClip(track, clip);
      if (sound && soundTrack) insertClip(soundTrack, sound);
      return;
    } else if (track && opts.overwrite) {
      placeClip(track, clip);
    } else {
      if (!track || !isFree(track, clip.start, end)) {
        const free = freeTrack(p, kind, clip.start, end, opts.trackId);
        track = free ? trackIn(d, free.id) : addTrackDraft(d, kind);
      }
      insertClip(track!, clip);
    }
    if (sound) insertClip(soundTrackFor(d, track!, sound, false), sound);
  });
  select(sound ? [clip.id, sound.id] : [clip.id]);
}

function clipTypeFor(media: MediaAsset): ClipType {
  return media.kind === 'image' ? 'image' : media.kind === 'audio' ? 'audio' : 'video';
}

const COMMON_FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60];
const evenPx = (n: number) => Math.max(16, Math.round(n / 2) * 2);

/**
 * A new project in automatic format takes the size and frame rate of the first
 * video or photo put on the timeline (a phone's vertical video makes it vertical).
 * Photos and very large videos are scaled down to a sensible frame.
 */
export function adaptToFirstMedia(m: MediaAsset): void {
  const p = st().project;
  if (!p.autoFormat || (m.kind !== 'video' && m.kind !== 'image') || !m.width || !m.height) return;
  if (p.tracks.some((tr) => tr.clips.some((c) => c.mediaId && c.type !== 'audio'))) return;
  const limit = m.kind === 'image' ? 1920 : 3840;
  const k = Math.min(1, limit / Math.max(m.width, m.height));
  const width = evenPx(m.width * k);
  const height = evenPx(m.height * k);
  const near = m.kind === 'video' && m.fps > 0 ? COMMON_FPS.reduce((a, b) => (Math.abs(b - m.fps) < Math.abs(a - m.fps) ? b : a)) : 0;
  const fps = near && Math.abs(near - m.fps) < 0.6 ? near : p.settings.fps;
  edit((d) => {
    d.settings.width = width;
    d.settings.height = height;
    d.settings.fps = fps;
    delete d.autoFormat;
  });
  toast(t('project.adapted', { w: width, h: height, fps }));
}

export function addMediaClip(mediaId: string, opts: PlaceOptions = {}): void {
  const media = st().project.media.find((m) => m.id === mediaId);
  if (!media) return;
  adaptToFirstMedia(media);
  let type = clipTypeFor(media);
  let kind: TrackKind = type === 'audio' ? 'audio' : 'video';
  // A video dropped on an audio track contributes only its sound.
  const target = opts.trackId ? findTrack(st().project, opts.trackId) : null;
  if (target && target.kind === 'audio' && type === 'video' && media.hasAudio) {
    type = 'audio';
    kind = 'audio';
  }
  const timeBased = type === 'video' || type === 'audio';
  const duration = timeBased && media.duration > 0 ? media.duration : stillDuration();
  const clip = makeClip(type, { name: media.name, mediaId, duration });
  // Like Vegas: a video's sound goes to an audio track, linked to the picture.
  if (type === 'video' && media.hasAudio && usePrefs.getState().splitAudio) {
    clip.link = uid();
    clip.detached = true;
    placeNewClip(clip, kind, opts, makeClip('audio', { name: media.name, mediaId, duration, link: clip.link }));
    return;
  }
  placeNewClip(clip, kind, opts);
}

export function addTextClip(presetId: string, opts: PlaceOptions = {}, content?: string): void {
  const preset = TEXT_PRESETS.find((p) => p.id === presetId) ?? TEXT_PRESETS[0];
  const { width, height } = st().project.settings;
  const k = Math.min(width, height) / 1080;
  const style = { ...defaultTextStyle(), ...preset.style, content: content ?? t(preset.sampleKey) };
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

/** Title in one of the user's saved styles. */
export function addTextFromPreset(presetId: string, opts: PlaceOptions = {}): void {
  const preset = usePresets.getState().text.find((p) => p.id === presetId);
  if (!preset) return;
  const frame = st().project.settings;
  const style = scaledTextStyle(preset, frame);
  const clip = makeClip('text', {
    name: style.content.split('\n')[0],
    duration: DEFAULT_TEXT_DURATION,
    text: style,
    animIn: { ...preset.animIn },
    animOut: { ...preset.animOut },
  });
  clip.transform.x = Math.round(preset.x * frame.width);
  clip.transform.y = Math.round(preset.y * frame.height);
  placeNewClip(clip, 'video', opts);
}

/** Applies one of the user's saved looks (colour + effects) to clips. */
export async function applyLookPreset(clipIds: string[], presetId: string): Promise<void> {
  const preset = usePresets.getState().looks.find((p) => p.id === presetId);
  if (!preset) return;
  const p = st().project;
  const ids = clipIds.filter((id) => {
    const f = findClip(p, id);
    return f && f.clip.type !== 'audio' && !f.track.locked;
  });
  if (ids.length === 0) {
    toast(t('toast.selectClipFirst'));
    return;
  }
  await prepareLook(preset.look);
  updateClips(ids, (c) => applyLookTo(c, preset.look));
}

/** Puts a LUT from the library on clips. */
export async function applyLutToClips(clipIds: string[], lut: { path: string; name: string }): Promise<void> {
  const p = st().project;
  const ids = clipIds.filter((id) => {
    const f = findClip(p, id);
    return f && f.clip.type !== 'audio' && !f.track.locked;
  });
  if (ids.length === 0) {
    toast(t('toast.selectClipFirst'));
    return;
  }
  if (!(await loadLut(lut.path))) {
    toast(t('toast.lutFailed'), 'error');
    return;
  }
  updateClips(ids, (c) => {
    c.lut = { path: lut.path, name: lut.name, amount: 100 };
  });
}

/** Adjustment layer: effects and colour on it apply to all tracks below. */
export function addAdjustmentClip(opts: PlaceOptions = {}): void {
  const clip = makeClip('adjustment', { name: t('elements.adjustment'), duration: stillDuration() });
  placeNewClip(clip, 'video', opts);
}

export function addShapeClip(kind: ShapeKind, opts: PlaceOptions = {}): void {
  const clip = makeClip('shape', { name: t(`shape.${kind}` as I18nKey), duration: stillDuration(), shape: defaultShape(kind) });
  placeNewClip(clip, 'video', opts);
}

/** Animated generator element (overlay or background). */
export function addOverlayClip(defId: string, opts: PlaceOptions = {}): void {
  const def = getFx(defId);
  if (!def || def.kind !== 'generator') return;
  const colors = def.colors ?? ['#ffffff', '#ffffff'];
  const clip = makeClip('overlay', {
    name: fxName(def, useLang.getState().lang),
    duration: stillDuration(),
    overlay: { id: def.id, params: {}, colorA: colors[0], colorB: colors[1] },
    blend: (def.blend as Clip['blend']) ?? 'normal',
  });
  placeNewClip(clip, 'video', opts);
}

/** Emoji sticker: a text layer drawn with the colour emoji font. */
export function addSticker(emoji: string, opts: PlaceOptions = {}): void {
  const { width, height } = st().project.settings;
  const k = Math.min(width, height) / 1080;
  const clip = makeClip('text', {
    name: emoji,
    duration: 3,
    text: { ...defaultTextStyle(), content: emoji, fontFamily: 'Segoe UI Emoji', fontSize: Math.round(260 * k), bold: false, weight: 400 },
  });
  clip.animIn = { type: 'pop', duration: 0.4 };
  clip.animOut = { type: 'fade', duration: 0.3 };
  placeNewClip(clip, 'video', opts);
}

export function addColorClip(color: string, opts: PlaceOptions = {}): void {
  const clip = makeClip('color', { name: color, color, duration: stillDuration() });
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

/** Cuts clips at `time` (the selection, or everything there); linked partners are cut with them. */
export function splitAt(time: number, ids?: string[], linked = st().linking): void {
  const p = st().project;
  const tt = snapToFrame(time, fps());
  let targets = ids ?? editableSelection();
  if (linked) targets = withPartners(p, targets);
  targets = targets.filter((id) => {
    const f = findClip(p, id);
    return f && !f.track.locked && tt > f.clip.start && tt < clipEnd(f.clip);
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
    const done = new Set<string>();
    for (const id of targets) {
      if (done.has(id)) continue;
      for (const [from, right] of splitLinked(d, id, tt, frameLen(), linked)) {
        done.add(from);
        newIds.push(right);
      }
    }
  });
  if (st().selection.length > 0) select(newIds);
}

export function splitAtPlayhead(): void {
  splitAt(st().playhead);
}

/** Cuts every unlocked track at `time`, whatever is selected. */
export function splitAllTracks(time = st().playhead): void {
  const tt = snapToFrame(time, fps());
  const ids = st()
    .project.tracks.filter((tr) => !tr.locked)
    .flatMap((tr) => tr.clips.filter((c) => tt > c.start && tt < clipEnd(c)).map((c) => c.id));
  if (ids.length === 0) {
    toast(t('toast.noClipAtPlayhead'));
    return;
  }
  splitAt(tt, ids);
}

/** Mutes the selected clips, or unmutes them when all are muted already. */
export function toggleMuteSelection(): void {
  const p = st().project;
  const media = mediaMap(p);
  const ids = editableSelection().filter((id) => {
    const f = findClip(p, id);
    return f && clipHasAudio(f.clip, media);
  });
  if (ids.length === 0) return;
  const mute = ids.some((id) => !findClip(p, id)!.clip.muted);
  updateClips(ids, (c) => {
    c.muted = mute;
  });
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
    const copies: Clip[] = [];
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
      copies.push(copy);
      newIds.push(copy.id);
    }
    relink(copies);
  });
  select(newIds);
}

/** Text our last clip copy left on the system clipboard (see pasteFromClipboard). */
let copyMark: string | null = null;

export function copySelection(): void {
  const p = st().project;
  const found = st().selection.map((id) => findClip(p, id)).filter((f) => !!f);
  if (found.length === 0) return;
  const minStart = Math.min(...found.map((f) => f.clip.start));
  useEditor.setState({
    clipboard: { clips: found.map((f) => ({ clip: { ...structuredClone(f.clip), start: f.clip.start - minStart }, trackId: f.track.id })) },
  });
  // Like any copy, this replaces what other programs copied: their files or text no longer win on paste.
  copyMark = found.map((f) => f.clip.name).join('\n') || APP_NAME;
  void api.writeClipboardText(copyMark).catch(() => (copyMark = null));
}

/**
 * Ctrl+V: whatever was copied last. Files and pictures from other programs go to
 * the media bin and onto the timeline at the playhead (or the given time), text becomes a title, and
 * clips copied here are pasted as before.
 */
export async function pasteFromClipboard(time = st().playhead): Promise<void> {
  const sys = await api.readClipboard().catch(() => null);
  if (sys?.files.length) {
    const assets = await importFiles(sys.files);
    // Pictures saved from the clipboard get a readable name instead of their hash.
    const pictures = assets.filter((a) => /^pasted-[0-9a-f]{12}\.(png|jpg)$/.test(a.name)).map((a) => a.id);
    if (pictures.length) {
      edit((d) => {
        for (const m of d.media) if (pictures.includes(m.id)) m.name = t('paste.picture');
      });
    }
    let at = time;
    const ids: string[] = [];
    for (const a of assets) {
      addMediaClip(a.id, { time: at });
      const added = findClip(st().project, st().selection[0] ?? '')?.clip;
      if (!added) continue;
      ids.push(added.id);
      at = clipEnd(added);
    }
    if (ids.length) {
      select(ids);
      toast(t('paste.media', { n: ids.length }), 'success');
    }
    return;
  }
  const text = sys?.text.trim() ?? '';
  const cb = st().clipboard;
  if (text && text !== copyMark?.trim()) {
    addTextClip('title', { time }, text.slice(0, 1000));
    return;
  }
  if (cb && cb.clips.length) paste(time);
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
    const copies: Clip[] = [];
    for (const { clip, trackId } of cb.clips) {
      const kind: TrackKind = clip.type === 'audio' ? 'audio' : 'video';
      let tr = trackIn(d, trackId);
      if (!tr || tr.locked || tr.kind !== kind) tr = d.tracks.find((x) => x.kind === kind && !x.locked) ?? addTrackDraft(d, kind);
      const copy = { ...structuredClone(clip), id: uid(), start: at + clip.start };
      placeClip(tr, copy);
      copies.push(copy);
      newIds.push(copy.id);
    }
    relink(copies);
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
      c.bgFill = src.bgFill;
      c.bgColor = src.bgColor;
      c.bgBlur = src.bgBlur;
      for (const p of ['x', 'y', 'scale', 'rotation', 'opacity'] as const) {
        if (src.keyframes[p]) c.keyframes[p] = clone(src.keyframes[p]);
        else delete c.keyframes[p];
      }
    }
    if (g.has('color')) {
      c.adjust = clone(src.adjust);
      c.filter = clone(src.filter);
      c.lut = clone(src.lut);
      c.wheels = clone(src.wheels);
      c.curves = clone(src.curves);
      c.hsl = clone(src.hsl);
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

/** Moves a video's sound to a linked clip on an audio track; the video itself falls silent. */
export function detachAudio(clipId: string): void {
  const p = st().project;
  const f = findClip(p, clipId);
  if (!f || f.clip.type !== 'video' || !clipHasAudio(f.clip, mediaMap(p))) return;
  const src = f.clip;
  const link = src.link ?? uid();
  const audio = makeClip('audio', {
    name: src.name,
    mediaId: src.mediaId,
    start: src.start,
    duration: src.duration,
    in: src.in,
    speed: src.speed,
    volume: src.volume,
    muted: src.muted,
    fadeIn: src.fadeIn,
    fadeOut: src.fadeOut,
    fadeInCurve: src.fadeInCurve,
    fadeOutCurve: src.fadeOutCurve,
    audioFx: structuredClone(src.audioFx),
    keyframes: src.keyframes.volume ? { volume: structuredClone(src.keyframes.volume) } : {},
    link,
  });
  edit((d) => {
    const v = d.tracks.flatMap((x) => x.clips).find((c) => c.id === clipId);
    const vt = d.tracks.find((x) => x.clips.some((c) => c.id === clipId));
    if (!v || !vt) return;
    insertClip(soundTrackFor(d, vt, audio, false), audio);
    v.detached = true;
    v.link = link;
  });
  select([clipId, audio.id]);
}

/** Gives a video whose separate sound was deleted its own sound back. */
export function restoreAudio(clipId: string): void {
  updateClip(clipId, (c) => {
    c.detached = false;
    delete c.link;
  });
}

/** Links clips so they are selected, moved, trimmed and cut together. */
export function linkClips(ids: string[]): void {
  const editable = ids.filter((id) => findClip(st().project, id));
  if (editable.length < 2) return;
  const link = uid();
  updateClips(editable, (c) => {
    c.link = link;
  });
  toast(t('link.done', { n: editable.length }), 'success');
}

/** Unlinks clips from their partners, so each is edited on its own. */
export function unlinkClips(ids: string[]): void {
  const all = withPartners(st().project, ids);
  if (all.length === 0) return;
  updateClips(all, (c) => {
    delete c.link;
  });
  select(ids);
}

export const FADE_CURVES: FadeCurve[] = ['fast', 'linear', 'slow', 'smooth', 'sharp'];

/** Changes a clip's fade-in or fade-out (length and/or curve), and the linked partners' at the same edge. */
export function setFade(clipId: string, side: 'in' | 'out', patch: { len?: number; curve?: FadeCurve }): void {
  const p = st().project;
  const f = findClip(p, clipId);
  if (!f) return;
  const ids = [clipId, ...(st().linking ? edgePartners(p, f.clip, side === 'in' ? 'l' : 'r').map((x) => x.clip.id) : [])];
  updateClips(ids, (c) => {
    if (patch.len !== undefined) {
      const len = clamp(patch.len, 0, Math.max(0, c.duration - (side === 'in' ? c.fadeOut : c.fadeIn)));
      if (side === 'in') c.fadeIn = len;
      else c.fadeOut = len;
    }
    if (patch.curve) {
      if (side === 'in') c.fadeInCurve = patch.curve;
      else c.fadeOutCurve = patch.curve;
    }
  });
}

/** Recipe that changes playback speed; the linked sound or picture keeps pace. */
export function speedRecipe(clipId: string, speed: number): (d: Draft<Project>) => void {
  const p = st().project;
  const ids = (st().linking ? withPartners(p, [clipId]) : [clipId]).filter((id) => {
    const type = findClip(p, id)?.clip.type;
    return type === 'video' || type === 'audio';
  });
  return (d) => {
    for (const id of ids) {
      const mediaId = findClip(p, id)?.clip.mediaId;
      setClipSpeed(d, id, clamp(speed, 0.1, 16), mediaId ? p.media.find((m) => m.id === mediaId) : undefined);
    }
  };
}

export function setSpeed(clipId: string, speed: number): void {
  if (findClip(st().project, clipId)) edit(speedRecipe(clipId, speed));
}

function defaultParams(type: string): Record<string, number> | undefined {
  const def = getFx(type);
  return def ? Object.fromEntries(def.params.map((p) => [p.id, p.default])) : undefined;
}

export function applyTransition(clipId: string, type: string): void {
  const f = findClip(st().project, clipId);
  if (!f || f.clip.type === 'audio' || f.track.locked) return;
  updateClip(clipId, (c) => {
    // A new transition gets the user's default length; replacing one keeps its length.
    if (c.transition.type === 'none' || c.transition.duration <= 0) c.transition.duration = usePrefs.getState().transitionDuration;
    c.transition.type = type;
    c.transition.params = defaultParams(type);
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
      // The linked sound gets the same pause, so it stays in sync after the frozen frame.
      insertGap(d, [tr.id], at, seconds, frameLen(), st().linking);
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
    // A linked partner playing the same part of the same file is reversed with it.
    const same = (c: Clip) =>
      c.mediaId === f.clip.mediaId && Math.abs(c.in - f.clip.in) < 1e-3 && Math.abs(c.duration * c.speed - f.clip.duration * f.clip.speed) < 1e-3;
    const ids = st().linking && m.hasAudio ? withPartners(p, [clipId]).filter((id) => { const g = findClip(p, id); return g && same(g.clip); }) : [clipId];
    updateClips(ids, (c) => {
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

export function updateMarker(id: string, patch: Partial<Omit<Marker, 'id'>>): void {
  edit((d) => {
    const m = d.markers.find((x) => x.id === id);
    if (m) Object.assign(m, patch);
    d.markers.sort((a, b) => a.time - b.time);
  });
}

export async function renameMarker(id: string): Promise<void> {
  const m = st().project.markers.find((x) => x.id === id);
  if (!m) return;
  const label = await askText({ title: t('marker.rename'), value: m.label, placeholder: t('marker.placeholder'), ok: t('common.ok'), cancel: t('common.cancel') });
  if (label !== null) updateMarker(id, { label: label.trim() });
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

/** Save / don't save / cancel for unsaved changes; true when it is fine to continue. */
export async function confirmDiscard(): Promise<boolean> {
  if (!isDirty()) return true;
  const choice = await ask({
    title: t('prompt.saveTitle', { name: st().project.name }),
    message: t('prompt.saveText'),
    icon: 'warning',
    buttons: [
      { id: 'cancel', label: t('common.cancel') },
      { id: 'discard', label: t('prompt.dontSave'), kind: 'danger' },
      { id: 'save', label: t('prompt.save'), kind: 'primary' },
    ],
    cancelId: 'cancel',
  });
  if (choice === 'save') return saveProject();
  return choice === 'discard';
}

/** Window close requested by the system while there are unsaved changes. */
export async function handleCloseRequest(): Promise<void> {
  if (await confirmDiscard()) api.closeNow();
}

/** An empty project in the user's default format for new projects. */
export function freshProject(name = t('top.untitled')): Project {
  const prefs = usePrefs.getState();
  const p = createProject(name);
  const m = /^(\d+)x(\d+)$/.exec(prefs.newProjectFormat);
  if (m) p.settings = { ...p.settings, width: Number(m[1]), height: Number(m[2]), fps: prefs.newProjectFps };
  else p.autoFormat = true;
  return p;
}

/** File → New: asks for the format first. */
export async function newProject(): Promise<void> {
  if (!(await confirmDiscard())) return;
  openDialog('newProject');
}

/** Creates the project chosen in the New project window ('auto' or 'WxH'). */
export function createNewProject(name: string, format: string, fps: number): void {
  setPrefs({ newProjectFormat: format, newProjectFps: fps });
  clearWaveforms();
  loadProject(freshProject(name.trim() || t('top.untitled')), null);
}

export async function openProjectFile(path?: string): Promise<void> {
  if (!(await confirmDiscard())) return;
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
