/**
 * src/hidrogeo/PiperDiagram.tsx
 * Rediseño — estilo "clásico" de Piper (Piper 1944 / Custodio & Llamas):
 *   triángulos con tick marks + nombre de eje rotado en sus 3 lados,
 *   rombo con las 4 zonas de facies hidroquímicas separadas por líneas
 *   discontinuas al 50%, y ejes superiores del rombo (SO₄+Cl, Ca+Mg)
 *   con ticks 0–100. Reemplaza la grilla fina de 20% + etiquetas de
 *   vértice de la versión anterior.
 *
 * Reutiliza ternaryToCartesian de piperGeometry.ts y calculatePercentages
 * de hydroCalculations.ts — ninguna de las dos se modifica.
 * DEFAULT_PALETTE/buildColorMap viven en sampleColor.ts.
 *
 * ── Asignación de ejes por borde (verificada contra Piper 1944) ──────
 * Cada triángulo tiene 3 bordes; cada borde muestra el % de UNO de sus
 * dos iones extremos (el otro extremo del borde ya está "tomado" por
 * otro borde, así cada ion aparece exactamente una vez):
 *   Cationes: inferior→Ca, izquierdo→Mg (0 abajo, 100 en el ápice),
 *             derecho→Na+K (100 abajo, 0 en el ápice).
 *   Aniones:  inferior→Cl, izquierdo→CO₃+HCO₃ (0 abajo, 100 en el ápice),
 *             derecho→SO₄ (100 abajo, 0 en el ápice).
 * (Corregido: el ápice de cationes estaba invertido — Na+K en el ápice
 * y Mg a la derecha — hasta que se comparó contra el diagrama de Piper
 * 1944 de referencia, donde el ápice de cationes es Mg, no Na+K. El
 * lado de aniones ya estaba correcto y no cambió.)
 *
 * ── Rombo: orientación derivada de las 4 leyendas de facies ──────────
 * Las 4 zonas de la imagen de referencia (Sulfatada/clorurada cálcica
 * y/o magnésica — arriba; Bicarbonatada cálcica y/o magnésica —
 * izquierda; Clorurada y/o sulfatada sódica — derecha; Bicarbonatada
 * sódica — abajo) determinan la orientación del rombo de forma unívoca:
 *   D = T + (Na+K %/100)·(R−T) + (CO₃+HCO₃ %/100)·(L−T)
 * donde T=vértice superior, L=izquierdo, R=derecho, B=inferior (pegado
 * a los dos triángulos). Verificado con los 4 casos límite:
 *   Na+K=0,HCO₃=0 → T  (Ca+Mg y SO₄+Cl dominantes — arriba)
 *   Na+K=100,HCO₃=100 → B (Na y HCO₃ dominantes — abajo, junto a los
 *                           ápices Na+K/CO₃+HCO₃ de ambos triángulos)
 *   Na+K=0,HCO₃=100 → L (Ca+Mg y HCO₃ dominantes — izquierda)
 *   Na+K=100,HCO₃=0 → R (Na y SO₄+Cl dominantes — derecha)
 * (Nota: esto invierte el B/T de la versión anterior — antes T=Na+K+HCO₃
 * puro y B=Ca+Mg+SO₄+Cl puro; matemáticamente es la misma familia de
 * proyección bilineal, solo con el vértice base cambiado de B a T.)
 *
 * ── Posición del rombo y espaciado de triángulos (medido de Piper_triangular.png) ──
 * El intento anterior (rL=vMg exacto, RHOMB_SCALE=2) resultó ser otra
 * suposición incorrecta. El usuario adjuntó Iconos/Piper_triangular.png
 * (plantilla en blanco del Piper de referencia) y se midió con precisión
 * mediante escaneo de píxeles + regresión lineal (no a ojo): para cada
 * borde relevante se ajustó una recta con 200–320 puntos muestreados a
 * lo largo de la línea, evitando texto/ticks.
 *
 * Hallazgos (imagen de 2892×2596 px):
 *   - Lado del triángulo S ≈ 1310 px (cationes 1308, aniones 1315).
 *   - Vértice superior del rombo T ≈ intersección exacta de las rectas
 *     vCa→vMg y vSO₄→vHCO₃ extendidas (confirmado: la intersección
 *     calculada de ambas rectas ajustadas cae a (1423,52), a solo ~15px
 *     del T medido directamente en la imagen) — el modelo "T fijo en la
 *     intersección" SÍ es correcto, igual que en un intento anterior.
 *   - PERO el salto entre triángulos NO es de un S completo (como tenía
 *     el código): es solo ≈148px ≈ 0.113·S. Este mismo valor GAP_RATIO
 *     aparece en TRES lugares idénticos por construcción geométrica
 *     (no es coincidencia de medición, es una identidad algebraica):
 *     el hueco entre los dos triángulos, Y el salto entre cada ápice y
 *     su vértice rL/rR correspondiente — ambos valen exactamente
 *     GAP_RATIO·S cuando RHOMB_SCALE=1.
 *   - RHOMB_SCALE = 1 (rombo del MISMO tamaño que los triángulos, no 1.5
 *     ni 2) — se comprueba con dist(T,L) ≈ 1318px ≈ S.
 * Con GAP_RATIO≈0.113 fijo y RHOMB_SCALE=1, rB (vértice inferior) queda
 * baseY − triH·GAP_RATIO, es decir un poco ARRIBA de la base de los
 * triángulos (no la toca ni la pasa) — coincide con lo que se ve en la
 * imagen de referencia.
 * La proyección bilineal (diamondPoint) no depende de estos parámetros:
 * sigue usando T,L,R,B ya calculados, sea cual sea su posición exacta.
 *
 * ── Facies internas de cada triángulo (mismo criterio ya verificado) ──
 * Además del rombo, cada triángulo se subdivide en 4 zonas con líneas
 * discontinuas al 50% (el triángulo central invertido = "ningún ion >50%
 * dentro de su grupo"), usando la MISMA asignación de vértices ya fijada
 * arriba (ápice de cationes = Mg, ápice de aniones = CO₃+HCO₃):
 *   Cationes → Cálcica (esquina Ca), Sódica (esquina Na+K),
 *              Magnésica (ápice, Mg), mixta en el centro.
 *   Aniones  → Clorurada (esquina Cl), Sulfatada (esquina SO₄),
 *              Bicarbonatada (ápice, CO₃+HCO₃), mixta en el centro.
 */

