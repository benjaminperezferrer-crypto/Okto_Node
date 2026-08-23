/**
 * src/gis/reprojection.ts
 * Reproyección de coordenadas entre sistemas EPSG, para cuando una capa
 * importada venga en una proyección distinta a la del proyecto
 * (`ProjectExtent.projectionEPSG`, gisTypes.ts Etapa 1). Envoltorio sobre
 * proj4 — sin integración todavía con la importación real de archivos
 * (eso es la etapa siguiente).
 *
 * proj4 necesita la DEFINICIÓN de cada EPSG registrada antes de poder
 * usarlo (`proj4.defs(codigo, definicion)`) — no trae una base de datos
 * completa de EPSGs incorporada. Acá se registran de entrada:
 *   - EPSG:4326 (WGS84 geográfico, lat/lon) — el sistema de origen más
 *     común para datos importados (GPS, KML, etc.).
 *   - EPSG:32718 / EPSG:32719 (UTM 18S / 19S, datum WGS84) — las
 *     proyecciones UTM más comunes para Chile continental.
 *   - EPSG:5361 / EPSG:5362 (SIRGAS-Chile 2002 / UTM 18S / 19S, datum
 *     oficial chileno, elipsoide GRS80) — las 4 opciones recomendadas del
 *     selector de proyección de ExtentEditor.tsx (Etapa 15) viven todas
 *     pre-registradas acá, así ninguna de las 4 depende de que el usuario
 *     conozca su definición proj4 de memoria.
 * Para cualquier otro EPSG, `registerProjection()` acepta la definición
 * proj4 completa como texto (ej. sacada de epsg.io) — no se mantiene acá
 * una base de datos exhaustiva de EPSGs a propósito.
 */
import proj4 from 'proj4';

proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs('EPSG:32718', '+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:32719', '+proj=utm +zone=19 +south +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:5361', '+proj=utm +zone=18 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
proj4.defs('EPSG:5362', '+proj=utm +zone=19 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

/**
 * Registra (o reemplaza) la definición proj4 de un código EPSG, para
 * poder usarlo luego en `reprojectCoordinates()`. `proj4Definition` es la
 * cadena de definición proj4 completa, ej.:
 *   "+proj=utm +zone=19 +south +datum=WGS84 +units=m +no_defs"
 * (se puede obtener de epsg.io, buscando el EPSG deseado → pestaña "proj4").
 */
export function registerProjection(epsg: string, proj4Definition: string): void {
  proj4.defs(epsg, proj4Definition);
}

/** true si `epsg` ya tiene una definición proj4 registrada (predefinida o vía registerProjection). */
export function isProjectionRegistered(epsg: string): boolean {
  return !!proj4.defs(epsg);
}

/**
 * Transforma una lista de coordenadas [x, y] de `fromEPSG` a `toEPSG`.
 * Para EPSG:4326, x=longitud/y=latitud (orden proj4 estándar, no
 * lat/lon). Ambos EPSG deben estar registrados de antemano — con los
 * predefinidos de este archivo o vía `registerProjection()` — si no,
 * tira un Error específico indicando cuál falta, en vez de dejar que
 * proj4 falle más abajo con un mensaje genérico.
 */
export function reprojectCoordinates(
  coords: [number, number][],
  fromEPSG: string,
  toEPSG: string,
): [number, number][] {
  if (!isProjectionRegistered(fromEPSG)) {
    throw new Error(
      `reprojectCoordinates: "${fromEPSG}" no tiene una definición proj4 registrada. `
      + `Usa registerProjection("${fromEPSG}", "<definición proj4>") antes de reproyectar.`,
    );
  }
  if (!isProjectionRegistered(toEPSG)) {
    throw new Error(
      `reprojectCoordinates: "${toEPSG}" no tiene una definición proj4 registrada. `
      + `Usa registerProjection("${toEPSG}", "<definición proj4>") antes de reproyectar.`,
    );
  }

  // Mismo EPSG en ambos lados: devuelve copias sin pasar por proj4 (evita
  // trabajo innecesario y cualquier drift de redondeo de una transformada
  // identidad, aunque proj4 también la maneja bien).
  if (fromEPSG === toEPSG) {
    return coords.map(([x, y]) => [x, y]);
  }

  return coords.map((coord) => proj4(fromEPSG, toEPSG, coord));
}
