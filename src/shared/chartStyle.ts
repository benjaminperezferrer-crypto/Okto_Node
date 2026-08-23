/**
 * src/shared/chartStyle.ts
 * Sistema de personalización visual GENÉRICO de un diagrama SVG — la
 * "carrocería" del gráfico: título, tipografía, grosor de ejes/líneas de
 * referencia, tamaño de marcador, grilla y leyenda. Independiente de
 * cualquier módulo de dominio (originalmente `src/hidrogeo/chartStyle.ts`,
 * Etapa 4.5b de Hidrogeoquímica — extraído acá recién en la Etapa 10 de
 * Análisis Estructural, que es el primer módulo que lo reutiliza).
 *
 * DISTINTO del sistema de clasificación por color de datos de cada módulo
 * (p.ej. sampleColor.ts en hidrogeo, classification.ts en estructural) —
 * ese decide DE QUÉ COLOR es cada dato según un campo propio; este decide
 * cómo se ve el gráfico en sí, sin importar de qué color esté pintado cada
 * dato.
 *
 * ── Por qué la identidad de diagrama (antes `DiagramId`) NO vive acá ──
 * La versión original (hidrogeo) tenía un `DiagramId` fijo con los 6
 * nombres de diagramas de ESE módulo, hardcodeado adentro de este archivo
 * — imposible de reutilizar tal cual desde otro módulo con sus propios
 * diagramas (StereonetPlanes/RoseDiagram acá). `getDefaultChartStyleMap`/
 * `loadChartStyleMap`/`saveChartStyleMap` ahora son GENÉRICAS sobre `K
 * extends string` (la lista de ids la pasa el llamador) y la clave de
 * localStorage también la pasa el llamador — cada módulo define su propio
 * union de ids y su propia clave de storage (ver
 * src/hidrogeo/HydrogeochemistryModule.tsx y src/estructural/
 * chartStyleIds.ts para los 2 casos reales).
 */

// ─────────────────────────────────────────────────────────────────
// FUENTES
// ─────────────────────────────────────────────────────────────────

/**
 * Set corto de fuentes seguras para web (todas "web-safe", sin necesidad
 * de cargar ninguna fuente externa).
 */
export const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: 'system-ui, sans-serif',        label: 'Sans (por defecto)' },
  { value: '"Courier New", Courier, monospace', label: 'Monoespaciada (estilo HUD)' },
  { value: 'Georgia, serif',               label: 'Serif (Georgia)' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: '"Trebuchet MS", sans-serif',   label: 'Trebuchet' },
];

export const DEFAULT_FONT_FAMILY = FONT_OPTIONS[0].value; // 'system-ui, sans-serif'

// ─────────────────────────────────────────────────────────────────
// LEYENDA
// ─────────────────────────────────────────────────────────────────

export type LegendPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export interface LegendStyle {
  visible: boolean;
  position: LegendPosition;
}

/**
 * CSS de posicionamiento absoluto para una leyenda en una de las 4
 * esquinas — reutilizable por cualquier diagrama que la overlay-ee sobre
 * un contenedor `position: relative`.
 */
export function legendPositionStyle(position: LegendPosition): { position: 'absolute'; top?: number; bottom?: number; left?: number; right?: number } {
  const OFFSET = 8;
  const vertical = position.startsWith('top') ? { top: OFFSET } : { bottom: OFFSET };
  const horizontal = position.endsWith('right') ? { right: OFFSET } : { left: OFFSET };
  return { position: 'absolute', ...vertical, ...horizontal };
}

// ─────────────────────────────────────────────────────────────────
// TIPO PRINCIPAL
// ─────────────────────────────────────────────────────────────────

/**
 * Estilo "de carrocería" de UN diagrama — todo lo que no es color de datos
 * por grupo (eso sigue viviendo en el sistema de clasificación propio de
 * cada módulo).
 */
