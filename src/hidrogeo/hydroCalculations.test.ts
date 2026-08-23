/**
 * src/hidrogeo/hydroCalculations.test.ts
 * Pruebas unitarias del motor de cálculo hidrogeoquímico.
 *
 * Valores esperados calculados analíticamente con:
 *   meq/L = (mg/L ÷ peso_molecular) × valencia
 *   CBE   = (Σcationes − Σaniones) / (Σcationes + Σaniones) × 100
 *
 * Umbrales de calidad (ver hydroCalculations.ts): |CBE| < 5 → 'ok',
 * 5–10 → 'warning', ≥10 → 'error'.
 */
import { describe, it, expect } from 'vitest';
import { mgLToMeqL, calculateIonBalance, calculatePercentages, ION_DATA } from './hydroCalculations';
import type { WaterSample } from './hydroTypes';

describe('mgLToMeqL — conversión unitaria', () => {
  it.each([
    ['Ca',   ION_DATA.Ca,   0.04992],
    ['Mg',   ION_DATA.Mg,   0.08229],
    ['Na',   ION_DATA.Na,   0.04350],
    ['K',    ION_DATA.K,    0.02558],
    ['Cl',   ION_DATA.Cl,   0.02821],
    ['SO4',  ION_DATA.SO4,  0.02082],
    ['HCO3', ION_DATA.HCO3, 0.01639],
  ] as const)('%s: 1 mg/L → %f meq/L', (_ion, data, expected) => {
    expect(mgLToMeqL(1, data.molarWeight, data.valence)).toBeCloseTo(expected, 4);
  });
});

// ─────────────────────────────────────────────────────────────────
// MUESTRAS DE PRUEBA
// ─────────────────────────────────────────────────────────────────

/**
 * Construida a propósito para dar CBE = 0 exacto: 2 meq/L de Ca
 * (catión) balanceados por 2 meq/L de HCO3 (anión), todo lo demás en 0.
 */
const perfectamenteBalanceada: WaterSample = {
  id: 'BAL', name: 'Muestra sintética balanceada', samplingDate: '2026-01-01',
  Ca: 40.08, Mg: 0, Na: 0, K: 0,
  HCO3: 122.04, SO4: 0, Cl: 0, CO3: 0,
  pH: 7.0, TDS: 100, EC: 150,
};

/**
 * Agua cálcica-bicarbonatada (manantial típico en acuífero carbonatado).
 * Cationes (meq/L): Ca=2.994, Mg=1.234, Na=0.870, K=0.077 → Σ=5.175
 * Aniones  (meq/L): HCO3=3.605, SO4=0.625, Cl=0.564, NO3=0.081 → Σ=4.875
 * CBE ≈ +2.99 % → 'ok'
 */
const calcicaBicarbonatada: WaterSample = {
  id: 'S1', name: 'Manantial Quebrada Honda', samplingDate: '2026-03-15',
  campaign: 'Campaña I 2026',
  Ca: 60, Mg: 15, Na: 20, K: 3,
  HCO3: 220, SO4: 30, Cl: 20, CO3: 0, NO3: 5,
  pH: 7.4, TDS: 360, EC: 520, temperature: 14.2,
};

/**
 * Agua sódico-clorurada (salmuera de cuenca endorreica). NO3 omitido
 * deliberadamente — caso límite de ion ausente.
 * Cationes (meq/L): Ca=1.996, Mg=2.468, Na=21.749, K=0.512 → Σ=26.725
 * Aniones  (meq/L): HCO3=1.639, SO4=4.164, Cl=25.388 → Σ=31.191
 * CBE ≈ −7.71 % → 'warning'
 */
const sodicaClorurada: WaterSample = {
  id: 'S2', name: 'Pozo salino Salar Norte', samplingDate: '2026-04-02',
  campaign: 'Campaña I 2026',
  Ca: 40, Mg: 30, Na: 500, K: 20,
  HCO3: 100, SO4: 200, Cl: 900, CO3: 0,
  // NO3 omitido → debe tratarse como 0, sin romper el cálculo
  pH: 7.8, TDS: 1820, EC: 2850,
};

