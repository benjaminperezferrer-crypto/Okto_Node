/**
 * src/gis/gisTypes.ts
 * Modelo de datos del módulo GIS — Etapa 1: solo tipos, sin lógica.
 *
 * GIS corre en su propio <iframe> (src/gis/viewer.html) con pipeline de
 * esbuild propio, como Hidrogeoquímica — no como Columnas (JS plano). Ver
 * ARCHITECTURE.md y el diagnóstico de arquitectura acordado. Estos tipos
 * son la base sobre la que se construyen, en etapas posteriores, el motor
 * 3D (Three.js vía useRef/useEffect), la UI (React) y el puente de
 * Proyectos (Etapa 13 — GisViewport.tsx/main.tsx, mismo patrón que
 * Hidrogeoquímica; no hay un archivo "gisProjectAdapter" separado por la
 * misma razón que Hidrogeoquímica tampoco lo tiene — ver nota en
 * projectTypes.ts).
 */

// ─────────────────────────────────────────────────────────────────
// EXTENSIÓN DEL PROYECTO — caja 3D + límite de cámara + proyección
// ─────────────────────────────────────────────────────────────────

/**
 * Caja interior del proyecto: el volumen 3D que contiene la grilla/datos
 * reales (sondajes, mallas, capas). Centro y dimensiones en coordenadas
 * del proyecto (este/norte), no en lat/lon — la reproyección a
 * `ProjectExtent.projectionEPSG` ya asumida.
 */
export interface Vector3DBox {
  /** Coordenada Este del centro de la caja. */
  centerEast: number;
  /** Coordenada Norte del centro de la caja. */
  centerNorth: number;
  /** Ancho de la caja (eje Este-Oeste antes de rotar). */
  width: number;
  /** Alto de la caja (eje Norte-Sur antes de rotar). */
  height: number;
  /** Rotación de la caja alrededor de su centro, en grados. */
  rotationDeg: number;
  /** Cota superior de la caja (techo), en metros. */
  topElevation: number;
  /** Cota inferior de la caja (piso), en metros. */
  bottomElevation: number;
}

/**
 * Márgenes que definen la caja exterior (límite de navegación de cámara)
 * a partir de la caja interior (`Vector3DBox`) — no se duplica como una
 * caja independiente; se suma a `Vector3DBox` recién en el momento de
 * calcular el límite real (motor 3D, etapa posterior).
 */
export interface CameraBounds {
  /** Margen horizontal (Este/Norte) sumado a cada lado de `Vector3DBox`. */
  horizontalMargin: number;
  /** Margen vertical (elevación) sumado arriba y abajo de `Vector3DBox`. */
  verticalMargin: number;
}

/**
 * Extensión completa del proyecto: la caja 3D real, su límite de cámara
 * expresado como márgenes, y la proyección única del proyecto — todas las
 * capas comparten esta misma proyección, no cada una la suya.
 */
export interface ProjectExtent {
  box: Vector3DBox;
  cameraBounds: CameraBounds;
  /** Código EPSG de la proyección del proyecto, e.g. "EPSG:32719" (UTM 19S). */
  projectionEPSG: string;
}

// ─────────────────────────────────────────────────────────────────
// CAPAS
// ─────────────────────────────────────────────────────────────────

/**
 * Tipo de capa. Las variantes `integrated-*` se alimentan automáticamente
 * del estado de otro módulo (Collar/sondajes, Columnas, Hidrogeoquímica)
 * — no de un archivo importado por el usuario, a diferencia de
 * `vector`/`raster`. `integrated-hidrogeo-chart` (Etapa 4) es la única
 * `integrated-*` cuya `data` es `RasterLayerData` (mismo `data` que
 * `raster`) en vez de una lista de puntos/trazas — un gráfico de
 * Hidrogeoquímica publicado en GIS es una IMAGEN georreferenciada, no un
 * marcador; ver gisLayerRender.ts (dispatch a buildRasterMesh, igual que
 * `raster`) y hidrogeoChartIntegration.ts. `integrated-hidrogeo-stiff`
 * (Etapa 5) es su prima: UNA sola capa con VARIOS ráster adentro (uno por
 * tarjeta de Stiff publicada, una por muestra con coordenadas) — no una
 * capa por muestra, para no saturar la tabla de contenidos con decenas de
 * filas; ver `HidrogeoStiffLayerData` en hidrogeoChartIntegration.ts.
 */
