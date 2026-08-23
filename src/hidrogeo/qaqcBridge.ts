/**
 * src/hidrogeo/qaqcBridge.ts
 * Lee la tabla "Datos hidrogeoquímicos" de QA/QC vía el par dedicado del
 * puente (PROJECT_GET_HYDRO_REQUEST/RESPONSE, projectBridge.ts) — mismo
 * mecanismo que Análisis Estructural usa para "Datos estructurales" (ver
 * src/estructural/qaqcBridge.ts) y que GIS usa para collars/surveys: un dato
 * normalizado que vive en la ventana raíz, NO el relevo genérico de estado
 * completo. Única fuente de datos del módulo desde la eliminación de la
 * importación directa por CSV/Excel.
 *
 * A diferencia de estructurales, NO se pide una lista de archivos: el módulo
 * combina TODAS las filas de TODOS los archivos de ese tipo (sin selector),
 * distinguibles por los filtros pozo/campaña ya existentes.
 */

import { requestHydroFromParent } from '../projectBridge';
import type { QaqcHydroPoint } from '../projectBridge';
import type { WaterSample } from './hydroTypes';

/**
 * Convierte una muestra ya normalizada de QA/QC a WaterSample. Los 7 iones
 * mayores viajan directo (QA/QC ya garantizó que son numéricos — son el
 * mínimo para que la fila exista). `CO3` cae a 0 si no vino (químicamente
 * estándar en aguas con pH < 8.3, ver JSDoc de WaterSample.CO3). El resto de
 * los campos opcionales solo se setean si trajeron dato, para que los
 * diagramas que dependen de ellos (Eh-pH: pH+Eh; Cl vs EC: EC) omitan
 * correctamente las muestras que no los tienen, en vez de graficar un 0 falso.
 */
export function mapQaqcHydroToWaterSample(p: QaqcHydroPoint): WaterSample {
  const sample: WaterSample = {
    id: `qaqc-${p.id}`,
    name: p.name,
    Ca: p.Ca, Mg: p.Mg, Na: p.Na, K: p.K,
    Cl: p.Cl, SO4: p.SO4, HCO3: p.HCO3,
    CO3: p.CO3 ?? 0,
  };
  if (p.campaign !== null) sample.campaign = p.campaign;
  if (p.samplingDate !== null) sample.samplingDate = p.samplingDate;
  if (p.lat !== null && p.lon !== null) sample.coordinates = { lat: p.lat, lon: p.lon };
  if (p.NO3 !== null) sample.NO3 = p.NO3;
  if (p.pH !== null) sample.pH = p.pH;
  if (p.TDS !== null) sample.TDS = p.TDS;
  if (p.EC !== null) sample.EC = p.EC;
  if (p.temperature !== null) sample.temperature = p.temperature;
  if (p.Eh !== null) sample.Eh = p.Eh;
  if (p.elevation !== null) sample.elevation = p.elevation;
  if (p.salinity !== null) sample.salinity = p.salinity;
  if (p.density !== null) sample.density = p.density;
  if (p.cationsTotal !== null) sample.cationsTotal = p.cationsTotal;
  if (p.anionsTotal !== null) sample.anionsTotal = p.anionsTotal;
  // Repetibles: solo se adjuntan si trajeron alguna columna (objeto no vacío),
  // para no ensuciar la muestra con `{}` cuando no se mapeó ningún Elemento/Otro.
  if (p.elements && Object.keys(p.elements).length > 0) sample.elements = p.elements;
  if (p.otros && Object.keys(p.otros).length > 0) sample.otros = p.otros;
  return sample;
}

/**
 * Pide las muestras a la ventana raíz (QA/QC) y las devuelve ya convertidas
 * a WaterSample[], combinando TODOS los archivos "Datos hidrogeoquímicos".
 * Única fuente de datos del módulo.
 */
export async function fetchQaqcHydroDataset(timeoutMs?: number): Promise<WaterSample[]> {
  const hydro = await requestHydroFromParent(timeoutMs);
  return hydro.map(mapQaqcHydroToWaterSample);
}
