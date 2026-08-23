/**
 * src/hidrogeo/piperGeometry.ts
 * Transformación de coordenadas para el Diagrama de Piper.
 *
 * Replica la lógica trigonométrica de WQChartPy (triangle_piper.py).
 * Todo en coordenadas SVG: y aumenta hacia ABAJO.
 */

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Convierte coordenadas ternarias (baricéntricas) a coordenadas cartesianas SVG.
 *
 * Convención de vértices (igual que WQChartPy triangle_piper.py):
 *   a  →  vértice inferior-izquierdo  (100 % a)
 *   b  →  vértice inferior-derecho    (100 % b)
 *   c  →  vértice superior            (100 % c)
 *
 * Derivación:
 *   P = aₙ·A + bₙ·B + cₙ·C   (interpolación baricéntrica)
 *
 *   Con A=(0,0), B=(size,0), C=(size/2, −h) en coordenadas locales,
 *   donde h = size·√3/2 (altura del triángulo equilátero):
 *
 *   x = origin.x + (bₙ + cₙ·0.5)·size
 *   y = origin.y − cₙ·(√3/2)·size        ← minus porque y↑ en SVG es y↓
 *
 * @param a       componente inferior-izquierda (0–100 o 0–1; se normaliza)
 * @param b       componente inferior-derecha
 * @param c       componente superior
 * @param origin  posición SVG del vértice inferior-izquierdo (a=100 %)
 * @param size    longitud del lado del triángulo en píxeles
 * @returns       coordenadas SVG {x, y}
 */
export function ternaryToCartesian(
  a: number,
  b: number,
  c: number,
  origin: Point2D,
  size: number,
): Point2D {
  const sum = a + b + c;
  // Cuando sum = 0 devolvemos el centroide para evitar NaN
  const bn = sum === 0 ? 1 / 3 : b / sum;
  const cn = sum === 0 ? 1 / 3 : c / sum;

  return {
    x: origin.x + (bn + cn * 0.5) * size,
    y: origin.y - cn * (Math.sqrt(3) / 2) * size,
  };
}
