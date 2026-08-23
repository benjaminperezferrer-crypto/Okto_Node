/**
 * src/gis/shapefileImport.ts
 * Importa un shapefile (.shp + .dbf + .shx + .prj) como una GisLayer
 * nueva — parseo vía shpjs, reproyección vía reprojection.ts (Etapa 5).
 * Sin React, sin estado propio — la UI (ShapefileImportButton.tsx) solo
 * llama a `importShapefile()` y agrega el resultado a `layers`.
 *
 * Solo archivos individuales en esta etapa, NO .zip — a propósito: si el
 * .zip trae un .prj adentro, shpjs lo detecta y reproyecta a WGS84 por su
 * cuenta (ver parseZip en shpjs/lib/index.js), sin darnos ninguna
 * visibilidad de si el .prj se pudo interpretar o no (falla en silencio,
 * dejando las coordenadas sin reproyectar sin avisar — justo lo que se
 * pidió evitar). Pasándole los archivos por separado y SIN el .prj,
 * shpjs siempre devuelve coordenadas crudas, y la reproyección la
 * hacemos nosotros con reprojectCoordinates(), con control total y un
 * try/catch propio si el .prj no se puede interpretar.
 */
import shp from 'shpjs';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { GisLayer } from './gisTypes';
import { registerProjection, reprojectCoordinates } from './reprojection';

export interface ShapefileImportResult {
  layer: GisLayer;
  /** No-null si no había .prj — mostrar al usuario, no descartar en silencio. */
  warning: string | null;
}

const DEFAULT_LAYER_COLORS = ['#00f4ff', '#ffcc00', '#ff3355', '#7cff6b', '#c084fc', '#ff9d4d'];

/** Color por defecto para una capa nueva — cicla la paleta según cuántas capas ya existen. */
export function pickDefaultLayerColor(existingLayerCount: number): string {
  return DEFAULT_LAYER_COLORS[existingLayerCount % DEFAULT_LAYER_COLORS.length];
}

function extOf(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot === -1 ? '' : file.name.slice(dot + 1).toLowerCase();
}

function baseNameOf(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot === -1 ? file.name : file.name.slice(0, dot);
}

type CoordPair = [number, number];
type NestedCoords = CoordPair | NestedCoords[];

function isCoordPair(c: unknown): c is CoordPair {
  return Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number';
}

/**
 * Aplica `transform` a TODAS las coordenadas de una estructura GeoJSON
 * anidada (Point: par suelto; LineString/MultiPoint: array de pares;
 * Polygon/MultiLineString: array de arrays; MultiPolygon: un nivel más)
 * en una sola llamada — para que reprojectCoordinates() construya el
 * conversor de proj4 UNA vez por feature, no una vez por vértice.
 */
function mapCoordsDeep(coords: NestedCoords, transform: (pairs: CoordPair[]) => CoordPair[]): NestedCoords {
  const flat: CoordPair[] = [];
  (function collect(c: NestedCoords) {
    if (isCoordPair(c)) {
      flat.push(c);
      return;
    }
    c.forEach(collect);
  })(coords);

  const transformed = transform(flat);
  let i = 0;
  return (function rebuild(c: NestedCoords): NestedCoords {
    if (isCoordPair(c)) return transformed[i++];
    return c.map(rebuild);
  })(coords);
}

function reprojectFeature(feature: Feature, fromEPSG: string, toEPSG: string): Feature {
  const geometry = feature.geometry;
  if (!geometry || geometry.type === 'GeometryCollection') {
    // GeometryCollection no viene en el alcance de esta etapa (solo
    // puntos/líneas/polígonos) — se deja pasar sin tocar en vez de fallar.
    return feature;
  }
  const coordinates = mapCoordsDeep(
    geometry.coordinates as NestedCoords,
    (pairs) => reprojectCoordinates(pairs, fromEPSG, toEPSG),
  );
  return { ...feature, geometry: { ...geometry, coordinates } as Geometry };
}

function reprojectFeatureCollection(fc: FeatureCollection, fromEPSG: string, toEPSG: string): FeatureCollection {
  return { ...fc, features: fc.features.map((f) => reprojectFeature(f, fromEPSG, toEPSG)) };
}

let nextSourceKey = 0;

/**
 * Importa un shapefile a partir de sus archivos individuales
 * (.shp obligatorio; .dbf/.prj/.cpg opcionales — .shx se ignora, shpjs no
 * lo necesita para parsear correctamente) y lo devuelve como una GisLayer
 * lista para agregar a la lista de capas, con la geometría ya reproyectada
 * a `targetEPSG` si había un .prj.
 *
 * `existingLayerCount` decide el color por defecto y el `order` inicial
 * de la capa nueva (al final de la lista — mismo criterio que agregar
 * una fila más abajo del resto).
 */
export async function importShapefile(
  files: File[],
  targetEPSG: string,
  existingLayerCount: number,
): Promise<ShapefileImportResult> {
  const shpFile = files.find((f) => extOf(f) === 'shp');
  if (!shpFile) {
    throw new Error('importShapefile: no se encontró ningún archivo .shp entre los archivos seleccionados.');
  }
  const dbfFile = files.find((f) => extOf(f) === 'dbf');
  const prjFile = files.find((f) => extOf(f) === 'prj');
  const cpgFile = files.find((f) => extOf(f) === 'cpg');

  const shpBuffer = await shpFile.arrayBuffer();
  const dbfBuffer = dbfFile ? await dbfFile.arrayBuffer() : undefined;
  const cpgBuffer = cpgFile ? await cpgFile.arrayBuffer() : undefined;

  // @types/shpjs (DefinitelyTyped) todavía no declara el overload de
  // objeto {shp, dbf, cpg} — ver README real de shpjs, sección 3. Cast
  // puntual acá, verificado a mano contra el paquete instalado, no una
  // redeclaración global del módulo.
  const rawGeojson = await (shp as unknown as (input: {
    shp: ArrayBuffer;
    dbf?: ArrayBuffer;
    cpg?: ArrayBuffer;
  }) => Promise<FeatureCollection>)({ shp: shpBuffer, dbf: dbfBuffer, cpg: cpgBuffer });

  let geojson = rawGeojson;
  let warning: string | null = null;

  if (prjFile) {
    const prjText = await prjFile.text();
    const sourceKey = `__shp_source_${nextSourceKey++}__`;
    try {
      registerProjection(sourceKey, prjText);
    } catch (err) {
      throw new Error(
        `importShapefile: no se pudo interpretar el archivo .prj ("${prjFile.name}"): `
        + `${err instanceof Error ? err.message : String(err)}`,
      );
    }
    geojson = reprojectFeatureCollection(rawGeojson, sourceKey, targetEPSG);
  } else {
    warning =
      `"${shpFile.name}" no incluye un archivo .prj — se asume que sus coordenadas ya están `
      + `en la proyección del proyecto (${targetEPSG}). Si el shapefile viene en otra proyección, `
      + 'la capa va a quedar mal ubicada.';
  }

  const layer: GisLayer = {
    id: `shp-${baseNameOf(shpFile)}-${Date.now()}`,
    name: baseNameOf(shpFile),
    type: 'vector',
    visible: true,
    order: existingLayerCount,
    symbology: { mode: 'flat', flatColor: pickDefaultLayerColor(existingLayerCount) },
    data: geojson,
  };

  return { layer, warning };
}
