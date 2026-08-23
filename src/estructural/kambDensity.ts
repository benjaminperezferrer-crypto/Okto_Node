/**
 * src/estructural/kambDensity.ts
 * Etapa 8 — contorneo de densidad de polos, método de Kamb (1959),
 * variante CLÁSICA de círculo de conteo binario (no la "modified Kamb" /
 * Vollmer 1995, que usa un kernel de peso continuo en vez de un corte
 * duro dentro/fuera del círculo) — función pura, sin SVG/React.
 *
 * ── Parámetros confirmados con el usuario antes de implementar ────────
 * K=3 (constante del círculo de conteo), contornos cada 2σ empezando en
 * 2σ, grilla cartesiana 60×60 recortada al disco — ver la explicación
 * completa (con la derivación estadística) en el mensaje de la Etapa 8,
 * resumida abajo en `computeKambDensity()`.
 *
 * ── Derivación estadística ─────────────────────────────────────────
 * Para N polos distribuidos uniformemente al azar en el hemisferio
 * (hipótesis nula), la probabilidad de que UNO caiga dentro de un
 * círculo de conteo de radio angular θ es `p = 1 − cos(θ)` (área del
 * casquete esférico de semiángulo θ, sobre el área del hemisferio
 * completo, ambas en estereorradianes: 2π(1−cosθ) / 2π). El conteo X
 * dentro del círculo sigue Binomial(N, p).
 *
 * Kamb elige θ de forma que, bajo esa hipótesis nula, el conteo
 * esperado tenga desviación estándar ≈ K (K=3 es el valor "estándar"
 * que usó el propio Kamb 1959 y el default más común en implementaciones
 * de referencia):
 *
 *     p = K² / (N + K²)      θ = arccos(1 − p) = arccos(N / (N + K²))
 *
 * Con ese p, exacto (no aproximado):
 *
 *     E[X]   = N·p
 *     Var[X] = N·p·(1−p)
 *
 * y el valor que se contornea en cada nodo de grilla es el conteo
 * ESTANDARIZADO (desviaciones estándar sobre el fondo aleatorio
 * esperado, no un conteo crudo):
 *
 *     σ(nodo) = (X(nodo) − E[X]) / √Var[X]
 *
 * ── Por qué la distancia se mide en la ESFERA, no en el plano
 *    proyectado ───────────────────────────────────────────────────
 * Un nodo de grilla vive en el mismo plano proyectado que
 * projectPole()/projectLine() (coordenadas x,y centradas en el origen,
 * radio = radio del estereograma). Para decidir si un polo cae "dentro"
 * del círculo de conteo de ese nodo, el nodo se invierte a trend/plunge
 * con invertProjection() (stereonet.ts) y se compara la distancia
 * angular ESFÉRICA real (producto punto de vectores unitarios) contra
 * θ — nunca una distancia euclidiana en el plano proyectado, que sería
 * geométricamente incorrecta (Schmidt/Wulff distorsionan hacia el
 * borde, la distancia plana ahí ya no corresponde a la distancia
 * angular real).
 *
 * ── Por qué relleno de color en vez de isolíneas ───────────────────
 * El enunciado permite cualquiera de las dos ("como isolíneas o relleno
 * de color"). Se eligió relleno de color por celda de grilla (heatmap)
 * en vez de trazar isolíneas reales (p.ej. marching squares): mismo
 * contenido informativo (bandas de nivel de σ), muchísimo más simple de
 * implementar y verificar correctamente, sin agregar una dependencia de
 * geometría de contorno nueva a este módulo.
 */

import { invertProjection, Projection } from './stereonet';

export interface KambGridPoint {
  /** Posición del nodo en el mismo plano proyectado que projectPole()/projectLine(). */
  x: number;
  y: number;
  /** Conteo crudo de polos dentro del círculo de conteo centrado en este nodo. */
  count: number;
  /** Conteo estandarizado: (count − E[X]) / √Var[X], en desviaciones estándar sobre el fondo aleatorio esperado. */
  sigma: number;
}

export interface KambDensityResult {
  points: KambGridPoint[];
  /** Semiángulo del círculo de conteo (θ), en grados — para referencia/documentación, no necesario para renderizar. */
  countingCircleRadiusDeg: number;
  /** E[X] bajo la hipótesis nula (N polos uniformemente al azar). */
  expected: number;
  /** √Var[X] bajo la hipótesis nula. */
  stdDev: number;
  /** Tamaño de celda de la grilla (mismas unidades que `radius`). */
  cellSize: number;
}

