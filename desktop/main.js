/*
 * main.js — the desktop widget (Windows, macOS, Linux) built with Electron.
 * The news engine runs right here inside the app: no server, no hosting, no account.
 */
'use strict';
const { app, BrowserWindow, ipcMain, screen, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { Aggregator } = require('../core/aggregator.js');

let config = {};
try { config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8')); } catch (e) { /* defaults */ }

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

const statePath = () => path.join(app.getPath('userData'), 'window-state.json');
function loadBounds() {
  try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch (e) { return null; }
}
function saveBounds(win) {
  try { fs.writeFileSync(statePath(), JSON.stringify(win.getBounds())); } catch (e) { /* ignore */ }
}

function boundsOnScreen(b) {
  return screen.getAllDisplays().some(d => {
    const a = d.workArea;
    return b.x + 40 < a.x + a.width && b.x + b.width - 40 > a.x && b.y + 40 < a.y + a.height && b.y >= a.y - 10;
  });
}

let win;
const aggregator = new Aggregator({ log: (...a) => console.log(...a) });

function createWindow() {
  const work = screen.getPrimaryDisplay().workArea;
  const width = config.width || 340;
  const height = config.height || 453;           // ≈ 3 columns × 4 rows, portrait
  let b = loadBounds();
  if (!b || !boundsOnScreen(b)) b = { width, height, x: work.x + work.width - width - 24, y: work.y + 24 };

  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    minWidth: 220, minHeight: 280,
    frame: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#0a0a0b',
    alwaysOnTop: !!config.alwaysOnTop,
    skipTaskbar: false,
    title: 'Headlines',
    show: false,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'display', 'index.html'));
  win.once('ready-to-show', () => win.showInactive ? win.showInactive() : win.show());
  let t;
  const remember = () => { clearTimeout(t); t = setTimeout(() => saveBounds(win), 400); };
  win.on('move', remember);
  win.on('resize', remember);
  win.on('close', () => saveBounds(win));
  // Headlines are not links: block any navigation or pop-up.
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

ipcMain.handle('headlines:after', (_e, after) => aggregator.getAfter(Number(after), 500));

app.whenReady().then(() => {
  if (!gotLock) return;
  // Keep the standard Quit shortcut (Cmd+Q / Ctrl+Q) without showing any menu.
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Headlines', submenu: [{ role: 'quit' }, { role: 'close', accelerator: 'CmdOrCtrl+W' }] }]));
  if (process.platform === 'darwin' && app.dock && config.hideDockIcon) app.dock.hide();
  if (config.openAtLogin !== undefined) app.setLoginItemSettings({ openAtLogin: !!config.openAtLogin });
  aggregator.start();
  createWindow();
});

app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
