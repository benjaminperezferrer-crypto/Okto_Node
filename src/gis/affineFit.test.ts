/**
 * src/gis/affineFit.test.ts
 * Verificación numérica de affineFit.ts: se construyen transformaciones
 * CONOCIDAS de antemano (elegidas a mano, no ajustadas), se generan
 * puntos de control EXACTOS aplicando esa transformación, y se confirma
 * que el código recupera esos mismos parámetros — sin depender de una
 * librería externa de referencia (la "verdad" es la transformación que
 * yo mismo elegí y usé para generar los datos, así que la comparación es
 * exacta por construcción, no aproximada contra una fuente externa).
 */
import { describe, it, expect } from 'vitest';
import {
  computeSimilarityTransform,
  computeAffineTransform,
  fitControlPoints,
  applyAffineTransform,
  type ControlPoint,
  type AffineTransform,
} from './affineFit';

describe('computeSimilarityTransform — 2 puntos, escala+rotación+traslación conocidas', () => {
  // Transformación conocida: escala=2, rotación=30°, traslación=(1000,2000).
  const scale = 2;
  const rotationDeg = 30;
  const rad = (rotationDeg * Math.PI) / 180;
  const knownA = scale * Math.cos(rad); // ≈ 1.7320508
  const knownB = scale * Math.sin(rad); // = 1
  const tx = 1000;
  const ty = 2000;

  function applyKnown(x: number, y: number): [number, number] {
    return [knownA * x - knownB * y + tx, knownB * x + knownA * y + ty];
  }

  it('recupera exactamente los parámetros de la transformación usada para generar los puntos', () => {
    const [e1, n1] = applyKnown(0, 0);
    const [e2, n2] = applyKnown(10, 5);
    const points: [ControlPoint, ControlPoint] = [
      { imageX: 0, imageY: 0, worldEast: e1, worldNorth: n1 },
      { imageX: 10, imageY: 5, worldEast: e2, worldNorth: n2 },
    ];

    const result = computeSimilarityTransform(points);

    expect(result.transform.a).toBeCloseTo(knownA, 9);
    expect(result.transform.d).toBeCloseTo(knownA, 9); // misma escala en ambos ejes — sin cizalla
    expect(result.transform.c).toBeCloseTo(knownB, 9);
    expect(result.transform.b).toBeCloseTo(-knownB, 9);
    expect(result.transform.e).toBeCloseTo(tx, 9);
    expect(result.transform.f).toBeCloseTo(ty, 9);
    expect(result.residualRMS).toBeCloseTo(0, 9); // 2 puntos → ajuste exacto
  });

  it('la transformación recuperada predice correctamente un TERCER punto no usado para el ajuste', () => {
    const points: [ControlPoint, ControlPoint] = [
      { imageX: 0, imageY: 0, worldEast: applyKnown(0, 0)[0], worldNorth: applyKnown(0, 0)[1] },
      { imageX: 10, imageY: 5, worldEast: applyKnown(10, 5)[0], worldNorth: applyKnown(10, 5)[1] },
    ];
    const { transform } = computeSimilarityTransform(points);

    const [expectedE, expectedN] = applyKnown(-7, 20);
    const [predE, predN] = applyAffineTransform(transform, -7, 20);
    expect(predE).toBeCloseTo(expectedE, 9);
    expect(predN).toBeCloseTo(expectedN, 9);
  });

  it('rechaza si los dos puntos de imagen coinciden', () => {
    const points: [ControlPoint, ControlPoint] = [
      { imageX: 5, imageY: 5, worldEast: 100, worldNorth: 200 },
      { imageX: 5, imageY: 5, worldEast: 300, worldNorth: 400 },
    ];
    expect(() => computeSimilarityTransform(points)).toThrow(/misma posición de imagen/);
  });
});

