// User preferences, persisted in localStorage (not part of projects).
import { create } from 'zustand';
import type { EncoderChoice } from '../../shared/api';
import { applyTheme, DEFAULT_THEME, type ThemePrefs } from './theme';

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
  theme: ThemePrefs;
  /** Free API keys for optional library sources. */
  libraryKeys: { pexels?: string; pixabay?: string; shadertoy?: string };
  /** Seconds for photos, titles and elements added to the timeline. */
  stillDuration: number;
  /** Scroll the timeline to keep the playhead in view during playback. */
  followPlayhead: boolean;
  /** Playback starts over at the end (of the in/out range when it is set). */
  loopPlayback: boolean;
  /** Look for a new release on start (the installed version downloads it in the background). */
  autoUpdate: boolean;
  /** Frame of new projects: 'auto' (the first video decides) or 'WxH'. */
  newProjectFormat: string;
  newProjectFps: number;
  /** Beginner mode: professional tools (curves, masks, keyframes, trim tools…) are hidden. */
  simpleMode: boolean;
  /** The welcome screen has been answered. */
  onboarded: boolean;
  /** Media panel on the right, the inspector on the left. */
  layoutMirror: boolean;
  /** Timeline toolbar buttons the user has hidden ('tool:razor', 'zoom'…). */
  hiddenToolbar: string[];
  /** Side tabs the user has hidden. */
  hiddenTabs: string[];
  /** Mouse wheel over the timeline: scroll the tracks, zoom, or move along the time. */
  timelineWheel: 'scroll' | 'zoom' | 'time';
  /** Picture strips and sound waves on timeline clips (off is lighter on slow computers). */
  clipThumbs: boolean;
  clipWaves: boolean;
  /** Reopen the last project on start. */
  openLastProject: boolean;
  /** Seconds for a newly added transition. */
  transitionDuration: number;
  /** Version that last ran, to say once what is new after an update. */
  seenVersion: string;
  /** User keyboard shortcuts: command id -> combos (see keymap.ts). */
  keymap: Record<string, string[]>;
  /** Saved and installed appearance themes. */
  myThemes: { id: string; name: string; theme: ThemePrefs }[];
  recent: RecentProject[];
}

const KEY = 'vr.prefs';

const DEFAULTS: Prefs = {
  autoProxy: true,
  useProxies: true,
  encoder: 'auto',
  autosaveMinutes: 2,
  showScopes: false,
  theme: DEFAULT_THEME,
  libraryKeys: {},
  stillDuration: 5,
  followPlayhead: true,
  loopPlayback: false,
  autoUpdate: true,
  newProjectFormat: 'auto',
  newProjectFps: 30,
  simpleMode: false,
  onboarded: false,
  layoutMirror: false,
  hiddenToolbar: [],
  hiddenTabs: [],
  timelineWheel: 'scroll',
  clipThumbs: true,
  clipWaves: true,
  openLastProject: false,
  transitionDuration: 0.6,
  seenVersion: '',
  keymap: {},
  myThemes: [],
  recent: [],
};

function load(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Prefs> | null;
    return { ...DEFAULTS, ...(raw ?? {}), theme: { ...DEFAULTS.theme, ...(raw?.theme ?? {}) } };
  } catch {
    return { ...DEFAULTS };
  }
}

export const usePrefs = create<Prefs>(() => load());

usePrefs.subscribe((p, prev) => {
  if (p.theme !== prev.theme) applyTheme(p.theme);
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

export function setTheme(patch: Partial<ThemePrefs>): void {
  usePrefs.setState((p) => ({ theme: { ...p.theme, ...patch } }));
}
