/**
 * src/projectBridge.ts
 * Puente de mensajería entre la ventana raíz (index.html) y los iframes de
 * cada módulo (Columnas, Hidrogeoquímica) para el sistema de Proyectos.
 *
 * Arquitectura (ver diagnóstico de Etapa 2 y projectTypes.ts): QA/QC vive
 * en la ventana raíz y se llama directo (getQaqcProjectState /
 * loadQaqcProjectState en index.html, SIN este puente). Columnas e
 * Hidrogeoquímica corren cada uno en su propio <iframe> — ventanas
 * separadas, sin acceso directo a las variables JS del padre — así que
 * necesitan postMessage para intercambiar su estado con el padre.
 *
 * Requisito de producto: la app debe abrirse con doble clic en index.html
 * (protocolo file://) y funcionar 100% offline, sin `npx serve` ni ningún
 * otro paso manual. Bajo file://, cada documento recibe un origen OPACO
 * ("null") y, además, `window.location.origin` es inconsistente entre
 * navegadores en ese protocolo — así que validar por STRING DE ORIGEN
 * (como se hacía antes) rechaza siempre los mensajes bajo file://, sin
 * importar los datos.
 *
 * Por eso la autenticación acá es por IDENTIDAD DE VENTANA
 * (`event.source`), no por origin: el padre valida que el mensaje venga
 * exactamente de `frame.contentWindow` (el iframe al que le pidió el
 * estado), y cada iframe valida que venga exactamente de `window.parent`.
 * Esto funciona igual bajo file:// y http://, y en esta arquitectura
 * siempre se conoce de antemano la ventana exacta esperada (un iframe fijo
 * por módulo) — no se pierde seguridad real para este caso de uso de
 * escritorio de un solo usuario. Como contraparte, los `postMessage` salen
 * con targetOrigin `'*'` (el string de origin de destino ya no es
 * confiable bajo file://, y la autenticación real ahora la hace la
 * verificación de `event.source` del lado receptor, no el targetOrigin de
 * salida).
 *
 * NOTA DE BUILD: este archivo es la fuente canónica en TypeScript.
 * Hidrogeoquímica lo importa directo (ya tiene pipeline esbuild, ver
 * build:hidrogeo en package.json). index.html y Columnas son JS plano sin
 * build step, así que cargan el bundle compilado `src/projectBridge.js`
 * (IIFE, expone `window.ProjectBridge`) vía `npm run build:projectBridge`
 * — mismo patrón que ya usa Hidrogeoquímica con `bundle.js`.
 */

// ─────────────────────────────────────────────────────────────────
// TIPOS DE MENSAJE
// ─────────────────────────────────────────────────────────────────

/** El padre pide el estado actual del módulo que corre en el iframe. */
export const PROJECT_GET_STATE_REQUEST = 'project:get-state-request';
/** El iframe responde con su estado actual. */
export const PROJECT_GET_STATE_RESPONSE = 'project:get-state-response';
/**
 * El iframe avisa que getState() lanzó una excepción en vez de devolver un
 * estado — evita que una excepción real (p.ej. un valor no serializable en
 * los datos del módulo) quede silenciada y el padre solo vea un timeout
 * genérico de varios segundos sin ninguna pista de la causa real.
 */
export const PROJECT_GET_STATE_ERROR = 'project:get-state-error';
/** El padre envía un estado para que el iframe lo restaure. */
export const PROJECT_LOAD_STATE = 'project:load-state';
/** El iframe avisa al padre que su listener de mensajes ya está activo. */
export const PROJECT_READY = 'project:ready';
/**
 * Par nuevo (Etapa 9, GIS): a diferencia de los 4 mensajes de arriba
 * (siempre padre → iframe, para el guardado/restauración de proyecto), este
 * par va en el sentido INVERSO — un iframe (GIS) le pide a la ventana raíz
 * un dato puntual que vive ahí (los collars de QA/QC), sin que exista un
 * "estado completo" de QA/QC de por medio. QA/QC no usa este puente para sí
 * mismo (ver nota de arquitectura arriba: se llama directo, vive en la
 * raíz) — esto es exclusivamente para que OTRO módulo en iframe le consulte
 * un dato específico a la raíz.
 */
export const PROJECT_GET_COLLARS_REQUEST = 'project:get-collars-request';
/** La raíz responde con los collars ya normalizados (ver getQaqcCollars() en index.html). */
export const PROJECT_GET_COLLARS_RESPONSE = 'project:get-collars-response';
/** Igual que PROJECT_GET_STATE_ERROR: evita que una excepción de getCollars() quede silenciada tras un timeout genérico. */
export const PROJECT_GET_COLLARS_ERROR = 'project:get-collars-error';
/**
 * Par nuevo (Etapa 10, GIS): mismo mecanismo que el par de collars de
 * arriba, pero para las estaciones de Survey (profundidad/azimut/dip) que
 * necesita el cálculo de curvatura mínima (minimumCurvature.ts) — un
 * par independiente en vez de ampliar el de collars, siguiendo el mismo
 * criterio de "una cosa por archivo/mensaje" ya usado en el resto del
 * módulo (shapefile vs. ráster vs. georreferenciación manual, cada uno su
 * propio pipeline aunque todos terminen en una GisLayer).
 */
export const PROJECT_GET_SURVEYS_REQUEST = 'project:get-surveys-request';
/** La raíz responde con las estaciones ya normalizadas (ver getQaqcSurveys() en index.html). */
export const PROJECT_GET_SURVEYS_RESPONSE = 'project:get-surveys-response';
/** Igual que PROJECT_GET_COLLARS_ERROR: evita que una excepción de getSurveys() quede silenciada tras un timeout genérico. */
export const PROJECT_GET_SURVEYS_ERROR = 'project:get-surveys-error';
/**
 * Par nuevo (Etapa 11, GIS): a diferencia de los pares de collars/surveys
 * (dato normalizado que vive EN la raíz, QA/QC), Columnas e Hidrogeoquímica
 * viven cada uno en su PROPIO iframe — GIS no puede hablarles directo (dos
 * iframes hermanos no se ven entre sí sin pasar por el padre). Por eso este
 * par es un RELEVO genérico: GIS le pide a la raíz el estado de un
 * `moduleFrameId` dado, la raíz reusa `requestStateFromFrame()` (la misma
 * función de más abajo, ya existente para el guardado de proyecto — cero
 * cambios en columnasProjectAdapter.js/hidrogeo/main.tsx) contra el iframe
 * real, y reenvía la respuesta tal cual. Un solo par genérico en vez de uno
 * por módulo: a diferencia de collars/surveys (cada uno con su propia forma
 * de dato normalizado), acá el "dato" siempre es el mismo tipo de cosa —
 * el ColumnasProjectState/HidrogeoquimicaProjectState completo tal cual lo
 * expone cada módulo — así que no hay nada bespoke que justifique separar.
 * `moduleFrameId` es un string libre a nivel de protocolo; quién decide qué
 * ids son válidos y a qué <iframe> real corresponden es la raíz (ver
 * listenForModuleStateRelayRequests) — este archivo no conoce
 * 'columnas-frame'/'hidro-frame' como concepto.
 */
