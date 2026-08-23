/**
 * src/projectManager.js
 * Orquestador central del sistema de Proyectos — vive en index.html (JS
 * plano, sin build step, igual que store.js/columnasProjectAdapter.js).
 * Junta/reparte el estado de los 3 módulos ya implementados (QA/QC,
 * Columnas, Hidrogeoquímica — ver Etapas 3-5) a través del puente de la
 * Etapa 2 (projectBridge.js, cargado antes que este archivo). No
 * reimplementa nada de esa lógica — solo la consume.
 *
 * Mecanismo para saber si el iframe de un módulo fue lanzado en la sesión
 * actual (el mismo que ya usan launchColumnas()/launchHidro() para
 * decidir si asignar `frame.src` la primera vez): cada <iframe> arranca
 * con el atributo `src=""` en el HTML. Leído como PROPIEDAD (`frame.src`,
 * no `getAttribute('src')`), un `src=""` se resuelve al URL de la propia
 * página (`window.location.href`) — así que "lanzado" = `frame.src` está
 * seteado Y es distinto de `window.location.href`.
 *
 * Ver ProjectState en src/projectTypes.ts para la forma completa.
 */

// No existe hoy una versión de app centralizada en ningún lado del
// proyecto (ni package.json la tiene) — esta es la primera vez que se
// define; súbela a mano si hace falta versionar releases más adelante.
const GEOFIELD_APP_VERSION = '0.1';
// v2 (Etapa 13): agrega ProjectState.gis real (antes null fijo) — ver
// migrations[1] en projectMigrations.js.
// v3 (Etapa 9 de Hidrogeoquímica): reemplaza colorMode por classifyField
// (clasificación genérica) y agrega la config de relaciones iónicas y
// Schoeller-Berkaloff — ver migrations[2] en projectMigrations.js.
// v4 (Etapa 14 de Análisis Estructural): agrega ProjectState.estructural
// real (antes no existía el campo) — ver migrations[3] en
// projectMigrations.js.
// v5 (Etapa 6 de ubicación espacial de gráficos de Hidrogeoquímica):
// agrega chartLocations (Este/Norte + publicado por diagrama combinado,
// Etapa 2) y stiffPublished (checkbox único de tarjetas de Stiff, Etapa
// 5) a HidrogeoquimicaProjectState — ver migrations[4] en
// projectMigrations.js.
// v6 (Etapa de persistencia final del paquete de mejoras de Análisis
// Estructural, diferida explícitamente en la Etapa 14): agrega a
// AnalisisEstructuralProjectState todo lo que ese paquete había dejado
// SOLO en localStorage/estado de React efímero — presets de filtro
// guardables, modo comparación (Grupo A/B) + símbolos por tipo (dentro
// de `classification`), familias estructurales identificadas por
// selección rectangular, y los toggles de despliegue de StereonetPlanes/
// RoseDiagram (polos/planos/líneas/Kamb/plano-polo medio/cono de
// confianza) — ver migrations[5] en projectMigrations.js.
// v7 (Etapa 3 del rediseño de Análisis Estructural a pestañas múltiples):
// AnalisisEstructuralProjectState pasa de un espacio de trabajo PLANO a
// `tabs: EstructuralTabState[]` + `activeTabId` — cada pestaña con su
// propio archivo QA/QC, clasificación/filtro, familias, estilo y toggles
// de despliegue. `filterPresets` se queda GLOBAL, sin cambio de forma. El
// campo `imported` (datos CSV — función ya eliminada) se descarta acá
// del todo — ver migrations[6] en projectMigrations.js, y
// loadProjectFromFile() más abajo para el aviso al usuario si un
// proyecto viejo tenía datos reales ahí.
// v8 (Etapa 6 del paquete de Correlación estratigráfica de Columnas):
// ColumnasProjectState gana `correlation` (config de la pestaña fija de
// Correlación — slots de selectores con su columna asignada, escala
// vertical compartida en modo auto/sobrescrito, y toggle de alineación
// por elevación real; Etapas 2-5). La cota del tope por columna (Etapa 1)
// ya viajaba gratis dentro de column.metadata.topElevation, no necesitó
// cambio de forma. Ver migrations[7] en projectMigrations.js (default para
// proyectos v7: sin selectores inicializados, escala automática, toggle
// apagado).
// v9 (sub-etapa de persistencia de anotaciones de Correlación): los slots
// pasan de columnId plano a `{ id, columnId }` (el id estable ancla las
// líneas), y se agregan `lines` (líneas de correlación con sus puntos
// conectables {slotId, unitId, edge, side} + color) y `textBoxes` (cuadros de
// texto libres). Ver migrations[8] en projectMigrations.js (proyectos v8:
// slots migrados a {id,columnId} con id nuevo, lines/textBoxes vacíos).
// v10 (unificación de Hidrogeoquímica con QA/QC): Hidrogeoquímica deja de
// importar CSV/Excel directo y se alimenta de la tabla "Datos
// hidrogeoquímicos" de QA/QC (mismo criterio que Análisis Estructural en v7).
// HidrogeoquimicaProjectState pierde `samples` — ver migrations[9] en
// projectMigrations.js: lo descarta, y el caller avisa (discardedHydroImportData)
// si el proyecto v9 traía muestras (el usuario debe recargarlas como tabla en
// QA/QC).
const PROJECT_SCHEMA_VERSION = 10;

