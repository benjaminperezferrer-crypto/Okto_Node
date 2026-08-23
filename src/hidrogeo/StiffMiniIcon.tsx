/**
 * src/hidrogeo/StiffMiniIcon.tsx
 * Etapa 10 — variante compacta del Diagrama de Stiff: solo el polígono
 * relleno, sin ejes rotulados, ticks ni título. Pensada para insertarse
 * como símbolo en el visor GIS (MapLibre GL JS) en la ubicación de cada
 * pozo, coloreada por tipo de agua.
 *
 * Nota de integración: este componente es SVG/React puro. Funciona
 * directamente con un `maplibregl.Marker` (contenido DOM arbitrario vía
 * `setDOMContent`). Si en cambio el visor usa una capa `symbol` con
 * GeoJSON + `icon-image`, MapLibre necesita una imagen rasterizada
 * registrada con `map.addImage()` — este SVG habría que renderizarlo a
 * canvas/PNG antes (no lo resuelve este componente).
 *
 * Reutiliza la misma geometría que StiffDiagram.tsx (stiffGeometry.ts) y
 * el mismo esquema de color de sampleColor.ts como color por defecto; la
 * clasificación por tipo de agua (qué color corresponde a qué muestra) es
 * responsabilidad de quien use el componente — se pasa vía la prop `color`.
 */

import React from 'react';
import type { WaterSample } from './hydroTypes';
import { getStiffValues, stiffPolygon } from './stiffGeometry';
import { DEFAULT_PALETTE } from './sampleColor';

// ─────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────

export interface StiffMiniIconProps {
  sample: WaterSample;
  /**
   * Escala fija (± meq/L), OBLIGATORIA a propósito: en un mapa con muchos
   * pozos, todos los íconos deben compartir la misma escala para que el
   * tamaño relativo de cada polígono sea comparable de un vistazo. Si cada
   * ícono autoescalara a su propio máximo, todos se verían igual de
   * "llenos" sin importar la concentración real. Calcúlala una vez sobre
   * el conjunto completo de muestras (p. ej. con stiffDataMax de cada una)
   * y reutilízala para todos los íconos del mapa.
   */
  scaleMax: number;
  width?: number;
  height?: number;
  color?: string;
}

const MARGIN = 2; // margen mínimo para que el trazo no se recorte en el borde

// ─────────────────────────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────────────────────────

export function StiffMiniIcon({
  sample,
  scaleMax,
  width  = 34,
  height = 22,
  color  = DEFAULT_PALETTE[0],
}: StiffMiniIconProps) {
  const values = getStiffValues(sample);
  const cmax = scaleMax > 0 ? scaleMax : 1;

  const centerX = width / 2;
  const halfW   = width / 2 - MARGIN;
  const topY = MARGIN;
  const botY = height - MARGIN;
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
      style={{ display: 'block' }}
    >
      <polygon points={polyStr} fill={color} fillOpacity={0.55} stroke={color} strokeWidth={1} strokeLinejoin="round" />
    </svg>
  );
}
