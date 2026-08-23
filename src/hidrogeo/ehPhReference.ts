/**
 * src/hidrogeo/ehPhReference.ts
 * Capa de referencia FIJA del diagrama Eh-pH (Merkel y Planer-Friedrich,
 * Etapa 5) — las 2 líneas de estabilidad del agua (calculadas) y los 3
 * segmentos ambientales + 1 etiqueta flotante (digitalizados de la figura
 * de referencia, Iconos/Hidrogeoquimica/Merkel_Planer.png). Ninguno de los
 * dos depende de las muestras del usuario — viven acá, separados de
 * EhPhDiagram.tsx, para poder ajustar coordenadas en un solo lugar si
 * hace falta corregirlas después de comparar visualmente contra la
 * referencia.
 */

// ─────────────────────────────────────────────────────────────────
// LÍNEAS DE ESTABILIDAD DEL AGUA (calculadas, no hardcodeadas)
// ─────────────────────────────────────────────────────────────────

/** Pendiente de Nernst a 25°C, en V por unidad de pH. */
const NERNST_SLOPE_25C = 0.0591;

/**
 * NOTA DE TEMPERATURA: ambas líneas se calculan a 25°C fijo, sin corregir
 * por WaterSample.temperature. La pendiente de Nernst sí escala simple
 * con T (0.0591 × T/298.15 K), pero el intercepto de la línea superior
 * (1.23 V — potencial estándar de la semirreacción O2/H2O) tiene una
 * dependencia térmica real que requiere ΔH°/ΔS° de la reacción,
 * constantes termodinámicas que esta app no maneja en ningún otro lado.
 * "Corregir" solo la pendiente y dejar el intercepto fijo daría una línea
 * con apariencia de ajuste real pero solo a medias — más engañoso que
 * simplemente fijar 25°C (la práctica estándar también en WQChartPy, que
 * tampoco corrige por temperatura este diagrama). Se deja fijo a
 * propósito, no es una omisión.
 */
export const EH_PH_REFERENCE_TEMPERATURE_NOTE =
  'Líneas de estabilidad calculadas a 25°C fijo (sin corregir por la temperatura de cada muestra).';

/**
 * Corrimiento vertical manual de AMBAS líneas de estabilidad, pedido
 * explícitamente (−0.01 V, "bajarlas" en el eje Y) — no tiene base
 * electroquímica, es un ajuste de calce visual contra la referencia,
 * separado del intercepto real de 1.23 V (ese sí es el potencial estándar
 * de la semirreacción O2/H2O, no se toca).
 */
const EH_STABILITY_VERTICAL_OFFSET_V = -0.01;

/** Límite superior de estabilidad del agua (semirreacción O2/H2O), Eh en Voltios. */
export function waterStabilityUpperEhV(pH: number): number {
  return 1.23 - NERNST_SLOPE_25C * pH + EH_STABILITY_VERTICAL_OFFSET_V;
}

/** Límite inferior de estabilidad del agua (semirreacción H2O/H2), Eh en Voltios. */
export function waterStabilityLowerEhV(pH: number): number {
  return -NERNST_SLOPE_25C * pH + EH_STABILITY_VERTICAL_OFFSET_V;
}

// ─────────────────────────────────────────────────────────────────
// BANDAS AMBIENTALES (coordenadas FIJAS — datos digitalizados, no fórmula)
// ─────────────────────────────────────────────────────────────────

export interface EhPhPointLabel {
  /** Una línea de texto, o varias (se renderizan apiladas, ej. "Agua salada" / "rica en materia orgánica"). */
  text: string | string[];
  /** Posición a lo largo del segmento: 0 = `from`, 1 = `to`. */
  t: number;
  /** De qué lado de la línea va el texto (perpendicular, no vertical — ver placeAlongLine() en EhPhDiagram.tsx). */
  side: 'above' | 'below';
}

export interface EhPhEnvironmentSegment {
  /** [pH, Eh en Voltios] */
  from: [number, number];
  to: [number, number];
  /** Título en negrita, centrado sobre la línea. */
  title: string;
  labels: EhPhPointLabel[];
}

/**
 * El eje pH del gráfico NO arranca en pH=0 — el dominio visible empieza en
 * PH_AXIS_MIN (el borde izquierdo real del recuadro, donde está dibujado
 * el eje Y). Los interceptos que da el usuario ("la recta cruza el eje Y a
 * la altura de 0.79") se miden ahí, en el eje que efectivamente SE VE, no
 * en el pH=0 matemático — que queda fuera del recuadro, a la izquierda.
 * Confundir ambos fue un bug real: extrapolar al pH=0 matemático dejaba
 * la porción visible de la línea (en PH_AXIS_MIN) más abajo de lo pedido,
 * por NERNST_SLOPE_25C×PH_AXIS_MIN ≈ 0.06 V — el diagrama importa este
 * valor en vez de redefinirlo, para que EhPhDiagram.tsx (que también lo
 * necesita para el dominio del eje X) y esta capa de referencia usen
 * siempre EL MISMO borde izquierdo.
 */
