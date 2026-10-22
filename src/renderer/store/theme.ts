// Appearance: surface palette, accent colour, corner style and UI scale.
// Tokens live in styles.css; this module switches them on <html>.
import { useEffect, useState } from 'react';
import { api } from '../api';

export type Surface = 'graphite' | 'midnight' | 'mocha' | 'oled' | 'light';
export type Corners = 'sharp' | 'normal' | 'round';

export interface ThemePrefs {
  surface: Surface;
  /** Hex colour. */
  accent: string;
  /** 0.8 .. 1.3 */
  uiScale: number;
  corners: Corners;
  /** Turns off blur, glow and animations. */
  calm: boolean;
}

export const DEFAULT_THEME: ThemePrefs = { surface: 'graphite', accent: '#ff3b4f', uiScale: 1, corners: 'normal', calm: false };

export const SURFACES: { id: Surface; swatch: [string, string] }[] = [
  { id: 'graphite', swatch: ['#08080a', '#1e1e23'] },
  { id: 'midnight', swatch: ['#060910', '#1a212d'] },
  { id: 'mocha', swatch: ['#0b0908', '#241d19'] },
  { id: 'oled', swatch: ['#000000', '#151515'] },
  { id: 'light', swatch: ['#e6e6eb', '#ffffff'] },
];

export const ACCENTS = ['#ff3b4f', '#ff7a1a', '#f5b400', '#22c39a', '#2f8cff', '#8b5cf6', '#ff4fa3', '#e8e8ee'];

const CORNER_SCALE: Record<Corners, number> = { sharp: 0.35, normal: 1, round: 1.6 };

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function applyTheme(p: ThemePrefs): void {
  const root = document.documentElement;
  root.dataset.surface = p.surface;
  root.style.setProperty('--accent', p.accent);
  root.style.setProperty('--r', String(CORNER_SCALE[p.corners] ?? 1));
  root.classList.toggle('calm', p.calm);
  // The native caption buttons are painted by Windows; keep them in step.
  api.setAppearance({ titleBarColor: cssVar('--bg'), symbolColor: cssVar('--text-dim'), zoom: p.uiScale });
  window.dispatchEvent(new Event('themechange'));
}

/** Current value of a theme token, for canvas drawing. */
export function themeColor(name: string, fallback: string): string {
  return cssVar(name) || fallback;
}

/** Re-renders canvas-drawing components when the theme changes. */
export function useThemeVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const on = () => setV((x) => x + 1);
    window.addEventListener('themechange', on);
    return () => window.removeEventListener('themechange', on);
  }, []);
  return v;
}