const MODULE_FRAMES = {
  columnas:        { frameId: 'columnas-frame',    src: './src/columnas/viewer.html',    label: 'Columnas' },
  hidrogeoquimica: { frameId: 'hidro-frame',        src: './src/hidrogeo/viewer.html',    label: 'Hidrogeoquímica' },
  gis:             { frameId: 'gis-frame',          src: './src/gis/viewer.html',         label: 'GIS' },
  estructural:     { frameId: 'estructural-frame',  src: './src/estructural/viewer.html', label: 'Análisis Estructural' },
};

/** true si el iframe de ese módulo ya cargó su documento real (no el src="" inicial). */
function isModuleFrameLaunched(frameId) {
  const frame = document.getElementById(frameId);
  return !!(frame && frame.src && frame.src !== window.location.href);
}

/**
 * Espera el PROJECT_READY que emite listenForStateRequests() DENTRO de
 * ese iframe específico — filtra por `event.source` para no confundirlo
 * con el PROJECT_READY de otro módulo que se esté lanzando en paralelo.
 */
function waitForFrameReady(frame, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;

    function cleanup() {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    }
    function onMessage(e) {
      if (settled) return;
      // Autenticación por identidad de ventana, no por origin — mismo
      // motivo que projectBridge.ts (requisito de doble-clic + file://,
      // donde el origin es opaco/inconsistente). e.source ya es la
      // verificación real acá.
      if (e.source !== frame.contentWindow) return;
      if (!e.data || e.data.type !== window.ProjectBridge.PROJECT_READY) return;
      settled = true;
      cleanup();
      resolve();
    }
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`timeout (${timeoutMs}ms) esperando PROJECT_READY`));
    }, timeoutMs);

    window.addEventListener('message', onMessage);
  });
}

/**
 * Junta el estado de los 3 módulos en un ProjectState (ver
 * src/projectTypes.ts). Si el iframe de un módulo no fue lanzado en la
 * sesión, ese campo queda `null` sin intentar pedirle nada. Si un módulo
 * SÍ lanzado no responde a tiempo, NO aborta la recolección de los
 * demás — junta todos los errores y recién al final tira un solo Error
 * con el detalle de cuáles módulos fallaron (mejor eso que "guardar" un
 * proyecto incompleto sin avisar).
 * @param {string} projectName
 * @returns {Promise<object>} ProjectState
 */
