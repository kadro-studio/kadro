// Global editor state. The project document is immutable: every change produces a
// new object via immer, which gives cheap undo/redo and change detection.
import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import { createProject, findClip } from '../core/project';
import type { Clip, MediaRuntime, Project } from '../core/types';
import type { AutosaveData } from '../../shared/api';

/** Timeline tools (Premiere-style): ripple/roll act on edges, slip/slide on clip bodies. */
export type Tool = 'select' | 'forward' | 'ripple' | 'roll' | 'slip' | 'slide' | 'razor';
export type LeftTab = 'media' | 'library' | 'text' | 'transitions' | 'effects' | 'filters' | 'elements' | 'mods' | 'workshop';
export type DialogKind =
  | null
  | 'export'
  | 'settings'
  | 'about'
  | 'shortcuts'
  | 'prefs'
  | 'ai-subs'
  | 'ai-bg'
  | 'paste-attrs'
  | 'voiceover'
  | 'stabilize'
  | 'denoise'
  | 'loudness'
  | 'scenes'
  | 'beats'
  | 'duck'
  | 'silence'
  | 'credits'
  | 'shadertoy'
  | 'publish'
  | 'link'
  | 'templates'
  | 'fillTemplate'
  | 'newProject'
  | 'welcome'
  | 'autoMontage'
  | 'dynamic';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

export interface ClipboardData {
  /** Clips with start relative to the earliest copied clip. */
  clips: { clip: Clip; trackId: string }[];
}

export interface EditorState {
  project: Project;
  savedProject: Project;
  filePath: string | null;
  past: Project[];
  future: Project[];
  /** Project snapshot while an interactive edit (drag) is in progress. */
  txBase: Project | null;

  runtime: Record<string, MediaRuntime>;
  waveVersion: number;

  selection: string[];
  playhead: number;
  playing: boolean;
  tool: Tool;
  snapping: boolean;
  /** Linked clips (a video and its sound) are selected and edited together. */
  linking: boolean;
  pxPerSec: number;
  previewScale: number;
  leftTab: LeftTab;
  dialog: DialogKind;
  clipboard: ClipboardData | null;
  toasts: Toast[];
  /** Snap guide position on the timeline (seconds) while dragging. */
  snapLine: number | null;
  /** Autosave left by a session that ended unexpectedly. */
  recovery: AutosaveData | null;
}

function initialState(): EditorState {
  const project = createProject();
  return {
    project,
    savedProject: project,
    filePath: null,
    past: [],
    future: [],
    txBase: null,
    runtime: {},
    waveVersion: 0,
    selection: [],
    playhead: 0,
    playing: false,
    tool: 'select',
    snapping: true,
    linking: true,
    pxPerSec: 60,
    previewScale: 1,
    leftTab: 'media',
    dialog: null,
    clipboard: null,
    toasts: [],
    snapLine: null,
    recovery: null,
  };
}

export const useEditor = create<EditorState>(() => initialState());

const HISTORY_LIMIT = 200;

function pushHistory(past: Project[], p: Project): Project[] {
  const next = [...past, p];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

function validSelection(p: Project, sel: string[]): string[] {
  return sel.filter((id) => findClip(p, id));
}

/** Applies an undoable change to the project. */
export function edit(recipe: (draft: Draft<Project>) => void): void {
  const s = useEditor.getState();
  const base = s.txBase ?? s.project;
  const next = produce(s.project, recipe);
  if (next === base) {
    if (s.txBase) useEditor.setState({ txBase: null });
    return;
  }
  useEditor.setState({ project: next, past: pushHistory(s.past, base), future: [], txBase: null });
}

/** Live (non-undoable) change during a drag; always computed from the drag's start state. */
export function previewEdit(recipe: (draft: Draft<Project>) => void): void {
  const s = useEditor.getState();
  const base = s.txBase ?? s.project;
  useEditor.setState({ txBase: base, project: produce(base, recipe) });
}

/** Ends a drag, recording one undo step (optionally with a final recipe). */
export function commitPreview(recipe?: (draft: Draft<Project>) => void): void {
  const s = useEditor.getState();
  if (!s.txBase) {
    if (recipe) edit(recipe);
    return;
  }
  const base = s.txBase;
  const next = recipe ? produce(base, recipe) : s.project;
  if (next === base) {
    useEditor.setState({ project: base, txBase: null, snapLine: null });
    return;
  }
  useEditor.setState({ project: next, past: pushHistory(s.past, base), future: [], txBase: null, snapLine: null });
}

export function cancelPreview(): void {
  const s = useEditor.getState();
  if (s.txBase) useEditor.setState({ project: s.txBase, txBase: null, snapLine: null });
}

export function undo(): void {
  cancelPreview();
  const s = useEditor.getState();
  if (s.past.length === 0) return;
  const prev = s.past[s.past.length - 1];
  useEditor.setState({
    project: prev,
    past: s.past.slice(0, -1),
    future: [s.project, ...s.future],
    selection: validSelection(prev, s.selection),
  });
}

export function redo(): void {
  cancelPreview();
  const s = useEditor.getState();
  if (s.future.length === 0) return;
  const next = s.future[0];
  useEditor.setState({
    project: next,
    past: pushHistory(s.past, s.project),
    future: s.future.slice(1),
    selection: validSelection(next, s.selection),
  });
}

export function loadProject(project: Project, filePath: string | null): void {
  useEditor.setState({
    ...initialState(),
    project,
    savedProject: project,
    filePath,
    pxPerSec: useEditor.getState().pxPerSec,
    previewScale: useEditor.getState().previewScale,
  });
}

export function markSaved(filePath: string): void {
  const s = useEditor.getState();
  useEditor.setState({ savedProject: s.project, filePath });
}

export function isDirty(s: EditorState = useEditor.getState()): boolean {
  return s.project !== s.savedProject;
}

export function setRuntime(mediaId: string, patch: Partial<MediaRuntime>): void {
  const s = useEditor.getState();
  const prev: MediaRuntime = s.runtime[mediaId] ?? {
    status: 'pending',
    thumb: null,
    filmstrip: null,
    proxyPath: null,
    proxyRequired: false,
    optimizing: false,
    progress: 0,
    error: null,
    hasWaveform: false,
  };
  useEditor.setState({ runtime: { ...s.runtime, [mediaId]: { ...prev, ...patch } } });
}

let toastSeq = 1;
export function toast(text: string, kind: Toast['kind'] = 'info'): void {
  const id = toastSeq++;
  useEditor.setState((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
  setTimeout(() => useEditor.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), kind === 'error' ? 7000 : 3500);
}

export function select(ids: string[]): void {
  useEditor.setState({ selection: ids });
}

export function setPlayhead(t: number): void {
  useEditor.setState({ playhead: Math.max(0, t) });
}
