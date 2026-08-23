/**
 * src/estructural/StereonetBase.tsx
 * Etapa 3 — armazón visual del estereograma (círculo + graduación +
 * toggle Schmidt/Wulff), SIN datos de muestras todavía (eso queda para
 * una etapa posterior que dibuje polos/planos/rosetas encima de esto).
 *
 * ── Decisión: grilla interna (red de Wulff/Schmidt clásica) ──────────
 * NO se dibuja todavía. Una red clásica impresa (meridianos + paralelos
 * cada 2°) es geometría DISTINTA de la ya construida en stereonet.ts:
 * projectGreatCircle() traza el círculo máximo de un PLANO buzando
 * (relativo al eje vertical), mientras que los meridianos/paralelos de
 * la red de referencia son círculos máximos/menores relativos a un eje
 * horizontal FIJO (el eje N-S) — es una familia de curvas nueva, no una
 * reutilización directa de lo que ya existe. Implementarla bien (y que
 * cambie de forma correctamente entre Schmidt/Wulff, como pide el
 * enunciado) es un bloque de trabajo aparte, no trivial, y no bloquea
 * poder empezar a graficar datos reales encima de este armazón. Por eso
 * se deja para una etapa posterior si hace falta, y por ahora el
 * armazón se limita a: borde + cruz N-S/E-W + marcas de grado (líneas
 * rectas triviales, sin geometría nueva).
 *
 * ── Capa de datos futura: patrón render-prop ─────────────────────────
 * `children`, si se pasa, es una función que recibe el contexto activo
 * (proyección + radio + `toScreen`) y devuelve JSX a superponer dentro
 * del mismo <svg>. Como este componente vuelve a invocar `children` en
 * cada render, cualquier capa de datos que el padre dibuje ahí se
 * recalcula automáticamente al cambiar de proyección (usando
 * projectPole/projectGreatCircle/projectLine de stereonet.ts con la
 * `projection` y el `radius` de este mismo contexto) — sin que ese
 * padre tenga que gestionar su propio estado de proyección por separado.
 *
 * `toScreen` convierte coordenadas matemáticas (x=Este,y=Norte,
 * Norte=arriba — la convención de salida de stereonet.ts) a coordenadas
 * de pantalla SVG (origen arriba-izquierda, y hacia abajo): traslada por
 * (cx,cy) e invierte el eje Y, tal como documenta el encabezado de
 * stereonet.ts que debía hacer la capa de renderizado.
 *
 * Etapa de layout responsivo — MARGIN dejó de ser un píxel fijo (36,
 * calibrado para size≈400-480) y pasa a ser proporcional a `size`
 * (`Math.max(24, size*0.09)`, ver `marginFor()`) — con el layout de 2
 * columnas cuyo ancho depende del viewport (useResponsiveSquareSize.ts),
 * `size` ahora puede variar en un rango amplio; un margen fijo dejaba el
 * anillo N/E/S/W desproporcionadamente grande a tamaños chicos. A
 * size=400 (el único tamaño que usaba el módulo antes de esta etapa),
 * `0.09*400=36` — mismo valor exacto que antes, cero cambio en ese caso.
 *
 * Etapa 10 — soporte para ChartStyleSettings (src/shared/chartStyle.ts),
 * cableado desde StereonetPlanes.tsx:
 *   `title` reserva una franja fija (TITLE_BAND) arriba del círculo y
 *     desplaza cy hacia abajo esa misma distancia — el círculo en sí no
 *     cambia de tamaño ni de matemática, solo se reubica dentro de un
 *     <svg> más alto. Sin título, el comportamiento es IDÉNTICO al de
 *     antes (mismo alto de SVG, mismo cy).
 *   `fontFamily`/`fontSize` reemplazan los valores fijos que tenían el
 *     título y las etiquetas N/E/S/W.
 *   `lineThicknessScale` (default 1, preserva el grosor original)
 *     multiplica el grosor del borde/cruz/marcas de graduación — NUNCA
 *     el de los datos superpuestos (polos/planos/líneas/Kamb), que no
 *     son responsabilidad de este archivo.
 *   `showGrid=false` oculta la cruz N-S/E-W y las marcas de graduación
 *     (la "grilla de referencia" de este armazón) — el borde del círculo
 *     y las etiquetas cardinales NUNCA se ocultan (son la identidad del
 *     estereograma, no una grilla decorativa).
 */

