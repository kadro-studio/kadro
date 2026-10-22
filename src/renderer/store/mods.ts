// Installed mods and the bundled example catalog.
import { create } from 'zustand';
import { api } from '../api';
import { setFxSource } from '../engine/fx/registry';
import { validateFxDef, type FxDef } from '../engine/fx/types';
import type { ModFile } from '../../shared/api';
import { t } from '../i18n';
import { toast } from './editor';

export interface ModEntry {
  file: string;
  fileName: string;
  def: FxDef | null;
  /** Why the file could not be used (invalid JSON or definition). */
  error: string | null;
}

interface ModsState {
  installed: ModEntry[];
  catalog: ModEntry[];
}

export const useMods = create<ModsState>(() => ({ installed: [], catalog: [] }));

function parse(f: ModFile): ModEntry {
  const fileName = f.file.split(/[\\/]/).pop() ?? f.file;
  try {
    const raw = JSON.parse(f.text);
    const error = validateFxDef(raw);
    if (error) return { file: f.file, fileName, def: null, error };
    return { file: f.file, fileName, def: { ...(raw as FxDef), params: raw.params ?? [], source: 'mod' }, error: null };
  } catch (e) {
    return { file: f.file, fileName, def: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function reloadMods(): Promise<void> {
  const [installed, catalog] = await Promise.all([api.listMods(), api.listModCatalog()]);
  const state = { installed: installed.map(parse), catalog: catalog.map(parse) };
  useMods.setState(state);
  setFxSource(
    'mod',
    state.installed.flatMap((m) => (m.def ? [m.def] : [])),
  );
}

export async function installMods(paths: string[]): Promise<void> {
  const count = await api.installMods(paths);
  await reloadMods();
  if (count > 0) toast(t('mods.installed', { n: count }), 'success');
}

export async function installModsViaDialog(): Promise<void> {
  const paths = await api.openModsDialog();
  if (paths.length) await installMods(paths);
}

export async function uninstallMod(file: string): Promise<void> {
  await api.removeMod(file);
  await reloadMods();
}
