/**
 * electron/preload.js
 * Puente mínimo entre el renderer (index.html, sin cambios de arquitectura)
 * y el proceso principal — contextIsolation:true + nodeIntegration:false
 * (ver main.js), así que el renderer NUNCA tiene acceso directo a
 * ipcRenderer/Node; solo a esta única función expuesta vía contextBridge.
 *
 * `window.electronAPI` es opcional por diseño: src/projectManager.js lo
 * detecta con `window.electronAPI?.saveProjectFile` y cae al
 * comportamiento de navegador (Blob + <a download>) si no existe — así
 * que este mismo index.html sigue funcionando sin cambios cuando se abre
 * en un navegador normal (dev/testing), no solo dentro de Electron.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * @param {Uint8Array} bytes - contenido ya comprimido (gzip) del .geoproj
   * @param {string} suggestedName - nombre de archivo sugerido para el diálogo
   * @returns {Promise<{canceled: boolean, filePath?: string}>}
   */
  saveProjectFile: (bytes, suggestedName) => ipcRenderer.invoke('project:save', bytes, suggestedName),

  /**
   * Pide al proceso principal cerrar la app (botón "Salir" del topbar). El
   * aviso de "cambios sin guardar" lo maneja main.js (win.on('close') →
   * confirmDiscardIfDirty), el MISMO que dispara la X nativa — acá no se
   * confirma nada, solo se solicita el cierre.
   * @returns {Promise<void>}
   */
  quitApp: () => ipcRenderer.invoke('app:quit'),
});
