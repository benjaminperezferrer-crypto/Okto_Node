/**
 * src/estructural/symbolAssignment.test.ts
 * Casos verificados a mano — ver JSDoc de symbolAssignment.ts.
 */
import { describe, it, expect } from 'vitest';
import { getClassificationShapes, shapePolygonPoints, SHAPE_KINDS } from './symbolAssignment';

describe('getClassificationShapes — asignación en orden de inserción de `colors`', () => {
  it('asigna SHAPE_KINDS[0..n) en el mismo orden que las claves de colors, sin dashed mientras alcancen las formas', () => {
    const colors = { Falla: '#2563eb', Diaclasa: '#dc2626', Veta: '#16a34a' };
    const shapes = getClassificationShapes(colors);
    expect(shapes.Falla).toEqual({ shape: SHAPE_KINDS[0], dashed: false });
    expect(shapes.Diaclasa).toEqual({ shape: SHAPE_KINDS[1], dashed: false });
    expect(shapes.Veta).toEqual({ shape: SHAPE_KINDS[2], dashed: false });
  });

  it('objeto vacío da un mapa vacío, sin lanzar', () => {
    expect(getClassificationShapes({})).toEqual({});
  });

  it('recicla formas desde el principio cuando hay más valores que SHAPE_KINDS.length, marcando dashed=true desde el índice SHAPE_KINDS.length', () => {
    // 8 valores > 6 formas -> los índices 6 y 7 reciclan shape[0] y shape[1], con dashed=true.
    const colors: Record<string, string> = {};
    const labels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    labels.forEach((l, i) => { colors[l] = `#${i}`; });
    const shapes = getClassificationShapes(colors);
    expect(SHAPE_KINDS.length).toBe(6);
    for (let i = 0; i < 6; i++) {
      expect(shapes[labels[i]]).toEqual({ shape: SHAPE_KINDS[i], dashed: false });
    }
    expect(shapes.g).toEqual({ shape: SHAPE_KINDS[0], dashed: true }); // índice 6 -> recicla shape[0], dashed
    expect(shapes.h).toEqual({ shape: SHAPE_KINDS[1], dashed: true }); // índice 7 -> recicla shape[1], dashed
  });
});

describe('shapePolygonPoints — geometría', () => {
  it('circle devuelve null (se renderiza con <circle>, no <polygon>)', () => {
    expect(shapePolygonPoints('circle', 100, 100, 5)).toBeNull();
  });

  it('cada forma no-circular devuelve una cadena "points" no vacía, con la cantidad de vértices esperada', () => {
    const cx = 50, cy = 50, size = 4;
    expect(shapePolygonPoints('square', cx, cy, size)!.split(' ').length).toBe(4);
    expect(shapePolygonPoints('triangle', cx, cy, size)!.split(' ').length).toBe(3);
    expect(shapePolygonPoints('diamond', cx, cy, size)!.split(' ').length).toBe(4);
    expect(shapePolygonPoints('hexagon', cx, cy, size)!.split(' ').length).toBe(6);
    expect(shapePolygonPoints('cross', cx, cy, size)!.split(' ').length).toBe(12);
  });

  it('diamond verificado a mano: 4 vértices en N/E/S/W exactos alrededor de (cx,cy) a distancia size*1.3', () => {
    const cx = 100, cy = 100, size = 10;
    const pts = shapePolygonPoints('diamond', cx, cy, size)!.split(' ').map((p) => p.split(',').map(Number));
    const r = size * 1.3;
    // ángulo 0 = arriba (Norte): (cx, cy-r); luego E: (cx+r, cy); S: (cx, cy+r); W: (cx-r, cy).
    expect(pts[0][0]).toBeCloseTo(cx, 1); expect(pts[0][1]).toBeCloseTo(cy - r, 1);
    expect(pts[1][0]).toBeCloseTo(cx + r, 1); expect(pts[1][1]).toBeCloseTo(cy, 1);
    expect(pts[2][0]).toBeCloseTo(cx, 1); expect(pts[2][1]).toBeCloseTo(cy + r, 1);
    expect(pts[3][0]).toBeCloseTo(cx - r, 1); expect(pts[3][1]).toBeCloseTo(cy, 1);
  });

  it('square (45° de rotación respecto a diamond) verificado a mano: primer vértice en NE', () => {
    const cx = 0, cy = 0, size = 10;
    const r = size * 1.15;
    const pts = shapePolygonPoints('square', cx, cy, size)!.split(' ').map((p) => p.split(',').map(Number));
    // rotación 45°: primer vértice en ángulo 45° desde el Norte -> (r·sin45, -r·cos45) = (r/√2, -r/√2)
    const expected = r / Math.SQRT2;
    expect(pts[0][0]).toBeCloseTo(expected, 1);
    expect(pts[0][1]).toBeCloseTo(-expected, 1);
  });
});