export const PROJECT_RELAY_STATE_REQUEST = 'project:relay-state-request';
/** La raíz responde con el estado relevado — `state: null` si ese módulo nunca se lanzó en la sesión (nada que relevar, no es un error). */
export const PROJECT_RELAY_STATE_RESPONSE = 'project:relay-state-response';
/** Igual que los demás *_ERROR: cubre tanto una excepción real como un timeout de requestStateFromFrame() contra el módulo objetivo. */
export const PROJECT_RELAY_STATE_ERROR = 'project:relay-state-error';
/**
 * Par nuevo (Etapa 12, Análisis Estructural): mismo mecanismo EXACTO que
 * collars/surveys (dato normalizado que vive EN la raíz, tabla "Datos
 * estructurales" de QA/QC) — NO el relevo genérico de arriba
 * (PROJECT_RELAY_STATE), que es específicamente para el estado COMPLETO
 * de un módulo que vive en OTRO iframe hermano (Columnas/Hidrogeoquímica).
 * Las estructuras, como collars/surveys, tienen su propia forma de dato
 * normalizado y bespoke (ver QaqcStructurePoint) — mismo criterio ya
 * documentado para collars/surveys arriba: "una cosa por archivo/mensaje"
 * en vez de forzarlo dentro del relevo genérico.
 */
export const PROJECT_GET_STRUCTURES_REQUEST = 'project:get-structures-request';
/** La raíz responde con las estructuras ya normalizadas (ver getQaqcStructures() en index.html). */
export const PROJECT_GET_STRUCTURES_RESPONSE = 'project:get-structures-response';
/** Igual que PROJECT_GET_COLLARS_ERROR/PROJECT_GET_SURVEYS_ERROR: evita que una excepción de getStructures() quede silenciada tras un timeout genérico. */
export const PROJECT_GET_STRUCTURES_ERROR = 'project:get-structures-error';
/**
 * Par nuevo (tabla "Datos hidrogeoquímicos" de QA/QC): mismo mecanismo EXACTO
 * que collars/surveys/structures — dato normalizado que vive EN la raíz, NO
 * el relevo genérico de estado. El módulo Hidrogeoquímica lo consume como su
 * ÚNICA fuente de datos desde la eliminación de la importación directa por
 * CSV/Excel (misma decisión ya tomada para Análisis Estructural). No lleva
 * lista de archivos como structures: Hidrogeoquímica combina TODAS las filas
 * de todos los archivos de ese tipo, sin selector (ver getQaqcHydrochemistry()).
 */
export const PROJECT_GET_HYDRO_REQUEST = 'project:get-hydro-request';
/** La raíz responde con las muestras ya normalizadas (ver getQaqcHydrochemistry() en index.html). */
export const PROJECT_GET_HYDRO_RESPONSE = 'project:get-hydro-response';
/** Igual que los demás *_ERROR: evita que una excepción de getQaqcHydrochemistry() quede silenciada tras un timeout genérico. */
export const PROJECT_GET_HYDRO_ERROR = 'project:get-hydro-error';
/**
 * Par nuevo (Etapa 4, ubicación espacial de gráficos de Hidrogeoquímica):
 * a diferencia de PROJECT_RELAY_STATE (el ProjectState COMPLETO de un
 * módulo hermano, usado para guardar/restaurar proyecto), este par pide
 * específicamente los PNG de los diagramas con "Publicar en GIS" activo
 * (Etapa 2/3) — un dato que deliberadamente NO vive en
 * HidrogeoquimicaProjectState (getChartPNGBlob/getPublishedCharts viven
 * en el handle imperativo de HydrogeochemistryModule.tsx, no en su
 * estado serializable — ver Etapa 3: sin caché, se rasteriza de nuevo en
 * cada pedido). Mismo motivo que collars/surveys/structures para no
 * forzarlo dentro del relevo genérico de estado: "una cosa por
 * archivo/mensaje" en vez de una bolsa genérica que cargue con todos los
 * casos.
 *
 * A diferencia de collars/surveys/structures (dato que vive EN la raíz),
 * los gráficos viven en el iframe de Hidrogeoquímica — un hermano de
 * GIS — así que este par se usa en el HOP 2 de un relevo de dos saltos,
 * igual que PROJECT_GET_STATE_REQUEST/RESPONSE dentro de
 * PROJECT_RELAY_STATE: la raíz se lo reenvía directo al iframe objetivo
 * (ver requestChartsFromFrame/listenForChartsRequests) y el HOP 1
 * (PROJECT_RELAY_CHARTS_*, ver más abajo) es lo que GIS realmente usa
 * para pedirlo a través de la raíz.
 */
export const PROJECT_GET_CHARTS_REQUEST = 'project:get-charts-request';
/** El iframe objetivo (Hidrogeoquímica) responde con los gráficos publicados actuales — ver PublishedChartData. */
export const PROJECT_GET_CHARTS_RESPONSE = 'project:get-charts-response';
/** Igual que los demás *_ERROR: cubre una excepción real de getPublishedCharts() (p.ej. rasterizado fallido de algún diagrama). */
export const PROJECT_GET_CHARTS_ERROR = 'project:get-charts-error';
/**
 * HOP 1 (GIS → raíz → módulo objetivo → raíz → GIS) — mismo mecanismo
 * EXACTO que PROJECT_RELAY_STATE_REQUEST/RESPONSE/ERROR, pero relevando
 * PROJECT_GET_CHARTS_REQUEST/RESPONSE en vez de
 * PROJECT_GET_STATE_REQUEST/RESPONSE (ver listenForModuleChartsRelayRequests/
 * requestModuleChartsFromParent). Un par de relevo separado, no el mismo
 * PROJECT_RELAY_STATE reutilizado, porque el HOP 2 que dispara es
 * distinto (requestChartsFromFrame, no requestStateFromFrame) — mismo
 * criterio "un mensaje por necesidad" del resto de este archivo.
 */
export const PROJECT_RELAY_CHARTS_REQUEST = 'project:relay-charts-request';
/** La raíz responde con los gráficos relevados — `charts: null` si ese módulo nunca se lanzó en la sesión (nada que relevar, no es un error). */
export const PROJECT_RELAY_CHARTS_RESPONSE = 'project:relay-charts-response';
/** Igual que PROJECT_RELAY_STATE_ERROR: cubre tanto una excepción real como un timeout de requestChartsFromFrame() contra el módulo objetivo. */
export const PROJECT_RELAY_CHARTS_ERROR = 'project:relay-charts-error';

interface GetStateRequestMessage {
  type: typeof PROJECT_GET_STATE_REQUEST;
  requestId: string;
}

interface GetStateResponseMessage {
  type: typeof PROJECT_GET_STATE_RESPONSE;
  requestId: string;
  state: unknown;
}

interface GetStateErrorMessage {
  type: typeof PROJECT_GET_STATE_ERROR;
  requestId: string;
  message: string;
}

interface LoadStateMessage {
  type: typeof PROJECT_LOAD_STATE;
  state: unknown;
}

interface ReadyMessage {
  type: typeof PROJECT_READY;
}

/**
 * Un collar de QA/QC ya normalizado — lo que devuelve getQaqcCollars() en
 * index.html. Este/Norte/Cota se asumen YA en el EPSG del proyecto GIS
 * (decisión explícita, Etapa 9): QA/QC no guarda ningún CRS de origen para
 * estos números (a diferencia de un shapefile con .prj o un GeoTIFF con
 * tags embebidos), así que no hay desde qué reproyectar — GIS los ubica
 * directo, sin pasar por reprojectCoordinates().
 */
export interface QaqcCollarPoint {
  dhid: string;
  este: number;
  norte: number;
  /** null si el archivo no tiene la columna Cota mapeada, o la fila la trae vacía. */
  cota: number | null;
  sourceFileId: number;
  sourceFileName: string;
}

interface GetCollarsRequestMessage {
  type: typeof PROJECT_GET_COLLARS_REQUEST;
  requestId: string;
}

interface GetCollarsResponseMessage {
  type: typeof PROJECT_GET_COLLARS_RESPONSE;
  requestId: string;
  collars: QaqcCollarPoint[];
}

