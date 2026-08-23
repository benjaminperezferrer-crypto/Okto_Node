/**
 * src/estructural/SvgLegend.tsx
 * Etapa 10 — leyenda simple (swatch + etiqueta) renderizada DENTRO del
 * <svg> del diagrama (no como overlay HTML) — a propósito, para que
 * quede incluida al exportar el diagrama a PNG/SVG (exportChartAsImage
 * de src/shared/exportDiagram.ts solo captura el contenido del <svg>).
 * Compartida por StereonetPlanes.tsx y RoseDiagram.tsx.
 *
 * Etapa de reorganización visual — la leyenda dejó de posicionarse en una
 * ESQUINA superpuesta sobre el área de ploteo (tapaba datos) y pasa a una
 * BANDA reservada DEBAJO del gráfico, centrada horizontalmente: el
 * llamador aumenta el alto del <svg> en `measureLegendHeight(...)` y
 * dibuja la leyenda a partir de `top` (borde superior de esa banda), fuera
 * del círculo/roseta. Sigue dentro del <svg>, así la exportación PNG/SVG la
 * conserva igual que antes.
 */

import React from 'react';

export interface LegendEntry {
  label: string;
  color: string;
}

const PAD = 8;
const GAP_ABOVE = 10; // aire entre el borde inferior del ploteo y la caja de leyenda
function rowHeight(fontSize: number): number { return fontSize + 7; }

/** Alto total (px) que hay que reservar debajo del ploteo para la leyenda — 0 si no hay entradas. Lo usa el llamador para agrandar el alto del <svg>. */
export function measureLegendHeight(entries: LegendEntry[], fontSize = 12): number {
  if (entries.length === 0) return 0;
  return GAP_ABOVE + PAD * 2 + entries.length * rowHeight(fontSize);
}

export interface SvgLegendProps {
  entries: LegendEntry[];
  /** Ancho real del <svg> contenedor — para centrar la caja horizontalmente. */
  svgWidth: number;
  /** Coordenada Y del borde superior de la banda reservada (= alto del ploteo, título incluido). */
  top: number;
  fontFamily?: string;
  fontSize?: number;
}

export function SvgLegend({ entries, svgWidth, top, fontFamily, fontSize = 12 }: SvgLegendProps) {
  if (entries.length === 0) return null;

  const ROW_H = rowHeight(fontSize);
  const SWATCH = fontSize - 2;
  const boxW = 24 + Math.max(...entries.map((e) => e.label.length)) * (fontSize * 0.6);
  const boxH = PAD * 2 + entries.length * ROW_H;

  const x = Math.max(PAD, (svgWidth - boxW) / 2); // centrada, sin salirse por la izquierda
  const y = top + GAP_ABOVE;

  return (
    <g style={{ pointerEvents: 'none' }} fontFamily={fontFamily}>
      <rect x={x} y={y} width={boxW} height={boxH} fill="rgba(255,255,255,0.92)" stroke="#cbd5e1" strokeWidth={1} rx={4} />
      {entries.map((entry, i) => {
        const rowY = y + PAD + i * ROW_H;
        return (
          <g key={entry.label}>
            <rect x={x + PAD} y={rowY} width={SWATCH} height={SWATCH} fill={entry.color} stroke="#0f172a" strokeWidth={0.6} />
            <text x={x + PAD + SWATCH + 5} y={rowY + SWATCH - 1} fontSize={fontSize} fill="#1e293b">
              {entry.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