import React, { useState } from 'react';
import { ternaryToCartesian, Point2D } from './piperGeometry';
import type { WaterSample } from './hydroTypes';
import { calculatePercentages } from './hydroCalculations';
import { DEFAULT_PALETTE, buildColorMap } from './sampleColor';
import {
  DEFAULT_DASHED, DEFAULT_OUTLINE, DEFAULT_POINT_SHAPE, DEFAULT_POINT_SIZE,
  GroupPointStyle, LineStyle, PointShape,
} from './diagramStyle';
import {
  DEFAULT_CHART_FONT_SIZE, DEFAULT_CHART_LINE_THICKNESS, DEFAULT_CHART_POINT_SIZE,
  DEFAULT_FONT_FAMILY, DEFAULT_LEGEND_POSITION, legendPositionStyle, LegendStyle,
} from '../shared/chartStyle';

// ─────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────

export interface PiperDiagramProps {
  width?: number;
  height?: number;
  samples?: WaterSample[];
  /**
   * Agrupa una muestra en una etiqueta de color (pozo, campaña, etc.).
   * Muestras con la misma etiqueta comparten color y entrada de leyenda.
   * Por defecto agrupa por `sample.name` (un color por pozo/punto).
   */
  colorBy?: (sample: WaterSample) => string;
  /** Se dispara al hacer click sobre cualquiera de los 3 puntos de una muestra. */
  onPointClick?: (sampleId: string) => void;
  /** Color/grosor de los contornos (triángulos + rombo) — un solo estilo compartido. */
  outline?: LineStyle;
  /** Color/grosor de las líneas segmentadas internas (facies al 50%) — compartido entre las 3 figuras. */
  dashed?: LineStyle;
  /**
   * Forma/tamaño/color por grupo, con la MISMA clave que produce `colorBy`.
   * Los grupos sin entrada usan el color automático de la paleta, círculo,
   * y el tamaño de `pointSize` (ver precedencia en el JSDoc de `pointSize`
   * más abajo).
   */
  pointStyles?: Record<string, GroupPointStyle>;

  // ── Etapa 4.5b — ChartStyleSettings ("carrocería" genérica, chartStyle.ts) ──
  /** Título mostrado sobre el diagrama. Sin valor = no se dibuja ningún título (el fallback "vacío = nombre por defecto" se resuelve en el llamador, ver HydrogeochemistryModule.tsx). */
  title?: string;
  fontFamily?: string;
  /** Tamaño BASE de la tipografía del diagrama — escala PROPORCIONALMENTE todos los tamaños de texto internos (números de eje, nombres de eje, texto de facies, leyenda), preservando la jerarquía visual actual entre ellos. En DEFAULT_CHART_FONT_SIZE (12), el resultado es idéntico píxel a píxel al diseño original. */
  fontSize?: number;
  /**
   * Grosor de los CONTORNOS (triángulos + rombo) y las líneas segmentadas
   * de facies — el equivalente de Piper a "ejes/líneas de referencia" (no
   * tiene ejes rectos separados). Igual que `fontSize`, escala
   * PROPORCIONALMENTE los grosores `outline.width`/`dashed.width` ya
   * configurados en PiperStyleSettings (no los reemplaza ni los ignora):
   * en DEFAULT_CHART_LINE_THICKNESS (1) no cambia nada respecto de hoy: el
   * COLOR de esas líneas sigue siendo 100% responsabilidad de
   * PiperStyleSettings (fuera del alcance de este sistema genérico, ver
   * chartStyle.ts), y su GROSOR configurado ahí actúa como la base que
   * este control escala hacia arriba/abajo — ningún valor queda ignorado.
   */
  lineThickness?: number;
  /**
   * Tamaño de marcador POR DEFECTO para grupos sin override propio.
   * PRECEDENCIA EXPLÍCITA: `pointStyles[grupo].size` (específico, ya
   * existente) SIEMPRE le gana a este valor genérico cuando el grupo tiene
   * una entrada — `pointSize` solo aplica a grupos sin override. Nunca al
   * revés.
   */
  pointSize?: number;
  /** Piper no tiene una grilla rectangular de fondo — "grilla" acá se mapea a los NÚMEROS de porcentaje en los bordes de los 2 triángulos y el rombo (0/100, etc.); el contorno, las líneas de facies, los nombres de eje y los puntos de muestra NUNCA se ocultan (son contenido, no grilla). */
  showGrid?: boolean;
  legend?: LegendStyle;
}

