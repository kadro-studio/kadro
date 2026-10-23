// Community workshop: browsing, installing, liking and publishing.
import { create } from 'zustand';
import type { WorkshopAccount, WorkshopItem, WorkshopKind, WorkshopQuery } from '../../shared/api';
import { api } from '../api';
import { t } from '../i18n';
import { installDownloaded, installLocalItems, localExists, packSource, type LocalSource } from '../workshop/items';
import { toast } from './editor';
import { reloadLuts } from './luts';
import { reloadTemplates } from './templates';

export type KindFilter = WorkshopKind | 'all';
export type Sort = NonNullable<WorkshopQuery['sort']>;

interface Installed {
  kind: WorkshopKind;
  version: string;
  ref: string;
}

interface WorkshopState {
  account: WorkshopAccount | null;
  kind: KindFilter;
  sort: Sort;
  search: string;
  mine: boolean;
  items: WorkshopItem[];
  page: number;
  pages: number;
  loading: boolean;
  error: string | null;
  /** Item shown in the details view. */
  open: WorkshopItem | null;
  /** Items being downloaded right now. */
  busy: Record<number, boolean>;
  installed: Record<string, Installed>;
}

const INSTALLED_KEY = 'vr.workshop.installed';

function loadInstalled(): Record<string, Installed> {
  try {
    return JSON.parse(localStorage.getItem(INSTALLED_KEY) ?? '{}') as Record<string, Installed>;
  } catch {
    return {};
  }
}

export const useWorkshop = create<WorkshopState>(() => ({
  account: null,
  kind: 'all',
  sort: 'popular',
  search: '',
  mine: false,
  items: [],
  page: 1,
  pages: 1,
  loading: false,
  error: null,
  open: null,
  busy: {},
  installed: loadInstalled(),
}));

useWorkshop.subscribe((s, prev) => {
  if (s.installed === prev.installed) return;
  try {
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(s.installed));
  } catch {
    // storage unavailable
  }
});

const errText = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e));

let requestSeq = 0;

/** Loads the first page for the current filters, or appends the next one. */
export async function loadItems(more = false): Promise<void> {
  const s = useWorkshop.getState();
  const page = more ? s.page + 1 : 1;
  const seq = ++requestSeq;
  useWorkshop.setState({ loading: true, error: null, ...(more ? {} : { items: [] }) });
  try {
    const r = await api.workshopList({ kind: s.kind === 'all' ? undefined : s.kind, sort: s.sort, search: s.search.trim() || undefined, mine: s.mine, page, perPage: 24 });
    if (seq !== requestSeq) return;
    useWorkshop.setState((x) => ({ items: more ? [...x.items, ...r.items] : r.items, page, pages: r.pages, loading: false }));
  } catch (e) {
    if (seq !== requestSeq) return;
    useWorkshop.setState({ loading: false, error: errText(e) });
  }
}

export function setFilter(patch: Partial<Pick<WorkshopState, 'kind' | 'sort' | 'search' | 'mine'>>): void {
  useWorkshop.setState({ ...patch, open: null });
  void loadItems();
}

export async function refreshAccount(): Promise<void> {
  useWorkshop.setState({ account: await api.workshopAccount().catch(() => null) });
}

export function signOut(): void {
  api.workshopSignOut();
  useWorkshop.setState({ account: null, mine: false });
}

export async function openItem(id: number): Promise<void> {
  try {
    useWorkshop.setState({ open: await api.workshopItem(id) });
  } catch (e) {
    toast(t('ws.loadFailed', { err: errText(e) }), 'error');
  }
}

/** Installs .kadroitem and .cube files dropped onto the window. */
export async function installDroppedItems(paths: string[]): Promise<void> {
  for (const r of await installLocalItems(paths)) {
    if (r.err) toast(t('ws.installFailed', { err: `${r.name}: ${r.err}` }), 'error');
    else toast(t(`ws.installed.${r.kind}` as Parameters<typeof t>[0], { name: r.name }), 'success');
  }
}

/** Installed version of an item, if it is still present locally. */
export function installedVersion(item: WorkshopItem): string | null {
  const rec = useWorkshop.getState().installed[String(item.id)];
  return rec && localExists(rec.kind, rec.ref) ? rec.version : null;
}

export async function installItem(item: WorkshopItem): Promise<void> {
  useWorkshop.setState((s) => ({ busy: { ...s.busy, [item.id]: true } }));
  try {
    const bytes = await api.workshopDownload(item.id);
    const ref = await installDownloaded(item, bytes);
    useWorkshop.setState((s) => ({
      installed: { ...s.installed, [String(item.id)]: { kind: item.kind, version: item.version, ref } },
      items: s.items.map((x) => (x.id === item.id ? { ...x, downloads: x.downloads + 1 } : x)),
      open: s.open?.id === item.id ? { ...s.open, downloads: s.open.downloads + 1 } : s.open,
    }));
    toast(t(`ws.installed.${item.kind}` as Parameters<typeof t>[0], { name: item.title }), 'success');
  } catch (e) {
    toast(t('ws.installFailed', { err: errText(e) }), 'error');
  } finally {
    useWorkshop.setState((s) => {
      const busy = { ...s.busy };
      delete busy[item.id];
      return { busy };
    });
  }
}

export async function toggleLike(item: WorkshopItem): Promise<void> {
  if (!useWorkshop.getState().account) {
    toast(t('ws.signInToLike'));
    return;
  }
  try {
    const r = await api.workshopLike(item.id);
    const patch = (x: WorkshopItem) => (x.id === item.id ? { ...x, likes: r.likes, liked: r.liked } : x);
    useWorkshop.setState((s) => ({ items: s.items.map(patch), open: s.open ? patch(s.open) : null }));
  } catch (e) {
    toast(errText(e), 'error');
  }
}

export async function removeOwnItem(item: WorkshopItem): Promise<void> {
  try {
    await api.workshopDelete(item.id);
    useWorkshop.setState((s) => ({ items: s.items.filter((x) => x.id !== item.id), open: null }));
    toast(t('ws.removed', { name: item.title }), 'success');
  } catch (e) {
    toast(errText(e), 'error');
  }
}

export interface PublishInput {
  source: LocalSource;
  title: string;
  description: string;
  license: string;
  tags: string[];
  version: string;
  updateId?: number;
}

export async function publish(p: PublishInput): Promise<WorkshopItem | null> {
  try {
    const pkg = await packSource(p.source, p.title);
    const item = await api.workshopPublish({
      kind: p.source.kind,
      title: p.title,
      description: p.description,
      license: p.license,
      tags: p.tags,
      version: p.version,
      fileName: pkg.fileName,
      file: pkg.file,
      preview: pkg.preview,
      updateId: p.updateId,
    });
    toast(t(item.status === 'publish' ? 'ws.published' : 'ws.sentForReview', { name: item.title }), 'success');
    if (useWorkshop.getState().mine) void loadItems();
    return item;
  } catch (e) {
    toast(t('ws.publishFailed', { err: errText(e) }), 'error');
    return null;
  }
}

/** kadro://workshop/item/<id> from the site: show the item in the app. */
export function handleWorkshopLink(url: string): boolean {
  const m = /^kadro:\/\/workshop\/item\/(\d+)/i.exec(url);
  if (!m) return false;
  void openItem(Number(m[1]));
  return true;
}

export async function initWorkshop(): Promise<void> {
  await Promise.all([refreshAccount(), reloadLuts(), reloadTemplates()]);
}
