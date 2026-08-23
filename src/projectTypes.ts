/**
 * src/projectTypes.ts
 * Modelo de datos del "Proyecto" de Okto Node: la forma que va a tener
 * el archivo único descargable que agrupa todo lo trabajado en una sesión
 * (datos crudos + ediciones) de los módulos QA/QC, Columnas, Hidrogeoquímica
 * y GIS, para poder recargarlo después — incluso en otro computador.
 *
 * Etapa 1: solo el modelo de datos. Sin serialización, sin mensajería entre
 * la ventana raíz y los iframes, sin UI. `QaqcProjectState`,
 * `ColumnasProjectState` y `HidrogeoquimicaProjectState` quedan como
 * `unknown` — se definen en las etapas siguientes, una por una, cuando se
 * decida exactamente qué se serializa de cada módulo.
 *
 * ── Nota de arquitectura (del diagnóstico previo) ───────────────────────
 * - QA/QC vive en la ventana raíz (index.html): sus variables de estado
 *   (`files`, `_grpCorr`, etc.) se inicializan de forma síncrona en cuanto
 *   carga la página, sin importar qué pantalla esté visible. No existe un
 *   estado "QA/QC no lanzado" — por eso `qaqc` NO es nullable acá, a
 *   diferencia de columnas/hidrogeoquimica. Confirmado con el diagnóstico:
 *   la ausencia de datos se representa con QA/QC en su estado inicial
 *   vacío (`files: []`), no con `null`.
 * - Columnas, Hidrogeoquímica y GIS corren cada uno en su propio <iframe>,
 *   cargado de forma perezosa recién cuando el usuario lo abre por primera
 *   vez (ver launchColumnas()/launchHidro()/launchGIS() en index.html, que
 *   recién ahí asignan `frame.src`). Si nunca se abrieron en la sesión, el
 *   iframe no tiene documento propio cargado y no hay estado que leer — de
 *   ahí el `| null` en los tres.
 */

import type { StratigraphicColumn } from './columnas/types';
import type { PiperStyleSettings } from './hidrogeo/diagramStyle';
import type { StiffStyleSettings } from './hidrogeo/stiffStyle';
import type { AxisField } from './hidrogeo/ionicRatios';
import type { AxisScale } from './hidrogeo/IonRatioDiagram';
import type { GisProjectState } from './gis/gisTypes';
import type { AnalisisEstructuralProjectState } from './estructural/structuralProjectTypes';

// ─────────────────────────────────────────────────────────────────
// METADATA
// ─────────────────────────────────────────────────────────────────

/**
 * Metadata del proyecto como un todo — no de un módulo en particular.
 */
export interface ProjectMetadata {
  /** Nombre del proyecto, elegido por el usuario. */
  name: string;
  /** ISO 8601 datetime de creación del proyecto. */
  createdAt: string;
  /** ISO 8601 datetime de la última modificación (de cualquier módulo). */
  updatedAt: string;
  /** Versión de Okto Node que generó el archivo, e.g. "0.3". */
  appVersion: string;
  /**
   * Versión del ESQUEMA de `ProjectState` — independiente de `appVersion`.
   * Se incrementa solo cuando cambia la FORMA de los datos serializados
   * (agregar/quitar/renombrar campos de forma incompatible), para poder
   * migrar archivos de proyecto viejos al cargarlos. Empieza en 1.
   */
  schemaVersion: number;
}

// ─────────────────────────────────────────────────────────────────
// QA/QC — ver index.html (getQaqcProjectState / loadQaqcProjectState)
// ─────────────────────────────────────────────────────────────────
// QA/QC es JS plano sin build step: este archivo NO se importa en
// runtime desde index.html, sirve como contrato/documentación de la
// forma que `getQaqcProjectState()`/`loadQaqcProjectState()` deben
// respetar ahí.

/**
 * Un archivo cargado por el usuario, tal como vive en `files[]`.
 * `file` reemplaza al objeto `File` nativo del navegador (no
 * serializable) por sus únicos dos campos realmente usados en el resto
 * del módulo: `name` y `size`.
 */
