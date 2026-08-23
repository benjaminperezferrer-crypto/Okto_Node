/**
 * src/estructural/stereonet.test.ts
 * Casos verificados A MANO antes de escribirlos (ver derivación completa
 * en el JSDoc de stereonet.ts).
 */
import { describe, it, expect } from 'vitest';
import { projectPole, projectLine, projectGreatCircle, invertProjection, computeMeanPole, computeFisherStats, projectSmallCircle } from './stereonet';

const R = 100; // radio arbitrario, no debe estar hardcodeado dentro del módulo — se prueba con un valor distinto de 1 a propósito

// ─────────────────────────────────────────────────────────────────
// Helper SOLO de verificación (Etapa 5) — distancia angular esférica
// entre 2 trend/plunge, para chequear la relación polo⟂plano "en la
// esfera, no en el plano proyectado". invertProjection() en sí ahora es
// pública (Etapa 8, kambDensity.ts la necesita) — se importa de
// stereonet.ts en vez de duplicarla acá.
// ─────────────────────────────────────────────────────────────────
function sphericalAngularDistanceDeg(a: { trend: number; plunge: number }, b: { trend: number; plunge: number }): number {
  const toVec = (t: { trend: number; plunge: number }) => {
    const tr = (t.trend * Math.PI) / 180, pl = (t.plunge * Math.PI) / 180;
    return [Math.cos(pl) * Math.sin(tr), Math.cos(pl) * Math.cos(tr), Math.sin(pl)];
  };
  const [ax, ay, az] = toVec(a), [bx, by, bz] = toVec(b);
  const dot = ax * bx + ay * by + az * bz;
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

describe('projectPole — casos límite', () => {
  it('plano horizontal (dip=0): el polo proyecta EXACTO en el centro, en ambas proyecciones, sin importar la dirección de manteo', () => {
    for (const dipDirection of [0, 90, 200, 359]) {
      for (const projection of ['schmidt', 'wulff'] as const) {
        const { x, y } = projectPole(dipDirection, 0, projection, R);
        expect(x).toBeCloseTo(0, 9);
        expect(y).toBeCloseTo(0, 9);
      }
    }
  });

  it('plano vertical (dip=90) con dirección de manteo conocida (030°): el polo proyecta EXACTO en el borde del círculo (r=R), en el ángulo correcto (trend=210°), en ambas proyecciones', () => {
    const dipDirection = 30;
    const expectedTrend = 210; // dipDirection+180
    const expectedX = R * Math.sin((expectedTrend * Math.PI) / 180);
    const expectedY = R * Math.cos((expectedTrend * Math.PI) / 180);

    for (const projection of ['schmidt', 'wulff'] as const) {
      const { x, y } = projectPole(dipDirection, 90, projection, R);
      expect(Math.hypot(x, y)).toBeCloseTo(R, 6); // en el borde exacto
      expect(x).toBeCloseTo(expectedX, 6);
      expect(y).toBeCloseTo(expectedY, 6);
    }
  });

  it('Schmidt y Wulff dan resultados DISTINTOS para el mismo dato en dip intermedio (45°) — si coincidieran acá, una de las 2 fórmulas estaría mal', () => {
    const dipDirection = 0, dip = 45;
    const schmidt = projectPole(dipDirection, dip, 'schmidt', R);
    const wulff = projectPole(dipDirection, dip, 'wulff', R);
    const rSchmidt = Math.hypot(schmidt.x, schmidt.y);
    const rWulff = Math.hypot(wulff.x, wulff.y);

    expect(rSchmidt).toBeCloseTo(R * Math.SQRT2 * Math.sin((22.5 * Math.PI) / 180), 6); // ≈0.5412·R
    expect(rWulff).toBeCloseTo(R * Math.tan((22.5 * Math.PI) / 180), 6); // ≈0.4142·R
    expect(Math.abs(rSchmidt - rWulff)).toBeGreaterThan(R * 0.05); // claramente distintos, no ruido de punto flotante
  });

  it('coincide EXACTO con la fórmula equiareal ya validada en buildPoleSVG() de index.html (r = R·√2·sin(dip/2), dip en grados)', () => {
    for (const dip of [0, 10, 35, 60, 89.9]) {
      const { x, y } = projectPole(123, dip, 'schmidt', R);
      const rGot = Math.hypot(x, y);
      const rExpected = R * Math.SQRT2 * Math.sin((dip * Math.PI) / 360); // fórmula exacta de buildPoleSVG (d*π/360 = dip/2 en rad)
      expect(rGot).toBeCloseTo(rExpected, 6);
    }
  });
});

describe('projectLine — casos límite', () => {
  it('línea con plunge=90° proyecta en el centro, sin importar el trend', () => {
    for (const trend of [0, 45, 180, 359]) {
      for (const projection of ['schmidt', 'wulff'] as const) {
        const { x, y } = projectLine(trend, 90, projection, R);
        expect(x).toBeCloseTo(0, 9);
        expect(y).toBeCloseTo(0, 9);
      }
    }
  });

  it('línea horizontal (plunge=0) proyecta en el borde (r=R) en la dirección de su trend, ambas proyecciones (coinciden en el borde por construcción)', () => {
    const trend = 75;
    for (const projection of ['schmidt', 'wulff'] as const) {
      const { x, y } = projectLine(trend, 0, projection, R);
      expect(Math.hypot(x, y)).toBeCloseTo(R, 6);
      expect(x).toBeCloseTo(R * Math.sin((trend * Math.PI) / 180), 6);
      expect(y).toBeCloseTo(R * Math.cos((trend * Math.PI) / 180), 6);
    }
  });
});

describe('invertProjection — inversa exacta de projectLine (Etapa 8)', () => {
  it('projectLine seguido de invertProjection recupera el trend/plunge original, en varios casos y ambas proyecciones', () => {
    const cases = [
      { trend: 30, plunge: 10 },
      { trend: 123, plunge: 47 },
      { trend: 359, plunge: 0 },
      { trend: 200, plunge: 89 },
    ];
    for (const projection of ['schmidt', 'wulff'] as const) {
      for (const { trend, plunge } of cases) {
        const { x, y } = projectLine(trend, plunge, projection, R);
        const back = invertProjection(x, y, R, projection);
        expect(back.trend).toBeCloseTo(trend, 6);
        expect(back.plunge).toBeCloseTo(plunge, 6);
      }
    }
  });
});

describe('projectGreatCircle — traza del plano', () => {
  it('el primer punto (rake=0) coincide con projectLine del extremo canónico del rumbo (dirManteo-90°, plunge=0)', () => {
    const dipDirection = 40, dip = 60;
    for (const projection of ['schmidt', 'wulff'] as const) {
      const pts = projectGreatCircle(dipDirection, dip, projection, R);
      const expected = projectLine(dipDirection - 90, 0, projection, R);
      expect(pts[0].x).toBeCloseTo(expected.x, 6);
      expect(pts[0].y).toBeCloseTo(expected.y, 6);
    }
  });

  it('el punto medio (rake=90°, con steps=90 por defecto → i=45) coincide con projectLine de la línea de máximo manteo (trend=dirManteo, plunge=dip)', () => {
    const dipDirection = 40, dip = 60;
    for (const projection of ['schmidt', 'wulff'] as const) {
      const pts = projectGreatCircle(dipDirection, dip, projection, R);
      const mid = pts[45];
      const expected = projectLine(dipDirection, dip, projection, R);
      expect(mid.x).toBeCloseTo(expected.x, 6);
      expect(mid.y).toBeCloseTo(expected.y, 6);
    }
  });

  it('el último punto (rake=180°) coincide con projectLine del extremo opuesto del rumbo (dirManteo+90°, plunge=0)', () => {
    const dipDirection = 40, dip = 60;
    for (const projection of ['schmidt', 'wulff'] as const) {
      const pts = projectGreatCircle(dipDirection, dip, projection, R);
      const expected = projectLine(dipDirection + 90, 0, projection, R);
      const last = pts[pts.length - 1];
      expect(last.x).toBeCloseTo(expected.x, 6);
      expect(last.y).toBeCloseTo(expected.y, 6);
    }
  });

  it('ningún punto de la traza queda fuera del círculo del estereograma (r ≤ R + epsilon)', () => {
    const dipDirection = 200, dip = 35;
    for (const projection of ['schmidt', 'wulff'] as const) {
      const pts = projectGreatCircle(dipDirection, dip, projection, R);
      for (const { x, y } of pts) {
        expect(Math.hypot(x, y)).toBeLessThanOrEqual(R + 1e-6);
      }
    }
  });

  it('plano vertical (dip=90°): la traza pasa EXACTO por el centro en su punto medio (línea de máximo manteo tiene plunge=90°)', () => {
    const dipDirection = 15;
    for (const projection of ['schmidt', 'wulff'] as const) {
      const pts = projectGreatCircle(dipDirection, 90, projection, R);
      const mid = pts[45];
      expect(mid.x).toBeCloseTo(0, 6);
      expect(mid.y).toBeCloseTo(0, 6);
    }
  });
});

describe('projectPole ⟂ projectGreatCircle — verificación cruzada geométrica (Etapa 5)', () => {
  it('el polo y CUALQUIER punto de su círculo máximo están a EXACTAMENTE 90° en la esfera (perpendicularidad polo-plano), no en el plano proyectado — probado analíticamente en el JSDoc de stereonet.ts (dot(polo,rumboVec)=0 y dot(polo,manteoVec)=0 exactos), acá se confirma sobre la SALIDA real de la API pública (invirtiendo la proyección 2D)', () => {
    const dipDirection = 200, dip = 45; // mismo dato ya usado en los tests de projectGreatCircle arriba
    for (const projection of ['schmidt', 'wulff'] as const) {
      const pole = projectPole(dipDirection, dip, projection, R);
      const poleSph = invertProjection(pole.x, pole.y, R, projection);
      const arc = projectGreatCircle(dipDirection, dip, projection, R);

      for (const pt of arc) {
        const ptSph = invertProjection(pt.x, pt.y, R, projection);
        expect(sphericalAngularDistanceDeg(poleSph, ptSph)).toBeCloseTo(90, 3);
      }
    }
  });
});

describe('computeMeanPole — plano/polo medio (paquete de mejoras de Estructural, Etapa 4)', () => {
  it('null con un conjunto vacío', () => {
    expect(computeMeanPole([])).toBeNull();
  });

  it('mediciones IDÉNTICAS: el promedio es exactamente esa misma medición, con concentración máxima (resultantLength=1) — caso trivial verificable a mano', () => {
    const same = { azimut: 45, dip: 30 };
    const result = computeMeanPole([same, same, same]);
    expect(result).not.toBeNull();
    expect(result!.dipDirection).toBeCloseTo(45, 6);
    expect(result!.dip).toBeCloseTo(30, 6);
    expect(result!.resultantLength).toBeCloseTo(1, 9);
    expect(result!.n).toBe(3);
  });

  it('2 planos simétricos respecto del eje dirección-de-manteo=90° (80°/60° y 100°/60°): por simetría de espejo Este-Oeste, la dirección de manteo media DEBE dar exactamente 90° — verificado a mano (argumento de simetría, no cálculo de decimales) antes de escribir el test; el manteo medio (~59.62°, calculado independientemente en Node antes de escribir el assert) queda LIGERAMENTE por debajo de 60° — esperable: promediar 2 vectores separados en trend siempre acorta la resultante frente a promediar sus manteos por separado', () => {
    const result = computeMeanPole([{ azimut: 80, dip: 60 }, { azimut: 100, dip: 60 }]);
    expect(result).not.toBeNull();
    expect(result!.dipDirection).toBeCloseTo(90, 9); // simetría exacta, no aproximada
    expect(result!.dip).toBeCloseTo(59.618744857529514, 9); // valor de referencia calculado independientemente (Node), no derivado del propio código bajo prueba
    expect(result!.resultantLength).toBeCloseTo(0.9886277018143462, 9);
  });

  it('2 polos perfectamente antipodales (planos verticales con direcciones de manteo opuestas, 0° y 180°): el vector resultante se cancela — sin dirección media significativa, debe dar null', () => {
    const result = computeMeanPole([{ azimut: 0, dip: 90 }, { azimut: 180, dip: 90 }]);
    expect(result).toBeNull();
  });

  it('acepta PlanarMeasurement[] real (con campos extra como id/tipo) sin necesidad de mapear — verifica la compatibilidad estructural con el tipo real del módulo, no solo con el shape mínimo', () => {
    const measurements = [
      { id: 'p1', tipo: 'Falla', azimut: 45, dip: 30 },
      { id: 'p2', tipo: 'Fractura', azimut: 45, dip: 30 },
    ];
    const result = computeMeanPole(measurements);
    expect(result).not.toBeNull();
    expect(result!.dipDirection).toBeCloseTo(45, 6);
    expect(result!.n).toBe(2);
  });
});

describe('computeFisherStats — κ + cono de confianza (paquete de mejoras de Estructural, referencia: Fisher 1953 / Fisher-Lewis-Embleton 1987)', () => {
  it('null si computeMeanPole ya da null (sin dirección media significativa)', () => {
    expect(computeFisherStats([{ azimut: 0, dip: 90 }, { azimut: 180, dip: 90 }])).toBeNull();
  });

  it('null con n<2 (κ/cono indefinidos — 1/(N-1) divide por cero en N=1)', () => {
    expect(computeFisherStats([{ azimut: 10, dip: 10 }])).toBeNull();
  });

  it('mediciones IDÉNTICAS (n=3): R=n exacto, κ=+Infinity (concentración perfecta), cono=0° — caso límite verificado a mano', () => {
    const same = { azimut: 45, dip: 30 };
    const result = computeFisherStats([same, same, same]);
    expect(result).not.toBeNull();
    expect(result!.resultantLength).toBeCloseTo(1, 9);
    expect(result!.kappa).toBe(Infinity);
    expect(result!.confidenceConeDeg).toBeCloseTo(0, 6);
  });

  it('caso n=2 verificado independientemente en Node (mismo par simétrico 80°/60°+100°/60° ya usado en los tests de computeMeanPole): κ≈43.97, cono≈38.61° al 95%', () => {
    const result = computeFisherStats([{ azimut: 80, dip: 60 }, { azimut: 100, dip: 60 }], 0.95);
    expect(result).not.toBeNull();
    expect(result!.dipDirection).toBeCloseTo(90, 9);
    expect(result!.kappa).toBeCloseTo(43.96648697013179, 6);
    expect(result!.confidenceConeDeg).toBeCloseTo(38.6073150532461, 6);
    expect(result!.confidenceLevel).toBe(0.95);
  });

  it('CASO SINTÉTICO 1 — clúster MUY apretado (jitter ±1.6° alrededor de azimut=60°/dip=40°, n=50): κ alto (miles) y cono de confianza de bien menos de 1°', () => {
    const tight = Array.from({ length: 50 }, (_, i) => ({
      azimut: 60 + ((i % 5) - 2) * 0.8,
      dip: 40 + (Math.floor(i / 5) % 5 - 2) * 0.8,
    }));
    const result = computeFisherStats(tight, 0.95);
    expect(result).not.toBeNull();
    // Valores de referencia calculados independientemente en Node antes de escribir el assert.
    expect(result!.kappa).toBeCloseTo(3557.5510970774603, 3);
    expect(result!.confidenceConeDeg).toBeCloseTo(0.337723074484859, 6);
    expect(result!.kappa).toBeGreaterThan(1000); // "κ alto" — umbral cualitativo del enunciado
    expect(result!.confidenceConeDeg).toBeLessThan(1); // "cono de pocos grados"
  });

  it('CASO SINTÉTICO 2 — conjunto disperso (azimut cubriendo los 360° uniformemente, dip variable, n=50): κ bajo (de un solo dígito) y cono de confianza de más de 10°', () => {
    const scattered = Array.from({ length: 50 }, (_, i) => ({
      azimut: (i * 360) / 50,
      dip: 10 + (i % 9) * 8,
    }));
    const result = computeFisherStats(scattered, 0.95);
    expect(result).not.toBeNull();
    expect(result!.kappa).toBeCloseTo(3.4339620570500413, 6);
    expect(result!.confidenceConeDeg).toBeCloseTo(12.8841971697996, 6);
    expect(result!.kappa).toBeLessThan(10); // "κ bajo" — umbral cualitativo del enunciado
    expect(result!.confidenceConeDeg).toBeGreaterThan(10); // "cono grande" (decenas de grados)
  });

  it('relación cualitativa: el caso apretado da κ MUCHO mayor y cono MUCHO menor que el caso disperso, con el MISMO n — confirma la fórmula responde a la concentración, no solo al tamaño de muestra', () => {
    const tight = Array.from({ length: 50 }, (_, i) => ({
      azimut: 60 + ((i % 5) - 2) * 0.8,
      dip: 40 + (Math.floor(i / 5) % 5 - 2) * 0.8,
    }));
    const scattered = Array.from({ length: 50 }, (_, i) => ({
      azimut: (i * 360) / 50,
      dip: 10 + (i % 9) * 8,
    }));
    const tightResult = computeFisherStats(tight, 0.95)!;
    const scatteredResult = computeFisherStats(scattered, 0.95)!;
    expect(tightResult.kappa).toBeGreaterThan(scatteredResult.kappa * 100);
    expect(tightResult.confidenceConeDeg).toBeLessThan(scatteredResult.confidenceConeDeg / 10);
  });

  it('confidenceLevel más exigente (99%) da un cono MÁS ANCHO que 95% para el mismo conjunto — más confianza requiere un cono más grande', () => {
    const pair = [{ azimut: 80, dip: 60 }, { azimut: 100, dip: 60 }];
    const at95 = computeFisherStats(pair, 0.95)!;
    const at99 = computeFisherStats(pair, 0.99)!;
    expect(at99.confidenceConeDeg).toBeGreaterThan(at95.confidenceConeDeg);
  });
});

describe('projectSmallCircle — círculo pequeño (cono) alrededor de un eje arbitrario', () => {
  it('eje VERTICAL (plunge=90°, en el centro del estereograma): el círculo pequeño de radio r° es un círculo centrado en el origen, de radio igual al de un polo a plunge=90-r° — verificado a mano (derivación en el JSDoc de la función)', () => {
    const R = 100;
    const r = 15; // radio angular del cono
    const points = projectSmallCircle(0, 90, r, 'schmidt', R);
    // Referencia: un polo a plunge=(90-r) tiene el mismo radio en el plano proyectado.
    const expectedPoint = projectLine(0, 90 - r, 'schmidt', R);
    const expectedRadius = Math.hypot(expectedPoint.x, expectedPoint.y);
    for (const p of points) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(expectedRadius, 6);
    }
  });

  it('todos los puntos del círculo pequeño están a distancia angular EXACTA `radiusDeg` del eje (verificado invirtiendo la proyección y calculando el producto punto contra el eje)', () => {
    const R = 100;
    const axisTrend = 40, axisPlunge = 35, radiusDeg = 22;
    const points = projectSmallCircle(axisTrend, axisPlunge, radiusDeg, 'wulff', R);
    const axisVec = {
      x: Math.cos(axisPlunge * Math.PI / 180) * Math.sin(axisTrend * Math.PI / 180),
      y: Math.cos(axisPlunge * Math.PI / 180) * Math.cos(axisTrend * Math.PI / 180),
      z: Math.sin(axisPlunge * Math.PI / 180),
    };
    for (const p of points) {
      const { trend, plunge } = invertProjection(p.x, p.y, R, 'wulff');
      const v = {
        x: Math.cos(plunge * Math.PI / 180) * Math.sin(trend * Math.PI / 180),
        y: Math.cos(plunge * Math.PI / 180) * Math.cos(trend * Math.PI / 180),
        z: Math.sin(plunge * Math.PI / 180),
      };
      const dot = axisVec.x * v.x + axisVec.y * v.y + axisVec.z * v.z;
      const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
      expect(angleDeg).toBeCloseTo(radiusDeg, 3);
    }
  });

  it('devuelve `nPoints` puntos (default 64), formando una polilínea cerrable', () => {
    const points = projectSmallCircle(10, 20, 5, 'schmidt', 100);
    expect(points.length).toBe(64);
    const points2 = projectSmallCircle(10, 20, 5, 'schmidt', 100, 12);
    expect(points2.length).toBe(12);
  });
});
