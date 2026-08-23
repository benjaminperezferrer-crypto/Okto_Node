/**
 * src/gis/collarsIntegration.test.ts
 * Verificación numérica/lógica pura de buildCollarsLayer() (Etapa 9) — sin
 * DOM/Three.js, igual que rasterImport.test.ts para buildGeoreferencedRasterLayer().
 */
import { describe, it, expect } from 'vitest';
import { buildCollarsLayer, COLLARS_LAYER_ID, type CollarLayerData } from './collarsIntegration';
import type { QaqcCollarPoint } from '../projectBridge';

const SAMPLE: QaqcCollarPoint[] = [
  { dhid: 'DDH-01', este: 500010.5, norte: 7500020.25, cota: 1005.75, sourceFileId: 1, sourceFileName: 'collars.xlsx' },
  { dhid: 'DDH-02', este: 500340.1, norte: 7499910.9, cota: null, sourceFileId: 1, sourceFileName: 'collars.xlsx' },
];

describe('buildCollarsLayer', () => {
  it('mapea cada QaqcCollarPoint a un CollarPoint 1:1, preservando este/norte/cota exactos', () => {
    const layer = buildCollarsLayer(SAMPLE, 3);
    const data = layer.data as CollarLayerData;

    expect(data.points).toHaveLength(2);
    expect(data.points[0]).toEqual({
      dhid: 'DDH-01', east: 500010.5, north: 7500020.25, elevation: 1005.75,
      sourceFileId: 1, sourceFileName: 'collars.xlsx',
    });
    // cota null (sin columna Cota mapeada/con valor) se preserva como null, no como 0 u otro default silencioso.
    expect(data.points[1].elevation).toBeNull();
  });

  it('usa id/type/nombre fijos, independientes de la cantidad de collars', () => {
    const layer = buildCollarsLayer(SAMPLE, 3);
    expect(layer.id).toBe(COLLARS_LAYER_ID);
    expect(layer.id).toBe('integrated-collars');
    expect(layer.type).toBe('integrated-collars');
    expect(layer.name).toBe('Collars (QA/QC)');
    expect(layer.visible).toBe(true);
  });

  it('usa existingLayerCount para order y para elegir el color por defecto (misma paleta que shapefileImport)', () => {
    const layerAt0 = buildCollarsLayer(SAMPLE, 0);
    const layerAt3 = buildCollarsLayer(SAMPLE, 3);

    expect(layerAt0.order).toBe(0);
    expect(layerAt3.order).toBe(3);
    // Colores distintos para índices distintos de la paleta rotada — no verifica el valor exacto (acoplaría el test a DEFAULT_LAYER_COLORS), solo que el criterio realmente varía con existingLayerCount.
    expect(layerAt0.symbology.flatColor).not.toBe(layerAt3.symbology.flatColor);
    expect(layerAt0.symbology.mode).toBe('flat');
  });

  it('con una lista vacía de collars, produce una capa válida sin puntos (no lanza ni devuelve null)', () => {
    const layer = buildCollarsLayer([], 0);
    const data = layer.data as CollarLayerData;
    expect(data.points).toEqual([]);
  });
});
