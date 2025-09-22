const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clickTreeAPI', {
  savePreset: (preset) => ipcRenderer.invoke('preset:save', preset),
  loadPreset: () => ipcRenderer.invoke('preset:load'),
  onMenuAction: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('menu-action', handler);
    return () => {
      ipcRenderer.removeListener('menu-action', handler);
    };
  }
});
