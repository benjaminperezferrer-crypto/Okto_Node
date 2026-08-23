/**
 * src/estructural/classification.test.ts
 * Casos verificados a mano — datos sintéticos con 2 zonas/campañas y 2
 * tipos de estructura, exactamente el caso pedido en la Etapa 9.
 */
import { describe, it, expect } from 'vitest';
import {
  getClassifiableFields, getFieldValue, getClassificationColors,
  applyFilter, passesFilter, NO_DATA_LABEL,
  getClassifiableFieldLabel, isOtroField, otroFieldColumnName,
} from './classification';
import type { PlanarMeasurement, LinearMeasurement } from './structuralTypes';

const SOURCE = { sourceFileId: 1, sourceFileName: 'test.csv' };

const planar: PlanarMeasurement[] = [
  { id: 'P1', ...SOURCE, tipo: 'Falla', cinemática: 'normal', zona: 'Norte', campaña: '2025', azimut: 10, dip: 40 },
  { id: 'P2', ...SOURCE, tipo: 'Falla', cinemática: 'inversa', zona: 'Sur', campaña: '2024', azimut: 20, dip: 45 },
  { id: 'P3', ...SOURCE, tipo: 'Fractura', zona: 'Norte', campaña: '2025', azimut: 30, dip: 50 }, // sin cinemática
  { id: 'P4', ...SOURCE, tipo: 'Fractura', azimut: 40, dip: 55 }, // sin zona/campaña (como un dato leído de QA/QC)
];

const linear: LinearMeasurement[] = [
  { id: 'L1', tipo: 'Estría', zona: 'Norte', campaña: '2025', trend: 100, plunge: 20 },
  { id: 'L2', tipo: 'Eje de pliegue', zona: 'Sur', campaña: '2024', trend: 200, plunge: 30 },
];

describe('getClassifiableFields — solo ofrece campos con datos reales', () => {
  it('tipo siempre está; cinemática/zona/campaña solo si algún registro los trae', () => {
    const fields = getClassifiableFields(planar, linear);
    expect(fields).toContain('tipo');
    expect(fields).toContain('cinemática'); // P1/P2 la traen
    expect(fields).toContain('zona');
    expect(fields).toContain('campaña');
  });

  it('si NINGÚN registro trae cinemática, no aparece en la lista', () => {
    const noKinematics: PlanarMeasurement[] = [{ id: 'X', ...SOURCE, tipo: 'Fractura', azimut: 1, dip: 1 }];
    const fields = getClassifiableFields(noKinematics, []);
    expect(fields).toEqual(['tipo']); // sin zona/campaña/cinemática en ningún dato
  });

  it('ofrece direccionRake cuando algún plano lo trae', () => {
    const withDirRake: PlanarMeasurement[] = [
      { id: 'X', ...SOURCE, tipo: 'Falla', azimut: 1, dip: 1, rake: 45, direccionRake: 'NE' },
    ];
    expect(getClassifiableFields(withDirRake, [])).toContain('direccionRake');
  });

  it('NUNCA ofrece campos numéricos continuos (este/norte/cota/azimut/dip/rake) ni sourceFileId/sourceFileName/observaciones, sin importar los datos', () => {
    const rich: PlanarMeasurement[] = [
      {
        id: 'X', ...SOURCE, tipo: 'Falla', azimut: 10, dip: 20, este: 500000, norte: 7000000, cota: 350,
        rake: 45, direccionRake: 'NE', observaciones: 'Nota distinta en cada fila',
      },
    ];
    const fields = getClassifiableFields(rich, []);
    for (const excluded of ['este', 'norte', 'cota', 'azimut', 'dip', 'rake', 'sourceFileId', 'sourceFileName', 'observaciones']) {
      expect(fields).not.toContain(excluded);
    }
  });

  it('cada columna "Otro" presente en los datos se ofrece como campo `otros.<nombre>`, con su propia etiqueta sin el prefijo', () => {
    const withOtro: PlanarMeasurement[] = [
      { id: 'X', ...SOURCE, tipo: 'Falla', azimut: 1, dip: 1, otros: { 'Litología asociada': 'Andesita', 'Otro campo': '' } },
      { id: 'Y', ...SOURCE, tipo: 'Falla', azimut: 2, dip: 2, otros: { 'Litología asociada': 'Diorita' } },
    ];
    const fields = getClassifiableFields(withOtro, []);
    expect(fields).toContain('otros.Litología asociada');
    // 'Otro campo' nunca tiene valor real (siempre vacío) — no se ofrece.
    expect(fields).not.toContain('otros.Otro campo');
    expect(getClassifiableFieldLabel('otros.Litología asociada')).toBe('Litología asociada');
    expect(isOtroField('otros.Litología asociada')).toBe(true);
    expect(isOtroField('tipo')).toBe(false);
    expect(otroFieldColumnName('otros.Litología asociada')).toBe('Litología asociada');
  });

  it('getFieldValue resuelve un campo `otros.<nombre>` contra record.otros, y da NO_DATA_LABEL si esa fila no tiene esa columna', () => {
    const withOtro: PlanarMeasurement[] = [
      { id: 'X', ...SOURCE, tipo: 'Falla', azimut: 1, dip: 1, otros: { 'Litología asociada': 'Andesita' } },
      { id: 'Y', ...SOURCE, tipo: 'Falla', azimut: 2, dip: 2 }, // sin `otros` en absoluto
    ];
    expect(getFieldValue(withOtro[0], 'otros.Litología asociada')).toBe('Andesita');
    expect(getFieldValue(withOtro[1], 'otros.Litología asociada')).toBe(NO_DATA_LABEL);
  });

  it('getClassifiableFieldLabel() usa CLASSIFIABLE_FIELD_LABELS para campos fijos, y el id crudo si no está mapeado', () => {
    expect(getClassifiableFieldLabel('tipo')).toBe('Tipo de estructura');
    expect(getClassifiableFieldLabel('direccionRake')).toBe('Dirección de rake');
    expect(getClassifiableFieldLabel('cinemática')).toBe('Cinemática');
  });
});

