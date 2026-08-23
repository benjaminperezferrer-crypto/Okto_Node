/**
 * src/gis/columnasIntegration.test.ts
 * Verificación lógica/numérica pura de buildColumnasLayer() (Etapa 11) —
 * sin DOM/Three.js, mismo estilo que collarsIntegration.test.ts.
 *
 * Los fixtures de ColumnasProjectState acá son deliberadamente parciales
 * (solo los campos que buildColumnasLayer() realmente lee) — el tipo real
 * tiene muchos campos irrelevantes para esta función (units, computed,
 * validation, author, date, scale...) que agregarían ruido sin valor de
 * prueba; se castea el resto.
 */
import { describe, it, expect } from 'vitest';
import { buildColumnasLayer, COLUMNAS_LAYER_ID, type ColumnasLayerData } from './columnasIntegration';
import { reprojectCoordinates } from './reprojection';
import type { ColumnasProjectState } from '../projectTypes';

const TARGET_EPSG = 'EPSG:32719';

function fixtureState(overrides: {
  id: string; name: string; entryName: string;
  este?: number; norte?: number; lat?: number; lon?: number; elevation?: number;
}): ColumnasProjectState {
  return {
    projects: [{
      id: 'tab-1',
      name: overrides.entryName,
      columnState: {
        column: {
          id: overrides.id,
          metadata: {
            name: overrides.name,
            location: {
              description: 'Quebrada de prueba',
              coordinates: {
                este: overrides.este,
                norte: overrides.norte,
                lat: overrides.lat,
                lon: overrides.lon,
              },
              elevation: overrides.elevation,
            },
          } as ColumnasProjectState['projects'][number]['columnState']['column']['metadata'],
        },
      } as ColumnasProjectState['projects'][number]['columnState'],
    }],
  } as ColumnasProjectState;
}

describe('buildColumnasLayer', () => {
  it('usa Este/Norte directo cuando están presentes, sin reproyectar', () => {
    const state = fixtureState({ id: 'col-1', name: 'Columna A', entryName: 'Columna A', este: 500500, norte: 7500500, lat: -10, lon: -70 });
    const layer = buildColumnasLayer(state, TARGET_EPSG, 0);
    const data = layer.data as ColumnasLayerData;

    expect(data.points).toHaveLength(1);
    // Si hubiera reproyectado desde lat/lon en vez de usar este/norte directo, el resultado sería otro — confirma la prioridad.
    expect(data.points[0].east).toBe(500500);
    expect(data.points[0].north).toBe(7500500);
  });

  it('reproyecta desde lat/lon cuando faltan Este/Norte, coincidiendo EXACTO con reprojectCoordinates() llamado directo', () => {
    const state = fixtureState({ id: 'col-2', name: 'Columna B', entryName: 'Columna B', lat: -33.45, lon: -70.65 });
    const layer = buildColumnasLayer(state, TARGET_EPSG, 0);
    const data = layer.data as ColumnasLayerData;

    const [expectedEast, expectedNorth] = reprojectCoordinates([[-70.65, -33.45]], 'EPSG:4326', TARGET_EPSG)[0];
    expect(data.points[0].east).toBeCloseTo(expectedEast, 9);
    expect(data.points[0].north).toBeCloseTo(expectedNorth, 9);
  });

  it('omite una columna sin Este/Norte NI lat/lon (no inventa una posición)', () => {
    const state = fixtureState({ id: 'col-3', name: 'Columna C', entryName: 'Columna C' });
    const layer = buildColumnasLayer(state, TARGET_EPSG, 0);
    expect((layer.data as ColumnasLayerData).points).toEqual([]);
  });

  it('usa location.elevation si está presente, o null si no', () => {
    const withElev = fixtureState({ id: 'col-4', name: 'D', entryName: 'D', este: 1, norte: 1, elevation: 2500 });
    const withoutElev = fixtureState({ id: 'col-5', name: 'E', entryName: 'E', este: 1, norte: 1 });
    expect((buildColumnasLayer(withElev, TARGET_EPSG, 0).data as ColumnasLayerData).points[0].elevation).toBe(2500);
    expect((buildColumnasLayer(withoutElev, TARGET_EPSG, 0).data as ColumnasLayerData).points[0].elevation).toBeNull();
  });

  it('usa metadata.name, o el nombre de la pestaña si metadata.name está vacío', () => {
    const state = fixtureState({ id: 'col-6', name: '', entryName: 'Columna 3 (pestaña)', este: 1, norte: 1 });
    const layer = buildColumnasLayer(state, TARGET_EPSG, 0);
    expect((layer.data as ColumnasLayerData).points[0].name).toBe('Columna 3 (pestaña)');
  });

  it('state:null (Columnas nunca se lanzó) produce una capa válida sin puntos', () => {
    const layer = buildColumnasLayer(null, TARGET_EPSG, 0);
    expect((layer.data as ColumnasLayerData).points).toEqual([]);
  });

  it('id/type/color fijos', () => {
    const layer = buildColumnasLayer(null, TARGET_EPSG, 2);
    expect(layer.id).toBe(COLUMNAS_LAYER_ID);
    expect(layer.type).toBe('integrated-columnas');
    expect(layer.symbology.flatColor).toBe('#33cc66');
    expect(layer.order).toBe(2);
  });
});