import React, { useState } from 'react';
import type { Projection, Point2D } from './stereonet';

// ─────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────

export interface StereonetRenderContext {
  projection: Projection;
  /** Radio del estereograma en coordenadas matemáticas — el mismo valor que se le pasa a projectPole/projectGreatCircle/projectLine. */
  radius: number;
  /** Centro del círculo en coordenadas de pantalla SVG. */
  cx: number;
  cy: number;
  /** Convierte un punto matemático (x=Este,y=Norte) devuelto por stereonet.ts a coordenadas de pantalla SVG. */
  toScreen: (p: Point2D) => Point2D;
  /** Dimensiones REALES del <svg> (incluye la franja de título y la banda inferior de leyenda si hay) — Etapa 10, para overlays que necesiten posicionarse relativo al borde real del SVG. */
  width: number;
  height: number;
  /** Y del borde superior de la banda inferior reservada (= size + franja de título) — donde el overlay de leyenda debe empezar a dibujar, fuera del círculo. Etapa de reorganización visual. */
  bandTop: number;
}

export interface StereonetBaseProps {
  /** Lado del SVG cuadrado, en px. Default 480. */
  size?: number;
  /** Proyección inicial (no controlada). Default 'schmidt'. Ignorado si se pasa `projection`. */
  defaultProjection?: Projection;
  /** Proyección controlada — si se pasa, el toggle interno deja de manejar su propio estado y solo notifica vía onProjectionChange. */
  projection?: Projection;
  onProjectionChange?: (projection: Projection) => void;
  /** Oculta el selector Schmidt/Wulff (para cuando el padre quiere su propio control externo). Default false. */
  hideToggle?: boolean;
  /** Overlay de datos (polos/planos/líneas), agregado en una etapa posterior — ver JSDoc de archivo. Zoom/pan (Etapa 2) SÍ lo afecta — vive dentro del `<g>` que se mueve/escala. */
  children?: (ctx: StereonetRenderContext) => React.ReactNode;
  /** Overlay FIJO (Etapa 2) — p.ej. la leyenda: debe quedar pinneado a una esquina del SVG sin importar el zoom/pan activo, igual criterio que el título. Se renderiza FUERA del `<g>` de zoom, después de él (encima). */
  fixedOverlay?: (ctx: StereonetRenderContext) => React.ReactNode;

  /** Título (Etapa 10, ChartStyleSettings) — si se pasa, reserva una franja arriba del círculo. Sin título, no cambia nada del layout. */
  title?: string;
  fontFamily?: string;
  /** Tamaño de fuente del título y las etiquetas cardinales. Default 15 (mismo valor hardcodeado que antes de la Etapa 10). */
  fontSize?: number;
  /** Multiplicador del grosor de borde/cruz/marcas — 1 = grosor original. */
  lineThicknessScale?: number;
  /** false oculta cruz + marcas de graduación (borde y etiquetas cardinales nunca se ocultan). Default true. */
  showGrid?: boolean;

  /** Alto extra (px) reservado DEBAJO del círculo para la banda de leyenda — 0 (default) = sin banda, layout idéntico al histórico. El `fixedOverlay` la dibuja usando `ctx.bandTop`. Etapa de reorganización visual. */
  bottomBandHeight?: number;