export interface QaqcFileItem {
  /** Id numérico, generado desde `nextId`. */
  id: number;
  file: { name: string; size: number };
  /** Extensión en minúsculas, e.g. "csv", "xlsx". */
  ext: string;
  /** Extensión aceptada (∈ ACCEPTED) — no implica headers/rows no vacíos. */
  valid: boolean;
  /** Tipo de base de datos asignado por el usuario, o '' si no se asignó. */
  dbType: string;
  headers: string[];
  /** Filas parseadas desde XLSX/CSV — valores tal como los devuelve SheetJS. */
  rows: Record<string, string | number>[];
  /** fileCol → stdField. */
  mapping: Record<string, string>;
  /**
   * Presente solo si el usuario ya corrió "Identificar errores" sobre
   * este archivo (`runQAQC()`). Ausente = todavía no se validó.
   */
  errors?: QaqcValidationError[];
}

/** Una incidencia de validación, tal como la produce `validateFile()`. */
export interface QaqcValidationError {
  rowIdx: number;
  fileCol: string;
  stdField: string;
  /** Nivel de validación (1 = tipo de dato … 5 = validación cruzada). Ver LEVEL_META. */
  level: 1 | 2 | 3 | 4 | 5;
  sev: 'grave' | 'aviso';
  msg: string;
}

/**
 * Decisión de corrección del usuario para un grupo de errores.
 * `selected` viaja como array (serializa `Set<string>`); `inputs` mapea
 * `"${fileId}_${errorIndex}"` → valor de texto ingresado, para las
 * correcciones que lo requieren.
 *
 * Nota de arquitectura existente (no introducida por este modelo): la
 * clave de grupo (`errGroupKey`) se arma solo con `stdField` + las
 * correcciones aplicables — SIN el id del archivo — así que `grpCorr`
 * ya es global/compartido entre archivos en el código actual, no por
 * archivo.
 */
export interface QaqcGroupCorrection {
  selected: string[];
  inputs: Record<string, string>;
}

/**
 * Estado serializable del módulo QA/QC. QA/QC vive siempre cargado en la
 * ventana raíz, así que este estado siempre existe — ver nota en
 * `ProjectState.qaqc` más abajo.
 *
 * Deliberadamente NO incluye (ver diagnóstico de Etapa 2): `activeTab` /
 * `activeS3Tab` (se resetean solos al entrar a su pantalla), `_s4Groups`
 * (se reconstruye entera en cada `renderS4()`), los campos de la rosa de
 * rumbos ni `_roseZoomItem` (se resetean solos al cambiar de archivo
 * activo, comparando por referencia — persistirlos sería frágil para una
 * preferencia visual menor), ni `fvHighlight` (resaltado transitorio,
 * análogo a un tooltip abierto).
 */
export interface QaqcProjectState {
  files: QaqcFileItem[];
  nextId: number;
  grpCorr: Record<string, QaqcGroupCorrection>;
  expFmt: string;
  /** fileId → índice de pestaña activa en el panel de frecuencia de valores. */
  fvActiveTab: Record<number, number>;
  /** fileId → índice de pestaña → "mostrar más chips" expandido. */
  fvExpanded: Record<number, Record<number, boolean>>;
}

// ─────────────────────────────────────────────────────────────────
// COLUMNAS — ver src/columnas/columnasProjectAdapter.js
// (getColumnasProjectState / loadColumnasProjectState)
// ─────────────────────────────────────────────────────────────────
// Columnas es JS plano sin build step (igual que store.js): este archivo
// NO se importa en runtime desde ahí, sirve como contrato/documentación.

/** Ver JSDoc `ValidationIssue`/`ValidationResult` en columnas/store.js — no exportados desde ahí (JS plano). */
export interface ColumnasValidationIssue {
  code: string;
  message: string;
  unitId?: string;
}
export interface ColumnasValidationResult {
  errors: ColumnasValidationIssue[];
  warnings: ColumnasValidationIssue[];
}

/**
 * Forma exacta de `store.getState()` (ColumnState en columnas/store.js).
 * `computed` y `validation` son 100% derivados de `column` — se
 * recalculan solos en cada `getState()`/`_commit()` del store. Al
 * RESTAURAR un proyecto (`store.loadColumn()`) solo se usa `column`; se
 * tipan igual acá para que `ColumnasColumnState` refleje fielmente lo que
 * devuelve `store.getState()` hoy, tal como pidió la Etapa 4.
 */
