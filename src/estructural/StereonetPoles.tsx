/**
 * src/estructural/StereonetPoles.tsx
 * Etapa 4 — dibuja el polo de cada PlanarMeasurement sobre StereonetBase
 * (Etapa 3), usando el patrón children(ctx) ya construido ahí y
 * projectPole() de stereonet.ts.
 *
 * `azimut` en PlanarMeasurement YA es dirección de manteo (confirmado en
 * structuralTypes.ts, Etapa 0/1 — ver JSDoc de ese archivo) — se pasa
 * directo a projectPole(), sin pasar por strikeDipToDipDirectionDip()
 * (esa conversión es para datos importados en rumbo/dip, no para el
 * modelo interno ya normalizado).
 *
 * ── Tooltip: por qué position:'fixed' + coordenadas del mouse, no un
 *    div posicionado sobre coordenadas del SVG (como en PiperDiagram) ──
 * StereonetBase ya envuelve el <svg> en su propio layout (toggle +
 * columna flex) sin exponer un ref ni el offset exacto del <svg> dentro
 * de ese layout — acoplarse a esa estructura interna para calcular
 * left/top relativos sería frágil. Usar `clientX/clientY` del evento de
 * mouse + `position:'fixed'` da la misma experiencia sin depender de
 * ningún detalle interno de StereonetBase.
 */

import React, { useState } from 'react';
import StereonetBase, { StereonetRenderContext } from './StereonetBase';
import { projectPole } from './stereonet';
import type { PlanarMeasurement } from './structuralTypes';

export interface StereonetPolesProps {
  measurements: PlanarMeasurement[];
  size?: number;
  defaultProjection?: 'schmidt' | 'wulff';
  /** Radio del punto del polo, en px de pantalla. Default 5. */
  pointRadius?: number;
  color?: string;
}

interface HoverState {
  measurement: PlanarMeasurement;
  clientX: number;
  clientY: number;
}

export default function StereonetPoles({
  measurements,
  size = 480,
  defaultProjection = 'schmidt',
  pointRadius = 5,
  color = '#2563eb',
}: StereonetPolesProps) {
  const [hover, setHover] = useState<HoverState | null>(null);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <StereonetBase size={size} defaultProjection={defaultProjection}>
        {(ctx: StereonetRenderContext) => (
          <g>
            {measurements.map((m) => {
              const p = projectPole(m.azimut, m.dip, ctx.projection, ctx.radius);
              const screen = ctx.toScreen(p);
              return (
                <circle
                  key={m.id}
                  data-testid={`pole-${m.id}`}
                  cx={screen.x}
                  cy={screen.y}
                  r={pointRadius}
                  fill={color}
                  stroke="#0f172a"
                  strokeWidth={1}
                  style={{ cursor: 'default' }}
                  onMouseEnter={(e) => setHover({ measurement: m, clientX: e.clientX, clientY: e.clientY })}
                  onMouseMove={(e) =>
                    setHover((h) => (h && h.measurement.id === m.id ? { ...h, clientX: e.clientX, clientY: e.clientY } : h))
                  }
                  onMouseLeave={() => setHover((h) => (h?.measurement.id === m.id ? null : h))}
                />
              );
            })}
          </g>
        )}
      </StereonetBase>

      {hover && (
        <div
          style={{
            position: 'fixed',
            pointerEvents: 'none',
            left: hover.clientX + 12,
            top: hover.clientY + 12,
            background: 'rgba(15,23,42,.94)',
            color: '#f1f5f9',
            border: '1px solid rgba(255,255,255,.15)',
            borderRadius: 4,
            padding: '6px 9px',
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: 'nowrap',
            zIndex: 1000,
          }}
        >
          <div style={{ fontWeight: 700 }}>{hover.measurement.tipo}</div>
          {hover.measurement.cinemática && <div>{hover.measurement.cinemática}</div>}
          <div>
            Az {hover.measurement.azimut.toFixed(0)}° / Dip {hover.measurement.dip.toFixed(0)}°
          </div>
        </div>
      )}
    </div>
  );
}