/**
 * Balance malo (exceso fuerte de aniones).
 * CBE ≈ −18.82 % → 'error'
 */
const balanceMalo: WaterSample = {
  id: 'S3', name: 'Muestra con balance iónico deficiente', samplingDate: '2026-05-10',
  Ca: 100, Mg: 5, Na: 10, K: 1,
  HCO3: 500, SO4: 5, Cl: 10, CO3: 0,
  pH: 8.1, TDS: 640, EC: 910,
};

describe('calculateIonBalance', () => {
  it('muestra perfectamente balanceada → CBE ≈ 0%, quality "ok"', () => {
    const r = calculateIonBalance(perfectamenteBalanceada);
    expect(r.ionBalance).toBeCloseTo(0, 5);
    expect(r.quality).toBe('ok');
  });

  it('desbalance moderado (5–10%) → quality "warning"', () => {
    const r = calculateIonBalance(sodicaClorurada);
    expect(r.cationSum).toBeCloseTo(26.725, 1);
    expect(r.anionSum).toBeCloseTo(31.191, 1);
    expect(r.ionBalance).toBeCloseTo(-7.71, 1);
    expect(Math.abs(r.ionBalance)).toBeGreaterThanOrEqual(5);
    expect(Math.abs(r.ionBalance)).toBeLessThan(10);
    expect(r.quality).toBe('warning');
  });

  it('desbalance fuerte (>10%) → quality "error"', () => {
    const r = calculateIonBalance(balanceMalo);
    expect(r.ionBalance).toBeCloseTo(-18.82, 1);
    expect(Math.abs(r.ionBalance)).toBeGreaterThanOrEqual(10);
    expect(r.quality).toBe('error');
  });

  it('NO3 ausente no produce NaN en anionSum', () => {
    const r = calculateIonBalance(sodicaClorurada);
    expect(r.anionSum).not.toBeNaN();
    expect(r.ionBalance).not.toBeNaN();
  });
});

describe('calculatePercentages', () => {
  it('cálcica-bicarbonatada: cationPct y anionPct suman 100%', () => {
    const p = calculatePercentages(calcicaBicarbonatada);

    expect(p.cationPct.Ca).toBeCloseTo(57.9, 0);
    expect(p.cationPct.Mg).toBeCloseTo(23.9, 0);

    const sumCat = p.cationPct.Ca + p.cationPct.Mg + p.cationPct.Na + p.cationPct.K;
    const sumAn = p.anionPct.Cl + p.anionPct.SO4 + p.anionPct.HCO3 + p.anionPct.CO3 + p.anionPct.NO3;
    expect(sumCat).toBeCloseTo(100, 6);
    expect(sumAn).toBeCloseTo(100, 6);
  });

  it('sódico-clorurada (composición distinta): cationPct y anionPct suman 100%', () => {
    const p = calculatePercentages(sodicaClorurada);

    expect(p.cationPct.Na).toBeCloseTo(81.4, 0);
    expect(p.anionPct.Cl).toBeCloseTo(81.4, 0);

    const sumCat = p.cationPct.Ca + p.cationPct.Mg + p.cationPct.Na + p.cationPct.K;
    const sumAn = p.anionPct.Cl + p.anionPct.SO4 + p.anionPct.HCO3 + p.anionPct.CO3 + p.anionPct.NO3;
    expect(sumCat).toBeCloseTo(100, 6);
    expect(sumAn).toBeCloseTo(100, 6);
  });

  it('NO3 ausente no rompe el cálculo de porcentajes (sin NaN)', () => {
    const p = calculatePercentages(sodicaClorurada);
    expect(p.anionPct.NO3).toBe(0);
    expect(p.anionPct.Cl).not.toBeNaN();
    expect(p.totalAnionsMeqL).not.toBeNaN();
  });
});
