const { app, BrowserWindow, Menu, shell, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow = null;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function checkServerPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/public/menu`, { timeout: 900 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function resolveActiveHubUrl() {
  for (const port of [8081, 5050, 5000]) {
    if (await checkServerPort(port)) {
      return `http://localhost:${port}`;
    }
  }
  return null;
}

async function ensurePosHubRunning() {
  const runningUrl = await resolveActiveHubUrl();
  if (runningUrl) {
    return runningUrl;
  }

  const appRoot = app.getAppPath();
  const unpackedDist = path.join(appRoot.replace(/app\.asar$/, 'app.asar.unpacked'), 'app-dist');
  const distDir = fs.existsSync(unpackedDist) ? unpackedDist : path.join(appRoot, 'app-dist');
  const bundledSeed = path.join(appRoot, 'server-data.seed.json');

  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'));
  const nearbyDb = path.join(exeDir, 'server-data.json');
  let dataFile = path.join(app.getPath('userData'), 'server-data.json');

  if (fs.existsSync(nearbyDb)) {
    dataFile = nearbyDb;
  } else if (!fs.existsSync(dataFile) && fs.existsSync(bundledSeed)) {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.copyFileSync(bundledSeed, dataFile);
  }

  process.env.SULTAN_DIST_DIR = distDir;
  process.env.SULTAN_DATA_FILE = dataFile;

  require(path.join(appRoot, 'server.js'));

  for (let i = 0; i < 40; i++) {
    const url = await resolveActiveHubUrl();
    if (url) return url;
    await new Promise((r) => setTimeout(r, 250));
  }
  return 'http://localhost:8081';
}

function createWindow(startUrl) {
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: 'Sultan Restaurant — Royal Dining & Smart POS',
    backgroundColor: '#2A080D',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(startUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    const targetUrl = await ensurePosHubRunning();
    createWindow(targetUrl);

    globalShortcut.register('F11', () => {
      if (mainWindow) {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
      }
    });
    globalShortcut.register('CommandOrControl+R', () => {
      if (mainWindow) mainWindow.webContents.reloadIgnoringCache();
    });
  } catch (err) {
    dialog.showErrorBox('Sultan POS Startup Error', err.message || String(err));
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

