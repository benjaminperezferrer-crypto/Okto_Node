/**
 * src/estructural/qaqcBridge.ts
 * Etapa 12 — lee la tabla "Estructuras" de QA/QC vía el par dedicado del
 * puente (PROJECT_GET_STRUCTURES_REQUEST/RESPONSE, projectBridge.ts),
 * mismo mecanismo que GIS ya usa para collars/surveys — NO el relevo
 * genérico de estado completo (PROJECT_RELAY_STATE), que es solo para
 * el estado de OTRO módulo en iframe hermano (Columnas/Hidrogeoquímica);
 * las estructuras de QA/QC son un dato normalizado que vive en la
 * ventana raíz, igual que collars/surveys — ver JSDoc completo de la
 * decisión en projectBridge.ts, junto a PROJECT_GET_STRUCTURES_REQUEST.
 *
 * `mapQaqcStructureToPlanarMeasurement()` convierte cada QaqcStructurePoint
 * a PlanarMeasurement — mismos nombres de campo, conversión casi directa.
 * `zona`/`campaña` quedan SIEMPRE `undefined` (nunca inventados): son
 * campos propios del módulo, ausentes en QA/QC — con eso, getFieldValue()
 * de classification.ts (Etapa 9) los clasifica automáticamente en el
 * bucket "(sin dato)" ya existente, sin ningún cambio ahí.
 */

import { requestStructuresFromParent } from '../projectBridge';
import type { QaqcStructurePoint, QaqcStructuralFileRef } from '../projectBridge';
import type { PlanarMeasurement } from './structuralTypes';

/**
 * Convierte una fila de QA/QC ya normalizada a PlanarMeasurement. `id` se
 * prefija con `qaqc-` — prefijo heredado de cuando había que evitar
 * choques con los ids de datos importados directo por CSV (ya eliminado,
 * ver JSDoc de AnalisisEstructuralModule.tsx); se mantiene igual porque
 * sigue siendo una forma válida de namespacing y varios `id` de React
 * (`key` de filas/marcadores) ya dependen de este prefijo exacto.
 */
export function mapQaqcStructureToPlanarMeasurement(s: QaqcStructurePoint): PlanarMeasurement {
  const measurement: PlanarMeasurement = {
    id: `qaqc-${s.id}`,
    sourceFileId: s.sourceFileId,
    sourceFileName: s.sourceFileName,
    tipo: s.tipo,
    azimut: s.azimut,
    dip: s.dip,
  };
  if (s.este !== null) measurement.este = s.este;
  if (s.norte !== null) measurement.norte = s.norte;
  if (s.cota !== null) measurement.cota = s.cota;
  if (s.cinemática !== null) measurement.cinemática = s.cinemática;
  if (s.rake !== null) measurement.rake = s.rake;
  if (s.direccionRake !== null) measurement.direccionRake = s.direccionRake;
  if (s.observaciones !== null) measurement.observaciones = s.observaciones;
  if (Object.keys(s.otros).length > 0) measurement.otros = s.otros;
  // zona/campaña deliberadamente NO seteados — ver JSDoc de archivo.
  return measurement;
}

/** Resultado completo de fetchQaqcStructuralDataset() — ver JSDoc de esa función. */
export interface QaqcStructuralDataset {
  measurements: PlanarMeasurement[];
  /**
   * TODOS los archivos QA/QC de dbType 'Datos estructurales' — incluye
   * archivos con 0 mediciones utilizables (todas sus filas fallaron el
   * mapeo mínimo). Selector de archivo del módulo (Etapa 2 del rediseño a
   * pestañas): `measurements` derivado por archivo (agrupando por
   * `sourceFileId`) es la lista de archivos REALMENTE seleccionables;
   * comparar esa lista contra `allStructuralFiles` es lo que permite
   * avisar "este archivo existe en QA/QC pero no tiene ninguna medición
   * usable" en vez de que desaparezca sin explicación.
   */
  allStructuralFiles: QaqcStructuralFileRef[];
}

/**
 * Pide las estructuras a la ventana raíz (QA/QC) y las devuelve ya
 * convertidas a PlanarMeasurement[], junto con la lista completa de
 * archivos de estructuras (ver QaqcStructuralDataset) — única fuente de
 * datos del módulo desde la eliminación de la importación directa por
 * CSV/Excel.
 */
export async function fetchQaqcStructuralDataset(timeoutMs?: number): Promise<QaqcStructuralDataset> {
  const { structures, structuralFileIds } = await requestStructuresFromParent(timeoutMs);
  return {
    measurements: structures.map(mapQaqcStructureToPlanarMeasurement),
    allStructuralFiles: structuralFileIds,
  };
}
