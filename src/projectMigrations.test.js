/**
 * src/projectMigrations.test.js
 * Pruebas unitarias de migrateProjectState() (src/projectMigrations.js).
 *
 * projectMigrations.js es JS plano sin build step, pensado para cargarse
 * vía <script src> en index.html — no tiene imports/exports reales, y lee
 * PROJECT_SCHEMA_VERSION como identificador suelto que en el navegador
 * resuelve por scope compartido de <script> clásicos (ver ARCHITECTURE.md
 * y la Etapa 2.0 de este trabajo). Para poder importarlo acá:
 *   - El archivo fuente tiene una cola `module.exports = {...}` guardada
 *     por `typeof module !== 'undefined'`, invisible para el navegador.
 *   - Este test setea `globalThis.PROJECT_SCHEMA_VERSION` antes de cada
 *     llamada a migrateProjectState(), reproduciendo lo que el orden de
 *     <script> ya garantiza en producción — sin tocar el archivo fuente.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { migrateProjectState, migrations } from './projectMigrations.js';

// Captura la migración REAL v1→v2 (Etapa 13, ProjectState.gis) ANTES de
// que el beforeEach de abajo la borre del registro compartido — el resto
// de este archivo prueba el MECANISMO genérico de encadenado con pasos
// de prueba temporales; esta referencia permite además probar el
// CONTENIDO real de la única migración que existe hoy.
const realMigrateV1toV2 = migrations[1];
const realMigrateV2toV3 = migrations[2];
const realMigrateV3toV4 = migrations[3];
const realMigrateV4toV5 = migrations[4];
const realMigrateV5toV6 = migrations[5];
const realMigrateV6toV7 = migrations[6];
const realMigrateV7toV8 = migrations[7];
const realMigrateV8toV9 = migrations[8];

// migrations es el mismo objeto que usa migrateProjectState() por
// referencia — cada test que registre pasos temporales debe limpiarlos
// para no filtrarse a los demás tests.
beforeEach(() => {
  for (const key of Object.keys(migrations)) delete migrations[key];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeState(schemaVersion) {
  return { metadata: { schemaVersion }, qaqc: {}, columnas: null, hidrogeoquimica: null, gis: null };
}

describe('migrateProjectState — ya en la versión actual', () => {
  it('devuelve el estado sin cambios (misma referencia) si schemaVersion === PROJECT_SCHEMA_VERSION', () => {
    vi.stubGlobal('PROJECT_SCHEMA_VERSION', 1);
    const state = makeState(1);
    const result = migrateProjectState(state);
    expect(result).toBe(state); // identidad, no solo igualdad estructural
  });
});

describe('migrateProjectState — versión futura no soportada', () => {
  it('rechaza con error claro si schemaVersion > PROJECT_SCHEMA_VERSION', () => {
    vi.stubGlobal('PROJECT_SCHEMA_VERSION', 1);
    const state = makeState(2);
    expect(() => migrateProjectState(state)).toThrow(
      /versión de esquema más nueva \(2\).*Okto Node entiende \(1\)/,
    );
  });
});

describe('migrateProjectState — versión antigua sin ruta de migración registrada', () => {
  it('rechaza con un error específico que indica el paso faltante, no uno genérico', () => {
    vi.stubGlobal('PROJECT_SCHEMA_VERSION', 2);
    // migrations queda vacío a propósito (ver beforeEach) — no hay paso 1 → 2 registrado.
    const state = makeState(1);
    expect(() => migrateProjectState(state)).toThrow(
      /No hay una ruta de migración de la versión 1 a la 2.*falta el paso 1 → 2/,
    );
  });
});

describe('migrateProjectState — migración encadenada', () => {
  it('ejecuta 2 pasos registrados temporalmente, en orden, y llega exacto a PROJECT_SCHEMA_VERSION', () => {
    vi.stubGlobal('PROJECT_SCHEMA_VERSION', 3);

    const appliedOrder = [];

    // Pasos de prueba registrados SOLO en este test, en el mismo objeto
    // `migrations` importado — no se toca projectMigrations.js.
    migrations[1] = function testMigrateV1toV2(oldState) {
      appliedOrder.push('1→2');
      return {
        ...oldState,
        metadata: { ...oldState.metadata, schemaVersion: 2 },
        marcaV2: true,
      };
    };
    migrations[2] = function testMigrateV2toV3(oldState) {
      appliedOrder.push('2→3');
      return {
        ...oldState,
        metadata: { ...oldState.metadata, schemaVersion: 3 },
        marcaV3: true,
      };
    };

    const state = makeState(1);
    const result = migrateProjectState(state);

    expect(appliedOrder).toEqual(['1→2', '2→3']);
    expect(result.metadata.schemaVersion).toBe(3);
    expect(result.marcaV2).toBe(true);
    expect(result.marcaV3).toBe(true);
  });
});

describe('migrateProjectState — migración rota', () => {
  it('detecta y rechaza una migración que no deja schemaVersion en version+1 exacto', () => {
    vi.stubGlobal('PROJECT_SCHEMA_VERSION', 2);

    // Migración rota: dice migrar 1 → 2 pero deja schemaVersion en 1 (sin cambiar nada).
    migrations[1] = function testMigracionRota(oldState) {
      return { ...oldState }; // bug: no actualiza metadata.schemaVersion
    };

    const state = makeState(1);
    expect(() => migrateProjectState(state)).toThrow(
      /La migración de la versión 1 no dejó metadata\.schemaVersion en 2 \(quedó en 1\)/,
    );
  });
});

describe('migrations[1] — contenido real v1 → v2 (Etapa 13, ProjectState.gis)', () => {
  it('agrega gis:{extent:null,layers:[]} y sube schemaVersion a 2, sin tocar el resto del estado', () => {
    const qaqc = { files: ['x'] };
    const hidrogeoquimica = { samples: [] };
    const oldState = { metadata: { schemaVersion: 1 }, qaqc, columnas: null, hidrogeoquimica, gis: null };

    const result = realMigrateV1toV2(oldState);

    expect(result.metadata.schemaVersion).toBe(2);
    expect(result.gis).toEqual({ extent: null, layers: [] });
    // Identidad de referencia (no solo igualdad estructural) — confirma que
    // la migración no reconstruye ni muta el resto de los módulos.
    expect(result.qaqc).toBe(qaqc);
    expect(result.hidrogeoquimica).toBe(hidrogeoquimica);
  });

  it('un proyecto v1 real (gis siempre null, nunca pudo tener datos) migra vía migrateProjectState() de punta a punta', () => {
    vi.stubGlobal('PROJECT_SCHEMA_VERSION', 2);
    migrations[1] = realMigrateV1toV2; // registra la real (beforeEach ya limpió el registro compartido)

    const state = makeState(1);
    const result = migrateProjectState(state);

    expect(result.metadata.schemaVersion).toBe(2);
    expect(result.gis).toEqual({ extent: null, layers: [] });
  });
});

describe('migrations[2] — contenido real v2 → v3 (Etapa 9, classifyField + ionRatio + schoellerBerkaloff)', () => {
  const oldHidroBase = {
    samples: [{ id: 's1', name: 'PW-01' }],
    excludedSampleIds: [],
    filters: { pozo: [], campaign: [] },
    zoom: { stiff: { value: 1, toolActive: false }, diagram: { value: 1, toolActive: false } },
    diagramStyles: { piper: {}, stiff: {} },
  };
  const EXPECTED_DEFAULT_ION_RATIO = {
    xField: { kind: 'ratio', numerator: 'Na', denominator: 'Cl' },
    yField: { kind: 'ion', ion: 'Ca', unit: 'meq/L' },
    yScale: 'linear',
  };

  it('colorMode "campaign" migra a classifyField "campaign", agrega ionRatio/schoellerBerkaloff por defecto, sube a v3', () => {
    const qaqc = { files: ['x'] };
    const oldHidro = { ...oldHidroBase, colorMode: 'campaign' };
    const oldState = { metadata: { schemaVersion: 2 }, qaqc, columnas: null, hidrogeoquimica: oldHidro, gis: null };

    const result = realMigrateV2toV3(oldState);

    expect(result.metadata.schemaVersion).toBe(3);
    expect(result.hidrogeoquimica.classifyField).toBe('campaign');
    expect(result.hidrogeoquimica.colorMode).toBeUndefined();
    expect(result.hidrogeoquimica.ionRatio).toEqual(EXPECTED_DEFAULT_ION_RATIO);
    expect(result.hidrogeoquimica.schoellerBerkaloff).toEqual({ meqLMin: null, meqLMax: null });
    // Identidad de referencia — confirma que no reconstruye los demás módulos.
    expect(result.qaqc).toBe(qaqc);
    // El resto de hidrogeoquimica (samples, filters, zoom, diagramStyles) viaja sin tocar.
    expect(result.hidrogeoquimica.samples).toBe(oldHidro.samples);
    expect(result.hidrogeoquimica.filters).toBe(oldHidro.filters);
  });

  it('colorMode "pozo" migra a classifyField "name"', () => {
    const oldHidro = { ...oldHidroBase, colorMode: 'pozo' };
    const oldState = { metadata: { schemaVersion: 2 }, qaqc: {}, columnas: null, hidrogeoquimica: oldHidro, gis: null };

    const result = realMigrateV2toV3(oldState);

    expect(result.hidrogeoquimica.classifyField).toBe('name');
  });

  it('hidrogeoquimica null (módulo nunca lanzado en esa sesión) se mantiene null', () => {
    const oldState = makeState(2);
    const result = realMigrateV2toV3(oldState);
    expect(result.hidrogeoquimica).toBeNull();
  });

  it('un proyecto v2 real migra vía migrateProjectState() de punta a punta', () => {
    vi.stubGlobal('PROJECT_SCHEMA_VERSION', 3);
    migrations[2] = realMigrateV2toV3; // registra la real (beforeEach ya limpió el registro compartido)

    const oldHidro = { ...oldHidroBase, colorMode: 'campaign' };
    const state = { metadata: { schemaVersion: 2 }, qaqc: {}, columnas: null, hidrogeoquimica: oldHidro, gis: null };
    const result = migrateProjectState(state);

    expect(result.metadata.schemaVersion).toBe(3);
    expect(result.hidrogeoquimica.classifyField).toBe('campaign');
    expect(result.hidrogeoquimica.ionRatio).toEqual(EXPECTED_DEFAULT_ION_RATIO);
  });
});

describe('migrations[3] — contenido real v3 → v4 (Etapa 14, ProjectState.estructural)', () => {
  it('agrega estructural:null y sube schemaVersion a 4, sin tocar el resto del estado', () => {
    const qaqc = { files: ['x'] };
    const gis = { extent: null, layers: [] };
    const oldState = { metadata: { schemaVersion: 3 }, qaqc, columnas: null, hidrogeoquimica: null, gis };

    const result = realMigrateV3toV4(oldState);

    expect(result.metadata.schemaVersion).toBe(4);
    expect(result.estructural).toBeNull();
    // Identidad de referencia — confirma que no reconstruye los demás módulos.
    expect(result.qaqc).toBe(qaqc);
    expect(result.gis).toBe(gis);
  });

  it('un proyecto v3 real (estructural nunca existió, no hay nada que traducir) migra vía migrateProjectState() de punta a punta', () => {
    vi.stubGlobal('PROJECT_SCHEMA_VERSION', 4);
    migrations[3] = realMigrateV3toV4; // registra la real (beforeEach ya limpió el registro compartido)

    const state = makeState(3);
    const result = migrateProjectState(state);

    expect(result.metadata.schemaVersion).toBe(4);
    expect(result.estructural).toBeNull();
  });
});

describe('migrations[4] — contenido real v4 → v5 (Etapa 6, chartLocations + stiffPublished)', () => {
  it('agrega chartLocations:{} y stiffPublished:false, sube a v5, sin tocar el resto de hidrogeoquimica', () => {
    const qaqc = { files: ['x'] };
    const oldHidro = { samples: [{ id: 's1', name: 'PW-01' }], excludedSampleIds: [] };
    const oldState = { metadata: { schemaVersion: 4 }, qaqc, columnas: null, hidrogeoquimica: oldHidro, gis: null, estructural: null };

    const result = realMigrateV4toV5(oldState);

    expect(result.metadata.schemaVersion).toBe(5);
    expect(result.hidrogeoquimica.chartLocations).toEqual({});
    expect(result.hidrogeoquimica.stiffPublished).toBe(false);
    // Identidad de referencia — confirma que no reconstruye los demás módulos ni el resto de hidrogeoquimica.
    expect(result.qaqc).toBe(qaqc);
    expect(result.hidrogeoquimica.samples).toBe(oldHidro.samples);
  });

  it('hidrogeoquimica null (módulo nunca lanzado en esa sesión) se mantiene null', () => {
    const oldState = { ...makeState(4), estructural: null };
    const result = realMigrateV4toV5(oldState);
    expect(result.hidrogeoquimica).toBeNull();
  });

  it('un proyecto v4 real migra vía migrateProjectState() de punta a punta', () => {
    vi.stubGlobal('PROJECT_SCHEMA_VERSION', 5);
    migrations[4] = realMigrateV4toV5; // registra la real (beforeEach ya limpió el registro compartido)

    const oldHidro = { samples: [], excludedSampleIds: [] };
    const state = { metadata: { schemaVersion: 4 }, qaqc: {}, columnas: null, hidrogeoquimica: oldHidro, gis: null, estructural: null };
    const result = migrateProjectState(state);

    expect(result.metadata.schemaVersion).toBe(5);
    expect(result.hidrogeoquimica.chartLocations).toEqual({});
    expect(result.hidrogeoquimica.stiffPublished).toBe(false);
  });
});

describe('migrations[6] — contenido real v6 → v7 (Etapa 3, Análisis Estructural a pestañas múltiples)', () => {
  const V6_ESTRUCTURAL = {
    imported: { planar: [{ id: 'imp-1', tipo: 'Falla', azimut: 1, dip: 1 }], linear: [] },
    classification: { field: 'tipo', filters: {}, showSymbols: true, comparisonMode: { enabled: false, groupA: { label: 'Grupo A', filters: {} }, groupB: { label: 'Grupo B', filters: {} } } },
    chartStyles: { stereonet: { fontFamily: 'x', fontSize: 12, lineThickness: 1, pointSize: 3, showGrid: true, legend: { visible: true, position: 'top-right' } }, rose: { fontFamily: 'x', fontSize: 12, lineThickness: 1, pointSize: 3, showGrid: true, legend: { visible: true, position: 'top-right' } } },
    families: [{ id: 'fam-1', name: 'Familia A', measurementIds: ['qaqc-1'], color: '#f97316', visible: true }],
    displayToggles: { stereonet: { showPoles: true, showPlanes: true, showLines: true, showKamb: false, showMeanPole: false, showConfidenceCone: false }, rose: { showPlanes: true, showLines: true } },
    filterPresets: [{ id: 'preset-1', name: 'Mi preset', field: 'tipo', filters: {} }],
  };

  it('con EXACTAMENTE 1 archivo de dbType "Datos estructurales" en QA/QC, auto-asigna su id a la pestaña heredada', () => {
    const qaqc = { files: [{ id: 42, dbType: 'Datos estructurales' }, { id: 7, dbType: 'Collar' }] };
    const oldState = { metadata: { schemaVersion: 6 }, qaqc, columnas: null, hidrogeoquimica: null, gis: null, estructural: V6_ESTRUCTURAL };

    const result = realMigrateV6toV7(oldState);

    expect(result.metadata.schemaVersion).toBe(7);
    expect(result.estructural.tabs).toHaveLength(1);
    expect(result.estructural.tabs[0].qaqcFileId).toBe(42);
    expect(result.estructural.tabs[0].name).toBe('Pestaña 1');
    expect(result.estructural.activeTabId).toBe(result.estructural.tabs[0].id);
    // classification/chartStyles/families/displayToggles copiados TAL CUAL (misma referencia, sin reconstruir).
    expect(result.estructural.tabs[0].classification).toBe(V6_ESTRUCTURAL.classification);
    expect(result.estructural.tabs[0].chartStyles).toBe(V6_ESTRUCTURAL.chartStyles);
    expect(result.estructural.tabs[0].families).toBe(V6_ESTRUCTURAL.families);
    expect(result.estructural.tabs[0].displayToggles).toBe(V6_ESTRUCTURAL.displayToggles);
    // filterPresets se queda en el nivel superior (global), no dentro de la pestaña.
    expect(result.estructural.filterPresets).toBe(V6_ESTRUCTURAL.filterPresets);
    expect(result.estructural.tabs[0].filterPresets).toBeUndefined();
    // `imported` (datos CSV) descartado por completo.
    expect(result.estructural.imported).toBeUndefined();
  });

  it('con 0 archivos de dbType "Datos estructurales", qaqcFileId queda null (ambiguo)', () => {
    const qaqc = { files: [{ id: 7, dbType: 'Collar' }] };
    const oldState = { metadata: { schemaVersion: 6 }, qaqc, columnas: null, hidrogeoquimica: null, gis: null, estructural: V6_ESTRUCTURAL };
    const result = realMigrateV6toV7(oldState);
    expect(result.estructural.tabs[0].qaqcFileId).toBeNull();
  });

  it('con MÁS DE 1 archivo de dbType "Datos estructurales", qaqcFileId queda null (ambiguo, no hay forma de saber cuál)', () => {
    const qaqc = { files: [{ id: 1, dbType: 'Datos estructurales' }, { id: 2, dbType: 'Datos estructurales' }] };
    const oldState = { metadata: { schemaVersion: 6 }, qaqc, columnas: null, hidrogeoquimica: null, gis: null, estructural: V6_ESTRUCTURAL };
    const result = realMigrateV6toV7(oldState);
    expect(result.estructural.tabs[0].qaqcFileId).toBeNull();
  });

  it('estructural null (módulo nunca lanzado en esa sesión) se mantiene null', () => {
    const oldState = { ...makeState(6), estructural: null };
    const result = realMigrateV6toV7(oldState);
    expect(result.estructural).toBeNull();
  });

  it('un proyecto v6 real migra vía migrateProjectState() de punta a punta', () => {
    vi.stubGlobal('PROJECT_SCHEMA_VERSION', 7);
    migrations[5] = realMigrateV5toV6;
    migrations[6] = realMigrateV6toV7;

    const qaqc = { files: [{ id: 9, dbType: 'Datos estructurales' }] };
    const state = { metadata: { schemaVersion: 5 }, qaqc, columnas: null, hidrogeoquimica: null, gis: null, estructural: null };
    const result = migrateProjectState(state);

    expect(result.metadata.schemaVersion).toBe(7);
    // estructural nunca se lanzó en la sesión v5 original — se mantiene null en toda la cadena.
    expect(result.estructural).toBeNull();
  });
});

describe('migrations[7] — contenido real v7 → v8 (Etapa 6, Correlación estratigráfica de Columnas)', () => {
  const V7_COLUMNAS = {
    projects: [
      { id: 'p-1', name: 'Columna 1', columnState: { column: { metadata: { name: 'Columna 1', scale: 500 }, units: [] } } },
    ],
    activeProjectId: 'p-1',
  };

  it('agrega correlation con defaults (slots null, escala auto, toggle apagado) y sube schemaVersion a 8', () => {
    const oldState = { metadata: { schemaVersion: 7 }, qaqc: {}, columnas: V7_COLUMNAS, hidrogeoquimica: null, gis: null, estructural: null };

    const result = realMigrateV7toV8(oldState);

    expect(result.metadata.schemaVersion).toBe(8);
    expect(result.columnas.correlation).toEqual({ slots: null, scaleOverride: null, alignByElevation: false });
    // el resto del estado de columnas se copia tal cual (projects/activeProjectId intactos).
    expect(result.columnas.projects).toBe(V7_COLUMNAS.projects);
    expect(result.columnas.activeProjectId).toBe('p-1');
  });

  it('no toca la cota del tope por columna (viaja gratis en column.metadata, ausente = sin cota)', () => {
    const oldState = { metadata: { schemaVersion: 7 }, qaqc: {}, columnas: V7_COLUMNAS, hidrogeoquimica: null, gis: null, estructural: null };
    const result = realMigrateV7toV8(oldState);
    // La migración no agrega ni inventa topElevation en ninguna columna.
    expect(result.columnas.projects[0].columnState.column.metadata.topElevation).toBeUndefined();
  });

  it('columnas null (módulo nunca lanzado en esa sesión) se mantiene null', () => {
    const oldState = { ...makeState(7), columnas: null };
    const result = realMigrateV7toV8(oldState);
    expect(result.columnas).toBeNull();
  });

  it('un proyecto v7 real migra vía migrateProjectState() de punta a punta', () => {
    vi.stubGlobal('PROJECT_SCHEMA_VERSION', 8);
    migrations[7] = realMigrateV7toV8;

    const state = { metadata: { schemaVersion: 7 }, qaqc: {}, columnas: V7_COLUMNAS, hidrogeoquimica: null, gis: null, estructural: null };
    const result = migrateProjectState(state);

    expect(result.metadata.schemaVersion).toBe(8);
    expect(result.columnas.correlation).toEqual({ slots: null, scaleOverride: null, alignByElevation: false });
  });
});

describe('migrations[8] — contenido real v8 → v9 (persistencia de líneas/cuadros de Correlación)', () => {
  it('convierte slots planos a {id,columnId} preservando la columna, y agrega lines/textBoxes vacíos', () => {
    const v8 = {
      projects: [], activeProjectId: undefined,
      correlation: { slots: ['col-a', null, 'col-b'], scaleOverride: 15, alignByElevation: true },
    };
    const oldState = { metadata: { schemaVersion: 8 }, qaqc: {}, columnas: v8, hidrogeoquimica: null, gis: null, estructural: null };

    const result = realMigrateV8toV9(oldState);

    expect(result.metadata.schemaVersion).toBe(9);
    const slots = result.columnas.correlation.slots;
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.columnId)).toEqual(['col-a', null, 'col-b']); // columna preservada exacta
    expect(slots.every((s) => typeof s.id === 'string' && s.id.length > 0)).toBe(true); // id estable generado
    expect(new Set(slots.map((s) => s.id)).size).toBe(3); // ids únicos
    expect(result.columnas.correlation.lines).toEqual([]);
    expect(result.columnas.correlation.textBoxes).toEqual([]);
    // scaleOverride/alignByElevation intactos
    expect(result.columnas.correlation.scaleOverride).toBe(15);
    expect(result.columnas.correlation.alignByElevation).toBe(true);
  });

  it('slots: null (nunca inicializado) se mantiene null', () => {
    const v8 = { projects: [], correlation: { slots: null, scaleOverride: null, alignByElevation: false } };
    const oldState = { metadata: { schemaVersion: 8 }, qaqc: {}, columnas: v8, hidrogeoquimica: null, gis: null, estructural: null };
    const result = realMigrateV8toV9(oldState);
    expect(result.columnas.correlation.slots).toBeNull();
    expect(result.columnas.correlation.lines).toEqual([]);
    expect(result.columnas.correlation.textBoxes).toEqual([]);
  });

  it('columnas null (módulo nunca lanzado) se mantiene null', () => {
    const oldState = { ...makeState(8), columnas: null };
    const result = realMigrateV8toV9(oldState);
    expect(result.columnas).toBeNull();
  });

  it('cadena v8 → v9 vía migrateProjectState()', () => {
    vi.stubGlobal('PROJECT_SCHEMA_VERSION', 9);
    migrations[8] = realMigrateV8toV9;
    const v8 = { projects: [], correlation: { slots: ['x'], scaleOverride: null, alignByElevation: false } };
    const state = { metadata: { schemaVersion: 8 }, qaqc: {}, columnas: v8, hidrogeoquimica: null, gis: null, estructural: null };
    const result = migrateProjectState(state);
    expect(result.metadata.schemaVersion).toBe(9);
    expect(result.columnas.correlation.slots[0].columnId).toBe('x');
    expect(result.columnas.correlation.lines).toEqual([]);
  });
});
