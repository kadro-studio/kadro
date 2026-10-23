// The LUT library: .cube files kept in the profile (see src/main/luts.ts).
import { create } from 'zustand';
import type { LutFile } from '../../shared/api';
import { api } from '../api';
import { t } from '../i18n';
import { toast } from './editor';
import { confirmAction } from './prompt';

export const useLuts = create<{ luts: LutFile[] }>(() => ({ luts: [] }));

export async function reloadLuts(): Promise<void> {
  useLuts.setState({ luts: await api.listLuts().catch(() => []) });
}

export async function addLutsViaDialog(): Promise<void> {
  const path = await api.openFileDialog([{ name: 'LUT (.cube)', extensions: ['cube'] }]);
  if (!path) return;
  const added = await api.addLutFiles([path]);
  await reloadLuts();
  if (added.length) toast(t('luts.added'), 'success');
}

export async function removeLutFromLibrary(lut: LutFile): Promise<void> {
  const ok = await confirmAction({ title: t('luts.removeTitle', { name: lut.name }), confirm: t('common.delete'), cancel: t('common.cancel'), danger: true });
  if (!ok) return;
  await api.removeLut(lut.file);
  await reloadLuts();
}
