/* =====================================================================
 * WARDOGS 战术工具箱 — Electron 桌面版
 * ---------------------------------------------------------------------
 * 反作弊安全声明（重要）：
 *   本应用只是一个普通的系统窗口（Electron BrowserWindow）。
 *   它【不读取、不注入、不修改】任何游戏进程或内存，与游戏零交互；
 *   悬浮窗就是一个置顶的透明小窗口，原理等同于开一个浏览器小窗。
 *   使用游戏内悬浮窗时，请把游戏设为「无边框窗口 / 窗口化」模式。
 * ---------------------------------------------------------------------
 * 快捷键：Alt+X  全局开关悬浮窗；Esc 关闭悬浮窗（隐藏，不退出）。
 * UI：renderer/ 下的全新桌面界面（Shoelace 组件库，本地打包无网络依赖）。
 * 地图：默认云端瓦片（?src=cdn），不随应用打包任何游戏素材。
 * ===================================================================== */
const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

/* ---------- app:// 协议：映射到 renderer/ 目录 ---------- */
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const RENDERER = path.join(__dirname, 'renderer');
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

function createPageURL(query) {
  return 'app://renderer/index.html' + (query || '');
}

let win = null;        // 主窗口
let overlay = null;    // 悬浮窗
let tray = null;
let quitting = false;
const HOTKEY = 'Alt+X';

const winOpts = (extra) => Object.assign({
  backgroundColor: '#0e1116',
  webPreferences: {
    contextIsolation: true,   // 渲染进程与 Node 完全隔离
    nodeIntegration: false,   // 页面拿不到 Node 能力
    sandbox: true,
  },
}, extra);

function createMain() {
  win = new BrowserWindow(winOpts({
    width: 1440, height: 920, minWidth: 1080, minHeight: 680,
    title: 'WARDOGS 战术工具箱',
    autoHideMenuBar: true,
  }));
  win.loadURL(createPageURL('?src=auto'));
  win.on('close', (e) => {
    if (!quitting) { e.preventDefault(); win.hide(); }   // 关闭 = 缩到托盘
  });
  win.on('closed', () => { win = null; });
}

function createOverlay() {
  overlay = new BrowserWindow(winOpts({
    width: 560, height: 820, minHeight: 420, minWidth: 380,
    frame: false,            // 无边框
    transparent: true,       // 透明
    alwaysOnTop: true,       // 游戏内置顶
    skipTaskbar: true,       // 不占任务栏
    hasShadow: true,
    title: 'WARDOGS 悬浮窗',
  }));
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.loadURL(createPageURL('?src=cdn&overlay=1'));
  /* Esc 隐藏悬浮窗 */
  overlay.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') overlay.hide();
  });
  overlay.on('closed', () => { overlay = null; });
}

function toggleOverlay() {
  if (overlay && !overlay.isDestroyed()) {
    overlay.isVisible() ? overlay.hide() : overlay.show();
  } else {
    createOverlay();
  }
}

function showMain() {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); }
  else createMain();
}

/* 16x16 托盘图标（橙色圆形，运行时生成，无需外部素材） */
function trayIcon() {
  const size = 16, c = (size - 1) / 2, r = size / 2 - 1.5;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const inside = (x - c) ** 2 + (y - c) ** 2 <= r * r;
    const o = (y * size + x) * 4;
    buf[o] = inside ? 214 : 0; buf[o + 1] = inside ? 92 : 0;
    buf[o + 2] = inside ? 14 : 0; buf[o + 3] = inside ? 255 : 0;
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('WARDOGS 战术工具箱');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示主窗口', click: showMain },
    { label: '悬浮窗 开/关 (' + HOTKEY + ')', click: toggleOverlay },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showMain);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  /* 纯 2D 地图应用：固定禁用 GPU 加速 + GPU 进程内嵌，
     虚拟机 / 远程桌面 / 无显卡环境下也不会白屏崩溃 */
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('in-process-gpu');

  app.on('second-instance', showMain);

  app.whenReady().then(() => {
    protocol.handle('app', (request) => {
      const { pathname } = new URL(request.url);
      const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.join(RENDERER, rel);
      if (!file.startsWith(RENDERER)) return new Response('forbidden', { status: 403 });
      try {
        const buf = fs.readFileSync(file);
        const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
        return new Response(buf, { headers: { 'content-type': type } });
      } catch {
        return new Response('not found', { status: 404 });
      }
    });
    createMain();
    createTray();
    globalShortcut.register(HOTKEY, toggleOverlay);
    app.on('activate', () => { if (!win) createMain(); });
  });

  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => { /* 常驻托盘，不退出 */ });
}
