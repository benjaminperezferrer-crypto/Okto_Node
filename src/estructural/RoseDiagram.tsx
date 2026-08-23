/**
 * src/estructural/RoseDiagram.tsx
 * Etapa 7 — diagrama de rosetas (histograma angular), INDEPENDIENTE del
 * estereograma: es una vista propia con su propio círculo de fondo, no
 * una superposición sobre StereonetBase (esta vista no proyecta nada en
 * hemisferio inferior, solo agrupa ángulos — el radio del pétalo es
 * frecuencia, no una proyección geométrica de dip/plunge).
 *
 * ── Decisión: qué variable rosetear — un componente con toggles de capa,
 *    no vistas separadas por variable ──────────────────────────────────
 * Se rosetea `azimut` (dirección de manteo) para PlanarMeasurement y
 * `trend` para datos lineales — incluyendo ambos orígenes ya combinados
 * en la Etapa 6 (LinearMeasurement directo + PlanarMeasurement con rake,
 * vía deriveRakeLines() de structuralTypes.ts, reutilizada tal cual acá
 * para no duplicar esa regla). Igual que StereonetPlanes.tsx (Etapa 6),
 * se ofrecen 2 checkboxes independientes (`showPlanes`/`showLines`) en
 * vez de vistas separadas — el costo de superponerlas es bajo (colores
 * distintos, y cada una respeta su propia regla de simetría, ver abajo)
 * y permite comparar ambas distribuciones en el mismo diagrama cuando
 * hace falta.
 *
 * ── Decisión de simetría 180° — ver roseBinning.ts para la justificación
 *    geológica completa ────────────────────────────────────────────────
 * PLANOS (azimut): `symmetric=true` — cada medición se cuenta en su
 * propio sector Y en el opuesto (az+180°), el patrón "bowtie" estándar
 * para rosetas de datos planares (fracturas/diaclasas/estratificación).
 * LÍNEAS (trend, ambos orígenes): `symmetric=false` — el trend de una
 * línea SÍ tiene sentido geológico direccional propio (no es lo mismo
 * "hacia el NE" que "hacia el SO" para una estría o un eje con vergencia),
 * duplicarlo destruiría esa información.
 *
 * Etapa 9 — clasificación por color: como cada pétalo ya es un
 * AGREGADO (una frecuencia, no un ítem individual), "colorear por
 * clasificación" acá significa PÉTALOS APILADOS por grupo dentro de
 * cada sector (stacked, como buildRoseSVG() en index.html hace con su
 * parámetro `groups` — mismo concepto visual, reimplementado acá sobre
 * buildGroupedRoseBins() de roseBinning.ts). Por eso la forma de esta
 * prop es distinta a StereonetPlanes.getColor(item)=>color: acá hacen
 * falta 2 piezas — `getGroup(item)=>string` (a qué grupo pertenece cada
 * medición, típicamente getFieldValue() de classification.ts) y
 * `groupColor(group)=>string` (el color de ESE grupo, típicamente un
 * lookup en getClassificationColors()) — porque el color se pinta por
 * GRUPO agregado, no por ítem individual. Sin `getGroup`, se mantiene
 * el pétalo sólido de la Etapa 7 (internamente es el caso particular de
 * "un solo grupo").
 * ESTE componente NO filtra: recibe `measurements`/`linearMeasurements`
 * ya filtrados por el llamador, igual que StereonetPlanes.tsx.
 *
 * Etapa 10 — conecta ChartStyleEditor/ExportButton (src/shared/), mismo
 * patrón que StereonetPlanes.tsx: estado propio de ChartStyleSettings,
 * persistido con su propia clave de storage (chartStyleIds.ts).
 * `pointSize` de ChartStyleSettings NO se usa acá — este diagrama no
 * tiene marcadores puntuales, sus "datos" son pétalos/sectores, no
 * puntos (a diferencia de StereonetPlanes) — es un caso legítimo de "no
 * todo diagrama usa todos los campos genéricos", no un olvido.
 * `lineThickness` escala el grosor del borde/ticks/anillos de
 * referencia (la "carrocería"), nunca el trazo de los pétalos (dato).
 * `showGrid=false` oculta anillos+ticks, igual criterio que
 * StereonetBase.tsx — el borde y las etiquetas cardinales no se ocultan.
 */

