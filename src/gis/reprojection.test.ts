/**
 * src/gis/reprojection.test.ts
 * Pruebas de reprojection.ts.
 *
 * El valor de referencia UTM 19S para Plaza de Armas, Santiago (lat
 * -33.4372, lon -70.6506) se verificó de forma INDEPENDIENTE de proj4:
 * se implementó la fórmula estándar Snyder/USGS de Transverse Mercator
 * forward (WGS84) desde cero, en un script aparte, y se comparó contra
 * la salida real de proj4 para el mismo punto — ambas coinciden a menos
 * de 0.1mm de diferencia (easting 346564.3817178793 vs 346564.3817187109;
 * northing 6299025.2902905075 vs 6299025.290342396). Los valores acá
 * están redondeados con margen amplio sobre esa concordancia.
 */
import { describe, it, expect } from 'vitest';
import { reprojectCoordinates, registerProjection, isProjectionRegistered } from './reprojection';

describe('reprojectCoordinates — caso conocido (Santiago, EPSG:4326 → EPSG:32719)', () => {
  it('reproyecta Plaza de Armas a UTM 19S dentro de la referencia verificada', () => {
    // proj4 espera [longitud, latitud], no [latitud, longitud].
    const santiago: [number, number] = [-70.6506, -33.4372];
    const [result] = reprojectCoordinates([santiago], 'EPSG:4326', 'EPSG:32719');

    expect(result[0]).toBeCloseTo(346564.38, 1); // easting, metros
    expect(result[1]).toBeCloseTo(6299025.29, 1); // northing, metros
  });

  it('el redondo (4326 → 32719 → 4326) vuelve a las coordenadas originales', () => {
    const original: [number, number] = [-70.6506, -33.4372];
    const [utm] = reprojectCoordinates([original], 'EPSG:4326', 'EPSG:32719');
    const [roundTrip] = reprojectCoordinates([utm], 'EPSG:32719', 'EPSG:4326');

    expect(roundTrip[0]).toBeCloseTo(original[0], 6);
    expect(roundTrip[1]).toBeCloseTo(original[1], 6);
  });

  it('transforma varios puntos a la vez, en el mismo orden', () => {
    const points: [number, number][] = [
      [-70.6506, -33.4372], // Santiago
      [-70.9171, -33.0472], // Valparaíso, aprox.
    ];
    const results = reprojectCoordinates(points, 'EPSG:4326', 'EPSG:32719');

    expect(results).toHaveLength(2);
    expect(results[0][0]).toBeCloseTo(346564.38, 1);
    expect(results[1][0]).not.toBeCloseTo(results[0][0], 1); // puntos distintos, resultados distintos
  });
});

describe('reprojectCoordinates — mismo EPSG en ambos lados', () => {
  it('devuelve las coordenadas sin cambios, como copias (no la misma referencia)', () => {
    const coords: [number, number][] = [[500000, 6300000]];
    const result = reprojectCoordinates(coords, 'EPSG:32719', 'EPSG:32719');

    expect(result).toEqual(coords);
    expect(result).not.toBe(coords);
    expect(result[0]).not.toBe(coords[0]);
  });
});

describe('reprojectCoordinates — EPSG no registrado', () => {
  it('rechaza con un error específico si fromEPSG no está registrado', () => {
    expect(() => reprojectCoordinates([[0, 0]], 'EPSG:99999', 'EPSG:4326')).toThrow(
      /"EPSG:99999" no tiene una definición proj4 registrada.*registerProjection/,
    );
  });

  it('rechaza con un error específico si toEPSG no está registrado', () => {
    expect(() => reprojectCoordinates([[0, 0]], 'EPSG:4326', 'EPSG:88888')).toThrow(
      /"EPSG:88888" no tiene una definición proj4 registrada.*registerProjection/,
    );
  });
});

describe('registerProjection — EPSG adicional definido por el usuario', () => {
  it('permite registrar un EPSG nuevo y usarlo después en reprojectCoordinates', () => {
    // EPSG:5360 (SIRGAS-Chile 2002 / UTM zona 17S) — NO viene predefinido
    // en reprojection.ts ni en proj4 (a diferencia de EPSG:3857/4326, que
    // proj4 trae incorporados por defecto — se descartó como caso de
    // prueba justamente por eso, no servía para probar el registro manual;
    // EPSG:5361/5362, sus vecinas de zona 18S/19S, sí quedaron predefinidas
    // en la Etapa 15, así que tampoco sirven ya para este caso).
    expect(isProjectionRegistered('EPSG:5360')).toBe(false);

    registerProjection(
      'EPSG:5360',
      '+proj=utm +zone=17 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    );

    expect(isProjectionRegistered('EPSG:5360')).toBe(true);
    const [result] = reprojectCoordinates([[-70.6506, -33.4372]], 'EPSG:4326', 'EPSG:5360');
    // Valor obtenido corriendo proj4 directo con esta misma definición.
    expect(result[0]).toBeCloseTo(1464061.66, 1);
    expect(result[1]).toBeCloseTo(6251948.38, 1);
  });
});
