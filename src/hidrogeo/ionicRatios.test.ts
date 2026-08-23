/**
 * src/hidrogeo/ionicRatios.test.ts
 * Pruebas unitarias de axisFieldValue()/axisFieldLabel() — Etapa 7.
 */
import { describe, it, expect } from 'vitest';
import { axisFieldValue, axisFieldLabel } from './ionicRatios';
import { mgLToMeqL, ION_DATA } from './hydroCalculations';
import type { WaterSample } from './hydroTypes';

const BASE: WaterSample = {
  id: 's1', name: 'PW-01', samplingDate: '2026-01-01',
  Ca: 100, Mg: 20, Na: 300, K: 10,
  Cl: 450, SO4: 120, HCO3: 100, CO3: 0,
  pH: 7.4, TDS: 1100, EC: 1800,
};

describe('axisFieldValue — ion individual', () => {
  it('mg/L: devuelve el valor crudo', () => {
    expect(axisFieldValue(BASE, { kind: 'ion', ion: 'Na', unit: 'mg/L' })).toBe(300);
  });

  it('meq/L: convierte con peso molecular/valencia reales', () => {
    const expected = mgLToMeqL(300, ION_DATA.Na.molarWeight, ION_DATA.Na.valence);
    const got = axisFieldValue(BASE, { kind: 'ion', ion: 'Na', unit: 'meq/L' });
    expect(got).toBeCloseTo(expected, 6);
  });

  it('NO3 ausente: null, no 0 (no se inventa un valor)', () => {
    expect(axisFieldValue(BASE, { kind: 'ion', ion: 'NO3', unit: 'mg/L' })).toBeNull();
    expect(axisFieldValue(BASE, { kind: 'ion', ion: 'NO3', unit: 'meq/L' })).toBeNull();
  });

  it('NO3 presente: valor real, no null', () => {
    const withNO3 = { ...BASE, NO3: 20 };
    expect(axisFieldValue(withNO3, { kind: 'ion', ion: 'NO3', unit: 'mg/L' })).toBe(20);
  });
});

describe('axisFieldValue — relación (ratio)', () => {
  it('siempre en meq/L, sin importar que el pedido no diera unidad para ratios', () => {
    const naMeq = mgLToMeqL(300, ION_DATA.Na.molarWeight, ION_DATA.Na.valence);
    const clMeq = mgLToMeqL(450, ION_DATA.Cl.molarWeight, ION_DATA.Cl.valence);
    const expected = naMeq / clMeq;
    const got = axisFieldValue(BASE, { kind: 'ratio', numerator: 'Na', denominator: 'Cl' });
    expect(got).toBeCloseTo(expected, 6);
  });

  it('Ca/Mg calculado correctamente (segundo ejemplo del pedido)', () => {
    const caMeq = mgLToMeqL(100, ION_DATA.Ca.molarWeight, ION_DATA.Ca.valence);
    const mgMeq = mgLToMeqL(20, ION_DATA.Mg.molarWeight, ION_DATA.Mg.valence);
    const got = axisFieldValue(BASE, { kind: 'ratio', numerator: 'Ca', denominator: 'Mg' });
    expect(got).toBeCloseTo(caMeq / mgMeq, 6);
  });

  it('denominador 0: null (evita división por cero), no Infinity', () => {
    const zeroCl = { ...BASE, Cl: 0 };
    expect(axisFieldValue(zeroCl, { kind: 'ratio', numerator: 'Na', denominator: 'Cl' })).toBeNull();
  });

  it('numerador o denominador no disponible (NO3 ausente): null', () => {
    expect(axisFieldValue(BASE, { kind: 'ratio', numerator: 'NO3', denominator: 'Cl' })).toBeNull();
    expect(axisFieldValue(BASE, { kind: 'ratio', numerator: 'Na', denominator: 'NO3' })).toBeNull();
  });
});

describe('axisFieldLabel', () => {
  it('ion individual: "Na [meq/L]"', () => {
    expect(axisFieldLabel({ kind: 'ion', ion: 'Na', unit: 'meq/L' })).toBe('Na [meq/L]');
  });

  it('relación: "Ca/Mg (meq/L)"', () => {
    expect(axisFieldLabel({ kind: 'ratio', numerator: 'Ca', denominator: 'Mg' })).toBe('Ca/Mg (meq/L)');
  });

  it('usa subíndices reales para iones compuestos (SO₄, no SO4)', () => {
    expect(axisFieldLabel({ kind: 'ion', ion: 'SO4', unit: 'mg/L' })).toBe('SO₄ [mg/L]');
  });
});