import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { buildGroupedRoseBins, RoseBinGroup } from './roseBinning';
import { deriveRakeLines } from './structuralTypes';
import type { PlanarMeasurement, LinearMeasurement, RenderableLine } from './structuralTypes';
import type { CrossHighlightBus, HighlightState } from './crossHighlight';
import { ChartStyleSettings, DEFAULT_PLANE_SYMMETRIC } from '../shared/chartStyle';
import { SvgLegend, LegendEntry, measureLegendHeight } from './SvgLegend';
import { useResponsiveSquareSize } from './useResponsiveSquareSize';
import { useImperativeZoomPan } from './useImperativeZoomPan';

type ClassifiableItem = PlanarMeasurement | RenderableLine;

const DEFAULT_TITLE = 'Diagrama de rosetas';
const TITLE_BAND = 30;

export interface RoseDiagramProps {
  measurements?: PlanarMeasurement[];
  linearMeasurements?: LinearMeasurement[];
  /** Lado del SVG cuadrado, en px. Si se omite, se mide automáticamente el ancho de la columna vía ResizeObserver (useResponsiveSquareSize.ts) — mismo criterio que StereonetPlanes.tsx. */
  size?: number;
  /** Tamaño de cada sector angular, en grados. Default 10 (36 sectores). */
  binSizeDeg?: number;
  defaultShowPlanes?: boolean;
  defaultShowLines?: boolean;
  planeColor?: string;
  lineColor?: string;
  /** Grupo de clasificación de un ítem (Etapa 9) — ver JSDoc de archivo. Sin esto, cada capa se dibuja como un pétalo sólido (comportamiento de la Etapa 7). */
  getGroup?: (item: ClassifiableItem) => string;
  /** Color de un grupo (Etapa 9) — requerido junto con getGroup para pétalos apilados. */
  groupColor?: (group: string) => string;
  /** Entradas de leyenda (Etapa 10) — ver StereonetPlanes.tsx. Sin esto, leyenda por defecto (Planos/Líneas) con los colores planos. */
  legendEntries?: LegendEntry[];
  /**
   * Estilo del gráfico — CONTROLADO por el padre (EstructuralWorkspace.tsx)
   * desde la etapa de reorganización visual: el estado y su persistencia en
   * localStorage viven allá, y el editor de estilo se renderiza en la columna
   * izquierda, no debajo del gráfico. Este componente solo lee `chartStyle`
   * para dibujar y notifica cambios (p.ej. simetría 180°) vía `onChartStyleChange`.
   */
  chartStyle: ChartStyleSettings;
  onChartStyleChange: (patch: Partial<ChartStyleSettings>) => void;
  /** Resaltado cruzado con StereonetPlanes.tsx (paquete de mejoras — ver crossHighlight.ts). Sin esto, cero cambio de comportamiento. */
  crossHighlightBus?: CrossHighlightBus;
}

/** Toggles de despliegue de ESTE diagrama — etapa de persistencia final del paquete de mejoras (antes SOLO useState, ver JSDoc de StereonetDisplayState en StereonetPlanes.tsx para el criterio equivalente de ESE diagrama). */
export interface RoseDisplayState {
  showPlanes: boolean;
  showLines: boolean;
}

export interface RoseDiagramHandle {
  getDisplayState: () => RoseDisplayState;
  loadDisplayState: (state: RoseDisplayState) => void;
}

const DEG2RAD = Math.PI / 180;
/** Espacio para etiquetas N/E/S/W fuera del círculo — proporcional a `size` (mismo criterio y misma fórmula que StereonetBase.tsx, ver su JSDoc: a size=400 da 36, idéntico al valor fijo que usaba este archivo antes de la etapa de layout responsivo). */
function marginFor(size: number): number {
  return Math.max(24, Math.round(size * 0.09));
}

