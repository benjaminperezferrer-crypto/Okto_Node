// @vitest-environment jsdom
/**
 * src/estructural/filterPresets.test.ts
 * localStorage real necesita DOM — el entorno default de este proyecto
 * es 'node' (ver vitest.config.ts), así que este archivo opta a jsdom
 * vía el pragma de arriba (mismo patrón que projectBridge.ts, el otro
 * archivo del proyecto que necesita DOM).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadFilterPresets, saveFilterPresets } from './filterPresets';
import type { FilterPreset } from './filterPresets';

beforeEach(() => {
  localStorage.clear();
});

describe('loadFilterPresets', () => {
  it('[] si no hay nada guardado', () => {
    expect(loadFilterPresets()).toEqual([]);
  });

  it('[] si el JSON está corrupto, sin lanzar', () => {
    localStorage.setItem('estructural.filterPresets.v1', '{not valid json');
    expect(loadFilterPresets()).toEqual([]);
  });

  it('[] si el valor guardado no es un array', () => {
    localStorage.setItem('estructural.filterPresets.v1', JSON.stringify({ foo: 'bar' }));
    expect(loadFilterPresets()).toEqual([]);
  });

  it('filtra entradas inválidas dentro del array, conservando las válidas', () => {
    const valid: FilterPreset = { id: 'p1', name: 'Preset 1', field: 'tipo', filters: { tipo: ['Falla'] } };
    localStorage.setItem('estructural.filterPresets.v1', JSON.stringify([valid, { bogus: true }, 42, null]));
    expect(loadFilterPresets()).toEqual([valid]);
  });
});

describe('saveFilterPresets + loadFilterPresets — round-trip', () => {
  it('guarda y recupera la lista completa exacta, incluyendo field=null', () => {
    const presets: FilterPreset[] = [
      { id: 'p1', name: 'Solo Fallas 2024', field: 'tipo', filters: { tipo: ['Falla'], campaña: ['2024'] } },
      { id: 'p2', name: 'Sin clasificar, todo', field: null, filters: {} },
    ];
    saveFilterPresets(presets);
    expect(loadFilterPresets()).toEqual(presets);
  });

  it('una lista vacía se guarda y se recupera como []', () => {
    saveFilterPresets([{ id: 'p1', name: 'x', field: null, filters: {} }]);
    saveFilterPresets([]);
    expect(loadFilterPresets()).toEqual([]);
  });
});
