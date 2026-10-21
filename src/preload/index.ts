import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { VrApi } from '../shared/api';

const api: VrApi = {
  openMediaDialog: () => ipcRenderer.invoke('dialog:openMedia'),
  openProjectDialog: () => ipcRenderer.invoke('dialog:openProject'),
  saveFileDialog: (defaultName, filters) => ipcRenderer.invoke('dialog:saveFile', defaultName, filters),
  readText: (p) => ipcRenderer.invoke('fs:readText', p),
  writeText: (p, text) => ipcRenderer.invoke('fs:writeText', p, text),
  writeBinary: (p, data) => ipcRenderer.invoke('fs:writeBinary', p, data),
  exists: (p) => ipcRenderer.invoke('fs:exists', p),

  probe: (p) => ipcRenderer.invoke('media:probe', p),
  thumbnail: (p, kind, duration) => ipcRenderer.invoke('media:thumbnail', p, kind, duration),
  filmstrip: (p, w, h, d) => ipcRenderer.invoke('media:filmstrip', p, w, h, d),
  waveform: (p) => ipcRenderer.invoke('media:waveform', p),
  proxy: (p, kind, duration) => ipcRenderer.invoke('media:proxy', p, kind, duration),
  onProxyProgress: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, p: string, progress: number) => cb(p, progress);
    ipcRenderer.on('media:proxyProgress', listener);
    return () => ipcRenderer.off('media:proxyProgress', listener);
  },

  exportStart: (spec) => ipcRenderer.invoke('export:start', spec),
  exportFrame: (id, data) => ipcRenderer.invoke('export:frame', id, data),
  exportFinish: (id) => ipcRenderer.invoke('export:finish', id),
  exportCancel: (id) => ipcRenderer.invoke('export:cancel', id),

  decoderOpen: (spec) => ipcRenderer.invoke('decoder:open', spec),
  decoderRead: (id) => ipcRenderer.invoke('decoder:read', id),
  decoderClose: (id) => ipcRenderer.invoke('decoder:close', id),

  setDirty: (dirty, prompt) => ipcRenderer.send('app:setDirty', dirty, prompt),
  setTitle: (title) => ipcRenderer.send('app:setTitle', title),
  showItemInFolder: (p) => ipcRenderer.send('app:showItem', p),
  appInfo: () => ipcRenderer.invoke('app:info'),
  toggleDevTools: () => ipcRenderer.send('app:toggleDevTools'),
  getPathForFile: (file) => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld('api', api);
