/**
 * src/gis/minimumCurvature.test.ts
 * Verificación numérica de computeMinimumCurvatureTrace() (Etapa 10) con
 * el mismo rigor que affineFit.test.ts: casos triviales calculados a mano,
 * y un caso de desviación real cambiante verificado contra una
 * implementación INDEPENDIENTE (integración numérica por sub-pasos con
 * slerp entre las direcciones de estación, ver más abajo) — no solo contra
 * el propio código bajo prueba.
 *
 * Por qué la integración por slerp es una verificación independiente
 * válida: la curvatura mínima define el tramo entre dos estaciones como el
 * arco de curvatura constante que rota la dirección de la estación 1 a la
 * de la estación 2 a tasa angular constante respecto de la profundidad —
 * eso ES, por definición, slerp (spherical linear interpolation) del
 * vector unitario entre ambas direcciones. Integrar esa trayectoria en
 * miles de sub-pasos pequeños (regla del punto medio) converge al mismo
 * resultado que la fórmula cerrada de Ratio Factor, pero por un camino de
 * cálculo completamente distinto (suma numérica vs. fórmula trigonométrica
 * cerrada) — si ambos coinciden, ninguno de los dos tiene un error de
 * signo o de sustitución que el otro comparta por casualidad.
 */
import { describe, it, expect } from 'vitest';
import { computeMinimumCurvatureTrace, type Point3D, type SurveyStation } from './minimumCurvature';

const DEG_TO_RAD = Math.PI / 180;

