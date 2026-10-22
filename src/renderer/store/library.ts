// Online library: download into the project and keep each file's credit.
import type { LibraryItem, LibraryKind, LibraryProvider, LibrarySearch } from '../../shared/api';
import { api } from '../api';
import type { MediaAsset, MediaCredit } from '../core/types';
import { t } from '../i18n';
import { edit, toast, useEditor } from './editor';
import { errText, importFiles } from './media';
import { usePrefs } from './prefs';

export interface LibrarySource {
  id: string;
  provider: LibraryProvider;
  kind: LibraryKind;
  label: string;
  audioCategory?: string;
  needsKey?: 'pexels' | 'pixabay';
}

export const LIBRARY_SOURCES: LibrarySource[] = [
  { id: 'commons-video', provider: 'commons', kind: 'video', label: 'Wikimedia Commons' },
  { id: 'pexels-video', provider: 'pexels', kind: 'video', label: 'Pexels', needsKey: 'pexels' },
  { id: 'pixabay-video', provider: 'pixabay', kind: 'video', label: 'Pixabay', needsKey: 'pixabay' },
  { id: 'openverse-image', provider: 'openverse', kind: 'image', label: 'Openverse' },
  { id: 'commons-image', provider: 'commons', kind: 'image', label: 'Wikimedia Commons' },
  { id: 'pexels-image', provider: 'pexels', kind: 'image', label: 'Pexels', needsKey: 'pexels' },
  { id: 'pixabay-image', provider: 'pixabay', kind: 'image', label: 'Pixabay', needsKey: 'pixabay' },
  { id: 'openverse-music', provider: 'openverse', kind: 'audio', label: 'Openverse', audioCategory: 'music' },
  { id: 'openverse-sfx', provider: 'openverse', kind: 'audio', label: 'Openverse', audioCategory: 'sound_effect' },
];

export function searchSource(source: LibrarySource, query: string, page: number) {
  const q: LibrarySearch = {
    provider: source.provider,
    kind: source.kind,
    query,
    page,
    audioCategory: source.audioCategory,
    keys: usePrefs.getState().libraryKeys,
  };
  return api.searchLibrary(q);
}

let taskSeq = 0;

/** Downloads a result, adds it to the media bin and records its credit. */
export async function addFromLibrary(item: LibraryItem, onProgress: (p: number) => void): Promise<MediaAsset | null> {
  const taskId = `lib-${++taskSeq}`;
  const off = api.onTaskProgress((id, p) => id === taskId && onProgress(p));
  try {
    const path = await api.downloadLibraryItem(item, taskId);
    const [asset] = await importFiles([path]);
    if (!asset) return null;
    const credit: MediaCredit = {
      title: item.title,
      author: item.author,
      license: item.license,
      licenseUrl: item.licenseUrl,
      sourceUrl: item.sourceUrl,
      attribution: item.attribution,
      provider: item.origin ? `${item.provider}/${item.origin}` : item.provider,
    };
    edit((d) => {
      const m = d.media.find((x) => x.id === asset.id);
      if (m) {
        m.credit = credit;
        m.name = `${item.title}.${item.ext}`;
      }
    });
    toast(t('library.added', { name: item.title }), 'success');
    return asset;
  } catch (e) {
    toast(t('library.downloadFailed', { err: errText(e) }), 'error');
    return null;
  } finally {
    off();
  }
}

/** Credits of the library media used in the project, one line each. */
export function creditsText(): string {
  const media = useEditor.getState().project.media.filter((m) => m.credit);
  return media.map((m) => m.credit!.attribution).join('\n');
}
