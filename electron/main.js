/**
 * electron/main.js
 * Proceso principal de Okto Node como app de escritorio portable
 * (Windows, sin instalador — ver package.json "build"). No toca nada de
 * la interfaz existente: carga ../index.html tal cual, con los mismos
 * <iframe> lazy-load (Columnas/Hidrogeoquímica/GIS) y el mismo puente
 * postMessage (src/projectBridge.js) que ya funcionan bajo file://
 * (ver nota de arquitectura en src/projectManager.js sobre por qué la
 * autenticación del puente es por identidad de ventana, no por origin).
 *
 * Único comportamiento nuevo real: registra el handler IPC de
 * "guardar proyecto" (electron/ipc/projectFile.js) para que
 * saveProjectToFile() (src/projectManager.js) pueda abrir el diálogo
 * nativo de Windows en vez de descargar en silencio a Descargas. "Abrir
 * proyecto" no se toca — sigue usando el <input type="file"> de siempre.
 */

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { registerProjectFileHandlers } = require('./ipc/projectFile');

// Raíz de la app como URL file:// (con el mismo codificado de %20 que usan
// las URLs reales) — todo lo que la app carga legítimamente vive bajo acá:
// index.html y los viewer.html de los 5 módulos. Se usa para bloquear
// cualquier navegación fuera de estos archivos locales (endurecimiento
// pre-piloto: la app es 100% local y no debe navegar a ningún lado externo).
const APP_ROOT_URL = pathToFileURL(path.join(__dirname, '..')).href;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Denegar TODA apertura de ventana nueva (window.open, target=_blank,
  // window.open desde contenido de un archivo importado, etc.). La app es
  // de una sola ventana; ningún flujo legítimo abre ventanas.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Bloquear cualquier navegación del frame principal fuera de los archivos
  // locales de la app. Sin esto, un archivo diseñado (p.ej. un PDF/HTML que
  // fuerce window.location) podría sacar la app de file:// hacia una URL
  // remota — lo que rompería la garantía de cero egreso. Se permite solo
  // recargar/navegar dentro del propio directorio de la app.
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ROOT_URL)) {
      event.preventDefault();
    }
  });

  // Cierre de la ventana (X nativa del SO). El renderer tiene un handler
  // `beforeunload` que, cuando hay cambios sin guardar, hace preventDefault()
  // — patrón correcto en un navegador (dispara el diálogo "¿salir del sitio?"),
  // pero en Electron eso CANCELA SILENCIOSAMENTE el cierre iniciado por el
  // usuario, sin mostrar nada: la app no se cerraba. La solución es que el
  // proceso principal DUEÑE el cierre: el evento 'close' de Electron ocurre
  // ANTES del beforeunload, así que al hacerle preventDefault() acá el
  // beforeunload del renderer queda cortocircuitado (sigue protegiendo el modo
  // navegador). Preguntamos al renderer con el MISMO aviso de "cambios sin
  // guardar" que Nuevo/Abrir (confirmDiscardIfDirty) y, si el usuario confirma
  // (o no hay riesgo), destruimos la ventana → window-all-closed → app.quit().
  // destroy() cierra a la fuerza, sin volver a correr el beforeunload.
  let closeConfirmed = false;
  win.on('close', (event) => {
    if (closeConfirmed) return; // segundo pase: ya se confirmó, dejar cerrar
    event.preventDefault();
    win.webContents
      .executeJavaScript('window.confirmDiscardIfDirty ? window.confirmDiscardIfDirty("Salir") : true')
      .then((ok) => { if (ok) { closeConfirmed = true; win.destroy(); } })
      // Si el renderer falla al responder, no atrapamos al usuario: cerramos.
      .catch(() => { closeConfirmed = true; win.destroy(); });
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

// Salida explícita pedida desde la UI (botón "Salir" del topbar, vía
// electron/preload.js → window.electronAPI.quitApp). Enruta por win.close()
// para pasar por EXACTAMENTE el mismo aviso de cambios sin guardar que la X
// nativa (win.on('close') de arriba) — un solo punto de confirmación.
ipcMain.handle('app:quit', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

// Sin barra de menú (File/Edit/View/...) — la app tiene su propia UI
// completa dentro de index.html, un menú de Electron por defecto solo
// agrega ruido (y accesos a DevTools/recargar que no aportan acá).
Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  registerProjectFileHandlers();
  createWindow();

  app.on('activate', () => {
    // Convención estándar de macOS (reabrir ventana al hacer clic en el
    // dock) — inofensivo dejarlo aunque el target de esta etapa sea
    // solo Windows, no hay costo real y evita tener que revisitar este
    // archivo si algún día se empaqueta también para otro SO.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