interface GetCollarsErrorMessage {
  type: typeof PROJECT_GET_COLLARS_ERROR;
  requestId: string;
  message: string;
}

/**
 * Una estación de Survey de QA/QC ya normalizada — lo que devuelve
 * getQaqcSurveys() en index.html. `depth` es la profundidad medida (MD)
 * desde el collar. `dipDeg`: 0=horizontal, -90=vertical abajo, +90=vertical
 * arriba (convención confirmada de la tabla Survey — ver el JSDoc de
 * archivo de minimumCurvature.ts para la derivación completa de las
 * fórmulas que consumen este valor).
 */
export interface QaqcSurveyStation {
  dhid: string;
  depth: number;
  azimuthDeg: number;
  dipDeg: number;
  sourceFileId: number;
  sourceFileName: string;
}

interface GetSurveysRequestMessage {
  type: typeof PROJECT_GET_SURVEYS_REQUEST;
  requestId: string;
}

interface GetSurveysResponseMessage {
  type: typeof PROJECT_GET_SURVEYS_RESPONSE;
  requestId: string;
  surveys: QaqcSurveyStation[];
}

interface GetSurveysErrorMessage {
  type: typeof PROJECT_GET_SURVEYS_ERROR;
  requestId: string;
  message: string;
}

/**
 * Una fila de la tabla "Datos estructurales" de QA/QC, ya normalizada —
 * lo que devuelve getQaqcStructures() en index.html. Mismos nombres de
 * campo que PlanarMeasurement (src/estructural/structuralTypes.ts) para
 * que el módulo Análisis Estructural pueda mapearla casi 1:1 — `azimut`
 * ya es dirección de manteo (confirmado, mismo criterio que el resto del
 * módulo), no rumbo. `zona`/`campaña` NO viajan acá: son campos PROPIOS
 * del módulo, ausentes en la tabla de QA/QC (ver DB_FIELDS['Datos
 * estructurales'] en index.html) — el módulo los deja sin dato al
 * convertir esto a PlanarMeasurement, no los inventa.
 */
export interface QaqcStructurePoint {
  id: string;
  este: number | null;
  norte: number | null;
  cota: number | null;
  tipo: string;
  azimut: number;
  dip: number;
  rake: number | null;
  direccionRake: string | null;
  cinemática: string | null;
  observaciones: string | null;
  /** Columnas "Otro" repetibles — nombre de columna del archivo → valor. */
  otros: Record<string, string>;
  sourceFileId: number;
  sourceFileName: string;
}

/** Identidad mínima de un archivo QA/QC de tipo "Datos estructurales" — id/nombre, SIN filtrar por filas válidas (ver `structuralFileIds` más abajo). */
export interface QaqcStructuralFileRef {
  id: number;
  name: string;
}

interface GetStructuresRequestMessage {
  type: typeof PROJECT_GET_STRUCTURES_REQUEST;
  requestId: string;
}

interface GetStructuresResponseMessage {
  type: typeof PROJECT_GET_STRUCTURES_RESPONSE;
  requestId: string;
  structures: QaqcStructurePoint[];
  /**
   * TODOS los archivos QA/QC de dbType 'Datos estructurales' — a
   * diferencia de `structures` (que solo contiene FILAS que pasaron el
   * mapeo mínimo, ver getQaqcStructures() en index.html), esta lista
   * incluye también archivos cuyas filas fueron TODAS inválidas (0
   * mediciones utilizables). Selector de archivo del módulo Análisis
   * Estructural (Etapa 2 del rediseño a pestañas): permite avisar "este
   * archivo existe en QA/QC pero no tiene ninguna fila usable" en vez de
   * que simplemente desaparezca sin explicación del listado derivado de
   * `structures`. Se agregó a esta respuesta EXISTENTE en vez de crear un
   * bridge nuevo — mismo viaje, mismo momento, dato adicional.
   */
  structuralFileIds: QaqcStructuralFileRef[];
}

interface GetStructuresErrorMessage {
  type: typeof PROJECT_GET_STRUCTURES_ERROR;
  requestId: string;
  message: string;
}

/**
 * Muestra de agua ya normalizada por QA/QC (tabla "Datos hidrogeoquímicos")
 * — forma bespoke análoga a QaqcStructurePoint. El módulo la convierte a
 * WaterSample (ver mapQaqcHydroToWaterSample en src/hidrogeo/qaqcBridge.ts).
 * Los 7 iones mayores (Ca/Mg/Na/K/Cl/SO4/HCO3) son REQUERIDOS — una fila sin
 * ellos no es una muestra graficable (Piper/Stiff), ver getQaqcHydrochemistry().
 * El resto es opcional: `null` cuando la columna no se mapeó o venía vacía
 * (WaterSample ya marca esos campos como opcionales). Coordenadas Lat/Lon
 * (WGS-84), que es lo que WaterSample.coordinates espera.
 */
export interface QaqcHydroPoint {
  id: string;
  name: string;
  campaign: string | null;
  samplingDate: string | null;
  lat: number | null;
  lon: number | null;
  /** Altura/cota del punto de muestreo — complemento de lat/lon para posición completa. */
  elevation: number | null;
  Ca: number;
  Mg: number;
  Na: number;
  K: number;
  Cl: number;
  SO4: number;
  HCO3: number;
  CO3: number | null;
  NO3: number | null;
  pH: number | null;
  TDS: number | null;
  EC: number | null;
  temperature: number | null;
  Eh: number | null;
  /** Salinidad (unidad libre). */
  salinity: number | null;
  /** Densidad (unidad libre). */
  density: number | null;
  /** Suma de cationes (meq/L) ingresada del laboratorio — NO calculada por la app. */
  cationsTotal: number | null;
  /** Suma de aniones (meq/L) ingresada del laboratorio — NO calculada por la app. */
  anionsTotal: number | null;
  /** Elementos traza disueltos: nombre del elemento (encabezado de columna, ej. As/Fe/Mn) → valor como texto (preserva "<0.5"). Vacío si no se mapeó ninguno. */
  elements: Record<string, string>;
  /** Columnas personalizadas repetibles ('Otro') → valor como texto. Vacío si no se mapeó ninguna. */
  otros: Record<string, string>;
}

interface GetHydroRequestMessage {
  type: typeof PROJECT_GET_HYDRO_REQUEST;
  requestId: string;
}

interface GetHydroResponseMessage {
  type: typeof PROJECT_GET_HYDRO_RESPONSE;
  requestId: string;
  hydro: QaqcHydroPoint[];
}

interface GetHydroErrorMessage {
  type: typeof PROJECT_GET_HYDRO_ERROR;
  requestId: string;
  message: string;
}

interface RelayStateRequestMessage {
  type: typeof PROJECT_RELAY_STATE_REQUEST;
  requestId: string;
  moduleFrameId: string;
}

interface RelayStateResponseMessage {
  type: typeof PROJECT_RELAY_STATE_RESPONSE;
  requestId: string;
  /** null si `moduleFrameId` nunca se lanzó en esta sesión. */
  state: unknown | null;
}

interface RelayStateErrorMessage {
  type: typeof PROJECT_RELAY_STATE_ERROR;
  requestId: string;
  message: string;
}

