// AI features built on the worker: automatic subtitles and background removal.
import { api } from '../api';
import { mediaUrl } from '../../shared/api';
import { clipEnd, defaultTextStyle, findClip, makeClip, makeTrack, mediaMap, nextTrackName, projectDuration } from '../core/project';
import { clipHasAudio } from '../core/scene';
import { TEXT_PRESETS } from '../core/textPresets';
import { formatTimecode } from '../core/time';
import type { Clip } from '../core/types';
import { mediaWorker } from '../engine/mediaWorker';
import { runExport } from '../engine/exporter';
import { t } from '../i18n';
import { edit, select, useEditor } from '../store/editor';
import { importFiles } from '../store/media';
import { updateClip } from '../store/actions';
import { matte, transcribe } from './client';
import { MATTE_MODEL, type AiProgress, type AsrChunk } from './protocol';

export interface CancelFlag {
  cancelled: boolean;
}

const MAX_LINE = 42;

/** Breaks a caption into at most two balanced lines. */
function wrapCaption(text: string): string {
  if (text.length <= MAX_LINE) return text;
  const words = text.split(/\s+/);
  let best = text;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = `${a}\n${b}`;
    }
  }
  return best;
}

/** Adds subtitle text clips on a new top video track as one undo step. */
export function placeSubtitles(chunks: AsrChunk[], offset: number, speed: number, wrap = true): number {
  const p = useEditor.getState().project;
  const { width, height } = p.settings;
  const k = Math.min(width, height) / 1080;
  const preset = TEXT_PRESETS.find((x) => x.id === 'caption')!;
  const style = { ...defaultTextStyle(), ...preset.style };
  style.fontSize = Math.round(style.fontSize * k);
  style.backgroundPadding = Math.round(style.backgroundPadding * k);
  const clips: Clip[] = [];
  let lastEnd = 0;
  for (const c of chunks) {
    const start = Math.max(lastEnd, offset + c.start / speed);
    const end = Math.max(start + 0.6, offset + c.end / speed);
    const content = wrap ? wrapCaption(c.text) : c.text;
    const clip = makeClip('text', { name: content.split('\n')[0], start, duration: end - start, text: { ...style, content } });
    clip.transform.y = Math.round(preset.y * height);
    clips.push(clip);
    lastEnd = end;
  }
  if (clips.length === 0) return 0;
  edit((d) => {
    const track = makeTrack('video', nextTrackName(d, 'video'));
    track.name = t('ai.subsTrack');
    track.clips = clips;
    const lastVideo = d.tracks.map((tr) => tr.kind).lastIndexOf('video');
    d.tracks.splice(lastVideo + 1, 0, track);
  });
  select(clips.map((c) => c.id));
  return clips.length;
}

/**
 * Transcribes the selected clip (or the whole project mix) and adds subtitles.
 * Returns the number of captions added.
 */
export async function autoSubtitles(
  opts: { model: string; language: string | null; clipId: string | null },
  onProgress: (p: AiProgress) => void,
): Promise<number> {
  const p = useEditor.getState().project;
  const media = mediaMap(p);
  let audio: Float32Array;
  let offset = 0;
  let speed = 1;
  const found = opts.clipId ? findClip(p, opts.clipId) : null;
  if (found && clipHasAudio(found.clip, media) && found.clip.mediaId) {
    const m = media.get(found.clip.mediaId)!;
    audio = await api.readPcm(m.path, found.clip.in, found.clip.duration * found.clip.speed);
    offset = found.clip.start;
    speed = found.clip.speed;
  } else {
    // Whole project: render the audio mix once, then transcribe it.
    const wav = await api.workPath('mix.wav');
    const r = await runExport({ outPath: wav, format: 'wav', width: 2, height: 2, fps: 30, quality: 'medium' }, () => undefined, { cancelled: false });
    if (!r.ok) throw new Error(r.error ?? 'mix failed');
    audio = await api.readPcm(wav, 0, projectDuration(p));
  }
  if (audio.length < 1600) throw new Error(t('ai.noAudio'));
  const chunks = await transcribe(audio, opts.model, opts.language, onProgress);
  return placeSubtitles(chunks, offset, speed);
}

