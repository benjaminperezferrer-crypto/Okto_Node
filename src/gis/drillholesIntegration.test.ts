/**
 * src/gis/drillholesIntegration.test.ts
 * Verificación lógica pura de buildDrillholesLayer() (Etapa 10) — sin
 * DOM/Three.js, mismo estilo que collarsIntegration.test.ts. La
 * matemática de curvatura mínima en sí ya está verificada por separado en
 * minimumCurvature.test.ts; acá se prueba el "join" por DHID y los casos
 * borde de la integración (collar sin surveys, survey sin collar, cota
 * null).
 */
import { describe, it, expect } from 'vitest';
import { buildDrillholesLayer, DRILLHOLES_LAYER_ID, type DrillholeLayerData } from './drillholesIntegration';
import { computeMinimumCurvatureTrace } from './minimumCurvature';
import type { QaqcCollarPoint, QaqcSurveyStation } from '../projectBridge';

const COLLARS: QaqcCollarPoint[] = [
  { dhid: 'DDH-01', este: 500000, norte: 7500000, cota: 1000, sourceFileId: 1, sourceFileName: 'collars.xlsx' },
  { dhid: 'DDH-02', este: 500100, norte: 7500050, cota: null, sourceFileId: 1, sourceFileName: 'collars.xlsx' },
  { dhid: 'DDH-03', este: 500200, norte: 7500100, cota: 990, sourceFileId: 1, sourceFileName: 'collars.xlsx' }, // sin surveys
];

const SURVEYS: QaqcSurveyStation[] = [
  { dhid: 'DDH-01', depth: 0, azimuthDeg: 0, dipDeg: -90, sourceFileId: 2, sourceFileName: 'surveys.xlsx' },
  { dhid: 'DDH-01', depth: 100, azimuthDeg: 30, dipDeg: -75, sourceFileId: 2, sourceFileName: 'surveys.xlsx' },
  { dhid: 'DDH-02', depth: 0, azimuthDeg: 90, dipDeg: -80, sourceFileId: 2, sourceFileName: 'surveys.xlsx' },
  { dhid: 'DDH-02', depth: 50, azimuthDeg: 100, dipDeg: -70, sourceFileId: 2, sourceFileName: 'surveys.xlsx' },
  { dhid: 'DDH-99', depth: 0, azimuthDeg: 0, dipDeg: -90, sourceFileId: 2, sourceFileName: 'surveys.xlsx' }, // sin collar correspondiente
];

describe('buildDrillholesLayer', () => {
  it('produce una traza por cada collar que tiene surveys, y ninguna para los que no', () => {
    const layer = buildDrillholesLayer(COLLARS, SURVEYS, 4, 1000);
    const data = layer.data as DrillholeLayerData;

    const dhids = data.traces.map((t) => t.dhid).sort();
    expect(dhids).toEqual(['DDH-01', 'DDH-02']); // DDH-03 (sin surveys) y DDH-99 (sin collar) quedan afuera
  });

  it('la traza de cada DHID coincide EXACTO con computeMinimumCurvatureTrace() llamado directo con su collar y sus estaciones', () => {
    const layer = buildDrillholesLayer(COLLARS, SURVEYS, 4, 1000);
    const data = layer.data as DrillholeLayerData;

    const trace01 = data.traces.find((t) => t.dhid === 'DDH-01')!;
    const expected01 = computeMinimumCurvatureTrace(
      { east: 500000, north: 7500000, elevation: 1000 },
      [
        { depth: 0, azimuthDeg: 0, dipDeg: -90 },
        { depth: 100, azimuthDeg: 30, dipDeg: -75 },
      ],
    );
    expect(trace01.points).toEqual(expected01);
  });

  it('usa defaultElevation como cota del collar cuando cota es null', () => {
    const layer = buildDrillholesLayer(COLLARS, SURVEYS, 4, 1234.5);
    const data = layer.data as DrillholeLayerData;

    const trace02 = data.traces.find((t) => t.dhid === 'DDH-02')!;
    expect(trace02.points[0].elevation).toBe(1234.5); // DDH-02 tiene cota:null en COLLARS
  });

  it('id/type/nombre/color fijos, distintos de collarsIntegration', () => {
    const layer = buildDrillholesLayer(COLLARS, SURVEYS, 0, 1000);
    expect(layer.id).toBe(DRILLHOLES_LAYER_ID);
    expect(layer.id).toBe('integrated-drillholes');
    expect(layer.type).toBe('integrated-drillholes');
    expect(layer.symbology.flatColor).toBe('#ff8800');
  });

  it('sin collars o sin surveys, produce una capa válida sin trazas', () => {
    expect((buildDrillholesLayer([], SURVEYS, 0, 1000).data as DrillholeLayerData).traces).toEqual([]);
    expect((buildDrillholesLayer(COLLARS, [], 0, 1000).data as DrillholeLayerData).traces).toEqual([]);
  });

  it('agrupa múltiples estaciones del mismo DHID aunque vengan intercaladas con las de otro DHID', () => {
    // SURVEYS ya intercala DDH-01/DDH-02/DDH-99 en vez de venir agrupado — confirma que el join es por DHID, no por posición/orden en el array.
    const layer = buildDrillholesLayer(COLLARS, SURVEYS, 0, 1000);
    const data = layer.data as DrillholeLayerData;
    const trace01 = data.traces.find((t) => t.dhid === 'DDH-01')!;
    const trace02 = data.traces.find((t) => t.dhid === 'DDH-02')!;
    expect(trace01.points).toHaveLength(2); // 2 estaciones propias de DDH-01
    expect(trace02.points).toHaveLength(2); // 2 estaciones propias de DDH-02, no contaminadas por las de DDH-01
  });
});