// ─────────────────────────────────────────────────────────────────
// CONSTANTES DE DISEÑO
// ─────────────────────────────────────────────────────────────────

const MARGIN    = 46;
// Tamaño del rombo relativo al lado S de los triángulos. RHOMB_SCALE=1
// (mismo tamaño) medido directamente de Iconos/Piper_triangular.png
// (dist(T,L)/S ≈ 1318/1310 ≈ 1.0) — ver derivación completa en el
// encabezado del archivo. No es un ajuste de gusto, es lo que muestra
// la imagen de referencia.
const RHOMB_SCALE = 1;
// Hueco entre los dos triángulos, como fracción del lado S (antes el
// código asumía un hueco de un S completo — MUY por encima de lo real).
// Medido en Piper_triangular.png: hueco ≈148px, S≈1310px → 148/1310≈0.113.
// Por identidad geométrica, este mismo valor determina también el salto
// entre cada ápice y su rL/rR (ver encabezado) — un solo número gobierna
// ambos espaciados.
const GAP_RATIO = 0.113;
// Solo extremos (0 y 100) en los ejes — así aparece en Piper_triangular.png
// de referencia, sin ticks intermedios cada 20.
const STEPS     = [0, 100] as const;
const CLR_TICK  = '#64748b';
const CLR_AXIS  = '#334155';   // nombre de eje (más oscuro que el número)
const CLR_FACIE = '#64748b';

// ─────────────────────────────────────────────────────────────────
// HELPERS GEOMÉTRICOS
// ─────────────────────────────────────────────────────────────────