function srtTime(t0: number): string {
  // HH:MM:SS,mmm
  const ms = Math.round(t0 * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

/** Writes the text clips (the subtitle track if there is one) as an .srt file. */
export async function exportSrt(): Promise<boolean> {
  const p = useEditor.getState().project;
  const subsTrack = p.tracks.find((tr) => tr.name === t('ai.subsTrack') && tr.clips.some((c) => c.type === 'text'));
  const clips = (subsTrack ? subsTrack.clips : p.tracks.flatMap((tr) => tr.clips))
    .filter((c) => c.type === 'text' && c.text)
    .sort((a, b) => a.start - b.start);
  if (clips.length === 0) return false;
  const body = clips.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(clipEnd(c))}\n${c.text!.content}\n`).join('\n');
  const path = await api.saveFileDialog(`${p.name || 'subtitles'}.srt`, [{ name: 'SubRip', extensions: ['srt'] }]);
  if (!path) return false;
  await api.writeText(path, body);
  return true;
}

async function loadImagePixels(url: string): Promise<{ data: Uint8ClampedArray; width: number; height: number; canvas: HTMLCanvasElement }> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height, canvas };
}

/**
 * Removes the background of an image or video clip with an AI matte and
 * replaces the clip's media with a transparent copy (PNG or VP9 WebM).
 */
export async function removeBackground(clipId: string, onProgress: (p: AiProgress) => void, cancel: CancelFlag): Promise<void> {
  const p = useEditor.getState().project;
  const found = findClip(p, clipId);
  const m = found?.clip.mediaId ? p.media.find((x) => x.id === found.clip.mediaId) : undefined;
  if (!found || !m || (found.clip.type !== 'video' && found.clip.type !== 'image')) throw new Error(t('toast.selectClipFirst'));
  const clip = found.clip;
  const base = m.name.replace(/\.[^.]+$/, '');

  if (clip.type === 'image') {
    const rt = useEditor.getState().runtime[m.id];
    const { data, width, height, canvas } = await loadImagePixels(mediaUrl(rt?.proxyPath ?? m.path));
    const alpha = await matte(new Uint8Array(data), width, height, MATTE_MODEL.id, onProgress);
    const ctx = canvas.getContext('2d')!;
    const out = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < alpha.length; i++) out.data[i * 4 + 3] = alpha[i];
    ctx.putImageData(out, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('PNG encoding failed');
    const path = await api.workPath(`${base}-nobg.png`);
    await api.writeBinary(path, new Uint8Array(await blob.arrayBuffer()));
    const [asset] = await importFiles([path]);
    if (asset) updateClip(clipId, (c) => void (c.mediaId = asset.id));
    return;
  }

  // Video: matte every source frame at reduced size, then bake it at full resolution.
  const fps = m.fps || 30;
  const sourceDuration = clip.duration * clip.speed;
  const scale = Math.min(1, 512 / Math.max(m.width, m.height));
  const mw = Math.max(2, Math.round((m.width * scale) / 2) * 2);
  const mh = Math.max(2, Math.round((m.height * scale) / 2) * 2);
  const total = Math.max(1, Math.round(sourceDuration * fps));
  const out = await api.workPath(`${base}-nobg.webm`);
  const dec = await mediaWorker.decoderOpen({ path: m.path, sourceIn: clip.in, speed: 1, fps, width: mw, height: mh, duration: sourceDuration, format: 'rgba' });
  const job = await mediaWorker.matteStart({
    source: m.path,
    sourceIn: clip.in,
    duration: sourceDuration,
    fps,
    matteWidth: mw,
    matteHeight: mh,
    withAudio: m.hasAudio,
    outPath: out,
  });
  try {
    let last: Uint8Array | null = null;
    for (let k = 0; k < total; k++) {
      if (cancel.cancelled) throw new Error('cancelled');
      const frame = await mediaWorker.decoderRead(dec);
      const alpha: Uint8Array | null = frame ? await matte(frame, mw, mh, MATTE_MODEL.id, onProgress) : last;
      if (!alpha) break;
      last = alpha;
      await mediaWorker.exportFrame(job, alpha.slice());
      onProgress({ stage: 'frames', progress: (k + 1) / total, file: `${formatTimecode(k / fps, fps)}` });
    }
    const r = await mediaWorker.exportFinish(job);
    if (!r.ok) throw new Error(r.error ?? 'Encoding failed');
  } catch (e) {
    await mediaWorker.exportCancel(job);
    throw e;
  } finally {
    await mediaWorker.decoderClose(dec);
  }
  const [asset] = await importFiles([out]);
  if (asset) {
    updateClip(clipId, (c) => {
      c.mediaId = asset.id;
      c.in = 0;
    });
  }
}
