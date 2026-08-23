/**
 * src/hidrogeo/StiffDiagram.tsx
 * Etapa 10 — Diagrama de Stiff (una sola WaterSample, no comparativo como
 * Piper): 3 ejes horizontales hacia la izquierda para cationes (Na+K, Ca,
 * Mg) y 3 hacia la derecha para aniones (Cl, HCO₃+CO₃, SO₄), en meq/L,
 * cerrados en un polígono relleno. Orden de vértices y lógica verificados
 * contra stiff.py (ver stiffGeometry.ts para el detalle y la fuente).
 *
 * Reutiliza calculatePercentages() de hydroCalculations.ts vía
 * getStiffValues() — no recalcula ninguna conversión mg/L → meq/L.
 *
 * Etapa 4.5b: `numbersColor`/`numbersFont`/`numbersFontSize` se
 * RETIRARON — `fontFamily`/`fontSize` vienen ahora de ChartStyleSettings
 * (chartStyle.ts, vía StiffGrid en HydrogeochemistryModule.tsx), y el
 * color queda fijo en DEFAULT_NUMBERS_COLOR (ver nota en stiffStyle.ts).
 * También se agregan `lineThickness` (grosor de los ejes horizontales +
 * espina vertical — el equivalente de Stiff a "ejes/líneas de
 * referencia") y `showGrid` (oculta esos mismos ejes; el polígono de
 * datos y las etiquetas nunca se ocultan, no son "grilla").
 */

import React from 'react';
import type { WaterSample } from './hydroTypes';
import { getStiffValues, stiffDataMax, stiffPolygon } from './stiffGeometry';
import { DEFAULT_PALETTE } from './sampleColor';
import { DEFAULT_NUMBERS_COLOR } from './stiffStyle';
import {
  DEFAULT_CHART_FONT_SIZE, DEFAULT_CHART_LINE_THICKNESS, DEFAULT_CHART_POINT_SIZE, DEFAULT_FONT_FAMILY,
} from '../shared/chartStyle';

// ─────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────

export interface StiffDiagramProps {
  sample: WaterSample;
  width?: number;
  height?: number;
  /** Escala fija (± meq/L), útil para comparar varias muestras con el mismo eje. */
  scaleMax?: number;
  /**
   * Si no se pasa `scaleMax`: true (default) autoescala al máximo de la
   * propia muestra; false usa DEFAULT_SCALE_MAX en su lugar.
   */
  autoScale?: boolean;
  color?: string;
  /** Tipografía de "los números": etiquetas de eje, valores de escala, leyenda de escala — ver ChartStyleSettings.fontFamily/fontSize en chartStyle.ts. */
  fontFamily?: string;
  fontSize?: number;
  /** Grosor de los ejes horizontales + espina vertical — ver ChartStyleSettings.lineThickness. NO afecta el trazo del polígono de datos (eso tiene su propio estilo, por muestra/grupo). */
  lineThickness?: number;
  /** Oculta los ejes horizontales + espina vertical (el equivalente de Stiff a una "grilla" — ver ChartStyleSettings.showGrid). El polígono y las etiquetas nunca se ocultan. */
  showGrid?: boolean;
  /** Radio de los marcadores en cada vértice del polígono ("tamaño en puntos/polígonos" — Stiff no tiene puntos de muestra sueltos como Piper, así que ChartStyleSettings.pointSize se aplica acá como marcadores sobre los 6 vértices del polígono, sin distorsionar la forma/escala de los datos). */
  pointSize?: number;
}

// ─────────────────────────────────────────────────────────────────
// CONSTANTES DE DISEÑO
// ─────────────────────────────────────────────────────────────────

const MARGIN_L = 74;   // espacio para etiquetas de cationes
const MARGIN_R = 96;   // espacio para etiquetas de aniones ("HCO₃+CO₃" es la más larga)
const MARGIN_T = 34;   // espacio para el título (nombre de la muestra)
const MARGIN_B = 24;   // espacio para la leyenda de escala
const DEFAULT_SCALE_MAX = 10; // meq/L — solo si autoScale=false y no hay scaleMax
const CLR_AXIS  = '#64748b'; // color fijo de las líneas de los ejes — no es parte de "los números"
const CLR_TITLE = '#0f172a'; // color fijo del nombre de la muestra — tampoco es parte de "los números"
const BASE_AXIS_STROKE = 0.8; // grosor original de los ejes — lineThickness escala PROPORCIONALMENTE a partir de acá, mismo criterio que PiperDiagram.tsx

// ─────────────────────────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────────────────────────

