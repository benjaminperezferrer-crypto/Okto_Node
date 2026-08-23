/**
 * src/estructural/symbolAssignment.ts
 * Paquete de mejoras de Análisis Estructural — símbolos distintos por
 * tipo de estructura (ADEMÁS del color ya existente, nunca en
 * reemplazo), como opción activable — mismo criterio "apagado por
 * default, activable" que Kamb/plano-polo medio. Función pura, sin
 * React/SVG concreto: devuelve datos de geometría (puntos de polígono),
 * cada consumidor (StereonetPlanes.tsx, ClassificationFilterPanel.tsx
 * para los íconos de la leyenda) arma su propio JSX con eso — mismo
 * patrón que stereonet.ts/kambDensity.ts.
 *
 * ── Por qué 6 formas y no más ──────────────────────────────────────
 * Más de 6-7 formas geométricas simples dejan de ser distinguibles de un
 * vistazo a tamaño de marcador (~3-6px de radio) — el mismo problema que
 * ya reconoce PALETTE en classification.ts (10 colores, cíclica). Con 6
 * formas + 10 colores hay 60 combinaciones antes de que un valor
 * "recicle" AMBOS a la vez, cobertura de sobra para los campos
 * clasificables reales del módulo (tipo/cinemática/zona/campaña).
 *
 * ── Reciclado: por qué contorno punteado, no una 7ma forma inventada ──
 * Si hay más valores que formas, se reinicia el ciclo de formas (mismo
 * criterio que PALETTE con colores) — pero a diferencia del color, DOS
 * valores con la MISMA forma reciclada serían indistinguibles solo por
 * forma (el color todavía los distingue, salvo que color Y forma
 * reciclen en la misma vuelta, ver docstring de getClassificationShapes).
 * Se marca la 2da vuelta en adelante con `dashed: true` (contorno
 * punteado) — más simple y legible que agregar formas cada vez menos
 * distinguibles (pentágono vs hexágono vs heptágono...).
 */

export type ShapeKind = 'circle' | 'square' | 'triangle' | 'diamond' | 'cross' | 'hexagon';

/** Orden fijo — determina qué forma le toca al valor de clasificación N-ésimo (ver getClassificationShapes). */
export const SHAPE_KINDS: readonly ShapeKind[] = ['circle', 'square', 'triangle', 'diamond', 'cross', 'hexagon'];

export interface SymbolAssignment {
  shape: ShapeKind;
  /** true si esta forma es una REPETICIÓN (2da vuelta de SHAPE_KINDS en adelante) — el consumidor debe dibujar un contorno punteado para distinguirla de la 1ra aparición de la misma forma. */
  dashed: boolean;
}

/**
 * Asigna una forma a cada valor de clasificación, EN EL MISMO ORDEN que
 * las claves de `colors` (el Record<valor,color> que ya produce
 * getClassificationColors() de classification.ts) — el orden de
 * inserción de un objeto JS refleja el orden de primera aparición con el
 * que se construyó, así que un valor recibe la MISMA forma sin importar
 * si aparece en un plano o una línea, igual que ya pasa con su color, sin
 * tener que re-derivar el orden desde los datos crudos una segunda vez.
 */
export function getClassificationShapes(colors: Record<string, string>): Record<string, SymbolAssignment> {
  const values = Object.keys(colors);
  const shapes: Record<string, SymbolAssignment> = {};
  values.forEach((value, i) => {
    shapes[value] = {
      shape: SHAPE_KINDS[i % SHAPE_KINDS.length],
      dashed: i >= SHAPE_KINDS.length,
    };
  });
  return shapes;
}

// ─────────────────────────────────────────────────────────────────
// GEOMETRÍA — puntos de polígono en coordenadas de PANTALLA (cx,cy ya
// resueltos por el llamador, mismo sistema que ctx.toScreen() de
// StereonetBase.tsx: origen arriba-izquierda, y hacia abajo).
// ─────────────────────────────────────────────────────────────────

const DEG2RAD = Math.PI / 180;

/** Vértices de un polígono regular de `sides` lados, radio `r`, centrado en (cx,cy) — ángulo 0 = arriba (Norte), sentido horario, misma convención que pointOnCircle() de StereonetBase.tsx. */
function regularPolygonPoints(cx: number, cy: number, r: number, sides: number, rotationDeg: number): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (rotationDeg + i * (360 / sides)) * DEG2RAD;
    const x = cx + r * Math.sin(angle);
    const y = cy - r * Math.cos(angle);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Vértices de una cruz/plus de 12 puntos, brazos de medio-ancho 0.35·r, centrada en (cx,cy). */
function crossPoints(cx: number, cy: number, r: number): string {
  const a = r * 0.35;
  const offsets: [number, number][] = [
    [-a, -r], [a, -r], [a, -a], [r, -a], [r, a], [a, a],
    [a, r], [-a, r], [-a, a], [-r, a], [-r, -a], [-a, -a],
  ];
  return offsets.map(([dx, dy]) => `${(cx + dx).toFixed(2)},${(cy + dy).toFixed(2)}`).join(' ');
}

/**
 * Puntos de polígono SVG (atributo `points`) para `shape`, centrado en
 * (cx,cy), con un tamaño comparable en área a un `<circle r={size}>`
 * (cada forma usa un radio-equivalente distinto — un triángulo/cuadrado
 * inscrito en radio `size` se ve más chico que el círculo de igual radio,
 * así que se agranda un poco cada uno para que el área percibida sea
 * similar; no es una igualdad matemática exacta, es una normalización
 * visual). Devuelve `null` para 'circle' — ese caso se renderiza con
 * `<circle>`, no `<polygon>` (más simple, sin aproximar un círculo con
 * polígono de muchos lados).
 */
export function shapePolygonPoints(shape: ShapeKind, cx: number, cy: number, size: number): string | null {
  switch (shape) {
    case 'circle':
      return null;
    case 'square':
      return regularPolygonPoints(cx, cy, size * 1.15, 4, 45);
    case 'triangle':
      return regularPolygonPoints(cx, cy, size * 1.45, 3, 0);
    case 'diamond':
      return regularPolygonPoints(cx, cy, size * 1.3, 4, 0);
    case 'cross':
      return crossPoints(cx, cy, size * 1.3);
    case 'hexagon':
      return regularPolygonPoints(cx, cy, size * 1.1, 6, 0);
  }
}