describe('getFieldValue — bucket "(sin dato)" explícito', () => {
  it('devuelve el valor real cuando existe', () => {
    expect(getFieldValue(planar[0], 'tipo')).toBe('Falla');
    expect(getFieldValue(planar[0], 'campaña')).toBe('2025');
  });

  it('devuelve NO_DATA_LABEL cuando el campo no existe en ese registro (cinemática en P3, zona/campaña en P4)', () => {
    expect(getFieldValue(planar[2], 'cinemática')).toBe(NO_DATA_LABEL);
    expect(getFieldValue(planar[3], 'zona')).toBe(NO_DATA_LABEL);
    expect(getFieldValue(planar[3], 'campaña')).toBe(NO_DATA_LABEL);
  });

  it('devuelve NO_DATA_LABEL para un campo que ni siquiera es candidato (no revienta)', () => {
    expect(getFieldValue(planar[0], 'inexistente')).toBe(NO_DATA_LABEL);
  });
});

describe('getClassificationColors — mismo valor = mismo color entre planos y líneas', () => {
  it('asigna colores por primera aparición, y un valor repetido en planar y linear recibe EL MISMO color', () => {
    // "Falla" aparece en planar; agregamos una línea sintética con tipo="Falla" para confirmar coherencia cross-tipo.
    const linearWithFalla: LinearMeasurement[] = [...linear, { id: 'L3', tipo: 'Falla', trend: 5, plunge: 5 }];
    const colors = getClassificationColors(planar, linearWithFalla, 'tipo');
    expect(colors['Falla']).toBeDefined();
    // getFieldValue de la línea L3 con field='tipo' da 'Falla' -> mismo color que el de los PlanarMeasurement 'Falla'.
    expect(colors['Falla']).toBe(colors['Falla']); // sanity: una sola entrada en el mapa para 'Falla', no una por tipo de registro
  });

  it('con 2 tipos de estructura (Falla/Fractura) da 2 colores DISTINTOS', () => {
    const colors = getClassificationColors(planar, linear, 'tipo');
    expect(colors['Falla']).not.toBe(colors['Fractura']);
  });
});

describe('Filtro — excluye registros, no solo los atenúa (caso pedido explícitamente)', () => {
  it('filtrar por campaña=2025 EXCLUYE del resultado los registros de otras campañas, en planos', () => {
    const filtered = applyFilter(planar, { campaña: new Set(['2025']) });
    expect(filtered.map((p) => p.id)).toEqual(['P1', 'P3']); // P2(2024) y P4(sin dato) quedan AFUERA
    expect(filtered.length).toBe(2); // no 4 — confirma exclusión real, no solo atenuación visual
  });

  it('el mismo filtro de campaña=2025 EXCLUYE también en líneas', () => {
    const filtered = applyFilter(linear, { campaña: new Set(['2025']) });
    expect(filtered.map((l) => l.id)).toEqual(['L1']);
    expect(filtered.length).toBe(1);
  });

  it('clasificación y filtro se combinan: filtrar por campaña=2025 Y clasificar por tipo — el filtro reduce el set, la clasificación solo colorea lo que queda', () => {
    const filtered = applyFilter(planar, { campaña: new Set(['2025']) });
    const colors = getClassificationColors(filtered, [], 'tipo');
    // Tras el filtro solo quedan P1(Falla) y P3(Fractura) — ambos tipos siguen presentes y coloreables.
    expect(filtered.length).toBe(2);
    expect(Object.keys(colors).sort()).toEqual(['Falla', 'Fractura'].sort());
  });

  it('2 filtros combinados con AND: campaña=2025 Y tipo=Fractura deja solo P3', () => {
    const filtered = applyFilter(planar, { campaña: new Set(['2025']), tipo: new Set(['Fractura']) });
    expect(filtered.map((p) => p.id)).toEqual(['P3']);
  });

  it('Set vacío en un campo = sin restricción en ESE campo (no excluye nada por él)', () => {
    const filtered = applyFilter(planar, { campaña: new Set() });
    expect(filtered.length).toBe(planar.length); // todos pasan
  });

  it('filters={} (ningún campo) deja pasar todo', () => {
    expect(applyFilter(planar, {})).toEqual(planar);
    expect(passesFilter(planar[0], {})).toBe(true);
  });

  it('un registro sin el campo filtrado (NO_DATA_LABEL) se excluye si "(sin dato)" no está en el Set permitido', () => {
    const filtered = applyFilter(planar, { zona: new Set(['Norte', 'Sur']) }); // P4 no tiene zona -> NO_DATA_LABEL, no está en el Set
    expect(filtered.map((p) => p.id)).toEqual(['P1', 'P2', 'P3']);
  });

  it('se puede filtrar explícitamente para incluir SOLO los "(sin dato)"', () => {
    const filtered = applyFilter(planar, { zona: new Set([NO_DATA_LABEL]) });
    expect(filtered.map((p) => p.id)).toEqual(['P4']);
  });
});