async function collectProjectState(projectName) {
  const qaqc = getQaqcProjectState();

  const results = {};
  const errors = [];

  for (const [key, cfg] of Object.entries(MODULE_FRAMES)) {
    if (!isModuleFrameLaunched(cfg.frameId)) {
      results[key] = null;
      continue;
    }
    const frame = document.getElementById(cfg.frameId);
    try {
      results[key] = await window.ProjectBridge.requestStateFromFrame(frame, 5000);
    } catch (err) {
      results[key] = null;
      errors.push(`${cfg.label}: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`No se pudo obtener el estado de: ${errors.join(' · ')}`);
  }

  const now = new Date().toISOString();
  return {
    metadata: {
      name: projectName,
      createdAt: now,
      updatedAt: now,
      appVersion: GEOFIELD_APP_VERSION,
      schemaVersion: PROJECT_SCHEMA_VERSION,
    },
    qaqc,
    columnas: results.columnas,
    hidrogeoquimica: results.hidrogeoquimica,
    gis: results.gis,
    estructural: results.estructural,
  };
}

/**
 * Restaura un ProjectState en los 3 módulos. QA/QC siempre se restaura
 * (nunca es null). Para Columnas/Hidrogeoquímica: si el campo viene
 * `null` en el estado guardado, ese módulo NO se toca — ni se lanza ni
 * se le envía nada — porque el usuario no lo había usado al guardar. Si
 * viene con datos y el iframe todavía no está lanzado, se lanza (asigna
 * `src`) y se espera su PROJECT_READY antes de enviarle el estado; si ya
 * estaba lanzado, se le envía directo.
 *
 * Mismo criterio que collectProjectState frente a fallas: un módulo que
 * no responde no aborta el proceso completo de los demás — se junta el
 * error y se reporta al final.
 * @param {object} state - ProjectState
 * @returns {Promise<void>}
 */
async function applyProjectState(state) {
  loadQaqcProjectState(state.qaqc);

  const errors = [];

  for (const [key, cfg] of Object.entries(MODULE_FRAMES)) {
    const moduleState = state[key];
    if (moduleState == null) continue; // no se usó al guardar — no se lanza al cargar

    const frame = document.getElementById(cfg.frameId);
    try {
      if (!isModuleFrameLaunched(cfg.frameId)) {
        const readyPromise = waitForFrameReady(frame, 8000);
        frame.src = cfg.src;
        await readyPromise;
      }
      window.ProjectBridge.sendStateToFrame(frame, moduleState);
    } catch (err) {
      errors.push(`${cfg.label}: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`No se pudo restaurar el estado de: ${errors.join(' · ')}`);
  }
}

const PROJECT_FILE_EXTENSION = '.geoproj';

/**
 * Tamaño de bloque para codificar/decodificar Uint8Array ↔ base64 sin
 * reventar el límite de argumentos de `String.fromCharCode.apply`
 * (varía por motor, pero 32768 es un tamaño clásicamente seguro muy por
 * debajo de cualquier límite real) — necesario para las capas ráster
 * importadas en GIS (Etapa 13), cuyos píxeles pueden pesar decenas de MB
 * (un `bytes.length` de esa magnitud rompe tanto el spread como `.apply`
 * si se pasan TODOS los bytes de una sola vez).
 */
const BASE64_CHUNK_SIZE = 0x8000;

function uint8ArrayToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Marca para distinguir un Uint8Array codificado del resto de los objetos planos al reconstruir (jsonReviver). */
const UINT8ARRAY_MARKER = '__uint8ArrayBase64__';

/**
 * Replacer de JSON.stringify (Etapa 13) — sin esto, un Uint8Array (p.ej.
 * los píxeles de una capa ráster importada en GIS, ver
 * gis/rasterImport.ts) se serializa por defecto como
 * `{"0":255,"1":0,...}`, un objeto con una clave por byte: ~5-7× más
 * pesado que codificarlo en base64 antes de comprimir. Genérico, no
 * específico de GIS — hoy es el único lugar de ProjectState con
 * binarios, pero cualquier módulo futuro que agregue un Uint8Array lo
 * hereda gratis sin tocar este archivo.
 */
function jsonReplacer(key, value) {
  if (value instanceof Uint8Array) {
    return { [UINT8ARRAY_MARKER]: uint8ArrayToBase64(value) };
  }
  return value;
}

/** Reviver de JSON.parse — contraparte de jsonReplacer(). */
function jsonReviver(key, value) {
  if (value && typeof value === 'object' && typeof value[UINT8ARRAY_MARKER] === 'string') {
    return base64ToUint8Array(value[UINT8ARRAY_MARKER]);
  }
  return value;
}

/**
 * Umbral (bytes del .geoproj YA comprimido) a partir del cual se avisa al
 * usuario antes de guardar — no es un límite técnico duro (nunca se trunca
 * ni se descarta nada), solo una señal de "esto puede tardar" para
 * proyectos con capas ráster importadas grandes en GIS. 25 MB.
 */
const LARGE_PROJECT_WARNING_BYTES = 25 * 1024 * 1024;

/**
 * Junta el estado del proyecto (collectProjectState), lo serializa a
 * JSON (jsonReplacer codifica cualquier Uint8Array en base64 — ver nota
 * arriba) y lo comprime con gzip (pako.gzip — ver src/pako.min.js,
 * vendorizado porque index.html no tiene build step) — nunca un .json
 * sin comprimir. Parte PURA de saveProjectToFile() (Etapa Electron):
 * separada para que "generar los bytes" no sepa nada de CÓMO se
 * terminan escribiendo a disco (Blob+<a download> en navegador,
 * dialog.showSaveDialog nativo en Electron — ver más abajo).
 * @param {string} projectName
 * @returns {Promise<Uint8Array>}
 */
async function buildProjectFileBytes(projectName) {
  const state = await collectProjectState(projectName);
  const json = JSON.stringify(state, jsonReplacer);
  return pako.gzip(json);
}

/**
 * Arma los bytes del proyecto (buildProjectFileBytes) y los escribe a
 * disco como `${projectName}.geoproj`. Si el archivo comprimido supera
 * LARGE_PROJECT_WARNING_BYTES, confirma con el usuario antes de guardar
 * (puede cancelar) — nunca guarda una versión recortada en silencio.
 *
 * Dos caminos de escritura, detectados en runtime (no hay build separado
 * para Electron vs. navegador — el mismo index.html sirve para los dos):
 *   - Dentro de Electron (electron/preload.js expone `window.electronAPI`):
 *     pide al proceso principal un diálogo NATIVO de "Guardar como" (ver
 *     electron/ipc/projectFile.js) — el usuario elige dónde, como
 *     cualquier app de escritorio real. `projectName` acá es solo el
 *     nombre SUGERIDO en ese diálogo (y el `metadata.name` interno del
 *     estado) — el nombre REAL queda determinado por lo que el usuario
 *     haya tipeado ahí, devuelto en `savedName` (ver onClickSaveProject
 *     en index.html, que NO usa window.prompt() para pedir el nombre de
 *     antemano cuando corre en Electron: **window.prompt() no está
 *     implementado por Electron — devuelve `null` de inmediato, sin
 *     mostrar ningún diálogo**, a diferencia de window.alert()/confirm()
 *     que sí funcionan nativos ahí. Se descubrió probando el flujo real
 *     de guardado dentro de la app empaquetada, no es una suposición).
 *   - En un navegador normal (`window.electronAPI` no existe): el truco
 *     de siempre, Blob + <a download> — va directo a Descargas sin
 *     preguntar, comportamiento estándar de navegador que no se puede
 *     evitar sin la API nativa de Electron. Ahí sí se sigue usando
 *     window.prompt() (funciona normal en cualquier navegador real).
 *
 * @param {string} projectName
 * @returns {Promise<{saved: boolean, savedName?: string}>} `saved` es false si el usuario canceló el diálogo nativo (Electron) — siempre true en el camino de navegador, que no tiene concepto de "cancelar". `savedName` es el nombre real (puede diferir de `projectName` si el usuario lo cambió en el diálogo).
 */
async function saveProjectToFile(projectName) {
  const compressed = await buildProjectFileBytes(projectName);

  if (compressed.length > LARGE_PROJECT_WARNING_BYTES) {
    const mb = (compressed.length / (1024 * 1024)).toFixed(1);
    const proceed = window.confirm(
      `Este proyecto pesa ~${mb} MB (probablemente por capas ráster importadas en GIS) — guardarlo y volver a abrirlo puede tardar más de lo habitual. ¿Continuar de todos modos?`,
    );
    if (!proceed) return { saved: false };
  }

  const filename = `${projectName}${PROJECT_FILE_EXTENSION}`;

  if (window.electronAPI && typeof window.electronAPI.saveProjectFile === 'function') {
    const result = await window.electronAPI.saveProjectFile(compressed, filename);
    if (result.canceled) return { saved: false };
    const chosenName = result.filePath
      ? result.filePath.replace(/^.*[\\/]/, '').replace(/\.geoproj$/i, '')
      : projectName;
    return { saved: true, savedName: chosenName };
  }

  const blob = new Blob([compressed], { type: 'application/gzip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // revokeObjectURL inmediatamente después de click() puede cortar la
  // descarga en algunos navegadores (el navegador todavía no terminó de
  // leer el blob) — se pospone un tick, patrón estándar para este caso.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return { saved: true, savedName: projectName };
  return true;
}

/**
 * Carga un proyecto desde un archivo .geoproj (generado por
 * saveProjectToFile): descomprime con pako, migra su schemaVersion si
 * hace falta (migrateProjectState() — src/projectMigrations.js, Etapa 11),
 * y distribuye el estado resultante a los 3 módulos vía
 * applyProjectState() (Etapa 7).
 *
 * Nota pako 3.x: la opción es `{ toText: true }`, NO `{ to: 'string' }`
 * (esa era la API vieja de pako 1.x/2.x).
 *
 * Cada tipo de falla tira un Error con mensaje distinto y específico, sin
 * dejar la app en un estado roto — el caller decide cómo mostrarlo
 * (ver onProjectFileSelected() en index.html, Etapa 10).
 *
 * `discardedCsvImportData` (Etapa 3 del rediseño de Análisis Estructural
 * a pestañas, schemaVersion 7): true si el archivo cargado era de una
 * versión ANTERIOR a v7 y tenía datos reales en
 * `estructural.imported.planar/linear` (importación directa por CSV,
 * función ya eliminada) — esos datos se pierden en la migración
 * (migrations[6] en projectMigrations.js, ver su JSDoc), así que el
 * caller debe avisarle al usuario. Se detecta ACÁ, sobre `rawState`
 * (ANTES de migrar) — es la única versión donde ese campo todavía tiene
 * la forma vieja reconocible; una vez migrado, ya no existe.
 *
 * `discardedHydroImportData` (schemaVersion 10, unificación de Hidrogeoquímica
 * con QA/QC): análogo al anterior — true si el archivo era ANTERIOR a v10 y
 * traía muestras en `hidrogeoquimica.samples` (importación directa por CSV/
 * Excel, ya eliminada). Esos datos se descartan en migrations[9]; el usuario
 * debe recargarlos como tabla "Datos hidrogeoquímicos" en QA/QC.
 * @param {File} file
 * @returns {Promise<{ discardedCsvImportData: boolean, discardedHydroImportData: boolean }>}
 */
// Topes de guardia contra .geoproj diseñados para agotar memoria (DoS por
// "bomba de descompresión"). Un proyecto legítimo queda muy por debajo (los
// de prueba pesan pocos KB); son la barrera de seguridad, no un límite
// funcional. Subirlos si el piloto necesita cargar proyectos con rásters
// embebidos muy grandes.
const MAX_GEOPROJ_INPUT_BYTES = 512 * 1024 * 1024;    // 512 MB (archivo .geoproj comprimido)
// Tope de salida (JSON descomprimido). Debe quedar por DEBAJO del límite de
// tamaño de string de V8 (~512 MB), porque el JSON se decodifica a string y se
// pasa a JSON.parse — un proyecto legítimo tampoco podría superarlo (ni
// siquiera se podría GUARDAR). 256 MB soporta con holgura proyectos con capas
// ráster embebidas (los píxeles se persisten en base64; p.ej. un ráster
// 4000×4000 ≈ 85 MB) y es enorme frente a un proyecto típico (pocos KB).
const MAX_GEOPROJ_OUTPUT_BYTES = 256 * 1024 * 1024;   // 256 MB (JSON descomprimido)

/**
 * Descomprime gzip con un TOPE de tamaño de salida, en streaming (pako.Inflate).
 * `onData` LANZA en cuanto la salida acumulada supera `maxOutputBytes`, lo que
 * ABORTA el push() de pako de inmediato — así una "bomba de descompresión"
 * (pocos KB que expanden a GB) no se sigue descomprimiendo (ni CPU ni memoria)
 * más allá del tope. Se lanza abortando desde onData en vez de solo dejar de
 * acumular, porque un push() de pako descomprime TODO su input de una (si el
 * input es chico pero expande enorme, dejar de almacenar acotaría la memoria
 * pero pako igual gastaría segundos de CPU descomprimiendo el resto).
 * Devuelve el JSON como string. `.code === 'OUTPUT_LIMIT'` si se supera el tope.
 * (pako v3 entrega los chunks como Uint8Array; se acumulan y se decodifican a
 * UTF-8 al final.)
 */
function ungzipWithLimit(bytes, maxOutputBytes) {
  const inflator = new pako.Inflate({ windowBits: 15 + 16 }); // 31 = gzip
  const chunks = [];
  let total = 0;
  const OVERFLOW = { overflow: true }; // centinela para distinguir el abort intencional
  inflator.onData = (chunk) => {
    total += chunk.length;
    if (total > maxOutputBytes) {
      throw OVERFLOW;
    }
    chunks.push(chunk);
  };
  try {
    inflator.push(bytes, true);
  } catch (e) {
    if (e === OVERFLOW) {
      const err = new Error('El tamaño descomprimido supera el máximo permitido.');
      err.code = 'OUTPUT_LIMIT';
      throw err;
    }
    throw e;
  }
  if (inflator.err) {
    throw new Error(inflator.msg || `gzip inválido (código ${inflator.err})`);
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return new TextDecoder('utf-8').decode(out);
}

async function loadProjectFromFile(file) {
  // Límite de tamaño del ARCHIVO de entrada, antes de leerlo en memoria: un
  // .geoproj legítimo (incluso con capas ráster) no se acerca a esto. Rechazar
  // temprano evita cargar en RAM un archivo absurdamente grande.
  if (typeof file.size === 'number' && file.size > MAX_GEOPROJ_INPUT_BYTES) {
    throw new Error(
      `El archivo es demasiado grande (${(file.size / 1048576).toFixed(0)} MB; máximo `
      + `${MAX_GEOPROJ_INPUT_BYTES / 1048576} MB). Se rechaza para no agotar la memoria.`,
    );
  }

  let buffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (err) {
    throw new Error(`No se pudo leer el archivo: ${err.message}`);
  }

  let json;
  try {
    // Descompresión con TOPE de salida en streaming (ver ungzipWithLimit):
    // aborta apenas la salida supera el umbral, en vez de dejar que pako
    // construya un string gigante y agote la memoria.
    json = ungzipWithLimit(new Uint8Array(buffer), MAX_GEOPROJ_OUTPUT_BYTES);
  } catch (err) {
    if (err && err.code === 'OUTPUT_LIMIT') {
      throw new Error(
        `El archivo descomprime a más de ${MAX_GEOPROJ_OUTPUT_BYTES / 1048576} MB — se abortó para no `
        + `agotar la memoria (archivo corrupto o "bomba de descompresión").`,
      );
    }
    throw new Error(`El archivo está corrupto o no es un ${PROJECT_FILE_EXTENSION} válido (no se pudo descomprimir): ${err.message}`);
  }

  let rawState;
  try {
    // jsonReviver: contraparte de jsonReplacer() en saveProjectToFile —
    // reconstruye cualquier Uint8Array (píxeles de capas ráster de GIS)
    // codificado en base64, ver nota ahí.
    rawState = JSON.parse(json, jsonReviver);
  } catch (err) {
    throw new Error(`El contenido del archivo no es JSON válido: ${err.message}`);
  }

  // Detectado ANTES de migrar — ver JSDoc de esta función.
  const oldImported = rawState?.estructural?.imported;
  const discardedCsvImportData = (rawState?.metadata?.schemaVersion ?? 0) < 7
    && !!oldImported && ((oldImported.planar?.length ?? 0) > 0 || (oldImported.linear?.length ?? 0) > 0);

  // Igual que discardedCsvImportData pero para Hidrogeoquímica (v10): un
  // proyecto v9 podía traer `hidrogeo.samples` (el dataset resuelto que ese
  // módulo persistía). Al eliminar la importación directa, migrations[9] lo
  // descarta; se avisa al usuario si tenía muestras para que las recargue como
  // tabla "Datos hidrogeoquímicos" en QA/QC. Se mide ANTES de migrar, sobre
  // `rawState`, donde el campo todavía existe.
  const oldHydroSamples = rawState?.hidrogeoquimica?.samples;
  const discardedHydroImportData = (rawState?.metadata?.schemaVersion ?? 0) < 10
    && Array.isArray(oldHydroSamples) && oldHydroSamples.length > 0;

  // migrateProjectState() (projectMigrations.js) valida schemaVersion y
  // aplica en cadena las migraciones necesarias hasta PROJECT_SCHEMA_VERSION;
  // solo rechaza si no hay una ruta completa (p.ej. una versión futura que
  // esta build todavía no conoce). Sus errores ya vienen con mensaje claro
  // y específico — se propagan tal cual, sin envolver.
  const state = migrateProjectState(rawState);

  // Los errores de applyProjectState() (p.ej. timeout de un módulo al
  // auto-lanzarse) se propagan tal cual, con su mensaje original — no se
  // envuelven ni se reemplazan acá.
  await applyProjectState(state);

  return { discardedCsvImportData, discardedHydroImportData };
}

// Cola de exports guardada para poder testear este archivo con Vitest sin
// romper su carga real en el navegador (<script src>, sin bundler) — mismo
// patrón que projectMigrations.js. Solo expone las funciones puras de
// codificación (jsonReplacer/jsonReviver/uint8ArrayToBase64/
// base64ToUint8Array, Etapa 13) — el resto de este archivo son
// orquestadores async con dependencias globales (window.ProjectBridge,
// pako, el DOM) más naturales de verificar por navegador, mismo criterio
// ya establecido en el resto del proyecto.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { jsonReplacer, jsonReviver, uint8ArrayToBase64, base64ToUint8Array };
}
