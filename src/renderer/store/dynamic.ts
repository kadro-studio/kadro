// Dynamic editing tools: speed ramps, camera moves, effects on the beat, zoom
// cuts and boomerangs. Each one is a single undo step.
import type { Draft } from 'immer';
import { api } from '../api';
import { analyzeBeats } from '../core/beats';
import { beatKeyframes, cameraMove, everyNth, rampPieces, type BeatFx, type CameraMove, type RampPreset } from '../core/dynamic';
import { cloneClip, insertClip } from '../core/edit';
import { shiftKeyframes } from '../core/keyframes';
import { edgePartners, insertGap } from '../core/links';
import { clipEnd, findClip, isTimeBased, mediaMap, sortClips, uid } from '../core/project';
import { clipHasAudio } from '../core/scene';
import { EPS, snapToFrame } from '../core/time';
import type { AnimProp, Clip, Project } from '../core/types';
import { t } from '../i18n';
import { edit, select, toast, useEditor } from './editor';
import { errText, importFiles } from './media';

const st = () => useEditor.getState();

function draftClip(d: Draft<Project>, id: string): { clip: Draft<Clip>; track: Draft<Project>['tracks'][number] } | null {
  for (const track of d.tracks) {
    const clip = track.clips.find((c) => c.id === id);
    if (clip) return { clip, track };
  }
  return null;
}

/** Visual clips among the ids (or the selection). */
function visualTargets(ids: string[]): Clip[] {
  const p = st().project;
  return ids
    .map((id) => findClip(p, id))
    .filter((f): f is NonNullable<typeof f> => !!f && !f.track.locked && f.clip.type !== 'audio')
    .map((f) => f.clip);
}

// ---------------------------------------------------------------------------
// Speed ramp

/**
 * Turns a video clip into a speed ramp. Its linked sound gets the same pieces
 * (or is muted when `keepSound` is off). Later clips on those tracks follow
 * the new length. Returns the number of pieces.
 */
export function applySpeedRamp(clipId: string, preset: RampPreset, strength: number, keepSound: boolean): number {
  const p = st().project;
  const f = findClip(p, clipId);
  if (!f || f.track.locked || f.clip.type !== 'video') return 0;
  const fps = p.settings.fps;
  const clip = f.clip;
  const pieces = rampPieces(preset, strength, clip.in, clip.duration * clip.speed, fps);
  if (pieces.length < 2) return 0;
  // The linked sound covering exactly the same part goes along.
  const sounds = st().linking
    ? edgePartners(p, clip, 'l').filter((x) => edgePartners(p, clip, 'r').some((y) => y.clip.id === x.clip.id) && isTimeBased(x.clip) && !x.track.locked)
    : [];
  const total = pieces[pieces.length - 1].start + pieces[pieces.length - 1].duration;
  const delta = total - clip.duration;
  const made: string[][] = pieces.map(() => []);
  // All pieces, picture and sound, share one link: the ramp is selected, moved and deleted as one clip.
  const link = uid();
  edit((d) => {
    for (const id of [clipId, ...sounds.map((x) => x.clip.id)]) {
      const found = draftClip(d, id);
      const src = findClip(p, id)?.clip;
      if (!found || !src) continue;
      const { track } = found;
      const oldEnd = clipEnd(src);
      const silent = !keepSound && (src.type === 'audio' || !src.detached);
      const parts = pieces.map((pc, i) => {
        const c = cloneClip(src);
        c.start = src.start + pc.start;
        c.duration = pc.duration;
        c.in = pc.in;
        c.speed = pc.speed;
        // Keyframes keep their place in the source as well as they can.
        shiftKeyframes(c, -(pc.in - src.in) / src.speed);
        if (i > 0) {
          c.transition = { ...c.transition, type: 'none' };
          c.animIn = { ...c.animIn, type: 'none' };
          c.fadeIn = 0;
        }
        if (i < pieces.length - 1) {
          c.animOut = { ...c.animOut, type: 'none' };
          c.fadeOut = 0;
        }
        c.link = link;
        if (silent) c.muted = true;
        made[i].push(c.id);
        return c;
      });
      track.clips = track.clips.filter((c) => c.id !== id);
      for (const c of track.clips) if (c.start >= oldEnd - EPS) c.start = Math.max(0, c.start + delta);
      track.clips.push(...parts);
      sortClips(track);
    }
  });
  select(made.flat());
  return pieces.length;
}

