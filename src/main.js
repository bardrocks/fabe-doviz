const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen, clipboard, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { Scraper } = require('./scraper');
const Calc = require('./calc');
const { Updater } = require('./updater');
const { TrayWatch } = require('./traywatch');

const SHORTCUT = 'CommandOrControl+Shift+D';

const DEFAULT_SETTINGS = {
  rates: Calc.defaultRateSettings(), // USD/TL, EUR/TL, EUR/USD: canlı (alış/satış) veya manuel
  alwaysOnTop: true,
  openAtLogin: false,
  opacity: 1,          // pencere şeffaflığı (0.3 – 1)
  taskbarRate: true,   // görev çubuğunda dolar kuru
  taskbarOffset: 0,    // görev çubuğu kutusu: saatin / ^ okunun solundan kaydırma (sürükleyince değişir)
};
const MIN_OPACITY = 0.3;
const WIDTH = 340;
const MINI_W = 112;

let win = null;
let mini = null;
let tray = null;
let lastRates = null;
let updater = null;
let trayWatch = null;
let scraper = null;
let lastState = null;
let quitting = false;

// ---- Ayarlar ----
const settingsFile = () => path.join(app.getPath('userData'), 'ayarlar.json');
function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    return {
      alwaysOnTop: saved.alwaysOnTop !== undefined ? !!saved.alwaysOnTop : DEFAULT_SETTINGS.alwaysOnTop,
      openAtLogin: !!saved.openAtLogin,
      opacity: clampOpacity(saved.opacity),
      taskbarRate: saved.taskbarRate !== undefined ? !!saved.taskbarRate : DEFAULT_SETTINGS.taskbarRate,
      taskbarOffset: Number.isFinite(saved.taskbarOffset) ? saved.taskbarOffset : 0,
      rates: Calc.normalizeRateSettings(saved),
    };
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}
function clampOpacity(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(MIN_OPACITY, n)) : 1;
}
function saveSettings(s) {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); } catch (_) {}
}
let settings = DEFAULT_SETTINGS;

// ---- Pencere ----
function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = WIDTH;
  const height = 400; // yükseklik içeriğe göre otomatik ayarlanır (fit-height)
  win = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 12,
    y: workArea.y + workArea.height - height - 12,
    useContentSize: true,
    frame: false,
    resizable: false,
    maximizable: false,
    skipTaskbar: false,
    alwaysOnTop: settings.alwaysOnTop,
    show: false,
    title: 'Fabe Döviz Hesap',
    icon: iconPath(),
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setOpacity(settings.opacity);
  win.loadFile(path.join(__dirname, 'index.html'));
  // İlk boyutlandırmadan sonra göster (zıplama olmasın); renderer yanıt vermezse yine de göster
  win.once('ready-to-show', () => setTimeout(() => { if (!firstShown) { firstShown = true; showWindow(); } }, 1500));
  win.on('close', (e) => {
    if (!quitting) { e.preventDefault(); win.hide(); }
  });
}

let firstShown = false;

// İçerik yüksekliği kadar pencere: alt kenar sabit kalır, ekran dışına taşmaz
function fitHeight(h) {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const { workArea } = screen.getDisplayMatching(b);
  const height = Math.max(120, Math.min(Math.ceil(h), workArea.height - 16));
  if (height !== b.height || b.width !== WIDTH) {
    const bottom = b.y + b.height;
    let y = bottom - height;
    if (y < workArea.y + 8) y = workArea.y + 8;
    win.setBounds({ x: b.x, y, width: WIDTH, height });
  }
  if (!firstShown) { firstShown = true; showWindow(); }
}

function showWindow() {
  if (!win) return;
  win.show();
  win.focus();
  win.webContents.send('focus-input');
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible() && win.isFocused()) win.hide();
  else showWindow();
}

function iconPath() {
  const p = path.join(__dirname, '..', 'build', 'icon.png');
  return fs.existsSync(p) ? p : undefined;
}

