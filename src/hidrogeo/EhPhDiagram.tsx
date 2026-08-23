/**
 * src/hidrogeo/EhPhDiagram.tsx
 * Etapa 5 — Diagrama Eh-pH (Merkel y Planer-Friedrich): scatter de
 * muestras (pH en X, Eh en Voltios en Y) sobre `EhPhReferenceLayer`, la
 * capa de fondo fija — 2 líneas de estabilidad del agua calculadas + 3
 * bandas ambientales + 1 etiqueta flotante, todas digitalizadas de la
 * figura de referencia (Iconos/Hidrogeoquimica/Merkel_Planer.png, datos en
 * ehPhReference.ts). `EhPhReferenceLayer` es un componente aparte,
 * independiente de las muestras del usuario — recibe solo `px`/`py` (la
 * transformación de coordenadas) y no sabe nada de WaterSample, así que es
 * reutilizable/ajustable sin tocar el scatter.
 *
 * WaterSample.Eh vive en mV (hydroTypes.ts) — se convierte a V (÷1000)
 * para graficar, porque tanto el eje de este diagrama como las
 * coordenadas de la capa de referencia están en Voltios (convención del
 * propio diagrama Eh-pH, no de WaterSample).
 *
 * Muestras SIN Eh (campo opcional, Etapa 2) se omiten del scatter — no se
 * inventa un valor. Se cuentan y se avisa debajo de la leyenda, para que
 * la ausencia no sea silenciosa.
 *
 * Tipografía/color/disposición ajustados a la figura de referencia: fondo
 * blanco, ejes/bordes negros sólidos, títulos de eje en negrita grande,
 * bandas ambientales como líneas sólidas gruesas con título en negrita +
 * etiquetas de sub-ambiente en itálica, límites de estabilidad como
 * líneas discontinuas de guiones largos (más gruesas que las bandas) con
 * su propia etiqueta. Todo en blanco y negro, sin color — el color queda
 * reservado para los puntos de muestra, que se agregan encima. Diferencia
 * deliberada: los números de los ejes usan punto decimal ("0.75"), no
 * coma ("0,75") como en la figura de origen — para quedar consistentes
 * con el resto de la app (Piper/Schoeller-Berkaloff ya usan punto), no por descuido.
 *
 * Etiquetas paralelas a su línea: tanto el título y las etiquetas de
 * sub-ambiente de cada banda, como las etiquetas O2/H2O/H2 y las
 * descriptivas de las 2 líneas de estabilidad, se rotan al ángulo VISUAL
 * (en píxeles de pantalla, no en datos — pH y Eh tienen escalas visuales
 * muy distintas) de su línea, desplazadas en la dirección PERPENDICULAR a
 * ella (no verticalmente) para quedar a una distancia constante sea cual
 * sea la pendiente — ver `placeAlongLine()`. Incluso la etiqueta flotante
 * ("Residuos saturados en sal", sin línea ambiental propia) se rota al
 * ángulo de la línea de la Banda 1 ("Ambientes en contacto con la
 * atmósfera", debajo de la cual va) — sin esto quedaba como el único
 * texto horizontal en un gráfico donde todo lo demás está inclinado.
 *
 * Líneas de estabilidad recortadas al recuadro vía <clipPath> (no
 * calculando el tramo visible a mano): se dibujan en TODO el rango de pH
 * visible con la fórmula cruda, y el SVG las recorta solo donde el trazo
 * cae fuera del rectángulo del gráfico — así la línea superior, que en
 * pH=1 da Eh=1.17 V (por encima del techo de 1.00 V), se corta limpio en
 * el borde superior en vez de "salirse" del recuadro.
 */

import React from 'react';
import type { WaterSample } from './hydroTypes';
import { DEFAULT_PALETTE, buildColorMap } from './sampleColor';
import {
  EH_PH_ENVIRONMENT_SEGMENTS, EH_PH_FLOATING_LABELS, EH_PH_REFERENCE_TEMPERATURE_NOTE,
  PH_AXIS_MIN, waterStabilityLowerEhV, waterStabilityUpperEhV,
} from './ehPhReference';
import {
  DEFAULT_CHART_FONT_SIZE, DEFAULT_CHART_LINE_THICKNESS, DEFAULT_CHART_POINT_SIZE,
  DEFAULT_FONT_FAMILY, DEFAULT_LEGEND_POSITION, legendPositionStyle, LegendStyle,
} from '../shared/chartStyle';

