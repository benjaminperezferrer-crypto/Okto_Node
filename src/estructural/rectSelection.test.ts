/**
 * src/estructural/rectSelection.test.ts
 * Casos verificados a mano — ver JSDoc de rectSelection.ts.
 */
import { describe, it, expect } from 'vitest';
import { normalizeRect, pointInRect, hitTestRect } from './rectSelection';

describe('normalizeRect', () => {
  it('ordena x1≤x2, y1≤y2 sin importar el orden de arrastre (4 combinaciones de esquina)', () => {
    const expected = { x1: 10, x2: 50, y1: 20, y2: 80 };
    expect(normalizeRect({ x: 10, y: 20 }, { x: 50, y: 80 })).toEqual(expected); // arriba-izq -> abajo-der
    expect(normalizeRect({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual(expected); // abajo-der -> arriba-izq
    expect(normalizeRect({ x: 10, y: 80 }, { x: 50, y: 20 })).toEqual(expected); // abajo-izq -> arriba-der
    expect(normalizeRect({ x: 50, y: 20 }, { x: 10, y: 80 })).toEqual(expected); // arriba-der -> abajo-izq
  });
});

describe('pointInRect', () => {
  const rect = { x1: 0, y1: 0, x2: 100, y2: 100 };
  it('true para un punto interior', () => {
    expect(pointInRect({ x: 50, y: 50 }, rect)).toBe(true);
  });
  it('true en los bordes (inclusive)', () => {
    expect(pointInRect({ x: 0, y: 0 }, rect)).toBe(true);
    expect(pointInRect({ x: 100, y: 100 }, rect)).toBe(true);
  });
  it('false fuera del rectángulo', () => {
    expect(pointInRect({ x: -1, y: 50 }, rect)).toBe(false);
    expect(pointInRect({ x: 50, y: 101 }, rect)).toBe(false);
  });
});

describe('hitTestRect', () => {
  it('devuelve solo los ids cuyo positionOf cae dentro del rectángulo', () => {
    const items = [
      { id: 'a', x: 10, y: 10 },
      { id: 'b', x: 200, y: 10 },
      { id: 'c', x: 50, y: 50 },
    ];
    const rect = { x1: 0, y1: 0, x2: 100, y2: 100 };
    const ids = hitTestRect(items, (i) => ({ x: i.x, y: i.y }), rect);
    expect(ids).toEqual(['a', 'c']);
  });

  it('lista vacía de items da resultado vacío, sin lanzar', () => {
    expect(hitTestRect([], () => ({ x: 0, y: 0 }), { x1: 0, y1: 0, x2: 10, y2: 10 })).toEqual([]);
  });

  it('rectángulo que no contiene a nadie da resultado vacío', () => {
    const items = [{ id: 'a', x: 10, y: 10 }];
    expect(hitTestRect(items, (i) => ({ x: i.x, y: i.y }), { x1: 1000, y1: 1000, x2: 2000, y2: 2000 })).toEqual([]);
  });
});
