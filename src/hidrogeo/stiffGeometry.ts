/**
 * src/hidrogeo/stiffGeometry.ts
 * Valores y orden de vértices del Diagrama de Stiff, compartidos entre
 * StiffDiagram.tsx (vista detallada) y StiffMiniIcon.tsx (ícono de mapa).
 *
 * Orden de vértices verificado contra el código fuente de stiff.py
 * (github.com/jyangfsu/WQChartPy):
 *   x = [-(Na+K), -Ca, -Mg, SO4, HCO3, Cl, -(Na+K)]
 *   y = [ 3,       2,   1,   1,   2,    3,  3      ]
 * Es decir, de arriba a abajo: cationes Na+K/Ca/Mg (izquierda, x negativo),
 * aniones Cl/HCO3/SO4 (derecha, x positivo) — el lado de aniones queda
 * Cl arriba, HCO3 al medio, SO4 abajo (no Cl/SO4/HCO3).
 *
 * CO3 se sigue sumando a HCO3 (igual que en PiperDiagram) porque el
 * resto de la app ya trata "HCO3+CO3" como un solo componente;
 * el stiff.py original no incluye CO3 en absoluto.
 */

import type { WaterSample } from './hydroTypes';
import { calculatePercentages } from './hydroCalculations';

export interface StiffValues {
  naK: number;
  ca: number;
  mg: number;
  cl: number;
  hco3co3: number;
  so4: number;
}

/** Magnitudes en meq/L (siempre ≥ 0) — reutiliza calculatePercentages(), no recalcula nada. */
export function getStiffValues(sample: WaterSample): StiffValues {
  const { meqL } = calculatePercentages(sample);
  return {
    naK: meqL.Na + meqL.K,
    ca: meqL.Ca,
    mg: meqL.Mg,
    cl: meqL.Cl,
    hco3co3: meqL.HCO3 + meqL.CO3,
    so4: meqL.SO4,
  };
}

/** Máximo de las 6 magnitudes — insumo para el autoScale. */
export function stiffDataMax(v: StiffValues): number {
  return Math.max(v.naK, v.ca, v.mg, v.cl, v.hco3co3, v.so4);
}

export interface StiffLocalPoint {
  /** Normalizado por cmax: cationes ∈ [-1, 0], aniones ∈ [0, 1]. */
  x: number;
  /** Nivel de fila, igual que stiff.py: 3 = arriba, 2 = medio, 1 = abajo. */
  y: 1 | 2 | 3;
}

/**
 * Los 6 vértices del polígono en coordenadas locales normalizadas (sin
 * mapear a píxeles todavía). Cada componente decide su propio centerX/halfW.
 */
export function stiffPolygon(v: StiffValues, cmax: number): StiffLocalPoint[] {
  const c = cmax > 0 ? cmax : 1;
  return [
    { x: -v.naK / c,     y: 3 },
    { x: -v.ca / c,      y: 2 },
    { x: -v.mg / c,      y: 1 },
    { x:  v.so4 / c,     y: 1 },
    { x:  v.hco3co3 / c, y: 2 },
    { x:  v.cl / c,      y: 3 },
  ];
}
