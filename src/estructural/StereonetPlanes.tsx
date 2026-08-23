/**
 * src/estructural/StereonetPlanes.tsx
 * Etapa 5 — círculos máximos + polos de PlanarMeasurement.
 * Etapa 6 — agrega datos LINEALES (LinearMeasurement) sobre la misma
 * vista, con su propio símbolo (diamante) y tooltip, usando projectLine()
 * de stereonet.ts y el mismo patrón children(ctx). El nombre del archivo
 * quedó de la Etapa 5 ("Planes"); ya cubre polos+planos+líneas — no se
 * renombra por ahora porque no hay ningún otro archivo importándolo
 * todavía (no hay costo de romper nada), pero es candidato a
 * `StereonetDiagram.tsx` si una etapa futura le agrega más capas.
 *
 * ── Decisión: un solo componente con toggles de CAPA independientes,
 *    no un modo exclusivo (poles|planes|both) como en la Etapa 5 ──────
 * Con 3 capas (polos, planos, líneas) un selector exclusivo ya no
 * alcanza para cubrir todas las combinaciones útiles (p.ej. "planos +
 * líneas, sin polos"). Se reemplaza `mode` por 3 checkboxes
 * independientes (`showPoles`/`showPlanes`/`showLines`, todas activas
 * por default) — sigue siendo un solo StereonetBase compartido, mismo
 * motivo que en la Etapa 5 (no se puede tener 2 estereogramas separados
 * y superponerlos).
 *
 * ── Decisión: SÍ se muestran juntos los 2 orígenes de datos lineales ──
 * (a) LinearMeasurement[] importados directo con su propio trend/plunge.
 * (b) Lineaciones derivadas de un PlanarMeasurement con rake definido,
 *     vía planeRakeToTrendPlunge() (Etapa 1), calculado ON-THE-FLY (no
 *     se duplica en el modelo de datos — se recalcula en cada render a
 *     partir del PlanarMeasurement original).
 * Geológicamente ambas son solo "líneas en el estereograma" — no hay
 * razón para separarlas en 2 vistas. El costo es bajo: es solo una
 * fuente más de puntos con el mismo símbolo.
 *
 * `deriveRakeLines()` (incluida su limitación conocida sobre
 * `direccionRake` como texto libre) vive en structuralTypes.ts, no acá —
 * se extrajo para que RoseDiagram.tsx (Etapa 7) la reutilice sin
 * duplicar la regla de "cuándo se puede derivar una línea desde un
 * rake".
 *
 * `azimut`/`dip` (planos) y `trend`/`plunge` (líneas) se usan directo,
 * sin conversión de rumbo — igual que en StereonetPoles.tsx.
 *
 * Etapa 8 — agrega el contorneo de densidad de Kamb como una capa MÁS
 * (`showKamb`), con el mismo patrón de toggle que las demás — pero
 * default APAGADA ("una opción activable, no siempre visible", pedido
 * explícito del enunciado), a diferencia de polos/planos/líneas que
 * arrancan visibles. El cálculo (computeKambDensity, kambDensity.ts) se
 * hace sobre los POLOS de `measurements` — el método de Kamb es, acá,
 * contorneo de densidad de polos de planos, no de líneas — y se
 * recalcula en cada render con el `ctx.projection`/`ctx.radius`
 * activos, igual que el resto de las capas.
 *
 * Etapa 9 — clasificación por color (`getColor`) y filtro combinable.
 * ESTE componente NO implementa el filtro: recibe `measurements`/
 * `linearMeasurements` YA FILTRADOS por el llamador (applyFilter() de
 * classification.ts) — simplemente dibuja lo que le pasan, como
 * siempre. `getColor` es la única pieza nueva acá: un lookup opcional
 * `(item) => color` (típicamente construido con getClassificationColors()
 * + getFieldValue()) que, si se pasa, reemplaza los colores planos
 * (poleColor/planeColor/lineColor) por el color de clasificación de cada
 * ítem individual — poles/planes reciben el PlanarMeasurement, líneas
 * reciben el RenderableLine ya resuelto (mismo objeto que también trae
 * zona/campaña para que classification.ts pueda leerlos).
 *
 * Etapa 10 — conecta ChartStyleEditor/ExportButton (src/shared/), ya
 * usados en Hidrogeoquímica, recién extraídos ahí a src/shared/ en ESTA
 * etapa (no estaban en src/shared/ todavía pese a lo planeado — ver
 * commit de la Etapa 10). Estado propio (no viene de un contenedor
 * externo — no existe uno para este módulo todavía), persistido con su
 * propia clave de storage (chartStyleIds.ts).
 *
 * ── Precedencia color específico vs. genérico — MISMA que Piper ──────
 * ChartStyleSettings NO tiene un campo de color genérico (solo
 * título/fuente/grosor/tamaño de punto/grilla/leyenda) — por diseño, ver
 * chartStyle.ts. La precedencia "específico le gana a genérico" ya
 * estaba resuelta desde la Etapa 9: `getColor(item)` (específico, por
 * clasificación) SIEMPRE le gana a poleColor/planeColor/lineColor
 * (genéricos) cuando está presente — igual que PiperStyleSettings.
 * points[grupo].size le gana a ChartStyleSettings.pointSize genérico en
 * Piper. Conectar el editor acá NO CAMBIA esa precedencia porque el
 * editor no toca poleColor/planeColor/lineColor ni getColor — solo
 * agrega pointSize (tamaño, sin conflicto: este módulo no tiene ningún
 * override de tamaño POR GRUPO análogo a points[grupo].size, así que
 * pointSize se aplica siempre sin competencia).
 */

import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import StereonetBase, { StereonetRenderContext } from './StereonetBase';
import { projectPole, projectGreatCircle, projectLine, computeMeanPole, computeFisherStats, projectSmallCircle } from './stereonet';
import { deriveRakeLines, normalizeAzimuth } from './structuralTypes';
import type { PlanarMeasurement, LinearMeasurement, RenderableLine } from './structuralTypes';
import { computeKambDensity, sigmaToBand, buildKambField, sampleKambFieldBilinear, KambOptions, KambField } from './kambDensity';
import { shapePolygonPoints } from './symbolAssignment';
import type { SymbolAssignment } from './symbolAssignment';
import { binIndexOf } from './roseBinning';
import type { CrossHighlightBus, HighlightState } from './crossHighlight';
import { normalizeRect, hitTestRect } from './rectSelection';
import type { ComparisonGroupInfo } from './ClassificationFilterPanel';
import { ChartStyleSettings } from '../shared/chartStyle';
import { SvgLegend, LegendEntry, measureLegendHeight } from './SvgLegend';
import { useResponsiveSquareSize } from './useResponsiveSquareSize';
import { useImperativeZoomPan } from './useImperativeZoomPan';