export function StiffDiagram({
  sample,
  width  = 260,
  height = 200,
  scaleMax,
  autoScale = true,
  color = DEFAULT_PALETTE[0],
  fontFamily    = DEFAULT_FONT_FAMILY,
  fontSize      = DEFAULT_CHART_FONT_SIZE,
  lineThickness = DEFAULT_CHART_LINE_THICKNESS,
  showGrid      = true,
  pointSize     = DEFAULT_CHART_POINT_SIZE,
}: StiffDiagramProps) {
  const values = getStiffValues(sample);
  const cmax = scaleMax ?? (autoScale ? Math.max(stiffDataMax(values), 0.01) : DEFAULT_SCALE_MAX);
  const axisStrokeWidth = BASE_AXIS_STROKE * (lineThickness / DEFAULT_CHART_LINE_THICKNESS);

  const centerX = MARGIN_L + (width - MARGIN_L - MARGIN_R) / 2;
  const halfW   = (width - MARGIN_L - MARGIN_R) / 2;
  const topY = MARGIN_T;
  const botY = height - MARGIN_B;
  const midY = (topY + botY) / 2;
  const rowY: Record<1 | 2 | 3, number> = { 3: topY, 2: midY, 1: botY };

  const pts = stiffPolygon(values, cmax).map(p => ({
    x: centerX + p.x * halfW,
    y: rowY[p.y],
  }));
  const polyStr = pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', fontFamily }}
    >
      {/* ── Título (nombre de la muestra) — color fijo, no es parte de "los números" ── */}
      <text x={centerX.toFixed(1)} y={16} textAnchor="middle" fontSize={11} fontWeight={700} fill={CLR_TITLE}>
        {sample.name}
      </text>

      {/* ── Ejes horizontales + espina vertical central (= "grilla" de Stiff — ver JSDoc de showGrid) ── */}
      {showGrid && (
      <g stroke={CLR_AXIS} strokeWidth={axisStrokeWidth}>
        {[topY, midY, botY].map((y, i) => (
          <line key={i} x1={(centerX - halfW).toFixed(1)} y1={y.toFixed(1)} x2={(centerX + halfW).toFixed(1)} y2={y.toFixed(1)} />
        ))}
        <line x1={centerX.toFixed(1)} y1={topY.toFixed(1)} x2={centerX.toFixed(1)} y2={botY.toFixed(1)} />
      </g>
      )}

      {/* ── Etiquetas de fila — cationes (izquierda) ── */}
      <g fontSize={fontSize} fontFamily={fontFamily} fill={DEFAULT_NUMBERS_COLOR} textAnchor="end">
        <text x={(centerX - halfW - 8).toFixed(1)} y={(topY + 3).toFixed(1)}>Na+K</text>
        <text x={(centerX - halfW - 8).toFixed(1)} y={(midY + 3).toFixed(1)}>Ca</text>
        <text x={(centerX - halfW - 8).toFixed(1)} y={(botY + 3).toFixed(1)}>Mg</text>
      </g>

      {/* ── Etiquetas de fila — aniones (derecha) ── */}
      <g fontSize={fontSize} fontFamily={fontFamily} fill={DEFAULT_NUMBERS_COLOR} textAnchor="start">
        <text x={(centerX + halfW + 8).toFixed(1)} y={(topY + 3).toFixed(1)}>Cl</text>
        <text x={(centerX + halfW + 8).toFixed(1)} y={(midY + 3).toFixed(1)}>HCO₃+CO₃</text>
        <text x={(centerX + halfW + 8).toFixed(1)} y={(botY + 3).toFixed(1)}>SO₄</text>
      </g>

      {/* ── Marcas de escala: 0 al centro, cmax en los extremos ── */}
      <g fontSize={Math.max(7, fontSize - 2)} fontFamily={fontFamily} fill={DEFAULT_NUMBERS_COLOR}>
        <text x={centerX.toFixed(1)} y={(topY - 6).toFixed(1)} textAnchor="middle">0</text>
        <text x={(centerX - halfW).toFixed(1)} y={(topY - 6).toFixed(1)} textAnchor="middle">{cmax.toFixed(1)}</text>
        <text x={(centerX + halfW).toFixed(1)} y={(topY - 6).toFixed(1)} textAnchor="middle">{cmax.toFixed(1)}</text>
      </g>

      {/* ── Polígono de Stiff ── */}
      <polygon points={polyStr} fill={color} fillOpacity={0.35} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />

      {/* ── Marcadores en los vértices ("tamaño en puntos/polígonos" — ver JSDoc de pointSize) ── */}
      <g fill={color} stroke="#0f172a" strokeWidth={0.5}>
        {pts.map((p, i) => (
          <circle key={i} cx={p.x.toFixed(2)} cy={p.y.toFixed(2)} r={Math.min(pointSize, 4)} />
        ))}
      </g>

      {/* ── Leyenda de escala ── */}
      <text x={centerX.toFixed(1)} y={(height - 6).toFixed(1)} textAnchor="middle" fontSize={Math.max(7, fontSize - 1)} fontFamily={fontFamily} fill={DEFAULT_NUMBERS_COLOR}>
        Escala: ±{cmax.toFixed(1)} meq/L
      </text>
    </svg>
  );
}
