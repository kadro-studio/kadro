import { app, BrowserWindow, dialog, ipcMain, Menu, MessageChannelMain, shell, utilityProcess, type UtilityProcess } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { handleMediaProtocol, registerMediaScheme } from './protocol';
import * as media from './media';
import * as render from './render';
import { ffmpegPath, ffmpegVersion, hwEncoders } from './ffmpeg';
import * as autosave from './autosave';
import * as mods from './mods';
import * as fonts from './fonts';
import * as luts from './luts';
import * as workshop from './workshop';
import * as library from './library';
import * as tiktok from './tiktok';
import * as systemClipboard from './clipboard';
import * as updates from './updates';
import * as templates from './templates';
import * as storage from './storage';
import { APP_NAME, TITLE_BAR_COLOR, TITLE_BAR_HEIGHT, TITLE_BAR_SYMBOLS } from '../shared/brand';
import type {
  Appearance,
  AutosaveMeta,
  ClosePrompt,
  DecoderSpec,
  DenoiseOptions,
  ExportSpec,
  FileFilter,
  LibraryItem,
  LibrarySearch,
  MatteSpec,
  MediaKind,
  StabilizeOptions,
  StorageKind,
  WorkshopPublish,
  WorkshopQuery,
} from '../shared/api';

// Tests and automation can run against a throwaway profile.
if (process.env.KADRO_USER_DATA) app.setPath('userData', process.env.KADRO_USER_DATA);

registerMediaScheme();

const MEDIA_EXTENSIONS = [
  'mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', 'mts', 'm2ts', '3gp', 'ogv', 'gif',
  'mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'oga', 'opus', 'wma', 'aiff', 'aif',
  'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff', 'avif',
];

let win: BrowserWindow | null = null;
let dirty = false;
let closePrompt: ClosePrompt | null = null;
let forceClose = false;
/** Time of a close request the interface has not acknowledged yet. */
let closeAsked = 0;

function nativeClosePrompt(): void {
  if (!win || win.isDestroyed() || !closePrompt) return;
  const choice = dialog.showMessageBoxSync(win, {
    type: 'warning',
    buttons: [closePrompt.cancel, closePrompt.discard],
    defaultId: 0,
    cancelId: 0,
    message: closePrompt.message,
    detail: closePrompt.detail,
  });
  if (choice === 1) {
    forceClose = true;
    win.close();
  }
}
let quitting = false;
let rendererCrashed = false;

/** A project or workshop file passed on the command line (opened from Explorer). */
function fileArg(argv: string[]): string | null {
  return argv.slice(1).find((a) => /\.(vrproj|kadroitem|vrmod|cube)$/i.test(a) && fs.existsSync(a)) ?? null;
}
let pendingOpen = fileArg(process.argv);

/** A kadro:// link (workshop sign-in, workshop item) passed by the browser. */
function linkArg(argv: string[]): string | null {
  return argv.slice(1).find((a) => /^kadro:\/\//i.test(a)) ?? null;
}
let pendingLink = linkArg(process.argv);

/** Sign-in links are handled here (they carry the password); others go to the page. */
function handleLink(url: string): void {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return;
  }
  if (host === 'auth') {
    const ok = workshop.acceptAuthRedirect(url);
    win?.webContents.send('workshop:auth', ok);
    return;
  }
  win?.webContents.send('app:deepLink', url);
}

// One window per installation: opening another project file hands it to the
// running instance. Development runs (and tests) may start several copies.
if (app.isPackaged && !app.requestSingleInstanceLock()) app.quit();
if (app.isPackaged) app.setAsDefaultProtocolClient('kadro');
app.on('second-instance', (_e, argv) => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  const file = fileArg(argv);
  if (file) win.webContents.send('app:openFile', file);
  const link = linkArg(argv);
  if (link) handleLink(link);
});

// ---------------------------------------------------------------------------
// Media workers: decoding and encoding run in two utility processes connected
// to the window by MessagePorts, keeping bulk frame data off this process.

type WorkerRole = 'decode' | 'encode';
const workers: Partial<Record<WorkerRole, UtilityProcess>> = {};

function connectWorker(role: WorkerRole): void {
  const child = workers[role];
  if (!child || !win || win.isDestroyed()) return;
  const { port1, port2 } = new MessageChannelMain();
  child.postMessage({ type: 'port' }, [port1]);
  win.webContents.postMessage('media-port', role, [port2]);
}

function startWorker(role: WorkerRole): void {
  const child = utilityProcess.fork(path.join(__dirname, '../worker/index.js'), [], { serviceName: `${APP_NAME} ${role}` });
  child.on('exit', () => {
    if (workers[role] === child) delete workers[role];
    if (quitting) return;
    startWorker(role);
    connectWorker(role);
  });
  workers[role] = child;
}

