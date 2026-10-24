// Project templates (as in CapCut): a finished edit whose media are numbered
// slots. Starting from a template opens it as a new project; the user then puts
// their own clips into the slots and keeps the effects, transitions and titles.
//
// A template is a .kadroitem file { format, app, kind: 'template', name, data }
// where data = { project, luts }: the project carries its mod definitions, and
// the .cube text of every LUT it uses, since paths mean nothing on another computer.
import { create } from 'zustand';
import type { MediaProbe } from '../../shared/api';
import { APP_NAME } from '../../shared/brand';
import { api } from '../api';
import { emptySlot, normalizeProject, projectDuration } from '../core/project';
import type { Clip, MediaAsset, Project } from '../core/types';
import { clearWaveforms } from '../engine/waveforms';
import { t } from '../i18n';
import { confirmDiscard, openDialog } from './actions';
import { edit, loadProject, toast, useEditor } from './editor';
import { registerProjectFx, withEmbeddedFx } from './fxProject';
import { reloadLuts } from './luts';
import { analyzeMedia, assetFromProbe, errText } from './media';
import { confirmAction } from './prompt';

export interface TemplateLut {
  /** Key the template's clips use as their LUT path. */
  path: string;
  name: string;
  cube: string;
}

export interface TemplateData {
  project: Project;
  luts: TemplateLut[];
}

export interface TemplateEntry {
  file: string;
  path: string;
  name: string;
  data: TemplateData;
  slots: number;
  duration: number;
  /** Comes with the app (cannot be deleted). */
  builtin?: boolean;
}

export const useTemplates = create<{ list: TemplateEntry[] }>(() => ({ list: [] }));

/** Unfilled and filled slots of a project, in fill order. */
export function projectSlots(p: Project): MediaAsset[] {
  return p.media.filter((m) => m.slot).sort((a, b) => a.slot!.index - b.slot!.index);
}

function slotName(kind: MediaAsset['kind'], n: number): string {
  return t(kind === 'audio' ? 'tpl.slotAudio' : 'tpl.slotClip', { n });
}

/** Turns a project into template data: used media become slots, the rest is kept. */
export async function makeTemplateData(source: Project): Promise<TemplateData> {
  const p = structuredClone(withEmbeddedFx(source));
  const { width: W, height: H } = p.settings;
  // Slots are numbered by first use: pictures first, then sound.
  const firstUse = new Map<string, number>();
  const need = new Map<string, number>();
  for (const tr of p.tracks) {
    for (const c of tr.clips) {
      if (!c.mediaId) continue;
      firstUse.set(c.mediaId, Math.min(firstUse.get(c.mediaId) ?? Infinity, c.start));
      need.set(c.mediaId, Math.max(need.get(c.mediaId) ?? 0, c.duration * c.speed));
      // The author's offsets point into their own footage.
      c.in = 0;
    }
  }
  const used = p.media.filter((m) => firstUse.has(m.id));
  used.sort((a, b) => Number(a.kind === 'audio') - Number(b.kind === 'audio') || firstUse.get(a.id)! - firstUse.get(b.id)!);
  p.media = used.map((m, i): MediaAsset => {
    const visual = m.kind !== 'audio';
    return {
      id: m.id,
      name: slotName(m.kind, i + 1),
      path: '',
      kind: m.kind,
      duration: Math.max(0.1, need.get(m.id) ?? m.duration),
      width: visual ? m.width || W : 0,
      height: visual ? m.height || H : 0,
      fps: m.fps,
      hasAudio: false,
      hasVideo: visual,
      size: 0,
      slot: { index: i + 1 },
    };
  });

  // Clip names come from the author's file names: they become the slot names.
  const names = new Map(p.media.map((m) => [m.id, m.name]));
  for (const tr of p.tracks) for (const c of tr.clips) if (c.mediaId && names.has(c.mediaId)) c.name = names.get(c.mediaId)!;
  // Media that no clip uses is dropped above; so are clips pointing at missing media.
  for (const tr of p.tracks) tr.clips = tr.clips.filter((c) => !c.mediaId || names.has(c.mediaId));

  const luts: TemplateLut[] = [];
  const lutPaths = new Set(p.tracks.flatMap((tr) => tr.clips.flatMap((c) => (c.lut ? [c.lut.path] : []))));
  const keys = new Map<string, string>();
  for (const path of lutPaths) {
    const cube = await api.readText(path).catch(() => null);
    const clip = p.tracks.flatMap((tr) => tr.clips).find((c) => c.lut?.path === path);
    if (!cube || !/LUT_3D_SIZE/i.test(cube)) continue;
    // The author's path is replaced by a key: it only links clips to the LUT text.
    const key = `lut-${luts.length + 1}`;
    keys.set(path, key);
    luts.push({ path: key, name: clip?.lut?.name ?? 'LUT', cube });
  }
  // LUTs that could not be read are dropped rather than left pointing at nothing.
  for (const tr of p.tracks) for (const c of tr.clips) if (c.lut) c.lut = keys.has(c.lut.path) ? { ...c.lut, path: keys.get(c.lut.path)! } : null;
  p.markIn = null;
  p.markOut = null;
  return { project: p, luts };
}

