// Periodic autosave of the open project and recovery after a crash.
import { api } from '../api';
import { normalizeProject } from '../core/project';
import type { AutosaveData } from '../../shared/api';
import { isDirty, loadProject, useEditor } from './editor';
import { analyzeMedia } from './media';
import { usePrefs } from './prefs';
import { registerProjectFx, withEmbeddedFx } from './fxProject';

let timer: ReturnType<typeof setInterval> | null = null;
let lastSaved: unknown = null;

/** Writes the project to the autosave slot now (no-op when nothing changed). */
export async function autosaveNow(): Promise<void> {
  const s = useEditor.getState();
  if (!isDirty(s) || s.project === lastSaved) return;
  if (!s.project.tracks.some((t) => t.clips.length > 0) && s.project.media.length === 0) return;
  lastSaved = s.project;
  try {
    await api.autosaveWrite(JSON.stringify(withEmbeddedFx(s.project)), { filePath: s.filePath, name: s.project.name });
  } catch (e) {
    console.warn('Autosave failed', e);
  }
}

export function startAutosave(): () => void {
  const schedule = () => {
    if (timer) clearInterval(timer);
    const minutes = usePrefs.getState().autosaveMinutes;
    timer = minutes > 0 ? setInterval(() => void autosaveNow(), minutes * 60_000) : null;
  };
  schedule();
  const unsub = usePrefs.subscribe((p, old) => p.autosaveMinutes !== old.autosaveMinutes && schedule());
  return () => {
    unsub();
    if (timer) clearInterval(timer);
  };
}

/** Called after a successful save: the file on disk is now the latest copy. */
export function clearAutosave(): void {
  lastSaved = null;
  void api.autosaveClear();
}

export function pendingRecovery(): Promise<AutosaveData | null> {
  return api.autosaveRead();
}

export function restoreAutosave(data: AutosaveData): void {
  const project = normalizeProject(JSON.parse(data.json));
  registerProjectFx(project);
  loadProject(project, data.meta.filePath);
  // Recovered work is unsaved until the user saves it.
  useEditor.setState({ savedProject: { ...project } });
  for (const m of project.media) void analyzeMedia(m);
}
