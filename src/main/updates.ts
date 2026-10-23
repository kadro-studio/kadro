// Updates of the installed app from GitHub releases. The installed version
// downloads a new release in the background (electron-updater checks it against
// the SHA-512 in the release's latest.yml) and installs it on restart; the
// portable version cannot replace itself, so it only reports the new release.
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateStatus } from '../shared/api';
import { SOURCE_URL } from '../shared/brand';

const LATEST_API = 'https://api.github.com/repos/kadro-studio/kadro/releases/latest';
const portable = !!process.env.PORTABLE_EXECUTABLE_DIR;

let status: UpdateStatus = { state: 'idle' };
let sink: (s: UpdateStatus) => void = () => undefined;
let wired = false;

function set(s: UpdateStatus): void {
  status = s;
  sink(s);
}

export function updateStatus(): UpdateStatus {
  return status;
}

export function onUpdateStatus(fn: (s: UpdateStatus) => void): void {
  sink = fn;
}

/** 1 when a is newer than b ("0.2.0" vs "0.1.1"), -1 when older, 0 when equal. */
function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

function wire(): void {
  if (wired) return;
  wired = true;
  autoUpdater.logger = null;
  // Tests point the app at a local folder with a latest.yml instead of GitHub,
  // and must never install what they downloaded when the test app quits.
  const testFeed = process.env.KADRO_UPDATE_URL;
  if (testFeed) autoUpdater.setFeedURL({ provider: 'generic', url: testFeed });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = !testFeed;
  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => set({ state: 'latest' }));
  autoUpdater.on('update-available', (info) => set({ state: 'downloading', version: info.version, progress: 0 }));
  autoUpdater.on('download-progress', (p) => {
    if (status.state === 'downloading') set({ ...status, progress: Math.min(0.99, p.percent / 100) });
  });
  autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (e) => set({ state: 'error', message: e?.message ?? String(e) }));
}

/** Portable copies: look at the latest release and point to it. */
async function checkPortable(): Promise<void> {
  set({ state: 'checking' });
  try {
    const r = await fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Kadro' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`GitHub: HTTP ${r.status}`);
    const rel = (await r.json()) as { tag_name: string; html_url: string };
    const url = rel.html_url?.startsWith(`${SOURCE_URL}/releases/`) ? rel.html_url : `${SOURCE_URL}/releases/latest`;
    set(compareVersions(rel.tag_name, app.getVersion()) > 0 ? { state: 'available', version: rel.tag_name.replace(/^v/, ''), url } : { state: 'latest' });
  } catch (e) {
    set({ state: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    set({ state: 'dev' });
    return status;
  }
  // Already downloading or waiting for a restart: nothing new to ask.
  if (status.state === 'downloading' || status.state === 'ready' || status.state === 'checking') return status;
  if (portable) {
    await checkPortable();
    return status;
  }
  wire();
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    set({ state: 'error', message: e instanceof Error ? e.message : String(e) });
  }
  return status;
}

/** Restarts into the downloaded version (the caller has dealt with unsaved changes). */
export function installUpdate(): void {
  if (status.state !== 'ready') return;
  autoUpdater.quitAndInstall(true, true);
}