export function templateText(name: string, data: TemplateData): string {
  return JSON.stringify({ format: 1, app: APP_NAME, kind: 'template', name, data });
}

/**
 * Reads template data from a file or the workshop. Every media entry becomes an
 * empty slot, so a template can never point at files on this computer.
 */
export function parseTemplateData(raw: unknown): TemplateData {
  const d = raw as Partial<TemplateData> | null;
  if (!d || typeof d !== 'object' || !d.project || typeof d.project !== 'object' || !Array.isArray(d.project.tracks)) throw new Error('Invalid template');
  const media = Array.isArray(d.project.media) ? d.project.media : [];
  const slotted = media
    .filter((m) => m && typeof m.id === 'string')
    .map((m, i) => ({ ...m, path: '', size: 0, credit: undefined, hasAudio: false, slot: { index: Number(m.slot?.index) || i + 1 } }));
  const project = normalizeProject({ ...d.project, media: slotted });
  const luts = (Array.isArray(d.luts) ? d.luts : []).filter(
    (l): l is TemplateLut => !!l && typeof l.path === 'string' && typeof l.cube === 'string' && /LUT_3D_SIZE/i.test(l.cube),
  );
  return { project, luts };
}

function entryFrom(file: string, path: string, text: string): TemplateEntry | null {
  try {
    const f = JSON.parse(text) as { kind?: string; name?: string; data?: unknown };
    if (f.kind !== 'template') return null;
    const data = parseTemplateData(f.data);
    return {
      file,
      path,
      name: (typeof f.name === 'string' && f.name.trim()) || data.project.name,
      data,
      slots: data.project.media.length,
      duration: projectDuration(data.project),
    };
  } catch {
    return null;
  }
}

export async function reloadTemplates(): Promise<void> {
  const files = await api.listTemplates().catch(() => []);
  useTemplates.setState({ list: files.map((f) => entryFrom(f.file, f.path, f.text)).filter((x): x is TemplateEntry => !!x) });
}

/** Saves template data into the library; returns the file path. */
export async function installTemplate(name: string, data: TemplateData): Promise<string> {
  const path = await api.saveTemplate(name, templateText(name, data));
  await reloadTemplates();
  return path;
}

export async function saveProjectAsTemplate(name: string): Promise<void> {
  const project = useEditor.getState().project;
  try {
    await installTemplate(name, await makeTemplateData(project));
    toast(t('tpl.saved', { name }), 'success');
  } catch (e) {
    toast(t('tpl.saveFailed', { err: errText(e) }), 'error');
  }
}

export async function removeTemplate(entry: TemplateEntry): Promise<void> {
  const ok = await confirmAction({ title: t('tpl.removeTitle', { name: entry.name }), confirm: t('common.delete'), cancel: t('common.cancel'), danger: true });
  if (!ok) return;
  await api.removeTemplate(entry.file);
  await reloadTemplates();
}