function createWindow(): void {
  const icon = path.join(__dirname, '../renderer/logo.png');
  win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: TITLE_BAR_COLOR,
    title: APP_NAME,
    icon: fs.existsSync(icon) ? icon : undefined,
    // The app draws its own title bar; Windows keeps only the caption buttons,
    // painted in the app's colours.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: TITLE_BAR_COLOR, symbolColor: TITLE_BAR_SYMBOLS, height: TITLE_BAR_HEIGHT },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  win.once('ready-to-show', () => {
    win?.maximize();
    win?.show();
  });

  const devUrl = process.env.VR_DEV_SERVER_URL;
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'));

  // If the interface process dies, reload it; the autosave is then offered for recovery.
  win.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit') return;
    rendererCrashed = true;
    dirty = false;
    setTimeout(() => win?.webContents.reload(), 500);
  });

  // Every page load (including dev reloads) gets fresh worker channels.
  win.webContents.on('did-finish-load', () => {
    connectWorker('decode');
    connectWorker('encode');
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (devUrl && url.startsWith(devUrl)) return;
    e.preventDefault();
  });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
      win?.webContents.toggleDevTools();
    }
  });

  // Unsaved changes: the interface asks in its own dialog (save / don't save /
  // cancel). The system dialog is only a fallback when the page does not answer.
  win.on('close', (e) => {
    if (!dirty || forceClose || !win) return;
    e.preventDefault();
    if (rendererCrashed || win.webContents.isCrashed()) {
      nativeClosePrompt();
      return;
    }
    const asked = Date.now();
    closeAsked = asked;
    win.webContents.send('app:closeRequest');
    setTimeout(() => {
      if (closeAsked === asked) {
        closeAsked = 0;
        nativeClosePrompt();
      }
    }, 4000);
  });
  win.on('closed', () => {
    win = null;
  });
}