// ---------------------------------------------------------------------------
// Camera moves and effects on the beat (keyframes)

function baseOf(c: Clip) {
  return { x: c.transform.x, y: c.transform.y, scale: c.transform.scale, rotation: c.transform.rotation, opacity: c.transform.opacity };
}

/** Puts a camera move (zoom, pan, handheld…) over each of the clips. Returns how many got it. */
export function applyCameraMove(ids: string[], move: CameraMove, strength: number): number {
  const targets = visualTargets(ids);
  if (targets.length === 0) return 0;
  const { width: w, height: h } = st().project.settings;
  edit((d) => {
    for (const target of targets) {
      const c = draftClip(d, target.id)?.clip;
      if (!c) continue;
      const r = cameraMove(move, c.duration, baseOf(target), { w, h }, strength);
      for (const prop of ['x', 'y', 'scale', 'rotation'] as const) {
        // A new move replaces an earlier one rather than piling on top of it.
        delete c.keyframes[prop];
        if (r.statics[prop] !== undefined) c.transform[prop] = r.statics[prop]!;
      }
      for (const [prop, kfs] of Object.entries(r.keyframes) as [AnimProp, Clip['keyframes'][AnimProp]][]) c.keyframes[prop] = kfs;
    }
  });
  return targets.length;
}

/** Removes keyframed motion (moves and beat effects) from the clips. */
export function clearMotion(ids: string[]): void {
  const targets = visualTargets(ids);
  edit((d) => {
    for (const target of targets) {
      const c = draftClip(d, target.id)?.clip;
      if (!c) continue;
      for (const prop of ['x', 'y', 'scale', 'rotation', 'opacity'] as const) {
        const kfs = c.keyframes[prop];
        if (!kfs?.length) continue;
        c.transform[prop] = kfs[0].v;
        delete c.keyframes[prop];
      }
    }
  });
}

export type BeatSource = { kind: 'markers' } | { kind: 'music'; clipId: string };

/** Beat times on the timeline: the project's markers, or the beat of a music clip. */
export async function beatTimes(source: BeatSource): Promise<{ times: number[]; bpm: number }> {
  const p = st().project;
  if (source.kind === 'markers') return { times: p.markers.map((m) => m.time).sort((a, b) => a - b), bpm: 0 };
  const f = findClip(p, source.clipId);
  const media = mediaMap(p);
  const m = f?.clip.mediaId ? media.get(f.clip.mediaId) : undefined;
  if (!f || !m || !clipHasAudio(f.clip, media)) return { times: [], bpm: 0 };
  const pcm = await api.readPcm(m.path, f.clip.in, f.clip.duration * f.clip.speed);
  const a = analyzeBeats(pcm, 16000);
  const fps = p.settings.fps;
  return { times: a.beats.map((s) => snapToFrame(f.clip.start + s / f.clip.speed, fps)).filter((x) => x >= f.clip.start && x < clipEnd(f.clip)), bpm: a.bpm };
}

/** Adds a punch, shake, swing or blink at every n-th beat over the clips. Returns the number of hits. */
export function applyBeatFx(ids: string[], fx: BeatFx, times: number[], every: number, strength: number): number {
  const targets = visualTargets(ids);
  const { width: w, height: h } = st().project.settings;
  const beats = everyNth(times, every);
  let hits = 0;
  edit((d) => {
    for (const target of targets) {
      const c = draftClip(d, target.id)?.clip;
      if (!c) continue;
      const local = beats.map((b) => b - target.start).filter((b) => b >= 0 && b < target.duration);
      if (local.length === 0) continue;
      hits += local.length;
      const kfs = beatKeyframes(fx, local, target.duration, baseOf(target), { w, h }, strength);
      for (const [prop, list] of Object.entries(kfs) as [AnimProp, Clip['keyframes'][AnimProp]][]) c.keyframes[prop] = list;
    }
  });
  return hits;
}