/** Paleta secuencial fija para las bandas de σ del contorneo de Kamb (banda 0 = [2σ,4σ), banda 1 = [4σ,6σ), etc. — se repite el último color para bandas más altas que la paleta). */
const KAMB_BAND_COLORS = ['#fef08a', '#fdba74', '#fb923c', '#f87171', '#dc2626', '#7f1d1d'];
/** Mismos colores que KAMB_BAND_COLORS, pre-parseados a [r,g,b] — evita reparsear el string hex por cada píxel del raster (renderKambFieldToDataUrl corre en un loop de hasta ~230k píxeles). */
const KAMB_BAND_RGB: [number, number, number][] = KAMB_BAND_COLORS.map((hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
});

/**
 * Lado máximo (px) del canvas de rasterización del contorneo de Kamb —
 * acota el costo del loop de píxeles + toDataURL() en pantallas anchas
 * (donde `radius` puede superar los 300-400px), sin sacrificar suavidad
 * perceptible: ya es MUCHO más fino que la grilla de cómputo (60×60,
 * celdas de ~6-11px) que reemplaza. Medido con el dataset real de ~4000
 * mediciones — ver notas de rendimiento en el mensaje de la etapa.
 */
const KAMB_RENDER_MAX_DIM = 480;

/**
 * Rasteriza el campo de Kamb ya calculado (`field`, gridSize=60 fijo, sin
 * tocar) a un PNG embebible como `<image>`, muestreando `sampleKambFieldBilinear()`
 * a una resolución de RENDER mayor (`KAMB_RENDER_MAX_DIM`) — Opción 2
 * confirmada con el usuario: el suavizado ocurre acá, NUNCA recalculando
 * computeKambDensity() a mayor gridSize (ese costo, ~484ms medido con el
 * dataset real, no cambia). Devuelve `null` si no hay nada que dibujar
 * (0 mediciones, `field.gridSize === 0`).
 */
