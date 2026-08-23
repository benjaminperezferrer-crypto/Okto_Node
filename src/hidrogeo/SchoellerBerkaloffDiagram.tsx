/**
 * src/hidrogeo/SchoellerBerkaloffDiagram.tsx
 * Etapa 8 — rediseño completo del diagrama de Schoeller al formato
 * Schoeller-Berkaloff estilo Diagrammes, fiel a la figura de referencia
 * (Iconos/Hidrogeoquimica/Schoeller-Berkaloff.png): 9 ejes verticales
 * lado a lado — un eje de referencia en meq/L en cada EXTREMO (izquierda
 * y derecha, MISMO rango, escala log) y, entre medio, un eje por ion en
 * ESE ORDEN FIJO (SCHOELLER_COLUMNS, ver schoellerColumns.ts): Ca, Mg,
 * Na+K, Cl, SO4, HCO3+CO3, NO3 — cada uno en mg/L, escala log.
 *
 * PRINCIPIO DE DISEÑO CENTRAL: el diagrama entero posiciona TODO por
 * meq/L, nunca por una escala mg/L independiente por columna. Cada
 * columna de ion tiene su PROPIO rango mg/L (derivado matemáticamente del
 * rango meq/L compartido × el peso equivalente de ese ion — ver
 * schoellerColumns.ts), pero para dibujar un tick o un punto de muestra
 * en esa columna, su valor en mg/L se convierte primero a meq/L
 * (÷ peso equivalente) y se ubica con la MISMA función logY() sobre el
 * MISMO dominio [meqLMin, meqLMax] que usan los 2 ejes meq/L de los
 * extremos. Así, por construcción, cualquier valor queda exactamente a
 * la misma altura visual que su equivalente en meq/L — no hace falta
 * "calibrar a ojo", es una consecuencia matemática directa.
 *
 * Rango meq/L: auto-calculado del rango real de los datos cargados (con
 * holgura, ver autoLogRange en logScale.ts), pero AJUSTABLE a mano
 * después (props `meqLMin`/`meqLMax` opcionales — si se pasan, pisan el
 * auto-cálculo; el panel de edición en HydrogeochemistryModule.tsx los
 * expone como inputs numéricos).
 *
 * ION NO DISPONIBLE EN UNA MUESTRA (hoy, solo NO3 — el resto son campos
 * requeridos de WaterSample): CORTA LA LÍNEA en ese punto — no se
 * interpola un valor inventado, y no se excluye la muestra completa (las
 * otras 6 columnas siguen siendo información real y válida). Ver
 * `buildRuns()`: la polilínea de cada muestra se parte en tramos
 * consecutivos de columnas disponibles; una columna faltante simplemente
 * no aporta punto ni segmento, sin romper el resto del trazo.
 */

import React from 'react';
import type { WaterSample } from './hydroTypes';
import { calculatePercentages } from './hydroCalculations';
import { DEFAULT_PALETTE, buildColorMap } from './sampleColor';
import { autoLogRange, logDecadeTicks, logMinorTicks, logY } from './logScale';
import { SCHOELLER_COLUMNS } from './schoellerColumns';
import {
  DEFAULT_CHART_FONT_SIZE, DEFAULT_CHART_LINE_THICKNESS, DEFAULT_CHART_POINT_SIZE,
  DEFAULT_FONT_FAMILY, DEFAULT_LEGEND_POSITION, legendPositionStyle, LegendStyle,
} from '../shared/chartStyle';

// ─────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────

export interface SchoellerBerkaloffDiagramProps {
  samples: WaterSample[];
  /** Si se omiten, se auto-calculan del rango real de los datos (ver autoLogRange). */
  meqLMin?: number;
  meqLMax?: number;
  width?: number;
  height?: number;
  colorBy?: (sample: WaterSample) => string;

  // ── Etapa 4.5b (conectado ahora) — ChartStyleSettings genérico, chartStyle.ts ──
  /** Título general del diagrama (distinto de los títulos de columna "Ca"/"Mg"/etc., que son fijos y siempre se muestran). */
  title?: string;
  fontFamily?: string;
  /** Escala PROPORCIONALMENTE los tamaños de texto (ticks, títulos de columna, leyenda) — idéntico al diseño original en DEFAULT_CHART_FONT_SIZE. */
  fontSize?: number;
  /** Grosor de las 9 reglas verticales (línea central + ticks mayores/menores) — el equivalente acá de "ejes/líneas de referencia". NO afecta las polilíneas de datos por muestra, que ya tienen su propio estilo (color por clasificación). Escala PROPORCIONALMENTE los grosores originales. */
  lineThickness?: number;
  /** Radio de los marcadores en cada columna disponible — escala PROPORCIONALMENTE el radio original (PT_R). */
  pointSize?: number;
  /** Este diagrama no tiene una grilla rectangular de fondo — "grilla" se mapea a las marcas MENORES (sub-década, sin etiqueta — el "papel milimetrado" fino) de las 9 reglas. Las marcas MAYORES (con número), los títulos de columna, las líneas centrales de los ejes y los datos nunca se ocultan. */
  showGrid?: boolean;
  legend?: LegendStyle;
}