/**
 * Dónde ubicar un PublishedChartData — dos casos que NO se pueden mezclar
 * en un solo par de números (Etapa 5, ubicación automática de tarjetas de
 * Stiff, ajuste encontrado sobre el diseño de la Etapa 4):
 *   - 'projected': ya en el EPSG del proyecto GIS — los 5 diagramas
 *     combinados (Etapa 2), donde el USUARIO tipeó Este/Norte a mano
 *     conociendo esa proyección. GIS los usa directo, sin reproyectar.
 *   - 'geographic': WGS-84 (lat/lon, EPSG:4326) crudo — cada tarjeta de
 *     Stiff (Etapa 5) usa la coordenada de SU propia muestra
 *     (WaterSample.coordinates), que siempre es geográfica, nunca en el
 *     EPSG del proyecto (Hidrogeoquímica no conoce ese EPSG para esto,
 *     ni falta que hace). GIS reproyecta con reprojectCoordinates(),
 *     MISMO criterio de "control explícito, nunca asumir ya reproyectado"
 *     que ya usa hidrogeoIntegration.ts para 'integrated-hidrogeo'.
 * Un solo `east`/`north` plano no alcanza para distinguir estos dos casos
 * — de ahí el discriminated union en vez de agregar un tercer campo
 * "¿hace falta reproyectar?" por separado.
 */
export type PublishedChartLocation =
  | { kind: 'projected'; east: number; north: number }
  | { kind: 'geographic'; lat: number; lon: number };

/**
 * Un gráfico publicado de Hidrogeoquímica, listo para que GIS lo ubique
 * como capa ráster (Etapa 4/5) — lo que devuelve
 * HydrogeochemistryModule.getPublishedCharts(). `diagramId` es un string
 * libre a nivel de protocolo (mismo criterio que `moduleFrameId` en el
 * relevo de estado) — este archivo no conoce 'piper'/'ehph'/'stiff-<id>'
 * como concepto. Para los 5 diagramas combinados es la key de TABS
 * ('piper', 'ehph', ...); para una tarjeta de Stiff (Etapa 5) es
 * `stiff-<sampleId>` — un id por MUESTRA, no un id de diagrama fijo,
 * porque hay tantas entradas como muestras con coordenadas. `label` viaja
 * para que GIS pueda nombrar la capa sin duplicar la traducción
 * diagramId/sampleId → nombre visible que ya vive en
 * HydrogeochemistryModule.tsx. `blob` es el PNG rasterizado EN EL
 * MOMENTO de la consulta — Blob es transferible tal cual por postMessage
 * (algoritmo de clonación estructurada), sin pasar por base64.
 */
export interface PublishedChartData {
  diagramId: string;
  label: string;
  location: PublishedChartLocation;
  blob: Blob;
}

interface GetChartsRequestMessage {
  type: typeof PROJECT_GET_CHARTS_REQUEST;
  requestId: string;
}

interface GetChartsResponseMessage {
  type: typeof PROJECT_GET_CHARTS_RESPONSE;
  requestId: string;
  charts: PublishedChartData[];
}

interface GetChartsErrorMessage {
  type: typeof PROJECT_GET_CHARTS_ERROR;
  requestId: string;
  message: string;
}

interface RelayChartsRequestMessage {
  type: typeof PROJECT_RELAY_CHARTS_REQUEST;
  requestId: string;
  moduleFrameId: string;
}

interface RelayChartsResponseMessage {
  type: typeof PROJECT_RELAY_CHARTS_RESPONSE;
  requestId: string;
  /** null si `moduleFrameId` nunca se lanzó en esta sesión. */
  charts: PublishedChartData[] | null;
}

interface RelayChartsErrorMessage {
  type: typeof PROJECT_RELAY_CHARTS_ERROR;
  requestId: string;
  message: string;
}

type ProjectBridgeMessage =
  | GetStateRequestMessage
  | GetStateResponseMessage
  | GetStateErrorMessage
  | LoadStateMessage
  | ReadyMessage
  | GetCollarsRequestMessage
  | GetCollarsResponseMessage
  | GetCollarsErrorMessage
  | GetSurveysRequestMessage
  | GetSurveysResponseMessage
  | GetSurveysErrorMessage
  | GetStructuresRequestMessage
  | GetStructuresResponseMessage
  | GetStructuresErrorMessage
  | GetHydroRequestMessage
  | GetHydroResponseMessage
  | GetHydroErrorMessage
  | RelayStateRequestMessage
  | RelayStateResponseMessage
  | RelayStateErrorMessage
  | GetChartsRequestMessage
  | GetChartsResponseMessage
  | GetChartsErrorMessage
  | RelayChartsRequestMessage
  | RelayChartsResponseMessage
  | RelayChartsErrorMessage;

const KNOWN_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  PROJECT_GET_STATE_REQUEST,
  PROJECT_GET_STATE_RESPONSE,
  PROJECT_GET_STATE_ERROR,
  PROJECT_LOAD_STATE,
  PROJECT_READY,
  PROJECT_GET_COLLARS_REQUEST,
  PROJECT_GET_COLLARS_RESPONSE,
  PROJECT_GET_COLLARS_ERROR,
  PROJECT_GET_SURVEYS_REQUEST,
  PROJECT_GET_SURVEYS_RESPONSE,
  PROJECT_GET_SURVEYS_ERROR,
  PROJECT_GET_STRUCTURES_REQUEST,
  PROJECT_GET_STRUCTURES_RESPONSE,
  PROJECT_GET_STRUCTURES_ERROR,
  PROJECT_GET_HYDRO_REQUEST,
  PROJECT_GET_HYDRO_RESPONSE,
  PROJECT_GET_HYDRO_ERROR,
  PROJECT_RELAY_STATE_REQUEST,
  PROJECT_RELAY_STATE_RESPONSE,
  PROJECT_RELAY_STATE_ERROR,
  PROJECT_GET_CHARTS_REQUEST,
  PROJECT_GET_CHARTS_RESPONSE,
  PROJECT_GET_CHARTS_ERROR,
  PROJECT_RELAY_CHARTS_REQUEST,
  PROJECT_RELAY_CHARTS_RESPONSE,
  PROJECT_RELAY_CHARTS_ERROR,
]);

// ─────────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────────

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback defensivo — crypto.randomUUID ya es estándar en navegadores
  // modernos sobre contexto seguro (localhost cuenta como tal).
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Descarta cualquier postMessage ajeno al puente (extensiones, devtools, etc). */
function isProjectBridgeMessage(data: unknown): data is ProjectBridgeMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { type?: unknown }).type === 'string' &&
    KNOWN_MESSAGE_TYPES.has((data as { type: string }).type)
  );
}

// ─────────────────────────────────────────────────────────────────
// LADO PADRE (index.html)
// ─────────────────────────────────────────────────────────────────

/**
 * Pide el estado actual al módulo que corre dentro de `frame` y espera su
 * respuesta. Usa un `requestId` de correlación para no mezclar la
 * respuesta con la de otro iframe, o con una respuesta tardía de un
 * pedido anterior, si hay más de un módulo respondiendo a la vez.
 *
 * Rechaza la promesa si `frame.contentWindow` no existe todavía (el
 * iframe nunca cargó su `src`) o si no llega respuesta dentro de
 * `timeoutMs`.
 */
