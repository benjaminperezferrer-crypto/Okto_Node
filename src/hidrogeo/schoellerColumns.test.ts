/**
 * src/hidrogeo/schoellerColumns.test.ts
 * Pruebas unitarias de SCHOELLER_COLUMNS — Etapa 8.
 */
import { describe, it, expect } from 'vitest';
import { SCHOELLER_COLUMNS } from './schoellerColumns';
import { calculatePercentages, ION_DATA } from './hydroCalculations';
import type { WaterSample } from './hydroTypes';

const BASE: WaterSample = {
  id: 's1', name: 'PW-01', samplingDate: '2026-01-01',
  Ca: 100, Mg: 20, Na: 300, K: 10,
  Cl: 450, SO4: 120, HCO3: 100, CO3: 5,
  pH: 7.4, TDS: 1100, EC: 1800,
};

describe('SCHOELLER_COLUMNS — orden fijo', () => {
  it('Ca, Mg, Na+K, Cl, SO4, HCO3+CO3, NO3, en ese orden exacto', () => {
    expect(SCHOELLER_COLUMNS.map((c) => c.key)).toEqual(['Ca', 'Mg', 'NaK', 'Cl', 'SO4', 'HCO3CO3', 'NO3']);
    expect(SCHOELLER_COLUMNS.map((c) => c.title)).toEqual(['Ca', 'Mg', 'Na+K', 'Cl', 'SO₄', 'HCO₃+CO₃', 'NO₃']);
  });
});

describe('SCHOELLER_COLUMNS — meqLOf', () => {
  const { meqL } = calculatePercentages(BASE);

  it('columnas simples: devuelven el meq/L real de ese ion', () => {
    const ca = SCHOELLER_COLUMNS.find((c) => c.key === 'Ca')!;
    expect(ca.meqLOf(meqL)).toBeCloseTo(meqL.Ca, 9);
  });

  it('Na+K: suma de Na y K en meq/L', () => {
    const naK = SCHOELLER_COLUMNS.find((c) => c.key === 'NaK')!;
    expect(naK.meqLOf(meqL)).toBeCloseTo(meqL.Na + meqL.K, 9);
  });

  it('HCO3+CO3: suma de HCO3 y CO3 en meq/L', () => {
    const hco3co3 = SCHOELLER_COLUMNS.find((c) => c.key === 'HCO3CO3')!;
    expect(hco3co3.meqLOf(meqL)).toBeCloseTo(meqL.HCO3 + meqL.CO3, 9);
  });
});

describe('SCHOELLER_COLUMNS — isAvailable', () => {
  it('las 6 columnas de campos requeridos siempre están disponibles', () => {
    const required = SCHOELLER_COLUMNS.filter((c) => c.key !== 'NO3');
    for (const col of required) {
      expect(col.isAvailable(BASE)).toBe(true);
      expect(col.isAvailable({ ...BASE, NO3: undefined })).toBe(true);
    }
  });

  it('NO3: disponible solo si la muestra lo trae', () => {
    const no3 = SCHOELLER_COLUMNS.find((c) => c.key === 'NO3')!;
    expect(no3.isAvailable(BASE)).toBe(false);
    expect(no3.isAvailable({ ...BASE, NO3: 12 })).toBe(true);
  });
});

describe('SCHOELLER_COLUMNS — nominalEquivalentWeight', () => {
  it('columnas simples: molarWeight/valence del ion real', () => {
    const cl = SCHOELLER_COLUMNS.find((c) => c.key === 'Cl')!;
    expect(cl.nominalEquivalentWeight).toBeCloseTo(ION_DATA.Cl.molarWeight / ION_DATA.Cl.valence, 9);
  });

  it('Na+K usa el peso equivalente de Na (nominal, documentado)', () => {
    const naK = SCHOELLER_COLUMNS.find((c) => c.key === 'NaK')!;
    expect(naK.nominalEquivalentWeight).toBeCloseTo(ION_DATA.Na.molarWeight / ION_DATA.Na.valence, 9);
  });

  it('HCO3+CO3 usa el peso equivalente de HCO3 (nominal, documentado)', () => {
    const hco3co3 = SCHOELLER_COLUMNS.find((c) => c.key === 'HCO3CO3')!;
    expect(hco3co3.nominalEquivalentWeight).toBeCloseTo(ION_DATA.HCO3.molarWeight / ION_DATA.HCO3.valence, 9);
  });
});
