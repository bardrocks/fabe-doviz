const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getInitial: () => ipcRenderer.invoke('get-initial'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  onRates: (cb) => ipcRenderer.on('rates', (_e, state) => cb(state)),
  onFocusInput: (cb) => ipcRenderer.on('focus-input', () => cb()),
  hide: () => ipcRenderer.send('hide'),
  minimize: () => ipcRenderer.send('minimize'),
  refresh: () => ipcRenderer.send('refresh'),
  copy: (text) => ipcRenderer.send('copy', text),
  fitHeight: (h) => ipcRenderer.send('fit-height', h),
  setOpacity: (v) => ipcRenderer.send('set-opacity', v),
  // Görev çubuğu kutusu
  onMini: (cb) => ipcRenderer.on('mini', (_e, d) => cb(d)),
  miniClick: () => ipcRenderer.send('mini-click'),
  miniDrag: (dx) => ipcRenderer.send('mini-drag', dx),
  miniDragEnd: () => ipcRenderer.send('mini-drag-end'),
  miniMenu: () => ipcRenderer.send('mini-menu'),
});
