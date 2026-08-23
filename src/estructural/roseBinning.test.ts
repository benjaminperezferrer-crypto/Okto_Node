/**
 * src/estructural/roseBinning.test.ts
 * Casos verificados A MANO antes de escribirlos (ver derivación en el
 * JSDoc de roseBinning.ts).
 */
import { describe, it, expect } from 'vitest';
import { buildRoseBins, buildGroupedRoseBins, binIndexOf, binCountFor } from './roseBinning';

describe('buildRoseBins — binning básico', () => {
  it('con binSizeDeg=10 produce 36 bins de 10° cada uno, cubriendo [0,360)', () => {
    const bins = buildRoseBins([], 10, false);
    expect(bins.length).toBe(36);
    expect(bins[0]).toEqual({ a1: 0, a2: 10, count: 0 });
    expect(bins[35]).toEqual({ a1: 350, a2: 360, count: 0 });
  });

  it('un valor cae en el bin correcto (55° → bin [50,60) con binSizeDeg=10)', () => {
    const bins = buildRoseBins([55], 10, false);
    const bin = bins.find(b => b.a1 === 50 && b.a2 === 60)!;
    expect(bin.count).toBe(1);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(1); // ningún otro bin recibió nada
  });

  it('normaliza valores fuera de [0,360) antes de binnear (ej. -10° y 370° caen en el mismo bin que 350°/10°)', () => {
    const a = buildRoseBins([-10], 10, false);
    const b = buildRoseBins([350], 10, false);
    expect(a).toEqual(b);

    const c = buildRoseBins([370], 10, false);
    const d = buildRoseBins([10], 10, false);
    expect(c).toEqual(d);
  });
});

describe('buildRoseBins — moda angular clara', () => {
  it('con la mayoría de los valores cerca de 50°, el bin [50,60) es el de mayor frecuencia', () => {
    const values = [50, 51, 52, 53, 54, 55, 56, 57, 10, 200]; // 8 dentro de [50,60), 2 dispersos
    const bins = buildRoseBins(values, 10, false);
    const maxBin = bins.reduce((best, b) => (b.count > best.count ? b : best));
    expect(maxBin.a1).toBe(50);
    expect(maxBin.a2).toBe(60);
    expect(maxBin.count).toBe(8);
  });
});

describe('buildRoseBins — simetría 180° (planos) vs sin simetría (líneas) — caso pedido explícitamente', () => {
  const planeAzimuts = [50, 51, 52, 53, 54, 55, 56, 57]; // moda clara, TODOS dentro de [50,60), ningún dato original cerca de 230°
  const binSizeDeg = 10;

  it('symmetric=true (planos): el bin opuesto (230°) recibe EXACTAMENTE el mismo conteo que el bin de la moda (50°) — verifica la simetría 180°', () => {
    const bins = buildRoseBins(planeAzimuts, binSizeDeg, true);
    const bin50 = bins.find(b => b.a1 === 50 && b.a2 === 60)!;
    const bin230 = bins.find(b => b.a1 === 230 && b.a2 === 240)!;
    expect(bin50.count).toBe(8);
    expect(bin230.count).toBe(8); // duplicado exacto por la simetría
  });

  it('symmetric=false (líneas): el bin opuesto (230°) queda en CERO — NO se duplica, a diferencia del caso de planos', () => {
    const bins = buildRoseBins(planeAzimuts, binSizeDeg, false);
    const bin50 = bins.find(b => b.a1 === 50 && b.a2 === 60)!;
    const bin230 = bins.find(b => b.a1 === 230 && b.a2 === 240)!;
    expect(bin50.count).toBe(8);
    expect(bin230.count).toBe(0); // sin simetría, no hay dato real ahí
  });

  it('symmetric=true: el total de conteos es EXACTAMENTE el doble del número de valores (cada uno cuenta 2 veces)', () => {
    const bins = buildRoseBins(planeAzimuts, binSizeDeg, true);
    const total = bins.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(planeAzimuts.length * 2);
  });
});

describe('buildGroupedRoseBins — Etapa 9 (clasificación por color en rosetas)', () => {
  it('separa el conteo de un mismo sector por grupo, con el total correcto', () => {
    const items = [
      { angle: 51, group: 'Falla' }, { angle: 52, group: 'Falla' }, { angle: 53, group: 'Falla' },
      { angle: 54, group: 'Fractura' },
    ];
    const bins = buildGroupedRoseBins(items, 10, false);
    const bin50 = bins.find((b) => b.a1 === 50 && b.a2 === 60)!;
    expect(bin50.total).toBe(4);
    expect(bin50.groups).toEqual(
      expect.arrayContaining([{ group: 'Falla', count: 3 }, { group: 'Fractura', count: 1 }]),
    );
    expect(bin50.groups.length).toBe(2);
  });

  it('symmetric=true duplica el valor Y su grupo en el sector opuesto (no lo mezcla con otro grupo)', () => {
    const items = [{ angle: 50, group: 'Falla' }];
    const bins = buildGroupedRoseBins(items, 10, true);
    const bin50 = bins.find((b) => b.a1 === 50 && b.a2 === 60)!;
    const bin230 = bins.find((b) => b.a1 === 230 && b.a2 === 240)!;
    expect(bin50.groups).toEqual([{ group: 'Falla', count: 1 }]);
    expect(bin230.groups).toEqual([{ group: 'Falla', count: 1 }]);
  });

  it('buildRoseBins() (Etapa 7) sigue dando exactamente el mismo resultado que antes del refactor — es un caso particular de buildGroupedRoseBins con 1 grupo interno', () => {
    const values = [50, 51, 52, 55, 200];
    const viaOldApi = buildRoseBins(values, 10, true);
    const viaGrouped = buildGroupedRoseBins(values.map((angle) => ({ angle, group: 'x' })), 10, true)
      .map((b) => ({ a1: b.a1, a2: b.a2, count: b.total }));
    expect(viaOldApi).toEqual(viaGrouped);
  });
});

describe('binIndexOf/binCountFor — extraídas para el resaltado cruzado (paquete de mejoras de Estructural)', () => {
  it('binCountFor coincide con nBins de buildGroupedRoseBins para varios binSizeDeg', () => {
    expect(binCountFor(10)).toBe(36);
    expect(binCountFor(15)).toBe(24);
    expect(binCountFor(30)).toBe(12);
  });

  it('binIndexOf da el mismo índice que el bin real de buildRoseBins para un valor arbitrario', () => {
    const idx = binIndexOf(55, 10);
    expect(idx).toBe(5); // [50,60) es el bin 5 (0-indexado)
    const bins = buildRoseBins([55], 10, false);
    expect(bins[idx].a1).toBe(50);
    expect(bins[idx].count).toBe(1);
  });

  it('binIndexOf normaliza ángulos fuera de [0,360) igual que el binning real', () => {
    expect(binIndexOf(-10, 10)).toBe(binIndexOf(350, 10));
    expect(binIndexOf(370, 10)).toBe(binIndexOf(10, 10));
  });

  it('binIndexOf nunca excede el último índice válido — 360° exacto se normaliza a 0° (bin 0), y el borde real (359.99°) cae en el último bin (35)', () => {
    expect(binIndexOf(360, 10)).toBe(0); // normalizeAzimuth(360) = 0
    expect(binIndexOf(0, 10)).toBe(0);
    expect(binIndexOf(359.99, 10)).toBe(35);
  });
});