// ─────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────

export interface EhPhDiagramProps {
  samples: WaterSample[];
  width?: number;
  height?: number;
  colorBy?: (sample: WaterSample) => string;

  // ── Etapa 4.5b (conectado ahora) — ChartStyleSettings genérico, chartStyle.ts ──
  title?: string;
  fontFamily?: string;
  /** Escala PROPORCIONALMENTE todos los tamaños de texto (ticks, títulos de eje, etiquetas de bandas/líneas de estabilidad, leyenda) — en DEFAULT_CHART_FONT_SIZE el resultado es idéntico al diseño original. */
  fontSize?: number;
  /**
   * Grosor del borde del recuadro, los ticks de eje, y las líneas de la
   * capa de referencia (bandas ambientales + límites de estabilidad del
   * agua) — el equivalente acá de "ejes/líneas de referencia" (Eh-pH no
   * tiene una grilla de fondo separada). Escala PROPORCIONALMENTE los
   * grosores originales de cada una (no los reemplaza), preservando su
   * color/patrón de guiones — mismo criterio que outline/dashed en
   * PiperDiagram.tsx.
   */
  lineThickness?: number;
  /** Radio de los puntos de muestra — escala PROPORCIONALMENTE el radio original (PT_R). */
  pointSize?: number;
  /** Eh-pH no tiene grilla de fondo — "grilla" acá se mapea a los TICKS + números de los ejes X/Y (no al borde del recuadro, ni a la capa de referencia, ni a los puntos de muestra, que son contenido, no grilla). */
  showGrid?: boolean;
  legend?: LegendStyle;
}

type PxFn = (pH: number) => number;
type PyFn = (ehV: number) => number;

// ─────────────────────────────────────────────────────────────────
// CONSTANTES DE DISEÑO
// ─────────────────────────────────────────────────────────────────

// Único origen de verdad para "dónde arranca el eje pH visible" — ver nota
// en ehPhReference.ts (PH_AXIS_MIN), necesaria tanto para el dominio del
// eje acá como para interpretar los interceptos de las bandas ahí.
const PH_MIN = PH_AXIS_MIN;
const PH_MAX = 14;
const EH_MIN = -1;
const EH_MAX = 1;
const PH_TICKS = [2, 4, 6, 8, 10, 12, 14];
const EH_TICKS = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];

const MARGIN_L = 62;
const MARGIN_R = 22;
const MARGIN_T = 20;
const MARGIN_B = 56;

const CLR_AXIS = '#000000';
const CLR_ENV_LINE = '#000000';
const CLR_LIMIT_LINE = '#000000';
const CLR_LIMIT_LABEL = '#000000';
const PT_R = 3.4;

const CLIP_ID = 'ehph-plot-clip';

function fmtEh(v: number): string {
  return v === 0 ? '0.00' : v.toFixed(2);
}

/**
 * Posiciona una etiqueta a lo largo de la línea recta (fromPh,fromEh)→
 * (toPh,toEh): `t` ubica el punto base sobre la línea (0=from, 1=to);
 * `perpOffset` la desplaza en la dirección PERPENDICULAR a la línea EN
 * PANTALLA (positivo = hacia arriba visualmente, sea cual sea la
 * pendiente); `angleDeg` es el ángulo de rotación a aplicar al <text>
 * para que quede paralelo a la línea. Un solo cálculo reutilizado por las
 * bandas ambientales y por las 2 líneas de estabilidad.
 */
function placeAlongLine(
  px: PxFn, py: PyFn,
  fromPh: number, fromEh: number, toPh: number, toEh: number, t: number, perpOffset: number,
): { x: number; y: number; angleDeg: number } {
  const x1 = px(fromPh), y1 = py(fromEh);
  const x2 = px(toPh),   y2 = py(toEh);
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular unitario que apunta "hacia arriba" en pantalla (y menor)
  // cuando la línea baja hacia la derecha (dx>0, dy>0) — el caso normal acá.
  const upX = dy / len, upY = -dx / len;
  const baseX = x1 + dx * t, baseY = y1 + dy * t;
  return {
    x: baseX + upX * perpOffset,
    y: baseY + upY * perpOffset,
    angleDeg: Math.atan2(dy, dx) * (180 / Math.PI),
  };
}