describe('computeAffineTransform — 3+ puntos, transformación CON cizalla', () => {
  // Transformación conocida con cizalla real: [[1.5,0.3],[-0.2,1.8]] no es
  // una matriz de rotación+escala (columnas no ortogonales) — a propósito,
  // para probar lo que una transformación de similitud NO podría capturar.
  const known: AffineTransform = { a: 1.5, b: 0.3, c: -0.2, d: 1.8, e: 500, f: 1000 };

  function applyKnown(x: number, y: number): ControlPoint {
    const [worldEast, worldNorth] = applyAffineTransform(known, x, y);
    return { imageX: x, imageY: y, worldEast, worldNorth };
  }

  it('con exactamente 3 puntos, recupera la transformación exacta y el residuo es ≈0', () => {
    const points = [applyKnown(0, 0), applyKnown(10, 0), applyKnown(0, 10)];
    const result = computeAffineTransform(points);

    expect(result.transform.a).toBeCloseTo(known.a, 9);
    expect(result.transform.b).toBeCloseTo(known.b, 9);
    expect(result.transform.c).toBeCloseTo(known.c, 9);
    expect(result.transform.d).toBeCloseTo(known.d, 9);
    expect(result.transform.e).toBeCloseTo(known.e, 9);
    expect(result.transform.f).toBeCloseTo(known.f, 9);
    expect(result.residualRMS).toBeCloseTo(0, 6); // exactamente determinado (6 incógnitas, 6 ecuaciones)
  });

  it('con 4+ puntos SIN ruido (sobre-determinado), sigue recuperando la transformación exacta', () => {
    const points = [applyKnown(0, 0), applyKnown(10, 0), applyKnown(0, 10), applyKnown(10, 10), applyKnown(4, 7)];
    const result = computeAffineTransform(points);

    expect(result.transform.a).toBeCloseTo(known.a, 8);
    expect(result.transform.b).toBeCloseTo(known.b, 8);
    expect(result.transform.c).toBeCloseTo(known.c, 8);
    expect(result.transform.d).toBeCloseTo(known.d, 8);
    expect(result.transform.e).toBeCloseTo(known.e, 6);
    expect(result.transform.f).toBeCloseTo(known.f, 6);
    expect(result.residualRMS).toBeCloseTo(0, 6);
  });

  it('con un punto perturbado, el residuo detecta el error y el ajuste se acerca al resto de los puntos consistentes', () => {
    const consistent = [applyKnown(0, 0), applyKnown(10, 0), applyKnown(0, 10), applyKnown(10, 10)];
    // Un 5º punto con un error real de +50 en este/norte respecto de lo que
    // predice la transformación conocida — simula un clic impreciso del usuario.
    const perturbed: ControlPoint = { ...applyKnown(5, 5), worldEast: applyKnown(5, 5).worldEast + 50 };
    const points = [...consistent, perturbed];

    const result = computeAffineTransform(points);

    // El residuo del punto perturbado debe ser sustancialmente mayor que
    // el de los puntos consistentes (que deberían quedar cerca de 0,
    // aunque no exactamente, porque el punto perturbado "tira" del ajuste).
    const perturbedResidual = result.residuals[4];
    const maxConsistentResidual = Math.max(...result.residuals.slice(0, 4));
    expect(perturbedResidual).toBeGreaterThan(maxConsistentResidual);
    expect(result.residualRMS).toBeGreaterThan(0.1); // ya no es un ajuste exacto
    // El ajuste sigue razonablemente cerca de la transformación real —
    // un solo punto perturbado entre 5 no debería desviarlo demasiado.
    expect(result.transform.a).toBeCloseTo(known.a, 0);
    expect(result.transform.d).toBeCloseTo(known.d, 0);
  });

  it('rechaza con menos de 3 puntos', () => {
    expect(() => computeAffineTransform([applyKnown(0, 0), applyKnown(10, 0)])).toThrow(/al menos 3 puntos/);
  });

  it('rechaza puntos colineales (sistema singular)', () => {
    const collinear = [
      { imageX: 0, imageY: 0, worldEast: 0, worldNorth: 0 },
      { imageX: 10, imageY: 10, worldEast: 10, worldNorth: 10 },
      { imageX: 20, imageY: 20, worldEast: 20, worldNorth: 20 },
    ];
    expect(() => computeAffineTransform(collinear)).toThrow(/colineales/);
  });
});

describe('fitControlPoints — despacho según cantidad de puntos', () => {
  it('usa similitud (sin cizalla) con exactamente 2 puntos', () => {
    const points: ControlPoint[] = [
      { imageX: 0, imageY: 0, worldEast: 1000, worldNorth: 2000 },
      { imageX: 10, imageY: 0, worldEast: 1020, worldNorth: 2000 },
    ];
    const result = fitControlPoints(points);
    // Similitud: columnas (a,c) y (b,d) ortogonales y de igual norma.
    const { a, b, c, d } = result.transform;
    expect(a * b + c * d).toBeCloseTo(0, 9);
    expect(Math.hypot(a, c)).toBeCloseTo(Math.hypot(b, d), 9);
  });

  it('usa afín completa con 3+ puntos', () => {
    const known: AffineTransform = { a: 1.5, b: 0.3, c: -0.2, d: 1.8, e: 500, f: 1000 };
    // No colineales a propósito (a diferencia de un progresión x=i*10,y=i*3,
    // que caería en la misma línea y dispararía el chequeo de sistema singular).
    const imagePoints: [number, number][] = [[0, 0], [10, 0], [0, 10]];
    const pts = imagePoints.map(([x, y]) => {
      const [worldEast, worldNorth] = applyAffineTransform(known, x, y);
      return { imageX: x, imageY: y, worldEast, worldNorth };
    });
    const result = fitControlPoints(pts);
    expect(result.transform.b).toBeCloseTo(known.b, 6); // cizalla presente — solo posible en el modelo afín completo
  });
});