function renderKambFieldToDataUrl(field: KambField, opacity: number): string | null {
  if (field.gridSize === 0) return null;
  const { radius } = field;
  const dim = Math.max(1, Math.min(Math.round(radius * 2), KAMB_RENDER_MAX_DIM));
  const canvas = document.createElement('canvas');
  canvas.width = dim;
  canvas.height = dim;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return null;

  const img = ctx2d.createImageData(dim, dim);
  const data = img.data;
  const alphaByte = Math.round(Math.max(0, Math.min(1, opacity)) * 255);
  const pxToMath = (2 * radius) / dim;

  for (let py = 0; py < dim; py++) {
    // Norte arriba (py=0 -> mathY=+radius), misma convención que toScreen() de StereonetBase.
    const mathY = radius - (py + 0.5) * pxToMath;
    for (let px = 0; px < dim; px++) {
      const mathX = (px + 0.5) * pxToMath - radius;
      const sigma = sampleKambFieldBilinear(field, mathX, mathY);
      if (sigma === null) continue; // queda transparente (alpha=0 por default de ImageData)
      const band = sigmaToBand(sigma);
      if (band < 0) continue;
      const [r, g, b] = KAMB_BAND_RGB[Math.min(band, KAMB_BAND_RGB.length - 1)];
      const idx = (py * dim + px) * 4;
      data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = alphaByte;
    }
  }
  ctx2d.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Barra de escala de σ del contorneo de Kamb — un swatch por banda de KAMB_BAND_COLORS con su umbral inferior debajo; la última banda es abierta ("+"). Visible junto al toggle "Densidad (Kamb)" solo cuando esa capa está activa. */
export function KambScaleBar() {
  return (
    <div
      role="img"
      aria-label="Escala de densidad de Kamb, en desviaciones estándar (σ) sobre el fondo aleatorio esperado"
      title="Densidad de Kamb: σ sobre el fondo aleatorio esperado"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginLeft: 6 }}
    >
      <div style={{ display: 'flex' }}>
        {KAMB_BAND_COLORS.map((c, i) => (
          <div key={i} style={{ width: 18, height: 12, background: c, border: '1px solid rgba(255,255,255,.15)' }} />
        ))}
      </div>
      <div style={{ display: 'flex' }}>
        {KAMB_BAND_COLORS.map((_, i) => (
          <div key={i} style={{ width: 18, fontSize: 9.5, textAlign: 'center', color: 'var(--hud-text-dim, #94a3b8)' }}>
            {2 + 2 * i}{i === KAMB_BAND_COLORS.length - 1 ? '+' : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Marcador de un dato individual (polo o línea) que sabe dibujarse como
 * cualquiera de las SHAPE_KINDS de symbolAssignment.ts, ADEMÁS del color
 * ya existente — usado SOLO cuando `getSymbol` está definido (toggle
 * "Símbolos por tipo" en ClassificationFilterPanel.tsx, apagado por
 * default). Sin `getSymbol`, polos/líneas se siguen dibujando con su
 * `<circle>`/`<rect>` de siempre (ver JSX de abajo) — cero cambio en el
 * caso por default.
 */
function ShapeMarker({
  shape, dashed, cx, cy, size, fill, testId, onMouseEnter, onMouseMove, onMouseLeave, elementRef,
}: {
  shape: SymbolAssignment['shape'];
  dashed: boolean;
  cx: number;
  cy: number;
  size: number;
  fill: string;
  testId: string;
  onMouseEnter: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
  /** Ref opcional al nodo DOM renderizado (circle o polygon) — usado por el resaltado cruzado (crossHighlight.ts) para registrar el elemento bajo su bin angular sin pasar por React state. */
  elementRef?: (el: SVGElement | null) => void;
}) {
  const common = {
    fill, stroke: '#0f172a', strokeWidth: 1,
    strokeDasharray: dashed ? '2,1.5' : undefined,
    'data-testid': testId,
    style: { cursor: 'default' as const },
    onMouseEnter, onMouseMove, onMouseLeave,
    ref: elementRef,
  };
  if (shape === 'circle') return <circle cx={cx} cy={cy} r={size} {...common} />;
  return <polygon points={shapePolygonPoints(shape, cx, cy, size)!} {...common} />;
}

/**
 * Familia estructural nombrada (paquete de mejoras — identificación de
 * familias) — un subconjunto de `measurements` aislado por selección
 * rectangular, guardado por id de medición (no por referencia al objeto,
 * que puede recrearse en cada import/filtro). Etapa de persistencia final
 * del paquete de mejoras: viaja en AnalisisEstructuralProjectState vía
 * `StereonetPlanesHandle.getFamilies()/loadFamilies()` (antes era estado
 * de SESIÓN puro, sin ningún ref expuesto desde este componente).
 */
export interface StructuralFamily {
  id: string;
  name: string;
  measurementIds: string[];
  color: string;
  visible: boolean;
}

/** Toggles de despliegue de ESTE diagrama — etapa de persistencia final del paquete de mejoras (antes SOLO useState, ver JSDoc de cada `useState` correspondiente). */
export interface StereonetDisplayState {
  showPoles: boolean;
  showPlanes: boolean;
  showLines: boolean;
  showKamb: boolean;
  showMeanPole: boolean;
  showConfidenceCone: boolean;
}

export interface StereonetPlanesHandle {
  /** Familias estructurales guardadas (identificación por selección rectangular) — etapa de persistencia final del paquete de mejoras (antes SOLO useState, ver JSDoc de `StructuralFamily`). */
  getFamilies: () => StructuralFamily[];
  loadFamilies: (families: StructuralFamily[]) => void;
  /**
   * Escribe la opacidad de la capa de datos DIRECTO en el DOM (sin re-render),
   * para el arrastre en vivo del slider de opacidad — el editor de estilo vive
   * en la columna izquierda (EstructuralWorkspace.tsx) desde la reorganización
   * visual, pero el `<g>` de datos vive acá; ver el JSDoc de opacidad en el
   * padre para el debounce del commit real al estado. Ver también el `<g
   * ref={dataOpacityRef}>` más abajo.
   */
  setLiveOpacity: (opacity: number) => void;
}

/** Paleta cíclica para familias — deliberadamente DISTINTA de PALETTE de classification.ts (colorean cosas ortogonales: tipo/cinemática/zona/campaña vs. una selección manual del usuario; reusar la misma paleta confundiría "coloreado por clasificación" con "familia guardada" si ambos están activos a la vez). */
const FAMILY_PALETTE = ['#f97316', '#a855f7', '#14b8a6', '#eab308', '#ec4899', '#84cc16', '#38bdf8', '#f43f5e'];

const DEFAULT_TITLE = 'Estereograma';

export interface StereonetPlanesProps {
  measurements: PlanarMeasurement[];
  /** Datos lineales importados directo (origen "a") — opcional. */
  linearMeasurements?: LinearMeasurement[];
  /** Lado del SVG cuadrado, en px. Si se omite (caso normal dentro de AnalisisEstructuralModule.tsx), se mide automáticamente el ancho de la columna vía ResizeObserver (useResponsiveSquareSize.ts) — responsivo. Pasar un valor explícito desactiva esa medición y fija el tamaño, como antes. */
  size?: number;
  defaultProjection?: 'schmidt' | 'wulff';
  /**
   * Toggles de despliegue — CONTROLADOS por el padre (EstructuralWorkspace.tsx)
   * desde la etapa de reorganización visual. Los básicos (polos/planos/líneas)
   * se siguen mostrando en la barra de herramientas de este componente; los
   * avanzados (Kamb/plano-polo medio/cono) se muestran en la columna izquierda,
   * pero TODOS leen/escriben este mismo estado vía `display`/`onDisplayChange`.
   */
  display: StereonetDisplayState;
  onDisplayChange: (next: StereonetDisplayState) => void;
  /** Nivel de confianza del cono (0-1) — default 0.95 (95%), ver JSDoc de computeFisherStats() en stereonet.ts. */
  fisherConfidenceLevel?: number;
  /**
   * Modo comparación (paquete de mejoras) — presente SOLO cuando
   * ClassificationFilterPanel.tsx tiene el modo comparación activo.
   * Cambia 3 cosas acá, todas documentadas junto a su bloque de código:
   *  1. El toggle "Densidad (Kamb)" se OCULTA (un contorneo sobre 2
   *     grupos con colores fijos distintos no tiene una lectura clara de
   *     "densidad de qué").
   *  2. "Plano/polo medio" y "Cono de confianza", si están activos,
   *     dibujan UNO POR GRUPO (reutilizando computeMeanPole/
   *     computeFisherStats POR SEPARADO para cada `measurements` de acá
   *     — nunca un promedio combinado A+B) en el color de ESE grupo, en
   *     vez de un único overlay ámbar sobre `measurements` completo.
   *  3. El modo selección (identificación de familias) y la lista de
   *     familias guardadas se OCULTAN — simplificación deliberada: una
   *     familia es un 3er sistema de resaltado que competiría
   *     visualmente con los 2 colores fijos del modo comparación, y
   *     conceptualmente "una familia dentro de una comparación de 2
   *     grupos" no es un flujo de trabajo que el enunciado haya pedido.
   *     Los datos de las familias YA guardadas no se pierden — vuelven a
   *     verse en cuanto se apaga el modo comparación.
   * El coloreado de los marcadores en sí (polos/planos/líneas) NO
   * necesita lógica nueva acá — ya le llega resuelto vía `getColor`
   * (ClassificationFilterPanel.tsx construye esa función para que
   * devuelva el color fijo de A o B directamente).
   */
  comparisonGroups?: ComparisonGroupInfo[];
  poleColor?: string;
  planeColor?: string;
  lineColor?: string;
  /** Parámetros de computeKambDensity() — ver kambDensity.ts. Defaults confirmados con el usuario: K=3, gridSize=60. */
  kambOptions?: KambOptions;
  /** Color por clasificación (Etapa 9) — si se pasa, reemplaza poleColor/planeColor/lineColor para ese ítem. Ver JSDoc de archivo. */
  getColor?: (item: PlanarMeasurement | RenderableLine) => string;
  /**
   * Forma por clasificación (paquete de mejoras — símbolos por tipo,
   * ADEMÁS del color, nunca en reemplazo) — si se pasa, POLOS y LÍNEAS se
   * dibujan con la forma que indique para cada ítem (symbolAssignment.ts)
   * en vez de su `<circle>`/`<rect>` fijo de siempre. PLANOS no la usan
   * (son círculos máximos — líneas, no marcadores puntuales). Sin esto
   * (undefined, el caso por default), cero cambio de comportamiento.
   */
  getSymbol?: (item: PlanarMeasurement | RenderableLine) => SymbolAssignment;
  /** Entradas de leyenda (Etapa 10) — típicamente Object.entries(colors) de classification.ts cuando hay clasificación activa. Sin esto, se arma una leyenda por defecto (Polo/Plano/Línea) con los colores planos. */
  legendEntries?: LegendEntry[];
  /**
   * Estilo del gráfico — CONTROLADO por el padre (EstructuralWorkspace.tsx)
   * desde la etapa de reorganización visual: el estado y su persistencia en
   * localStorage viven allá, y el editor de estilo se renderiza en la columna
   * izquierda, no debajo del gráfico. Este componente solo lee `chartStyle`
   * para dibujar y notifica cambios vía `onChartStyleChange`.
   */
  chartStyle: ChartStyleSettings;
  onChartStyleChange: (patch: Partial<ChartStyleSettings>) => void;
  /**
   * Resaltado cruzado con RoseDiagram.tsx (paquete de mejoras — ver
   * crossHighlight.ts) — bus compartido, creado UNA VEZ por el
   * contenedor común (AnalisisEstructuralModule.tsx) y pasado a ambos
   * diagramas. Sin esto (undefined), cero cambio de comportamiento — el
   * hover sigue funcionando solo para el tooltip local, como siempre.
   */
  crossHighlightBus?: CrossHighlightBus;
  /** Tamaño de sector angular (grados) usado por RoseDiagram.tsx para binnear — DEBE ser el mismo valor que se le pasa a `<RoseDiagram binSizeDeg={...}>` para que el resaltado cruzado apunte al bin correcto. Default 10 (mismo default que RoseDiagram.tsx). Sin efecto si `crossHighlightBus` no está definido. */
  binSizeDeg?: number;
}

interface HoverState {
  id: string;
  kind: 'pole' | 'plane' | 'line' | 'meanPole';
  title: string;
  cinemática?: string;
  detail: string; // "Az X° / Dip Y°" o "Trend X° / Plunge Y°", ya formateado
  clientX: number;
  clientY: number;
}

const StereonetPlanes = forwardRef<StereonetPlanesHandle, StereonetPlanesProps>(function StereonetPlanes({
  measurements,
  linearMeasurements = [],
  size: fixedSize,
  defaultProjection = 'schmidt',
  display,
  onDisplayChange,
  fisherConfidenceLevel = 0.95,
  comparisonGroups,
  poleColor = '#2563eb',
  planeColor = '#dc2626',
  lineColor = '#16a34a',
  kambOptions,
  getColor,
  getSymbol,
  legendEntries,
  chartStyle,
  onChartStyleChange,
  crossHighlightBus,
  binSizeDeg = 10,
}: StereonetPlanesProps, ref) {
  // Toggles de despliegue: controlados por el padre. Se leen como locales
  // (así todo el render de abajo queda igual) y se escriben vía onDisplayChange.
  const { showPoles, showPlanes, showLines, showKamb, showMeanPole, showConfidenceCone } = display;
  const [hover, setHover] = useState<HoverState | null>(null);

  // Identificación de familias estructurales (paquete de mejoras) — ver
  // JSDoc de StructuralFamily arriba y del useEffect de selección más
  // abajo (junto a useImperativeZoomPan).
  const [selectionMode, setSelectionMode] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<{ ids: string[]; measurements: PlanarMeasurement[] } | null>(null);
  const [familyNameInput, setFamilyNameInput] = useState('');
  const [families, setFamilies] = useState<StructuralFamily[]>([]);

  useImperativeHandle(ref, () => ({
    getFamilies: () => families,
    loadFamilies: (loaded) => setFamilies(loaded),
    setLiveOpacity: (opacity) => { dataOpacityRef.current?.setAttribute('opacity', String(opacity)); },
  }), [families]);

  // Resaltado cruzado (crossHighlight.ts) — Maps reconstruidos en CADA
  // render (baratos, O(mediciones visibles)) que agrupan los nodos DOM
  // de polos/planos ('planar') y líneas ('linear') por bin angular, para
  // que el efecto de suscripción de abajo pueda aplicar/quitar la clase
  // de resaltado en O(elementos de ese bin) sin volver a recorrer los
  // ~4000 elementos ni pasar por setState. `useRef` (no una variable
  // local del render) porque el listener del bus, registrado en un
  // useEffect con cleanup normal, necesita leer el valor MÁS RECIENTE en
  // el momento del evento, no el que existía cuando se suscribió.
  const planarBinRefs = useRef(new Map<number, SVGElement[]>());
  const linearBinRefs = useRef(new Map<number, SVGElement[]>());
  planarBinRefs.current = new Map();
  linearBinRefs.current = new Map();
  function registerBin(map: React.RefObject<Map<number, SVGElement[]>>, bin: number, el: SVGElement | null) {
    if (!el) return;
    const arr = map.current.get(bin) ?? [];
    arr.push(el);
    map.current.set(bin, arr);
  }

  useEffect(() => {
    if (!crossHighlightBus) return;
    let appliedEls: SVGElement[] = [];
    const unsubscribe = crossHighlightBus.subscribe((state: HighlightState | null) => {
      for (const el of appliedEls) el.classList.remove('xhl-active');
      appliedEls = [];
      if (!state) return;
      const map = state.kind === 'planar' ? planarBinRefs.current : linearBinRefs.current;
      for (const bin of state.bins) {
        const els = map.get(bin);
        if (!els) continue;
        for (const el of els) {
          el.classList.add('xhl-active');
          appliedEls.push(el);
        }
      }
    });
    return unsubscribe;
  }, [crossHighlightBus]);

  // `<g>` de la capa de datos — su opacidad se escribe DIRECTO en el DOM
  // durante el arrastre del slider (vía el handle setLiveOpacity, ver arriba),
  // sin re-render; el commit real al estado (con debounce) vive en el padre.
  const dataOpacityRef = useRef<SVGGElement>(null);

  const { ref: columnRef, size } = useResponsiveSquareSize(fixedSize);
  const zoomGroupRef = useRef<SVGGElement>(null);
  // enabled:!selectionMode — zoom/paneo y selección rectangular comparten
  // el mismo gesto mousedown+mousemove+mouseup sobre el mismo <svg>, no
  // pueden convivir activos a la vez (ver JSDoc de UseImperativeZoomPanOptions.enabled).
  const { svgRef, transformString, isZoomed, reset: resetZoom } = useImperativeZoomPan([zoomGroupRef], { enabled: !selectionMode });

  /**
   * Modo selección (identificación de familias estructurales) — activa/
   * desactiva el gesto de arrastre rectangular. Al ENTRAR se resetea el
   * zoom/paneo a la vista completa: el hit-test de la selección compara
   * la posición del mouse (convertida a coordenadas de contenido del SVG
   * vía getScreenCTM) directo contra `ctx.toScreen(...)` de cada dato —
   * ambos viven en el MISMO espacio de coordenadas solo si el `<g>` de
   * zoom está en transform identidad; en vez de invertir un zoom/paneo
   * arbitrario en cada hit-test (matemática extra, más superficie de
   * bugs para una interacción que de todos modos empieza fresca), se
   * simplifica reseteando la vista al entrar — el usuario va a encuadrar
   * la selección de cero de todos modos.
   */
  function toggleSelectionMode() {
    setSelectionMode((prev) => {
      const next = !prev;
      if (next) resetZoom();
      return next;
    });
    setPendingSelection(null); // descarta cualquier selección pendiente sin guardar al cambiar de modo
  }

  // ctxRef/measurementsRef: la ÚLTIMA StereonetRenderContext/measurements
  // de render, cacheados en un ref (asignación simple durante el render —
  // no un hook, mismo patrón que otros refs "última foto" de este
  // archivo) para que el listener de mouseup (registrado en un useEffect
  // que NO depende de measurements/ctx, para no re-suscribirse en cada
  // render) pueda leer el valor más reciente en el momento del evento.
  const ctxRef = useRef<StereonetRenderContext | null>(null);
  const measurementsRef = useRef(measurements);
  measurementsRef.current = measurements;
  const selectionRectRef = useRef<SVGRectElement>(null);

  useEffect(() => {
    if (!selectionMode) return undefined;
    const svg = svgRef.current;
    if (!svg) return undefined;

    let dragging = false;
    let startPt = { x: 0, y: 0 };

    // Misma técnica que clientToSvgPoint() de useImperativeZoomPan.ts —
    // convierte un punto de pantalla al espacio de coordenadas del SVG
    // (viewBox), que con el zoom reseteado a identidad (ver
    // toggleSelectionMode) coincide exactamente con el espacio que
    // produce ctx.toScreen().
    function clientToContentPoint(clientX: number, clientY: number): { x: number; y: number } {
      const svgEl = svg as SVGSVGElement & { createSVGPoint: () => DOMPoint };
      const pt = svgEl.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svgEl.getScreenCTM();
      if (!ctm) return { x: 0, y: 0 };
      const p = pt.matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    }

    function updateLiveRect(p1: { x: number; y: number }, p2: { x: number; y: number }) {
      const rect = selectionRectRef.current;
      if (!rect) return;
      const r = normalizeRect(p1, p2);
      rect.setAttribute('x', String(r.x1));
      rect.setAttribute('y', String(r.y1));
      rect.setAttribute('width', String(r.x2 - r.x1));
      rect.setAttribute('height', String(r.y2 - r.y1));
      rect.setAttribute('visibility', 'visible');
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      dragging = true;
      startPt = clientToContentPoint(e.clientX, e.clientY);
      updateLiveRect(startPt, startPt);
    }
    function onMouseMove(e: MouseEvent) {
      if (!dragging) return;
      updateLiveRect(startPt, clientToContentPoint(e.clientX, e.clientY));
    }
    function onMouseUp(e: MouseEvent) {
      if (!dragging) return;
      dragging = false;
      selectionRectRef.current?.setAttribute('visibility', 'hidden');
      const endPt = clientToContentPoint(e.clientX, e.clientY);
      const rect = normalizeRect(startPt, endPt);
      // Rectángulo degenerado (click sin arrastre real, o un arrastre
      // mínimo accidental) — se ignora, no hay "selección de área ~0".
      if (rect.x2 - rect.x1 < 3 || rect.y2 - rect.y1 < 3) return;
      const ctx = ctxRef.current;
      if (!ctx) return;
      const ids = hitTestRect(
        measurementsRef.current,
        (m) => ctx.toScreen(projectPole(m.azimut, m.dip, ctx.projection, ctx.radius)),
        rect,
      );
      if (ids.length === 0) { setPendingSelection(null); return; }
      const idSet = new Set(ids);
      setPendingSelection({ ids, measurements: measurementsRef.current.filter((m) => idSet.has(m.id)) });
      setFamilyNameInput('');
    }

    svg.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      svg.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [selectionMode]);

  function saveFamily() {
    if (!pendingSelection) return;
    const name = familyNameInput.trim() || `Familia ${families.length + 1}`;
    setFamilies((prev) => [
      ...prev,
      { id: `family-${Date.now()}-${prev.length}`, name, measurementIds: pendingSelection.ids, color: FAMILY_PALETTE[prev.length % FAMILY_PALETTE.length], visible: true },
    ]);
    setPendingSelection(null);
    setFamilyNameInput('');
  }

  // Anillos de familia OCULTOS en modo comparación (mapa vacío) — evita que
  // compitan visualmente con los 2 colores fijos de los grupos, ver JSDoc
  // de la prop comparisonGroups.
  const familyColorById = new Map<string, string>();
  if (!comparisonGroups) {
    for (const f of families) {
      if (!f.visible) continue;
      for (const id of f.measurementIds) familyColorById.set(id, f.color);
    }
  }

  const renderableLines: RenderableLine[] = [
    ...linearMeasurements.map((l) => ({ id: `lin-${l.id}`, tipo: l.tipo, trend: l.trend, plunge: l.plunge, origin: 'linear' as const })),
    ...deriveRakeLines(measurements),
  ];

  // Básicos (Etapa A de divulgación progresiva): qué capas de dato mostrar
  // — uso de altísima frecuencia, quedan SIEMPRE visibles en la barra de
  // herramientas de arriba, nunca detrás de un acordeón.
  // Básicos: escriben el estado de despliegue CONTROLADO por el padre. Los
  // toggles AVANZADOS (Kamb/plano-polo medio/cono) ya no viven acá — se
  // renderizan en la columna izquierda (EstructuralWorkspace.tsx), junto al
  // editor de estilo, leyendo/escribiendo este mismo `display`.
  const basicLayerToggles: { key: string; label: string; value: boolean; set: (v: boolean) => void }[] = [
    { key: 'poles', label: 'Polos', value: showPoles, set: (v) => onDisplayChange({ ...display, showPoles: v }) },
    { key: 'planes', label: 'Planos', value: showPlanes, set: (v) => onDisplayChange({ ...display, showPlanes: v }) },
    { key: 'lines', label: 'Líneas', value: showLines, set: (v) => onDisplayChange({ ...display, showLines: v }) },
  ];

  const effectiveLegend: LegendEntry[] = legendEntries ?? [
    ...(showPoles ? [{ label: 'Polo', color: poleColor }] : []),
    ...(showPlanes ? [{ label: 'Plano', color: planeColor }] : []),
    ...(showLines ? [{ label: 'Línea', color: lineColor }] : []),
  ];
  // Banda inferior reservada para la leyenda (etapa de reorganización visual):
  // StereonetBase agranda el <svg> hacia abajo esta altura y dibuja la leyenda
  // ahí (centrada, fuera del círculo) — ya no superpuesta sobre los polos.
  const legendBand = chartStyle.legend.visible ? measureLegendHeight(effectiveLegend, chartStyle.fontSize) : 0;

  return (
    <div ref={columnRef} style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', minWidth: 0 }}>
      {/* Resaltado cruzado (crossHighlight.ts) — clase aplicada/quitada
          imperativamente vía classList, nunca vía props de React (ver
          useEffect de suscripción arriba). CSS de clase le gana a los
          atributos de presentación (stroke/fill inline) sin necesitar
          !important. */}
      <style>{'.xhl-active { stroke: #facc15; stroke-width: 3px; filter: drop-shadow(0 0 4px rgba(250,204,21,.85)); }'}</style>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div role="group" aria-label="Capas visibles" style={{ display: 'flex', gap: 4 }}>
          {basicLayerToggles.map(({ key, label, value, set }) => (
            <button
              key={key}
              type="button"
              onClick={() => set(!value)}
              aria-pressed={value}
              className={`hud-toggle-btn${value ? ' active' : ''}`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={resetZoom}
            disabled={!isZoomed}
            title="Restablecer zoom/paneo a la vista completa (también: doble clic sobre el diagrama)"
            className="hud-toggle-btn"
          >
            ⤢ Restablecer vista
          </button>
          {/* Identificación de familias OCULTA en modo comparación — ver JSDoc de la prop comparisonGroups. */}
          {!comparisonGroups && (
            <button
              type="button"
              onClick={toggleSelectionMode}
              aria-pressed={selectionMode}
              title="Arrastrá un rectángulo sobre el estereograma para aislar un subconjunto de polos (familia estructural) — desactiva el zoom/paneo mientras está activo."
              className={`hud-toggle-btn${selectionMode ? ' active' : ''}`}
            >
              ⬚ Modo selección
            </button>
          )}
        </div>

        {!comparisonGroups && selectionMode && pendingSelection && (() => {
          const fisher = computeFisherStats(pendingSelection.measurements, fisherConfidenceLevel);
          return (
            <div className="hud-panel" style={{ padding: 10, fontSize: '.72rem', display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 420 }}>
              <div style={{ fontWeight: 700 }}>{pendingSelection.ids.length} seleccionado(s)</div>
              {fisher ? (
                <div style={{ lineHeight: 1.6 }}>
                  <div>Orientación media: {fisher.dipDirection.toFixed(0)}°/{fisher.dip.toFixed(0)}°</div>
                  <div>κ = {Number.isFinite(fisher.kappa) ? fisher.kappa.toFixed(fisher.kappa < 100 ? 1 : 0) : '∞'}</div>
                  <div>Cono de confianza ({Math.round(fisher.confidenceLevel * 100)}%): {fisher.confidenceConeDeg.toFixed(1)}°</div>
                </div>
              ) : (
                <div className="hud-empty-note">Sin dirección media significativa (se necesitan ≥2 puntos con vector resultante no nulo).</div>
              )}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="text"
                  className="hud-select"
                  placeholder={`Familia ${families.length + 1}`}
                  value={familyNameInput}
                  onChange={(e) => setFamilyNameInput(e.target.value)}
                  style={{ flex: 1 }}
                  data-testid="family-name-input"
                />
                <button type="button" className="hud-toggle-btn" onClick={saveFamily} data-testid="save-family-btn">
                  Guardar como familia
                </button>
                <button type="button" className="hud-toggle-btn" onClick={() => setPendingSelection(null)}>
                  Descartar
                </button>
              </div>
            </div>
          );
        })()}

        {!comparisonGroups && families.length > 0 && (
          <div className="hud-panel" style={{ padding: 10, fontSize: '.72rem', display: 'flex', flexDirection: 'column', gap: 4, width: '100%', maxWidth: 420 }}>
            <div className="hud-sec-label" style={{ marginTop: 0 }}>Familias estructurales</div>
            {families.map((f) => (
              <div key={f.id} data-testid={`family-row-${f.id}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
                <label className="hud-checkrow" style={{ flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={f.visible}
                    onChange={() => setFamilies((prev) => prev.map((x) => (x.id === f.id ? { ...x, visible: !x.visible } : x)))}
                  />
                  {f.name} ({f.measurementIds.length})
                </label>
                <button
                  type="button"
                  className="hud-toggle-btn"
                  title="Eliminar familia"
                  onClick={() => setFamilies((prev) => prev.filter((x) => x.id !== f.id))}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}

        <StereonetBase
          size={size}
          defaultProjection={defaultProjection}
          title={chartStyle.title || DEFAULT_TITLE}
          fontFamily={chartStyle.fontFamily}
          fontSize={chartStyle.fontSize}
          lineThicknessScale={chartStyle.lineThickness}
          showGrid={chartStyle.showGrid}
          bottomBandHeight={legendBand}
          svgRef={svgRef}
          contentGroupRef={zoomGroupRef}
          contentTransform={transformString}
          fixedOverlay={(ctx: StereonetRenderContext) => (
            chartStyle.legend.visible ? (
              <SvgLegend
                entries={effectiveLegend}
                svgWidth={ctx.width}
                top={ctx.bandTop}
                fontFamily={chartStyle.fontFamily}
                fontSize={chartStyle.fontSize}
              />
            ) : null
          )}
        >
          {(ctx: StereonetRenderContext) => (
          <g onDoubleClick={resetZoom}>
            {/* Cachea el ctx de ESTE render en un ref (identificación de familias
                estructurales) — el listener de mouseup del modo selección corre
                FUERA del ciclo de render de React y necesita el ctx.projection/
                ctx.radius/ctx.toScreen vigentes al momento del hit-test. Expresión
                (no un useEffect) porque este render-prop es un cuerpo de expresión,
                no un bloque de sentencias — se evalúa a `null` (no dibuja nada). */}
            {(ctxRef.current = ctx, null)}

            {/* Rectángulo de selección (identificación de familias) — actualizado
                imperativamente vía setAttribute en el useEffect de arriba (mismo
                patrón que el <g> de zoom), nunca vía props de React durante el
                arrastre. Oculto por default; el propio useEffect lo muestra/oculta. */}
            <rect ref={selectionRectRef} visibility="hidden" fill="rgba(250,204,21,.12)" stroke="#facc15" strokeWidth={1} strokeDasharray="4,3" style={{ pointerEvents: 'none' }} />

            {showKamb &&
              (() => {
                const poles = measurements.map((m) => ({
                  trend: normalizeAzimuth(m.azimut + 180),
                  plunge: 90 - m.dip,
                }));
                const density = computeKambDensity(poles, ctx.radius, ctx.projection, kambOptions);
                const field = buildKambField(density, ctx.radius);
                const dataUrl = renderKambFieldToDataUrl(field, 0.65);
                if (!dataUrl) return null;
                return (
                  <image
                    href={dataUrl}
                    x={ctx.cx - ctx.radius} y={ctx.cy - ctx.radius}
                    width={ctx.radius * 2} height={ctx.radius * 2}
                    style={{ pointerEvents: 'none' }}
                  />
                );
              })()}

            {/* Opacidad ajustable (Etapa 3) — SOLO polos/planos/líneas, nunca la
                grilla/marco (StereonetBase.tsx) ni el contorneo de Kamb (arriba,
                ya tiene su propia semántica de opacidad por banda de σ). */}
            <g ref={dataOpacityRef} opacity={chartStyle.opacity ?? 1}>
            {showPlanes &&
              measurements.map((m) => {
                const pts = projectGreatCircle(m.azimut, m.dip, ctx.projection, ctx.radius).map((p) => ctx.toScreen(p));
                const pointsAttr = pts.map((p) => `${p.x},${p.y}`).join(' ');
                const id = `plane-${m.id}`;
                const ownBin = binIndexOf(m.azimut, binSizeDeg);
                const oppBin = binIndexOf(m.azimut + 180, binSizeDeg);
                const enter = (e: React.MouseEvent) => {
                  setHover({
                    id, kind: 'plane', title: `${m.tipo} (plano)`, cinemática: m.cinemática,
                    detail: `Az ${m.azimut.toFixed(0)}° / Dip ${m.dip.toFixed(0)}°`,
                    clientX: e.clientX, clientY: e.clientY,
                  });
                  crossHighlightBus?.setHighlight({ kind: 'planar', bins: [ownBin, oppBin] });
                };
                const move = (e: React.MouseEvent) => setHover((h) => (h && h.id === id ? { ...h, clientX: e.clientX, clientY: e.clientY } : h));
                const leave = () => {
                  setHover((h) => (h?.id === id ? null : h));
                  crossHighlightBus?.setHighlight(null);
                };
                return (
                  <g key={id}>
                    {/* Trazo grueso invisible: área de hover más generosa que el trazo visible fino. */}
                    <polyline
                      points={pointsAttr} fill="none" stroke="transparent" strokeWidth={14}
                      style={{ cursor: 'default', pointerEvents: 'stroke' }}
                      onMouseEnter={enter} onMouseMove={move} onMouseLeave={leave}
                    />
                    <polyline
                      points={pointsAttr} fill="none" stroke={getColor ? getColor(m) : planeColor} strokeWidth={1.5}
                      style={{ pointerEvents: 'none' }}
                      ref={(el) => { registerBin(planarBinRefs, ownBin, el); registerBin(planarBinRefs, oppBin, el); }}
                    />
                  </g>
                );
              })}

            {showPoles &&
              measurements.map((m) => {
                const p = projectPole(m.azimut, m.dip, ctx.projection, ctx.radius);
                const screen = ctx.toScreen(p);
                const id = `pole-${m.id}`;
                const ownBin = binIndexOf(m.azimut, binSizeDeg);
                const oppBin = binIndexOf(m.azimut + 180, binSizeDeg);
                const elRef = (el: SVGElement | null) => { registerBin(planarBinRefs, ownBin, el); registerBin(planarBinRefs, oppBin, el); };
                const enter = (e: React.MouseEvent) => {
                  setHover({
                    id, kind: 'pole', title: `${m.tipo} (polo)`, cinemática: m.cinemática,
                    detail: `Az ${m.azimut.toFixed(0)}° / Dip ${m.dip.toFixed(0)}°`,
                    clientX: e.clientX, clientY: e.clientY,
                  });
                  crossHighlightBus?.setHighlight({ kind: 'planar', bins: [ownBin, oppBin] });
                };
                const move = (e: React.MouseEvent) => setHover((h) => (h && h.id === id ? { ...h, clientX: e.clientX, clientY: e.clientY } : h));
                const leave = () => {
                  setHover((h) => (h?.id === id ? null : h));
                  crossHighlightBus?.setHighlight(null);
                };
                const fill = getColor ? getColor(m) : poleColor;
                const familyColor = familyColorById.get(m.id);
                // Anillo de familia (identificación de familias) — DETRÁS del
                // marcador normal, un `<circle>` sin relleno en el color de la
                // familia; independiente de getSymbol/getColor (una familia es
                // una selección manual del usuario, ortogonal a clasificación).
                const familyRing = familyColor ? (
                  <circle key={`${id}-family`} cx={screen.x} cy={screen.y} r={chartStyle.pointSize + 3} fill="none" stroke={familyColor} strokeWidth={2} style={{ pointerEvents: 'none' }} />
                ) : null;
                if (getSymbol) {
                  const sym = getSymbol(m);
                  return (
                    <React.Fragment key={id}>
                      {familyRing}
                      <ShapeMarker
                        testId={id} shape={sym.shape} dashed={sym.dashed}
                        cx={screen.x} cy={screen.y} size={chartStyle.pointSize} fill={fill}
                        onMouseEnter={enter} onMouseMove={move} onMouseLeave={leave}
                        elementRef={elRef}
                      />
                    </React.Fragment>
                  );
                }
                return (
                  <React.Fragment key={id}>
                    {familyRing}
                    <circle
                      data-testid={id}
                      cx={screen.x} cy={screen.y} r={chartStyle.pointSize}
                      fill={fill} stroke="#0f172a" strokeWidth={1}
                      style={{ cursor: 'default' }}
                      onMouseEnter={enter} onMouseMove={move} onMouseLeave={leave}
                      ref={elRef}
                    />
                  </React.Fragment>
                );
              })}

            {showLines &&
              renderableLines.map((l) => {
                const p = projectLine(l.trend, l.plunge, ctx.projection, ctx.radius);
                const screen = ctx.toScreen(p);
                const id = `line-${l.id}`;
                const originTag = l.origin === 'rake' ? '(línea, rake)' : '(línea)';
                const half = chartStyle.pointSize;
                // Líneas NO son simétricas (ver JSDoc de roseBinning.ts) — un solo bin, el propio trend.
                const ownBin = binIndexOf(l.trend, binSizeDeg);
                const elRef = (el: SVGElement | null) => registerBin(linearBinRefs, ownBin, el);
                const enter = (e: React.MouseEvent) => {
                  setHover({
                    id, kind: 'line', title: `${l.tipo} ${originTag}`, cinemática: l.cinemática,
                    detail: `Trend ${l.trend.toFixed(0)}° / Plunge ${l.plunge.toFixed(0)}°`,
                    clientX: e.clientX, clientY: e.clientY,
                  });
                  crossHighlightBus?.setHighlight({ kind: 'linear', bins: [ownBin] });
                };
                const move = (e: React.MouseEvent) => setHover((h) => (h && h.id === id ? { ...h, clientX: e.clientX, clientY: e.clientY } : h));
                const leave = () => {
                  setHover((h) => (h?.id === id ? null : h));
                  crossHighlightBus?.setHighlight(null);
                };
                const fill = getColor ? getColor(l) : lineColor;
                if (getSymbol) {
                  const sym = getSymbol(l);
                  return (
                    <ShapeMarker
                      key={id} testId={id} shape={sym.shape} dashed={sym.dashed}
                      cx={screen.x} cy={screen.y} size={half} fill={fill}
                      onMouseEnter={enter} onMouseMove={move} onMouseLeave={leave}
                      elementRef={elRef}
                    />
                  );
                }
                return (
                  <rect
                    key={id}
                    data-testid={id}
                    x={screen.x - half} y={screen.y - half} width={half * 2} height={half * 2}
                    transform={`rotate(45 ${screen.x} ${screen.y})`}
                    fill={fill} stroke="#0f172a" strokeWidth={1}
                    style={{ cursor: 'default' }}
                    onMouseEnter={enter} onMouseMove={move} onMouseLeave={leave}
                    ref={elRef}
                  />
                );
              })}
            </g>

            {/* Plano/polo medio (Etapa 4) — FUERA del <g> de opacidad (debe seguir
                bien visible aunque el usuario baje la opacidad de los datos
                individuales, ya que es un resumen, no un dato más) pero DENTRO
                del <g> de zoom/paneo (debe moverse con el resto del diagrama).
                En modo comparación (paquete de mejoras): UN marcador POR GRUPO
                (computeMeanPole llamado por separado para cada uno, nunca un
                promedio combinado A+B — ver JSDoc de la prop comparisonGroups),
                en el color fijo de ESE grupo en vez del ámbar de siempre. */}
            {showMeanPole && (comparisonGroups ?? [{ label: '', color: '#facc15', measurements }]).map((group, gi) => {
              const mean = computeMeanPole(group.measurements);
              if (!mean) return null;
              const p = projectPole(mean.dipDirection, mean.dip, ctx.projection, ctx.radius);
              const screen = ctx.toScreen(p);
              const id = comparisonGroups ? `mean-pole-${gi}` : 'mean-pole';
              const R = Math.max(7, chartStyle.pointSize * 2.2);
              const color = group.color;
              const title = comparisonGroups ? `Plano/polo medio — ${group.label}` : 'Plano/polo medio';
              return (
                <g
                  key={id}
                  data-testid={id}
                  style={{ cursor: 'default' }}
                  onMouseEnter={(e) =>
                    setHover({
                      id, kind: 'meanPole', title,
                      detail: `Az ${mean.dipDirection.toFixed(0)}° / Dip ${mean.dip.toFixed(0)}° (n=${mean.n}, R=${mean.resultantLength.toFixed(2)})`,
                      clientX: e.clientX, clientY: e.clientY,
                    })
                  }
                  onMouseMove={(e) => setHover((h) => (h && h.id === id ? { ...h, clientX: e.clientX, clientY: e.clientY } : h))}
                  onMouseLeave={() => setHover((h) => (h?.id === id ? null : h))}
                >
                  <circle cx={screen.x} cy={screen.y} r={R} fill="none" stroke={color} strokeWidth={2.5} />
                  <line x1={screen.x - R * 1.4} y1={screen.y} x2={screen.x + R * 1.4} y2={screen.y} stroke={color} strokeWidth={2.5} />
                  <line x1={screen.x} y1={screen.y - R * 1.4} x2={screen.x} y2={screen.y + R * 1.4} stroke={color} strokeWidth={2.5} />
                </g>
              );
            })}

            {/* Cono de confianza de Fisher (paquete de mejoras) — overlay
                OPCIONAL (toggle propio), alrededor del POLO medio ya
                existente (mismo eje que el marcador de arriba, pero
                INDEPENDIENTE: puede activarse solo, sin el marcador). Trazo
                punteado a propósito — se distingue del anillo cosmético fijo
                del marcador de plano/polo medio (radio arbitrario en px, sin
                significado estadístico) porque ACÁ el radio SÍ tiene
                significado geológico (grados reales de incertidumbre),
                proyectado con projectSmallCircle() (stereonet.ts). En modo
                comparación: UN cono POR GRUPO (computeFisherStats por
                separado para cada uno), en el color fijo de ese grupo. */}
            {showConfidenceCone && (comparisonGroups ?? [{ label: '', color: '#facc15', measurements }]).map((group, gi) => {
              const fisher = computeFisherStats(group.measurements, fisherConfidenceLevel);
              if (!fisher) return null;
              // computeFisherStats() (como computeMeanPole()) devuelve dipDirection/dip
              // del PLANO medio — se invierte a trend/plunge del POLO (mismo -180°/90°-dip
              // que projectPole() aplica) porque el cono es alrededor del polo, no del plano.
              const poleTrend = normalizeAzimuth(fisher.dipDirection + 180);
              const polePlunge = 90 - fisher.dip;
              const conePoints = projectSmallCircle(poleTrend, polePlunge, fisher.confidenceConeDeg, ctx.projection, ctx.radius);
              const pointsAttr = conePoints.map((p) => { const s = ctx.toScreen(p); return `${s.x},${s.y}`; }).join(' ');
              const id = comparisonGroups ? `confidence-cone-${gi}` : 'confidence-cone';
              return (
                <polygon
                  key={id}
                  data-testid={id}
                  points={pointsAttr}
                  fill="none" stroke={group.color} strokeWidth={1.5} strokeDasharray="4,3"
                  style={{ pointerEvents: 'none' }}
                />
              );
            })}
          </g>
        )}
      </StereonetBase>

      {hover && (
        <div
          style={{
            position: 'fixed', pointerEvents: 'none',
            left: hover.clientX + 12, top: hover.clientY + 12,
            background: 'rgba(15,23,42,.94)', color: '#f1f5f9',
            border: '1px solid rgba(255,255,255,.15)', borderRadius: 4,
            padding: '6px 9px', fontSize: 12, lineHeight: 1.5,
            whiteSpace: 'nowrap', zIndex: 1000,
          }}
        >
          <div style={{ fontWeight: 700 }}>{hover.title}</div>
          {hover.cinemática && <div>{hover.cinemática}</div>}
          <div>{hover.detail}</div>
        </div>
      )}
      </div>
    </div>
  );
});

export default StereonetPlanes;