// ─────────────────────────────────────────────────────────────────
// CONSTANTES DE DISEÑO
// ─────────────────────────────────────────────────────────────────

const MARGIN_L = 72;
const MARGIN_R = 72;
const MARGIN_T = 58;
const MARGIN_B = 26;

// Paleta de la referencia: teal para los ejes de ion (mg/L), morado para
// los 2 ejes de meq/L de los extremos — dos tonos distintos, no monocromo,
// a propósito (fidelidad visual pedida "con el mayor detalle posible").
const CLR_ION_AXIS = '#7fbfb2';
const CLR_MEQ_AXIS = '#7c5295';
const CLR_TITLE = '#000000';
const PT_R = 3;

function fmtTick(v: number): string {
  if (v >= 1000) return v.toFixed(0);
  if (v >= 100) return v.toFixed(0);
  if (v >= 1) return v.toFixed(1);
  if (v >= 0.01) return v.toFixed(2);
  return v.toFixed(3);
}

/** [min, ...décadas dentro de min-max, max] sin duplicados, orden ascendente — mismo criterio "muestra el borde real" que la figura de referencia. */
function majorTicksWithBounds(min: number, max: number): number[] {
  const set = new Set<number>([min, ...logDecadeTicks(min, max), max]);
  return [...set].sort((a, b) => a - b);
}

// ─────────────────────────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────────────────────────

