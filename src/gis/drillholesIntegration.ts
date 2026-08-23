/**
 * src/gis/drillholesIntegration.ts
 * Construye la GisLayer 'integrated-drillholes' (gisTypes.ts) a partir de
 * los QaqcCollarPoint (Etapa 9) y QaqcSurveyStation (Etapa 10) que expone
 * el puente (projectBridge.ts) — junta ambos por DHID y corre
 * minimumCurvature.ts para obtener la traza 3D real de cada sondaje.
 *
 * Archivo separado de collarsIntegration.ts (a propósito, ver pedido de la
 * Etapa 10): esta capa junta DOS fuentes de datos y corre un cálculo
 * geométrico real, mientras que collarsIntegration.ts solo remapea un
 * array — mezclarlos habría hecho un solo archivo con dos responsabilidades
 * bien distintas.
 *
 * CRS: igual que collarsIntegration.ts — Este/Norte/Cota del collar se
 * asumen ya en el EPSG del proyecto GIS, sin reproyección. Los datos de
 * Survey (profundidad/azimut/dip) no tienen CRS propio — son offsets
 * relativos al collar, no coordenadas absolutas.
 */
import { computeMinimumCurvatureTrace, type Point3D, type SurveyStation } from './minimumCurvature';
import type { GisLayer } from './gisTypes';
import type { QaqcCollarPoint, QaqcSurveyStation } from '../projectBridge';

export const DRILLHOLES_LAYER_ID = 'integrated-drillholes';

/**
 * Color fijo (no de la paleta rotada de shapefileImport.ts) — a diferencia
 * de una capa importada, esta y la de collars son las dos únicas capas
 * automáticas que coexisten siempre juntas, así que necesitan colores
 * SIEMPRE distintos entre sí, no solo "distintos la mayoría de las veces"
 * según en qué posición de la paleta rotada le toque caer a cada una.
 */
const DEFAULT_DRILLHOLE_COLOR = '#ff8800';

export interface DrillholeTrace {
  dhid: string;
  points: Point3D[];
}

export interface DrillholeLayerData {
  traces: DrillholeTrace[];
}

/**
 * Arma la GisLayer 'integrated-drillholes': para cada collar con al menos
 * una estación de Survey del mismo DHID, calcula su traza completa por
 * curvatura mínima. Collares sin estaciones NO producen traza (el punto
 * de collar de la Etapa 9 ya los representa) — no se inventa una traza
 * recta sin datos de desviación real.
 *
 * `defaultElevation` es el mismo valor "drape" que usa el resto del
 * módulo (extent.box.topElevation) para un collar con `cota: null` — el
 * cálculo de curvatura mínima necesita una elevación de partida concreta,
 * no puede diferir la decisión al momento de renderizar como hace
 * buildCollarLayerMesh.
 */
export function buildDrillholesLayer(
  collars: QaqcCollarPoint[],
  surveys: QaqcSurveyStation[],
  existingLayerCount: number,
  defaultElevation: number,
): GisLayer {
  const surveysByDhid = new Map<string, SurveyStation[]>();
  for (const s of surveys) {
    const list = surveysByDhid.get(s.dhid);
    const station: SurveyStation = { depth: s.depth, azimuthDeg: s.azimuthDeg, dipDeg: s.dipDeg };
    if (list) {
      list.push(station);
    } else {
      surveysByDhid.set(s.dhid, [station]);
    }
  }

  const traces: DrillholeTrace[] = [];
  for (const collar of collars) {
    const stations = surveysByDhid.get(collar.dhid);
    if (!stations || stations.length === 0) continue;

    const collarPoint: Point3D = { east: collar.este, north: collar.norte, elevation: collar.cota ?? defaultElevation };
    traces.push({ dhid: collar.dhid, points: computeMinimumCurvatureTrace(collarPoint, stations) });
  }

  const data: DrillholeLayerData = { traces };

  return {
    id: DRILLHOLES_LAYER_ID,
    name: 'Trazas de sondaje (QA/QC)',
    type: 'integrated-drillholes',
    visible: true,
    order: existingLayerCount,
    symbology: { mode: 'flat', flatColor: DEFAULT_DRILLHOLE_COLOR },
    data,
  };
}
