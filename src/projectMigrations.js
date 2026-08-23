/**
 * src/projectMigrations.js
 * Migraciones de esquema para el sistema de Proyectos — ver
 * `ProjectMetadata.schemaVersion` en src/projectTypes.ts.
 *
 * JS plano, sin build step (igual que projectManager.js/store.js) — se
 * carga vía <script src> en index.html. Usa `PROJECT_SCHEMA_VERSION`
 * (definida en projectManager.js) como global compartido — como
 * migrateProjectState() solo la lee dentro del cuerpo de la función, no al
 * cargar el script, el orden entre los dos <script src> no importa para
 * que esto funcione, pero por legibilidad este archivo se carga antes de
 * projectManager.js en index.html (la migración es lo que
 * loadProjectFromFile() consume, no al revés).
 */

/**
 * Registro de migraciones: la clave es la versión de ORIGEN, el valor es
 * una función que transforma un ProjectState de esa versión al de la
 * INMEDIATA SIGUIENTE (no directo a la versión actual — migrateProjectState
 * las encadena de a un paso genérico).
 */
const migrations = {
  /**
   * v1 → v2 (Etapa 13): ProjectState.gis pasa de un `null` fijo (el
   * módulo GIS no existía como tal cuando se definió v1) a
   * `GisProjectState | null` real (ver src/gis/gisTypes.ts). Un archivo
   * v1 nunca pudo tener datos reales de GIS — `oldState.gis` siempre es
   * `null` ahí — así que no hay nada que traducir: alcanza con un default
   * razonable (`{ extent: null, layers: [] }`, "proyecto GIS sin
   * configurar todavía", igual que un proyecto nuevo que nunca abrió el
   * módulo GIS).
   */
  1: function migrateV1toV2(oldState) {
    return {
      ...oldState,
      metadata: { ...oldState.metadata, schemaVersion: 2 },
      gis: { extent: null, layers: [] },
    };
  },

  /**
   * v2 → v3 (Etapa 9 del paquete de Hidrogeoquímica): reemplaza el
   * `colorMode: 'pozo'|'campaign'` fijo de HidrogeoquimicaProjectState por
   * `classifyField: string` (clasificación genérica, Etapa 3 de ese
   * paquete — ver getClassifiableFields()/getFieldValue() en
   * hidrogeo/sampleColor.ts), y agrega la configuración de los 2
   * diagramas nuevos que no existían en v2: relaciones iónicas (Etapa 7,
   * `ionRatio`) y Schoeller-Berkaloff (Etapa 8, `schoellerBerkaloff`).
   *
   * Traducción de colorMode: 'campaign' → 'campaign', cualquier otra cosa
   * (incluido 'pozo', el único otro valor que v1/v2 pudieron tener) →
   * 'name' — misma correspondencia 1:1 que ya usaba
   * HydrogeochemistryModule.loadProjectState() antes de esta etapa, así
   * que no hay pérdida de información real para ningún proyecto v2
   * existente.
   *
   * `ionRatio`/`schoellerBerkaloff` no existían en v2 — no hay nada que
   * traducir, se usan los mismos valores por defecto que ya tiene un
   * componente recién montado (ver useState en HydrogeochemistryModule.tsx
   * y DEFAULT_X_FIELD/DEFAULT_Y_FIELD en hidrogeo/ionicRatios.ts), para
   * que un proyecto v2 migrado se vea igual que si el usuario nunca hubiera
   * tocado esos 2 diagramas nuevos.
   *
   * Si `oldState.hidrogeoquimica` es `null` (el módulo nunca se lanzó en
   * esa sesión — ver nota de arquitectura en projectTypes.ts), se
   * mantiene `null`: no hay nada que migrar.
   */
  2: function migrateV2toV3(oldState) {
    const oldHidro = oldState.hidrogeoquimica;
    let newHidro = null;
    if (oldHidro != null) {
      const { colorMode, ...rest } = oldHidro;
      newHidro = {
        ...rest,
        classifyField: colorMode === 'campaign' ? 'campaign' : 'name',
        ionRatio: {
          xField: { kind: 'ratio', numerator: 'Na', denominator: 'Cl' },
          yField: { kind: 'ion', ion: 'Ca', unit: 'meq/L' },
          yScale: 'linear',
        },
        schoellerBerkaloff: { meqLMin: null, meqLMax: null },
      };
    }
    return {
      ...oldState,
      metadata: { ...oldState.metadata, schemaVersion: 3 },
      hidrogeoquimica: newHidro,
    };
  },

  /**
   * v3 → v4 (Etapa 14 de Análisis Estructural): agrega
   * ProjectState.estructural, campo que NO EXISTÍA en v3 (el módulo no
   * tenía pipeline de lanzamiento hasta la Etapa 13, y no se integraba al
   * sistema de Proyectos hasta esta etapa). Un archivo v3 nunca pudo tener
   * datos reales de Análisis Estructural — no hay nada que traducir,
   * alcanza con `null` ("módulo nunca lanzado en esta sesión", mismo
   * default que un proyecto nuevo que nunca abrió el módulo — ver
   * migrations[1] arriba para el mismo criterio aplicado a `gis` en su
   * momento).
   */
  3: function migrateV3toV4(oldState) {
    return {
      ...oldState,
      metadata: { ...oldState.metadata, schemaVersion: 4 },
      estructural: null,
    };
  },

  /**
   * v4 → v5 (Etapa 6 de ubicación espacial de gráficos de
   * Hidrogeoquímica): agrega `chartLocations` (Este/Norte + publicado por
   * cada uno de los 5 diagramas combinados, Etapa 2) y `stiffPublished`
   * (checkbox único de tarjetas de Stiff, Etapa 5) a
   * HidrogeoquimicaProjectState — ninguno de los dos existía en v4. Un
   * archivo v4 nunca pudo tener ubicaciones/publicación configuradas (la
   * función no existía) — no hay nada que traducir, default razonable:
   * `chartLocations: {}` (equivalente a "las 5 vacías, sin publicar" —
   * ver DEFAULT_CHART_LOCATION en HydrogeochemistryModule.tsx, que ya
   * rellena cualquier key ausente con `{ east: '', north: '', published:
   * false }` al cargar) y `stiffPublished: false`. Si
   * `oldState.hidrogeoquimica` es `null` (el módulo nunca se lanzó en esa
   * sesión), se mantiene `null` — mismo criterio que migrations[2].
   */
  4: function migrateV4toV5(oldState) {
    const oldHidro = oldState.hidrogeoquimica;
    let newHidro = null;
    if (oldHidro != null) {
      newHidro = {
        ...oldHidro,
        chartLocations: {},
        stiffPublished: false,
      };
    }
    return {
      ...oldState,
      metadata: { ...oldState.metadata, schemaVersion: 5 },
      hidrogeoquimica: newHidro,
    };
  },

  /**
   * v5 → v6 (etapa de persistencia final del paquete de mejoras de
   * Análisis Estructural, diferida explícitamente en la Etapa 14): agrega
   * a `AnalisisEstructuralProjectState` todo lo que ese paquete había
   * dejado SOLO en localStorage/estado de React efímero — ver diagnóstico
   * previo a esta etapa. Ninguno de estos campos existía en v5 — no hay
   * nada que traducir, default razonable: todo "apagado"/vacío, EXCEPTO
   * los toggles de despliegue de capa (`showPoles`/`showPlanes`/
   * `showLines`), que usan `true` — son los mismos defaults que ya tenían
   * StereonetPlanes.tsx/RoseDiagram.tsx antes de que este campo existiera
   * (ver `defaultShowPoles`/`defaultShowPlanes`/`defaultShowLines` en esos
   * componentes), así que un proyecto v5 migrado se ve EXACTO igual que
   * antes, sin ningún cambio de comportamiento visual.
   *
   * `filterPresets` viaja vacío acá (`[]`) porque un archivo v5 nunca tuvo
   * este campo — la fusión real con lo que haya en localStorage ocurre
   * en loadProjectState() (AnalisisEstructuralModule.tsx), no acá: esta
   * migración solo le da al estado una forma válida de v6, la política de
   * fusión es responsabilidad de quien CARGA el estado ya migrado, no de
   * la migración en sí (mismo criterio de separación de responsabilidades
   * que el resto de este archivo — una migración nunca sabe nada de
   * localStorage).
   *
   * Si `oldState.estructural` es `null` (el módulo nunca se lanzó en esa
   * sesión), se mantiene `null` — mismo criterio que migrations[3].
   */
  5: function migrateV5toV6(oldState) {
    const oldEstructural = oldState.estructural;
    let newEstructural = null;
    if (oldEstructural != null) {
      newEstructural = {
        ...oldEstructural,
        classification: {
          ...oldEstructural.classification,
          showSymbols: false,
          comparisonMode: {
            enabled: false,
            groupA: { label: 'Grupo A', filters: {} },
            groupB: { label: 'Grupo B', filters: {} },
          },
        },
        filterPresets: [],
        families: [],
        displayToggles: {
          stereonet: {
            showPoles: true, showPlanes: true, showLines: true,
            showKamb: false, showMeanPole: false, showConfidenceCone: false,
          },
          rose: { showPlanes: true, showLines: true },
        },
      };
    }
    return {
      ...oldState,
      metadata: { ...oldState.metadata, schemaVersion: 6 },
      estructural: newEstructural,
    };
  },

  /**
   * v6 → v7 (Etapa 3 del rediseño de Análisis Estructural a pestañas
   * múltiples): reemplaza el espacio de trabajo PLANO de v6 por
   * `tabs: EstructuralTabState[]` + `activeTabId`. Un archivo v6 nunca
   * tuvo más de un espacio de trabajo — se convierte en UNA pestaña
   * "heredada" ("Pestaña 1"), con `classification`/`chartStyles`/
   * `families`/`displayToggles` copiados TAL CUAL (misma forma exacta,
   * ninguno de los 4 cambió en esta etapa) y `filterPresets` se queda en
   * el nivel superior sin tocar (siempre fue global, no por pestaña).
   *
   * `qaqcFileId` de la pestaña heredada — el v6 combinaba TODOS los
   * archivos de estructuras de QA/QC automáticamente, así que no hay "un"
   * archivo natural que asignarle. Auto-detección barata: si
   * `oldState.qaqc.files` (viaja completo, sin filtrar filas) tiene
   * EXACTAMENTE UN archivo de dbType 'Datos estructurales', se le asigna
   * ese id — la pestaña migrada queda funcionando igual que antes sin que
   * el usuario tenga que hacer nada. Si hay 0 o más de 1 (ambiguo — no
   * hay forma de saber cuál "era" el dataset principal), queda `null`
   * (abre en el gate "elige un archivo" de EstructuralWorkspace.tsx) — el
   * usuario lo elige a mano una vez. `families` puede quedar "huérfana"
   * en ese caso (sus measurementIds no calzan con nada hasta que se
   * elija el archivo correcto) — no se borra, es preferible a inventar
   * una asignación arbitraria.
   *
   * `imported` (datos CSV — la importación directa por CSV/Excel ya no
   * existe, ver Etapa 1 de este rediseño) se DESCARTA acá por completo —
   * no hay ningún destino razonable para esos datos (nunca vivieron en
   * QA/QC). loadProjectFromFile() (projectManager.js) detecta ANTES de
   * llamar a esta función si `oldState.estructural.imported` tenía datos
   * reales, para avisarle al usuario — esta migración no necesita saberlo
   * (separación de responsabilidades: una migración nunca decide cómo se
   * avisa nada, solo transforma datos).
   *
   * Si `oldState.estructural` es `null` (el módulo nunca se lanzó en esa
   * sesión), se mantiene `null` — mismo criterio que migrations[3]/[5].
   */
  6: function migrateV6toV7(oldState) {
    const oldEstructural = oldState.estructural;
    let newEstructural = null;
    if (oldEstructural != null) {
      const structuralFiles = (oldState.qaqc?.files || []).filter((f) => f.dbType === 'Datos estructurales');
      const qaqcFileId = structuralFiles.length === 1 ? structuralFiles[0].id : null;
      const tabId = 'tab-migrated-1';
      newEstructural = {
        tabs: [{
          id: tabId,
          name: 'Pestaña 1',
          qaqcFileId,
          classification: oldEstructural.classification,
          chartStyles: oldEstructural.chartStyles,
          families: oldEstructural.families,
          displayToggles: oldEstructural.displayToggles,
        }],
        activeTabId: tabId,
        filterPresets: oldEstructural.filterPresets,
      };
    }
    return {
      ...oldState,
      metadata: { ...oldState.metadata, schemaVersion: 7 },
      estructural: newEstructural,
    };
  },

  /**
   * v7 → v8 (Etapa 6 del paquete de Correlación estratigráfica de
   * Columnas): agrega `correlation` a ColumnasProjectState — la config de
   * la pestaña fija de Correlación (selectores + escala compartida + toggle
   * de alineación por elevación, Etapas 2-5). Ese campo no existía en v7 —
   * no hay nada que traducir, default razonable = "función nunca tocada":
   *   - `slots: null` → al abrir la pestaña por primera vez se auto-completa
   *     1-a-1 en orden de creación (Etapa 3), igual que un proyecto nuevo.
   *   - `scaleOverride: null` → escala vertical automática (Etapa 4).
   *   - `alignByElevation: false` → alineación al tope pareja (Etapa 5).
   *
   * La cota del tope por columna (Etapa 1) NO se toca acá: vive dentro de
   * `columnState.column.metadata.topElevation` de cada entry y un proyecto
   * v7 simplemente no la tiene (ausente = sin cota configurada), que es
   * justo el default pedido — no hace falta migrar nada por columna.
   *
   * Si `oldState.columnas` es `null` (el módulo nunca se lanzó en esa
   * sesión — ver nota de arquitectura en projectTypes.ts), se mantiene
   * `null`: no hay nada que migrar (mismo criterio que migrations[2]/[4]
   * para hidrogeoquimica y [3]/[5]/[6] para estructural).
   */
  7: function migrateV7toV8(oldState) {
    const oldColumnas = oldState.columnas;
    let newColumnas = null;
    if (oldColumnas != null) {
      newColumnas = {
        ...oldColumnas,
        correlation: { slots: null, scaleOverride: null, alignByElevation: false },
      };
    }
    return {
      ...oldState,
      metadata: { ...oldState.metadata, schemaVersion: 8 },
      columnas: newColumnas,
    };
  },

  /**
   * v8 → v9 (sub-etapa de persistencia de anotaciones de Correlación):
   * `correlation.slots` deja de ser un array plano de columnId y pasa a
   * `{ id, columnId }` — se genera un id ESTABLE por slot (las líneas de
   * correlación anclan a él). Se agregan `lines: []` y `textBoxes: []`, que
   * no existían en v8 — no hay nada que traducir (un proyecto v8 nunca pudo
   * tener líneas ni cuadros de texto guardados). `slots: null` (nunca
   * inicializado) se mantiene null; `scaleOverride`/`alignByElevation` se
   * copian tal cual. El columnId de cada slot se preserva EXACTO, así que no
   * se pierde qué columna tenía asignada cada uno.
   *
   * Si `oldState.columnas` es `null` (módulo nunca lanzado), o su
   * `correlation` es null/ausente, se mantiene tal cual — mismo criterio que
   * migrations[7] y las de hidrogeoquimica/estructural.
   */
  8: function migrateV8toV9(oldState) {
    const oldColumnas = oldState.columnas;
    let newColumnas = null;
    if (oldColumnas != null) {
      const corr = oldColumnas.correlation;
      let newCorr = corr;
      if (corr != null) {
        const genSlotId = () => 'c' + Math.random().toString(36).slice(2, 10);
        newCorr = {
          ...corr,
          slots: Array.isArray(corr.slots)
            ? corr.slots.map((cid) => ({ id: genSlotId(), columnId: cid == null ? null : cid }))
            : null,
          lines: [],
          textBoxes: [],
        };
      }
      newColumnas = { ...oldColumnas, correlation: newCorr };
    }
    return {
      ...oldState,
      metadata: { ...oldState.metadata, schemaVersion: 9 },
      columnas: newColumnas,
    };
  },

  /**
   * v9 → v10 (unificación de Hidrogeoquímica con QA/QC): elimina `samples` de
   * HidrogeoquimicaProjectState. El módulo ya no importa CSV/Excel directo —
   * se alimenta de la tabla "Datos hidrogeoquímicos" de QA/QC (que ya vive en
   * `qaqc`), mismo criterio que Análisis Estructural en v7 (migrations[6], que
   * descartó `estructural.imported`). El campo `samples` se descarta; si el
   * proyecto v9 traía muestras, el caller (loadProjectFromFile →
   * discardedHydroImportData) ya lo detectó ANTES de esta migración para
   * avisarle al usuario que las recargue como tabla en QA/QC.
   * `excludedSampleIds` se resetea a [] porque referenciaba ids de muestra
   * viejos que ya no existirán (los nuevos vienen de QA/QC con otros ids).
   *
   * Si `oldState.hidrogeoquimica` es `null` (módulo nunca lanzado en esa
   * sesión — ver nota de arquitectura en projectTypes.ts), se mantiene `null`:
   * no hay nada que migrar, mismo criterio que el resto de las migraciones.
   */
  9: function migrateV9toV10(oldState) {
    const oldHidro = oldState.hidrogeoquimica;
    let newHidro = null;
    if (oldHidro != null) {
      const { samples, ...rest } = oldHidro; // descarta `samples` (ya no se persiste)
      newHidro = { ...rest, excludedSampleIds: [] };
    }
    return {
      ...oldState,
      metadata: { ...oldState.metadata, schemaVersion: 10 },
      hidrogeoquimica: newHidro,
    };
  },
};

