/**
 * src/hidrogeo/IonRatioDiagram.tsx
 * Etapa 7 — diagrama de relaciones iónicas: bivariante y genérico, el
 * usuario elige libremente qué va en cada eje (un ion individual en mg/L
 * o meq/L, o una relación numerador/denominador entre 2 iones — ver
 * ionicRatios.ts). Estilo visual ajustado a la figura de referencia
 * (Iconos/Hidrogeoquimica/Relaciones_cationicas.png): grilla completa,
 * borde negro sólido, mismo lenguaje que ClConductivityDiagram.tsx.
 *
 * EJE X: log fijo (pedido explícito).
 * EJE Y: la referencia en sí lo muestra LINEAL (0.00 a 1.20, sin
 * escala log) — pero como acá el usuario puede poner cualquier ion o
 * relación en Y (a diferencia de la referencia, que es un gráfico de
 * propósito fijo tipo Gibbs), un ion en mg/L puede fácilmente abarcar
 * varios órdenes de magnitud entre muestras. Decisión (no especificada
 * en el pedido, pedida explícitamente documentar): Y arranca en LINEAL
 * por defecto (fiel a la referencia) pero con un toggle log/lineal —
 * más flexible que fijarlo, sin perder fidelidad visual en el caso por
 * defecto.
 *
 * Muestras excluidas del scatter (con aviso) si axisFieldValue() da null
 * para cualquiera de los 2 ejes (ion no disponible, o relación con
 * denominador 0 — ver ionicRatios.ts), o si el valor no es positivo en
 * un eje que esté en escala log (log(0) o log(negativo) no se puede
 * graficar).
 */

import React from 'react';
import type { WaterSample } from './hydroTypes';
import { DEFAULT_PALETTE, buildColorMap } from './sampleColor';
import { autoLogRange, logDecadeTicks, logY } from './logScale';
import { axisFieldLabel, axisFieldValue, type AxisField } from './ionicRatios';
import {
  DEFAULT_CHART_FONT_SIZE, DEFAULT_CHART_LINE_THICKNESS, DEFAULT_CHART_POINT_SIZE,
  DEFAULT_FONT_FAMILY, DEFAULT_LEGEND_POSITION, legendPositionStyle, LegendStyle,
} from '../shared/chartStyle';

// ─────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────

export type AxisScale = 'log' | 'linear';

export interface IonRatioDiagramProps {
  samples: WaterSample[];
  xField: AxisField;
  yField: AxisField;
  /** Escala del eje Y — el eje X siempre es log (pedido explícito), ver JSDoc de archivo. */
  yScale: AxisScale;
  width?: number;
  height?: number;
  colorBy?: (sample: WaterSample) => string;

  // ── Etapa 4.5b (conectado ahora) — ChartStyleSettings genérico, chartStyle.ts ──
  title?: string;
  fontFamily?: string;
  /** Escala PROPORCIONALMENTE los tamaños de texto (ticks, títulos de eje, leyenda) — idéntico al diseño original en DEFAULT_CHART_FONT_SIZE. */
  fontSize?: number;
  /** Grosor del borde + grilla de fondo — escala PROPORCIONALMENTE los grosores originales de cada uno. */
  lineThickness?: number;
  /** Radio de los puntos de muestra — escala PROPORCIONALMENTE el radio original (PT_R). */
  pointSize?: number;
  /** Oculta la grilla de fondo (líneas verticales/horizontales en cada tick). El borde, los ejes y los puntos nunca se ocultan. */
  showGrid?: boolean;
  legend?: LegendStyle;
}

// ─────────────────────────────────────────────────────────────────
// CONSTANTES DE DISEÑO
// ─────────────────────────────────────────────────────────────────

const MARGIN_L = 66;
const MARGIN_R = 20;
const MARGIN_T = 16;
const MARGIN_B = 54;