export interface ColumnasColumnState {
  column: StratigraphicColumn;
  computed: unknown[];
  validation: ColumnasValidationResult;
}

/** Una columna estratigráfica abierta en una pestaña del visor. */
export interface ColumnasProjectEntry {
  /** Id de la pestaña — `_projects[i].id` en viewer.html (string random, NO el id de StratigraphicColumn). */
  id: string;
  /**
   * `column.metadata.name`, o `'Columna N'` (N = posición 1-indexada) si
   * está vacío — misma derivación que usa `_renderProjTabs()`, para que
   * el nombre exportado coincida con lo que la pestaña muestra hoy.
   */
  name: string;
  columnState: ColumnasColumnState;
}

/**
 * Un selector (slot) de la fila de correlación. `id` es ESTABLE (no cambia
 * al reasignar ni reordenar) y es el ancla de las líneas de correlación
 * (PuntoConectable.slotId), lo que desambigua una misma columna repetida en
 * dos slots. `columnId` = `ColumnasProjectEntry.id` asignado, o `null` si el
 * slot está vacío; un id que no matchea ninguna columna = slot "huérfano".
 */
export interface ColumnasCorrelationSlot {
  id: string;
  columnId: string | null;
}

/**
 * Punto conectable: un extremo de una línea de correlación. Ancla por
 * referencias ESTABLES (nunca píxeles), así que se resuelve a una posición
 * exacta en cualquier momento con la escala/alineación/orden vigentes.
 */
export interface ColumnasCorrelationPoint {
  /** Id del slot (no de la columna) — desambigua columnas repetidas. */
  slotId: string;
  /** Id de la unidad cuyo borde es el contacto (`StratigraphicUnit.id`). */
  unitId: string;
  /** Borde del contacto: techo o base de la unidad. */
  edge: 'top' | 'bottom';
  /** Lado de la barra de litología. */
  side: 'left' | 'right';
}

/** Una línea de correlación entre dos puntos conectables. */
export interface ColumnasCorrelationLine {
  id: string;
  from: ColumnasCorrelationPoint;
  to: ColumnasCorrelationPoint;
  /** Color CSS (hex) de la línea. */
  color: string;
  /**
   * Grosor del trazo visible en px. OPCIONAL a propósito: los proyectos
   * guardados antes de esta etapa no lo traen y se renderizan con el grosor
   * fijo histórico (2 px), así que no cambian de aspecto ni hace falta bump
   * de schemaVersion ni migración — al leerlo se usa `thickness ?? 2`.
   */
  thickness?: number;
}

/**
 * Un cuadro de texto libre sobre el lienzo. `x`/`y` están en el espacio de
 * coordenadas del lienzo compartido (NO anclado a geología — ver decisión B
 * del paquete): si cambia la escala, el cuadro queda donde estaba.
 */
export interface ColumnasCorrelationTextBox {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  /** Rotación en grados, 0–360. */
  rotation: number;
  color: string;
}

/**
 * Configuración de la pestaña fija "Correlación estratigráfica" (Etapas
 * 2-6). Es estado a nivel del MÓDULO (uno por sesión de Columnas), no por
 * columna — por eso vive al lado de `projects`, no dentro de cada entry.
 * Presente desde schemaVersion 8; `slots` pasa a `{id, columnId}` y se
 * agregan `lines`/`textBoxes` en schemaVersion 9 (ver migrations[7]/[8]).
 *
 * Nota: la cota del tope de cada columna (Etapa 1) NO viaja acá — vive en
 * `columnState.column.metadata.topElevation` de cada entry (ver
 * `ColumnMetadata` en columnas/types.ts), así que se persiste gratis con
 * el resto del estado de la columna. Ausente = columna sin cota configurada.
 */