export interface KambOptions {
  /** Constante del círculo de conteo — ver derivación en el encabezado del archivo. Default 3 (confirmado con el usuario). */
  K?: number;
  /** Resolución de la grilla cartesiana (antes de recortar al disco). Default 60. */
  gridSize?: number;
}

const DEG2RAD = Math.PI / 180;

/** Vector unitario (x=Este,y=Norte,z=Abajo) — misma convención que el resto del módulo (ver structuralTypes.ts). */
function toVector(trendDeg: number, plungeDeg: number): [number, number, number] {
  const tr = trendDeg * DEG2RAD, pl = plungeDeg * DEG2RAD;
  return [Math.cos(pl) * Math.sin(tr), Math.cos(pl) * Math.cos(tr), Math.sin(pl)];
}

/**
 * Calcula la densidad de Kamb de un conjunto de polos (trend/plunge, ya
 * resueltos — el llamador convierte PlanarMeasurement.azimut/dip a su
 * polo antes de llamar acá, esta función no conoce PlanarMeasurement)
 * sobre una grilla cartesiana en el plano proyectado, recortada al
 * disco del estereograma.
 *
 * @param poles polos como {trend,plunge} (hemisferio inferior)
 * @param radius radio del estereograma — mismo valor que se le pasa a projectPole/projectLine
 * @param projection 'schmidt' | 'wulff' — debe ser la MISMA que se usó para proyectar los polos que se están graficando
 */
export function computeKambDensity(
  poles: { trend: number; plunge: number }[],
  radius: number,
  projection: Projection,
  options: KambOptions = {},
): KambDensityResult {
  const K = options.K ?? 3;
  const gridSize = options.gridSize ?? 60;
  const N = poles.length;
  const cellSize = (2 * radius) / (gridSize - 1);

  if (N === 0) {
    return { points: [], countingCircleRadiusDeg: 0, expected: 0, stdDev: 0, cellSize };
  }

  const p = (K * K) / (N + K * K);
  const cosTheta = 1 - p; // punto cuenta si dot(nodo,polo) >= cosTheta — evita un acos() por par en el loop caliente
  const thetaDeg = Math.acos(cosTheta) * (180 / Math.PI);
  const expected = N * p;
  const variance = N * p * (1 - p);
  const stdDev = Math.sqrt(variance);

  const poleVectors = poles.map((pl) => toVector(pl.trend, pl.plunge));

  const points: KambGridPoint[] = [];
  for (let i = 0; i < gridSize; i++) {
    const x = -radius + i * cellSize;
    for (let j = 0; j < gridSize; j++) {
      const y = -radius + j * cellSize;
      if (x * x + y * y > radius * radius) continue; // fuera del disco del estereograma

      const { trend, plunge } = invertProjection(x, y, radius, projection);
      const [vx, vy, vz] = toVector(trend, plunge);

      let count = 0;
      for (const [px, py, pz] of poleVectors) {
        if (vx * px + vy * py + vz * pz >= cosTheta) count++;
      }

      const sigma = stdDev > 0 ? (count - expected) / stdDev : 0;
      points.push({ x, y, count, sigma });
    }
  }

  return { points, countingCircleRadiusDeg: thetaDeg, expected, stdDev, cellSize };
}

/**
 * Convierte un valor σ a un índice de banda de contorno discreto, para
 * colorear/agrupar en el render: banda 0 = [minSigma, minSigma+step),
 * banda 1 = [minSigma+step, minSigma+2·step), etc. Devuelve -1 si
 * `sigma < minSigma` (no significativo — no se dibuja, ver convención
 * de Kamb de omitir todo por debajo del umbral mínimo).
 */
export function sigmaToBand(sigma: number, minSigma = 2, stepSigma = 2): number {
  if (sigma < minSigma) return -1;
  return Math.floor((sigma - minSigma) / stepSigma);
}

// ─────────────────────────────────────────────────────────────────
// SUAVIZADO POR INTERPOLACIÓN BILINEAL (paquete de mejoras de
// Análisis Estructural — barra de escala + suavizado de Kamb)
// ─────────────────────────────────────────────────────────────────

