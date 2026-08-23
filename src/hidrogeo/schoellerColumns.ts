/**
 * src/hidrogeo/schoellerColumns.ts
 * Etapa 8 — definición de las 7 columnas de iones del diagrama
 * Schoeller-Berkaloff, en el orden fijo pedido: Ca, Mg, Na+K, Cl, SO4,
 * HCO3+CO3, NO3.
 *
 * Cada columna sabe:
 *   - meqLOf(meqL): el valor REAL en meq/L de esa muestra para esa
 *     columna (suma de sus iones) — esto es lo ÚNICO que se usa para
 *     UBICAR el punto en el eje compartido (ver JSDoc de
 *     SchoellerBerkaloffDiagram.tsx: todo el diagrama posiciona los
 *     puntos por meq/L, nunca por una escala mg/L independiente).
 *   - isAvailable(sample): false solo si falta un ion opcional (hoy,
 *     únicamente NO3 — el resto son campos requeridos de WaterSample).
 *   - nominalEquivalentWeight: peso equivalente (g/eq = peso molecular ÷
 *     valencia) usado SOLO para calcular los ticks/etiquetas del eje
 *     mg/L de esa columna — nunca para ubicar puntos, así que no
 *     distorsiona ningún dato.
 *
 * Para las 2 columnas COMBINADAS (Na+K, HCO3+CO3) no existe un peso
 * equivalente único real — Na (22.99 g/eq) y K (39.10 g/eq), o HCO3
 * (61.02 g/eq) y CO3 (30.00 g/eq — la mitad del peso molecular por su
 * valencia 2), pesan distinto. Se usa el peso equivalente del PRIMER ion
 * de cada par (Na, HCO3) como valor nominal/representativo — una
 * aproximación deliberada y documentada: los PUNTOS de esas columnas
 * siempre quedan en su posición exacta (meq/L real, suma de ambos
 * iones), esta aproximación solo redondea los NÚMEROS que se leen en el
 * eje mg/L de esas 2 columnas.
 */

import type { WaterSample, IonMeqL } from './hydroTypes';
import { ION_DATA } from './hydroCalculations';

export interface SchoellerColumn {
  key: string;
  /** Título mostrado en negrita arriba de la columna, con subíndices reales. */
  title: string;
  meqLOf: (m: IonMeqL) => number;
  isAvailable: (s: WaterSample) => boolean;
  nominalEquivalentWeight: number;
}

function eqWeight(ion: keyof typeof ION_DATA): number {
  return ION_DATA[ion].molarWeight / ION_DATA[ion].valence;
}

const ALWAYS_AVAILABLE = () => true;

export const SCHOELLER_COLUMNS: SchoellerColumn[] = [
  { key: 'Ca', title: 'Ca', meqLOf: (m) => m.Ca, isAvailable: ALWAYS_AVAILABLE, nominalEquivalentWeight: eqWeight('Ca') },
  { key: 'Mg', title: 'Mg', meqLOf: (m) => m.Mg, isAvailable: ALWAYS_AVAILABLE, nominalEquivalentWeight: eqWeight('Mg') },
  { key: 'NaK', title: 'Na+K', meqLOf: (m) => m.Na + m.K, isAvailable: ALWAYS_AVAILABLE, nominalEquivalentWeight: eqWeight('Na') },
  { key: 'Cl', title: 'Cl', meqLOf: (m) => m.Cl, isAvailable: ALWAYS_AVAILABLE, nominalEquivalentWeight: eqWeight('Cl') },
  { key: 'SO4', title: 'SO₄', meqLOf: (m) => m.SO4, isAvailable: ALWAYS_AVAILABLE, nominalEquivalentWeight: eqWeight('SO4') },
  { key: 'HCO3CO3', title: 'HCO₃+CO₃', meqLOf: (m) => m.HCO3 + m.CO3, isAvailable: ALWAYS_AVAILABLE, nominalEquivalentWeight: eqWeight('HCO3') },
  {
    key: 'NO3', title: 'NO₃', meqLOf: (m) => m.NO3,
    // NO3 es el único ion opcional de WaterSample — toMeqL() (interno de
    // hydroCalculations.ts) lo trata como 0 si falta (razonable para el
    // balance iónico, donde omitirlo es aceptable), pero acá eso
    // escondería la ausencia real: se valida contra `sample.NO3` crudo,
    // no contra el meq/L ya calculado.
    isAvailable: (s) => s.NO3 != null,
    nominalEquivalentWeight: eqWeight('NO3'),
  },
];
