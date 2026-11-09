// Bellum : coquille Electron autour des fichiers du jeu (jeu/index.html, bataille.html, naval.html).
const { app, BrowserWindow, shell, Menu, session, dialog } = require('electron');
const path = require('path');

// Carte graphique puissante sur les PC à deux cartes, pas de frein en arrière-plan.
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win;
function creer() {
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 640,
    backgroundColor: '#1a140e', show: false, autoHideMenuBar: true,
    title: 'Bellum',
    icon: path.join(__dirname, 'icone.png'),
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });

  // Liens externes : navigateur du système. Pages du jeu : même fenêtre.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('file:')) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: '#1a140e' } };
    shell.openExternal(url); return { action: 'deny' };
  });

  // F11 plein écran, F12 outils de développement, Ctrl+R recharger.
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (i.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
    else if ((i.control || i.meta) && i.key.toLowerCase() === 'r') { win.webContents.reload(); e.preventDefault(); }
  });

  win.loadFile(path.join(__dirname, 'jeu', 'index.html'));
}

app.whenReady().then(() => {
  // Micro pour rien, notifications non ; le reste (plein écran, presse-papiers) oui.
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm !== 'notifications'));
  creer();
  verifierMiseAJour();
});

// Mise à jour automatique : au lancement, l'appli regarde la dernière version publiée
// sur GitHub (Releases de Raptor455/roma-delanda-est), la télécharge en fond,
// puis propose de redémarrer. Sinon elle s'installe à la fermeture du jeu.
// Les sauvegardes (localStorage) ne sont pas touchées.
function verifierMiseAJour() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { console.warn('[maj]', e.message); return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (e) => console.warn('[maj]', e && e.message));
  autoUpdater.on('update-downloaded', (info) => {
    if (!win) return;
    dialog.showMessageBox(win, {
      type: 'info', title: 'Bellum', buttons: ['Redémarrer maintenant', 'Plus tard'], defaultId: 0, cancelId: 1,
      message: 'Nouvelle version de Bellum prête (v' + String(info.version).split('.')[0] + ')',
      detail: 'Redémarrez pour en profiter. Sinon, elle s\'installera à la fermeture du jeu. Vos sauvegardes sont conservées.',
    }).then((r) => { if (r.response === 0) autoUpdater.quitAndInstall(false, true); });
  });
  autoUpdater.checkForUpdates().catch((e) => console.warn('[maj]', e && e.message));
  // Une partie peut durer longtemps : nouvelle vérification toutes les 2 heures.
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 2 * 3600 * 1000);
}
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