/**
 * Campo de σ indexable en grilla — envuelve `KambDensityResult.points`
 * (una lista plana, solo celdas dentro del disco) en un array 2D denso
 * (`gridSize × gridSize`, con `NaN` en las celdas fuera del disco/no
 * computadas) para poder samplear por índice (i,j) en O(1), que es lo que
 * necesita `sampleKambFieldBilinear()` en el loop caliente de render.
 *
 * ── Decisión confirmada con el usuario: Opción 2 — interpolar en el
 *    RENDER, sin tocar el cálculo (gridSize=60 sigue siendo el costo ya
 *    medido, ~484ms con el dataset real de ~4000 mediciones) ──────────
 * `buildKambField()` es O(gridSize²) (recorre `points`, que ya existe),
 * trivial comparado con el cálculo de `computeKambDensity()` en sí — no
 * agrega ningún trabajo O(N) nuevo. El suavizado ocurre después, muestreando
 * este campo a una resolución de RENDER mayor (ver StereonetPlanes.tsx),
 * nunca recalculando `computeKambDensity()` a mayor `gridSize`.
 */
export interface KambField {
  gridSize: number;
  cellSize: number;
  radius: number;
  /** sigma en el nodo (i,j), acceso vía `sigmaGrid[i * gridSize + j]`. `NaN` = nodo fuera del disco del estereograma (no computado por computeKambDensity). */
  sigmaGrid: Float64Array;
}

/** Construye el campo indexable a partir del resultado de `computeKambDensity()`. `radius` debe ser el mismo que se le pasó a `computeKambDensity()`. */
export function buildKambField(result: KambDensityResult, radius: number): KambField {
  const cellSize = result.cellSize;
  // Mismo `gridSize` que usó computeKambDensity() para generar `result.points`,
  // recuperado de cellSize=(2·radius)/(gridSize−1) — evita que el llamador tenga
  // que volver a pasar `gridSize` (y que se desincronice del que realmente se usó).
  const gridSize = cellSize > 0 ? Math.round((2 * radius) / cellSize) + 1 : 0;
  const sigmaGrid = new Float64Array(gridSize * gridSize).fill(NaN);
  for (const pt of result.points) {
    const i = Math.round((pt.x + radius) / cellSize);
    const j = Math.round((pt.y + radius) / cellSize);
    if (i >= 0 && i < gridSize && j >= 0 && j < gridSize) sigmaGrid[i * gridSize + j] = pt.sigma;
  }
  return { gridSize, cellSize, radius, sigmaGrid };
}

/**
 * Interpola bilinealmente el valor de σ en un punto (x,y) arbitrario del
 * plano proyectado (misma convención matemática que stereonet.ts:
 * centrado en el origen, x=Este/y=Norte), a partir de los 4 nodos de
 * grilla más cercanos de `field`.
 *
 * Devuelve `null` si (x,y) cae fuera del rango de la grilla, o si
 * CUALQUIERA de los 4 nodos vecinos es `NaN` (fuera del disco del
 * estereograma / no computado) — a propósito: extrapolar con datos
 * faltantes daría un valor inventado cerca del borde del disco, así que
 * se prefiere no dibujar nada ahí (mismo criterio que `computeKambDensity()`,
 * que ya se salta explícitamente los nodos fuera del disco).
 */
export function sampleKambFieldBilinear(field: KambField, x: number, y: number): number | null {
  const { gridSize, cellSize, radius, sigmaGrid } = field;
  if (gridSize === 0) return null;
  const fi = (x + radius) / cellSize;
  const fj = (y + radius) / cellSize;
  const i0 = Math.floor(fi);
  const j0 = Math.floor(fj);
  const i1 = i0 + 1;
  const j1 = j0 + 1;
  if (i0 < 0 || j0 < 0 || i1 >= gridSize || j1 >= gridSize) return null;

  const s00 = sigmaGrid[i0 * gridSize + j0];
  const s10 = sigmaGrid[i1 * gridSize + j0];
  const s01 = sigmaGrid[i0 * gridSize + j1];
  const s11 = sigmaGrid[i1 * gridSize + j1];
  if (Number.isNaN(s00) || Number.isNaN(s10) || Number.isNaN(s01) || Number.isNaN(s11)) return null;

  const tx = fi - i0;
  const ty = fj - j0;
  const top = s00 * (1 - tx) + s10 * tx;
  const bottom = s01 * (1 - tx) + s11 * tx;
  return top * (1 - ty) + bottom * ty;
}