export interface ChartStyleSettings {
  /** Título mostrado sobre el diagrama. Vacío/undefined = usa el nombre por defecto de ese diagrama. */
  title?: string;
  /** Una de FONT_OPTIONS — no se valida contra la lista acá, queda para el panel de UI (ChartStyleEditor). */
  fontFamily: string;
  /** Tamaño base de la tipografía del diagrama (px) — etiquetas de eje, ticks, título. */
  fontSize: number;
  /** Grosor de ejes/líneas de referencia (px) — NO de las polilíneas/símbolos de datos, que tienen su propio estilo (color por clasificación). */
  lineThickness: number;
  /** Tamaño de marcador (radio en px) — un valor único "de carrocería" para todo el diagrama, distinto de los overrides por grupo que pueda tener un diagrama específico (ver nota de precedencia en cada diagrama que lo use). */
  pointSize: number;
  showGrid: boolean;
  legend: LegendStyle;
  /**
   * Opacidad (0-1) de los elementos de DATOS de un diagrama — nunca de la
   * grilla/marco (eso es "carrocería" fija, siempre bien visible). Campo
   * OPCIONAL agregado en el paquete de mejoras de Análisis Estructural
   * (Etapa 3): `sanitizeChartStyle()` lo completa con
   * `DEFAULT_CHART_OPACITY` si falta, así que un `ChartStyleSettings`
   * persistido ANTES de este campo (Hidrogeoquímica, o cualquier
   * localStorage viejo) sigue cargando sin romperse — llega como
   * `undefined`, se sanea a 1, cero cambio visual.
   * StereonetPlanes.tsx (Etapa 3) es hoy el único diagrama que
   * efectivamente LEE este campo (polos/planos/líneas) — está disponible
   * para cualquier otro diagrama vía el mismo ChartStyleEditor
   * compartido, pero no tiene efecto ahí hasta que ese diagrama decida
   * usarlo, igual criterio que cualquier otro campo de este tipo.
   */
  opacity?: number;
  /**
   * true = cada medición angular se cuenta en su propio sector Y en el
   * opuesto (v+180°, patrón "bowtie") al binnear — false = conteo crudo,
   * cada medición cuenta UNA sola vez, sin espejo. Campo OPCIONAL
   * agregado en el paquete de mejoras de Análisis Estructural (toggle
   * "Simetría 180°"): `sanitizeChartStyle()` lo completa con
   * `DEFAULT_PLANE_SYMMETRIC` (true) si falta, así que un
   * `ChartStyleSettings` persistido ANTES de este campo sigue cargando
   * sin romperse — llega como `undefined`, se sanea a true, MISMO
   * comportamiento que tenía el diagrama antes de que este campo
   * existiera (pedido explícito: "cambio de opción, no de comportamiento
   * por defecto"). RoseDiagram.tsx es hoy el único diagrama que
   * efectivamente LEE este campo (para el binning de PLANOS/azimut
   * específicamente — nunca para líneas/trend, que son no-simétricas por
   * diseño desde la Etapa 7 y no tienen un control acá) — no se agregó al
   * panel ChartStyleEditor.tsx compartido a propósito (a diferencia de
   * `opacity`): "simetría angular" no tiene sentido en los diagramas de
   * Hidrogeoquímica/StereonetPlanes que también usan ese panel, así que
   * el control vive directo en RoseDiagram.tsx en vez de ensuciar la UI
   * genérica de los demás diagramas con un checkbox sin efecto ahí.
   */
  planeSymmetric?: boolean;
}

// ─────────────────────────────────────────────────────────────────
// DEFAULTS
// ─────────────────────────────────────────────────────────────────

export const DEFAULT_CHART_FONT_SIZE = 12;
export const DEFAULT_CHART_LINE_THICKNESS = 1;
export const DEFAULT_CHART_POINT_SIZE = 3.2;
export const DEFAULT_LEGEND_POSITION: LegendPosition = 'top-right';
/**
 * 1 = totalmente opaco, idéntico al comportamiento de siempre (antes de
 * que existiera este campo) — ver JSDoc de `ChartStyleSettings.opacity`
 * para el porqué de no elegir un default más bajo acá pese a que
 * StereonetPlanes.tsx se beneficia de valores bajos con datasets densos:
 * el valor ÓPTIMO depende de cuántas mediciones tenga el proyecto (algo
 * que este archivo, genérico y sin datos, no puede saber) — 1 es
 * predecible (ningún diagrama cambia de aspecto solo por cuántos datos
 * carga) y ya es persistido por proyecto, así que ajustarlo una vez
 * alcanza en vez de adivinar un heurístico.
 */
export const DEFAULT_CHART_OPACITY = 1;
/** true = comportamiento histórico del diagrama de rosetas (patrón "bowtie") — ver JSDoc de ChartStyleSettings.planeSymmetric para el porqué de no elegir false acá. */
export const DEFAULT_PLANE_SYMMETRIC = true;

