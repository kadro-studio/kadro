// The user's own presets: title styles, looks (colour grade + effects) and
// export settings. Kept per user in localStorage and can be moved to another
// computer through a .kadropresets file.
import { create } from 'zustand';
import type { ExportFormat, ExportQuality } from '../../shared/api';
import { APP_NAME } from '../../shared/brand';
import { api } from '../api';
import { uid } from '../core/project';
import type { Adjust, Clip, ClipAnim, ClipEffect, ClipFilter, ClipLut, ColorWheels, Curves, HslAdjust, TextStyle } from '../core/types';
import { loadLut } from '../engine/lut';
import { t } from '../i18n';
import { toast } from './editor';
import { askText, confirmAction } from './prompt';

export interface TextPreset {
  id: string;
  name: string;
  style: TextStyle;
  animIn: ClipAnim;
  animOut: ClipAnim;
  /** Position as a fraction of the frame size (x, y from the centre). */
  x: number;
  y: number;
  /** Shorter side of the frame the style was made for; sizes scale from it. */
  ref: number;
}

export interface Look {
  adjust: Adjust;
  wheels: ColorWheels;
  curves: Curves | null;
  hsl: HslAdjust | null;
  filter: ClipFilter;
  lut: ClipLut | null;
  effects: ClipEffect[];
}

export interface LookPreset {
  id: string;
  name: string;
  look: Look;
}

export interface ExportPreset {
  id: string;
  name: string;
  format: ExportFormat;
  /** Shorter side of the output in pixels (keeps any project aspect ratio). */
  short: number;
  fps: number;
  quality: ExportQuality;
  /** Video bitrate in Mbit/s instead of the quality level. */
  bitrate?: number;
  /** Audio bitrate in kbit/s. */
  audioBitrate?: number;
}

export interface PresetsState {
  text: TextPreset[];
  looks: LookPreset[];
  exports: ExportPreset[];
}

export type PresetKind = keyof PresetsState;

const KEY = 'vr.presets';
const EMPTY: PresetsState = { text: [], looks: [], exports: [] };

function load(): PresetsState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<PresetsState> | null;
    return sanitize(raw);
  } catch {
    return { ...EMPTY };
  }
}

/** Keeps only well-formed entries (files from other versions or edited by hand). */
function sanitize(raw: Partial<PresetsState> | null): PresetsState {
  const list = <T extends { id: string; name: string }>(v: unknown, ok: (x: T) => boolean): T[] =>
    Array.isArray(v) ? (v as T[]).filter((x) => x && typeof x.name === 'string' && ok(x)).map((x) => ({ ...x, id: x.id || uid() })) : [];
  return {
    text: list<TextPreset>(raw?.text, (x) => !!x.style && typeof x.style.fontSize === 'number'),
    looks: list<LookPreset>(raw?.looks, (x) => !!x.look && !!x.look.adjust && Array.isArray(x.look.effects)),
    exports: list<ExportPreset>(raw?.exports, (x) => typeof x.format === 'string' && x.short > 0 && x.fps > 0),
  };
}

export const usePresets = create<PresetsState>(() => load());

usePresets.subscribe((p) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage unavailable
  }
});

function add<K extends PresetKind>(kind: K, item: PresetsState[K][number]): void {
  usePresets.setState((s) => ({ [kind]: [...s[kind], item] }) as Partial<PresetsState>);
}

async function askName(title: string, value: string): Promise<string | null> {
  const name = await askText({ title, value, placeholder: t('presets.namePlaceholder'), ok: t('common.save'), cancel: t('common.cancel') });
  return name && name.trim() ? name.trim() : null;
}

// ---------------------------------------------------------------------------
// Title styles

export async function saveTextPreset(clip: Clip, frame: { width: number; height: number }): Promise<void> {
  if (!clip.text) return;
  const name = await askName(t('presets.saveText'), clip.text.content.split('\n')[0].slice(0, 40));
  if (!name) return;
  add('text', {
    id: uid(),
    name,
    style: structuredClone(clip.text),
    animIn: { ...clip.animIn },
    animOut: { ...clip.animOut },
    x: clip.transform.x / frame.width,
    y: clip.transform.y / frame.height,
    ref: Math.min(frame.width, frame.height),
  });
  toast(t('presets.saved', { name }), 'success');
}

