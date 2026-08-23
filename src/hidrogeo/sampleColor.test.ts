/**
 * src/hidrogeo/sampleColor.test.ts
 * Pruebas unitarias de la clasificación por campo arbitrario (Etapa 3) —
 * getClassifiableFields()/getFieldValue()/getClassificationColors().
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PALETTE, getClassifiableFields, getClassificationColors, getFieldValue,
} from './sampleColor';
import type { WaterSample } from './hydroTypes';

const ION_ZEROS = { Ca: 0, Mg: 0, Na: 0, K: 0, Cl: 0, SO4: 0, HCO3: 0, CO3: 0, pH: 7, TDS: 0, EC: 0 };

function makeSample(overrides: Partial<WaterSample> & Pick<WaterSample, 'id' | 'name'>): WaterSample {
  return { samplingDate: '2026-01-01', ...ION_ZEROS, ...overrides };
}

const SAMPLES: WaterSample[] = [
  makeSample({ id: 's1', name: 'PW-01', campaign: 'Campaña I' }),
  makeSample({ id: 's2', name: 'PW-01', campaign: 'Campaña II' }),
  makeSample({ id: 's3', name: 'PW-02', campaign: 'Campaña I' }),
  makeSample({ id: 's4', name: 'PW-02', campaign: 'Campaña II' }),
];

describe('getClassifiableFields', () => {
  it('incluye "name" siempre y "campaign" si al menos una muestra la trae', () => {
    expect(getClassifiableFields(SAMPLES)).toEqual(['name', 'campaign']);
  });

  it('no incluye "campaign" si ninguna muestra la trae', () => {
    const noCampaign = SAMPLES.map(s => ({ ...s, campaign: undefined }));
    expect(getClassifiableFields(noCampaign)).toEqual(['name']);
  });

  it('nunca incluye campos numéricos continuos (pH/Eh/TDS/EC/iones) ni "id"', () => {
    const withEh = SAMPLES.map(s => ({ ...s, Eh: 150 }));
    const fields = getClassifiableFields(withEh);
    expect(fields).not.toContain('Eh');
    expect(fields).not.toContain('pH');
    expect(fields).not.toContain('TDS');
    expect(fields).not.toContain('EC');
    expect(fields).not.toContain('id');
  });
});

describe('getFieldValue', () => {
  it('"name": devuelve el pozo', () => {
    expect(getFieldValue(SAMPLES[0], 'name')).toBe('PW-01');
  });

  it('"campaign": devuelve la campaña', () => {
    expect(getFieldValue(SAMPLES[0], 'campaign')).toBe('Campaña I');
  });

  it('"campaign" sin valor: cae a name (mismo fallback que el groupOf por defecto de cada diagrama)', () => {
    const noCampaign = makeSample({ id: 's5', name: 'PW-03' });
    expect(getFieldValue(noCampaign, 'campaign')).toBe('PW-03');
  });

  it('campo desconocido: cae a name', () => {
    expect(getFieldValue(SAMPLES[0], 'algoQueNoExiste')).toBe('PW-01');
  });
});

describe('getClassificationColors', () => {
  it('clasificar por "campaign" da un color DISTINTO por cada campaña', () => {
    const colors = getClassificationColors(SAMPLES, 'campaign');
    expect(Object.keys(colors).sort()).toEqual(['Campaña I', 'Campaña II']);
    expect(colors['Campaña I']).not.toBe(colors['Campaña II']);
    expect(colors['Campaña I']).toBe(DEFAULT_PALETTE[0]);
    expect(colors['Campaña II']).toBe(DEFAULT_PALETTE[1]);
  });

  it('clasificar por "name" da un color por pozo (2 pozos → 2 colores)', () => {
    const colors = getClassificationColors(SAMPLES, 'name');
    expect(Object.keys(colors).sort()).toEqual(['PW-01', 'PW-02']);
    expect(colors['PW-01']).not.toBe(colors['PW-02']);
  });

  it('campo con un único valor entre todas las muestras: un solo color, sin romper', () => {
    const sameCampaign = SAMPLES.map(s => ({ ...s, campaign: 'Única' }));
    const colors = getClassificationColors(sameCampaign, 'campaign');
    expect(Object.keys(colors)).toEqual(['Única']);
    expect(colors['Única']).toBe(DEFAULT_PALETTE[0]);
  });

  it('lista vacía de muestras: objeto vacío, sin romper', () => {
    expect(getClassificationColors([], 'name')).toEqual({});
  });
});
