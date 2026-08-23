/**
 * src/gis/affineFit.ts
 * Ajuste de transformación 2D a partir de puntos de control (imagen →
 * mundo real) para GeoreferencingTool.tsx (Etapa 8). Sin React, sin
 * estado propio — funciones puras, testeables.
 *
 * Dos modelos, según cantidad de puntos (decisión confirmada: afín
 * completa desde 3 puntos, no similitud extendida — ver conversación):
 *   - Exactamente 2 puntos: transformación de SIMILITUD (escala +
 *     rotación + traslación, SIN cizalla) — solución algebraica directa,
 *     4 incógnitas / 4 ecuaciones, ajuste exacto.
 *   - 3 o más puntos: transformación AFÍN completa (6 parámetros, permite
 *     cizalla/escala no uniforme por eje) por mínimos cuadrados — con
 *     EXACTAMENTE 3 puntos el sistema queda exactamente determinado (6
 *     incógnitas / 6 ecuaciones, residuo ≈ 0 salvo error de punto
 *     flotante); recién con 4+ puntos el ajuste es realmente
 *     sobre-determinado y el residuo se vuelve informativo sobre la
 *     precisión real del georreferenciado.
 */

export interface ControlPoint {
  imageX: number;
  imageY: number;
  worldEast: number;
  worldNorth: number;
}

/**
 * Transformación afín general, de espacio de IMAGEN (x,y en píxeles,
 * origen arriba-izquierda) a MUNDO real:
 *   east  = a*x + b*y + e
 *   north = c*x + d*y + f
 * Misma convención que WorldFileParams (rasterImport.ts) — a,b,c,d son la
 * parte lineal (rotación/escala/cizalla), e,f la traslación.
 */
export interface AffineTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface AffineFitResult {
  transform: AffineTransform;
  /** Distancia (unidades de mundo) entre cada punto de control y su posición predicha por la transformación, mismo orden que la lista de entrada. */
  residuals: number[];
  /** RMS de los residuos — ≈0 si el sistema queda exactamente determinado (2 puntos, o exactamente 3 para el modelo afín). */
  residualRMS: number;
}

export function applyAffineTransform(t: AffineTransform, x: number, y: number): [number, number] {
  return [t.a * x + t.b * y + t.e, t.c * x + t.d * y + t.f];
}

function computeResiduals(transform: AffineTransform, points: ControlPoint[]): { residuals: number[]; residualRMS: number } {
  const residuals = points.map((p) => {
    const [predE, predN] = applyAffineTransform(transform, p.imageX, p.imageY);
    return Math.hypot(predE - p.worldEast, predN - p.worldNorth);
  });
  const residualRMS = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / residuals.length);
  return { residuals, residualRMS };
}

/**
 * Transformación de similitud (sin cizalla) a partir de EXACTAMENTE 2
 * puntos de control — solución algebraica directa, no iterativa.
 *
 * Se busca (a,b,tx,ty) tal que:
 *   east  = a*x - b*y + tx
 *   north = b*x + a*y + ty
 * La matriz lineal [[a,-b],[b,a]] es SIEMPRE una rotación+escala uniforme
 * pura (columnas ortogonales de igual norma: (a,b)·(-b,a) = -ab+ba = 0,
 * |(a,b)| = |(-b,a)| = √(a²+b²)) — nunca puede representar cizalla,
 * cualquiera sea el valor de a,b.
 *
 * Restando las ecuaciones del punto 2 menos las del punto 1 se elimina
 * (tx,ty), quedando un sistema lineal 2×2 en (a,b) con solución cerrada.
 */