export interface ColumnasCorrelationState {
  /**
   * Un elemento por selector, en orden. `null` (el array entero) = nunca
   * inicializado; al abrir la pestaña por primera vez se auto-completa 1-a-1
   * en orden de creación (Etapa 3) — default de un proyecto migrado desde v7.
   * En schemaVersion 8 era `(string|null)[]` (columnId plano); migrations[8]
   * lo convierte a `{id, columnId}` generando un id estable por slot.
   */
  slots: ColumnasCorrelationSlot[] | null;
  /**
   * Escala vertical compartida en px/m: `null` = automática (derivada de
   * la columna más larga entre las seleccionadas), un número = valor fijo
   * puesto a mano ("auto salvo sobrescritura", Etapa 4).
   */
  scaleOverride: number | null;
  /** Toggle "Alinear por elevación real" (Etapa 5): desplaza cada columna por su cota del tope. */
  alignByElevation: boolean;
  /** Líneas de correlación trazadas (sub-etapa de anotaciones). Vacío en proyectos migrados desde v8. */
  lines: ColumnasCorrelationLine[];
  /** Cuadros de texto libres sobre el lienzo. Vacío en proyectos migrados desde v8. */
  textBoxes: ColumnasCorrelationTextBox[];
}

/**
 * Estado serializable del módulo Columnas: todas las columnas abiertas en
 * pestañas (ver `_projects` en viewer.html), en el mismo orden en que
 * aparecen las pestañas (el array ES el orden — no hay campo aparte).
 */
export interface ColumnasProjectState {
  projects: ColumnasProjectEntry[];
  /**
   * Id de la pestaña activa (`_projects[_projIdx].id`). Si falta o no
   * matchea ningún proyecto restaurado, se usa el primero.
   */
  activeProjectId?: string;
  /**
   * Configuración de la pestaña de Correlación estratigráfica (Etapas 2-5).
   * Opcional para tolerar en memoria proyectos v7 aún no migrados; un
   * proyecto v8 bien formado siempre la trae (ver migrations[7]).
   */
  correlation?: ColumnasCorrelationState;
}

// ─────────────────────────────────────────────────────────────────
// HIDROGEOQUÍMICA — ver src/hidrogeo/HydrogeochemistryModule.tsx
// (getProjectState/loadProjectState vía forwardRef+useImperativeHandle) y
// src/hidrogeo/main.tsx (getHidrogeoquimicaProjectState/
// loadHidrogeoquimicaProjectState, registradas con listenForStateRequests)
// ─────────────────────────────────────────────────────────────────
// A diferencia de QA/QC y Columnas, Hidrogeoquímica SÍ tiene pipeline de
// esbuild — este archivo se importa ahí como TypeScript normal.

export interface HidrogeoquimicaZoomState {
  value: number;
  toolActive: boolean;
}

/**
 * Ubicación en GIS de UN diagrama combinado (Etapa 2 del paquete de
 * ubicación espacial de gráficos) — contraparte serializable de
 * `ChartLocation` (HydrogeochemistryModule.tsx), que en el estado EN VIVO
 * usa `east`/`north` como STRING de input controlado. Acá se serializan
 * como `number | null` (`null` = vacío/sin definir) — mismo criterio ya
 * usado para `schoellerBerkaloff.meqLMin/meqLMax`: "más limpio para el
 * contrato serializado que persistir el string crudo del input".
 */
export interface HidrogeoquimicaChartLocationState {
  east: number | null;
  north: number | null;
  published: boolean;
}