/**
 * Aplica en cadena todas las migraciones necesarias desde
 * `state.metadata.schemaVersion` hasta PROJECT_SCHEMA_VERSION. Si el
 * archivo ya está en la versión actual, lo devuelve tal cual (no pasa por
 * ninguna migración).
 *
 * Tira un Error claro y específico, sin migrar nada a medias, si:
 *  - `state.metadata.schemaVersion` no es un número (archivo mal formado).
 *  - Pide una versión FUTURA que esta build todavía no conoce (mayor que
 *    PROJECT_SCHEMA_VERSION) — no hay forma de "desmigrar" hacia atrás, hay
 *    que actualizar la app.
 *  - Falta un paso intermedio en la cadena (un salto que el registro no
 *    cubre) — evita devolver un estado a medio migrar sin avisar.
 *  - Una migración no deja `metadata.schemaVersion` exactamente en
 *    version+1 (bug en la propia migración, se detecta acá en vez de
 *    fallar de forma más confusa más adelante).
 *
 * @param {any} state
 * @returns {object} ProjectState — ver src/projectTypes.ts
 */
function migrateProjectState(state) {
  const fromVersion = state?.metadata?.schemaVersion;
  if (typeof fromVersion !== 'number') {
    throw new Error(`Versión de esquema ausente o inválida (${fromVersion ?? 'ausente'}).`);
  }

  if (fromVersion > PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Este archivo fue guardado con una versión de esquema más nueva (${fromVersion}) que la que esta versión de `
      + `Okto Node entiende (${PROJECT_SCHEMA_VERSION}). Actualiza la aplicación para poder abrirlo.`,
    );
  }

  let current = state;
  let version = fromVersion;
  while (version < PROJECT_SCHEMA_VERSION) {
    const migrate = migrations[version];
    if (typeof migrate !== 'function') {
      throw new Error(
        `No hay una ruta de migración de la versión ${version} a la ${PROJECT_SCHEMA_VERSION} — `
        + `falta el paso ${version} → ${version + 1} en el registro de projectMigrations.js.`,
      );
    }
    current = migrate(current);
    const nextVersion = current?.metadata?.schemaVersion;
    if (nextVersion !== version + 1) {
      throw new Error(
        `La migración de la versión ${version} no dejó metadata.schemaVersion en ${version + 1} `
        + `(quedó en ${nextVersion ?? 'ausente'}) — revisa migrations[${version}] en projectMigrations.js.`,
      );
    }
    version = nextVersion;
  }

  return current;
}

// Cola de exports guardada para poder testear este archivo con Vitest sin
// romper su carga real en el navegador (<script src>, sin bundler): en
// el navegador `module` no existe, así que este bloque se salta en
// silencio y el comportamiento actual (migrations/migrateProjectState
// como globales de script clásico) queda intacto. Bajo Node/Vitest,
// `import { migrateProjectState, migrations } from './projectMigrations.js'`
// resuelve vía la interop CJS→ESM estándar de Vite, que expone las
// propiedades de `module.exports` como named exports.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { migrateProjectState, migrations };
}
