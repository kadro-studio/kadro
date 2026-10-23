// Importing media and preparing it for editing: probing, thumbnails,
// filmstrips, waveforms and (when Chromium can't play a file) proxies.
import { api } from '../api';
import { mediaUrl, type MediaProbe } from '../../shared/api';
import { emptySlot, findClip, uid } from '../core/project';
import type { MediaAsset } from '../core/types';
import { setWaveform } from '../engine/waveforms';
import { t } from '../i18n';
import { edit, setRuntime, toast, useEditor } from './editor';
import { usePrefs } from './prefs';
import { installMods } from './mods';
import { addUserFonts } from './userFonts';
import { installDroppedItems } from './workshop';
import { confirmAction } from './prompt';

const FONT_FILE = /\.(ttf|otf|woff2?)$/i;
const ITEM_FILE = /\.(kadroitem|cube)$/i;
const PLAYABLE_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1', 'theora']);
const PLAYABLE_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'pcm_u8']);

function samePath(a: string, b: string): boolean {
  return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();
}

function errText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

function testPlayback(url: string, kind: MediaAsset['kind']): Promise<boolean> {
  return new Promise((resolve) => {
    if (kind === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img.naturalWidth > 0);
      img.onerror = () => resolve(false);
      img.src = url;
      return;
    }
    const el = document.createElement(kind === 'audio' ? 'audio' : 'video');
    el.muted = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      el.removeAttribute('src');
      el.load();
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), 10000);
    el.onloadeddata = () => done(kind === 'audio' || (el as HTMLVideoElement).videoWidth > 0);
    el.onerror = () => done(false);
    el.src = url;
  });
}

async function needsProxy(asset: MediaAsset, info: MediaProbe | null): Promise<boolean> {
  if (info) {
    if (asset.kind === 'video' && info.videoCodec && !PLAYABLE_VIDEO.has(info.videoCodec)) return true;
    if (asset.kind !== 'image' && info.hasAudio && info.audioCodec && !PLAYABLE_AUDIO.has(info.audioCodec)) return true;
  }
  return !(await testPlayback(mediaUrl(asset.path), asset.kind));
}

/** Builds session-only data for a media asset. Safe to call again (results are cached on disk). */
export async function analyzeMedia(asset: MediaAsset, info: MediaProbe | null = null): Promise<void> {
  if (emptySlot(asset)) {
    setRuntime(asset.id, { status: 'ready', error: null });
    return;
  }
  setRuntime(asset.id, { status: 'pending', error: null });
  if (!(await api.exists(asset.path))) {
    setRuntime(asset.id, { status: 'missing' });
    return;
  }
  const thumbP = api.thumbnail(asset.path, asset.kind, asset.duration).then((thumb) => setRuntime(asset.id, { thumb }));
  const stripP =
    asset.kind === 'video'
      ? api.filmstrip(asset.path, asset.width, asset.height, asset.duration).then((filmstrip) => setRuntime(asset.id, { filmstrip }))
      : Promise.resolve();
  const waveP = asset.hasAudio
    ? api.waveform(asset.path).then((data) => {
        if (data) {
          setWaveform(asset.id, data);
          setRuntime(asset.id, { hasWaveform: true });
          useEditor.setState((s) => ({ waveVersion: s.waveVersion + 1 }));
        }
      })
    : Promise.resolve();

  try {
    if (await needsProxy(asset, info)) {
      setRuntime(asset.id, { status: 'proxying', progress: 0, proxyRequired: true });
      const proxyPath = await api.proxy(asset.path, asset.kind, asset.duration);
      setRuntime(asset.id, { proxyPath, status: 'ready', progress: 1 });
    } else {
      setRuntime(asset.id, { status: 'ready', proxyRequired: false });
      if (usePrefs.getState().autoProxy && isHeavy(asset)) void createEditingProxy(asset.id);
    }
  } catch (e) {
    setRuntime(asset.id, { status: 'error', error: errText(e) });
    toast(t('toast.proxyFailed', { name: asset.name, err: errText(e) }), 'error');
  }
  await Promise.allSettled([thumbP, stripP, waveP]);
}

/** Media above 1080p decodes too slowly for smooth multi-track preview. */
export function isHeavy(m: MediaAsset): boolean {
  return m.kind === 'video' && Math.max(m.width, m.height) > 1920;
}

/**
 * Builds a 1080p proxy in the background. The original stays usable meanwhile;
 * preview switches over when it is ready, export keeps using the original.
 */
