// Fonts the user added (font picker, Preferences or dropped onto the window).
// They live in the profile's fonts folder and are registered with the FontFace
// API at start-up, so titles use them like the bundled fonts.
import { create } from 'zustand';
import { api } from '../api';
import { fontsChanged, registerVariableFamily } from '../engine/fonts';
import { t } from '../i18n';
import { toast } from './editor';
import { confirmAction } from './prompt';

export interface UserFont {
  family: string;
  files: string[];
  variable: boolean;
}

interface FontMeta {
  family: string;
  weight: string;
  style: string;
  variable: boolean;
}

export const useUserFonts = create<{ fonts: UserFont[] }>(() => ({ fonts: [] }));

/** Registered faces by file name, so a removed font can be taken out again. */
const faces = new Map<string, { face: FontFace; meta: FontMeta }>();

// ---------------------------------------------------------------------------
// Reading names from the font file (sfnt tables: name, OS/2, fvar)

const tag = (dv: DataView, at: number) => String.fromCharCode(dv.getUint8(at), dv.getUint8(at + 1), dv.getUint8(at + 2), dv.getUint8(at + 3));

/** Tables of a TTF/OTF, or of a WOFF after inflating it; null for formats we cannot read. */
async function sfntTables(buf: ArrayBuffer): Promise<Map<string, DataView> | null> {
  const dv = new DataView(buf);
  if (buf.byteLength < 12) return null;
  const sig = tag(dv, 0);
  const tables = new Map<string, DataView>();
  if (sig === 'wOFF') {
    const count = dv.getUint16(12);
    for (let i = 0; i < count; i++) {
      const at = 44 + i * 20;
      const name = tag(dv, at);
      if (name !== 'name' && name !== 'OS/2' && name !== 'fvar') continue;
      const offset = dv.getUint32(at + 4);
      const compLength = dv.getUint32(at + 8);
      const origLength = dv.getUint32(at + 12);
      let bytes = new Uint8Array(buf, offset, compLength);
      if (compLength < origLength) {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      }
      tables.set(name, new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    }
    return tables;
  }
  if (sig !== '\u0000\u0001\u0000\u0000' && sig !== 'OTTO' && sig !== 'true') return null;
  const count = dv.getUint16(4);
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    const offset = dv.getUint32(at + 8);
    const length = dv.getUint32(at + 12);
    if (offset + length <= buf.byteLength) tables.set(tag(dv, at), new DataView(buf, offset, length));
  }
  return tables;
}

function readName(name: DataView, wanted: number): string | null {
  const count = name.getUint16(2);
  const strings = name.getUint16(4);
  let best: { score: number; text: string } | null = null;
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12;
    const platform = name.getUint16(at);
    const lang = name.getUint16(at + 4);
    if (name.getUint16(at + 6) !== wanted) continue;
    const length = name.getUint16(at + 8);
    const offset = strings + name.getUint16(at + 10);
    if (offset + length > name.byteLength) continue;
    let text = '';
    if (platform === 3 || platform === 0) {
      for (let j = 0; j + 1 < length; j += 2) text += String.fromCharCode(name.getUint16(offset + j));
    } else if (platform === 1) {
      for (let j = 0; j < length; j++) text += String.fromCharCode(name.getUint8(offset + j));
    } else continue;
    // Windows English first, then any Windows/Unicode name, then Mac.
    const score = platform === 3 && lang === 0x409 ? 3 : platform === 3 || platform === 0 ? 2 : 1;
    if (text.trim() && (!best || score > best.score)) best = { score, text: text.trim() };
  }
  return best?.text ?? null;
}

async function fontMeta(buf: ArrayBuffer, file: string): Promise<FontMeta> {
  const fallback: FontMeta = { family: file.replace(/\.[^.]+$/, '').replace(/[-_](regular|normal)$/i, ''), weight: 'normal', style: 'normal', variable: false };
  try {
    const tables = await sfntTables(buf);
    const name = tables?.get('name');
    if (!tables || !name) return fallback;
    const meta: FontMeta = { ...fallback, family: readName(name, 16) ?? readName(name, 1) ?? fallback.family };
    const os2 = tables.get('OS/2');
    if (os2 && os2.byteLength >= 64) {
      meta.weight = String(os2.getUint16(4) || 400);
      if (os2.getUint16(62) & 1) meta.style = 'italic';
    }
    const fvar = tables.get('fvar');
    if (fvar && fvar.byteLength >= 16) {
      const axes = fvar.getUint16(4);
      const count = fvar.getUint16(8);
      const size = fvar.getUint16(10);
      for (let i = 0; i < count; i++) {
        const at = axes + i * size;
        if (at + 16 > fvar.byteLength || tag(fvar, at) !== 'wght') continue;
        const min = Math.round(fvar.getInt32(at + 4) / 65536);
        const max = Math.round(fvar.getInt32(at + 12) / 65536);
        meta.weight = `${min} ${max}`;
        meta.variable = max > min;
      }
    }
    return meta;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------

async function register(file: string): Promise<boolean> {
  if (faces.has(file)) return true;
  try {
    const data = await api.readFont(file);
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const meta = await fontMeta(buf, file);
    const face = new FontFace(meta.family, buf, { weight: meta.weight, style: meta.style });
    await face.load();
    document.fonts.add(face);
    faces.set(file, { face, meta });
    return true;
  } catch (e) {
    console.warn('Font could not be loaded', file, e);
    return false;
  }
}

function publish(): void {
  const byFamily = new Map<string, UserFont>();
  for (const [file, { meta }] of faces) {
    const f = byFamily.get(meta.family) ?? { family: meta.family, files: [], variable: false };
    f.files.push(file);
    f.variable ||= meta.variable;
    byFamily.set(meta.family, f);
    if (meta.variable) registerVariableFamily(meta.family);
  }
  useUserFonts.setState({ fonts: [...byFamily.values()].sort((a, b) => a.family.localeCompare(b.family)) });
  fontsChanged();
}

/** Registers every font in the profile (at start-up). */
export async function loadUserFonts(): Promise<void> {
  const files = await api.listFonts().catch(() => []);
  await Promise.all(files.map((f) => register(f.file)));
  publish();
}

/** Copies font files into the profile and makes them available right away. */
export async function addUserFonts(paths?: string[]): Promise<void> {
  const chosen = paths ?? (await api.openFontsDialog());
  if (chosen.length === 0) return;
  const added = await api.installFonts(chosen);
  // A file with the same name replaces the old one.
  for (const file of added) {
    const old = faces.get(file);
    if (old) {
      document.fonts.delete(old.face);
      faces.delete(file);
    }
  }
  const results = await Promise.all(added.map(register));
  publish();
  const ok = results.filter(Boolean).length;
  if (ok > 0) toast(t('fonts.added', { n: ok }), 'success');
  if (ok < chosen.length) toast(t('fonts.failed', { n: chosen.length - ok }), 'error');
}

export async function removeUserFont(family: string): Promise<void> {
  const font = useUserFonts.getState().fonts.find((f) => f.family === family);
  if (!font) return;
  const ok = await confirmAction({ title: t('fonts.removeTitle', { name: family }), message: t('fonts.removeText'), confirm: t('common.delete'), cancel: t('common.cancel'), danger: true });
  if (!ok) return;
  for (const file of font.files) {
    const entry = faces.get(file);
    if (entry) document.fonts.delete(entry.face);
    faces.delete(file);
    await api.removeFont(file).catch(() => undefined);
  }
  publish();
}
