// Turning local things into workshop packages and back.
//
// Files per kind:
//   effect / transition / element  .vrmod      the mod as is
//   lut                            .cube       the LUT as is
//   look / textStyle / theme /     .kadroitem  JSON { format, app, kind, name, data, lutCube? }
//   template                                   (data of a template: see store/templates.ts)
// A look that uses a LUT carries the .cube text, since the path on the author's
// computer means nothing elsewhere.
import type { WorkshopItem, WorkshopKind } from '../../shared/api';
import { APP_NAME } from '../../shared/brand';
import { api } from '../api';
import { projectDuration, uid } from '../core/project';
import { fontString } from '../engine/fonts';
import { fxThumbnail, lookThumbnail, projectThumbnail, THUMB_SIZE } from '../engine/fx/thumbs';
import { validateFxDef, type FxDef } from '../engine/fx/types';
import { loadSample } from '../engine/samples';
import { reloadLuts, useLuts } from '../store/luts';
import { reloadMods, useMods } from '../store/mods';
import { setPrefs, setTheme, usePrefs } from '../store/prefs';
import { usePresets, type Look, type TextPreset } from '../store/presets';
import { DEFAULT_THEME, SURFACES, type ThemePrefs } from '../store/theme';
import { useEditor } from '../store/editor';
import { installTemplate, makeTemplateData, parseTemplateData, useTemplates } from '../store/templates';

export const ITEM_FORMAT = 1;

/** A local thing that can be published. */
export interface LocalSource {
  kind: WorkshopKind;
  /** Mod file path, preset id, LUT path or theme id ('current' for the theme in use). */
  ref: string;
  name: string;
  /** Licence the item must keep (e.g. Shadertoy imports); otherwise the author chooses. */
  license?: string;
  /** Original author, for imported mods. */
  author?: string;
  sourceUrl?: string;
}

export interface Package {
  fileName: string;
  file: Uint8Array;
  preview: Uint8Array | null;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function modKind(def: FxDef): WorkshopKind {
  return def.kind === 'generator' ? 'element' : def.kind;
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'item'
  );
}