export function requestStateFromFrame(
  frame: HTMLIFrameElement,
  timeoutMs = 3000,
): Promise<unknown> {
  const targetWindow = frame.contentWindow;
  if (!targetWindow) {
    return Promise.reject(
      new Error('requestStateFromFrame: el iframe no tiene contentWindow (¿nunca cargó su src?).'),
    );
  }

  const requestId = generateRequestId();

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };

    const onMessage = (event: MessageEvent) => {
      if (settled) return;
      // Autenticación por identidad de ventana, no por origin — ver nota
      // de arquitectura al inicio del archivo (requisito de doble-clic +
      // file://).
      if (event.source !== targetWindow) return;
      if (!isProjectBridgeMessage(event.data)) return;

      if (event.data.type === PROJECT_GET_STATE_RESPONSE) {
        if (event.data.requestId !== requestId) return; // respuesta de otro pedido — ignorar
        settled = true;
        cleanup();
        resolve(event.data.state);
        return;
      }

      if (event.data.type === PROJECT_GET_STATE_ERROR) {
        if (event.data.requestId !== requestId) return; // error de otro pedido — ignorar
        // getState() lanzó del otro lado — rechaza YA con el error real en
        // vez de esperar el timeout completo sin ninguna pista de la causa.
        settled = true;
        cleanup();
        reject(new Error(`requestStateFromFrame: el módulo no pudo generar su estado: ${event.data.message}`));
        return;
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`requestStateFromFrame: timeout (${timeoutMs}ms) esperando PROJECT_GET_STATE_RESPONSE.`));
    }, timeoutMs);

    window.addEventListener('message', onMessage);

    const message: GetStateRequestMessage = { type: PROJECT_GET_STATE_REQUEST, requestId };
    // targetOrigin '*': bajo file:// el origin real es opaco/inconsistente
    // — la autenticación real la hace onMessage() al validar event.source.
    targetWindow.postMessage(message, '*');
  });
}

/**
 * Envía un estado a `frame` para que el módulo que corre adentro lo
 * restaure. No espera confirmación — es fire-and-forget. Si se necesita
 * saber cuándo el iframe ya puede recibir mensajes, ver PROJECT_READY.
 */
export function sendStateToFrame(frame: HTMLIFrameElement, state: unknown): void {
  const targetWindow = frame.contentWindow;
  if (!targetWindow) {
    throw new Error('sendStateToFrame: el iframe no tiene contentWindow (¿nunca cargó su src?).');
  }
  const message: LoadStateMessage = { type: PROJECT_LOAD_STATE, state };
  targetWindow.postMessage(message, '*');
}

/**
 * Se llama UNA VEZ en la ventana raíz (index.html) para atender pedidos de
 * collars que le haga `frame` (el iframe de GIS) vía
 * `requestCollarsFromParent()`. A diferencia de `listenForStateRequests()`
 * (que corre DENTRO de cada iframe y confía en `window.parent` como único
 * remitente legítimo), acá quien escucha es la raíz, que puede tener varios
 * iframes de módulo a la vez — por eso la autenticación es contra
 * `frame.contentWindow` de ESTE `frame` en particular, no contra "cualquier
 * hijo".
 */
export function listenForCollarsRequests(
  frame: HTMLIFrameElement,
  getCollars: () => QaqcCollarPoint[],
): void {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) return;
    if (!isProjectBridgeMessage(event.data)) return;
    if (event.data.type !== PROJECT_GET_COLLARS_REQUEST) return;

    const { requestId } = event.data;
    const responseSource = event.source as Window | null;
    if (!responseSource) return;

    // getCollars() puede lanzar (misma razón que getState() en
    // listenForStateRequests) — sin este try/catch, GIS solo vería un
    // timeout genérico sin pista de la causa real.
    let response: GetCollarsResponseMessage | GetCollarsErrorMessage;
    try {
      response = { type: PROJECT_GET_COLLARS_RESPONSE, requestId, collars: getCollars() };
    } catch (err) {
      response = {
        type: PROJECT_GET_COLLARS_ERROR,
        requestId,
        message: err instanceof Error ? err.message : String(err),
      };
    }
    responseSource.postMessage(response, '*');
  });
}

/**
 * Igual que `listenForCollarsRequests()`, pero para las estaciones de
 * Survey (Etapa 10) — ver ese JSDoc para el detalle de la autenticación
 * por `frame.contentWindow`.
 */
export function listenForSurveysRequests(
  frame: HTMLIFrameElement,
  getSurveys: () => QaqcSurveyStation[],
): void {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) return;
    if (!isProjectBridgeMessage(event.data)) return;
    if (event.data.type !== PROJECT_GET_SURVEYS_REQUEST) return;

    const { requestId } = event.data;
    const responseSource = event.source as Window | null;
    if (!responseSource) return;

    let response: GetSurveysResponseMessage | GetSurveysErrorMessage;
    try {
      response = { type: PROJECT_GET_SURVEYS_RESPONSE, requestId, surveys: getSurveys() };
    } catch (err) {
      response = {
        type: PROJECT_GET_SURVEYS_ERROR,
        requestId,
        message: err instanceof Error ? err.message : String(err),
      };
    }
    responseSource.postMessage(response, '*');
  });
}

/**
 * Igual que `listenForCollarsRequests()`/`listenForSurveysRequests()`,
 * pero para las estructuras (Etapa 12, Análisis Estructural) — ver ese
 * JSDoc para el detalle de la autenticación por `frame.contentWindow`.
 *
 * `getStructuresData` devuelve tanto las mediciones (`structures`) como
 * TODOS los archivos de dbType 'Datos estructurales' (`structuralFileIds`,
 * ver JSDoc de GetStructuresResponseMessage) — un solo callback en vez de
 * dos separados porque ambos se derivan de la MISMA lectura de `files` en
 * index.html (getQaqcStructures()/getQaqcStructuralFileIds()), llamarlos
 * juntos evita 2 recorridos separados de `files` por cada request.
 */
export function listenForStructuresRequests(
  frame: HTMLIFrameElement,
  getStructuresData: () => { structures: QaqcStructurePoint[]; structuralFileIds: QaqcStructuralFileRef[] },
): void {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) return;
    if (!isProjectBridgeMessage(event.data)) return;
    if (event.data.type !== PROJECT_GET_STRUCTURES_REQUEST) return;

    const { requestId } = event.data;
    const responseSource = event.source as Window | null;
    if (!responseSource) return;

    let response: GetStructuresResponseMessage | GetStructuresErrorMessage;
    try {
      const { structures, structuralFileIds } = getStructuresData();
      response = { type: PROJECT_GET_STRUCTURES_RESPONSE, requestId, structures, structuralFileIds };
    } catch (err) {
      response = {
        type: PROJECT_GET_STRUCTURES_ERROR,
        requestId,
        message: err instanceof Error ? err.message : String(err),
      };
    }
    responseSource.postMessage(response, '*');
  });
}

/**
 * Análoga a listenForStructuresRequests() pero para la tabla "Datos
 * hidrogeoquímicos" de QA/QC — ver ese JSDoc para el mecanismo. `getHydro`
 * devuelve las muestras ya normalizadas (getQaqcHydrochemistry() en
 * index.html), combinando TODAS las filas de TODOS los archivos de ese tipo
 * (sin selector — ver decisión de multi-archivo del módulo). No lleva lista
 * de archivos porque no hay selector que la use.
 */
export function listenForHydroRequests(
  frame: HTMLIFrameElement,
  getHydro: () => QaqcHydroPoint[],
): void {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) return;
    if (!isProjectBridgeMessage(event.data)) return;
    if (event.data.type !== PROJECT_GET_HYDRO_REQUEST) return;

    const { requestId } = event.data;
    const responseSource = event.source as Window | null;
    if (!responseSource) return;

    let response: GetHydroResponseMessage | GetHydroErrorMessage;
    try {
      response = { type: PROJECT_GET_HYDRO_RESPONSE, requestId, hydro: getHydro() };
    } catch (err) {
      response = {
        type: PROJECT_GET_HYDRO_ERROR,
        requestId,
        message: err instanceof Error ? err.message : String(err),
      };
    }
    responseSource.postMessage(response, '*');
  });
}