function unitVector(azimuthDeg: number, dipDeg: number): Point3D {
  const az = azimuthDeg * DEG_TO_RAD;
  const dip = dipDeg * DEG_TO_RAD;
  const cosDip = Math.cos(dip);
  return { east: cosDip * Math.sin(az), north: cosDip * Math.cos(az), elevation: Math.sin(dip) };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Interpolación esférica entre dos vectores unitarios — ver nota de archivo. */
function slerp(u1: Point3D, u2: Point3D, t: number): Point3D {
  const dot = clamp(u1.east * u2.east + u1.north * u2.north + u1.elevation * u2.elevation, -1, 1);
  const beta = Math.acos(dot);
  if (beta < 1e-9) return u1;
  const sinBeta = Math.sin(beta);
  const w1 = Math.sin((1 - t) * beta) / sinBeta;
  const w2 = Math.sin(t * beta) / sinBeta;
  return {
    east: w1 * u1.east + w2 * u2.east,
    north: w1 * u1.north + w2 * u2.north,
    elevation: w1 * u1.elevation + w2 * u2.elevation,
  };
}

/** Integra el tramo por sub-pasos (regla del punto medio) — implementación de referencia, independiente de applyMinimumCurvatureSegment(). */
function numericIntegrateSegment(from: Point3D, u1: Point3D, u2: Point3D, courseLength: number, steps: number): Point3D {
  let pos = { ...from };
  const stepLen = courseLength / steps;
  for (let i = 0; i < steps; i++) {
    const tMid = (i + 0.5) / steps;
    const dir = slerp(u1, u2, tMid);
    pos = {
      east: pos.east + dir.east * stepLen,
      north: pos.north + dir.north * stepLen,
      elevation: pos.elevation + dir.elevation * stepLen,
    };
  }
  return pos;
}

function numericIntegrateTrace(collar: Point3D, stations: SurveyStation[], steps: number): Point3D[] {
  const sorted = [...stations].sort((a, b) => a.depth - b.depth);
  const effective = sorted[0].depth > 0
    ? [{ depth: 0, azimuthDeg: sorted[0].azimuthDeg, dipDeg: sorted[0].dipDeg }, ...sorted]
    : sorted;
  const points: Point3D[] = [collar];
  let current = collar;
  for (let i = 1; i < effective.length; i++) {
    const prev = effective[i - 1];
    const curr = effective[i];
    current = numericIntegrateSegment(
      current,
      unitVector(prev.azimuthDeg, prev.dipDeg),
      unitVector(curr.azimuthDeg, curr.dipDeg),
      curr.depth - prev.depth,
      steps,
    );
    points.push(current);
  }
  return points;
}

const COLLAR: Point3D = { east: 500000, north: 7500000, elevation: 1000 };

describe('computeMinimumCurvatureTrace — casos triviales', () => {
  it('sin estaciones, devuelve solo el collar', () => {
    expect(computeMinimumCurvatureTrace(COLLAR, [])).toEqual([COLLAR]);
  });

  it('sondaje vertical simple (dip=-90 constante): línea recta hacia abajo, azimut irrelevante', () => {
    const stations: SurveyStation[] = [
      { depth: 0, azimuthDeg: 0, dipDeg: -90 },
      { depth: 50, azimuthDeg: 123, dipDeg: -90 }, // azimut distinto a propósito — no debe importar en vertical exacto
      { depth: 120, azimuthDeg: 279, dipDeg: -90 },
    ];
    const trace = computeMinimumCurvatureTrace(COLLAR, stations);

    expect(trace).toHaveLength(3);
    // Este/Norte sin cambio, Cota = elevación del collar menos la profundidad exacta (caso trivial de línea recta).
    for (const [i, station] of stations.entries()) {
      expect(trace[i].east).toBeCloseTo(COLLAR.east, 9);
      expect(trace[i].north).toBeCloseTo(COLLAR.north, 9);
      expect(trace[i].elevation).toBeCloseTo(COLLAR.elevation - station.depth, 9);
    }
  });

  it('sondaje horizontal simple (dip=0 constante): se desplaza en línea recta en la dirección del azimut, sin cambio de cota', () => {
    const stations: SurveyStation[] = [
      { depth: 0, azimuthDeg: 90, dipDeg: 0 }, // azimut 90° = Este puro
      { depth: 200, azimuthDeg: 90, dipDeg: 0 },
    ];
    const trace = computeMinimumCurvatureTrace(COLLAR, stations);

    expect(trace).toHaveLength(2);
    expect(trace[1].east).toBeCloseTo(COLLAR.east + 200, 9);
    expect(trace[1].north).toBeCloseTo(COLLAR.north, 9);
    expect(trace[1].elevation).toBeCloseTo(COLLAR.elevation, 9);
  });

  it('primera estación a profundidad > 0: usa su misma orientación desde el collar (línea recta hasta ahí)', () => {
    // az=10°,dip=-80° constante en ambas estaciones → todo el sondaje es UNA sola línea recta,
    // verificable con la fórmula trivial "collar + profundidad_total * vector_unitario".
    const az = 10, dip = -80;
    const stations: SurveyStation[] = [
      { depth: 30, azimuthDeg: az, dipDeg: dip },
      { depth: 80, azimuthDeg: az, dipDeg: dip },
    ];
    const trace = computeMinimumCurvatureTrace(COLLAR, stations);

    expect(trace).toHaveLength(3); // collar + 2 estaciones reales (se insertó una estación virtual en profundidad 0, no una extra visible)

    const rad = (d: number) => d * DEG_TO_RAD;
    const dir = { east: Math.cos(rad(dip)) * Math.sin(rad(az)), north: Math.cos(rad(dip)) * Math.cos(rad(az)), elevation: Math.sin(rad(dip)) };
    const expectedAt = (depth: number) => ({
      east: COLLAR.east + depth * dir.east,
      north: COLLAR.north + depth * dir.north,
      elevation: COLLAR.elevation + depth * dir.elevation,
    });

    // Precisión 6 decimales (no 9): east/north parten de ~500000/7500000 — a esa
    // magnitud, 1e-9 absoluto roza el límite de un double (~1e-10 relativo), así
    // que dos derivaciones en trigonometría independientes ya no coinciden a 9
    // decimales por puro redondeo de punto flotante, no por un error real.
    const p30 = expectedAt(30);
    const p80 = expectedAt(80);
    expect(trace[1].east).toBeCloseTo(p30.east, 6);
    expect(trace[1].north).toBeCloseTo(p30.north, 6);
    expect(trace[1].elevation).toBeCloseTo(p30.elevation, 6);
    expect(trace[2].east).toBeCloseTo(p80.east, 6);
    expect(trace[2].north).toBeCloseTo(p80.north, 6);
    expect(trace[2].elevation).toBeCloseTo(p80.elevation, 6);
  });

  it('estación exactamente en profundidad 0: no duplica el punto del collar', () => {
    const stations: SurveyStation[] = [
      { depth: 0, azimuthDeg: 45, dipDeg: -45 },
      { depth: 100, azimuthDeg: 45, dipDeg: -45 },
    ];
    const trace = computeMinimumCurvatureTrace(COLLAR, stations);
    expect(trace).toHaveLength(2); // collar (== estación de profundidad 0) + estación de 100m
  });

  it('reordena estaciones desordenadas por profundidad antes de calcular', () => {
    const inOrder: SurveyStation[] = [
      { depth: 0, azimuthDeg: 0, dipDeg: -90 },
      { depth: 50, azimuthDeg: 30, dipDeg: -70 },
      { depth: 100, azimuthDeg: 60, dipDeg: -50 },
    ];
    const shuffled = [inOrder[2], inOrder[0], inOrder[1]];

    const traceInOrder = computeMinimumCurvatureTrace(COLLAR, inOrder);
    const traceShuffled = computeMinimumCurvatureTrace(COLLAR, shuffled);

    expect(traceShuffled).toEqual(traceInOrder);
  });
});

describe('computeMinimumCurvatureTrace — desviación real cambiante, verificada contra integración numérica independiente', () => {
  it('coincide con la integración por sub-pasos (slerp) dentro de tolerancia numérica, y la traza NO es una línea recta', () => {
    const stations: SurveyStation[] = [
      { depth: 0, azimuthDeg: 10, dipDeg: -88 },
      { depth: 100, azimuthDeg: 45, dipDeg: -60 },
      { depth: 250, azimuthDeg: 95, dipDeg: -35 },
      { depth: 400, azimuthDeg: 130, dipDeg: -20 },
    ];

    const closedForm = computeMinimumCurvatureTrace(COLLAR, stations);
    const reference = numericIntegrateTrace(COLLAR, stations, 200_000);

    expect(closedForm).toHaveLength(reference.length);
    for (let i = 0; i < closedForm.length; i++) {
      // Tolerancia absoluta 1e-4 m sobre profundidades de hasta 400m — la integración numérica
      // con 200,000 sub-pasos por tramo converge muy por debajo de esa cota al resultado exacto.
      expect(closedForm[i].east).toBeCloseTo(reference[i].east, 4);
      expect(closedForm[i].north).toBeCloseTo(reference[i].north, 4);
      expect(closedForm[i].elevation).toBeCloseTo(reference[i].elevation, 4);
    }

    // Confirma que la traza realmente se curva (no es una línea recta collar→última estación):
    // el punto intermedio (250m) NO puede estar sobre el segmento recto de extremo a extremo.
    const last = closedForm[closedForm.length - 1];
    const mid = closedForm[2]; // profundidad 250
    const totalDepth = stations[stations.length - 1].depth;
    const t = 250 / totalDepth;
    const straightLineMid = {
      east: COLLAR.east + t * (last.east - COLLAR.east),
      north: COLLAR.north + t * (last.north - COLLAR.north),
      elevation: COLLAR.elevation + t * (last.elevation - COLLAR.elevation),
    };
    const deviation = Math.hypot(mid.east - straightLineMid.east, mid.north - straightLineMid.north, mid.elevation - straightLineMid.elevation);
    expect(deviation).toBeGreaterThan(1); // metros de separación de la recta — la traza se curva de verdad
  });

  it('el dogleg (β) grande entre estaciones no vecinas se reduce a RF≈1 cuando β→0 (estaciones con misma orientación), sin NaN', () => {
    const stations: SurveyStation[] = [
      { depth: 0, azimuthDeg: 200, dipDeg: -55 },
      { depth: 75, azimuthDeg: 200, dipDeg: -55 }, // misma orientación exacta — β=0, caso límite de la fórmula RF
    ];
    const trace = computeMinimumCurvatureTrace(COLLAR, stations);
    expect(trace.every((p) => Number.isFinite(p.east) && Number.isFinite(p.north) && Number.isFinite(p.elevation))).toBe(true);
  });
});
