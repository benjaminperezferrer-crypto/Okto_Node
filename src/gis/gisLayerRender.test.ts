/**
 * src/gis/gisLayerRender.test.ts
 * Verificación pura de getCategorizableFields()/getCategoryValues()
 * (Etapa 12) — sin DOM/Three.js, reusa los builders reales de las Etapas
 * 9-11 (buildCollarsLayer/buildDrillholesLayer/buildColumnasLayer/
 * buildHidrogeoLayer) para fixtures realistas en vez de armar GisLayer a
 * mano, y así probar exactamente lo que gisLayerRender.ts va a recibir en
 * producción. La construcción de geometría 3D en sí (los builders de
 * mesh) se sigue verificando por navegador, mismo criterio que el resto
 * del módulo — acá solo se prueba la lógica pura nueva.
 */
import { describe, it, expect } from 'vitest';
import { getCategorizableFields, getCategoryValues, computeLayersCentroid } from './gisLayerRender';
import { buildCollarsLayer } from './collarsIntegration';
import { buildDrillholesLayer } from './drillholesIntegration';
import { buildColumnasLayer } from './columnasIntegration';
import type { GisLayer } from './gisTypes';
import type { RasterLayerData } from './rasterImport';
import type { QaqcCollarPoint, QaqcSurveyStation } from '../projectBridge';
import type { ColumnasProjectState } from '../projectTypes';
import type { FeatureCollection } from 'geojson';

const COLLARS: QaqcCollarPoint[] = [
  { dhid: 'DDH-01', este: 500000, norte: 7500000, cota: 1000, sourceFileId: 1, sourceFileName: 'lote1.xlsx' },
  { dhid: 'DDH-02', este: 500100, norte: 7500050, cota: 990, sourceFileId: 2, sourceFileName: 'lote2.xlsx' },
  { dhid: 'DDH-03', este: 500200, norte: 7500100, cota: 980, sourceFileId: 1, sourceFileName: 'lote1.xlsx' },
];

describe('getCategorizableFields', () => {
  it('collars: dhid y sourceFileName', () => {
    const layer = buildCollarsLayer(COLLARS, 0);
    expect(getCategorizableFields(layer)).toEqual(['dhid', 'sourceFileName']);
  });

  it('drillholes: solo dhid', () => {
    const surveys: QaqcSurveyStation[] = [
      { dhid: 'DDH-01', depth: 0, azimuthDeg: 0, dipDeg: -90, sourceFileId: 1, sourceFileName: 's.xlsx' },
      { dhid: 'DDH-01', depth: 50, azimuthDeg: 10, dipDeg: -80, sourceFileId: 1, sourceFileName: 's.xlsx' },
    ];
    const layer = buildDrillholesLayer(COLLARS, surveys, 0, 1000);
    expect(getCategorizableFields(layer)).toEqual(['dhid']);
  });

  it('columnas: name e id', () => {
    const state = {
      projects: [{
        id: 'tab-1', name: 'Col A',
        columnState: { column: { id: 'col-1', metadata: { name: 'Col A', location: { description: '', coordinates: { este: 1, norte: 1 } } } } },
      }],
    } as unknown as ColumnasProjectState;
    const layer = buildColumnasLayer(state, 'EPSG:32719', 0);
    expect(getCategorizableFields(layer)).toEqual(['name', 'id']);
  });

  it('vector/GeoJSON: unión de las claves de properties de todas las features', () => {
    const data: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { tipo: 'A', color: 'rojo' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 1] }, properties: { tipo: 'B' } },
      ],
    };
    const layer: GisLayer = { id: 'v1', name: 'v', type: 'vector', visible: true, order: 0, symbology: { mode: 'flat', flatColor: '#fff' }, data };
    expect(getCategorizableFields(layer).sort()).toEqual(['color', 'tipo']);
  });

  it('raster: siempre []', () => {
    const layer: GisLayer = { id: 'r1', name: 'r', type: 'raster', visible: true, order: 0, symbology: { mode: 'flat', flatColor: '#fff' }, data: {} };
    expect(getCategorizableFields(layer)).toEqual([]);
  });

  it('capa integrada vacía (sin puntos): []', () => {
    const layer = buildCollarsLayer([], 0);
    expect(getCategorizableFields(layer)).toEqual([]);
  });

  it('no confunde tipos con forma de dato idéntica (collars/columnas/hidrogeo son todas {points:[...]})', () => {
    // Regresión: isCollarLayerData()/isColumnasLayerData()/isHidrogeoLayerData() son estructuralmente
    // idénticas — sin filtrar primero por layer.type, una capa de columnas devolvería los campos de collars.
    const state = {
      projects: [{
        id: 'tab-1', name: 'Col A',
        columnState: { column: { id: 'col-1', metadata: { name: 'Col A', location: { description: '', coordinates: { este: 1, norte: 1 } } } } },
      }],
    } as unknown as ColumnasProjectState;
    const columnasLayer = buildColumnasLayer(state, 'EPSG:32719', 0);
    const fields = getCategorizableFields(columnasLayer);
    expect(fields).not.toContain('dhid');
    expect(fields).not.toContain('sourceFileName');
  });
});