function dataUrlBytes(url: string | null): Uint8Array | null {
  if (!url) return null;
  const b64 = url.split(',')[1] ?? '';
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const NEUTRAL_LOOK = (): Look => ({
  adjust: { exposure: 0, brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, hue: 0, highlights: 0, shadows: 0, vignette: 0, blur: 0, sharpen: 0 },
  wheels: { lift: { x: 0, y: 0, l: 0 }, gamma: { x: 0, y: 0, l: 0 }, gain: { x: 0, y: 0, l: 0 } },
  curves: null,
  hsl: null,
  filter: { id: 'none', amount: 100 },
  lut: null,
  effects: [],
});

// ---------------------------------------------------------------------------
// What can be published

export function localSources(kind: WorkshopKind): LocalSource[] {
  switch (kind) {
    case 'effect':
    case 'transition':
    case 'element':
      return useMods
        .getState()
        .installed.filter((m) => m.def && modKind(m.def) === kind)
        .map((m) => ({ kind, ref: m.file, name: m.def!.name, license: m.def!.license, author: m.def!.license ? m.def!.author : undefined, sourceUrl: m.def!.sourceUrl }));
    case 'look':
      return usePresets.getState().looks.map((p) => ({ kind, ref: p.id, name: p.name }));
    case 'textStyle':
      return usePresets.getState().text.map((p) => ({ kind, ref: p.id, name: p.name }));
    case 'lut':
      return useLuts.getState().luts.map((l) => ({ kind, ref: l.path, name: l.name }));
    case 'theme':
      return [
        { kind, ref: 'current', name: '' },
        ...usePrefs.getState().myThemes.map((x) => ({ kind, ref: x.id, name: x.name })),
      ];
    case 'template': {
      const hasClips = useEditor.getState().project.tracks.some((tr) => tr.clips.length > 0);
      return [
        ...(hasClips ? [{ kind, ref: 'current', name: useEditor.getState().project.name }] : []),
        ...useTemplates.getState().list.map((x) => ({ kind, ref: x.path, name: x.name })),
      ];
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Previews

async function textStylePreview(p: TextPreset): Promise<string | null> {
  const img = await loadSample('spa').catch(() => null);
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_SIZE.w * 2;
  canvas.height = THUMB_SIZE.h * 2;
  const ctx = canvas.getContext('2d')!;
  if (img) {
    const k = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    ctx.drawImage(img, (canvas.width - img.naturalWidth * k) / 2, (canvas.height - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const s = p.style;
  const text = (s.uppercase ? s.content.toUpperCase() : s.content).split('\n')[0].slice(0, 28) || 'Kadro';
  await document.fonts.load(fontString(s, 1), text).catch(() => undefined);
  // Fit the line into the card, keeping the style's proportions.
  let scale = (canvas.height * 0.28) / Math.max(1, s.fontSize);
  ctx.font = fontString(s, scale);
  const w = ctx.measureText(text).width;
  if (w > canvas.width * 0.86) scale *= (canvas.width * 0.86) / w;
  ctx.font = fontString(s, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const x = canvas.width / 2;
  const y = canvas.height / 2;
  if (s.backgroundOpacity > 0) {
    const tw = ctx.measureText(text).width;
    const pad = s.backgroundPadding * scale;
    const h = s.fontSize * scale * 1.2;
    ctx.globalAlpha = s.backgroundOpacity / 100;
    ctx.fillStyle = s.background;
    ctx.beginPath();
    ctx.roundRect(x - tw / 2 - pad, y - h / 2 - pad / 2, tw + pad * 2, h + pad, s.backgroundRadius * scale);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (s.shadowBlur > 0 || s.shadowX || s.shadowY) {
    ctx.shadowColor = s.shadowColor;
    ctx.shadowBlur = s.shadowBlur * scale;
    ctx.shadowOffsetX = s.shadowX * scale;
    ctx.shadowOffsetY = s.shadowY * scale;
  }
  if (s.strokeWidth > 0) {
    ctx.lineWidth = s.strokeWidth * scale * 2;
    ctx.strokeStyle = s.strokeColor;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
  }
  if (s.gradient && s.gradientColor) {
    const tw = ctx.measureText(text).width;
    const g = ctx.createLinearGradient(x - tw / 2, y, x + tw / 2, y);
    g.addColorStop(0, s.color);
    g.addColorStop(1, s.gradientColor);
    ctx.fillStyle = g;
  } else ctx.fillStyle = s.color;
  ctx.fillText(text, x, y);
  return canvas.toDataURL('image/jpeg', 0.86);
}

/** A small mock of the editor in the theme's colours. */
export function themePreview(theme: ThemePrefs): string {
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_SIZE.w * 2;
  canvas.height = THUMB_SIZE.h * 2;
  const ctx = canvas.getContext('2d')!;
  const [bg, panel] = (SURFACES.find((s) => s.id === theme.surface) ?? SURFACES[0]).swatch;
  const r = theme.corners === 'sharp' ? 2 : theme.corners === 'round' ? 14 : 7;
  const box = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  };
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  box(10, 10, 110, 170, panel);
  box(130, 10, 250, 170, panel);
  box(390, 10, 112, 170, panel);
  box(145, 25, 220, 124, '#000000');
  box(10, 190, 492, 88, panel);
  box(420, 22, 70, 18, theme.accent);
  box(20, 22, 90, 54, theme.accent + '55');
  box(250, 154, 20, 20, theme.accent);
  const clips = [theme.accent, '#2f8cff', '#22c39a'];
  clips.forEach((c, i) => box(30 + i * 40, 205 + i * 22, 300 - i * 60, 16, c + 'cc'));
  ctx.fillStyle = theme.accent;
  ctx.fillRect(200, 196, 2, 76);
  return canvas.toDataURL('image/jpeg', 0.9);
}

// ---------------------------------------------------------------------------
// Packing

function itemFile(kind: WorkshopKind, name: string, data: unknown, lutCube?: string): Uint8Array {
  return encoder.encode(JSON.stringify({ format: ITEM_FORMAT, app: APP_NAME, kind, name, data, ...(lutCube ? { lutCube } : {}) }, null, 1));
}

export async function packSource(src: LocalSource, title: string): Promise<Package> {
  const base = slug(title || src.name);
  switch (src.kind) {
    case 'effect':
    case 'transition':
    case 'element': {
      const text = await api.readText(src.ref);
      const def = { ...(JSON.parse(text) as FxDef), source: 'mod' as const };
      return { fileName: `${base}.vrmod`, file: encoder.encode(text), preview: dataUrlBytes(await fxThumbnail(def)) };
    }
    case 'look': {
      const p = usePresets.getState().looks.find((x) => x.id === src.ref);
      if (!p) throw new Error('missing look');
      const lutCube = p.look.lut ? await api.readText(p.look.lut.path).catch(() => undefined) : undefined;
      return { fileName: `${base}.kadroitem`, file: itemFile('look', title, p.look, lutCube), preview: dataUrlBytes(await lookThumbnail(p.look)) };
    }
    case 'textStyle': {
      const p = usePresets.getState().text.find((x) => x.id === src.ref);
      if (!p) throw new Error('missing style');
      return { fileName: `${base}.kadroitem`, file: itemFile('textStyle', title, p), preview: dataUrlBytes(await textStylePreview(p)) };
    }
    case 'lut': {
      const text = await api.readText(src.ref);
      const look = { ...NEUTRAL_LOOK(), lut: { path: src.ref, name: src.name, amount: 100 } };
      return { fileName: `${base}.cube`, file: encoder.encode(text), preview: dataUrlBytes(await lookThumbnail(look)) };
    }
    case 'theme': {
      const theme = src.ref === 'current' ? usePrefs.getState().theme : usePrefs.getState().myThemes.find((x) => x.id === src.ref)?.theme;
      if (!theme) throw new Error('missing theme');
      return { fileName: `${base}.kadroitem`, file: itemFile('theme', title, theme), preview: dataUrlBytes(themePreview(theme)) };
    }
    case 'template': {
      const data =
        src.ref === 'current' ? await makeTemplateData(useEditor.getState().project) : useTemplates.getState().list.find((x) => x.path === src.ref)?.data;
      if (!data) throw new Error('missing template');
      const preview = projectThumbnail(data.project, Math.min(projectDuration(data.project) * 0.3, 1.2));
      return { fileName: `${base}.kadroitem`, file: itemFile('template', title, data), preview: dataUrlBytes(preview) };
    }
    default:
      throw new Error(`Cannot publish ${src.kind}`);
  }
}

// ---------------------------------------------------------------------------
// Installing downloaded items

interface ItemFile {
  format: number;
  kind: WorkshopKind;
  name?: string;
  data: unknown;
  lutCube?: string;
}

function parseItemFile(bytes: Uint8Array, kind: WorkshopKind): ItemFile {
  const f = JSON.parse(decoder.decode(bytes)) as ItemFile;
  if (!f || f.kind !== kind || typeof f.data !== 'object' || !f.data) throw new Error('Invalid item file');
  return f;
}

/** Installs an item; returns a local reference used to show it as installed. */
export async function installDownloaded(item: WorkshopItem, bytes: Uint8Array): Promise<string> {
  switch (item.kind) {
    case 'effect':
    case 'transition':
    case 'element': {
      const text = decoder.decode(bytes);
      const def = JSON.parse(text);
      const invalid = validateFxDef(def);
      if (invalid) throw new Error(invalid);
      const file = await api.installModText(`ws-${item.id}-${slug(item.title)}.vrmod`, text);
      await reloadMods();
      return file;
    }
    case 'lut': {
      const file = await api.installLutText(item.title, decoder.decode(bytes));
      await reloadLuts();
      return file;
    }
    default:
      return installItemData(parseItemFile(bytes, item.kind), item.title);
  }
}

/** Installs the contents of a .kadroitem file (a filter, title style or theme). */
async function installItemData(f: ItemFile, name: string): Promise<string> {
  switch (f.kind) {
    case 'look': {
      const look = structuredClone(f.data) as Look;
      if (!look.adjust || !Array.isArray(look.effects)) throw new Error('Invalid look');
      if (look.lut) {
        // The LUT travels inside the item; without it the reference is dropped.
        look.lut = f.lutCube ? { ...look.lut, path: await api.installLutText(`${name} LUT`, f.lutCube) } : null;
        await reloadLuts();
      }
      const id = uid();
      usePresets.setState((s) => ({ looks: [...s.looks, { id, name, look }] }));
      return id;
    }
    case 'textStyle': {
      const p = f.data as TextPreset;
      if (!p.style || typeof p.style.fontSize !== 'number') throw new Error('Invalid style');
      const id = uid();
      usePresets.setState((s) => ({ text: [...s.text, { ...p, id, name }] }));
      return id;
    }
    case 'theme': {
      const theme = { ...DEFAULT_THEME, ...(f.data as Partial<ThemePrefs>) };
      if (!/^#[0-9a-f]{6}$/i.test(theme.accent)) theme.accent = DEFAULT_THEME.accent;
      const id = uid();
      setPrefs({ myThemes: [...usePrefs.getState().myThemes, { id, name, theme }] });
      setTheme(theme);
      return id;
    }
    case 'template':
      return installTemplate(name, parseTemplateData(f.data));
    default:
      throw new Error(`Cannot install ${f.kind}`);
  }
}

export interface LocalInstall {
  name: string;
  kind?: WorkshopKind;
  /** Set when the file could not be installed. */
  err?: string;
}

/**
 * Installs workshop files dropped onto the window: .kadroitem files by their kind,
 * .cube files into the LUT library.
 */
export async function installLocalItems(paths: string[]): Promise<LocalInstall[]> {
  const out: LocalInstall[] = [];
  for (const path of paths) {
    const base = path.split(/[\\/]/).pop() ?? path;
    try {
      if (base.toLowerCase().endsWith('.cube')) {
        const [file] = await api.addLutFiles([path]);
        if (!file) throw new Error('Invalid LUT');
        out.push({ name: base.replace(/\.cube$/i, ''), kind: 'lut' });
        continue;
      }
      const f = JSON.parse(await api.readText(path)) as ItemFile;
      if (!f || typeof f.data !== 'object' || !f.data) throw new Error('Invalid item file');
      const name = (typeof f.name === 'string' && f.name.trim()) || base.replace(/\.kadroitem$/i, '');
      await installItemData(f, name.slice(0, 80));
      out.push({ name, kind: f.kind });
    } catch (e) {
      out.push({ name: base, err: e instanceof Error ? e.message : String(e) });
    }
  }
  if (out.some((x) => !x.err && x.kind === 'lut')) await reloadLuts();
  return out;
}

/** Whether a locally installed item still exists (the user may have deleted it). */
export function localExists(kind: WorkshopKind, ref: string): boolean {
  switch (kind) {
    case 'effect':
    case 'transition':
    case 'element':
      return useMods.getState().installed.some((m) => m.file === ref);
    case 'lut':
      return useLuts.getState().luts.some((l) => l.path === ref);
    case 'look':
      return usePresets.getState().looks.some((p) => p.id === ref);
    case 'textStyle':
      return usePresets.getState().text.some((p) => p.id === ref);
    case 'theme':
      return usePrefs.getState().myThemes.some((x) => x.id === ref);
    case 'template':
      return useTemplates.getState().list.some((x) => x.path === ref);
    default:
      return false;
  }
}