  /**
   * Zoom/pan (Etapa 2, useImperativeZoomPan.ts) — los 3 son opcionales:
   * sin ellos, este componente se comporta exactamente igual que antes
   * (sin zoom). `svgRef` va en el `<svg>` (así el hook escucha wheel/
   * mousedown SOLO con el cursor encima). `contentGroupRef` envuelve
   * grilla+borde+etiquetas cardinales (todo salvo el título, que queda
   * fijo como chrome de UI) en un `<g>` — el mismo `<g>` que el llamador
   * (StereonetPlanes.tsx) también usa para SU capa de datos, para que
   * ambos se muevan juntos. `contentTransform` es el string sincronizado
   * que React mantiene — se aplica como prop `transform` normal del JSX
   * para que un re-render por otro motivo no pierda el zoom actual (el
   * hook lo actualiza imperativamente en vivo durante la interacción,
   * sin pasar por acá).
   */
  svgRef?: React.RefObject<SVGSVGElement | null>;
  contentGroupRef?: React.RefObject<SVGGElement | null>;
  contentTransform?: string;
}

// ─────────────────────────────────────────────────────────────────
// CONSTANTES DE DISEÑO
// ─────────────────────────────────────────────────────────────────

/** Espacio para etiquetas N/E/S/W fuera del círculo — proporcional a `size`, ver JSDoc de archivo. */
function marginFor(size: number): number {
  return Math.max(24, Math.round(size * 0.09));
}
const TITLE_BAND = 30; // franja reservada arriba cuando hay título (Etapa 10)
const DEG2RAD = Math.PI / 180;
const CLR_BORDER = '#1e293b';
const CLR_CROSSHAIR = '#94a3b8';
const CLR_TICK_MINOR = '#cbd5e1';
const CLR_TICK_MAJOR = '#64748b';
const CLR_LABEL = '#334155';

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

/**
 * Punto sobre un círculo de radio r a un azimut dado (0-360°, desde el
 * Norte, sentido horario) — MISMA fórmula que projectLine()/projectPole()
 * de stereonet.ts (x=r·sin(az), y=r·cos(az)), a propósito: así las marcas
 * de graduación del borde quedan en el mismo sistema de coordenadas
 * matemático que cualquier dato futuro, y basta un solo `toScreen` para
 * pasar ambos a pantalla.
 */
function pointOnCircle(azimuthDeg: number, r: number): Point2D {
  const rad = azimuthDeg * DEG2RAD;
  return { x: r * Math.sin(rad), y: r * Math.cos(rad) };
}

// ─────────────────────────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────────────────────────

