// Title fonts bundled with the app (OFL / Apache, all with Cyrillic) plus the
// user's system fonts. Web fonts load on first use; text layers re-render
// when they arrive, and export waits for every font the project uses.
import '@fontsource-variable/montserrat';
import '@fontsource-variable/oswald';
import '@fontsource-variable/playfair-display';
import '@fontsource-variable/roboto-slab';
import '@fontsource-variable/rubik';
import '@fontsource-variable/comfortaa';
import '@fontsource-variable/caveat';
import '@fontsource-variable/unbounded';
import '@fontsource-variable/manrope';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/raleway';
import '@fontsource-variable/lora';
import '@fontsource-variable/exo-2';
import '@fontsource/pacifico';
import '@fontsource/lobster';
import '@fontsource/russo-one';
import '@fontsource/press-start-2p';
import '@fontsource/great-vibes';
import '@fontsource/amatic-sc';
import '@fontsource/marck-script';
import '@fontsource/bad-script';
import '@fontsource/rubik-mono-one';
// Only the Latin and Cyrillic subsets: the Japanese ones add almost 2 MB.
import '@fontsource/dela-gothic-one/latin-400.css';
import '@fontsource/dela-gothic-one/latin-ext-400.css';
import '@fontsource/dela-gothic-one/cyrillic-400.css';
import '@fontsource/ruslan-display';
import type { Project, TextStyle } from '../core/types';

export type FontCategory = 'custom' | 'sans' | 'serif' | 'display' | 'script' | 'mono' | 'system';

export interface FontInfo {
  family: string;
  label: string;
  category: FontCategory;
  /** Supports any weight between 100 and 900. */
  variable?: boolean;
}

export const BUNDLED_FONTS: FontInfo[] = [
  { family: 'Inter Variable', label: 'Inter', category: 'sans', variable: true },
  { family: 'Montserrat Variable', label: 'Montserrat', category: 'sans', variable: true },
  { family: 'Manrope Variable', label: 'Manrope', category: 'sans', variable: true },
  { family: 'Raleway Variable', label: 'Raleway', category: 'sans', variable: true },
  { family: 'Rubik Variable', label: 'Rubik', category: 'sans', variable: true },
  { family: 'Oswald Variable', label: 'Oswald', category: 'sans', variable: true },
  { family: 'Exo 2 Variable', label: 'Exo 2', category: 'sans', variable: true },
  { family: 'Comfortaa Variable', label: 'Comfortaa', category: 'sans', variable: true },
  { family: 'Playfair Display Variable', label: 'Playfair Display', category: 'serif', variable: true },
  { family: 'Lora Variable', label: 'Lora', category: 'serif', variable: true },
  { family: 'Roboto Slab Variable', label: 'Roboto Slab', category: 'serif', variable: true },
  { family: 'Unbounded Variable', label: 'Unbounded', category: 'display', variable: true },
  { family: 'Russo One', label: 'Russo One', category: 'display' },
  { family: 'Rubik Mono One', label: 'Rubik Mono One', category: 'display' },
  { family: 'Dela Gothic One', label: 'Dela Gothic One', category: 'display' },
  { family: 'Ruslan Display', label: 'Ruslan Display', category: 'display' },
  { family: 'Press Start 2P', label: 'Press Start 2P', category: 'display' },
  { family: 'Lobster', label: 'Lobster', category: 'script' },
  { family: 'Pacifico', label: 'Pacifico', category: 'script' },
  { family: 'Great Vibes', label: 'Great Vibes', category: 'script' },
  { family: 'Caveat Variable', label: 'Caveat', category: 'script', variable: true },
  { family: 'Marck Script', label: 'Marck Script', category: 'script' },
  { family: 'Bad Script', label: 'Bad Script', category: 'script' },
  { family: 'Amatic SC', label: 'Amatic SC', category: 'script' },
  { family: 'JetBrains Mono Variable', label: 'JetBrains Mono', category: 'mono', variable: true },
];

/** Fonts that ship with Windows, used when system fonts cannot be listed. */
const WINDOWS_FONTS = [
  'Segoe UI', 'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Candara', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel',
  'Courier New', 'Franklin Gothic Medium', 'Gabriola', 'Georgia', 'Impact', 'Lucida Console', 'Palatino Linotype',
  'Segoe Print', 'Segoe Script', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
];

export function fontLabel(family: string): string {
  return BUNDLED_FONTS.find((f) => f.family === family)?.label ?? family;
}

/** Families of the user's own variable fonts (see store/userFonts.ts). */
const userVariable = new Set<string>();

export function registerVariableFamily(family: string): void {
  userVariable.add(family);
}

export function isVariableFont(family: string): boolean {
  return userVariable.has(family) || !!BUNDLED_FONTS.find((f) => f.family === family)?.variable;
}

let systemFonts: Promise<string[]> | null = null;

/** Families installed on this computer (Local Font Access), minus the bundled ones. */
export function listSystemFonts(): Promise<string[]> {
  if (!systemFonts) {
    systemFonts = (async () => {
      try {
        const query = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts;
        if (!query) return WINDOWS_FONTS;
        const fonts = await query();
        const families = [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
        return families.length ? families : WINDOWS_FONTS;
      } catch {
        return WINDOWS_FONTS;
      }
    })();
  }
  return systemFonts;
}

export function textWeight(s: TextStyle): number {
  return s.weight ?? (s.bold ? 700 : 400);
}

export function fontString(s: TextStyle, scale: number): string {
  return `${s.italic ? 'italic ' : ''}${textWeight(s)} ${Math.max(1, s.fontSize * scale)}px "${s.fontFamily}", "Segoe UI", Arial, sans-serif`;
}

// ---------------------------------------------------------------------------
// Loading

let version = 0;
const pending = new Set<string>();
const listeners = new Set<() => void>();

/** Bumped whenever a font finishes loading (part of raster cache keys). */
export function fontsVersion(): number {
  return version;
}

/** Fonts were added or removed: text layers redraw. */
export function fontsChanged(): void {
  version++;
  for (const fn of listeners) fn();
}

export function onFontsLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function shownText(s: TextStyle): string {
  return (s.uppercase ? s.content.toUpperCase() : s.content) || 'A';
}

/** True if the text can be drawn in its font now; otherwise starts loading it. */
export function ensureFont(s: TextStyle): boolean {
  const font = fontString(s, 1);
  const text = shownText(s);
  if (document.fonts.check(font, text)) return true;
  const key = `${font}|${text}`;
  if (!pending.has(key)) {
    pending.add(key);
    void document.fonts
      .load(font, text)
      .catch(() => undefined)
      .finally(() => {
        pending.delete(key);
        version++;
        for (const fn of listeners) fn();
      });
  }
  return false;
}

/** Waits until every text layer of the project can be drawn in its own font. */
export async function loadProjectFonts(p: Project): Promise<void> {
  const loads: Promise<unknown>[] = [];
  for (const tr of p.tracks) {
    for (const c of tr.clips) {
      if (c.type === 'text' && c.text) loads.push(document.fonts.load(fontString(c.text, 1), shownText(c.text)).catch(() => undefined));
    }
  }
  await Promise.all(loads);
}
