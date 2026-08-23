/**
 * src/estructural/kambDensity.test.ts
 * Casos verificados A MANO antes de escribirlos (ver derivación completa
 * en el JSDoc de kambDensity.ts).
 */
import { describe, it, expect } from 'vitest';
import { computeKambDensity, sigmaToBand, buildKambField, sampleKambFieldBilinear } from './kambDensity';
import type { KambDensityResult } from './kambDensity';
import { invertProjection } from './stereonet';

const R = 100;

describe('computeKambDensity — estadística del círculo de conteo', () => {
  it('caso mínimo verificado a mano: N=1, K=1 → p=0.5, θ=60°, E[X]=0.5, Var[X]=0.25', () => {
    // Con 1 solo polo, EXACTAMENTE en el centro del estereograma (plunge=90°,
    // cae en el nodo de grilla (0,0) si gridSize es impar) — el nodo central
    // debe contar ese único polo (dot=1 >= cosTheta) y dar sigma=(1-0.5)/0.5=1.
    const poles = [{ trend: 0, plunge: 90 }];
    const result = computeKambDensity(poles, R, 'schmidt', { K: 1, gridSize: 61 }); // impar -> hay un nodo exacto en (0,0)
    expect(result.countingCircleRadiusDeg).toBeCloseTo(60, 6);
    expect(result.expected).toBeCloseTo(0.5, 6);
    expect(result.stdDev).toBeCloseTo(0.5, 6); // sqrt(0.25)

    const center = result.points.find(pt => pt.x === 0 && pt.y === 0)!;
    expect(center).toBeDefined();
    expect(center.count).toBe(1);
    expect(center.sigma).toBeCloseTo(1, 6); // (1-0.5)/0.5
  });

  it('fórmulas E[X]/Var[X] coinciden exactamente con la derivación binomial para N,K arbitrarios', () => {
    const N = 47, K = 3;
    const poles = Array.from({ length: N }, (_, i) => ({ trend: (i * 360) / N, plunge: 10 })); // dispersos, valor de sigma no importa acá
    const result = computeKambDensity(poles, R, 'wulff', { K, gridSize: 20 });
    const p = (K * K) / (N + K * K);
    expect(result.expected).toBeCloseTo(N * p, 9);
    expect(result.stdDev).toBeCloseTo(Math.sqrt(N * p * (1 - p)), 9);
  });

  it('con 0 polos no revienta: grilla vacía, expected/stdDev en 0', () => {
    const result = computeKambDensity([], R, 'schmidt');
    expect(result.points.length).toBe(0);
    expect(result.expected).toBe(0);
    expect(result.stdDev).toBe(0);
  });
});

describe('computeKambDensity — verificación con clúster sintético (caso pedido explícitamente)', () => {
  // 150 polos concentrados artificialmente cerca de trend=60°/plunge=40°
  // (jitter ±2°), + 20 dispersos CLARAMENTE separados del clúster
  // (trend 180°-350°, lejos de 60°) para que no haya solapamiento
  // accidental con el círculo de conteo. N=150 (no un puñado de puntos)
  // porque con K=3 el círculo de conteo escala con N — ver la derivación
  // en el JSDoc del archivo: p=K²/(N+K²) es GRANDE (círculo de conteo
  // ancho) cuando N es chico, lo que difumina la resolución espacial del
  // método. Esto se descubrió empíricamente al escribir este test (con
  // N=35 el círculo de conteo daba θ≈37°, demasiado ancho para
  // discriminar un clúster de radio ~3° del resto del estereograma) — no
  // es un defecto del cálculo, es una propiedad real del método de Kamb
  // con pocos datos, y confirma por qué el método se usa típicamente con
  // decenas/cientos de mediciones, no un puñado.
  const clusterCenter = { trend: 60, plunge: 40 };
  const clusterPoles = Array.from({ length: 150 }, (_, i) => ({
    trend: clusterCenter.trend + ((i % 5) - 2), // ±2°
    plunge: clusterCenter.plunge + ((Math.floor(i / 5) % 5) - 2), // ±2°
  }));
  const scatterPoles = Array.from({ length: 20 }, (_, i) => ({
    trend: 180 + (i * 170) / 20, // 180°-350°, lejos del clúster (60°)
    plunge: 10 + (i % 4) * 15,
  }));
  const poles = [...clusterPoles, ...scatterPoles];

  function toVec(t: { trend: number; plunge: number }): [number, number, number] {
    const tr = (t.trend * Math.PI) / 180, pl = (t.plunge * Math.PI) / 180;
    return [Math.cos(pl) * Math.sin(tr), Math.cos(pl) * Math.cos(tr), Math.sin(pl)];
  }
  function angularDistDeg(a: { trend: number; plunge: number }, b: { trend: number; plunge: number }): number {
    const [ax, ay, az] = toVec(a), [bx, by, bz] = toVec(b);
    const dot = ax * bx + ay * by + az * bz;
    return Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
  }

  it('el centroide de los nodos de sigma máximo cae angularmente muy cerca del centro real del clúster', () => {
    for (const projection of ['schmidt', 'wulff'] as const) {
      const result = computeKambDensity(poles, R, projection, { K: 3, gridSize: 80 });
      const maxSigma = Math.max(...result.points.map((pt) => pt.sigma));

      // Se usa el CENTROIDE de todos los nodos empatados en el máximo
      // (no un solo argmax) — con una grilla discreta es común que varios
      // nodos adyacentes empaten en el pico de una meseta ancha; el
      // centroide de esa meseta es la estimación correcta del centro,
      // no el primer nodo que el reduce() encuentre por orden de barrido.
      const plateau = result.points.filter((pt) => pt.sigma > maxSigma - 0.01);
      const meanX = plateau.reduce((s, pt) => s + pt.x, 0) / plateau.length;
      const meanY = plateau.reduce((s, pt) => s + pt.y, 0) / plateau.length;
      const centroidTrendPlunge = invertProjection(meanX, meanY, R, projection);

      expect(angularDistDeg(centroidTrendPlunge, clusterCenter)).toBeLessThan(5);
      expect(maxSigma).toBeGreaterThan(2); // significativo — debe superar el umbral mínimo de Kamb (2σ)
    }
  });

  it('el fondo lejos de todo dato (clúster y dispersos) queda en sigma bajo, NO significativo', () => {
    const result = computeKambDensity(poles, R, 'schmidt', { K: 3, gridSize: 80 });
    // Zona vacía a propósito: trend 90°-150° (entre el clúster en 60° y
    // los dispersos que empiezan en 180°), cualquier plunge.
    const farAway = result.points
      .map((pt) => ({ pt, tp: invertProjection(pt.x, pt.y, R, 'schmidt') }))
      .filter(({ tp }) => tp.trend > 90 && tp.trend < 150);
    expect(farAway.length).toBeGreaterThan(0);
    for (const { pt } of farAway) {
      expect(pt.sigma).toBeLessThan(2); // no cruza el umbral de significancia
    }
  });
});

