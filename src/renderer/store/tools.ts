// Editing assistants: cut at shot changes, beat markers, music ducking and
// subtitle import.
import { api } from '../api';
import { placeSubtitles } from '../ai/tasks';
import { analyzeBeats } from '../core/beats';
import { clipEnd, findClip, mediaMap, uid } from '../core/project';
import { clipHasAudio } from '../core/scene';
import { splitClip } from '../core/edit';
import { snapToFrame } from '../core/time';
import type { Keyframe } from '../core/types';
import { getWaveform } from '../engine/waveforms';
import { t } from '../i18n';
import { edit, select, toast, useEditor } from './editor';
import { errText } from './media';

const st = () => useEditor.getState();

/** Splits a video clip wherever the picture cuts to a new shot. Returns the number of cuts. */
export async function splitAtScenes(clipId: string, sensitivity: number): Promise<number> {
  const p = st().project;
  const f = findClip(p, clipId);
  const m = f?.clip.mediaId ? mediaMap(p).get(f.clip.mediaId) : undefined;
  if (!f || !m || f.clip.type !== 'video') return 0;
  const { clip } = f;
  // Higher sensitivity → lower scene-score threshold.
  const threshold = 0.55 - (Math.max(0, Math.min(100, sensitivity)) / 100) * 0.4;
  let cuts: number[];
  try {
    cuts = await api.detectScenes(m.path, clip.in, clip.duration * clip.speed, threshold);
  } catch (e) {
    toast(errText(e), 'error');
    return 0;
  }
  const fps = p.settings.fps;
  const times = cuts.map((s) => snapToFrame(clip.start + s / clip.speed, fps)).filter((x) => x > clip.start && x < clipEnd(clip));
  if (times.length === 0) return 0;
  const ids: string[] = [clipId];
  edit((d) => {
    const track = d.tracks.find((tr) => tr.clips.some((c) => c.id === clipId));
    if (!track) return;
    // Right to left, so the original clip keeps its id as the first piece.
    for (const time of [...times].sort((a, b) => b - a)) {
      const right = splitClip(track, clipId, time, 1 / fps);
      if (right) ids.push(right);
    }
  });
  select(ids);
  return ids.length - 1;
}

/** Adds timeline markers on the beat of an audio clip. Returns { bpm, count }. */
export async function markBeats(clipId: string, mode: 'beats' | 'onsets'): Promise<{ bpm: number; count: number }> {
  const p = st().project;
  const f = findClip(p, clipId);
  const media = mediaMap(p);
  const m = f?.clip.mediaId ? media.get(f.clip.mediaId) : undefined;
  if (!f || !m || !clipHasAudio(f.clip, media)) return { bpm: 0, count: 0 };
  const { clip } = f;
  const pcm = await api.readPcm(m.path, clip.in, clip.duration * clip.speed);
  const analysis = analyzeBeats(pcm, 16000);
  const list = mode === 'beats' ? analysis.beats : analysis.onsets;
  const fps = p.settings.fps;
  const times = list.map((s) => snapToFrame(clip.start + s / clip.speed, fps)).filter((x) => x >= clip.start && x < clipEnd(clip));
  if (times.length === 0) return { bpm: analysis.bpm, count: 0 };
  edit((d) => {
    const existing = new Set(d.markers.map((mk) => Math.round(mk.time * fps)));
    times.forEach((time, i) => {
      if (existing.has(Math.round(time * fps))) return;
      // Every fourth beat (a likely bar start) stands out.
      d.markers.push({ id: uid(), time, label: '', color: mode === 'beats' && i % 4 === 0 ? '#ff3b4f' : '#ffb300' });
    });
    d.markers.sort((a, b) => a.time - b.time);
  });
  return { bpm: analysis.bpm, count: times.length };
}

const STEP = 0.02;

/**
 * Lowers a music clip wherever other clips have speech or sound, using volume
 * keyframes so the result stays editable. Returns the number of dips.
 */
