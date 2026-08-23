/**
 * src/hidrogeo/ClConductivityDiagram.tsx
 * Etapa 6 — Diagrama de dispersión Cl vs conductividad eléctrica (EC).
 * Ambos ejes en escala LOGARÍTMICA: la figura de referencia
 * (Iconos/Hidrogeoquimica/Conductividad_Cl.png) muestra los dos ejes
 * log-log (grilla pareja en 1/10/100/1.000/10.000 en X y 10/100/1.000/
 * 10.000 en Y) — se confirmó explícitamente con el usuario seguir la
 * referencia acá en vez del pedido original por texto ("eje X lineal").
 *
 * Cl (eje X) y EC (eje Y) son campos REQUERIDOS de WaterSample — nunca
 * "faltan" en el sentido de undefined, pero un valor ≤0 o no finito no
 * se puede ubicar en una escala logarítmica (log(0) = -Infinito); esas
 * muestras se EXCLUYEN del scatter (con aviso, igual que EhPhDiagram con
 * las muestras sin Eh) en vez de romper el render o inventar un valor.
 *
 * Reutiliza logY()/logDecadeTicks() de logScale.ts para AMBOS ejes — la
 * fórmula es simétrica (interpola en log10 entre un mínimo y un máximo
 * mapeados a dos extremos de pantalla), así que sirve igual para X que
 * para Y solo cambiando qué extremo de pantalla es cuál.
 *
 * Números de eje sin separador de miles ("10000", no "10.000" como en la
 * referencia) — mismo criterio ya aplicado en EhPhDiagram.tsx (punto
 * decimal en vez de coma): consistente con el resto de la app
 * (Schoeller-Berkaloff ya muestra sus ticks log así), no un descuido.
 */

import React from 'react';
import type { WaterSample } from './hydroTypes';
import { DEFAULT_PALETTE, buildColorMap } from './sampleColor';
import { logY } from './logScale';
import {
  DEFAULT_CHART_FONT_SIZE, DEFAULT_CHART_LINE_THICKNESS, DEFAULT_CHART_POINT_SIZE,
  DEFAULT_FONT_FAMILY, DEFAULT_LEGEND_POSITION, legendPositionStyle, LegendStyle,
} from '../shared/chartStyle';

// ─────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────

export interface ClConductivityDiagramProps {
  samples: WaterSample[];
  width?: number;
  height?: number;
  colorBy?: (sample: WaterSample) => string;

  // ── Etapa 4.5b (conectado ahora) — ChartStyleSettings genérico, chartStyle.ts ──
  title?: string;
  fontFamily?: string;
  /** Escala PROPORCIONALMENTE los tamaños de texto (ticks, títulos de eje, leyenda) — idéntico al diseño original en DEFAULT_CHART_FONT_SIZE. */
  fontSize?: number;
  /** Grosor del borde + grilla log-log de fondo — escala PROPORCIONALMENTE los grosores originales de cada uno (no las polilíneas/puntos de datos, que no aplican acá). */
  lineThickness?: number;
  /** Radio de los puntos de muestra — escala PROPORCIONALMENTE el radio original (PT_R). */
  pointSize?: number;
  /** Oculta la grilla log-log de fondo (líneas verticales/horizontales en cada década). El borde, los ejes y los puntos nunca se ocultan. */
  showGrid?: boolean;
  legend?: LegendStyle;
}

// ─────────────────────────────────────────────────────────────────
// CONSTANTES DE DISEÑO
// ─────────────────────────────────────────────────────────────────

const CL_TICKS = [1, 10, 100, 1000, 10000];
const EC_TICKS = [10, 100, 1000, 10000];
// Medio-década de margen a cada lado de los ticks extremos — mismo
// criterio 0.5×/1.5× que autoLogRange() en logScale.ts, aplicado acá a
// un rango FIJO (no data-driven) para calzar con la referencia, que
// tiene un dominio de ejes fijo, no auto-ajustado a los datos.
const CL_MIN = CL_TICKS[0] * 0.5;
const CL_MAX = CL_TICKS[CL_TICKS.length - 1] * 1.5;
const EC_MIN = EC_TICKS[0] * 0.5;
const EC_MAX = EC_TICKS[EC_TICKS.length - 1] * 1.5;