export default function StereonetBase({
  size = 480,
  defaultProjection = 'schmidt',
  projection: controlledProjection,
  onProjectionChange,
  hideToggle = false,
  children,
  fixedOverlay,
  title,
  fontFamily,
  fontSize = 15,
  lineThicknessScale = 1,
  showGrid = true,
  bottomBandHeight = 0,
  svgRef,
  contentGroupRef,
  contentTransform,
}: StereonetBaseProps) {
  const [internalProjection, setInternalProjection] = useState<Projection>(defaultProjection);
  const projection = controlledProjection ?? internalProjection;

  function selectProjection(next: Projection) {
    if (controlledProjection === undefined) setInternalProjection(next);
    onProjectionChange?.(next);
  }

  const titleBand = title ? TITLE_BAND : 0;
  const cx = size / 2;
  const cy = size / 2 + titleBand;
  const bandTop = size + titleBand; // borde superior de la banda de leyenda (abajo del círculo)
  const svgHeight = bandTop + bottomBandHeight;
  const radius = size / 2 - marginFor(size);
  const toScreen = (p: Point2D): Point2D => ({ x: cx + p.x, y: cy - p.y });

  const ctx: StereonetRenderContext = { projection, radius, cx, cy, toScreen, width: size, height: svgHeight, bandTop };

  // Marcas de graduación: cada 10°, más largas/oscuras cada 30°, con
  // etiqueta de texto solo en los 4 cardinales (N/E/S/W) — evita saturar
  // el borde de texto mientras conserva referencia angular fina.
  const ticks: React.ReactNode[] = [];
  for (let az = 0; az < 360; az += 10) {
    const isCardinal = az % 90 === 0;
    const isMajor = az % 30 === 0;
    const tickLen = isCardinal ? 14 : isMajor ? 9 : 5;
    const outer = pointOnCircle(az, radius);
    const inner = pointOnCircle(az, radius - tickLen);
    const p1 = toScreen(outer);
    const p2 = toScreen(inner);
    ticks.push(
      <line
        key={`tick-${az}`}
        x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
        stroke={isCardinal ? CLR_TICK_MAJOR : isMajor ? CLR_TICK_MAJOR : CLR_TICK_MINOR}
        strokeWidth={(isCardinal ? 1.6 : 1) * lineThicknessScale}
      />,
    );
  }

  const cardinalLabels: { az: number; text: string }[] = [
    { az: 0, text: 'N' }, { az: 90, text: 'E' }, { az: 180, text: 'S' }, { az: 270, text: 'W' },
  ];

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      {!hideToggle && (
        <div role="group" aria-label="Proyección del estereograma" style={{ display: 'flex', gap: 4 }}>
          {(['schmidt', 'wulff'] as Projection[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => selectProjection(p)}
              aria-pressed={projection === p}
              className={`hud-toggle-btn${projection === p ? ' active' : ''}`}
            >
              {p === 'schmidt' ? 'Schmidt (equiareal)' : 'Wulff (equiangular)'}
            </button>
          ))}
        </div>
      )}

      <svg ref={svgRef} width={size} height={svgHeight} viewBox={`0 0 ${size} ${svgHeight}`} fontFamily={fontFamily} style={{ touchAction: 'none' }}>
        {title && (
          <text x={cx} y={TITLE_BAND / 2 + 4} textAnchor="middle" fontSize={fontSize + 2} fontWeight={700} fill={CLR_LABEL}>
            {title}
          </text>
        )}

        {/* Zoom/pan (Etapa 2) — envuelve grilla+borde+etiquetas cardinales, NUNCA el
            título (queda fijo como chrome de UI, ver JSDoc de StereonetBaseProps).
            `transform` es el string sincronizado; durante la interacción, el hook lo
            sobreescribe directo en el nodo DOM sin pasar por acá — ver useImperativeZoomPan.ts.
            data-testid (paquete de mejoras — exportación de figura combinada,
            exportReportFigure.ts) — le permite a esa función encontrar y RESETEAR
            este transform en un CLON del SVG (nunca en el nodo real en pantalla),
            así la figura de informe siempre exporta la vista completa sin zoom
            sin tocar el zoom/pan que el usuario tiene activo en su sesión. */}
        <g ref={contentGroupRef} transform={contentTransform} data-testid="zoom-content-group">
          {showGrid && (
            <>
              {/* Cruz N-S / E-W — referencia visual trivial, sin geometría nueva. */}
              <line x1={toScreen(pointOnCircle(0, radius)).x} y1={toScreen(pointOnCircle(0, radius)).y}
                    x2={toScreen(pointOnCircle(180, radius)).x} y2={toScreen(pointOnCircle(180, radius)).y}
                    stroke={CLR_CROSSHAIR} strokeWidth={1 * lineThicknessScale} />
              <line x1={toScreen(pointOnCircle(90, radius)).x} y1={toScreen(pointOnCircle(90, radius)).y}
                    x2={toScreen(pointOnCircle(270, radius)).x} y2={toScreen(pointOnCircle(270, radius)).y}
                    stroke={CLR_CROSSHAIR} strokeWidth={1 * lineThicknessScale} />

              {ticks}
            </>
          )}

          {/* Borde del círculo unitario del estereograma — nunca se oculta, encima de la cruz/ticks cuando están. */}
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke={CLR_BORDER} strokeWidth={2 * lineThicknessScale} />

          {cardinalLabels.map(({ az, text }) => {
            const p = toScreen(pointOnCircle(az, radius + 20));
            return (
              <text key={text} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
                    fontSize={fontSize} fontWeight={600} fill={CLR_LABEL}>
                {text}
              </text>
            );
          })}

          {/* Overlay de datos (etapa posterior) — se re-evalúa en cada render, así que sigue la proyección activa automáticamente. */}
          {children?.(ctx)}
        </g>

        {/* Overlay fijo (leyenda) — fuera del <g> de zoom a propósito, ver JSDoc de StereonetBaseProps. */}
        {fixedOverlay?.(ctx)}
      </svg>
    </div>
  );
}