/** Opens a template as a new, unsaved project and asks for the clips. */
export async function startFromTemplate(entry: TemplateEntry): Promise<void> {
  if (!(await confirmDiscard())) return;
  const project = structuredClone(entry.data.project);
  project.name = entry.name;
  // Install the LUTs it carries and point the clips at the installed copies.
  const paths = new Map<string, string>();
  for (const lut of entry.data.luts) {
    const path = await api.installLutText(`${entry.name} — ${lut.name}`, lut.cube).catch(() => null);
    if (path) paths.set(lut.path, path);
  }
  if (paths.size) await reloadLuts();
  for (const tr of project.tracks) {
    for (const c of tr.clips) if (c.lut) c.lut = paths.has(c.lut.path) ? { ...c.lut, path: paths.get(c.lut.path)! } : null;
  }
  clearWaveforms();
  registerProjectFx(project);
  loadProject(project, null);
  for (const m of project.media) void analyzeMedia(m);
  openDialog(project.media.length ? 'fillTemplate' : null);
}

/** Fits a clip to new media: keep its place, slow down footage that is too short, cut sound that is. */
function fitClip(c: Clip, m: MediaAsset): void {
  if (c.type !== 'audio') c.type = m.kind === 'image' ? 'image' : 'video';
  if (m.kind === 'image') {
    c.in = 0;
    c.speed = 1;
    return;
  }
  const need = c.duration * c.speed;
  if (c.in + need > m.duration) c.in = Math.max(0, m.duration - need);
  if (need > m.duration && m.duration > 0 && c.type === 'audio') {
    // Shorter music is cut, not slowed down.
    c.in = 0;
    c.duration = m.duration / c.speed;
  } else if (need > m.duration && m.duration > 0) {
    c.in = 0;
    c.speed = Math.max(0.25, Math.round((m.duration / c.duration) * 1000) / 1000);
  }
}

/** Puts a file into a slot (or replaces the file already in it). */
export async function fillSlot(slotId: string, path: string): Promise<boolean> {
  const slot = useEditor.getState().project.media.find((m) => m.id === slotId);
  if (!slot?.slot) return false;
  let info: MediaProbe;
  try {
    info = await api.probe(path);
  } catch (e) {
    toast(t('toast.importFailed', { name: path.split(/[\\/]/).pop() ?? path, err: errText(e) }), 'error');
    return false;
  }
  const asset: MediaAsset = { ...assetFromProbe(info, path), id: slotId, slot: slot.slot };
  if (slot.kind !== 'audio' && !asset.hasVideo && asset.kind !== 'image') {
    toast(t('tpl.needPicture', { name: slot.name }), 'error');
    return false;
  }
  if (slot.kind === 'audio' && !asset.hasAudio) {
    toast(t('tpl.needSound', { name: slot.name }), 'error');
    return false;
  }
  edit((d) => {
    const i = d.media.findIndex((m) => m.id === slotId);
    if (i < 0) return;
    // The slot keeps its number and name, so it can be found and replaced later.
    d.media[i] = { ...asset, name: `${slot.name.split(' · ')[0]} · ${asset.name}` };
    for (const tr of d.tracks) {
      for (const c of tr.clips) {
        if (c.mediaId !== slotId) continue;
        fitClip(c, asset);
        c.name = asset.name;
      }
    }
  });
  void analyzeMedia(asset, info);
  return true;
}

/** Fills the empty slots in order with the given files; returns how many were used. */
export async function fillEmptySlots(paths: string[]): Promise<number> {
  const empty = projectSlots(useEditor.getState().project).filter(emptySlot);
  let used = 0;
  for (const slot of empty) {
    const path = paths[used];
    if (!path) break;
    used++;
    await fillSlot(slot.id, path);
  }
  if (paths.length > used) toast(t('tpl.extraFiles', { n: paths.length - used }));
  return used;
}

export async function fillSlotViaDialog(slotId: string): Promise<void> {
  const [path] = await api.openMediaDialog();
  if (path) await fillSlot(slotId, path);
}

export async function fillEmptySlotsViaDialog(): Promise<void> {
  const paths = await api.openMediaDialog();
  if (paths.length) await fillEmptySlots(paths);
}
