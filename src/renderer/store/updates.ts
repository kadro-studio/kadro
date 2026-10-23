// Updates of the installed app (see src/main/updates.ts): a quiet check on start
// when the preference allows it, and a check on request from Help or Preferences.
import { create } from 'zustand';
import type { UpdateStatus } from '../../shared/api';
import { api } from '../api';
import { t } from '../i18n';
import { confirmDiscard } from './actions';
import { toast } from './editor';
import { usePrefs } from './prefs';

const START_DELAY = 8000;

export const useUpdates = create<{ status: UpdateStatus; dismissed: boolean }>(() => ({ status: { state: 'idle' }, dismissed: false }));

/** Listens to the main process; returns the unsubscribe function. */
export function initUpdates(): () => void {
  const off = api.onUpdateStatus((status) => useUpdates.setState({ status }));
  void api.updateStatus().then((status) => useUpdates.setState({ status }));
  const timer = setTimeout(() => {
    if (usePrefs.getState().autoUpdate) void api.checkForUpdates().catch(() => undefined);
  }, START_DELAY);
  return () => {
    off();
    clearTimeout(timer);
  };
}

/** Check asked for by the user: says what came of it. */
export async function checkUpdatesNow(): Promise<void> {
  useUpdates.setState({ dismissed: false });
  const s = await api.checkForUpdates().catch((e: unknown) => ({ state: 'error', message: String(e) }) as UpdateStatus);
  if (s.state === 'latest') toast(t('upd.latest'), 'success');
  else if (s.state === 'dev') toast(t('upd.dev'));
  else if (s.state === 'downloading') toast(t('upd.downloading', { v: s.version }));
  else if (s.state === 'error') toast(t('upd.failed', { err: s.message }), 'error');
}

export async function restartToUpdate(): Promise<void> {
  if (!(await confirmDiscard())) return;
  api.installUpdate();
}
