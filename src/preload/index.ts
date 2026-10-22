import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { VrApi } from '../shared/api';

const api: VrApi = {
  openMediaDialog: () => ipcRenderer.invoke('dialog:openMedia'),
  openProjectDialog: () => ipcRenderer.invoke('dialog:openProject'),
  openFileDialog: (filters) => ipcRenderer.invoke('dialog:openFile', filters),
  saveFileDialog: (defaultName, filters) => ipcRenderer.invoke('dialog:saveFile', defaultName, filters),
  readText: (p) => ipcRenderer.invoke('fs:readText', p),
  writeText: (p, text, backup) => ipcRenderer.invoke('fs:writeText', p, text, backup),
  autosaveWrite: (json, meta) => ipcRenderer.invoke('autosave:write', json, meta),
  autosaveRead: () => ipcRenderer.invoke('autosave:read'),
  autosaveClear: () => ipcRenderer.invoke('autosave:clear'),
  writeBinary: (p, data) => ipcRenderer.invoke('fs:writeBinary', p, data),
  exists: (p) => ipcRenderer.invoke('fs:exists', p),

  probe: (p) => ipcRenderer.invoke('media:probe', p),
  thumbnail: (p, kind, duration) => ipcRenderer.invoke('media:thumbnail', p, kind, duration),
  filmstrip: (p, w, h, d) => ipcRenderer.invoke('media:filmstrip', p, w, h, d),
  waveform: (p) => ipcRenderer.invoke('media:waveform', p),
  extractFrame: (p, time) => ipcRenderer.invoke('media:frame', p, time),
  reverseRange: (p, start, duration, withAudio) => ipcRenderer.invoke('media:reverse', p, start, duration, withAudio),
  stabilize: (p, start, duration, opts, taskId) => ipcRenderer.invoke('media:stabilize', p, start, duration, opts, taskId),
  denoise: (p, opts, taskId) => ipcRenderer.invoke('media:denoise', p, opts, taskId),
  measureLoudness: (p, start, duration) => ipcRenderer.invoke('media:loudness', p, start, duration),
  onTaskProgress: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, id: string, progress: number) => cb(id, progress);
    ipcRenderer.on('media:taskProgress', listener);
    return () => ipcRenderer.off('media:taskProgress', listener);
  },
  readPcm: (p, start, duration) => ipcRenderer.invoke('media:pcm', p, start, duration),
  workPath: (name) => ipcRenderer.invoke('media:workPath', name),
  modelCacheGet: (url) => ipcRenderer.invoke('ai:cacheGet', url),
  modelCachePut: (url, data) => ipcRenderer.invoke('ai:cachePut', url, data),
  matteStart: (spec) => ipcRenderer.invoke('export:matteStart', spec),
  proxy: (p, kind, duration) => ipcRenderer.invoke('media:proxy', p, kind, duration),
  onProxyProgress: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, p: string, progress: number) => cb(p, progress);
    ipcRenderer.on('media:proxyProgress', listener);
    return () => ipcRenderer.off('media:proxyProgress', listener);
  },

  hwEncoders: () => ipcRenderer.invoke('export:hwEncoders'),
  exportStart: (spec) => ipcRenderer.invoke('export:start', spec),
  exportFrame: (id, data) => ipcRenderer.invoke('export:frame', id, data),
  exportFinish: (id) => ipcRenderer.invoke('export:finish', id),
  exportCancel: (id) => ipcRenderer.invoke('export:cancel', id),

  decoderOpen: (spec) => ipcRenderer.invoke('decoder:open', spec),
  decoderRead: (id) => ipcRenderer.invoke('decoder:read', id),
  decoderClose: (id) => ipcRenderer.invoke('decoder:close', id),

  listMods: () => ipcRenderer.invoke('mods:list'),
  listModCatalog: () => ipcRenderer.invoke('mods:catalog'),
  installMods: (paths) => ipcRenderer.invoke('mods:install', paths),
  removeMod: (file) => ipcRenderer.invoke('mods:remove', file),
  openModsFolder: () => ipcRenderer.send('mods:folder'),
  openModsDialog: () => ipcRenderer.invoke('dialog:openMods'),

  setDirty: (dirty, prompt) => ipcRenderer.send('app:setDirty', dirty, prompt),
  setTitle: (title) => ipcRenderer.send('app:setTitle', title),
  showItemInFolder: (p) => ipcRenderer.send('app:showItem', p),
  appInfo: () => ipcRenderer.invoke('app:info'),
  takeOpenFile: () => ipcRenderer.invoke('app:takeOpenFile'),
  onOpenFile: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, p: string) => cb(p);
    ipcRenderer.on('app:openFile', listener);
    return () => ipcRenderer.off('app:openFile', listener);
  },
  toggleDevTools: () => ipcRenderer.send('app:toggleDevTools'),
  getPathForFile: (file) => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld('api', api);

// Direct channels to the media worker processes. MessagePorts cannot cross the
// context bridge, so they are forwarded to the page with window.postMessage.
declare const window: { postMessage(message: unknown, targetOrigin: string, transfer?: readonly unknown[]): void };
ipcRenderer.on('media-port', (e, role: string) => {
  window.postMessage({ type: 'vr-media-port', role }, '*', e.ports);
});