const MARGIN_L = 70;
const MARGIN_R = 20;
const MARGIN_T = 16;
const MARGIN_B = 54;

const CLR_AXIS = '#0f172a';
const CLR_GRID = '#cbd5e1';
const CLR_LABEL = '#0f172a';
const PT_R = 3.4;

// ─────────────────────────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────────────────────────

export function ClConductivityDiagram({
  samples,
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
}: ClConductivityDiagramProps) {
  const groupOf = colorBy ?? ((s: WaterSample) => s.name);

  // EC es opcional (ver hydroTypes.ts): el type-guard lo estrecha a number
  // para las muestras que sí lo traen; el resto se omite del diagrama.
  const valid = samples.filter(
    (s): s is WaterSample & { EC: number } =>
      Number.isFinite(s.Cl) && s.Cl > 0 && s.EC != null && Number.isFinite(s.EC) && s.EC > 0,
  );
  const excluded = samples.length - valid.length;
  const colorMap = buildColorMap(valid, groupOf);

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

  // logY() es simétrica — reutilizada tal cual para el eje X, solo
  // cambia qué extremo de pantalla corresponde al mínimo/máximo del dato.
  const px = (v: number) => logY(v, CL_MIN, CL_MAX, xRight, xLeft);
  const py = (v: number) => logY(v, EC_MIN, EC_MAX, yTop, yBot);

  const points = valid.map((s) => ({
    id: s.id,
    x: px(s.Cl),
    y: py(s.EC),
    color: colorMap.get(groupOf(s)) ?? DEFAULT_PALETTE[0],
  }));

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

        {/* ── Grilla log-log (pareja en cada década, como la referencia) ── */}
        {showGrid && (
        <g stroke={CLR_GRID} strokeWidth={0.6 * lineScale}>
          {CL_TICKS.map((v) => (
            <line key={`v${v}`} x1={px(v).toFixed(1)} y1={yTop} x2={px(v).toFixed(1)} y2={yBot} />
          ))}
          {EC_TICKS.map((v) => (
            <line key={`h${v}`} x1={xLeft} y1={py(v).toFixed(1)} x2={xRight} y2={py(v).toFixed(1)} />
          ))}
        </g>
        )}

        {/* ── Borde ── */}
        <rect x={xLeft} y={yTop} width={plotW} height={plotH} fill="none" stroke={CLR_AXIS} strokeWidth={1.6 * lineScale} />

        {/* ── Ticks + etiquetas eje X (Cl, mg/L, log) ── */}
        <g fontSize={12 * fontScale} fill={CLR_LABEL} fontFamily={fontFamily} textAnchor="middle">
          {CL_TICKS.map((v) => (
            <text key={v} x={px(v).toFixed(1)} y={(yBot + 20).toFixed(1)}>{v}</text>
          ))}
        </g>
        <text
          x={(xLeft + plotW / 2).toFixed(1)} y={(height - 8).toFixed(1)}
          textAnchor="middle" fontSize={16 * fontScale} fontWeight={700} fill={CLR_AXIS} fontFamily={fontFamily}
        >
          Cloruro [mg/L]
        </text>

        {/* ── Ticks + etiquetas eje Y (EC, µS/cm, log) ── */}
        <g fontSize={12 * fontScale} fill={CLR_LABEL} fontFamily={fontFamily} textAnchor="end">
          {EC_TICKS.map((v) => (
            <text key={v} x={(xLeft - 8).toFixed(1)} y={(py(v) + 4).toFixed(1)}>{v}</text>
          ))}
        </g>
        <text
          x={16} y={(yTop + plotH / 2).toFixed(1)}
          textAnchor="middle" fontSize={16 * fontScale} fontWeight={700} fill={CLR_AXIS} fontFamily={fontFamily}
          transform={`rotate(-90 16 ${(yTop + plotH / 2).toFixed(1)})`}
        >
          Conductividad eléctrica [µS/cm]
        </text>

        {/* ── Puntos por muestra (solo las que tienen Cl/EC válidos) ── */}
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
          {excluded} muestra{excluded === 1 ? '' : 's'} excluida{excluded === 1 ? '' : 's'} por no tener Cl o EC válidos (mayor que 0) — no se muestra{excluded === 1 ? '' : 'n'} en este diagrama.
        </div>
      )}
    </div>
  );
}
