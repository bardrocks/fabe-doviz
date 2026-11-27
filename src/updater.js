/*
 * Güncelleme: GitHub Releases'ta yeni sürüm var mı diye bakar.
 * - Kurulumlu sürüm: electron-updater ile arka planda indirir, "Güncelle" düğmesiyle
 *   (ya da uygulama kapanırken) kurar.
 * - Portable sürüm: kendi kendini değiştiremez; düğme yeni .exe'nin indirme bağlantısını açar.
 */
const { app, net, shell } = require('electron');
const pkg = require('../package.json');

const CHECK_EVERY_MS = 2 * 60 * 60 * 1000; // 2 saatte bir
const pub = [].concat((pkg.build && pkg.build.publish) || [])[0] || {};
const OWNER = pub.owner;
const REPO = pub.repo;
const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;

function newer(a, b) { // a > b ?
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

class Updater {
  constructor(onState) {
    this.onState = onState; // ({ status, version?, percent?, error? })
    this.state = { status: 'idle', current: app.getVersion() };
    this.portableUrl = null;
    this.au = null;
  }

  set(s) {
    this.state = { current: app.getVersion(), ...s };
    this.onState(this.state);
  }

  start() {
    if (!app.isPackaged || !OWNER || !REPO) return; // geliştirme ortamında çalışmaz
    if (!isPortable) {
      try {
        const { autoUpdater } = require('electron-updater');
        this.au = autoUpdater;
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;
        autoUpdater.on('checking-for-update', () => { if (this.state.status !== 'ready') this.set({ status: 'checking' }); });
        autoUpdater.on('update-not-available', () => this.set({ status: 'latest' }));
        autoUpdater.on('update-available', (i) => this.set({ status: 'downloading', version: i.version, percent: 0 }));
        autoUpdater.on('download-progress', (p) => this.set({ status: 'downloading', version: this.state.version, percent: Math.round(p.percent) }));
        autoUpdater.on('update-downloaded', (i) => this.set({ status: 'ready', version: i.version }));
        autoUpdater.on('error', (e) => { if (this.state.status !== 'ready') this.set({ status: 'error', error: String(e && e.message || e).slice(0, 200) }); });
      } catch (_) {
        this.au = null;
      }
    }
    setTimeout(() => this.check(), 15000);
    setInterval(() => this.check(), CHECK_EVERY_MS);
  }

  check() {
    if (!app.isPackaged || !OWNER || !REPO) return this.set({ status: 'dev' });
    if (this.state.status === 'ready' || this.state.status === 'downloading') return;
    if (this.au) return this.au.checkForUpdates().catch(() => {});
    return this.checkPortable();
  }

  checkPortable() {
    this.set({ status: 'checking' });
    const req = net.request({ url: `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, headers: { 'User-Agent': 'FabeDovizHesap', Accept: 'application/vnd.github+json' } });
    let body = '';
    req.on('response', (res) => {
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) throw new Error('Sürüm bilgisi alınamadı (' + res.statusCode + ')');
          const rel = JSON.parse(body);
          const version = String(rel.tag_name || '').replace(/^v/, '');
          if (!newer(version, app.getVersion())) return this.set({ status: 'latest' });
          const asset = (rel.assets || []).find((a) => /Portable.*\.exe$/i.test(a.name));
          this.portableUrl = asset ? asset.browser_download_url : rel.html_url;
          this.set({ status: 'available', version, portable: true });
        } catch (e) {
          this.set({ status: 'error', error: e.message });
        }
      });
    });
    req.on('error', (e) => this.set({ status: 'error', error: e.message }));
    req.end();
  }

  // "Güncelle" düğmesi
  apply(beforeQuit) {
    if (this.state.status === 'ready' && this.au) {
      beforeQuit();
      setImmediate(() => this.au.quitAndInstall(true, true)); // sessiz kur, sonra yeniden aç
    } else if (this.state.status === 'available' && this.portableUrl) {
      shell.openExternal(this.portableUrl);
    }
  }
}

module.exports = { Updater, newer };