const CLR_AXIS = '#0f172a';
const CLR_GRID = '#cbd5e1';
const CLR_LABEL = '#0f172a';
const PT_R = 3.4;
const LINEAR_TICK_COUNT = 6;

function fmtTick(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

/** count valores evenly repartidos entre min y max, ambos inclusive — ticks de un eje lineal (no "redondos", pero el rango es data-driven, no fijo). */
function linearTicks(min: number, max: number, count: number): number[] {
  if (max === min) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

// ─────────────────────────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────────────────────────

export function IonRatioDiagram({
  samples,
  xField,
  yField,
  yScale,
  width  = 680,
  height = 440,
  colorBy,
  title,
  fontFamily    = DEFAULT_FONT_FAMILY,
  fontSize      = DEFAULT_CHART_FONT_SIZE,
  lineThickness = DEFAULT_CHART_LINE_THICKNESS,
  pointSize     = DEFAULT_CHART_POINT_SIZE,
  showGrid      = true,
  legend        = { visible: true, position: DEFAULT_LEGEND_POSITION },
}: IonRatioDiagramProps) {
  const groupOf = colorBy ?? ((s: WaterSample) => s.name);

  const raw = samples.map((s) => ({
    id: s.id,
    sample: s,
    x: axisFieldValue(s, xField),
    y: axisFieldValue(s, yField),
  }));

  // X siempre log → x debe ser > 0. Y solo si yScale==='log'.
  const valid = raw.filter((r) =>
    r.x != null && r.x > 0 && r.y != null && (yScale === 'linear' || r.y > 0),
  ) as Array<{ id: string; sample: WaterSample; x: number; y: number }>;
  const excluded = samples.length - valid.length;

  const colorMap = buildColorMap(valid.map((r) => r.sample), groupOf);

  const fontScale = fontSize / DEFAULT_CHART_FONT_SIZE;
  const lineScale = lineThickness / DEFAULT_CHART_LINE_THICKNESS;
  const pointR = PT_R * (pointSize / DEFAULT_CHART_POINT_SIZE);
  const titleSpace = title ? 22 : 0;

  const plotW = width  - MARGIN_L - MARGIN_R;
  const plotH = height - MARGIN_T - MARGIN_B - titleSpace;
  const xLeft  = MARGIN_L;
  const xRight = MARGIN_L + plotW;
  const yTop = MARGIN_T + titleSpace;
  const yBot = yTop + plotH;

  const xValues = valid.map((r) => r.x);
  const yValues = valid.map((r) => r.y);

  const { min: xMin, max: xMax } = xValues.length ? autoLogRange(xValues) : { min: 0.1, max: 10 };
  const xTicks = logDecadeTicks(xMin, xMax);
  const px = (v: number) => logY(v, xMin, xMax, xRight, xLeft);

  let py: (v: number) => number;
  let yTicks: number[];
  if (yScale === 'log') {
    const { min: yMin, max: yMax } = yValues.length ? autoLogRange(yValues) : { min: 0.1, max: 10 };
    py = (v: number) => logY(v, yMin, yMax, yTop, yBot);
    yTicks = logDecadeTicks(yMin, yMax);
  } else {
    const rawMin = yValues.length ? Math.min(...yValues) : 0;
    const rawMax = yValues.length ? Math.max(...yValues) : 1;
    const pad = Math.max((rawMax - rawMin) * 0.1, 1e-6);
    const yMin = rawMin - pad;
    const yMax = rawMax + pad;
    py = (v: number) => yBot + ((v - yMin) / (yMax - yMin)) * (yTop - yBot);
    yTicks = linearTicks(yMin, yMax, LINEAR_TICK_COUNT);
  }

  const points = valid.map((r) => ({
    id: r.id,
    x: px(r.x),
    y: py(r.y),
    color: colorMap.get(groupOf(r.sample)) ?? DEFAULT_PALETTE[0],
  }));

  const xLabel = axisFieldLabel(xField);
  const yLabel = axisFieldLabel(yField);

  return (
    <div style={{ position: 'relative', width, fontFamily }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >
        {/* ── Título (opcional) — reserva su propio espacio (titleSpace) ── */}
        {title && (
          <text x={(width / 2).toFixed(1)} y={16} textAnchor="middle" fontSize={13 * fontScale} fontWeight={700}
                fill={CLR_AXIS} fontFamily={fontFamily}>
            {title}
          </text>
        )}

        {/* ── Grilla ── */}
        {showGrid && (
        <g stroke={CLR_GRID} strokeWidth={0.6 * lineScale}>
          {xTicks.map((v) => (
            <line key={`v${v}`} x1={px(v).toFixed(1)} y1={yTop} x2={px(v).toFixed(1)} y2={yBot} />
          ))}
          {yTicks.map((v) => (
            <line key={`h${v}`} x1={xLeft} y1={py(v).toFixed(1)} x2={xRight} y2={py(v).toFixed(1)} />
          ))}
        </g>
        )}

        {/* ── Borde ── */}
        <rect x={xLeft} y={yTop} width={plotW} height={plotH} fill="none" stroke={CLR_AXIS} strokeWidth={1.6 * lineScale} />

        {/* ── Ticks + etiqueta eje X (siempre log) ── */}
        <g fontSize={11.5 * fontScale} fill={CLR_LABEL} fontFamily={fontFamily} textAnchor="middle">
          {xTicks.map((v) => (
            <text key={v} x={px(v).toFixed(1)} y={(yBot + 20).toFixed(1)}>{fmtTick(v)}</text>
          ))}
        </g>
        <text
          x={(xLeft + plotW / 2).toFixed(1)} y={(height - 8).toFixed(1)}
          textAnchor="middle" fontSize={15 * fontScale} fontWeight={700} fill={CLR_AXIS} fontFamily={fontFamily}
        >
          {xLabel}
        </text>

        {/* ── Ticks + etiqueta eje Y ── */}
        <g fontSize={11.5 * fontScale} fill={CLR_LABEL} fontFamily={fontFamily} textAnchor="end">
          {yTicks.map((v) => (
            <text key={v} x={(xLeft - 8).toFixed(1)} y={(py(v) + 4).toFixed(1)}>{fmtTick(v)}</text>
          ))}
        </g>
        <text
          x={16} y={(yTop + plotH / 2).toFixed(1)}
          textAnchor="middle" fontSize={15 * fontScale} fontWeight={700} fill={CLR_AXIS} fontFamily={fontFamily}
          transform={`rotate(-90 16 ${(yTop + plotH / 2).toFixed(1)})`}
        >
          {yLabel}
        </text>

        {/* ── Puntos por muestra ── */}
        <g stroke="#0f172a" strokeWidth={0.6}>
          {points.map((p) => (
            <circle key={p.id} cx={p.x.toFixed(2)} cy={p.y.toFixed(2)} r={pointR} fill={p.color} />
          ))}
        </g>
      </svg>

      {/* ── Leyenda + aviso de muestras excluidas ── */}
      {legend.visible && colorMap.size > 0 && (
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', gap: '4px 14px', maxWidth: width - 16,
            padding: '6px 8px', fontSize: 11 * fontScale, fontFamily, color: '#334155',
            background: 'rgba(255,255,255,.88)', borderRadius: 4,
            ...legendPositionStyle(legend.position),
          }}
        >
          {[...colorMap.entries()].map(([label, color]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
      {excluded > 0 && (
        <div style={{ fontSize: 11, color: '#94a3b8', padding: '4px 4px 0' }}>
          {excluded} muestra{excluded === 1 ? '' : 's'} excluida{excluded === 1 ? '' : 's'} (dato no disponible, división por cero, o valor no positivo en un eje logarítmico) — no se muestra{excluded === 1 ? '' : 'n'} en este diagrama.
        </div>
      )}
    </div>
  );
}