function lerp(a: Point2D, b: Point2D, t: number): Point2D {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function toPoints(...ps: Point2D[]): string {
  return ps.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

function angleDeg(from: Point2D, to: Point2D): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

/**
 * Proyecta (naKFrac, hco3Frac) al punto del rombo T-L-R-B mediante
 * interpolación bilineal: D = T + naKFrac·(R−T) + hco3Frac·(L−T).
 * Ver derivación y verificación de los 4 casos límite en el encabezado.
 */
function diamondPoint(
  T: Point2D, L: Point2D, R: Point2D, naKFrac: number, hco3Frac: number,
): Point2D {
  return {
    x: T.x + naKFrac * (R.x - T.x) + hco3Frac * (L.x - T.x),
    y: T.y + naKFrac * (R.y - T.y) + hco3Frac * (L.y - T.y),
  };
}

/** Vértices de un polígono regular de `sides` lados, radio `r`, con el primer vértice apuntando hacia arriba. */
function polygonPoints(cx: number, cy: number, r: number, sides: number): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((-90 + (i * 360) / sides) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Vértices de una estrella de 5 puntas, alternando radio externo/interno. */
function starPoints(cx: number, cy: number, rOuter: number, rInner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = ((-90 + i * 36) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/**
 * Dibuja un punto de muestra con la forma elegida por el usuario. Los
 * tamaños de cada forma se escalan a ojo para que ocupen un área visual
 * similar a un círculo del mismo radio `r` (no es un área exactamente
 * igual, solo evita que p.ej. la estrella se vea mucho más chica/grande
 * que un círculo del mismo "tamaño" nominal).
 */
function PointMarker({ shape, cx, cy, r, fill, stroke, strokeWidth, onMouseEnter, onMouseLeave, onClick, cursor }: {
  shape: PointShape; cx: number; cy: number; r: number; fill: string;
  stroke: string; strokeWidth: number; cursor: string;
  onMouseEnter: () => void; onMouseLeave: () => void; onClick: () => void;
}) {
  const common = { fill, stroke, strokeWidth, onMouseEnter, onMouseLeave, onClick, style: { cursor } };
  switch (shape) {
    case 'square': {
      const s = r * 1.7;
      return <rect x={(cx - s / 2).toFixed(2)} y={(cy - s / 2).toFixed(2)} width={s.toFixed(2)} height={s.toFixed(2)} {...common} />;
    }
    case 'triangle':
      return <polygon points={polygonPoints(cx, cy, r * 1.3, 3)} {...common} />;
    case 'diamond':
      return <polygon points={polygonPoints(cx, cy, r * 1.25, 4)} {...common} />;
    case 'star':
      return <polygon points={starPoints(cx, cy, r * 1.4, r * 0.55)} {...common} />;
    case 'circle':
    default:
      return <circle cx={cx.toFixed(2)} cy={cy.toFixed(2)} r={r} {...common} />;
  }
}

// ─────────────────────────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────────────────────────

export function PiperDiagram({
  width   = 680,
  height  = 620,
  samples = [],
  colorBy,
  onPointClick,
  outline      = DEFAULT_OUTLINE,
  dashed       = DEFAULT_DASHED,
  pointStyles  = {},
  title,
  fontFamily    = DEFAULT_FONT_FAMILY,
  fontSize      = DEFAULT_CHART_FONT_SIZE,
  lineThickness = DEFAULT_CHART_LINE_THICKNESS,
  pointSize     = DEFAULT_CHART_POINT_SIZE,
  showGrid      = true,
  legend        = { visible: true, position: DEFAULT_LEGEND_POSITION },
}: PiperDiagramProps) {
  const groupOf  = colorBy ?? ((s: WaterSample) => s.name);
  const colorMap = buildColorMap(samples, groupOf);

  // ── Escalas derivadas de ChartStyleSettings (ver JSDoc de fontSize/lineThickness arriba) ──
  const fontScale = fontSize / DEFAULT_CHART_FONT_SIZE;
  const lineScale = lineThickness / DEFAULT_CHART_LINE_THICKNESS;
  const outlineWidth = outline.width * lineScale;
  const dashedWidth   = dashed.width * lineScale;
  const dashedSubWidth = Math.max(0.4, dashedWidth - 0.2);

  // sampleId + tipo de punto ('cat' | 'ani' | 'dia') del punto bajo el cursor
  const [hover, setHover] = useState<{ sampleId: string; ptType: 'cat' | 'ani' | 'dia' } | null>(null);

  // ── Tamaño del triángulo ──────────────────────────────────────
  // Ancho total = (2+GAP_RATIO)·S (triángulo + hueco + triángulo). Alto
  // total = (2+GAP_RATIO)·triH (misma proporción, escalada por triHFactor)
  // — ver derivación en el encabezado para de dónde sale este factor.
  const triHFactor = Math.sqrt(3) / 2;
  const totalUnits = 2 + GAP_RATIO;
  const S = Math.min(
    (width  - 2 * MARGIN) / totalUnits,
    (height - 2 * MARGIN) / (totalUnits * triHFactor),
  );
  const triH  = triHFactor * S;
  // rT (ápice del rombo) ancla en MARGIN; la base de los triángulos queda
  // (2+GAP_RATIO)·triH más abajo (ver derivación en el encabezado).
  const baseY = MARGIN + totalUnits * triH;

  const catOri: Point2D = { x: MARGIN,                       y: baseY };  // Ca
  const aniOri: Point2D = { x: MARGIN + S * (1 + GAP_RATIO), y: baseY };  // Cl — hueco = GAP_RATIO·S, no S completo

  const cat = (a: number, b: number, c: number) => ternaryToCartesian(a, b, c, catOri, S);
  const ani = (a: number, b: number, c: number) => ternaryToCartesian(a, b, c, aniOri, S);

  // ── Vértices ─────────────────────────────────────────────────
  // Cationes: Ca abajo-izq., Na+K abajo-der., Mg en el ápice (verificado
  // contra Piper 1944 / imagen de referencia — antes estaba invertido:
  // Na+K en el ápice y Mg abajo-der.).
  const vCa   = cat(100,   0,   0);
  const vNaK  = cat(  0, 100,   0);
  const vMg   = cat(  0,   0, 100);

  const vCl   = ani(100,   0,   0);
  const vSO4  = ani(  0, 100,   0);
  const vHCO3 = ani(  0,   0, 100);

  // Rombo: T=superior, L=izquierdo, R=derecho, B=inferior.
  // T es la intersección de las rectas vCa→vMg y vSO₄→vHCO₃ extendidas —
  // fijo independientemente de RHOMB_SCALE/GAP_RATIO. rL/rR quedan a
  // distancia RHOMB_SCALE·S de T sobre esas mismas rectas (RHOMB_SCALE=1
  // ⇒ rombo del mismo tamaño que los triángulos, medido de la imagen de
  // referencia). Fórmulas generales derivadas en el encabezado.
  const rT: Point2D = {
    x: MARGIN + S * (1 + 0.5 * GAP_RATIO),
    y: MARGIN,
  };
  const rL: Point2D = {
    x: MARGIN + S * (1 + 0.5 * GAP_RATIO - 0.5 * RHOMB_SCALE),
    y: baseY - triH * (2 + GAP_RATIO - RHOMB_SCALE),
  };
  const rR: Point2D = {
    x: MARGIN + S * (1 + 0.5 * GAP_RATIO + 0.5 * RHOMB_SCALE),
    y: baseY - triH * (2 + GAP_RATIO - RHOMB_SCALE),
  };
  const rB: Point2D = { x: rL.x + rR.x - rT.x, y: rL.y + rR.y - rT.y };

  // ── Marcas de porcentaje en los 3 bordes de cada triángulo ─────
  const catBotTicks = STEPS.map(g => ({ p: cat(g, 100 - g, 0), n: `${g}` }));       // Ca%
  const catLftTicks = STEPS.map(g => ({ p: cat(100 - g, 0, g), n: `${g}` }));       // Mg%
  const catRgtTicks = STEPS.map(g => ({ p: cat(0, g, 100 - g), n: `${g}` }));       // Na+K%

  const aniBotTicks = STEPS.map(g => ({ p: ani(g, 100 - g, 0), n: `${g}` }));       // Cl%
  const aniLftTicks = STEPS.map(g => ({ p: ani(100 - g, 0, g), n: `${g}` }));       // CO3+HCO3%
  const aniRgtTicks = STEPS.map(g => ({ p: ani(0, g, 100 - g), n: `${g}` }));       // SO4%

  // ── Marcas de porcentaje en los 2 bordes superiores del rombo ──
  // Solo el extremo en L/R (100−g=0): el extremo en T (100−g=100) se omite
  // aquí porque SO4+Cl% y Ca+Mg% valen 100 en el MISMO punto T a la vez —
  // se dibuja una sola vez más abajo, no una por cada eje (evita el "100
  // 100" duplicado). Y en L/R coincide con el ápice del triángulo (rL=vMg,
  // rR=vHCO₃), así que ese "0" se separa verticalmente del "100" del
  // triángulo para no leerse pegados como "1000".
  const rhoLftTicks = STEPS.filter(g => g === 100).map(g => ({ p: lerp(rT, rL, g / 100), n: `${100 - g}` })); // SO4+Cl%
  const rhoRgtTicks = STEPS.filter(g => g === 100).map(g => ({ p: lerp(rT, rR, g / 100), n: `${100 - g}` })); // Ca+Mg%

  // ── Líneas discontinuas del rombo (50% — separan las 4 facies) ──
  const dashNaK  = [diamondPoint(rT, rL, rR, 0.5, 0), diamondPoint(rT, rL, rR, 0.5, 1)] as const;
  const dashHCO3 = [diamondPoint(rT, rL, rR, 0, 0.5), diamondPoint(rT, rL, rR, 1, 0.5)] as const;

  // ── Centros aproximados de cada cuadrante (para el texto de facies) ──
  const qTop   = diamondPoint(rT, rL, rR, 0.25, 0.25);
  const qLeft  = diamondPoint(rT, rL, rR, 0.25, 0.75);
  const qRight = diamondPoint(rT, rL, rR, 0.75, 0.25);
  const qBot   = diamondPoint(rT, rL, rR, 0.75, 0.75);

  // ── Líneas discontinuas de las 4 facies dentro de cada triángulo (50%) ──
  // Triángulo central invertido = "ningún ion >50% dentro de su grupo".
  const catDash = [
    [cat(50, 50, 0), cat(50, 0, 50)],
    [cat(50, 50, 0), cat(0, 50, 50)],
    [cat(50, 0, 50), cat(0, 50, 50)],
  ] as const;
  const aniDash = [
    [ani(50, 50, 0), ani(50, 0, 50)],
    [ani(50, 50, 0), ani(0, 50, 50)],
    [ani(50, 0, 50), ani(0, 50, 50)],
  ] as const;

  // ── Centros aproximados de las 4 zonas de cada triángulo (para el texto) ──
  const catZoneCa  = cat(65, 17.5, 17.5);
  const catZoneNaK = cat(17.5, 65, 17.5);
  const catZoneMg  = cat(17.5, 17.5, 65);
  const catZoneMix = cat(100 / 3, 100 / 3, 100 / 3);

  const aniZoneCl   = ani(65, 17.5, 17.5);
  const aniZoneSO4  = ani(17.5, 65, 17.5);
  const aniZoneHCO3 = ani(17.5, 17.5, 65);
  const aniZoneMix  = ani(100 / 3, 100 / 3, 100 / 3);

  // ── Ángulos de los bordes diagonales (para rotar el texto) ──
  // Cada ángulo se calcula en la dirección que mantiene el texto legible
  // (entre -90° y 90°, nunca "boca abajo").
  const angCatLft = angleDeg(vCa, vMg);
  const angCatRgt = angleDeg(vMg, vNaK);
  const angAniLft = angleDeg(vCl, vHCO3);
  const angAniRgt = angleDeg(vHCO3, vSO4);
  const angRhoLft = angleDeg(rL, rT);
  const angRhoRgt = angleDeg(rT, rR);

  // ── Puntos de muestra ───────────────────────────────────────────
  const samplePoints = samples.map(s => {
    const { cationPct, anionPct } = calculatePercentages(s);
    const naK   = cationPct.Na + cationPct.K;
    const hco3  = anionPct.HCO3 + anionPct.CO3;
    const group = groupOf(s);
    const override = pointStyles[group];
    return {
      id: s.id,
      sample: s,
      cationPct,
      anionPct,
      color: override?.color ?? colorMap.get(group) ?? DEFAULT_PALETTE[0],
      shape: override?.shape ?? DEFAULT_POINT_SHAPE,
      // Precedencia explícita (ver JSDoc de `pointSize` en PiperDiagramProps):
      // el tamaño específico por grupo (override?.size) SIEMPRE gana sobre
      // el genérico `pointSize` — nunca al revés.
      size:  override?.size  ?? pointSize,
      cat: cat(cationPct.Ca, naK, cationPct.Mg),
      ani: ani(anionPct.Cl, anionPct.SO4, hco3),
      dia: diamondPoint(rT, rL, rR, naK / 100, hco3 / 100),
    };
  });

  const hoveredPoint = hover
    ? (() => {
        const sp = samplePoints.find(p => p.id === hover.sampleId);
        if (!sp) return null;
        const point = hover.ptType === 'cat' ? sp.cat : hover.ptType === 'ani' ? sp.ani : sp.dia;
        return { sp, point };
      })()
    : null;

  // Helper para texto de eje rotado, centrado en el punto medio de un borde
  function EdgeLabel({ mid, angle, dx, dy, text }: { mid: Point2D; angle: number; dx: number; dy: number; text: string }) {
    return (
      <text
        x={(mid.x + dx).toFixed(1)} y={(mid.y + dy).toFixed(1)}
        textAnchor="middle" fontSize={11 * fontScale} fontWeight={700}
        fill={CLR_AXIS} fontFamily={fontFamily}
        transform={`rotate(${angle.toFixed(1)} ${(mid.x + dx).toFixed(1)} ${(mid.y + dy).toFixed(1)})`}
      >
        {text}
      </text>
    );
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width, fontFamily }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >

        {/* ── Título (opcional) — dentro del margen superior, no requiere reacomodar la geometría (MARGIN=46 ya deja espacio de sobra sobre rT) ── */}
        {title && (
          <text x={(width / 2).toFixed(1)} y={16} textAnchor="middle" fontSize={13 * fontScale} fontWeight={700}
                fill={CLR_AXIS} fontFamily={fontFamily}>
            {title}
          </text>
        )}

        {/* ── Líneas discontinuas de las 4 facies (50%) ── */}
        <g stroke={dashed.color} strokeWidth={dashedWidth} strokeDasharray="4,3">
          <line x1={dashNaK[0].x.toFixed(2)}  y1={dashNaK[0].y.toFixed(2)}  x2={dashNaK[1].x.toFixed(2)}  y2={dashNaK[1].y.toFixed(2)} />
          <line x1={dashHCO3[0].x.toFixed(2)} y1={dashHCO3[0].y.toFixed(2)} x2={dashHCO3[1].x.toFixed(2)} y2={dashHCO3[1].y.toFixed(2)} />
        </g>

        {/* ── Texto de facies (4 cuadrantes del rombo) ── */}
        <g fontSize={9 * fontScale} fill={CLR_FACIE} fontFamily={fontFamily} textAnchor="middle">
          <text x={qTop.x.toFixed(1)} y={(qTop.y - 6).toFixed(1)}>
            <tspan x={qTop.x.toFixed(1)} dy="0">Sulfatada y/o clorurada</tspan>
            <tspan x={qTop.x.toFixed(1)} dy="11">cálcica y/o magnésica</tspan>
          </text>
          <text x={qLeft.x.toFixed(1)} y={qLeft.y.toFixed(1)}>
            <tspan x={qLeft.x.toFixed(1)} dy="0">Bicarbonatada cálcica</tspan>
            <tspan x={qLeft.x.toFixed(1)} dy="11">y/o magnésica</tspan>
          </text>
          <text x={qRight.x.toFixed(1)} y={qRight.y.toFixed(1)}>
            <tspan x={qRight.x.toFixed(1)} dy="0">Clorurada y/o</tspan>
            <tspan x={qRight.x.toFixed(1)} dy="11">sulfatada sódica</tspan>
          </text>
          <text x={qBot.x.toFixed(1)} y={(qBot.y + 12).toFixed(1)}>Bicarbonatada sódica</text>
        </g>

        {/* ── Líneas discontinuas de las 4 facies — triángulos (50%) ── */}
        <g stroke={dashed.color} strokeWidth={dashedSubWidth} strokeDasharray="3,2.5">
          {catDash.map(([p1, p2], i) => (
            <line key={`cd${i}`} x1={p1.x.toFixed(2)} y1={p1.y.toFixed(2)} x2={p2.x.toFixed(2)} y2={p2.y.toFixed(2)} />
          ))}
          {aniDash.map(([p1, p2], i) => (
            <line key={`ad${i}`} x1={p1.x.toFixed(2)} y1={p1.y.toFixed(2)} x2={p2.x.toFixed(2)} y2={p2.y.toFixed(2)} />
          ))}
        </g>

        {/* ── Texto de facies — triángulo de cationes ── */}
        <g fontSize={7.5 * fontScale} fill={CLR_FACIE} fontFamily={fontFamily} textAnchor="middle">
          <text x={catZoneCa.x.toFixed(1)} y={(catZoneCa.y + 3).toFixed(1)}>Cálcica</text>
          <text x={catZoneMg.x.toFixed(1)} y={(catZoneMg.y + 3).toFixed(1)}>Magnésica</text>
          <text x={catZoneNaK.x.toFixed(1)} y={(catZoneNaK.y + 3).toFixed(1)}>Sódica</text>
          <text x={catZoneMix.x.toFixed(1)} y={(catZoneMix.y - 2).toFixed(1)}>
            <tspan x={catZoneMix.x.toFixed(1)} dy="0">Magnésica, cálcica</tspan>
            <tspan x={catZoneMix.x.toFixed(1)} dy="9">y sódica</tspan>
          </text>
        </g>

        {/* ── Texto de facies — triángulo de aniones ── */}
        <g fontSize={7.5 * fontScale} fill={CLR_FACIE} fontFamily={fontFamily} textAnchor="middle">
          <text x={aniZoneCl.x.toFixed(1)} y={(aniZoneCl.y + 3).toFixed(1)}>Clorurada</text>
          <text x={aniZoneSO4.x.toFixed(1)} y={(aniZoneSO4.y + 3).toFixed(1)}>Sulfatada</text>
          <text x={aniZoneHCO3.x.toFixed(1)} y={(aniZoneHCO3.y + 3).toFixed(1)}>Bicarbonatada</text>
          <text x={aniZoneMix.x.toFixed(1)} y={(aniZoneMix.y - 2).toFixed(1)}>
            <tspan x={aniZoneMix.x.toFixed(1)} dy="0">Sulfatada, bicarb.</tspan>
            <tspan x={aniZoneMix.x.toFixed(1)} dy="9">y clorurada</tspan>
          </text>
        </g>

        {/* ── Contornos ── */}
        <g fill="none" stroke={outline.color} strokeWidth={outlineWidth} strokeLinejoin="round">
          <polygon points={toPoints(vCa,  vMg,  vNaK)} />
          <polygon points={toPoints(vCl,  vSO4, vHCO3)} />
          <polygon points={toPoints(rT,   rR,   rB,    rL)} />
        </g>

        {/* ── Tick marks + números (= "grilla" de Piper — ver JSDoc de showGrid) — triángulo cationes ── */}
        {showGrid && (
        <g fontSize={9 * fontScale} fill={CLR_TICK} fontFamily={fontFamily}>
          {catBotTicks.map(({ p, n }) => (
            <text key={`cb${n}`} x={p.x.toFixed(1)} y={(p.y + 13).toFixed(1)} textAnchor="middle">{n}</text>
          ))}
          {catLftTicks.map(({ p, n }) => (
            <text key={`cl${n}`} x={(p.x - 6).toFixed(1)} y={(p.y + 2).toFixed(1)} textAnchor="end">{n}</text>
          ))}
          {/* n="100" cae en vNaK, la esquina interna junto al hueco angosto
              (GAP_RATIO·S) hacia el triángulo de aniones — se sube para no
              chocar con el "0" de aniLftTicks en esa misma esquina (ver
              abajo). Va MÁS arriba que ese "0" (-14 vs -6) para que el
              orden vertical quede claro. */}
          {catRgtTicks.map(({ p, n }) => (
            <text key={`cr${n}`} x={(p.x + 6).toFixed(1)} y={(p.y + (n === '100' ? -14 : 2)).toFixed(1)} textAnchor="start">{n}</text>
          ))}
        </g>
        )}

        {/* ── Tick marks + números — triángulo aniones ── */}
        {showGrid && (
        <g fontSize={9 * fontScale} fill={CLR_TICK} fontFamily={fontFamily}>
          {aniBotTicks.map(({ p, n }) => (
            <text key={`ab${n}`} x={p.x.toFixed(1)} y={(p.y + 13).toFixed(1)} textAnchor="middle">{n}</text>
          ))}
          {/* n="0" cae en vCl, la esquina interna simétrica a vNaK — queda
              MÁS ABAJO que el "100" de catRgtTicks (-6 vs -14): el "100"
              es del triángulo izquierdo (cationes) y el "0" del derecho
              (aniones), pero visualmente el "100" debe leerse arriba del
              "0" para que el orden no sea ambiguo. */}
          {aniLftTicks.map(({ p, n }) => (
            <text key={`al${n}`} x={(p.x - 6).toFixed(1)} y={(p.y + (n === '0' ? -6 : 2)).toFixed(1)} textAnchor="end">{n}</text>
          ))}
          {aniRgtTicks.map(({ p, n }) => (
            <text key={`ar${n}`} x={(p.x + 6).toFixed(1)} y={(p.y + 2).toFixed(1)} textAnchor="start">{n}</text>
          ))}
        </g>
        )}

        {/* ── Ticks — bordes superiores del rombo ── */}
        {showGrid && (
        <>
        {/* Un solo "100" en T (SO4+Cl% y Ca+Mg% valen 100 ahí a la vez —
            mostrarlo por cada eje se leía como "100 100" duplicado). */}
        <text x={rT.x.toFixed(1)} y={(rT.y - 4).toFixed(1)} textAnchor="middle"
              fontSize={9 * fontScale} fill={CLR_TICK} fontFamily={fontFamily}>100</text>
        {/* El "0" en L/R coincide con el ápice del triángulo (rL=vMg,
            rR=vHCO₃) — se separa hacia arriba del "100" del triángulo
            (que queda a p.y+2) para no leerse pegados como "1000". */}
        <g fontSize={9 * fontScale} fill={CLR_TICK} fontFamily={fontFamily}>
          {rhoLftTicks.map(({ p, n }) => (
            <text key={`rl${n}`} x={(p.x - 6).toFixed(1)} y={(p.y - 5).toFixed(1)} textAnchor="end">{n}</text>
          ))}
          {rhoRgtTicks.map(({ p, n }) => (
            <text key={`rr${n}`} x={(p.x + 6).toFixed(1)} y={(p.y - 5).toFixed(1)} textAnchor="start">{n}</text>
          ))}
        </g>
        </>
        )}

        {/* ── Nombres de eje (rotados, a lo largo de cada borde, pegados a él) ── */}
        <EdgeLabel mid={lerp(vCa, vNaK, 0.5)}  angle={0}          dx={0}   dy={16} text="Ca" />
        <EdgeLabel mid={lerp(vCa, vMg, 0.5)}   angle={angCatLft}  dx={-10} dy={-4} text="Mg" />
        <EdgeLabel mid={lerp(vMg, vNaK, 0.5)}  angle={angCatRgt}  dx={10}  dy={-4} text="Na + K" />

        <EdgeLabel mid={lerp(vCl, vSO4, 0.5)}  angle={0}          dx={0}   dy={16} text="Cl" />
        <EdgeLabel mid={lerp(vCl, vHCO3, 0.5)} angle={angAniLft}  dx={-11} dy={-4} text="CO₃ + HCO₃" />
        <EdgeLabel mid={lerp(vSO4, vHCO3, 0.5)} angle={angAniRgt} dx={10}  dy={-4} text="SO₄" />

        <EdgeLabel mid={lerp(rT, rL, 0.5)}     angle={angRhoLft}  dx={-13} dy={-4} text="SO₄ + Cl" />
        <EdgeLabel mid={lerp(rT, rR, 0.5)}     angle={angRhoRgt}  dx={13}  dy={-4} text="Ca + Mg" />

        {/* ── Puntos de muestra (forma/tamaño/color por grupo, hover y click) ── */}
        <g>
          {samplePoints.map(sp => (
            <React.Fragment key={sp.id}>
              {([['cat', sp.cat], ['ani', sp.ani], ['dia', sp.dia]] as const).map(([ptType, p]) => (
                <PointMarker
                  key={ptType}
                  shape={sp.shape}
                  cx={p.x} cy={p.y} r={sp.size}
                  fill={sp.color}
                  stroke="#0f172a" strokeWidth={0.6}
                  cursor={onPointClick ? 'pointer' : 'default'}
                  onMouseEnter={() => setHover({ sampleId: sp.id, ptType })}
                  onMouseLeave={() => setHover(h => (h?.sampleId === sp.id && h.ptType === ptType ? null : h))}
                  onClick={() => onPointClick?.(sp.id)}
                />
              ))}
            </React.Fragment>
          ))}
        </g>

      </svg>

      {/* ── Tooltip (estado de React, sin lógica de posicionamiento avanzada) ── */}
      {hoveredPoint && (
        <div
          style={{
            position: 'absolute', pointerEvents: 'none',
            left: Math.min(hoveredPoint.point.x + 10, width - 170),
            top: Math.max(hoveredPoint.point.y - 10, 0),
            background: 'rgba(15,23,42,.94)', color: '#f1f5f9',
            border: '1px solid rgba(255,255,255,.15)', borderRadius: 4,
            padding: '6px 9px', fontSize: 11, lineHeight: 1.5,
            whiteSpace: 'nowrap', zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 700 }}>{hoveredPoint.sp.sample.name}</div>
          <div>Cationes: Ca {hoveredPoint.sp.cationPct.Ca.toFixed(1)}% · Mg {hoveredPoint.sp.cationPct.Mg.toFixed(1)}% · Na {hoveredPoint.sp.cationPct.Na.toFixed(1)}% · K {hoveredPoint.sp.cationPct.K.toFixed(1)}%</div>
          <div>Aniones: Cl {hoveredPoint.sp.anionPct.Cl.toFixed(1)}% · SO₄ {hoveredPoint.sp.anionPct.SO4.toFixed(1)}% · HCO₃ {hoveredPoint.sp.anionPct.HCO3.toFixed(1)}% · CO₃ {hoveredPoint.sp.anionPct.CO3.toFixed(1)}%</div>
        </div>
      )}

      {/* ── Leyenda (forma/color reflejan el estilo elegido por grupo; posición/visibilidad de ChartStyleSettings.legend) ── */}
      {legend.visible && colorMap.size > 0 && (
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', gap: '4px 14px', maxWidth: width - 16,
            padding: '6px 8px', fontSize: 11 * fontScale, fontFamily, color: '#334155',
            background: 'rgba(255,255,255,.88)', borderRadius: 4,
            ...legendPositionStyle(legend.position),
          }}
        >
          {[...colorMap.entries()].map(([label, autoColor]) => {
            const override = pointStyles[label];
            const color = override?.color ?? autoColor;
            const shape = override?.shape ?? DEFAULT_POINT_SHAPE;
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width={12} height={12} style={{ flexShrink: 0, overflow: 'visible' }}>
                  <PointMarker
                    shape={shape} cx={6} cy={6} r={4} fill={color}
                    stroke="#0f172a" strokeWidth={0.6} cursor="default"
                    onMouseEnter={() => {}} onMouseLeave={() => {}} onClick={() => {}}
                  />
                </svg>
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
