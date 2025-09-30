const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const ytSearch = require('yt-search');

let nodeFetch = (typeof fetch === 'function') ? fetch.bind(globalThis) : null;
if (!nodeFetch) {
  nodeFetch = async (...args) => {
    const mod = await import('node-fetch');
    return mod.default(...args);
  };
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menu = Menu.buildFromTemplate(buildMenuTemplate());
  Menu.setApplicationMenu(menu);
}

function buildMenuTemplate() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Save Preset',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow?.webContents.send('menu-action', 'save-preset');
          }
        },
        {
          label: 'Load Preset',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow?.webContents.send('menu-action', 'load-preset');
          }
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: process.platform === 'darwin' ? 'pasteAndMatchStyle' : 'delete' },
        ...(process.platform === 'darwin'
          ? [{ role: 'delete' }, { role: 'selectAll' }, { type: 'separator' }, { role: 'startSpeaking' }, { role: 'stopSpeaking' }]
          : [{ role: 'selectAll' }])
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggledevtools', accelerator: 'Alt+CmdOrCtrl+I' }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
    
  }

  return template;
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function sanitizePreset(preset) {
  
  const allowedKeys = [
    'depth','growthSpeed','treeScale','branchWidth',
    'colorMode','color','gradientStart','gradientEnd','seed',
    'lightDirection','lightIntensity','renderScale',
    'backgroundMode','depthMode','depthStrength'
  ];  
  return allowedKeys.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(preset, key)) {
      acc[key] = preset[key];
    }
    return acc;
  }, {});
}

ipcMain.handle('preset:save', async (_event, preset) => {
  try {
    const data = sanitizePreset(preset || {});
    const context = mainWindow;
    const result = await dialog.showSaveDialog(context, {
      title: 'Save ClickTree Preset',
      defaultPath: 'clicktree-preset.json',
      filters: [
        { name: 'JSON', extensions: ['json'] }
      ]
    });
    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }
    const serialized = JSON.stringify(data, null, 2);
    await fs.writeFile(result.filePath, serialized, 'utf8');
    return { canceled: false, filePath: result.filePath };
  } catch (error) {
    dialog.showErrorBox('Save Preset Failed', error.message);
    return { canceled: true, error: error.message };
  }
});

ipcMain.handle('preset:load', async () => {
  try {
    const context = mainWindow;
    const result = await dialog.showOpenDialog(context, {
      title: 'Load ClickTree Preset',
      properties: ['openFile'],
      filters: [
        { name: 'JSON', extensions: ['json'] }
      ]
    });
    if (result.canceled || !result.filePaths.length) {
      return null;
    }
    const filePath = result.filePaths[0];
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return sanitizePreset(parsed);
  } catch (error) {
    dialog.showErrorBox('Load Preset Failed', error.message);
    return null;
  }
});

// Open external URLs (e.g., Spotify links) in default browser
ipcMain.handle('util:openExternal', async (_event, url) => {
  try {
    if (typeof url === 'string' && url.trim()) {
      await shell.openExternal(url);
      return true;
    }
  } catch (e) {
    // ignore
  }
  return false;
});

// Simple login window to let the user sign into Spotify within the app session
ipcMain.handle('spotify:login', async () => {
  return await new Promise((resolve) => {
    try {
      const loginWin = new BrowserWindow({
        width: 520,
        height: 720,
        title: 'Spotify Login',
        parent: mainWindow,
        modal: true,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });
      loginWin.on('closed', () => resolve(true));
      loginWin.loadURL('https://accounts.spotify.com/en/login?continue=https%3A%2F%2Fopen.spotify.com%2F');
    } catch (_e) {
      resolve(false);
    }
  });
});

ipcMain.handle('youtube:search', async (_event, query) => {
  const term = typeof query === 'string' ? query.trim() : '';
  if (!term) {
    return { ok: false, error: 'empty-query' };
  }
  try {
    const results = await ytSearch(term);
    const videos = Array.isArray(results?.videos)
      ? results.videos
          .filter((video) => video?.videoId)
          .slice(0, 20)
          .map((video) => ({
            id: video.videoId,
            title: video.title || '',
            channel: video.author?.name || '',
            duration: video.timestamp || '',
            thumbnail: video.image || ''
          }))
      : [];
    return { ok: true, results: videos };
  } catch (error) {
    return { ok: false, error: error?.message || 'search-failed' };
  }
});

ipcMain.handle('youtube:checkEmbeddable', async (_event, videoId) => {
  const id = typeof videoId === 'string' ? videoId.trim() : '';
  if (!id) {
    return { ok: false, embeddable: false, error: 'invalid-id' };
  }
  let failureReason = '';
  try {
    const infoUrl = new URL('https://www.youtube.com/get_video_info');
    infoUrl.search = new URLSearchParams({
      video_id: id,
      el: 'embedded',
      hl: 'en',
      html5: '1'
    }).toString();
    const response = await nodeFetch(infoUrl.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (response.ok) {
      const body = await response.text();
      const params = new URLSearchParams(body);
      if (params.get('status') === 'fail') {
        return {
          ok: true,
          embeddable: false,
          reason: params.get('reason') || 'Video unavailable',
          errorCode: params.get('errorcode') || params.get('errorCode') || ''
        };
      }
      const playerResponseRaw = params.get('player_response');
      if (playerResponseRaw) {
        try {
          const playerResponse = JSON.parse(playerResponseRaw);
          const playability = playerResponse?.playabilityStatus || {};
          const embedInfo = playerResponse?.microformat?.playerMicroformatRenderer?.embed;
          const extractReason = () => playability.reason
            || embedInfo?.description
            || playability?.errorScreen?.playerErrorMessageRenderer?.reason?.simpleText
            || playability?.status
            || 'Video unavailable in embedded player';
          if (playability.playableInEmbed === false) {
            return {
              ok: true,
              embeddable: false,
              reason: extractReason(),
              status: playability.status || ''
            };
          }
          if (embedInfo && embedInfo.allowed === false) {
            return {
              ok: true,
              embeddable: false,
              reason: extractReason()
            };
          }
          if (playability.status && playability.status !== 'OK') {
            return {
              ok: true,
              embeddable: false,
              reason: extractReason()
            };
          }
        } catch (err) {
          failureReason = err?.message || 'player-response-parse';
        }
      }
      return { ok: true, embeddable: true };
    }
    failureReason = `get_video_info status ${response.status}`;
  } catch (error) {
    failureReason = error?.message || 'request-failed';
  }

  try {
    const oembedUrl = new URL('https://www.youtube.com/oembed');
    oembedUrl.search = new URLSearchParams({
      format: 'json',
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`
    }).toString();
    const oembedResponse = await nodeFetch(oembedUrl.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (oembedResponse.ok) {
      return { ok: true, embeddable: true };
    }
    return {
      ok: true,
      embeddable: false,
      reason: 'Video unavailable in embedded player',
      status: oembedResponse.status
    };
  } catch (fallbackError) {
    const reason = fallbackError?.message || failureReason || 'embed-check-failed';
    return { ok: false, embeddable: null, error: reason };
  }
});