export function SchoellerBerkaloffDiagram({
  samples,
  meqLMin: meqLMinProp,
  meqLMax: meqLMaxProp,
  width  = 940,
  height = 780,
  colorBy,
  title,
  fontFamily    = DEFAULT_FONT_FAMILY,
  fontSize      = DEFAULT_CHART_FONT_SIZE,
  lineThickness = DEFAULT_CHART_LINE_THICKNESS,
  pointSize     = DEFAULT_CHART_POINT_SIZE,
  showGrid      = true,
  legend        = { visible: true, position: DEFAULT_LEGEND_POSITION },
}: SchoellerBerkaloffDiagramProps) {
  const groupOf = colorBy ?? ((s: WaterSample) => s.name);
  const fontScale = fontSize / DEFAULT_CHART_FONT_SIZE;
  const lineScale = lineThickness / DEFAULT_CHART_LINE_THICKNESS;
  const pointR = PT_R * (pointSize / DEFAULT_CHART_POINT_SIZE);
  // Los títulos de columna ya ocupan casi todo MARGIN_T (título en y=28,
  // subtítulo "mg/L" en y=46 — ver AxisRuler) — un título general
  // necesita SU PROPIO espacio reservado arriba de eso, igual que en los
  // otros 3 diagramas conectados en esta etapa.
  const titleSpace = title ? 20 : 0;

  // ── Filas de meq/L por muestra + disponibilidad por columna ──
  const rows = samples.map((s) => {
    const { meqL } = calculatePercentages(s);
    const cells = SCHOELLER_COLUMNS.map((col) => {
      const available = col.isAvailable(s);
      const value = available ? col.meqLOf(meqL) : NaN;
      return { available: available && value > 0, value };
    });
    return { id: s.id, sample: s, cells };
  });

  // ── Dominio meq/L compartido — auto de los datos, o manual si se pasó por prop ──
  const allMeqLValues = rows.flatMap((r) => r.cells.filter((c) => c.available).map((c) => c.value));
  const auto = allMeqLValues.length ? autoLogRange(allMeqLValues) : { min: 0.01, max: 100 };
  const meqLMin = meqLMinProp ?? auto.min;
  const meqLMax = meqLMaxProp ?? auto.max;

  const plotW = width  - MARGIN_L - MARGIN_R;
  const yTop  = MARGIN_T + titleSpace;
  const yBot  = height - MARGIN_B;

  const colX = (i: number) => MARGIN_L + (i / 8) * plotW; // 9 columnas (0..8), 8 huecos
  const yForMeqL = (v: number) => logY(v, meqLMin, meqLMax, yTop, yBot);

  const meqLMajor = majorTicksWithBounds(meqLMin, meqLMax);
  const meqLMinor = logMinorTicks(meqLMin, meqLMax);

  // ── Puntos por muestra, con "cortes" donde una columna no está disponible ──
  const colorMap = buildColorMap(
    rows.filter((r) => r.cells.some((c) => c.available)).map((r) => r.sample),
    groupOf,
  );
  const fullyExcluded = rows.filter((r) => !r.cells.some((c) => c.available)).length;
  const missingSome = rows.filter((r) => r.cells.some((c) => !c.available) && r.cells.some((c) => c.available)).length;

  const series = rows.map((r) => {
    const color = colorMap.get(groupOf(r.sample)) ?? DEFAULT_PALETTE[0];
    const points = r.cells.map((c, i) => ({
      x: colX(i + 1), // +1: la columna 0 es el eje meq/L izquierdo
      y: c.available ? yForMeqL(c.value) : NaN,
      available: c.available,
    }));
    // Tramos consecutivos disponibles — una columna faltante corta la línea sin unir a través de ella.
    const runs: Array<Array<{ x: number; y: number }>> = [];
    let current: Array<{ x: number; y: number }> = [];
    for (const p of points) {
      if (p.available) {
        current.push({ x: p.x, y: p.y });
      } else if (current.length) {
        runs.push(current);
        current = [];
      }
    }
    if (current.length) runs.push(current);
    return { id: r.id, color, runs, points: points.filter((p) => p.available) };
  });

  return (
    <div style={{ position: 'relative', width, fontFamily }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >
        {/* ── Título general (opcional) — reserva su propio espacio (titleSpace), no compite con los títulos de columna ── */}
        {title && (
          <text x={(width / 2).toFixed(1)} y={16} textAnchor="middle" fontSize={14 * fontScale} fontWeight={700}
                fill={CLR_TITLE} fontFamily={fontFamily}>
            {title}
          </text>
        )}

        {/* ── Eje meq/L izquierdo ── */}
        <AxisRuler x={colX(0)} yTop={yTop} yBot={yBot} major={meqLMajor} minor={meqLMinor} yForValue={yForMeqL}
          color={CLR_MEQ_AXIS} labelSide="left" title="meq/L" titleColor={CLR_MEQ_AXIS}
          fontFamily={fontFamily} fontScale={fontScale} lineScale={lineScale} showMinor={showGrid} />

        {/* ── 7 ejes de ion, calibrados desde el meq/L compartido ── */}
        {SCHOELLER_COLUMNS.map((col, i) => {
          const eqW = col.nominalEquivalentWeight;
          const mgLMin = meqLMin * eqW;
          const mgLMax = meqLMax * eqW;
          const major = majorTicksWithBounds(mgLMin, mgLMax);
          const minor = logMinorTicks(mgLMin, mgLMax);
          const yForMgL = (v: number) => yForMeqL(v / eqW);
          return (
            <AxisRuler
              key={col.key}
              x={colX(i + 1)} yTop={yTop} yBot={yBot}
              major={major} minor={minor} yForValue={yForMgL}
              color={CLR_ION_AXIS} labelSide="right"
              title={col.title} titleColor={CLR_TITLE} subtitle="mg/L" subtitleColor={CLR_ION_AXIS}
              fontFamily={fontFamily} fontScale={fontScale} lineScale={lineScale} showMinor={showGrid}
            />
          );
        })}

        {/* ── Eje meq/L derecho ── */}
        <AxisRuler x={colX(8)} yTop={yTop} yBot={yBot} major={meqLMajor} minor={meqLMinor} yForValue={yForMeqL}
          color={CLR_MEQ_AXIS} labelSide="right" title="meq/L" titleColor={CLR_MEQ_AXIS}
          fontFamily={fontFamily} fontScale={fontScale} lineScale={lineScale} showMinor={showGrid} />

        {/* ── Polilíneas + puntos por muestra (datos — NO afectados por lineThickness, ver JSDoc) ── */}
        <g strokeWidth={1.6} fill="none">
          {series.map((s) => (
            <g key={s.id}>
              {s.runs.filter((r) => r.length >= 2).map((r, ri) => (
                <polyline key={ri} points={r.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} stroke={s.color} />
              ))}
              {s.points.map((p, pi) => (
                <circle key={pi} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={pointR} fill={s.color} stroke="#0f172a" strokeWidth={0.5} />
              ))}
            </g>
          ))}
        </g>
      </svg>

      {/* ── Leyenda + avisos ── */}
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
      {missingSome > 0 && (
        <div style={{ fontSize: 11, color: '#94a3b8', padding: '4px 4px 0' }}>
          {missingSome} muestra{missingSome === 1 ? '' : 's'} sin dato de NO₃ — su línea no llega a esa columna (no se inventa un valor).
        </div>
      )}
      {fullyExcluded > 0 && (
        <div style={{ fontSize: 11, color: '#94a3b8', padding: '2px 4px 0' }}>
          {fullyExcluded} muestra{fullyExcluded === 1 ? '' : 's'} excluida{fullyExcluded === 1 ? '' : 's'} por no tener ningún ion con valor positivo — no se muestra{fullyExcluded === 1 ? '' : 'n'} en este diagrama.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// UN EJE VERTICAL ("regla" log con ticks mayores/menores)
// ─────────────────────────────────────────────────────────────────

interface AxisRulerProps {
  x: number;
  yTop: number;
  yBot: number;
  major: number[];
  minor: number[];
  yForValue: (v: number) => number;
  color: string;
  labelSide: 'left' | 'right';
  title: string;
  titleColor: string;
  subtitle?: string;
  subtitleColor?: string;
  fontFamily: string;
  fontScale: number;
  lineScale: number;
  /** false = oculta las marcas MENORES (sub-década, sin etiqueta) — ver JSDoc de showGrid en SchoellerBerkaloffDiagramProps. Las marcas MAYORES, la línea central y los títulos nunca se ocultan. */
  showMinor: boolean;
}

/**
 * Una regla vertical de escala log: línea central + marcas cortas (menores,
 * sin etiqueta) y largas (mayores, con número) perpendiculares a ella —
 * mismo estilo "papel milimetrado" que la figura de referencia, en vez del
 * borde+grilla rectangular que usan los demás diagramas nuevos de este
 * módulo (EhPh, Cl-EC, relaciones iónicas) — la referencia de ESTE
 * diagrama específicamente es así, sin recuadro.
 */
function AxisRuler({
  x, yTop, yBot, major, minor, yForValue, color, labelSide, title, titleColor, subtitle, subtitleColor,
  fontFamily, fontScale, lineScale, showMinor,
}: AxisRulerProps) {
  const tickLen = { minor: 5, major: 9 };
  const sign = labelSide === 'left' ? -1 : 1;
  const labelX = x + sign * (tickLen.major + 4);
  const textAnchor = labelSide === 'left' ? 'end' : 'start';

  return (
    <g>
      <line x1={x.toFixed(1)} y1={yTop.toFixed(1)} x2={x.toFixed(1)} y2={yBot.toFixed(1)} stroke={color} strokeWidth={1.3 * lineScale} />
      {showMinor && (
      <g stroke={color} strokeWidth={0.8 * lineScale}>
        {minor.map((v) => {
          const y = yForValue(v);
          return <line key={`mi${v}`} x1={(x - tickLen.minor).toFixed(1)} y1={y.toFixed(1)} x2={(x + tickLen.minor).toFixed(1)} y2={y.toFixed(1)} />;
        })}
      </g>
      )}
      <g stroke={color} strokeWidth={1.1 * lineScale}>
        {major.map((v) => {
          const y = yForValue(v);
          return <line key={`ma${v}`} x1={(x - tickLen.major).toFixed(1)} y1={y.toFixed(1)} x2={(x + tickLen.major).toFixed(1)} y2={y.toFixed(1)} />;
        })}
      </g>
      <g fontSize={11 * fontScale} fill={color} fontFamily={fontFamily} textAnchor={textAnchor}>
        {major.map((v) => {
          const y = yForValue(v);
          return <text key={v} x={labelX.toFixed(1)} y={(y + 3.5).toFixed(1)}>{fmtTick(v)}</text>;
        })}
      </g>
      <text x={x.toFixed(1)} y={(yTop - (subtitle ? 30 : 12)).toFixed(1)} textAnchor="middle" fontSize={18 * fontScale} fontWeight={700} fill={titleColor} fontFamily={fontFamily}>
        {title}
      </text>
      {subtitle && (
        <text x={x.toFixed(1)} y={(yTop - 12).toFixed(1)} textAnchor="middle" fontSize={12 * fontScale} fill={subtitleColor} fontFamily={fontFamily}>
          {subtitle}
        </text>
      )}
    </g>
  );
}
