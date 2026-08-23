/**
 * src/estructural/qaqcBridge.test.ts
 */
import { describe, it, expect } from 'vitest';
import { mapQaqcStructureToPlanarMeasurement } from './qaqcBridge';
import type { QaqcStructurePoint } from '../projectBridge';

function baseStructure(overrides: Partial<QaqcStructurePoint> = {}): QaqcStructurePoint {
  return {
    id: '1',
    este: null,
    norte: null,
    cota: null,
    tipo: 'Falla',
    azimut: 40,
    dip: 60,
    rake: null,
    direccionRake: null,
    cinemática: null,
    observaciones: null,
    otros: {},
    sourceFileId: 1,
    sourceFileName: 'estructuras.csv',
    ...overrides,
  };
}

describe('mapQaqcStructureToPlanarMeasurement', () => {
  it('convierte los campos obligatorios (id con prefijo qaqc-, tipo, azimut, dip)', () => {
    const m = mapQaqcStructureToPlanarMeasurement(baseStructure());
    expect(m).toMatchObject({ id: 'qaqc-1', tipo: 'Falla', azimut: 40, dip: 60 });
  });

  it('zona/campaña quedan SIEMPRE undefined — nunca se inventan (caso pedido explícitamente)', () => {
    const m = mapQaqcStructureToPlanarMeasurement(baseStructure());
    expect(m.zona).toBeUndefined();
    expect(m.campaña).toBeUndefined();
  });

  it('copia los campos opcionales solo cuando NO son null', () => {
    const m = mapQaqcStructureToPlanarMeasurement(baseStructure({
      este: 1000, norte: 2000, cota: 300, cinemática: 'normal', rake: 90, direccionRake: 'NE',
      observaciones: 'obs', otros: { Litología: 'Andesita' },
    }));
    expect(m).toMatchObject({
      este: 1000, norte: 2000, cota: 300, cinemática: 'normal', rake: 90, direccionRake: 'NE',
      observaciones: 'obs', otros: { Litología: 'Andesita' },
    });
  });

  it('campos opcionales en null quedan AUSENTES del objeto (undefined), no null', () => {
    const m = mapQaqcStructureToPlanarMeasurement(baseStructure());
    expect(m.este).toBeUndefined();
    expect(m.cinemática).toBeUndefined();
    expect(m.rake).toBeUndefined();
    expect(m.otros).toBeUndefined(); // otros={} -> no se agrega
  });
});
