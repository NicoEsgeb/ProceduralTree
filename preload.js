const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('clickTreeAPI', {
  savePreset: (preset) => ipcRenderer.invoke('preset:save', preset),
  loadPreset: () => ipcRenderer.invoke('preset:load'),
  openSpotifyLogin: () => ipcRenderer.invoke('spotify:login'),
  openExternal: (url) => ipcRenderer.invoke('util:openExternal', url),
  youtubeSearch: (query) => ipcRenderer.invoke('youtube:search', query),
  youtubeCheckEmbeddable: (videoId) => ipcRenderer.invoke('youtube:checkEmbeddable', videoId),
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

contextBridge.exposeInMainWorld('Clipboard', {
  readText: () => {
    try {
      const text = clipboard.readText();
      if (!text) return '';
      if (text.length > 10000) {
        return text.slice(0, 10000);
      }
      return text;
    } catch (_e) {
      return '';
    }
  }
});