/**
 * Estado serializable del módulo Hidrogeoquímica. Todo vive como
 * `useState` directo en `HydrogeochemistryModule` — ver diagnóstico de
 * Etapa 5. Deliberadamente NO incluye la pestaña activa (Piper/Stiff/
 * Schoeller-Berkaloff): es navegación pura, análoga a activeTab/activeS3Tab
 * en QA/QC — se resuelve sola al montar (usa el default que ya tenga el
 * componente hoy). Tampoco incluye los PNG en sí de los gráficos
 * publicados (Etapa 3/4/5 del paquete de ubicación espacial) — se
 * regeneran a pedido cuando GIS los solicita vía el protocolo dedicado de
 * la Etapa 4/5 (requestModuleChartsFromParent), mismo criterio de "no
 * persistir lo derivable" que ya rige el resto de este archivo (ver
 * `computed`/`validation` en ColumnasColumnState, o las capas
 * `integrated-*` de GIS, ausentes de GisProjectState).
 *
 * schemaVersion 3 (Etapa 9): reemplaza el `colorMode: 'pozo'|'campaign'`
 * fijo (v1/v2) por `classifyField: string` (Etapa 3, campo de
 * clasificación genérico — ver getClassifiableFields()/getFieldValue() en
 * sampleColor.ts), y agrega la configuración de los 2 diagramas nuevos que
 * no existían en v2: relaciones iónicas (Etapa 7) y Schoeller-Berkaloff
 * (Etapa 8). Ver migrations[2] en projectMigrations.js para la migración
 * desde v2. `samples: WaterSample[]` ya incluía implícitamente `Eh?`
 * (Etapa 2, agregado a WaterSample) sin necesitar ningún cambio de forma
 * acá — cualquier campo nuevo de WaterSample viaja gratis.
 *
 * schemaVersion 5 (Etapa 6 del paquete de ubicación espacial de gráficos):
 * agrega `chartLocations` (Etapa 2) y `stiffPublished` (Etapa 5). Ver
 * migrations[4] en projectMigrations.js para la migración desde v4
 * (default: `chartLocations: {}`, `stiffPublished: false` — "nada
 * configurado todavía", ya que la función no existía antes de esta etapa).
 *
 * schemaVersion 10: ELIMINA `samples`. El módulo ya no importa CSV/Excel
 * directo — se alimenta exclusivamente de la tabla "Datos hidrogeoquímicos"
 * de QA/QC (que ya se persiste en el proyecto), mismo criterio que Análisis
 * Estructural (ver "Qué NO viaja acá" en structuralProjectTypes.ts): los
 * datos leídos de QA/QC se recalculan al montar, persistirlos sería
 * redundante y podría desincronizarse. Ver migrations[9] en
 * projectMigrations.js (descarta `samples`, con aviso `discardedHydroImportData`
 * si el proyecto v9 traía muestras).
 */
export interface HidrogeoquimicaProjectState {
  excludedSampleIds: string[];
  /** Campo de clasificación genérico (Etapa 3) — 'name'/'campaign' hoy, cualquier valor de getClassifiableFields() en general. */
  classifyField: string;
  filters: {
    pozo: string[];
    /**
     * LEGADO: el filtro por campaña se eliminó de la UI. Se conserva OPCIONAL
     * a propósito — los proyectos v10 guardados con un filtro de campaña
     * activo lo siguen trayendo, pero ya no se lee ni se aplica (se muestran
     * todas las campañas), así se evita una migración de esquema. Los
     * proyectos nuevos ya no lo escriben. La clasificación por campaña
     * ("Colorear por → Campaña", `classifyField`) NO se ve afectada.
     */
    campaign?: string[];
  };
  /**
   * Dos zooms independientes: uno para la grilla de Stiff, otro
   * compartido por Piper/Schoeller-Berkaloff (un solo diagrama visible a
   * la vez en esas pestañas).
   */
  zoom: {
    stiff: HidrogeoquimicaZoomState;
    diagram: HidrogeoquimicaZoomState;
  };
  /** Solo Piper y Stiff tienen panel de estilo editable hoy — Schoeller-Berkaloff no (ver `schoellerBerkaloff` abajo, que es rango de eje, no estilo). */
  diagramStyles: {
    piper: PiperStyleSettings;
    stiff: StiffStyleSettings;
  };
  /** Configuración de ejes del diagrama de relaciones iónicas (Etapa 7) — ver ionicRatios.ts. */
  ionRatio: {
    xField: AxisField;
    yField: AxisField;
    yScale: AxisScale;
  };
  /** Rango manual del eje meq/L compartido de Schoeller-Berkaloff (Etapa 8) — `null` = auto (calculado del rango real de los datos). */
  schoellerBerkaloff: {
    meqLMin: number | null;
    meqLMax: number | null;
  };
  /**
   * Ubicación en GIS de cada uno de los 5 diagramas combinados (Etapa 2)
   * — clave = diagramId ('piper'/'schoellerBerkaloff'/'ehph'/'clec'/
   * 'ionratio', las mismas 5 keys de LOCATABLE_DIAGRAM_IDS en
   * HydrogeochemistryModule.tsx, dueño real de ese conjunto — no se
   * reimporta acá para evitar un import circular de tipos entre este
   * archivo y ese componente). Una key ausente equivale a
   * `{ east: null, north: null, published: false }` (ver
   * DEFAULT_CHART_LOCATION) — no hace falta que las 5 estén siempre
   * presentes.
   */
  chartLocations: Record<string, HidrogeoquimicaChartLocationState>;
  /** Checkbox único "Publicar tarjetas de Stiff en GIS" (Etapa 5) — activa/desactiva TODAS las tarjetas juntas, no una por muestra. */
  stiffPublished: boolean;
}