/**
 * Se llama UNA VEZ en la ventana raíz para atender pedidos de RELEVO que
 * le haga `frame` (el iframe de GIS) vía `requestModuleStateFromParent()`
 * (Etapa 11) — GIS pidiendo el estado de OTRO módulo (Columnas,
 * Hidrogeoquímica) que vive en un iframe hermano, al que no puede
 * hablarle directo.
 *
 * `resolveTargetFrame(moduleFrameId)` decide, del lado de quien llama
 * (index.html), qué `moduleFrameId` son válidos y a qué `<iframe>` real
 * corresponden — devolver `null` (id desconocido, o módulo nunca
 * lanzado) responde de inmediato `state: null` sin siquiera intentar
 * `requestStateFromFrame()` (evita esperar su timeout de 3s sin motivo:
 * un iframe con `src=""` nunca va a responder). Este archivo
 * deliberadamente no conoce 'columnas-frame'/'hidro-frame' como
 * concepto — esa decisión es 100% de quien registra el listener.
 */
export function listenForModuleStateRelayRequests(
  frame: HTMLIFrameElement,
  resolveTargetFrame: (moduleFrameId: string) => HTMLIFrameElement | null,
): void {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) return;
    if (!isProjectBridgeMessage(event.data)) return;
    if (event.data.type !== PROJECT_RELAY_STATE_REQUEST) return;

    const { requestId, moduleFrameId } = event.data;
    const responseSource = event.source as Window | null;
    if (!responseSource) return;

    const targetFrame = resolveTargetFrame(moduleFrameId);
    if (!targetFrame) {
      const response: RelayStateResponseMessage = { type: PROJECT_RELAY_STATE_RESPONSE, requestId, state: null };
      responseSource.postMessage(response, '*');
      return;
    }

    // requestStateFromFrame() ya tiene su propio timeout/rechazo — este
    // catch cubre TANTO esa excepción como cualquier otra que
    // resolveTargetFrame() pudiera lanzar (aunque no debería).
    requestStateFromFrame(targetFrame)
      .then((state) => {
        const response: RelayStateResponseMessage = { type: PROJECT_RELAY_STATE_RESPONSE, requestId, state };
        responseSource.postMessage(response, '*');
      })
      .catch((err) => {
        const response: RelayStateErrorMessage = {
          type: PROJECT_RELAY_STATE_ERROR,
          requestId,
          message: err instanceof Error ? err.message : String(err),
        };
        responseSource.postMessage(response, '*');
      });
  });
}

/**
 * HOP 2 (raíz → módulo objetivo) del relevo de gráficos publicados —
 * mismo mecanismo de correlación/timeout que requestStateFromFrame, pero
 * pidiendo PROJECT_GET_CHARTS_REQUEST/RESPONSE en vez de
 * PROJECT_GET_STATE_REQUEST/RESPONSE. `timeoutMs` por defecto más alto
 * que requestStateFromFrame (8000 vs 3000): del otro lado, el módulo
 * objetivo tiene que RASTERIZAR cada gráfico publicado (hasta 5, sin
 * caché — ver Etapa 3), no solo devolver un estado ya en memoria.
 */
export function requestChartsFromFrame(
  frame: HTMLIFrameElement,
  timeoutMs = 8000,
): Promise<PublishedChartData[]> {
  const targetWindow = frame.contentWindow;
  if (!targetWindow) {
    return Promise.reject(
      new Error('requestChartsFromFrame: el iframe no tiene contentWindow (¿nunca cargó su src?).'),
    );
  }

  const requestId = generateRequestId();

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };

    const onMessage = (event: MessageEvent) => {
      if (settled) return;
      if (event.source !== targetWindow) return;
      if (!isProjectBridgeMessage(event.data)) return;

      if (event.data.type === PROJECT_GET_CHARTS_RESPONSE) {
        if (event.data.requestId !== requestId) return;
        settled = true;
        cleanup();
        resolve(event.data.charts);
        return;
      }

      if (event.data.type === PROJECT_GET_CHARTS_ERROR) {
        if (event.data.requestId !== requestId) return;
        settled = true;
        cleanup();
        reject(new Error(`requestChartsFromFrame: el módulo no pudo generar sus gráficos publicados: ${event.data.message}`));
        return;
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`requestChartsFromFrame: timeout (${timeoutMs}ms) esperando PROJECT_GET_CHARTS_RESPONSE.`));
    }, timeoutMs);

    window.addEventListener('message', onMessage);

    const message: GetChartsRequestMessage = { type: PROJECT_GET_CHARTS_REQUEST, requestId };
    targetWindow.postMessage(message, '*');
  });
}

/**
 * HOP 1, lado raíz — mismo patrón EXACTO que
 * listenForModuleStateRelayRequests, pero relevando gráficos
 * (requestChartsFromFrame) en vez de estado completo
 * (requestStateFromFrame). Se llama UNA VEZ en la raíz para atender
 * pedidos que le haga `frame` (el iframe de GIS) vía
 * `requestModuleChartsFromParent()`.
 */
export function listenForModuleChartsRelayRequests(
  frame: HTMLIFrameElement,
  resolveTargetFrame: (moduleFrameId: string) => HTMLIFrameElement | null,
): void {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) return;
    if (!isProjectBridgeMessage(event.data)) return;
    if (event.data.type !== PROJECT_RELAY_CHARTS_REQUEST) return;

    const { requestId, moduleFrameId } = event.data;
    const responseSource = event.source as Window | null;
    if (!responseSource) return;

    const targetFrame = resolveTargetFrame(moduleFrameId);
    if (!targetFrame) {
      const response: RelayChartsResponseMessage = { type: PROJECT_RELAY_CHARTS_RESPONSE, requestId, charts: null };
      responseSource.postMessage(response, '*');
      return;
    }

    requestChartsFromFrame(targetFrame)
      .then((charts) => {
        const response: RelayChartsResponseMessage = { type: PROJECT_RELAY_CHARTS_RESPONSE, requestId, charts };
        responseSource.postMessage(response, '*');
      })
      .catch((err) => {
        const response: RelayChartsErrorMessage = {
          type: PROJECT_RELAY_CHARTS_ERROR,
          requestId,
          message: err instanceof Error ? err.message : String(err),
        };
        responseSource.postMessage(response, '*');
      });
  });
}

// ─────────────────────────────────────────────────────────────────
// LADO IFRAME (Columnas, Hidrogeoquímica)
// ─────────────────────────────────────────────────────────────────

/**
 * Se llama UNA VEZ dentro de cada iframe de módulo, apenas está listo
 * para exponer/recibir su estado. Registra el listener de mensajes del
 * puente y emite PROJECT_READY de inmediato para que el padre sepa que
 * ya puede pedir/enviar estado a este iframe.
 *
 * @param getState    Devuelve el estado actual del módulo. Mismo
 *                     contrato que getQaqcProjectState: debe ser una
 *                     copia segura de retener (sin referencias vivas al
 *                     estado interno), no algo que el módulo pueda mutar
 *                     por debajo mientras el padre todavía la tiene.
 * @param onLoadState  Restaura el estado recibido y refresca la UI del
 *                     módulo. Mismo contrato que loadQaqcProjectState.
 */