/** Un ChartStyleSettings con los valores por defecto — objeto NUEVO en cada llamada (nunca una referencia compartida), para que dos diagramas puedan editar su copia sin pisarse. */
export function getDefaultChartStyle(): ChartStyleSettings {
  return {
    title: '',
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: DEFAULT_CHART_FONT_SIZE,
    lineThickness: DEFAULT_CHART_LINE_THICKNESS,
    pointSize: DEFAULT_CHART_POINT_SIZE,
    showGrid: true,
    legend: { visible: true, position: DEFAULT_LEGEND_POSITION },
    opacity: DEFAULT_CHART_OPACITY,
    planeSymmetric: DEFAULT_PLANE_SYMMETRIC,
  };
}

/** Un mapa completo {id -> ChartStyleSettings default} para la lista de ids que pase el llamador (los diagramas de SU módulo). */
export function getDefaultChartStyleMap<K extends string>(ids: readonly K[]): Record<K, ChartStyleSettings> {
  return Object.fromEntries(ids.map((id) => [id, getDefaultChartStyle()])) as Record<K, ChartStyleSettings>;
}

// ─────────────────────────────────────────────────────────────────
// PERSISTENCIA
// ─────────────────────────────────────────────────────────────────

function isLegendPosition(v: unknown): v is LegendPosition {
  return v === 'top-right' || v === 'top-left' || v === 'bottom-right' || v === 'bottom-left';
}

function sanitizeChartStyle(fallback: ChartStyleSettings, raw: unknown): ChartStyleSettings {
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Partial<ChartStyleSettings> & { legend?: Partial<LegendStyle> };
  return {
    title: typeof r.title === 'string' ? r.title : fallback.title,
    fontFamily: typeof r.fontFamily === 'string' ? r.fontFamily : fallback.fontFamily,
    fontSize: typeof r.fontSize === 'number' && r.fontSize > 0 ? r.fontSize : fallback.fontSize,
    lineThickness: typeof r.lineThickness === 'number' && r.lineThickness > 0 ? r.lineThickness : fallback.lineThickness,
    pointSize: typeof r.pointSize === 'number' && r.pointSize > 0 ? r.pointSize : fallback.pointSize,
    showGrid: typeof r.showGrid === 'boolean' ? r.showGrid : fallback.showGrid,
    legend: {
      visible: typeof r.legend?.visible === 'boolean' ? r.legend.visible : fallback.legend.visible,
      position: isLegendPosition(r.legend?.position) ? r.legend.position : fallback.legend.position,
    },
    // `raw.opacity` puede venir undefined (ChartStyleSettings persistido ANTES de
    // este campo, p.ej. Hidrogeoquímica) — cae a fallback.opacity (DEFAULT_CHART_OPACITY=1
    // si tampoco había default previo), sin romper ni requerir migración.
    opacity: typeof r.opacity === 'number' && r.opacity >= 0 && r.opacity <= 1 ? r.opacity : (fallback.opacity ?? DEFAULT_CHART_OPACITY),
    // `raw.planeSymmetric` puede venir undefined (persistido ANTES de este campo) —
    // cae a fallback.planeSymmetric (DEFAULT_PLANE_SYMMETRIC=true si tampoco había
    // default previo), preservando el comportamiento de siempre sin romper nada.
    planeSymmetric: typeof r.planeSymmetric === 'boolean' ? r.planeSymmetric : (fallback.planeSymmetric ?? DEFAULT_PLANE_SYMMETRIC),
  };
}

/**
 * Lee la config guardada bajo `storageKey`; si no hay nada, está
 * corrupta, o le faltan ids (ej. un diagrama nuevo que no existía cuando
 * se guardó), completa con defaults — nunca lanza.
 */
export function loadChartStyleMap<K extends string>(storageKey: string, ids: readonly K[]): Record<K, ChartStyleSettings> {
  const defaults = getDefaultChartStyleMap(ids);
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;
    const result = { ...defaults };
    for (const id of ids) {
      result[id] = sanitizeChartStyle(defaults[id], (parsed as Record<string, unknown>)[id]);
    }
    return result;
  } catch {
    // localStorage no disponible o JSON corrupto: usar defaults.
    return defaults;
  }
}

/** Persiste la config bajo `storageKey`; falla en silencio si localStorage no está disponible o está lleno. */
export function saveChartStyleMap<K extends string>(storageKey: string, settings: Record<K, ChartStyleSettings>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    // No persiste, pero no debe romper la UI por esto.
  }
}
