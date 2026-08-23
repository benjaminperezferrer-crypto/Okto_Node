/**
 * src/estructural/rectSelection.ts
 * Paquete de mejoras de Análisis Estructural — identificación de familias
 * estructurales: geometría PURA del hit-testing rectangular usado por
 * StereonetPlanes.tsx (mismo criterio de separación que stereonet.ts/
 * kambDensity.ts — sin SVG/React/DOM acá, testeable sin montar nada).
 *
 * ── Por qué rectángulo y no lazo (lasso) ────────────────────────────
 * Un lazo (polígono arbitrario trazado a mano) requiere point-in-polygon
 * en vez de una simple comparación de rango — más código, más superficie
 * de bugs geométricos, y la ganancia de expresividad es marginal para el
 * caso de uso real ("aislar un clúster visualmente compacto de polos"),
 * que un rectángulo ya cubre bien en la gran mayoría de los casos. Se
 * elige el rectángulo por ser MUCHO más simple de implementar
 * correctamente (y de verificar) sin sacrificar el caso de uso principal
 * — decisión explícitamente delegada al criterio de implementación.
 *
 * La conversión de coordenadas de pantalla (mousedown/mousemove/mouseup)
 * al espacio de contenido del SVG (donde vive `positionOf`) es
 * responsabilidad de StereonetPlanes.tsx (usa DOM — getScreenCTM — no es
 * pura, no pertenece acá) — este archivo solo sabe comparar puntos ya
 * resueltos contra un rectángulo.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Normaliza 2 puntos arbitrarios (inicio/fin de arrastre, en cualquier orden) a un rectángulo con x1≤x2, y1≤y2. */
export function normalizeRect(p1: Point2D, p2: Point2D): Rect {
  return {
    x1: Math.min(p1.x, p2.x),
    x2: Math.max(p1.x, p2.x),
    y1: Math.min(p1.y, p2.y),
    y2: Math.max(p1.y, p2.y),
  };
}

/** true si `p` cae dentro de `rect`, bordes inclusive. */
export function pointInRect(p: Point2D, rect: Rect): boolean {
  return p.x >= rect.x1 && p.x <= rect.x2 && p.y >= rect.y1 && p.y <= rect.y2;
}

/**
 * IDs de los ítems cuya posición proyectada (`positionOf`) cae dentro de
 * `rect` — hit-testing genérico sobre cualquier conjunto de ítems con
 * `id`, reutilizable independientemente de qué representa cada punto
 * (StereonetPlanes.tsx lo usa con polos proyectados, pero no depende de
 * eso). O(n) sobre `items` — sin estructuras auxiliares (grillas
 * espaciales, etc.): a la escala real del módulo (~4000 mediciones) un
 * recorrido lineal ya es sub-milisegundo (medido antes de dar por buena
 * esta implementación, ver notas de rendimiento en el mensaje de la
 * etapa) — no hay necesidad de optimizar antes de tener evidencia de que
 * hace falta.
 */
export function hitTestRect<T extends { id: string }>(
  items: T[],
  positionOf: (item: T) => Point2D,
  rect: Rect,
): string[] {
  const ids: string[] = [];
  for (const item of items) {
    if (pointInRect(positionOf(item), rect)) ids.push(item.id);
  }
  return ids;
}