export function listenForStateRequests(
  getState: () => unknown,
  onLoadState: (state: unknown) => void,
): void {
  window.addEventListener('message', (event: MessageEvent) => {
    // Autenticación por identidad de ventana, no por origin — ver nota de
    // arquitectura al inicio del archivo. Este iframe solo recibe mensajes
    // legítimos del puente de su propio padre.
    if (event.source !== window.parent) return;
    if (!isProjectBridgeMessage(event.data)) return;

    if (event.data.type === PROJECT_GET_STATE_REQUEST) {
      const { requestId } = event.data;
      const responseSource = event.source as Window | null;
      if (!responseSource) return;

      // getState() puede lanzar (p.ej. un valor no serializable en los
      // datos reales del módulo) — sin este try/catch, la excepción queda
      // sin capturar en el iframe, la respuesta nunca sale, y el padre
      // solo ve un timeout genérico varios segundos después sin ninguna
      // pista de la causa real.
      let response: GetStateResponseMessage | GetStateErrorMessage;
      try {
        response = { type: PROJECT_GET_STATE_RESPONSE, requestId, state: getState() };
      } catch (err) {
        response = {
          type: PROJECT_GET_STATE_ERROR,
          requestId,
          message: err instanceof Error ? err.message : String(err),
        };
      }
      // targetOrigin '*': ver nota en requestStateFromFrame — la
      // autenticación real ya se hizo arriba, por event.source.
      responseSource.postMessage(response, '*');
      return;
    }

    if (event.data.type === PROJECT_LOAD_STATE) {
      // onLoadState() no tiene un canal de respuesta hoy (sendStateToFrame
      // es fire-and-forget por diseño) — este try/catch no le agrega un
      // mecanismo de error al padre, solo evita que una excepción acá
      // quede completamente silenciosa; al menos queda registrada en la
      // consola del iframe con un mensaje claro y atribuible al puente.
      try {
        onLoadState(event.data.state);
      } catch (err) {
        console.error('[projectBridge] onLoadState() lanzó una excepción al restaurar el estado:', err);
      }
      return;
    }
  });

  if (window.parent && window.parent !== window) {
    const ready: ReadyMessage = { type: PROJECT_READY };
    window.parent.postMessage(ready, '*');
  }
}

/**
 * Se llama UNA VEZ dentro de Hidrogeoquímica (Etapa 4, ver
 * listenForChartsRequests en src/hidrogeo/main.tsx) para atender el HOP 2
 * del relevo de gráficos publicados — contraparte de
 * `requestChartsFromFrame()`. A diferencia de `listenForStateRequests()`,
 * `getCharts` es ASÍNCRONA (rasterizar cada gráfico toma tiempo real, sin
 * caché — ver Etapa 3) y solo hay UN mensaje que atender (no hay
 * equivalente a PROJECT_LOAD_STATE acá: los gráficos publicados no se
 * "restauran", se piden a pedido).
 */
export function listenForChartsRequests(
  getCharts: () => Promise<PublishedChartData[]>,
): void {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    if (!isProjectBridgeMessage(event.data)) return;
    if (event.data.type !== PROJECT_GET_CHARTS_REQUEST) return;

    const { requestId } = event.data;
    const responseSource = event.source as Window | null;
    if (!responseSource) return;

    getCharts()
      .then((charts) => {
        const response: GetChartsResponseMessage = { type: PROJECT_GET_CHARTS_RESPONSE, requestId, charts };
        responseSource.postMessage(response, '*');
      })
      .catch((err) => {
        const response: GetChartsErrorMessage = {
          type: PROJECT_GET_CHARTS_ERROR,
          requestId,
          message: err instanceof Error ? err.message : String(err),
        };
        responseSource.postMessage(response, '*');
      });
  });
}

/**
 * Se llama desde GIS (el único módulo que hoy necesita este dato) para
 * pedirle a la ventana raíz los collars actuales de QA/QC — contraparte de
 * `listenForCollarsRequests()`. Mismo mecanismo de correlación por
 * `requestId` y autenticación por `event.source` que `requestStateFromFrame`,
 * pero apuntando siempre a `window.parent` (no a un `HTMLIFrameElement`
 * arbitrario, porque desde el lado del iframe no hay una referencia a "mi
 * propio frame" — solo a la ventana en la que corre).
 *
 * Rechaza la promesa si este documento no corre dentro de un iframe (no hay
 * `window.parent` distinto de `window` — típico al abrir viewer.html
 * directo, fuera de index.html) o si no llega respuesta dentro de
 * `timeoutMs`.
 */
export function requestCollarsFromParent(timeoutMs = 3000): Promise<QaqcCollarPoint[]> {
  if (!window.parent || window.parent === window) {
    return Promise.reject(
      new Error('requestCollarsFromParent: este documento no corre dentro de un iframe (window.parent === window).'),
    );
  }

  const requestId = generateRequestId();
  const targetWindow = window.parent;

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };

    const onMessage = (event: MessageEvent) => {
      if (settled) return;
      if (event.source !== targetWindow) return;
      if (!isProjectBridgeMessage(event.data)) return;

      if (event.data.type === PROJECT_GET_COLLARS_RESPONSE) {
        if (event.data.requestId !== requestId) return;
        settled = true;
        cleanup();
        resolve(event.data.collars);
        return;
      }

      if (event.data.type === PROJECT_GET_COLLARS_ERROR) {
        if (event.data.requestId !== requestId) return;
        settled = true;
        cleanup();
        reject(new Error(`requestCollarsFromParent: la ventana raíz no pudo generar los collars: ${event.data.message}`));
        return;
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`requestCollarsFromParent: timeout (${timeoutMs}ms) esperando PROJECT_GET_COLLARS_RESPONSE.`));
    }, timeoutMs);

    window.addEventListener('message', onMessage);

    const message: GetCollarsRequestMessage = { type: PROJECT_GET_COLLARS_REQUEST, requestId };
    targetWindow.postMessage(message, '*');
  });
}

/**
 * Igual que `requestCollarsFromParent()`, pero para las estaciones de
 * Survey (Etapa 10, minimumCurvature.ts) — ver ese JSDoc para el detalle
 * completo del mecanismo (correlación por requestId, autenticación por
 * event.source, rechazo si no corre dentro de un iframe).
 */
export function requestSurveysFromParent(timeoutMs = 3000): Promise<QaqcSurveyStation[]> {
  if (!window.parent || window.parent === window) {
    return Promise.reject(
      new Error('requestSurveysFromParent: este documento no corre dentro de un iframe (window.parent === window).'),
    );
  }

  const requestId = generateRequestId();
  const targetWindow = window.parent;

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };

    const onMessage = (event: MessageEvent) => {
      if (settled) return;
      if (event.source !== targetWindow) return;
      if (!isProjectBridgeMessage(event.data)) return;

      if (event.data.type === PROJECT_GET_SURVEYS_RESPONSE) {
        if (event.data.requestId !== requestId) return;
        settled = true;
        cleanup();
        resolve(event.data.surveys);
        return;
      }

      if (event.data.type === PROJECT_GET_SURVEYS_ERROR) {
        if (event.data.requestId !== requestId) return;
        settled = true;
        cleanup();
        reject(new Error(`requestSurveysFromParent: la ventana raíz no pudo generar las estaciones: ${event.data.message}`));
        return;
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`requestSurveysFromParent: timeout (${timeoutMs}ms) esperando PROJECT_GET_SURVEYS_RESPONSE.`));
    }, timeoutMs);

    window.addEventListener('message', onMessage);

    const message: GetSurveysRequestMessage = { type: PROJECT_GET_SURVEYS_REQUEST, requestId };
    targetWindow.postMessage(message, '*');
  });
}

/** Resultado completo de `requestStructuresFromParent()` — ver JSDoc de `GetStructuresResponseMessage.structuralFileIds`. */
export interface QaqcStructuresResult {
  structures: QaqcStructurePoint[];
  structuralFileIds: QaqcStructuralFileRef[];
}

/**
 * Igual que `requestCollarsFromParent()`/`requestSurveysFromParent()`,
 * pero para las estructuras (Etapa 12, Análisis Estructural) — ver ese
 * JSDoc para el detalle completo del mecanismo.
 */