function screenPoint(azimuthDeg: number, r: number, cx: number, cy: number): { x: number; y: number } {
  const rad = azimuthDeg * DEG2RAD;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

const DEFAULT_GROUP = '_all';

/**
 * Path SVG de un sector anular entre radios [r0,r1] y ángulos [a1,a2] —
 * generaliza el "pétalo sólido" de la Etapa 7 (r0=0: se dibuja como un
 * sector normal desde el centro, sin arco interior en r=0 que SVG
 * dibujaría mal). Con r0>0 es la banda apilada de un grupo que no es el
 * primero del sector.
 */
function annularSectorPath(a1: number, a2: number, r0: number, r1: number, cx: number, cy: number): string {
  if (r1 <= 0) return '';
  const outer1 = screenPoint(a1, r1, cx, cy);
  const outer2 = screenPoint(a2, r1, cx, cy);
  const largeArc = a2 - a1 > 180 ? 1 : 0;
  if (r0 <= 0) {
    return `M ${cx},${cy} L ${outer1.x},${outer1.y} A ${r1},${r1} 0 ${largeArc} 1 ${outer2.x},${outer2.y} Z`;
  }
  const inner1 = screenPoint(a1, r0, cx, cy);
  const inner2 = screenPoint(a2, r0, cx, cy);
  return [
    `M ${outer1.x},${outer1.y}`,
    `A ${r1},${r1} 0 ${largeArc} 1 ${outer2.x},${outer2.y}`,
    `L ${inner2.x},${inner2.y}`,
    `A ${r0},${r0} 0 ${largeArc} 0 ${inner1.x},${inner1.y}`,
    'Z',
  ].join(' ');
}

const RoseDiagram = forwardRef<RoseDiagramHandle, RoseDiagramProps>(function RoseDiagram({
  measurements = [],
  linearMeasurements = [],
  size: fixedSize,
  binSizeDeg = 10,
  defaultShowPlanes = true,
  defaultShowLines = true,
  planeColor = '#dc2626',
  lineColor = '#16a34a',
  getGroup,
  groupColor,
  legendEntries,
  chartStyle,
  onChartStyleChange,
  crossHighlightBus,
}: RoseDiagramProps, ref) {
  const [showPlanes, setShowPlanes] = useState(defaultShowPlanes);
  const [showLines, setShowLines] = useState(defaultShowLines);

  useImperativeHandle(ref, () => ({
    getDisplayState: () => ({ showPlanes, showLines }),
    loadDisplayState: (state) => {
      setShowPlanes(state.showPlanes);
      setShowLines(state.showLines);
    },
  }), [showPlanes, showLines]);

  // Resaltado cruzado (crossHighlight.ts) — mismo patrón que StereonetPlanes.tsx:
  // Maps reconstruidos cada render, agrupando los <path> de pétalo por bin
  // angular (índice del array de bins, no a1/a2) — un bin puede tener VARIOS
  // <path> apilados (uno por grupo de clasificación), todos registrados bajo
  // el mismo índice, así el resaltado ilumina el sector completo.
  const planarPetalRefs = useRef(new Map<number, SVGElement[]>());
  const linearPetalRefs = useRef(new Map<number, SVGElement[]>());
  planarPetalRefs.current = new Map();
  linearPetalRefs.current = new Map();
  function registerPetalBin(map: React.RefObject<Map<number, SVGElement[]>>, bin: number, el: SVGElement | null) {
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
      const map = state.kind === 'planar' ? planarPetalRefs.current : linearPetalRefs.current;
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

  const lineThicknessScale = chartStyle.lineThickness;

  const { ref: columnRef, size } = useResponsiveSquareSize(fixedSize);
  const zoomGroupRef = useRef<SVGGElement>(null);
  const { svgRef, transformString, isZoomed, reset: resetZoom } = useImperativeZoomPan([zoomGroupRef]);

  const titleBand = TITLE_BAND;
  const cx = size / 2;
  const cy = size / 2 + titleBand;
  const plotHeight = size + titleBand; // alto del área de ploteo (círculo + título), sin la banda de leyenda
  const maxRadius = size / 2 - marginFor(size);

  const renderableLines: RenderableLine[] = [
    ...linearMeasurements.map((l) => ({ id: `lin-${l.id}`, tipo: l.tipo, trend: l.trend, plunge: l.plunge, origin: 'linear' as const, zona: l.zona, campaña: l.campaña })),
    ...deriveRakeLines(measurements),
  ];

  const groupOf = (item: ClassifiableItem) => (getGroup ? getGroup(item) : DEFAULT_GROUP);
  const colorOf = (group: string) => (group === DEFAULT_GROUP ? undefined : groupColor?.(group));

  const planeItems = measurements.map((m) => ({ angle: m.azimut, group: groupOf(m) }));
  const lineItems = renderableLines.map((l) => ({ angle: l.trend, group: groupOf(l) }));

  // Simetría 180° del binning de PLANOS (azimut) — toggle "Simetría 180°"
  // (paquete de mejoras): persistida en chartStyle.planeSymmetric, default
  // true (patrón "bowtie" histórico, ver JSDoc de ChartStyleSettings). Las
  // LÍNEAS (trend) NUNCA usan simetría — `false` fijo, sin control, mismo
  // criterio de la Etapa 7 (un trend tiene sentido direccional propio, ver
  // JSDoc de archivo) — este toggle no las alcanza.
  const planeSymmetric = chartStyle.planeSymmetric ?? DEFAULT_PLANE_SYMMETRIC;
  const planeBins = buildGroupedRoseBins(planeItems, binSizeDeg, planeSymmetric);
  const lineBins = buildGroupedRoseBins(lineItems, binSizeDeg, false);

  // Orden GLOBAL y consistente de grupos para apilar (primera aparición
  // en los datos, no alfabético) — así el orden de las bandas apiladas
  // es el mismo en todos los sectores del diagrama, no independiente
  // por bin (que se vería inconsistente entre pétalos vecinos).
  const groupOrder: string[] = [];
  for (const item of [...planeItems, ...lineItems]) {
    if (!groupOrder.includes(item.group)) groupOrder.push(item.group);
  }

  // Una sola escala de frecuencia para AMBAS capas — así los pétalos son
  // comparables entre sí visualmente (un pétalo más largo SIEMPRE es más
  // frecuente, sin importar de qué capa es).
  const maxCount = Math.max(1, ...planeBins.map((b) => b.total), ...lineBins.map((b) => b.total));
  const radiusOf = (count: number) => (count / maxCount) * maxRadius;

  const layerToggles: { key: string; label: string; value: boolean; set: (v: boolean) => void }[] = [
    { key: 'planes', label: 'Planos (azimut)', value: showPlanes, set: setShowPlanes },
    { key: 'lines', label: 'Líneas (trend)', value: showLines, set: setShowLines },
  ];

  const ticks: React.ReactNode[] = [];
  for (let az = 0; az < 360; az += 10) {
    const isCardinal = az % 90 === 0;
    const isMajor = az % 30 === 0;
    const tickLen = isCardinal ? 14 : isMajor ? 9 : 5;
    const outer = screenPoint(az, maxRadius, cx, cy);
    const inner = screenPoint(az, maxRadius - tickLen, cx, cy);
    ticks.push(
      <line key={`tick-${az}`} x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y}
            stroke={isCardinal ? '#64748b' : isMajor ? '#64748b' : '#cbd5e1'} strokeWidth={(isCardinal ? 1.6 : 1) * lineThicknessScale} />,
    );
  }
  const gridRings = [0.25, 0.5, 0.75, 1].map((f) => (
    <circle key={f} cx={cx} cy={cy} r={maxRadius * f} fill="none" stroke="#cbd5e1" strokeWidth={(f === 1 ? 1.2 : 0.7) * lineThicknessScale}
            strokeDasharray={f === 1 ? undefined : '3,4'} />
  ));
  const cardinalLabels = [{ az: 0, text: 'N' }, { az: 90, text: 'E' }, { az: 180, text: 'S' }, { az: 270, text: 'W' }];

  const effectiveLegend: LegendEntry[] = legendEntries ?? [
    ...(showPlanes ? [{ label: 'Planos', color: planeColor }] : []),
    ...(showLines ? [{ label: 'Líneas', color: lineColor }] : []),
  ];
  // Banda inferior reservada para la leyenda (etapa de reorganización visual):
  // el <svg> crece hacia abajo esa altura y la leyenda se dibuja ahí, centrada,
  // fuera de la roseta — ya no superpuesta sobre los pétalos.
  const legendBand = chartStyle.legend.visible ? measureLegendHeight(effectiveLegend, chartStyle.fontSize) : 0;
  const svgHeight = plotHeight + legendBand;

  /**
   * Dibuja los pétalos de una capa. Sin clasificación (getGroup no
   * pasado), cada sector es UN solo grupo interno (DEFAULT_GROUP) y el
   * resultado es idéntico al pétalo sólido de la Etapa 7. Con
   * clasificación, cada sector se apila en bandas por grupo, en
   * `groupOrder` (consistente en todo el diagrama), coloreadas con
   * `groupColor` (o `fallbackColor` si groupColor no da un color para
   * ese grupo).
   */
  function petals(bins: RoseBinGroup[], fallbackColor: string, keyPrefix: string, highlightKind: HighlightState['kind']) {
    const binSize = 360 / bins.length;
    const petalRefs = highlightKind === 'planar' ? planarPetalRefs : linearPetalRefs;
    return bins
      .filter((b) => b.total > 0)
      .flatMap((b) => {
        const binIndex = Math.round(b.a1 / binSize);
        const countByGroup = new Map(b.groups.map((g) => [g.group, g.count]));
        let cumulative = 0;
        // Hover en CUALQUIER banda apilada del sector resalta el sector COMPLETO
        // (no solo esa banda) — es el mismo criterio "resaltar el sector" del
        // enunciado, y evita que el resaltado cruzado dependa de sobre qué
        // grupo apilado exacto cayó el cursor.
        const enter = () => crossHighlightBus?.setHighlight({ kind: highlightKind, bins: [binIndex] });
        const leave = () => crossHighlightBus?.setHighlight(null);
        return groupOrder
          .map((group) => {
            const count = countByGroup.get(group) ?? 0;
            if (count === 0) return null;
            const r0 = radiusOf(cumulative);
            cumulative += count;
            const r1 = radiusOf(cumulative);
            const color = colorOf(group) ?? fallbackColor;
            return (
              <path
                key={`${keyPrefix}-${b.a1}-${group}`}
                data-testid={`petal-${keyPrefix}-${binIndex}-${group}`}
                d={annularSectorPath(b.a1, b.a2, r0, r1, cx, cy)}
                fill={color}
                fillOpacity={0.55}
                stroke={color}
                strokeWidth={1}
                style={{ cursor: 'default' }}
                onMouseEnter={enter}
                onMouseLeave={leave}
                ref={(el) => registerPetalBin(petalRefs, binIndex, el)}
              />
            );
          })
          .filter((el): el is React.ReactElement => el !== null);
      });
  }

  return (
    <div ref={columnRef} style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', minWidth: 0 }}>
      {/* Resaltado cruzado (crossHighlight.ts) — misma regla que StereonetPlanes.tsx. */}
      <style>{'.xhl-active { stroke: #facc15; stroke-width: 2.5px; fill-opacity: .9; }'}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div role="group" aria-label="Capas visibles" style={{ display: 'flex', gap: 4 }}>
          {layerToggles.map(({ key, label, value, set }) => (
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
        </div>

        <svg ref={svgRef} width={size} height={svgHeight} viewBox={`0 0 ${size} ${svgHeight}`} fontFamily={chartStyle.fontFamily} style={{ touchAction: 'none' }}>
          <text x={cx} y={TITLE_BAND / 2 + 4} textAnchor="middle" fontSize={chartStyle.fontSize + 2} fontWeight={700} fill="#334155">
            {chartStyle.title || DEFAULT_TITLE}
          </text>

          {/* Zoom/pan (Etapa 2) — envuelve grilla+borde+pétalos+etiquetas cardinales,
              NUNCA título ni leyenda (quedan fijos, mismo criterio que StereonetBase.tsx).
              data-testid: ver el mismo comentario en StereonetBase.tsx — usado por
              exportReportFigure.ts para resetear el zoom en un clon, sin tocar la vista real. */}
          <g ref={zoomGroupRef} transform={transformString} onDoubleClick={resetZoom} data-testid="zoom-content-group">
            {chartStyle.showGrid && (
              <>
                {gridRings}
                {ticks}
              </>
            )}
            <circle cx={cx} cy={cy} r={maxRadius} fill="none" stroke="#1e293b" strokeWidth={2 * lineThicknessScale} />

            {showPlanes && petals(planeBins, planeColor, 'plane', 'planar')}
            {showLines && petals(lineBins, lineColor, 'line', 'linear')}

            {cardinalLabels.map(({ az, text }) => {
              const p = screenPoint(az, maxRadius + 20, cx, cy);
              return (
                <text key={text} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize={chartStyle.fontSize} fontWeight={600} fill="#334155">
                  {text}
                </text>
              );
            })}
          </g>

          {chartStyle.legend.visible && (
            <SvgLegend
              entries={effectiveLegend}
              svgWidth={size}
              top={plotHeight}
              fontFamily={chartStyle.fontFamily}
              fontSize={chartStyle.fontSize}
            />
          )}
        </svg>
      </div>
    </div>
  );
});

export default RoseDiagram;
