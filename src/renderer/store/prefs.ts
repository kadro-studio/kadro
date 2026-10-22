// User preferences, persisted in localStorage (not part of projects).
import { create } from 'zustand';
import type { EncoderChoice } from '../../shared/api';

export interface RecentProject {
  path: string;
  name: string;
  openedAt: number;
}

export interface Prefs {
  /** Create 1080p editing proxies for media above 1080p automatically. */
  autoProxy: boolean;
  /** Preview from proxies when they exist (export always uses originals). */
  useProxies: boolean;
  encoder: EncoderChoice;
  /** Minutes between autosaves; 0 disables. */
  autosaveMinutes: number;
  /** Show the scopes panel next to the preview. */
  showScopes: boolean;
  recent: RecentProject[];
}

const KEY = 'vr.prefs';

const DEFAULTS: Prefs = {
  autoProxy: true,
  useProxies: true,
  encoder: 'auto',
  autosaveMinutes: 2,
  showScopes: false,
  recent: [],
};

function load(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Prefs> | null;
    return { ...DEFAULTS, ...(raw ?? {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const usePrefs = create<Prefs>(() => load());

usePrefs.subscribe((p) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage unavailable
  }
});

export function setPrefs(patch: Partial<Prefs>): void {
  usePrefs.setState(patch);
}

const MAX_RECENT = 10;

export function rememberRecent(path: string, name: string): void {
  const rest = usePrefs.getState().recent.filter((r) => r.path.toLowerCase() !== path.toLowerCase());
  setPrefs({ recent: [{ path, name, openedAt: Date.now() }, ...rest].slice(0, MAX_RECENT) });
}

export function forgetRecent(path: string): void {
  setPrefs({ recent: usePrefs.getState().recent.filter((r) => r.path !== path) });
}