describe('getCategoryValues', () => {
  it('collars: devuelve los valores en el mismo orden que layer.data.points', () => {
    const layer = buildCollarsLayer(COLLARS, 0);
    expect(getCategoryValues(layer, 'sourceFileName')).toEqual(['lote1.xlsx', 'lote2.xlsx', 'lote1.xlsx']);
    expect(getCategoryValues(layer, 'dhid')).toEqual(['DDH-01', 'DDH-02', 'DDH-03']);
  });

  it('campo inexistente: string vacío para cada ítem, no undefined ni un crash', () => {
    const layer = buildCollarsLayer(COLLARS, 0);
    expect(getCategoryValues(layer, 'campoQueNoExiste')).toEqual(['', '', '']);
  });

  it('layer.type sin rama de categorización definida (p.ej. raster): siempre [], sin importar la forma real de data', () => {
    const collarsLayer = buildCollarsLayer(COLLARS, 0);
    // Mismo dato (CollarLayerData) pero con type:'raster' — cae en el `default` del switch, no en isCollarLayerData.
    const fakeRaster: GisLayer = { ...collarsLayer, type: 'raster' };
    expect(getCategoryValues(fakeRaster, 'sourceFileName')).toEqual([]);
  });
});

describe('computeLayersCentroid (Etapa 16, botón "Centrar automáticamente")', () => {
  it('null si no hay ninguna capa', () => {
    expect(computeLayersCentroid([])).toBeNull();
  });

  it('null si las únicas capas presentes no tienen ningún punto real', () => {
    const emptyCollars = buildCollarsLayer([], 0);
    const emptyVector: GisLayer = {
      id: 'v0', name: 'v0', type: 'vector', visible: true, order: 0,
      symbology: { mode: 'flat', flatColor: '#fff' },
      data: { type: 'FeatureCollection', features: [] } as FeatureCollection,
    };
    expect(computeLayersCentroid([emptyCollars, emptyVector])).toBeNull();
  });

  it('promedia collars (integrated) + un shapefile importado (vector/GeoJSON) — 2 fuentes simultáneas', () => {
    const collarsLayer = buildCollarsLayer(COLLARS, 0);
    const vectorData: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[500300, 7500300], [500400, 7500400]] }, properties: {} },
      ],
    };
    const vectorLayer: GisLayer = {
      id: 'v1', name: 'estructuras', type: 'vector', visible: true, order: 1,
      symbology: { mode: 'flat', flatColor: '#fff' }, data: vectorData,
    };

    // 5 puntos en total: los 3 collars de COLLARS + los 2 vértices de la línea.
    // Sumas y promedio calculados a mano (números enteros, división exacta):
    //   este:  500000+500100+500200+500300+500400 = 2501000 → /5 = 500200
    //   norte: 7500000+7500050+7500100+7500300+7500400 = 37500850 → /5 = 7500170
    const result = computeLayersCentroid([collarsLayer, vectorLayer]);
    expect(result).not.toBeNull();
    expect(result!.centerEast).toBeCloseTo(500200, 9);
    expect(result!.centerNorth).toBeCloseTo(7500170, 9);
  });

  it('drillholes: promedia TODOS los vértices de la traza, no solo el collar', () => {
    const surveys: QaqcSurveyStation[] = [
      { dhid: 'DDH-01', depth: 0, azimuthDeg: 0, dipDeg: -90, sourceFileId: 1, sourceFileName: 's.xlsx' },
      { dhid: 'DDH-01', depth: 50, azimuthDeg: 10, dipDeg: -80, sourceFileId: 1, sourceFileName: 's.xlsx' },
    ];
    const layer = buildDrillholesLayer(COLLARS, surveys, 0, 1000);
    const tracePoints = (layer.data as { traces: { points: { east: number; north: number }[] }[] }).traces[0].points;
    // No hardcodeamos el resultado de la curvatura mínima (ya se prueba en
    // minimumCurvature.test.ts) — leemos los vértices reales que produjo el
    // builder y verificamos que computeLayersCentroid usa ESOS, no solo el
    // primero (el collar).
    expect(tracePoints.length).toBeGreaterThan(1);
    const expectedEast = tracePoints.reduce((sum, p) => sum + p.east, 0) / tracePoints.length;
    const expectedNorth = tracePoints.reduce((sum, p) => sum + p.north, 0) / tracePoints.length;

    const result = computeLayersCentroid([layer]);
    expect(result).not.toBeNull();
    expect(result!.centerEast).toBeCloseTo(expectedEast, 9);
    expect(result!.centerNorth).toBeCloseTo(expectedNorth, 9);
    // Prueba negativa: si solo hubiera promediado el collar, el resultado
    // sería exactamente el collar — confirma que de verdad usó más de un punto.
    expect(result!.centerEast).not.toBeCloseTo(COLLARS[0].este, 6);
  });

  it('raster: promedia las 4 esquinas del footprint (3 guardadas + la derivada), no un centro ya calculado', () => {
    const data: RasterLayerData = {
      pixels: new Uint8Array(4),
      pixelWidth: 1,
      pixelHeight: 1,
      placement: { kind: 'quad', topLeft: [100, 200], topRight: [300, 200], bottomLeft: [100, 0] },
    };
    const layer: GisLayer = {
      id: 'r1', name: 'georef', type: 'raster', visible: true, order: 0,
      symbology: { mode: 'flat', flatColor: '#fff' }, data,
    };
    // bottomRight derivado = topRight + bottomLeft − topLeft = [300, 0].
    // Esquinas: (100,200) (300,200) (100,0) (300,0) → promedio (200, 100).
    const result = computeLayersCentroid([layer]);
    expect(result).not.toBeNull();
    expect(result!.centerEast).toBeCloseTo(200, 9);
    expect(result!.centerNorth).toBeCloseTo(100, 9);
  });
});