/** The style scaled for a frame of the given size. */
export function scaledTextStyle(p: TextPreset, frame: { width: number; height: number }): TextStyle {
  const k = Math.min(frame.width, frame.height) / p.ref;
  const s = structuredClone(p.style);
  s.fontSize = Math.max(1, Math.round(s.fontSize * k));
  s.strokeWidth = Math.round(s.strokeWidth * k * 10) / 10;
  s.shadowBlur = Math.round(s.shadowBlur * k);
  s.shadowX = Math.round(s.shadowX * k);
  s.shadowY = Math.round(s.shadowY * k);
  s.letterSpacing = Math.round(s.letterSpacing * k);
  s.backgroundPadding = Math.round(s.backgroundPadding * k);
  s.backgroundRadius = Math.round(s.backgroundRadius * k);
  return s;
}

// ---------------------------------------------------------------------------
// Looks

export function lookOf(c: Clip): Look {
  return structuredClone({ adjust: c.adjust, wheels: c.wheels, curves: c.curves, hsl: c.hsl, filter: c.filter, lut: c.lut, effects: c.effects });
}

export async function saveLookPreset(clip: Clip): Promise<void> {
  const name = await askName(t('presets.saveLook'), t('presets.lookDefault', { n: usePresets.getState().looks.length + 1 }));
  if (!name) return;
  add('looks', { id: uid(), name, look: lookOf(clip) });
  toast(t('presets.saved', { name }), 'success');
}

/** Writes a look onto a clip (inside an immer recipe). */
export function applyLookTo(c: Clip, look: Look): void {
  const copy = structuredClone(look);
  c.adjust = copy.adjust;
  c.wheels = copy.wheels;
  c.curves = copy.curves;
  c.hsl = copy.hsl;
  c.filter = copy.filter;
  c.lut = copy.lut;
  c.effects = copy.effects.map((e) => ({ ...e, id: uid() }));
}

/** LUT files of a look must be loaded before the preview can use them. */
export async function prepareLook(look: Look): Promise<void> {
  if (look.lut && !(await loadLut(look.lut.path))) toast(t('toast.lutFailed'), 'error');
}

// ---------------------------------------------------------------------------
// Export settings

export async function saveExportPreset(settings: Omit<ExportPreset, 'id' | 'name'>): Promise<ExportPreset | null> {
  const name = await askName(t('presets.saveExport'), t('presets.exportDefault', { n: usePresets.getState().exports.length + 1 }));
  if (!name) return null;
  const preset = { id: uid(), name, ...settings };
  add('exports', preset);
  return preset;
}

// ---------------------------------------------------------------------------
// Managing

export async function renamePreset(kind: PresetKind, id: string): Promise<void> {
  const item = usePresets.getState()[kind].find((x) => x.id === id);
  if (!item) return;
  const name = await askName(t('presets.rename'), item.name);
  if (!name) return;
  usePresets.setState((s) => ({ [kind]: s[kind].map((x) => (x.id === id ? { ...x, name } : x)) }) as Partial<PresetsState>);
}

export async function deletePreset(kind: PresetKind, id: string): Promise<void> {
  const item = usePresets.getState()[kind].find((x) => x.id === id);
  if (!item) return;
  const ok = await confirmAction({ title: t('presets.deleteTitle', { name: item.name }), confirm: t('common.delete'), cancel: t('common.cancel'), danger: true });
  if (!ok) return;
  usePresets.setState((s) => ({ [kind]: s[kind].filter((x) => x.id !== id) }) as Partial<PresetsState>);
}

const FILE_FILTER = [{ name: `${APP_NAME} presets`, extensions: ['kadropresets'] }];

export async function exportPresetsFile(): Promise<void> {
  const s = usePresets.getState();
  const count = s.text.length + s.looks.length + s.exports.length;
  if (count === 0) {
    toast(t('presets.nothing'));
    return;
  }
  const path = await api.saveFileDialog('my.kadropresets', FILE_FILTER);
  if (!path) return;
  await api.writeText(path, JSON.stringify({ format: 1, app: APP_NAME, ...s }, null, 1));
  toast(t('presets.exported', { n: count }), 'success');
}

export async function importPresetsFile(): Promise<void> {
  const path = await api.openFileDialog(FILE_FILTER);
  if (!path) return;
  try {
    const incoming = sanitize(JSON.parse(await api.readText(path)) as Partial<PresetsState>);
    const fresh = <T extends { id: string }>(xs: T[]) => xs.map((x) => ({ ...x, id: uid() }));
    usePresets.setState((s) => ({
      text: [...s.text, ...fresh(incoming.text)],
      looks: [...s.looks, ...fresh(incoming.looks)],
      exports: [...s.exports, ...fresh(incoming.exports)],
    }));
    toast(t('presets.imported', { n: incoming.text.length + incoming.looks.length + incoming.exports.length }), 'success');
  } catch (e) {
    toast(t('presets.importFailed', { err: e instanceof Error ? e.message : String(e) }), 'error');
  }
}
