// Auto montage: the chosen videos and photos cut to the beat of a song, with
// transitions, a punch-in on every cut and a blurred fill for pictures of another
// shape. The result is ordinary clips on two new tracks, made in one undo step.
import { api } from '../api';
import { analyzeBeats } from '../core/beats';
import { emptySlot, makeClip } from '../core/project';
import { snapToFrame } from '../core/time';
import type { Clip, MediaAsset } from '../core/types';
import { t } from '../i18n';
import { adaptToFirstMedia, addTrackDraft } from './actions';
import { edit, select, toast, useEditor } from './editor';

/** Beats per shot; 'auto' aims at shots of about one to two seconds. */
export type MontageRhythm = 'auto' | 1 | 2 | 4;
export type MontageStyle = 'cut' | 'smooth' | 'dynamic';

export interface MontageOptions {
  musicId: string;
  mediaIds: string[];
  rhythm: MontageRhythm;
  style: MontageStyle;
  shuffle: boolean;
  /** A quick zoom that settles on every cut. */
  punch: boolean;
  /** Seconds of music to use; null for the whole song. */
  length: number | null;
}

export interface MontageResult {
  shots: number;
  bpm: number;
}

const DYNAMIC = ['zoomIn', 'slideLeft', 'spin', 'wipeRight', 'pushUp', 'blur', 'zoomOut', 'iris', 'slideRight', 'wipeDiagonal'];
const MIN_SHOT = 0.35;

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Cut times from 0 to `length`: every `step`-th beat, or a steady pace when no beat is found. */
export function cutTimes(beats: number[], length: number, rhythm: MontageRhythm): number[] {
  const usable = beats.filter((b) => b > MIN_SHOT && b < length - MIN_SHOT);
  let step: number;
  if (rhythm !== 'auto') step = rhythm;
  else {
    const period = usable.length > 1 ? (usable[usable.length - 1] - usable[0]) / (usable.length - 1) : 0;
    // About 1–2 s per shot whatever the tempo.
    step = period <= 0 ? 1 : Math.max(1, Math.min(8, Math.round(1.4 / period)));
    if (step > 2 && step < 4) step = 4;
    if (step > 4) step = 8;
  }
  let cuts: number[];
  if (usable.length < 2) {
    // No clear beat (speech, ambient music): a steady two-second pace.
    cuts = [];
    for (let x = 2; x < length - MIN_SHOT; x += 2) cuts.push(x);
  } else {
    cuts = usable.filter((_, i) => i % step === step - 1);
  }
  const out = [0];
  for (const c of cuts) if (c - out[out.length - 1] >= MIN_SHOT) out.push(c);
  if (length - out[out.length - 1] < MIN_SHOT && out.length > 1) out.pop();
  out.push(length);
  return out;
}

export async function buildMontage(o: MontageOptions): Promise<MontageResult> {
  const p = useEditor.getState().project;
  const music = p.media.find((m) => m.id === o.musicId);
  const pics = o.mediaIds
    .map((id) => p.media.find((m) => m.id === id))
    .filter((m): m is MediaAsset => !!m && (m.kind === 'video' || m.kind === 'image') && !emptySlot(m));
  if (!music || pics.length === 0) throw new Error(t('mt.needBoth'));
  const length = Math.max(1, Math.min(music.duration, o.length ?? music.duration));
  const pcm = await api.readPcm(music.path, 0, length);
  const { bpm, beats } = analyzeBeats(pcm, 16000);

  adaptToFirstMedia(pics[0]);
  const { fps, width: W, height: H } = useEditor.getState().project.settings;
  const cuts = cutTimes(beats, length, o.rhythm).map((x) => snapToFrame(x, fps));
  const start = useEditor.getState().project.tracks.some((tr) => tr.clips.length) ? snapToFrame(useEditor.getState().playhead, fps) : 0;

  // Pictures go round in turn (or shuffled each round); each video continues where it stopped.
  const cursor = new Map<string, number>();
  let order = o.shuffle ? shuffled(pics) : pics;
  const clips: Clip[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    if (i > 0 && i % pics.length === 0 && o.shuffle) order = shuffled(pics);
    const m = order[i % order.length];
    const dur = cuts[i + 1] - cuts[i];
    const c = makeClip(m.kind === 'image' ? 'image' : 'video', { name: m.name, mediaId: m.id, start: start + cuts[i], duration: dur });
    if (m.kind === 'video') {
      let from = cursor.get(m.id) ?? 0;
      if (from + dur > m.duration) from = 0;
      if (dur > m.duration && m.duration > 0) c.speed = Math.max(0.25, Math.round((m.duration / dur) * 1000) / 1000);
      c.in = from;
      cursor.set(m.id, from + dur * c.speed);
    }
    // Pictures of another shape than the frame get a blurred fill instead of black bars.
    if (m.width && m.height && Math.abs(m.width / m.height - W / H) > 0.05) c.bgFill = 'blur';
    if (i > 0 && o.style !== 'cut') {
      c.transition = { type: o.style === 'smooth' ? 'dissolve' : DYNAMIC[(i - 1) % DYNAMIC.length], duration: Math.min(o.style === 'smooth' ? 0.4 : 0.3, dur * 0.4) };
    }
    // Photos slowly zoom in (a Ken Burns move) so they do not look frozen.
    const drift = m.kind === 'image' ? 1.07 : 1;
    if (o.punch) {
      c.keyframes.scale = [
        { t: 0, v: 1.08, ease: 'easeOut' },
        { t: Math.min(0.3, dur * 0.5), v: 1, ease: 'linear' },
        ...(drift !== 1 ? [{ t: dur, v: drift, ease: 'linear' as const }] : []),
      ];
    } else if (drift !== 1) {
      c.keyframes.scale = [
        { t: 0, v: 1, ease: 'linear' },
        { t: dur, v: drift, ease: 'linear' },
      ];
    }
    clips.push(c);
  }
  const song = makeClip('audio', { name: music.name, mediaId: music.id, start, duration: length, fadeOut: Math.min(2, length * 0.1) });

  edit((d) => {
    // Empty tracks are used first; otherwise new ones keep existing work untouched.
    const empty = (kind: 'video' | 'audio') => d.tracks.find((tr) => tr.kind === kind && !tr.locked && tr.clips.length === 0);
    const video = empty('video') ?? addTrackDraft(d, 'video');
    for (const c of clips) video.clips.push(c);
    const audio = empty('audio') ?? addTrackDraft(d, 'audio');
    audio.clips.push(song);
  });
  select(clips.map((c) => c.id));
  toast(t('mt.done', { n: clips.length, bpm: Math.round(bpm) || '—' }), 'success');
  return { shots: clips.length, bpm };
}