// ─────────────────────────────────────────────────────────────────
// CAPA DE REFERENCIA (fija — sin depender de las muestras del usuario)
// ─────────────────────────────────────────────────────────────────

interface EhPhReferenceLayerProps {
  px: PxFn;
  py: PyFn;
  fontFamily: string;
  fontScale: number;
  lineScale: number;
}

/**
 * Capa de fondo fija del diagrama Eh-pH — ver JSDoc de archivo. Recibe
 * únicamente `px`/`py` (la transformación de coordenadas de
 * EhPhDiagram), no `samples`: no sabe nada de las muestras del usuario, y
 * por eso puede reutilizarse/ajustarse sin tocar el scatter.
 */
function EhPhReferenceLayer({ px, py, fontFamily, fontScale, lineScale }: EhPhReferenceLayerProps) {
  const upperAt = (t: number, perp: number) => {
    const ph1 = PH_MIN, ph2 = PH_MAX;
    return placeAlongLine(px, py, ph1, waterStabilityUpperEhV(ph1), ph2, waterStabilityUpperEhV(ph2), t, perp);
  };
  const lowerAt = (t: number, perp: number) => {
    const ph1 = PH_MIN, ph2 = PH_MAX;
    return placeAlongLine(px, py, ph1, waterStabilityLowerEhV(ph1), ph2, waterStabilityLowerEhV(ph2), t, perp);
  };
  const tFor = (ph: number) => (ph - PH_MIN) / (PH_MAX - PH_MIN);

  // O2/H2O (línea superior) y H2O/H2 (línea inferior), centradas en las
  // zonas de pH pedidas — rotadas al ángulo de su línea.
  const o2Pos  = upperAt(tFor(6.5), 8);
  const h2oTopPos = upperAt(tFor(6.5), -12);
  const h2oBotPos = lowerAt(tFor(1.75), 10);
  const h2Pos  = lowerAt(tFor(1.75), -14);

  // Etiquetas descriptivas: superior ARRIBA de su línea (pH≈9-13), inferior ABAJO de su línea (pH≈6-10).
  // El ángulo de rotación de ambas sale de lowerAt/upperAt — misma línea
  // (mismos 2 puntos) que la que se dibuja más abajo, así que quedan
  // paralelas por construcción; acá solo se ajusta qué tan cerca del
  // trazo quedan (perp más chico = más pegado a la línea).
  const upperLimitLabelPos = upperAt(tFor(11), 6);
  const lowerLimitLabelPos = lowerAt(tFor(8), -12);

  return (
    <g fontFamily={fontFamily}>
      {/* ── Líneas de estabilidad — dibujadas en TODO el rango de pH visible;
          el <clipPath> del grupo las recorta en los bordes del recuadro. ── */}
      <g stroke={CLR_LIMIT_LINE} strokeWidth={2.2 * lineScale} strokeDasharray="12 7" fill="none" clipPath={`url(#${CLIP_ID})`}>
        <line
          x1={px(PH_MIN).toFixed(1)} y1={py(waterStabilityUpperEhV(PH_MIN)).toFixed(1)}
          x2={px(PH_MAX).toFixed(1)} y2={py(waterStabilityUpperEhV(PH_MAX)).toFixed(1)}
        />
        <line
          x1={px(PH_MIN).toFixed(1)} y1={py(waterStabilityLowerEhV(PH_MIN)).toFixed(1)}
          x2={px(PH_MAX).toFixed(1)} y2={py(waterStabilityLowerEhV(PH_MAX)).toFixed(1)}
        />
      </g>

      {/* ── Etiquetas de las semirreacciones — rotadas al ángulo de su línea ── */}
      <g fontSize={11 * fontScale} fontStyle="italic" fill={CLR_LIMIT_LABEL} textAnchor="middle">
        <text x={o2Pos.x.toFixed(1)} y={o2Pos.y.toFixed(1)} transform={`rotate(${o2Pos.angleDeg.toFixed(2)} ${o2Pos.x.toFixed(1)} ${o2Pos.y.toFixed(1)})`}>O₂</text>
        <text x={h2oTopPos.x.toFixed(1)} y={h2oTopPos.y.toFixed(1)} transform={`rotate(${h2oTopPos.angleDeg.toFixed(2)} ${h2oTopPos.x.toFixed(1)} ${h2oTopPos.y.toFixed(1)})`}>H₂O</text>
        <text x={h2oBotPos.x.toFixed(1)} y={h2oBotPos.y.toFixed(1)} transform={`rotate(${h2oBotPos.angleDeg.toFixed(2)} ${h2oBotPos.x.toFixed(1)} ${h2oBotPos.y.toFixed(1)})`}>H₂O</text>
        <text x={h2Pos.x.toFixed(1)} y={h2Pos.y.toFixed(1)} transform={`rotate(${h2Pos.angleDeg.toFixed(2)} ${h2Pos.x.toFixed(1)} ${h2Pos.y.toFixed(1)})`}>H₂</text>
      </g>

      {/* ── Etiquetas descriptivas de las líneas de estabilidad ── */}
      <text
        x={upperLimitLabelPos.x.toFixed(1)} y={upperLimitLabelPos.y.toFixed(1)}
        transform={`rotate(${upperLimitLabelPos.angleDeg.toFixed(2)} ${upperLimitLabelPos.x.toFixed(1)} ${upperLimitLabelPos.y.toFixed(1)})`}
        fontSize={11.5 * fontScale} fontStyle="italic" fill={CLR_LIMIT_LABEL} textAnchor="middle"
      >
        Límite superior de estabilidad del agua
      </text>
      <text
        x={lowerLimitLabelPos.x.toFixed(1)} y={lowerLimitLabelPos.y.toFixed(1)}
        transform={`rotate(${lowerLimitLabelPos.angleDeg.toFixed(2)} ${lowerLimitLabelPos.x.toFixed(1)} ${lowerLimitLabelPos.y.toFixed(1)})`}
        fontSize={11.5 * fontScale} fontStyle="italic" fill={CLR_LIMIT_LABEL} textAnchor="middle"
      >
        Límite inferior de estabilidad del agua
      </text>

      {/* ── Bandas ambientales ── */}
      <g stroke={CLR_ENV_LINE} strokeWidth={2.6 * lineScale} fill="none">
        {EH_PH_ENVIRONMENT_SEGMENTS.map(seg => (
          <line
            key={seg.title}
            x1={px(seg.from[0]).toFixed(1)} y1={py(seg.from[1]).toFixed(1)}
            x2={px(seg.to[0]).toFixed(1)} y2={py(seg.to[1]).toFixed(1)}
          />
        ))}
      </g>
      {EH_PH_ENVIRONMENT_SEGMENTS.map(seg => {
        // Offset chico (13, no 20) a propósito: con las 3 bandas cerca
        // entre sí, un título muy alejado de su línea rompe la asociación
        // visual "este título es DE esta línea" — el ángulo (distinto por
        // banda, ver placeAlongLine) recién se lee bien si el texto está
        // pegado a su propia línea, no flotando a medio camino hacia la
        // banda vecina.
        const titlePos = placeAlongLine(px, py, seg.from[0], seg.from[1], seg.to[0], seg.to[1], 0.5, 13);
        return (
          <g key={seg.title} textAnchor="middle">
            <text
              x={titlePos.x.toFixed(1)} y={titlePos.y.toFixed(1)}
              transform={`rotate(${titlePos.angleDeg.toFixed(2)} ${titlePos.x.toFixed(1)} ${titlePos.y.toFixed(1)})`}
              fontSize={13.5 * fontScale} fontWeight={700} fill={CLR_ENV_LINE}
            >
              {seg.title}
            </text>
            {seg.labels.map((lbl, i) => {
              const perp = lbl.side === 'above' ? 11 : -14;
              const pos = placeAlongLine(px, py, seg.from[0], seg.from[1], seg.to[0], seg.to[1], lbl.t, perp);
              const lines = Array.isArray(lbl.text) ? lbl.text : [lbl.text];
              return (
                <text
                  key={i}
                  x={pos.x.toFixed(1)} y={pos.y.toFixed(1)}
                  transform={`rotate(${pos.angleDeg.toFixed(2)} ${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`}
                  fontSize={10.5 * fontScale} fontStyle="italic" fill={CLR_ENV_LINE}
                >
                  {lines.map((line, li) => (
                    <tspan key={li} x={pos.x.toFixed(1)} dy={li === 0 ? 0 : 12}>{line}</tspan>
                  ))}
                </text>
              );
            })}
          </g>
        );
      })}

      {/* ── Etiqueta flotante — sin línea ambiental propia, pero ANCLADA a la
          línea de la Banda 1 ("Ambientes en contacto con la atmósfera",
          pedido explícito) igual que cualquier EhPhPointLabel: mismo
          mecanismo t/perp (t puede pasar de 1 — el pH pedido cae más allá
          del extremo `to` de la banda, así que placeAlongLine extrapola
          la misma recta en vez de cortarse en su extremo). */}
      {EH_PH_FLOATING_LABELS.map((lbl, i) => {
        const lines = Array.isArray(lbl.text) ? lbl.text : [lbl.text];
        const band1 = EH_PH_ENVIRONMENT_SEGMENTS[0];
        const t = (lbl.ph - band1.from[0]) / (band1.to[0] - band1.from[0]);
        const pos = placeAlongLine(px, py, band1.from[0], band1.from[1], band1.to[0], band1.to[1], t, lbl.perp);
        return (
          <text
            key={i} x={pos.x.toFixed(1)} y={pos.y.toFixed(1)}
            transform={`rotate(${pos.angleDeg.toFixed(2)} ${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`}
            fontSize={10.5} fill={CLR_ENV_LINE} textAnchor="middle"
          >
            {lines.map((line, li) => (
              <tspan key={li} x={pos.x.toFixed(1)} dy={li === 0 ? 0 : 13}>{line}</tspan>
            ))}
          </text>
        );
      })}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────────────────────────

export function EhPhDiagram({
  samples,
  width  = 700,
  height = 440,
  colorBy,
  title,
  fontFamily    = DEFAULT_FONT_FAMILY,
  fontSize      = DEFAULT_CHART_FONT_SIZE,
  lineThickness = DEFAULT_CHART_LINE_THICKNESS,
  pointSize     = DEFAULT_CHART_POINT_SIZE,
  showGrid      = true,
  legend        = { visible: true, position: DEFAULT_LEGEND_POSITION },
}: EhPhDiagramProps) {
  const groupOf  = colorBy ?? ((s: WaterSample) => s.name);
  // Necesita AMBOS ejes: Eh (opcional, no todos los equipos lo miden) y pH
  // (opcional desde que las muestras se alimentan de QA/QC — ver hydroTypes.ts).
  const withEh   = samples.filter((s): s is WaterSample & { Eh: number; pH: number } => s.Eh != null && s.pH != null);
  const omitted  = samples.length - withEh.length;
  const colorMap = buildColorMap(withEh, groupOf);

  const fontScale = fontSize / DEFAULT_CHART_FONT_SIZE;
  const lineScale = lineThickness / DEFAULT_CHART_LINE_THICKNESS;
  const pointR = PT_R * (pointSize / DEFAULT_CHART_POINT_SIZE);
  // Eh-pH no tenía margen sobrante para un título (a diferencia de Piper) —
  // se reserva espacio extra arriba SOLO cuando hay título, en vez de
  // superponerlo a los ejes/leyenda existentes.
  const titleSpace = title ? 22 : 0;

  const plotW = width  - MARGIN_L - MARGIN_R;
  const plotH = height - MARGIN_T - MARGIN_B - titleSpace;
  const yTop  = MARGIN_T + titleSpace;
  const yBot  = yTop + plotH;

  const px: PxFn = (pH) => MARGIN_L + ((pH - PH_MIN) / (PH_MAX - PH_MIN)) * plotW;
  const py: PyFn = (ehV) => yTop + ((EH_MAX - ehV) / (EH_MAX - EH_MIN)) * plotH;

  // ── Puntos de muestra ──
  const points = withEh.map(s => ({
    id: s.id,
    x: px(s.pH),
    y: py(s.Eh / 1000),
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
        <defs>
          <clipPath id={CLIP_ID}>
            <rect x={MARGIN_L} y={yTop} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        {/* ── Título (opcional) — reserva su propio espacio (titleSpace), no compite con los ejes ── */}
        {title && (
          <text x={(width / 2).toFixed(1)} y={16} textAnchor="middle" fontSize={13 * fontScale} fontWeight={700}
                fill={CLR_AXIS} fontFamily={fontFamily}>
            {title}
          </text>
        )}

        {/* ── Borde del área de trazado (rectángulo, sin grilla interna — ver referencia) ── */}
        <rect x={MARGIN_L} y={yTop} width={plotW} height={plotH} fill="none" stroke={CLR_AXIS} strokeWidth={1.8 * lineScale} />

        {/* ── Ticks + etiquetas eje X/Y (= "grilla" de Eh-pH — ver JSDoc de showGrid; el borde, la capa de referencia y los puntos NUNCA se ocultan) ── */}
        {showGrid && (
        <>
        <g stroke={CLR_AXIS} strokeWidth={1.2 * lineScale}>
          {PH_TICKS.map(v => (
            <line key={v} x1={px(v).toFixed(1)} y1={yBot} x2={px(v).toFixed(1)} y2={(yBot + 6).toFixed(1)} />
          ))}
        </g>
        <g fontSize={13 * fontScale} fill={CLR_AXIS} fontFamily={fontFamily} textAnchor="middle">
          {PH_TICKS.map(v => (
            <text key={v} x={px(v).toFixed(1)} y={(yBot + 22).toFixed(1)}>{v}</text>
          ))}
        </g>
        <g stroke={CLR_AXIS} strokeWidth={1.2 * lineScale}>
          {EH_TICKS.map(v => (
            <line key={v} x1={(MARGIN_L - 6).toFixed(1)} y1={py(v).toFixed(1)} x2={MARGIN_L} y2={py(v).toFixed(1)} />
          ))}
        </g>
        <g fontSize={13 * fontScale} fill={CLR_AXIS} fontFamily={fontFamily} textAnchor="end">
          {EH_TICKS.map(v => (
            <text key={v} x={(MARGIN_L - 10).toFixed(1)} y={(py(v) + 4.5).toFixed(1)}>{fmtEh(v)}</text>
          ))}
        </g>
        </>
        )}
        <text
          x={(MARGIN_L + plotW / 2).toFixed(1)} y={(height - 10).toFixed(1)}
          textAnchor="middle" fontSize={19 * fontScale} fontWeight={700} fill={CLR_AXIS} fontFamily={fontFamily}
        >
          pH
        </text>
        <text
          x={16} y={(yTop + plotH / 2).toFixed(1)}
          textAnchor="middle" fontSize={19 * fontScale} fontWeight={700} fill={CLR_AXIS} fontFamily={fontFamily}
          transform={`rotate(-90 16 ${(yTop + plotH / 2).toFixed(1)})`}
        >
          Eh [V]
        </text>

        <EhPhReferenceLayer px={px} py={py} fontFamily={fontFamily} fontScale={fontScale} lineScale={lineScale} />

        {/* ── Puntos por muestra (solo las que traen Eh) ── */}
        <g stroke="#0f172a" strokeWidth={0.6}>
          {points.map(p => (
            <circle key={p.id} cx={p.x.toFixed(2)} cy={p.y.toFixed(2)} r={pointR} fill={p.color} />
          ))}
        </g>
      </svg>

      {/* ── Leyenda + aviso de muestras omitidas por no traer Eh ── */}
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
      {omitted > 0 && (
        <div style={{ fontSize: 11, color: '#94a3b8', padding: '4px 4px 0' }}>
          {omitted} muestra{omitted === 1 ? '' : 's'} sin dato de Eh o pH — no se muestra{omitted === 1 ? '' : 'n'} en este diagrama.
        </div>
      )}
      {/* Nota al pie de la limitación de temperatura — SIEMPRE visible: las
          líneas de estabilidad se calculan a 25°C fijo (ver ehPhReference.ts).
          Específica de este diagrama; ningún otro la muestra. */}
      <div style={{ fontSize: 10.5, fontStyle: 'italic', color: '#94a3b8', padding: '4px 4px 0' }}>
        {EH_PH_REFERENCE_TEMPERATURE_NOTE}
      </div>
    </div>
  );
}
