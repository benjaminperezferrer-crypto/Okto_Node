/**
 * src/gis/collarsIntegration.ts
 * Construye la GisLayer 'integrated-collars' (gisTypes.ts) a partir de los
 * QaqcCollarPoint que devuelve requestCollarsFromParent() (projectBridge.ts,
 * Etapa 9) — separado de gisLayerRender.ts porque acá se arma el objeto
 * GisLayer (id fijo, symbology, order); la geometría 3D de esta capa sigue
 * viviendo en gisLayerRender.ts, junto al resto de los builders de mesh
 * (buildCollarLayerMesh).
 *
 * CRS (decisión explícita, ver el JSDoc de QaqcCollarPoint en
 * projectBridge.ts): Este/Norte/Cota de un collar de QA/QC se asumen YA en
 * el EPSG del proyecto GIS. QA/QC no guarda ningún CRS de origen para estos
 * números (a diferencia de un shapefile con .prj o un GeoTIFF con tags
 * embebidos) — no hay desde qué reproyectar, así que a propósito NO se
 * llama reprojectCoordinates() en ningún punto de este archivo.
 */
import { pickDefaultLayerColor } from './shapefileImport';
import type { GisLayer } from './gisTypes';
import type { QaqcCollarPoint } from '../projectBridge';

/**
 * Id fijo de la capa automática de collars — a diferencia de una capa
 * importada (id generado con crypto.randomUUID, ver shapefileImport.ts/
 * rasterImport.ts), esta capa se reconstruye entera cada vez que GIS monta
 * y pide datos a QA/QC, así que necesita un id ESTABLE para poder
 * reemplazarla en `layers` sin duplicarla ni perder su identidad.
 */
export const COLLARS_LAYER_ID = 'integrated-collars';

/** Un collar ya en la forma que consume buildCollarLayerMesh (gisLayerRender.ts). */
export interface CollarPoint {
  dhid: string;
  east: number;
  north: number;
  /** null si el collar no traía Cota mapeada/con valor — se drapea a defaultElevation, igual que GeoJSON sin Z. */
  elevation: number | null;
  sourceFileId: number;
  sourceFileName: string;
}

export interface CollarLayerData {
  points: CollarPoint[];
}

/**
 * Arma la GisLayer 'integrated-collars' a partir de los collars ya
 * normalizados que devuelve QA/QC vía el puente. `existingLayerCount` sigue
 * el mismo criterio que shapefileImport.ts/rasterImport.ts para el color
 * por defecto (paleta rotada) y el `order` inicial — aunque a diferencia de
 * esas capas, esta no la trae el usuario: se genera sola al montar GIS.
 */
export function buildCollarsLayer(collars: QaqcCollarPoint[], existingLayerCount: number): GisLayer {
  const data: CollarLayerData = {
    points: collars.map((c) => ({
      dhid: c.dhid,
      east: c.este,
      north: c.norte,
      elevation: c.cota,
      sourceFileId: c.sourceFileId,
      sourceFileName: c.sourceFileName,
    })),
  };

  return {
    id: COLLARS_LAYER_ID,
    name: 'Collars (QA/QC)',
    type: 'integrated-collars',
    visible: true,
    order: existingLayerCount,
    symbology: { mode: 'flat', flatColor: pickDefaultLayerColor(existingLayerCount) },
    data,
  };
}
