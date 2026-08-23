/**
 * electron/ipc/projectFile.js
 * Único handler IPC de esta app: "guardar proyecto" con diálogo nativo de
 * Windows en vez del truco de descarga silenciosa (Blob + <a download>)
 * que usa saveProjectToFile() en src/projectManager.js cuando corre en un
 * navegador normal.
 *
 * Contrato con el renderer (ver electron/preload.js y
 * src/projectManager.js): recibe los bytes YA comprimidos (gzip, ver
 * buildProjectFileBytes() en projectManager.js — esa función no cambia,
 * solo se le agregó este camino alternativo de escritura) y un nombre de
 * archivo sugerido; pregunta dónde guardarlo vía dialog.showSaveDialog,
 * escribe el archivo, y devuelve si el usuario canceló o no.
 *
 * "Abrir proyecto" NO tiene handler acá a propósito — se mantiene el
 * <input type="file"> existente en index.html, que ya dispara el diálogo
 * nativo de selección de archivos del SO sin necesitar IPC.
 */

const { ipcMain, dialog, BrowserWindow } = require('electron');
const fs = require('fs/promises');

const PROJECT_FILE_FILTERS = [
  { name: 'Proyecto Okto Node', extensions: ['geoproj'] },
];

function registerProjectFileHandlers() {
  ipcMain.handle('project:save', async (event, bytes, suggestedName) => {
    // Defensa en profundidad (validar el remitente del IPC): solo el frame
    // PRINCIPAL de la app, cargado localmente (file://), puede pedir guardar.
    // Nunca un iframe de módulo ni un origen remoto. `parent === null`
    // identifica al frame principal; el chequeo de file:// descarta cualquier
    // origen que no sea el archivo local de la app.
    const frame = event.senderFrame;
    if (!frame || frame.parent !== null || !frame.url.startsWith('file://')) {
      throw new Error('project:save rechazado: remitente no autorizado (se requiere el frame principal local).');
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Guardar proyecto',
      defaultPath: suggestedName,
      filters: PROJECT_FILE_FILTERS,
    });
    if (canceled || !filePath) {
      return { canceled: true };
    }
    // `bytes` viaja como Uint8Array a través de IPC (structured clone lo
    // soporta nativo) — Buffer.from() lo envuelve sin copiar de más.
    await fs.writeFile(filePath, Buffer.from(bytes));
    return { canceled: false, filePath };
  });
}

module.exports = { registerProjectFileHandlers };
