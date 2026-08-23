/**
 * src/shared/collapsibleState.test.ts
 * Pruebas unitarias de la persistencia de secciones plegables
 * (collapsibleState.ts) — mapa único en localStorage, namespaced por id.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadSectionOpen, saveSectionOpen } from './collapsibleState';

const STORAGE_KEY = 'okto.collapsedSections.v1';

beforeEach(() => {
  localStorage.clear();
});

describe('loadSectionOpen', () => {
  it('devuelve defaultOpen si nunca se guardó nada para ese id', () => {
    expect(loadSectionOpen('hgm.foo', false)).toBe(false);
    expect(loadSectionOpen('hgm.foo', true)).toBe(true);
  });

  it('devuelve el valor guardado, ganándole a defaultOpen', () => {
    saveSectionOpen('hgm.foo', true);
    expect(loadSectionOpen('hgm.foo', false)).toBe(true);

    saveSectionOpen('hgm.foo', false);
    expect(loadSectionOpen('hgm.foo', true)).toBe(false);
  });

  it('mapa vacío/corrupto en localStorage no rompe, cae a defaultOpen', () => {
    localStorage.setItem(STORAGE_KEY, 'no es json válido {{{');
    expect(loadSectionOpen('hgm.foo', true)).toBe(true);

    localStorage.setItem(STORAGE_KEY, JSON.stringify('un string, no un objeto'));
    expect(loadSectionOpen('hgm.foo', true)).toBe(true);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(null));
    expect(loadSectionOpen('hgm.foo', true)).toBe(true);
  });

  it('ignora entradas no-booleanas dentro del mapa (defensivo ante localStorage manipulado a mano)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'hgm.foo': 'sí', 'hgm.bar': 1, 'hgm.baz': true }));
    expect(loadSectionOpen('hgm.foo', false)).toBe(false); // no boolean -> defaultOpen
    expect(loadSectionOpen('hgm.bar', false)).toBe(false); // no boolean -> defaultOpen
    expect(loadSectionOpen('hgm.baz', false)).toBe(true); // boolean real -> se respeta
  });
});

describe('saveSectionOpen — independencia entre secciones', () => {
  it('cada id mantiene su propio estado, sin pisar a los demás', () => {
    saveSectionOpen('hgm.filtro', true);
    saveSectionOpen('hgm.estilo', false);
    saveSectionOpen('gis.grilla', true);

    expect(loadSectionOpen('hgm.filtro', false)).toBe(true);
    expect(loadSectionOpen('hgm.estilo', true)).toBe(false);
    expect(loadSectionOpen('gis.grilla', false)).toBe(true);
  });

  it('guardar un id no toca el registro de otro id ya guardado', () => {
    saveSectionOpen('hgm.filtro', true);
    saveSectionOpen('hgm.estilo', true);
    saveSectionOpen('hgm.filtro', false); // cambia solo filtro

    expect(loadSectionOpen('hgm.filtro', true)).toBe(false);
    expect(loadSectionOpen('hgm.estilo', false)).toBe(true); // intacto
  });
});

describe('persistencia real entre "sesiones" (releer el mismo localStorage)', () => {
  it('un valor guardado sigue disponible en una lectura posterior independiente', () => {
    saveSectionOpen('hgm.qaqc', true);
    // Simula "recargar la página": nada en memoria, solo lo que quedó en
    // localStorage — loadSectionOpen no depende de ningún estado de módulo.
    expect(loadSectionOpen('hgm.qaqc', false)).toBe(true);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toContain('"hgm.qaqc":true');
  });
});
