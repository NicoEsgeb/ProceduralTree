const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs/promises');

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
  const allowedKeys = ['depth', 'growthSpeed', 'treeScale', 'branchWidth', 'colorMode', 'color', 'gradientStart', 'gradientEnd', 'seed'];
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