// ---------------------------------------------------------------------------
// Zoom cuts

/**
 * Alternates a punch-in on consecutive clips (the classic talking-head cut):
 * every second clip is `amount` larger. With one clip given, its whole track
 * is used. `push` adds a slow zoom inside each clip. Returns the clips changed.
 */
export function applyZoomCuts(ids: string[], amount: number, push: boolean): number {
  const p = st().project;
  let targets = visualTargets(ids);
  if (targets.length === 1) {
    const f = findClip(p, targets[0].id);
    targets = f ? f.track.clips.filter((c) => c.type !== 'audio') : targets;
  }
  targets = [...targets].sort((a, b) => a.start - b.start);
  if (targets.length < 2) return 0;
  const base = targets[0].keyframes.scale?.[0]?.v ?? targets[0].transform.scale;
  edit((d) => {
    targets.forEach((target, i) => {
      const c = draftClip(d, target.id)?.clip;
      if (!c) return;
      const s = base * (i % 2 ? 1 + amount : 1);
      c.transform.scale = s;
      if (push) {
        c.keyframes.scale = [
          { t: 0, v: s, ease: 'linear' },
          { t: c.duration, v: s * 1.05, ease: 'linear' },
        ];
      } else {
        delete c.keyframes.scale;
      }
    });
  });
  return targets.length;
}

// ---------------------------------------------------------------------------
// Boomerang

/**
 * Plays a video clip forwards and then backwards (`cycles` times there and
 * back), pushing later clips along. The backward parts are silent.
 */
export async function makeBoomerang(clipId: string, cycles = 1): Promise<boolean> {
  const p = st().project;
  const f = findClip(p, clipId);
  const m = f?.clip.mediaId ? mediaMap(p).get(f.clip.mediaId) : undefined;
  if (!f || !m || f.clip.type !== 'video' || f.track.locked) return false;
  const clip = f.clip;
  toast(t('dyn.boomerangWorking'));
  try {
    const out = await api.reverseRange(m.path, clip.in, clip.duration * clip.speed, false);
    const [rev] = await importFiles([out]);
    if (!rev) return false;
    const fps = p.settings.fps;
    const n = Math.max(1, Math.min(4, Math.round(cycles)));
    const parts: Clip[] = [];
    for (let i = 0; i < n * 2 - 1; i++) {
      const c = cloneClip(clip);
      const backwards = i % 2 === 0;
      c.start = clipEnd(clip) + i * clip.duration;
      c.mediaId = backwards ? rev.id : clip.mediaId;
      c.in = backwards ? 0 : clip.in;
      c.name = backwards ? `${clip.name} (${t('tool.reverse').toLowerCase()})` : clip.name;
      c.transition = { ...c.transition, type: 'none' };
      c.animIn = { ...c.animIn, type: 'none' };
      c.fadeIn = 0;
      delete c.link;
      // The way back has no sound; a video carrying its own sound keeps it on the way forward.
      c.detached = backwards || clip.detached;
      parts.push(c);
    }
    const ids: string[] = [];
    edit((d) => {
      const track = d.tracks.find((tr) => tr.id === f.track.id);
      if (!track) return;
      insertGap(d, [track.id], clipEnd(clip), clip.duration * parts.length, 1 / fps, st().linking);
      for (const c of parts) {
        insertClip(track, c);
        ids.push(c.id);
      }
    });
    select([clipId, ...ids]);
    toast(t('dyn.boomerangDone'), 'success');
    return true;
  } catch (e) {
    toast(errText(e), 'error');
    return false;
  }
}