export type GisLayerType =
  | 'vector'
  | 'raster'
  | 'integrated-collars'
  | 'integrated-drillholes'
  | 'integrated-columnas'
  | 'integrated-hidrogeo-chart'
  | 'integrated-hidrogeo-stiff';

/**
 * Cómo se colorea una capa: color plano único, o categorizada por el
 * valor de un campo (con un color por categoría).
 */
export interface GisLayerSymbology {
  mode: 'flat' | 'categorized';
  /** Color usado siempre que mode === 'flat' (y como fallback si falta una categoría). */
  flatColor: string;
  /** Campo de los datos de la capa usado para categorizar — solo si mode === 'categorized'. */
  categorizedField?: string;
  /** Color por valor de `categorizedField` — solo si mode === 'categorized'. */
  categoryColors?: Record<string, string>;
}

/**
 * Una capa del proyecto GIS. `data` queda `unknown` en esta etapa — se
 * tipará por `type` (vector/raster/cada integrated-*) cuando se defina
 * qué datos concretos guarda cada una.
 */
export interface GisLayer {
  id: string;
  name: string;
  type: GisLayerType;
  visible: boolean;
  /** Orden de la capa (dibujo / tabla de contenidos) — semántica exacta a definir en la etapa de UI. */
  order: number;
  symbology: GisLayerSymbology;
  data: unknown;
}

// ─────────────────────────────────────────────────────────────────
// ESTADO DEL PROYECTO GIS — para el sistema de Proyectos (etapa posterior)
// ─────────────────────────────────────────────────────────────────

/**
 * Estado serializable del módulo GIS (Etapa 13) — ver
 * getProjectState()/loadProjectState() en GisViewport.tsx y
 * getGisProjectState()/loadGisProjectState() en main.tsx, registradas con
 * listenForStateRequests() del puente (projectBridge.ts), igual que
 * Columnas/Hidrogeoquímica. Importado en src/projectTypes.ts para
 * `ProjectState.gis: GisProjectState | null`.
 *
 * `layers` contiene SOLO las capas IMPORTADAS por el usuario
 * (type:'vector'/'raster') — las 4 variantes 'integrated-*' (collars,
 * drillholes, columnas, hidrogeo) se excluyen a propósito: se recalculan
 * solas desde QA/QC/Columnas/Hidrogeoquímica cada vez que GIS monta
 * (Etapas 9-11), así que persistirlas sería redundante y podría
 * desincronizarse del estado real de esos módulos si algo cambió mientras
 * tanto.
 */
export interface GisProjectState {
  /** null si el proyecto todavía no tiene extensión definida (caja 3D sin configurar). */
  extent: ProjectExtent | null;
  layers: GisLayer[];
  /**
   * Módulos que el usuario "disparó" desde la sección "Módulos" del panel
   * (columnas/sondajes/hidro) — se persiste SOLO la bandera de intención, no
   * las capas 'integrated-*' en sí (esas se siguen recalculando frescas al
   * montar, ver arriba). Al reabrir, GIS re-agrega automáticamente las capas
   * de estos módulos si sus datos siguen disponibles, sin que el usuario
   * tenga que volver a hacer clic. OPCIONAL: proyectos guardados antes de
   * esta etapa no la traen (⇒ ningún módulo disparado, todos arrancan en
   * gris hasta un clic) — sin migración.
   */
  triggeredModules?: string[];
}
