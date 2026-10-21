import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { handleMediaProtocol, registerMediaScheme } from './protocol';
import * as media from './media';
import * as render from './render';
import { ffmpegPath, ffmpegVersion } from './ffmpeg';
import type { ClosePrompt, DecoderSpec, ExportSpec, FileFilter, MediaKind } from '../shared/api';

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

function createWindow(): void {
  win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#141518',
    title: 'Videoredact',
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

  win.on('close', (e) => {
    if (!dirty || forceClose || !closePrompt || !win) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: [closePrompt.cancel, closePrompt.discard],
      defaultId: 0,
      cancelId: 0,
      message: closePrompt.message,
      detail: closePrompt.detail,
    });
    if (choice === 0) e.preventDefault();
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
      filters: [{ name: 'Videoredact project', extensions: ['vrproj', 'json'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:saveFile', async (_e, defaultName: string, filters: FileFilter[]) => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: defaultName, filters });
    return r.canceled || !r.filePath ? null : r.filePath;
  });

  ipcMain.handle('fs:readText', (_e, p: string) => fs.promises.readFile(p, 'utf8'));
  ipcMain.handle('fs:writeText', async (_e, p: string, text: string) => {
    const tmp = `${p}.tmp`;
    await fs.promises.writeFile(tmp, text, 'utf8');
    await fs.promises.rename(tmp, p);
  });
  ipcMain.handle('fs:writeBinary', (_e, p: string, data: Uint8Array) => fs.promises.writeFile(p, data));
  ipcMain.handle('fs:exists', (_e, p: string) => fs.existsSync(p));

  ipcMain.handle('media:probe', (_e, p: string) => media.probe(p));
  ipcMain.handle('media:thumbnail', (_e, p: string, kind: MediaKind, duration: number) => media.thumbnail(p, kind, duration));
  ipcMain.handle('media:filmstrip', (_e, p: string, w: number, h: number, d: number) => media.filmstrip(p, w, h, d));
  ipcMain.handle('media:waveform', (_e, p: string) => media.waveform(p));
  ipcMain.handle('media:proxy', (e, p: string, kind: MediaKind, duration: number) =>
    media.proxy(p, kind, duration, (progress) => {
      if (!e.sender.isDestroyed()) e.sender.send('media:proxyProgress', p, progress);
    }),
  );

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
  ipcMain.on('app:showItem', (_e, p: string) => shell.showItemInFolder(p));
  ipcMain.on('app:toggleDevTools', () => win?.webContents.toggleDevTools());
  ipcMain.handle('app:info', async () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    platform: `${process.platform} ${process.arch}`,
    ffmpeg: ffmpegPath(),
    ffmpegVersion: await ffmpegVersion(),
  }));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  handleMediaProtocol();
  registerIpc();
  createWindow();
});

app.on('will-quit', () => render.killAll());
app.on('window-all-closed', () => app.quit());
