import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { UpdateStatus, VrApi } from '../shared/api';

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
  detectScenes: (p, start, duration, threshold) => ipcRenderer.invoke('media:scenes', p, start, duration, threshold),
  searchLibrary: (q) => ipcRenderer.invoke('library:search', q),
  downloadLibraryItem: (item, taskId) => ipcRenderer.invoke('library:download', item, taskId),
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
  installModText: (fileName, text) => ipcRenderer.invoke('mods:installText', fileName, text),
  fetchShadertoy: (id, key) => ipcRenderer.invoke('shadertoy:fetch', id, key),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboardText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  linkToolStatus: () => ipcRenderer.invoke('link:toolStatus'),
  importLinkVideo: (url, taskId) => ipcRenderer.invoke('link:import', url, taskId),
  listLuts: () => ipcRenderer.invoke('luts:list'),
  installLutText: (name, text) => ipcRenderer.invoke('luts:installText', name, text),
  addLutFiles: (paths) => ipcRenderer.invoke('luts:add', paths),
  removeLut: (file) => ipcRenderer.invoke('luts:remove', file),
  openLutsFolder: () => ipcRenderer.send('luts:folder'),
  listTemplates: () => ipcRenderer.invoke('templates:list'),
  saveTemplate: (name, text) => ipcRenderer.invoke('templates:save', name, text),
  removeTemplate: (file) => ipcRenderer.invoke('templates:remove', file),
  workshopList: (q) => ipcRenderer.invoke('workshop:list', q),
  workshopItem: (id) => ipcRenderer.invoke('workshop:item', id),
  workshopLike: (id) => ipcRenderer.invoke('workshop:like', id),
  workshopDelete: (id) => ipcRenderer.invoke('workshop:delete', id),
  workshopDownload: (id) => ipcRenderer.invoke('workshop:download', id),
  workshopPublish: (p) => ipcRenderer.invoke('workshop:publish', p),
  workshopAccount: () => ipcRenderer.invoke('workshop:account'),
  workshopSignIn: () => ipcRenderer.send('workshop:signIn'),
  workshopSignOut: () => ipcRenderer.send('workshop:signOut'),
  workshopSignUp: (lang) => ipcRenderer.send('workshop:signUp', lang),
  workshopResendConfirm: () => ipcRenderer.invoke('workshop:resend'),
  workshopReview: (id, action, reason) => ipcRenderer.invoke('workshop:review', id, action, reason),
  workshopReport: (id, reason) => ipcRenderer.invoke('workshop:report', id, reason),
  workshopSaveLogin: (user, password) => ipcRenderer.invoke('workshop:saveLogin', user, password),
  workshopOpen: (route) => ipcRenderer.send('workshop:open', route),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  installUpdate: () => ipcRenderer.send('update:install'),
  onUpdateStatus: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, s: UpdateStatus) => cb(s);
    ipcRenderer.on('update:changed', listener);
    return () => ipcRenderer.off('update:changed', listener);
  },
  onWorkshopAuth: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, ok: boolean) => cb(ok);
    ipcRenderer.on('workshop:auth', listener);
    return () => ipcRenderer.off('workshop:auth', listener);
  },
  onDeepLink: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, url: string) => cb(url);
    ipcRenderer.on('app:deepLink', listener);
    return () => ipcRenderer.off('app:deepLink', listener);
  },
  takeLink: () => ipcRenderer.invoke('app:takeLink'),
  listFonts: () => ipcRenderer.invoke('fonts:list'),
  readFont: (file) => ipcRenderer.invoke('fonts:read', file),
  installFonts: (paths) => ipcRenderer.invoke('fonts:install', paths),
  removeFont: (file) => ipcRenderer.invoke('fonts:remove', file),
  openFontsFolder: () => ipcRenderer.send('fonts:folder'),
  openFontsDialog: () => ipcRenderer.invoke('dialog:openFonts'),

  setDirty: (dirty, prompt) => ipcRenderer.send('app:setDirty', dirty, prompt),
  setTitle: (title) => ipcRenderer.send('app:setTitle', title),
  setAppearance: (a) => ipcRenderer.send('app:appearance', a),
  onCloseRequest: (cb) => {
    const listener = () => {
      ipcRenderer.send('app:closeAck');
      cb();
    };
    ipcRenderer.on('app:closeRequest', listener);
    return () => ipcRenderer.off('app:closeRequest', listener);
  },
  closeNow: () => ipcRenderer.send('app:closeNow'),
  showItemInFolder: (p) => ipcRenderer.send('app:showItem', p),
  appInfo: () => ipcRenderer.invoke('app:info'),
  storageInfo: () => ipcRenderer.invoke('app:storage'),
  clearStorage: (kind) => ipcRenderer.invoke('app:clearStorage', kind),
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