export const PH_AXIS_MIN = 1;

/**
 * Eh de una banda a un pH dado, a partir de su INTERCEPTO en el borde
 * izquierdo visible del eje (PH_AXIS_MIN, no pH=0 — ver nota arriba) — usa
 * la MISMA pendiente que las 2 líneas de estabilidad (NERNST_SLOPE_25C), a
 * pedido explícito: las 3 bandas deben verse paralelas entre sí y
 * paralelas a esas 2 líneas (mismo ángulo visual en pantalla, ~12.8°), no
 * con su propia pendiente digitalizada de la referencia — se pisa a
 * propósito la fidelidad estricta a Merkel_Planer.png en este punto, por
 * pedido directo.
 */
function bandEhAtPh(interceptAtAxisMin: number, pH: number): number {
  return interceptAtAxisMin - NERNST_SLOPE_25C * (pH - PH_AXIS_MIN);
}

/**
 * 3 bandas ambientales. Cada una se define por su INTERCEPTO en pH=0 (dado
 * directamente) y el rango de pH que cubre (digitalizado de la
 * referencia) — el Eh de `from`/`to` se DERIVA de ambos con
 * bandEhAtPh(), así las 3 líneas quedan exactamente paralelas entre sí y
 * a las 2 líneas de estabilidad.
 */
export const EH_PH_ENVIRONMENT_SEGMENTS: EhPhEnvironmentSegment[] = [
  {
    // Intercepto en PH_AXIS_MIN (pH=1, el eje visible): Eh=0.84 V (0.79 + 0.05, subida pedida).
    from: [2, bandEhAtPh(0.84, 2)],
    to: [10, bandEhAtPh(0.84, 10)],
    title: 'Ambientes en contacto con la atmósfera',
    labels: [
      { text: 'Agua de mina', t: 0, side: 'below' }, // pH≈2 (extremo inicial)
      { text: 'Agua de lluvia', t: 0.25, side: 'below' }, // pH≈4
      { text: 'Agua oceánica', t: 0.75, side: 'below' }, // pH≈8 (corrida levemente a la izquierda, pedido explícito)
    ],
  },
  {
    // Intercepto en PH_AXIS_MIN (pH=1, el eje visible): Eh=0.55 V.
    from: [4, bandEhAtPh(0.55, 4)],
    to: [10, bandEhAtPh(0.55, 10)],
    title: 'Ambientes transicionales',
    labels: [
      { text: 'Humedales y turberas', t: 0, side: 'below' }, // pH≈4 (extremo inicial)
      { text: 'Aguas subterráneas', t: 0.9167, side: 'below' }, // pH≈9.5
    ],
  },
  {
    // Intercepto en PH_AXIS_MIN (pH=1, el eje visible): Eh=0.25 V.
    from: [4, bandEhAtPh(0.25, 4)],
    to: [11, bandEhAtPh(0.25, 11)],
    title: 'Ambientes aislados de la atmósfera',
    labels: [
      { text: 'Suelos saturados en agua', t: 0, side: 'below' }, // pH≈4 (extremo inicial)
      { text: 'Lagos euxínicos', t: 0.4286, side: 'below' }, // pH≈7
      { text: ['Agua salada', 'rica en materia orgánica'], t: 0.9643, side: 'below' }, // pH≈10.75
    ],
  },
];

// ─────────────────────────────────────────────────────────────────
// ETIQUETA FLOTANTE (sin línea asociada, sin rotación)
// ─────────────────────────────────────────────────────────────────

export interface EhPhFloatingLabel {
  text: string | string[];
  /** pH donde se ancla, a lo largo de la línea de la Banda 1 ("Ambientes en contacto con la atmósfera" — es la línea de la que "cuelga"), extrapolada más allá de su extremo `to` si hace falta (t puede ser >1). */
  ph: number;
  /** Offset perpendicular a esa línea (positivo = arriba, negativo = abajo) — mismo mecanismo que EhPhPointLabel, ver placeAlongLine() en EhPhDiagram.tsx. */
  perp: number;
}

/**
 * Único texto flotante de la referencia — sin línea ambiental propia, pero
 * sí sigue el ángulo Y la cercanía de la línea de la Banda 1 ("Ambientes
 * en contacto con la atmósfera", pedido explícito — antes colgaba de la
 * línea de estabilidad superior). Se ancla igual que cualquier
 * EhPhPointLabel de banda, solo que "por fuera" de su extremo derecho
 * (pH > 10, el `to` de la Banda 1).
 */
export const EH_PH_FLOATING_LABELS: EhPhFloatingLabel[] = [
  { text: ['Residuos', 'saturados en sal'], ph: 10.7, perp: -16 },
];