export async function createEditingProxy(mediaId: string): Promise<void> {
  const m = useEditor.getState().project.media.find((x) => x.id === mediaId);
  const rt = useEditor.getState().runtime[mediaId];
  if (!m || m.kind !== 'video' || rt?.optimizing || rt?.proxyPath) return;
  setRuntime(mediaId, { optimizing: true, progress: 0 });
  try {
    const proxyPath = await api.proxy(m.path, m.kind, m.duration);
    setRuntime(mediaId, { proxyPath, optimizing: false, progress: 1 });
  } catch (e) {
    setRuntime(mediaId, { optimizing: false });
    toast(t('toast.proxyFailed', { name: m.name, err: errText(e) }), 'error');
  }
}

/** Drops an editing proxy so preview plays the original again. */
export function removeEditingProxy(mediaId: string): void {
  const rt = useEditor.getState().runtime[mediaId];
  if (rt && !rt.proxyRequired) setRuntime(mediaId, { proxyPath: null });
}

export function assetFromProbe(info: MediaProbe, path: string): MediaAsset {
  return {
    id: uid(),
    name: info.name,
    path,
    kind: info.kind,
    duration: info.duration,
    width: info.width,
    height: info.height,
    fps: info.fps,
    hasAudio: info.hasAudio,
    hasVideo: info.hasVideo,
    size: info.size,
    colorSpace: info.colorSpace,
    hasAlpha: info.hasAlpha,
  };
}

/** Imports files into the project; returns the assets (existing ones are reused). */
export async function importFiles(allPaths: string[]): Promise<MediaAsset[]> {
  // Mod files dropped anywhere are installed rather than imported as media.
  const modPaths = allPaths.filter((p) => p.toLowerCase().endsWith('.vrmod'));
  if (modPaths.length) void installMods(modPaths);
  // So are font files: they become available in the font picker.
  const fontPaths = allPaths.filter((p) => FONT_FILE.test(p));
  if (fontPaths.length) void addUserFonts(fontPaths);
  // Workshop files: filters, title styles and themes (.kadroitem) and LUTs (.cube).
  const itemPaths = allPaths.filter((p) => ITEM_FILE.test(p));
  if (itemPaths.length) void installDroppedItems(itemPaths);
  const paths = allPaths.filter((p) => !p.toLowerCase().endsWith('.vrmod') && !FONT_FILE.test(p) && !ITEM_FILE.test(p));
  const result: MediaAsset[] = [];
  for (const path of paths) {
    const existing = useEditor.getState().project.media.find((m) => samePath(m.path, path));
    if (existing) {
      result.push(existing);
      continue;
    }
    try {
      const info = await api.probe(path);
      const asset = assetFromProbe(info, path);
      edit((d) => {
        d.media.push(asset);
      });
      result.push(asset);
      void analyzeMedia(asset, info);
    } catch (e) {
      const name = path.split(/[\\/]/).pop() ?? path;
      toast(t('toast.importFailed', { name, err: errText(e) }), 'error');
    }
  }
  return result;
}

export async function importViaDialog(): Promise<MediaAsset[]> {
  const paths = await api.openMediaDialog();
  if (paths.length === 0) return [];
  return importFiles(paths);
}

export async function relinkMedia(mediaId: string): Promise<void> {
  const paths = await api.openMediaDialog();
  if (paths.length === 0) return;
  try {
    const info = await api.probe(paths[0]);
    const updated: MediaAsset = { ...assetFromProbe(info, paths[0]), id: mediaId };
    edit((d) => {
      const i = d.media.findIndex((x) => x.id === mediaId);
      if (i >= 0) d.media[i] = updated;
    });
    await analyzeMedia(updated, info);
  } catch (e) {
    toast(t('toast.importFailed', { name: paths[0], err: errText(e) }), 'error');
  }
}

export async function removeMedia(mediaId: string): Promise<void> {
  const p = useEditor.getState().project;
  const used = p.tracks.reduce((n, tr) => n + tr.clips.filter((c) => c.mediaId === mediaId).length, 0);
  if (used > 0) {
    const ok = await confirmAction({ title: t('prompt.removeTitle'), message: t('media.removeUsed', { n: used }), confirm: t('prompt.remove'), cancel: t('common.cancel'), danger: true });
    if (!ok) return;
  }
  edit((d) => {
    d.media = d.media.filter((m) => m.id !== mediaId);
    for (const tr of d.tracks) tr.clips = tr.clips.filter((c) => c.mediaId !== mediaId);
  });
  useEditor.setState((s) => ({ selection: s.selection.filter((id) => findClip(s.project, id)) }));
}

export function startProxyProgressListener(): () => void {
  return api.onProxyProgress((path, progress) => {
    const s = useEditor.getState();
    for (const m of s.project.media) {
      const rt = s.runtime[m.id];
      if (samePath(m.path, path) && (rt?.status === 'proxying' || rt?.optimizing)) setRuntime(m.id, { progress });
    }
  });
}

export { errText };