// ─────────────────────────────────────────────────────────────────
// GIS — ver src/gis/gisTypes.ts (GisProjectState), src/gis/GisViewport.tsx
// (getProjectState/loadProjectState vía forwardRef+useImperativeHandle) y
// src/gis/main.tsx (getGisProjectState/loadGisProjectState, registradas
// con listenForStateRequests)
// ─────────────────────────────────────────────────────────────────
// GIS SÍ tiene pipeline de esbuild (igual que Hidrogeoquímica) — el tipo
// vive en gis/gisTypes.ts (no acá) porque ya era el dueño natural de todo
// el resto del modelo de datos de GIS (ProjectExtent, GisLayer) desde la
// Etapa 1; se importa arriba en vez de redefinirlo.
//
// Binarios grandes (capas ráster importadas — GeoTIFF/imagen
// georreferenciada, Uint8Array de píxeles, Etapa 13): se persisten
// completos (nunca se descartan datos ni se obliga a reimportar), pero
// saveProjectToFile()/loadProjectFromFile() (projectManager.js) los
// codifican en base64 en vez de dejar que JSON.stringify serialice el
// Uint8Array como un objeto {"0":255,"1":0,...} (~5-7× más pesado que los
// bytes crudos). Si el archivo resultante supera un umbral razonable,
// saveProjectToFile() avisa al usuario antes de descargar — nunca trunca
// nada en silencio. postMessage/structured clone (el puente en sí) NO
// necesitó ningún cambio: ya maneja Uint8Array de forma nativa y
// eficiente — el costo real estaba en la serialización JSON del archivo,
// no en la mensajería entre el iframe de GIS y la raíz.

// ─────────────────────────────────────────────────────────────────
// PROYECTO — entidad raíz
// ─────────────────────────────────────────────────────────────────

/**
 * Estado completo de un Proyecto de Okto Node: lo que se serializa a
 * un único archivo descargable y se puede recargar después.
 */
export interface ProjectState {
  metadata: ProjectMetadata;

  /**
   * QA/QC vive siempre cargado en la ventana raíz — su estado existe desde
   * que la página carga, nunca es `null` (ver nota de arquitectura arriba).
   */
  qaqc: QaqcProjectState;

  /**
   * `null` si el módulo de Columnas nunca se lanzó en esta sesión (el
   * iframe nunca cargó su `src`, por lo tanto no hay estado que leer).
   */
  columnas: ColumnasProjectState | null;

  /**
   * `null` si el módulo de Hidrogeoquímica nunca se lanzó en esta sesión
   * (mismo motivo que `columnas`).
   */
  hidrogeoquimica: HidrogeoquimicaProjectState | null;

  /**
   * `null` si el módulo de GIS nunca se lanzó en esta sesión (mismo
   * motivo que `columnas`/`hidrogeoquimica` — GIS corre en su propio
   * iframe, lanzado perezoso). Ver GisProjectState (gis/gisTypes.ts,
   * Etapa 13) — solo capas importadas por el usuario, las 'integrated-*'
   * se recalculan solas al montar.
   */
  gis: GisProjectState | null;

  /**
   * `null` si el módulo de Análisis Estructural nunca se lanzó en esta
   * sesión (mismo motivo que columnas/hidrogeoquimica/gis — corre en su
   * propio iframe, lanzado perezoso, Etapa 13). Ver
   * AnalisisEstructuralProjectState (estructural/structuralProjectTypes.ts,
   * Etapa 14) — los datos leídos de QA/QC NUNCA viajan acá, se piden de
   * nuevo al montar (mismo criterio que las capas 'integrated-*' de GIS).
   */
  estructural: AnalisisEstructuralProjectState | null;
}