export function computeSimilarityTransform(points: [ControlPoint, ControlPoint]): AffineFitResult {
  const [p1, p2] = points;
  const dx = p2.imageX - p1.imageX;
  const dy = p2.imageY - p1.imageY;
  const dE = p2.worldEast - p1.worldEast;
  const dN = p2.worldNorth - p1.worldNorth;

  const denom = dx * dx + dy * dy;
  if (denom === 0) {
    throw new Error('computeSimilarityTransform: los dos puntos de control están en la misma posición de imagen.');
  }

  const a = (dE * dx + dN * dy) / denom;
  const b = (dN * dx - dE * dy) / denom;
  const tx = p1.worldEast - a * p1.imageX + b * p1.imageY;
  const ty = p1.worldNorth - b * p1.imageX - a * p1.imageY;

  const transform: AffineTransform = { a, b: -b, c: b, d: a, e: tx, f: ty };
  const { residuals, residualRMS } = computeResiduals(transform, points);
  return { transform, residuals, residualRMS };
}

/** Resuelve el sistema lineal 3×3 Mx=v por la regla de Cramer (matriz fija de tamaño 3, no hace falta una librería de álgebra lineal). */
function solve3x3(M: number[][], v: number[]): number[] {
  const det3 = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

  const D = det3(M);
  if (Math.abs(D) < 1e-9) {
    throw new Error('computeAffineTransform: los puntos de control son colineales o están muy poco distribuidos (sistema singular) — elige puntos que no estén todos sobre una misma línea.');
  }

  const replaceCol = (col: number) => M.map((row, i) => row.map((val, j) => (j === col ? v[i] : val)));
  return [0, 1, 2].map((col) => det3(replaceCol(col)) / D);
}

/**
 * Transformación afín completa (6 parámetros, permite cizalla/escala no
 * uniforme por eje) a partir de 3 o más puntos de control, por mínimos
 * cuadrados — dos regresiones lineales INDEPENDIENTES (Este y Norte no
 * interactúan entre sí):
 *   east  = a*x + b*y + e   (minimiza Σ(east_pred  − east_real)²)
 *   north = c*x + d*y + f   (minimiza Σ(north_pred − north_real)²)
 * cada una resuelta vía las ecuaciones normales (XᵀX)β = Xᵀy — un sistema
 * lineal 3×3 por regresión, con la MISMA matriz XᵀX para ambas (solo
 * cambia el lado derecho), ya que ambas comparten los mismos puntos de
 * imagen de entrada.
 */
export function computeAffineTransform(points: ControlPoint[]): AffineFitResult {
  if (points.length < 3) {
    throw new Error('computeAffineTransform: hacen falta al menos 3 puntos de control (con 2, usa computeSimilarityTransform).');
  }

  let sxx = 0, sxy = 0, sx = 0, syy = 0, sy = 0;
  let sxE = 0, syE = 0, sE = 0;
  let sxN = 0, syN = 0, sN = 0;
  const n = points.length;

  for (const p of points) {
    const { imageX: x, imageY: y, worldEast: E, worldNorth: N } = p;
    sxx += x * x; sxy += x * y; sx += x;
    syy += y * y; sy += y;
    sxE += x * E; syE += y * E; sE += E;
    sxN += x * N; syN += y * N; sN += N;
  }

  const XtX = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ];

  const [a, b, e] = solve3x3(XtX, [sxE, syE, sE]);
  const [c, d, f] = solve3x3(XtX, [sxN, syN, sN]);

  const transform: AffineTransform = { a, b, c, d, e, f };
  const { residuals, residualRMS } = computeResiduals(transform, points);
  return { transform, residuals, residualRMS };
}

/**
 * Punto de entrada único: 2 puntos → similitud exacta (sin cizalla);
 * 3 o más → afín completa por mínimos cuadrados. Rechaza con menos de 2.
 */
export function fitControlPoints(points: ControlPoint[]): AffineFitResult {
  if (points.length < 2) {
    throw new Error('fitControlPoints: hacen falta al menos 2 puntos de control.');
  }
  if (points.length === 2) {
    return computeSimilarityTransform([points[0], points[1]]);
  }
  return computeAffineTransform(points);
}