// ---- Görev çubuğu kuru ----
// Windows hava durumu kutusu gibi görev çubuğunun üzerinde duran küçük, şeffaf bir pencere.
function taskbarRect() {
  const d = screen.getPrimaryDisplay();
  const { bounds: s, workArea: w } = d;
  const bottomGap = s.y + s.height - (w.y + w.height);
  const topGap = w.y - s.y;
  if (bottomGap > 0) return { y: w.y + w.height, height: bottomGap, s };
  if (topGap > 0) return { y: s.y, height: topGap, s };
  return { y: s.y + s.height - 48, height: 48, s }; // gizlenen / yan görev çubuğu
}

// Varsayılan yer: bildirim alanının (^ oku + simgeler + saat) hemen solu
function miniAnchorX(r) {
  const tw = trayWatch && trayWatch.value;
  if (tw && tw.notify.y >= r.y - 4 && tw.notify.y < r.y + r.height) return tw.notify.x - MINI_W - 4;
  return r.s.x + r.s.width - 240 - MINI_W; // bulunamazsa: saat + simgeler için tahmini pay
}

function miniBounds() {
  const r = taskbarRect();
  const height = Math.min(r.height, 60);
  const maxX = r.s.x + r.s.width - MINI_W;
  let x = miniAnchorX(r) + (Number(settings.taskbarOffset) || 0);
  x = Math.max(r.s.x, Math.min(maxX, Math.round(x)));
  return { x, y: r.y + Math.round((r.height - height) / 2), width: MINI_W, height };
}

function taskbarIsDark() {
  const v = nativeTheme.shouldUseDarkColorsForSystemIntegration;
  return typeof v === 'boolean' ? v : nativeTheme.shouldUseDarkColors;
}

function createMini() {
  if (mini && !mini.isDestroyed()) return;
  mini = new BrowserWindow({
    ...miniBounds(),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    title: 'Fabe Döviz - USD/TL',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mini.setAlwaysOnTop(true, 'screen-saver');
  mini.loadFile(path.join(__dirname, 'mini.html'));
  mini.once('ready-to-show', () => { sendMini(); mini.showInactive(); });
  mini.on('closed', () => { mini = null; });
}

function destroyMini() {
  if (mini && !mini.isDestroyed()) mini.destroy();
  mini = null;
}

function syncMini() {
  if (settings.taskbarRate) createMini(); else destroyMini();
}

function miniData() {
  const fresh = lastState && lastState.lastOkAt && Date.now() - lastState.lastOkAt < 90000;
  const eff = Calc.effectiveRates(fresh ? lastRates : null, settings.rates)['USD/TL'];
  return { value: eff ? eff.value : null, manual: !!(eff && eff.manual), dark: taskbarIsDark() };
}

function sendMini() {
  const d = miniData();
  if (mini && !mini.isDestroyed()) mini.webContents.send('mini', d);
  if (tray) {
    const v = d.value == null ? '–' : d.value.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    tray.setToolTip(`USD/TL ${v}\nFabe Döviz Hesap (Ctrl+Shift+D)`);
  }
}

function createTray() {
  const p = iconPath();
  const img = p ? nativeImage.createFromPath(p).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip('Fabe Döviz Hesap (Ctrl+Shift+D)');
  rebuildTrayMenu();
  tray.on('click', toggleWindow);
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Göster / Gizle  (Ctrl+Shift+D)', click: toggleWindow },
    { label: 'Kurları yenile', click: () => scraper && scraper.refreshNow() },
    ...(updater && ['ready', 'available'].includes(updater.state.status)
      ? [{ label: `Güncelle (sürüm ${updater.state.version})`, click: () => updater.apply(() => { quitting = true; destroyMini(); }) }]
      : []),
    { label: 'Görev çubuğunda dolar kuru', type: 'checkbox', checked: !!settings.taskbarRate, click: (item) => {
      settings.taskbarRate = item.checked; saveSettings(settings); syncMini();
    } },
    { type: 'separator' },
    { label: 'Çıkış', click: () => { quitting = true; app.quit(); } },
  ]));
}