describe('sigmaToBand', () => {
  it('sigma por debajo del mínimo (2σ default) da banda -1 (no se dibuja)', () => {
    expect(sigmaToBand(1.9)).toBe(-1);
    expect(sigmaToBand(-5)).toBe(-1);
  });

  it('bandas consecutivas de 2σ desde el mínimo, caso a mano', () => {
    expect(sigmaToBand(2)).toBe(0);   // [2,4)
    expect(sigmaToBand(3.9)).toBe(0);
    expect(sigmaToBand(4)).toBe(1);   // [4,6)
    expect(sigmaToBand(7.5)).toBe(2); // [6,8)
  });

  it('respeta minSigma/stepSigma custom', () => {
    expect(sigmaToBand(1, 1, 1)).toBe(0);  // [1,2)
    expect(sigmaToBand(2, 1, 1)).toBe(1);  // [2,3)
    expect(sigmaToBand(0.5, 1, 1)).toBe(-1);
  });
});

describe('buildKambField + sampleKambFieldBilinear — suavizado por interpolación (paquete de mejoras de Estructural)', () => {
  const RADIUS = 10;
  const CELL = 10; // gridSize=3 -> nodos en x,y ∈ {-10,0,10}

  /** sigma(x,y) = x+y — un campo LINEAL: la interpolación bilineal debe reproducirlo EXACTO en cualquier punto interior, no solo en los nodos (propiedad matemática de la interpolación bilineal sobre un plano). */
  function makeLinearResult(includeCorner: boolean): KambDensityResult {
    const coords = [-10, 0, 10];
    const points = [];
    for (const x of coords) {
      for (const y of coords) {
        if (!includeCorner && x === 10 && y === 10) continue; // simula un nodo fuera del disco (nunca calculado)
        points.push({ x, y, count: 0, sigma: x + y });
      }
    }
    return { points, countingCircleRadiusDeg: 0, expected: 0, stdDev: 0, cellSize: CELL };
  }

  it('buildKambField recupera gridSize=3 desde cellSize=10 y radius=10, e indexa cada punto en su nodo (i,j) correcto', () => {
    const field = buildKambField(makeLinearResult(true), RADIUS);
    expect(field.gridSize).toBe(3);
    // nodo (i=0,j=0) -> x=-10,y=-10 -> sigma=-20; nodo (i=2,j=2) -> x=10,y=10 -> sigma=20
    expect(field.sigmaGrid[0 * 3 + 0]).toBeCloseTo(-20, 9);
    expect(field.sigmaGrid[2 * 3 + 2]).toBeCloseTo(20, 9);
    expect(field.sigmaGrid[1 * 3 + 1]).toBeCloseTo(0, 9); // (0,0) -> sigma=0
  });

  it('interpola EXACTO un campo lineal en un punto intermedio (no un nodo de grilla) — verificado a mano: sigma(5,5)=10', () => {
    const field = buildKambField(makeLinearResult(true), RADIUS);
    expect(sampleKambFieldBilinear(field, 5, 5)).toBeCloseTo(10, 9); // x+y=5+5=10
    expect(sampleKambFieldBilinear(field, -3, 7)).toBeCloseTo(4, 9); // x+y=-3+7=4
  });

  it('devuelve null si CUALQUIERA de los 4 nodos vecinos está fuera del disco (NaN) — no extrapola', () => {
    const field = buildKambField(makeLinearResult(false), RADIUS); // sin el nodo (10,10)
    // (8,8) tiene como vecino superior-derecho justo el nodo (10,10) faltante.
    expect(sampleKambFieldBilinear(field, 8, 8)).toBeNull();
    // (-5,-5) NO toca el nodo faltante (sus 4 vecinos son (-10,-10),(0,-10),(-10,0),(0,0)) — sigue interpolando normal.
    expect(sampleKambFieldBilinear(field, -5, -5)).toBeCloseTo(-10, 9);
  });

  it('devuelve null fuera del rango de la grilla (fi/fj fuera de [0, gridSize-1])', () => {
    const field = buildKambField(makeLinearResult(true), RADIUS);
    expect(sampleKambFieldBilinear(field, 50, 50)).toBeNull();
    expect(sampleKambFieldBilinear(field, -50, -50)).toBeNull();
  });
});
