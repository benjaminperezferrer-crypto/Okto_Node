/**
 * src/estructural/filterFields.test.ts
 * Retrocompatibilidad de la selección explícita de campos para "Filtrar"
 * (resolveLoadedFilterFields) — ver JSDoc de esa función y de
 * ClassificationFilterPanelState.filterFields en ClassificationFilterPanel.tsx.
 *
 * Importa desde el .tsx directo (Vitest transforma TSX igual que TS) —
 * mismo criterio que el resto de los tests del módulo que tocan tipos/
 * helpers definidos junto a un componente.
 */
import { describe, it, expect } from 'vitest';
import { resolveLoadedFilterFields, MAX_FILTER_FIELDS } from './ClassificationFilterPanel';

describe('resolveLoadedFilterFields — proyecto guardado DESDE esta etapa (filterFields explícito)', () => {
  it('respeta filterFields tal cual y devuelve filters intacto', () => {
    const r = resolveLoadedFilterFields({
      filterFields: ['tipo', 'cinemática'],
      filters: { tipo: ['Falla'], cinemática: ['normal'] },
    });
    expect(r.filterFields).toEqual(['tipo', 'cinemática']);
    expect(r.filters).toEqual({ tipo: ['Falla'], cinemática: ['normal'] });
  });

  it('filterFields explícito vacío = sin ningún campo de filtro, aunque filters tuviera claves (no debería, pero es defensivo)', () => {
    const r = resolveLoadedFilterFields({ filterFields: [], filters: {} });
    expect(r.filterFields).toEqual([]);
    expect(r.filters).toEqual({});
  });

  it('topa un filterFields explícito con más de MAX a MAX_FILTER_FIELDS', () => {
    const r = resolveLoadedFilterFields({
      filterFields: ['a', 'b', 'c'],
      filters: { a: ['1'], b: ['2'], c: ['3'] },
    });
    expect(r.filterFields.length).toBe(MAX_FILTER_FIELDS);
    expect(r.filterFields).toEqual(['a', 'b']);
  });
});

describe('resolveLoadedFilterFields — proyecto VIEJO (sin filterFields): deriva de las claves de filters', () => {
  it('sin filters activos → sin campos de filtro (arranca vacío, como un proyecto nuevo)', () => {
    const r = resolveLoadedFilterFields({ filters: {} });
    expect(r.filterFields).toEqual([]);
    expect(r.filters).toEqual({});
  });

  it('1 campo con restricción activa → ese campo queda elegido', () => {
    const r = resolveLoadedFilterFields({ filters: { tipo: ['Falla'] } });
    expect(r.filterFields).toEqual(['tipo']);
    expect(r.filters).toEqual({ tipo: ['Falla'] });
  });

  it('2 campos → ambos quedan elegidos', () => {
    const r = resolveLoadedFilterFields({ filters: { tipo: ['Falla'], campaña: ['2025'] } });
    expect(r.filterFields).toEqual(['tipo', 'campaña']);
    expect(r.filters).toEqual({ tipo: ['Falla'], campaña: ['2025'] });
  });

  it('MÁS de 2 campos con restricción → se conservan solo los 2 primeros, y los sobrantes se DESCARTAN de filters (no queda restricción invisible)', () => {
    const r = resolveLoadedFilterFields({
      filters: { tipo: ['Falla'], campaña: ['2025'], cinemática: ['normal'], zona: ['Norte'] },
    });
    expect(r.filterFields).toEqual(['tipo', 'campaña']);
    // cinemática/zona NO deben sobrevivir en filters — si sobrevivieran, aplicarían una
    // restricción sin ningún <select> que la represente en la UI (la "basura invisible" a evitar).
    expect(r.filters).toEqual({ tipo: ['Falla'], campaña: ['2025'] });
    expect(r.filters.cinemática).toBeUndefined();
    expect(r.filters.zona).toBeUndefined();
  });
});
