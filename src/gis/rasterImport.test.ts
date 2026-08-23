/**
 * src/gis/rasterImport.test.ts
 * Verificación numérica de buildGeoreferencedRasterLayer() (Etapa 8) —
 * pura, sin DOM/Three.js, así que se prueba directo con Vitest en vez de
 * en el navegador (a diferencia del resto de rasterImport.ts, que sí
 * necesita decodificar imágenes reales vía APIs del navegador).
 */
import { describe, it, expect } from 'vitest';
import { buildGeoreferencedRasterLayer } from './rasterImport';
import type { AffineTransform } from './affineFit';
import { applyAffineTransform } from './affineFit';

describe('buildGeoreferencedRasterLayer', () => {
  it('ubica el paralelogramo exactamente donde predice la transformación afín, incluyendo cizalla', () => {
    // Transformación con cizalla real (misma que affineFit.test.ts) —
    // un rectángulo+rotación no podría representar esto, por eso hace
    // falta el camino QuadPlacement (ver gisLayerRender.ts).
    const transform: AffineTransform = { a: 1.5, b: 0.3, c: -0.2, d: 1.8, e: 500000, f: 7500000 };
    const pixelWidth = 200;
    const pixelHeight = 100;
    const pixels = new Uint8Array(pixelWidth * pixelHeight * 4);

    const layer = buildGeoreferencedRasterLayer('mapa-escaneado', pixels, pixelWidth, pixelHeight, transform, 0);

    expect(layer.type).toBe('raster');
    expect(layer.name).toBe('mapa-escaneado');
    const data = layer.data as { placement: { kind: string; topLeft: [number, number]; topRight: [number, number]; bottomLeft: [number, number] } };
    expect(data.placement.kind).toBe('quad');

    const expectedTopLeft = applyAffineTransform(transform, 0, 0);
    const expectedTopRight = applyAffineTransform(transform, pixelWidth, 0);
    const expectedBottomLeft = applyAffineTransform(transform, 0, pixelHeight);

    expect(data.placement.topLeft[0]).toBeCloseTo(expectedTopLeft[0], 9);
    expect(data.placement.topLeft[1]).toBeCloseTo(expectedTopLeft[1], 9);
    expect(data.placement.topRight[0]).toBeCloseTo(expectedTopRight[0], 9);
    expect(data.placement.topRight[1]).toBeCloseTo(expectedTopRight[1], 9);
    expect(data.placement.bottomLeft[0]).toBeCloseTo(expectedBottomLeft[0], 9);
    expect(data.placement.bottomLeft[1]).toBeCloseTo(expectedBottomLeft[1], 9);
  });

  it('no tiene simbología de color editable (flatColor presente solo para cumplir el tipo)', () => {
    const transform: AffineTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const layer = buildGeoreferencedRasterLayer('x', new Uint8Array(16), 2, 2, transform, 0);
    expect(layer.symbology.mode).toBe('flat');
  });
});