export function requestStructuresFromParent(timeoutMs = 3000): Promise<QaqcStructuresResult> {
  if (!window.parent || window.parent === window) {
    return Promise.reject(
      new Error('requestStructuresFromParent: este documento no corre dentro de un iframe (window.parent === window).'),
    );
  }

  const requestId = generateRequestId();
  const targetWindow = window.parent;

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };

    const onMessage = (event: MessageEvent) => {
      if (settled) return;
      if (event.source !== targetWindow) return;
      if (!isProjectBridgeMessage(event.data)) return;

      if (event.data.type === PROJECT_GET_STRUCTURES_RESPONSE) {
        if (event.data.requestId !== requestId) return;
        settled = true;
        cleanup();
        resolve({ structures: event.data.structures, structuralFileIds: event.data.structuralFileIds });
        return;
      }

      if (event.data.type === PROJECT_GET_STRUCTURES_ERROR) {
        if (event.data.requestId !== requestId) return;
        settled = true;
        cleanup();
        reject(new Error(`requestStructuresFromParent: la ventana raíz no pudo generar las estructuras: ${event.data.message}`));
        return;
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`requestStructuresFromParent: timeout (${timeoutMs}ms) esperando PROJECT_GET_STRUCTURES_RESPONSE.`));
    }, timeoutMs);

    window.addEventListener('message', onMessage);

    const message: GetStructuresRequestMessage = { type: PROJECT_GET_STRUCTURES_REQUEST, requestId };
    targetWindow.postMessage(message, '*');
  });
}

/**
 * Análoga a requestStructuresFromParent() pero para "Datos hidrogeoquímicos"
 * — pide a la raíz (QA/QC) las muestras normalizadas de TODOS los archivos de
 * ese tipo, combinadas. Única fuente de datos del módulo Hidrogeoquímica.
 */
export function requestHydroFromParent(timeoutMs = 3000): Promise<QaqcHydroPoint[]> {
  if (!window.parent || window.parent === window) {
    return Promise.reject(
      new Error('requestHydroFromParent: este documento no corre dentro de un iframe (window.parent === window).'),
    );
  }

  const requestId = generateRequestId();
  const targetWindow = window.parent;

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };

    const onMessage = (event: MessageEvent) => {
      if (settled) return;
      if (event.source !== targetWindow) return;
      if (!isProjectBridgeMessage(event.data)) return;

      if (event.data.type === PROJECT_GET_HYDRO_RESPONSE) {
        if (event.data.requestId !== requestId) return;
        settled = true;
        cleanup();
        resolve(event.data.hydro);
        return;
      }

      if (event.data.type === PROJECT_GET_HYDRO_ERROR) {
        if (event.data.requestId !== requestId) return;
        settled = true;
        cleanup();
        reject(new Error(`requestHydroFromParent: la ventana raíz no pudo generar las muestras: ${event.data.message}`));
        return;
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`requestHydroFromParent: timeout (${timeoutMs}ms) esperando PROJECT_GET_HYDRO_RESPONSE.`));
    }, timeoutMs);

    window.addEventListener('message', onMessage);

    const message: GetHydroRequestMessage = { type: PROJECT_GET_HYDRO_REQUEST, requestId };
    targetWindow.postMessage(message, '*');
  });
}

/**
 * Se llama desde GIS para pedirle a la raíz el estado de OTRO módulo en
 * iframe (Etapa 11 — Columnas, Hidrogeoquímica), relevado vía
 * `listenForModuleStateRelayRequests()`. Devuelve `null` si ese módulo
 * nunca se lanzó en la sesión (nada que mostrar, no es un error).
 *
 * `timeoutMs` por defecto más alto que collars/surveys (5000 vs 3000): la
 * respuesta acá depende de un salto extra (raíz → módulo objetivo → raíz →
 * GIS, cada uno con su propio `requestStateFromFrame()` interno de hasta
 * 3s), así que necesita más margen que un dato que la raíz ya tiene en
 * memoria.
 */
export function requestModuleStateFromParent(moduleFrameId: string, timeoutMs = 5000): Promise<unknown | null> {
  if (!window.parent || window.parent === window) {
    return Promise.reject(
      new Error('requestModuleStateFromParent: este documento no corre dentro de un iframe (window.parent === window).'),
    );
  }

  const requestId = generateRequestId();
  const targetWindow = window.parent;

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };

    const onMessage = (event: MessageEvent) => {
      if (settled) return;
      if (event.source !== targetWindow) return;
      if (!isProjectBridgeMessage(event.data)) return;

      if (event.data.type === PROJECT_RELAY_STATE_RESPONSE) {
        if (event.data.requestId !== requestId) return;
        settled = true;
        cleanup();
        resolve(event.data.state);
        return;
      }

      if (event.data.type === PROJECT_RELAY_STATE_ERROR) {
        if (event.data.requestId !== requestId) return;
        settled = true;
        cleanup();
        reject(new Error(`requestModuleStateFromParent: la ventana raíz no pudo relevar el estado de "${moduleFrameId}": ${event.data.message}`));
        return;
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`requestModuleStateFromParent: timeout (${timeoutMs}ms) esperando PROJECT_RELAY_STATE_RESPONSE para "${moduleFrameId}".`));
    }, timeoutMs);

    window.addEventListener('message', onMessage);

    const message: RelayStateRequestMessage = { type: PROJECT_RELAY_STATE_REQUEST, requestId, moduleFrameId };
    targetWindow.postMessage(message, '*');
  });
}

/**
 * Se llama desde GIS (Etapa 4) para pedirle a la raíz los gráficos
 * publicados de OTRO módulo en iframe (hoy, exclusivamente
 * Hidrogeoquímica), relevados vía `listenForModuleChartsRelayRequests()`.
 * Devuelve `null` si ese módulo nunca se lanzó en la sesión — mismo
 * contrato que `requestModuleStateFromParent`, no es un error.
 *
 * `timeoutMs` por defecto más alto que `requestModuleStateFromParent`
 * (12000 vs 5000): acá el HOP 2 interno (`requestChartsFromFrame`) ya
 * tiene su propio timeout ampliado a 8000ms (rasterizar hasta 5 gráficos
 * sin caché, ver Etapa 3) — este timeout externo necesita margen POR
 * ENCIMA de ese, no el mismo número.
 */
export function requestModuleChartsFromParent(moduleFrameId: string, timeoutMs = 12000): Promise<PublishedChartData[] | null> {
  if (!window.parent || window.parent === window) {
    return Promise.reject(
      new Error('requestModuleChartsFromParent: este documento no corre dentro de un iframe (window.parent === window).'),
    );
  }

  const requestId = generateRequestId();
  const targetWindow = window.parent;

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };

    const onMessage = (event: MessageEvent) => {
      if (settled) return;
      if (event.source !== targetWindow) return;
      if (!isProjectBridgeMessage(event.data)) return;

      if (event.data.type === PROJECT_RELAY_CHARTS_RESPONSE) {
        if (event.data.requestId !== requestId) return;
        settled = true;
        cleanup();
        resolve(event.data.charts);
        return;
      }

      if (event.data.type === PROJECT_RELAY_CHARTS_ERROR) {
        if (event.data.requestId !== requestId) return;
        settled = true;
        cleanup();
        reject(new Error(`requestModuleChartsFromParent: la ventana raíz no pudo relevar los gráficos de "${moduleFrameId}": ${event.data.message}`));
        return;
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`requestModuleChartsFromParent: timeout (${timeoutMs}ms) esperando PROJECT_RELAY_CHARTS_RESPONSE para "${moduleFrameId}".`));
    }, timeoutMs);

    window.addEventListener('message', onMessage);

    const message: RelayChartsRequestMessage = { type: PROJECT_RELAY_CHARTS_REQUEST, requestId, moduleFrameId };
    targetWindow.postMessage(message, '*');
  });
}