export function duckUnderVoice(musicId: string, amountDb: number, sensitivity: number): number {
  const p = st().project;
  const media = mediaMap(p);
  const f = findClip(p, musicId);
  if (!f || !clipHasAudio(f.clip, media)) return 0;
  const music = f.clip;
  const steps = Math.ceil(music.duration / STEP);
  const active = new Uint8Array(steps);
  // Peaks are sqrt-scaled 0..255; higher sensitivity → lower threshold.
  const threshold = 0.42 - (Math.max(0, Math.min(100, sensitivity)) / 100) * 0.32;
  for (const tr of p.tracks) {
    if (tr.muted) continue;
    for (const c of tr.clips) {
      if (c.id === musicId || c.muted || !c.mediaId || !clipHasAudio(c, media)) continue;
      const peaks = getWaveform(c.mediaId);
      if (!peaks) continue;
      const a = Math.max(c.start, music.start);
      const b = Math.min(clipEnd(c), clipEnd(music));
      for (let time = a; time < b; time += STEP) {
        const src = c.in + (time - c.start) * c.speed;
        const level = (peaks[Math.floor(src * 100)] ?? 0) / 255;
        if (level > threshold) active[Math.floor((time - music.start) / STEP)] = 1;
      }
    }
  }
  // Runs of activity, bridging short pauses between words.
  const runs: [number, number][] = [];
  let i = 0;
  while (i < steps) {
    if (!active[i]) {
      i++;
      continue;
    }
    let j = i;
    let gap = 0;
    while (j < steps && gap < 0.45 / STEP) {
      gap = active[j] ? 0 : gap + 1;
      j++;
    }
    const end = j - gap;
    if ((end - i) * STEP >= 0.2) runs.push([i * STEP, end * STEP]);
    i = j;
  }
  if (runs.length === 0) return 0;
  const base = music.keyframes.volume?.length ? Math.max(...music.keyframes.volume.map((k) => k.v)) : music.volume;
  const low = base * 10 ** (amountDb / 20);
  const attack = 0.25;
  const release = 0.6;
  const keys: Keyframe[] = [];
  const push = (time: number, v: number) => {
    const tt = Math.min(music.duration, Math.max(0, time));
    const last = keys[keys.length - 1];
    if (last && tt <= last.t + 1e-3) {
      last.v = Math.min(last.v, v);
      return;
    }
    keys.push({ t: tt, v, ease: 'linear' });
  };
  for (const [a, b] of runs) {
    push(a - attack, base);
    push(a, low);
    push(b, low);
    push(b + release, base);
  }
  edit((d) => {
    const c = d.tracks.flatMap((tr) => tr.clips).find((x) => x.id === musicId);
    if (c) c.keyframes.volume = keys;
  });
  return runs.length;
}

// ---------------------------------------------------------------------------
// Subtitles

function parseTime(s: string): number {
  const m = /(?:(\d+):)?(\d+):(\d+)[,.](\d+)/.exec(s.trim());
  if (!m) return NaN;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(`0.${m[4]}`);
}

/** Cues from SubRip (.srt) or WebVTT (.vtt) text. */
export function parseSubtitles(text: string): { start: number; end: number; text: string }[] {
  const cues: { start: number; end: number; text: string }[] = [];
  const blocks = text.replace(/\r/g, '').replace(/^﻿/, '').split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [a, b] = lines[at].split('-->');
    const start = parseTime(a);
    const end = parseTime(b);
    const body = lines
      .slice(at + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\{\\[^}]*\}/g, '')
      .trim();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && body) cues.push({ start, end, text: body });
  }
  return cues;
}

export async function importSubtitles(): Promise<void> {
  const path = await api.openFileDialog([{ name: t('subs.files'), extensions: ['srt', 'vtt'] }]);
  if (!path) return;
  try {
    const cues = parseSubtitles(await api.readText(path));
    if (cues.length === 0) {
      toast(t('subs.none'), 'error');
      return;
    }
    const n = placeSubtitles(cues, 0, 1, false);
    toast(t('subs.imported', { n }), 'success');
  } catch (e) {
    toast(errText(e), 'error');
  }
}
