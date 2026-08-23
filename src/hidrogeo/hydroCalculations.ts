/**
 * src/hidrogeo/hydroCalculations.ts
 * Motor de cálculo hidrogeoquímico.
 *
 * Replica la lógica de WQChartPy (Yang et al. 2022) — módulo ions.py —
 * implementada 100 % en TypeScript, sin dependencias de Python.
 *
 * Funciones públicas:
 *   mgLToMeqL          — conversión unitaria elemental
 *   calculateIonBalance — error de balance iónico (CBE)
 *   calculatePercentages — % iónicos para Piper / Stiff / Schoeller-Berkaloff
 */

import type {
  WaterSample,
  IonBalanceResult,
  IonMeqL,
  IonPercentages,
} from './hydroTypes';

// ─────────────────────────────────────────────────────────────────
// TABLA DE IONES — equivalente a ions.py de WQChartPy
// ─────────────────────────────────────────────────────────────────

/**
 * Pesos moleculares (g/mol) y valencias de los iones mayores.
 * Fuente: WQChartPy ions.py; valores de la IUPAC (2021).
 */
export const ION_DATA = {
  Ca:   { molarWeight: 40.08, valence: 2 },
  Mg:   { molarWeight: 24.31, valence: 2 },
  Na:   { molarWeight: 22.99, valence: 1 },
  K:    { molarWeight: 39.10, valence: 1 },
  Cl:   { molarWeight: 35.45, valence: 1 },
  SO4:  { molarWeight: 96.06, valence: 2 },
  HCO3: { molarWeight: 61.02, valence: 1 },
  CO3:  { molarWeight: 60.01, valence: 2 },
  NO3:  { molarWeight: 62.00, valence: 1 },
} as const;

// ─────────────────────────────────────────────────────────────────
// CONVERSIÓN UNITARIA
// ─────────────────────────────────────────────────────────────────

/**
 * Convierte una concentración de mg/L a miliequivalentes por litro (meq/L).
 *
 *   meq/L = (mg/L ÷ peso_molecular) × valencia
 *
 * @param mgL        concentración medida en mg/L
 * @param molarWeight peso molecular del ion en g/mol
 * @param valence    valencia (carga absoluta) del ion
 */
export function mgLToMeqL(
  mgL: number,
  molarWeight: number,
  valence: number,
): number {
  return (mgL / molarWeight) * valence;
}

// ─────────────────────────────────────────────────────────────────
// FUNCIÓN INTERNA — conversión completa de una muestra
// ─────────────────────────────────────────────────────────────────

function toMeqL(s: WaterSample): IonMeqL {
  return {
    Ca:   mgLToMeqL(s.Ca,          ION_DATA.Ca.molarWeight,   ION_DATA.Ca.valence),
    Mg:   mgLToMeqL(s.Mg,          ION_DATA.Mg.molarWeight,   ION_DATA.Mg.valence),
    Na:   mgLToMeqL(s.Na,          ION_DATA.Na.molarWeight,   ION_DATA.Na.valence),
    K:    mgLToMeqL(s.K,           ION_DATA.K.molarWeight,    ION_DATA.K.valence),
    Cl:   mgLToMeqL(s.Cl,          ION_DATA.Cl.molarWeight,   ION_DATA.Cl.valence),
    SO4:  mgLToMeqL(s.SO4,         ION_DATA.SO4.molarWeight,  ION_DATA.SO4.valence),
    HCO3: mgLToMeqL(s.HCO3,        ION_DATA.HCO3.molarWeight, ION_DATA.HCO3.valence),
    CO3:  mgLToMeqL(s.CO3,         ION_DATA.CO3.molarWeight,  ION_DATA.CO3.valence),
    NO3:  mgLToMeqL(s.NO3 ?? 0,    ION_DATA.NO3.molarWeight,  ION_DATA.NO3.valence),
  };
}

// ─────────────────────────────────────────────────────────────────
// BALANCE IÓNICO
// ─────────────────────────────────────────────────────────────────

/**
 * Calcula el error de balance iónico (Charge Balance Error, CBE).
 *
 *   CBE = (Σcationes − Σaniones) / (Σcationes + Σaniones) × 100
 *
 * Cationes considerados: Ca, Mg, Na, K
 * Aniones considerados:  Cl, SO4, HCO3, CO3, NO3
 *
 * Si la suma total es 0 (agua destilada), CBE = 0 y quality = 'ok'.
 */
export function calculateIonBalance(sample: WaterSample): IonBalanceResult {
  const m = toMeqL(sample);

  const cationSum = m.Ca + m.Mg + m.Na + m.K;
  const anionSum  = m.Cl + m.SO4 + m.HCO3 + m.CO3 + m.NO3;
  const total     = cationSum + anionSum;

  const ionBalance = total === 0 ? 0 : ((cationSum - anionSum) / total) * 100;
  const abs        = Math.abs(ionBalance);

  const quality: IonBalanceResult['quality'] =
    abs < 5  ? 'ok'      :
    abs < 10 ? 'warning' :
               'error';

  return { ionBalance, anionSum, cationSum, quality };
}

// ─────────────────────────────────────────────────────────────────
// PORCENTAJES IÓNICOS
// ─────────────────────────────────────────────────────────────────

/**
 * Calcula el % de cada catión respecto al total de cationes en meq/L,
 * y el % de cada anión respecto al total de aniones en meq/L.
 *
 * Este es el resultado que alimenta directamente:
 *   - Diagrama de Piper  (triángulos ternarios)
 *   - Diagrama de Stiff  (usa meqL, no %)
 *   - Schoeller-Berkaloff (usa meqL en escala log)
 *
 * Convención: si el total del grupo es 0, todos los % devuelven 0
 * para evitar NaN/Infinity.
 */
export function calculatePercentages(sample: WaterSample): IonPercentages {
  const meqL = toMeqL(sample);

  const totalCationsMeqL = meqL.Ca + meqL.Mg + meqL.Na + meqL.K;
  const totalAnionsMeqL  = meqL.Cl + meqL.SO4 + meqL.HCO3 + meqL.CO3 + meqL.NO3;

  const pct = (val: number, total: number): number =>
    total === 0 ? 0 : (val / total) * 100;

  return {
    meqL,
    cationPct: {
      Ca: pct(meqL.Ca, totalCationsMeqL),
      Mg: pct(meqL.Mg, totalCationsMeqL),
      Na: pct(meqL.Na, totalCationsMeqL),
      K:  pct(meqL.K,  totalCationsMeqL),
    },
    anionPct: {
      Cl:   pct(meqL.Cl,   totalAnionsMeqL),
      SO4:  pct(meqL.SO4,  totalAnionsMeqL),
      HCO3: pct(meqL.HCO3, totalAnionsMeqL),
      CO3:  pct(meqL.CO3,  totalAnionsMeqL),
      NO3:  pct(meqL.NO3,  totalAnionsMeqL),
    },
    totalCationsMeqL,
    totalAnionsMeqL,
  };
}