// ---- IPC ----
ipcMain.handle('get-initial', () => ({ settings, state: lastState, shortcut: 'Ctrl+Shift+D' }));
ipcMain.handle('save-settings', (_e, s) => {
  settings = { ...settings, ...s };
  settings.rates = Calc.normalizeRateSettings(settings);
  saveSettings(settings);
  settings.opacity = clampOpacity(settings.opacity);
  if (win) win.setAlwaysOnTop(!!settings.alwaysOnTop);
  syncMini();
  rebuildTrayMenu();
  sendMini();
  try { app.setLoginItemSettings({ openAtLogin: !!settings.openAtLogin }); } catch (_) {}
  return settings;
});
ipcMain.on('hide', () => win && win.hide());
ipcMain.on('minimize', () => win && win.minimize());
ipcMain.on('refresh', () => scraper && scraper.refreshNow());
ipcMain.on('copy', (_e, text) => clipboard.writeText(String(text)));
ipcMain.on('fit-height', (_e, h) => fitHeight(Number(h) || 0));
let opacitySaveTimer = null;
ipcMain.on('set-opacity', (_e, v) => {
  settings.opacity = clampOpacity(v);
  if (win) win.setOpacity(settings.opacity);
  clearTimeout(opacitySaveTimer);
  opacitySaveTimer = setTimeout(() => saveSettings(settings), 400);
});
ipcMain.on('mini-click', () => toggleWindow());
ipcMain.handle('update-state', () => (updater ? updater.state : { status: 'idle', current: app.getVersion() }));
ipcMain.on('update-check', () => updater && updater.check());
ipcMain.on('update-apply', () => updater && updater.apply(() => { quitting = true; destroyMini(); }));
ipcMain.on('mini-drag', (_e, dx) => {
  if (!mini || mini.isDestroyed()) return;
  settings.taskbarOffset = (Number(settings.taskbarOffset) || 0) + Math.round(Number(dx) || 0);
  mini.setBounds(miniBounds());
  settings.taskbarOffset = mini.getBounds().x - miniAnchorX(taskbarRect()); // kenara dayandıysa düzelt
});
ipcMain.on('mini-drag-end', () => saveSettings(settings));
ipcMain.on('mini-menu', () => {
  if (!mini || mini.isDestroyed()) return;
  Menu.buildFromTemplate([
    { label: 'Fabe Döviz Hesap\'ı aç', click: showWindow },
    { label: 'Kurları yenile', click: () => scraper && scraper.refreshNow() },
    { label: 'Saatin yanına geri al', enabled: !!settings.taskbarOffset, click: () => {
      settings.taskbarOffset = 0; saveSettings(settings); if (mini && !mini.isDestroyed()) mini.setBounds(miniBounds());
    } },
    { type: 'separator' },
    { label: 'Görev çubuğundan kaldır', click: () => { settings.taskbarRate = false; saveSettings(settings); syncMini(); rebuildTrayMenu(); } },
  ]).popup({ window: mini });
});

// ---- Uygulama ----
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(() => {
    app.setAppUserModelId('com.fabe.dovizhesap');
    settings = loadSettings();
    createWindow();
    createTray();
    globalShortcut.register(SHORTCUT, toggleWindow);
    scraper = new Scraper((state) => {
      lastState = state;
      if (state.rates) lastRates = state.rates;
      if (win && !win.isDestroyed()) win.webContents.send('rates', state);
      sendMini();
    });
    scraper.start();
    syncMini();
    updater = new Updater((st) => {
      if (win && !win.isDestroyed()) win.webContents.send('update', st);
      rebuildTrayMenu();
    });
    updater.start();
    // Görev çubuğuna tıklanınca kutu arkada kalmasın; ekran / görev çubuğu değişirse yeniden yerleş
    setInterval(() => {
      if (!mini || mini.isDestroyed()) return;
      mini.setAlwaysOnTop(true, 'screen-saver');
      mini.moveTop();
    }, 1500);
    setInterval(sendMini, 5000);
    const relayout = () => { if (mini && !mini.isDestroyed()) mini.setBounds(miniBounds()); };
    trayWatch = new TrayWatch(relayout);
    trayWatch.start();
    screen.on('display-metrics-changed', relayout);
    screen.on('display-added', relayout);
    screen.on('display-removed', relayout);
    nativeTheme.on('updated', sendMini);
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => {
    if (trayWatch) trayWatch.stop();
    globalShortcut.unregisterAll();
    if (scraper) scraper.stop();
  });
  app.on('window-all-closed', (e) => e.preventDefault());
}