function registerIpc(): void {
  ipcMain.handle('dialog:openMedia', async () => {
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media', extensions: MEDIA_EXTENSIONS },
        { name: '*', extensions: ['*'] },
      ],
    });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle('dialog:openProject', async () => {
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: `${APP_NAME} project`, extensions: ['vrproj', 'json'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:openFile', async (_e, filters: FileFilter[]) => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:saveFile', async (_e, defaultName: string, filters: FileFilter[]) => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: defaultName, filters });
    return r.canceled || !r.filePath ? null : r.filePath;
  });

  ipcMain.handle('fs:readText', (_e, p: string) => fs.promises.readFile(p, 'utf8'));
  ipcMain.handle('fs:writeText', async (_e, p: string, text: string, backup?: boolean) => {
    const tmp = `${p}.tmp`;
    await fs.promises.writeFile(tmp, text, 'utf8');
    if (backup && fs.existsSync(p)) await fs.promises.copyFile(p, `${p}.bak`);
    await fs.promises.rename(tmp, p);
  });
  ipcMain.handle('autosave:write', (_e, json: string, meta: AutosaveMeta) => autosave.autosaveWrite(json, meta));
  ipcMain.handle('autosave:read', () => autosave.autosaveRead());
  ipcMain.handle('autosave:clear', () => autosave.autosaveClear());
  ipcMain.handle('fs:writeBinary', (_e, p: string, data: Uint8Array) => fs.promises.writeFile(p, data));
  ipcMain.handle('fs:exists', (_e, p: string) => fs.existsSync(p));

  ipcMain.handle('media:probe', (_e, p: string) => media.probe(p));
  ipcMain.handle('media:thumbnail', (_e, p: string, kind: MediaKind, duration: number) => media.thumbnail(p, kind, duration));
  ipcMain.handle('media:filmstrip', (_e, p: string, w: number, h: number, d: number) => media.filmstrip(p, w, h, d));
  ipcMain.handle('media:waveform', (_e, p: string) => media.waveform(p));
  ipcMain.handle('media:frame', (_e, p: string, time: number) => media.extractFrame(p, time));
  ipcMain.handle('media:pcm', (_e, p: string, start: number, duration: number) => media.readPcm(p, start, duration));
  ipcMain.handle('media:workPath', (_e, name: string) => media.workPath(name));
  ipcMain.handle('ai:cacheGet', (_e, url: string) => media.modelCacheGet(url));
  ipcMain.handle('ai:cachePut', (_e, url: string, data: Uint8Array) => media.modelCachePut(url, data));
  ipcMain.handle('export:matteStart', (_e, spec: MatteSpec) => render.matteStart(spec));
  ipcMain.handle('media:reverse', (e, p: string, start: number, duration: number, withAudio: boolean) =>
    media.reverseRange(p, start, duration, withAudio, (progress) => {
      if (!e.sender.isDestroyed()) e.sender.send('media:proxyProgress', p, progress);
    }),
  );
  const taskProgress = (e: Electron.IpcMainInvokeEvent, taskId: string) => (progress: number) => {
    if (!e.sender.isDestroyed()) e.sender.send('media:taskProgress', taskId, progress);
  };
  ipcMain.handle('media:stabilize', (e, p: string, start: number, duration: number, opts: StabilizeOptions, taskId: string) =>
    media.stabilize(p, start, duration, opts, taskProgress(e, taskId)),
  );
  ipcMain.handle('media:denoise', (e, p: string, opts: DenoiseOptions, taskId: string) => media.denoise(p, opts, taskProgress(e, taskId)));
  ipcMain.handle('media:loudness', (_e, p: string, start: number, duration: number) => media.measureLoudness(p, start, duration));
  ipcMain.handle('library:search', (_e, q: LibrarySearch) => library.searchLibrary(q));
  ipcMain.handle('library:download', (e, item: LibraryItem, taskId: string) => library.downloadLibraryItem(item, taskProgress(e, taskId)));
  ipcMain.handle('media:scenes', (_e, p: string, start: number, duration: number, threshold: number) => media.detectScenes(p, start, duration, threshold));
  ipcMain.handle('media:proxy', (e, p: string, kind: MediaKind, duration: number) =>
    media.proxy(p, kind, duration, (progress) => {
      if (!e.sender.isDestroyed()) e.sender.send('media:proxyProgress', p, progress);
    }),
  );

  ipcMain.handle('mods:list', () => mods.listMods());
  ipcMain.handle('mods:catalog', () => mods.listCatalog());
  ipcMain.handle('mods:install', (_e, paths: string[]) => mods.installMods(paths));
  ipcMain.handle('mods:remove', (_e, file: string) => mods.removeMod(file));
  ipcMain.handle('mods:installText', (_e, fileName: string, text: string) => mods.installModText(fileName, text));
  ipcMain.handle('shadertoy:fetch', (_e, id: string, key: string) => library.fetchShadertoy(id, key));
  ipcMain.handle('update:check', () => updates.checkForUpdates());
  ipcMain.handle('update:status', () => updates.updateStatus());
  ipcMain.on('update:install', () => {
    // The interface has already asked about unsaved changes.
    forceClose = true;
    updates.installUpdate();
  });
  updates.onUpdateStatus((s) => {
    if (win && !win.isDestroyed()) win.webContents.send('update:changed', s);
  });
  ipcMain.handle('clipboard:read', () => systemClipboard.readClipboard());
  ipcMain.handle('clipboard:writeText', (_e, text: string) => systemClipboard.writeClipboardText(String(text).slice(0, 100_000)));
  ipcMain.handle('link:toolStatus', () => tiktok.linkToolStatus());
  ipcMain.handle('link:import', (e, url: string, taskId: string) =>
    tiktok.importLinkVideo(url, taskProgress(e, `${taskId}:tool`), taskProgress(e, taskId)),
  );
  ipcMain.on('mods:folder', () => mods.openModsFolder());
  ipcMain.handle('dialog:openMods', async () => {
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: `${APP_NAME} mod`, extensions: ['vrmod'] }],
    });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle('fonts:list', () => fonts.listFonts());
  ipcMain.handle('fonts:read', (_e, file: string) => fonts.readFont(file));
  ipcMain.handle('fonts:install', (_e, paths: string[]) => fonts.installFonts(paths));
  ipcMain.handle('fonts:remove', (_e, file: string) => fonts.removeFont(file));
  ipcMain.on('fonts:folder', () => fonts.openFontsFolder());
  ipcMain.handle('dialog:openFonts', async () => {
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
    });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle('export:hwEncoders', () => hwEncoders());
  ipcMain.handle('export:start', (_e, spec: ExportSpec) => render.exportStart(spec));
  ipcMain.handle('export:frame', (_e, id: string, data: Uint8Array) => render.exportFrame(id, data));
  ipcMain.handle('export:finish', (_e, id: string) => render.exportFinish(id));
  ipcMain.handle('export:cancel', (_e, id: string) => render.exportCancel(id));
  ipcMain.handle('decoder:open', (_e, spec: DecoderSpec) => render.decoderOpen(spec));
  ipcMain.handle('decoder:read', (_e, id: string) => render.decoderRead(id));
  ipcMain.handle('decoder:close', (_e, id: string) => render.decoderClose(id));

  ipcMain.on('app:setDirty', (_e, d: boolean, prompt: ClosePrompt) => {
    dirty = d;
    closePrompt = prompt;
  });
  ipcMain.on('app:setTitle', (_e, title: string) => win?.setTitle(title));
  ipcMain.on('app:closeAck', () => {
    closeAsked = 0;
  });
  ipcMain.on('app:closeNow', () => {
    forceClose = true;
    win?.close();
  });
  ipcMain.on('app:appearance', (_e, a: Appearance) => {
    if (!win || win.isDestroyed()) return;
    const zoom = Math.min(1.5, Math.max(0.7, Number(a.zoom) || 1));
    const color = /^#[0-9a-f]{6}$/i.test(a.titleBarColor) ? a.titleBarColor : TITLE_BAR_COLOR;
    const symbolColor = /^#[0-9a-f]{6}$/i.test(a.symbolColor) ? a.symbolColor : TITLE_BAR_SYMBOLS;
    win.webContents.setZoomFactor(zoom);
    win.setBackgroundColor(color);
    win.setTitleBarOverlay({ color, symbolColor, height: Math.round(TITLE_BAR_HEIGHT * zoom) });
  });
  ipcMain.on('app:showItem', (_e, p: string) => shell.showItemInFolder(p));
  ipcMain.on('app:toggleDevTools', () => win?.webContents.toggleDevTools());
  ipcMain.handle('app:storage', () => storage.storageInfo());
  ipcMain.handle('app:clearStorage', (_e, kind: StorageKind) => storage.clearStorage(kind));
  ipcMain.handle('app:takeLink', () => {
    const link = pendingLink;
    pendingLink = null;
    if (link) handleLink(link);
  });
  ipcMain.handle('luts:list', () => luts.listLuts());
  ipcMain.handle('luts:installText', (_e, name: string, text: string) => luts.installLutText(name, text));
  ipcMain.handle('luts:add', (_e, paths: string[]) => luts.addLutFiles(paths));
  ipcMain.handle('luts:remove', (_e, file: string) => luts.removeLut(file));
  ipcMain.on('luts:folder', () => luts.openLutsFolder());
  ipcMain.handle('templates:list', () => templates.listTemplates());
  ipcMain.handle('templates:save', (_e, name: string, text: string) => templates.saveTemplateText(name, text));
  ipcMain.handle('templates:remove', (_e, file: string) => templates.removeTemplate(file));
  ipcMain.handle('workshop:list', (_e, q: WorkshopQuery) => workshop.listItems(q));
  ipcMain.handle('workshop:item', (_e, id: number) => workshop.getItem(id));
  ipcMain.handle('workshop:like', (_e, id: number) => workshop.likeItem(id));
  ipcMain.handle('workshop:delete', (_e, id: number) => workshop.deleteItem(id));
  ipcMain.handle('workshop:download', (_e, id: number) => workshop.downloadItem(id));
  ipcMain.handle('workshop:publish', (_e, p: WorkshopPublish) => workshop.publishItem(p));
  ipcMain.handle('workshop:account', () => workshop.account());
  ipcMain.handle('workshop:saveLogin', (_e, user: string, password: string) => workshop.saveAuth(user, password));
  ipcMain.on('workshop:signIn', () => void shell.openExternal(workshop.authorizeUrl()));
  ipcMain.on('workshop:signOut', () => workshop.clearAuth());
  ipcMain.on('workshop:open', (_e, route: string) => {
    // Pages of our own workshop site only.
    const url = new URL(route, workshop.workshopSite() + '/');
    if (url.origin === new URL(workshop.workshopSite()).origin) void shell.openExternal(url.toString());
  });
  ipcMain.handle('app:takeOpenFile', () => {
    const file = pendingOpen;
    pendingOpen = null;
    return file;
  });
  ipcMain.handle('app:info', async () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    platform: `${process.platform} ${process.arch}`,
    ffmpeg: ffmpegPath(),
    ffmpegVersion: await ffmpegVersion(),
  }));
}

/** Carries AI models, installed mods and UI preferences over from the pre-rename data folder. */
function migrateLegacyData(): void {
  const legacy = path.join(app.getPath('appData'), 'Videoredact');
  for (const name of ['models', 'mods', 'Local Storage']) {
    const from = path.join(legacy, name);
    const to = path.join(app.getPath('userData'), name);
    try {
      if (fs.existsSync(from) && !fs.existsSync(to)) {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.renameSync(from, to);
      }
    } catch {
      // Not critical: models are downloaded again on demand.
    }
  }
}

app.whenReady().then(() => {
  migrateLegacyData();
  Menu.setApplicationMenu(null);
  handleMediaProtocol();
  registerIpc();
  startWorker('decode');
  startWorker('encode');
  createWindow();
  // Probe GPU encoders in the background so the export dialog has them ready.
  void hwEncoders();
});

app.on('will-quit', () => {
  // A deliberate quit leaves nothing to recover; after a renderer crash keep it.
  if (!rendererCrashed) autosave.autosaveClear();
  quitting = true;
  for (const w of Object.values(workers)) w?.kill();
  render.killAll();
});
app.on('window-all-closed', () => app.quit());
