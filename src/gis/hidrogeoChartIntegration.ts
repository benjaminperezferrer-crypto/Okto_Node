/**
 * src/gis/hidrogeoChartIntegration.ts
 * Construye las capas de GIS que vienen de gráficos publicados desde
 * Hidrogeoquímica — dos formas distintas, ambas relevadas por el MISMO
 * protocolo dedicado (requestModuleChartsFromParent, Etapa 4,
 * projectBridge.ts), separado del relevo de ProjectState que ya usa
 * hidrogeoIntegration.ts: los PNG publicados no viven en
 * HidrogeoquimicaProjectState, se rasterizan a pedido sin caché (Etapa 3).
 *
 *   1. buildHidrogeoChartLayers (Etapa 4) — los 5 diagramas combinados con
 *      ubicación MANUAL (`location.kind === 'projected'`, Etapa 2): una
 *      GisLayer 'integrated-hidrogeo-chart-<diagramId>' POR diagrama
 *      publicado (como mucho 5 capas).
 *   2. buildHidrogeoStiffLayer (Etapa 5) — las tarjetas de Stiff, con
 *      ubicación AUTOMÁTICA (`location.kind === 'geographic'`: lat/lon
 *      crudo de la muestra, igual que 'integrated-hidrogeo'): UNA sola
 *      GisLayer 'integrated-hidrogeo-stiff' con VARIOS ráster adentro
 *      (uno por muestra con coordenadas) — no una capa por muestra, para
 *      no saturar la tabla de contenidos con una fila por cada pozo/
 *      campaña del proyecto (podrían ser docenas). Acá SÍ hace falta
 *      reproyectar (reprojectCoordinates, mismo pipeline exacto que
 *      hidrogeoIntegration.ts) — Hidrogeoquímica manda lat/lon crudo a
 *      propósito (ver PublishedChartLocation en projectBridge.ts).
 *
 * Ambos casos reusan `RectPlacement`/`buildRasterLayerData` de
 * rasterImport.ts (mismo `RasterLayerData` que GeoTIFF/world file), así
 * que gisLayerRender.ts los dibuja con el mismo texturizado de plano
 * (buildRasterMesh/buildHidrogeoStiffLayerMesh) — free zoom-rescaling
 * porque es geometría 3D real, no un overlay 2D aparte.
 *
 * Tamaños por defecto:
 *   - CHART_RASTER_WIDTH_UNITS = 100 (diagramas combinados, Etapa 4): con
 *     el alto derivado del aspect ratio real en píxeles de cada diagrama
 *     para que no salga estirado. Fracción moderada del ancho/alto por
 *     defecto de la caja del proyecto (DEFAULT_EXTENT en GisViewport.tsx:
 *     500×300) — visible sin dominar toda la escena.
 *   - STIFF_RASTER_WIDTH_UNITS = 30 (tarjetas de Stiff, Etapa 5): bastante
 *     más chico que los diagramas combinados a propósito — puede haber
 *     UNA tarjeta por cada muestra del proyecto (potencialmente docenas,
 *     no como mucho 5), pensada como un marcador visual compacto junto al
 *     punto real de la muestra (HIDROGEO_MARKER_RADIUS en
 *     gisLayerRender.ts es 9 unidades — 30 la deja claramente más grande
 *     que el punto, sin taparlo todo).
 * Ninguno de los dos es configurable por el usuario todavía — mismo
 * alcance que "tamaño por defecto razonable" pedido en la Etapa 4/5.
 */
import { buildRasterLayerData, decodeImageFileToRGBA } from './rasterImport';
import type { RectPlacement } from './rasterImport';
import { reprojectCoordinates } from './reprojection';
import type { GisLayer } from './gisTypes';
import type { PublishedChartData } from '../projectBridge';

/** Ancho fijo del ráster de un diagrama combinado publicado, en unidades de proyecto — ver justificación de archivo. */
export const CHART_RASTER_WIDTH_UNITS = 100;
/** Ancho fijo del ráster de UNA tarjeta de Stiff publicada, en unidades de proyecto — ver justificación de archivo. */
export const STIFF_RASTER_WIDTH_UNITS = 30;

export const HIDROGEO_STIFF_LAYER_ID = 'integrated-hidrogeo-stiff';

export function hidrogeoChartLayerId(diagramId: string): string {
  return `integrated-hidrogeo-chart-${diagramId}`;
}

export function isHidrogeoChartLayerId(id: string): boolean {
  return id.startsWith('integrated-hidrogeo-chart-');
}

/** UN ráster ya decodificado dentro de la capa 'integrated-hidrogeo-stiff' — una tarjeta de Stiff, una muestra. */
export interface HidrogeoStiffCardItem {
  sampleId: string;
  sampleName: string;
  pixels: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  placement: RectPlacement;
}

/** Forma de `GisLayer.data` para 'integrated-hidrogeo-stiff' (Etapa 5) — ver JSDoc de archivo. */
export interface HidrogeoStiffLayerData {
  items: HidrogeoStiffCardItem[];
}

function buildRectPlacement(centerEast: number, centerNorth: number, widthUnits: number, pixelWidth: number, pixelHeight: number): RectPlacement {
  return {
    kind: 'rect',
    centerEast,
    centerNorth,
    width: widthUnits,
    height: widthUnits * (pixelHeight / pixelWidth),
    rotationRad: 0,
  };
}

/**
 * `charts` es lo que devuelve requestModuleChartsFromParent('hidro-frame')
 * — `null`/`[]` (Hidrogeoquímica nunca se lanzó, o no tiene nada
 * publicado) produce `[]`, no un error: mismo criterio que
 * buildHidrogeoLayer con `state: null`. Solo procesa entradas
 * `location.kind === 'projected'` (los 5 diagramas combinados) — las
 * entradas `'geographic'` (tarjetas de Stiff) las procesa
 * buildHidrogeoStiffLayer, no esta función. `existingLayerCount` es el
 * `order` inicial de la primera capa nueva (las siguientes se numeran
 * consecutivas) — igual convención que el resto de las capas
 * 'integrated-*'.
 */
export async function buildHidrogeoChartLayers(
  charts: PublishedChartData[] | null,
  existingLayerCount: number,
): Promise<GisLayer[]> {
  const layers: GisLayer[] = [];
  for (const chart of charts ?? []) {
    if (chart.location.kind !== 'projected') continue;
    const { pixels, width, height } = await decodeImageFileToRGBA(chart.blob);
    const placement = buildRectPlacement(chart.location.east, chart.location.north, CHART_RASTER_WIDTH_UNITS, width, height);
    const data = buildRasterLayerData(pixels, width, height, placement);
    layers.push({
      id: hidrogeoChartLayerId(chart.diagramId),
      name: `${chart.label} (Hidrogeoquímica)`,
      type: 'integrated-hidrogeo-chart',
      visible: true,
      order: existingLayerCount + layers.length,
      // Ráster de solo visualización — mismo criterio que rasterImport.ts (LayerTableOfContents.tsx oculta el selector de color).
      symbology: { mode: 'flat', flatColor: '#ffffff' },
      data,
    });
  }
  return layers;
}

/**
 * Arma la ÚNICA GisLayer 'integrated-hidrogeo-stiff' a partir de las
 * entradas `location.kind === 'geographic'` de `charts` (tarjetas de
 * Stiff, Etapa 5) — reproyecta cada lat/lon a `targetEPSG` con
 * reprojectCoordinates(), MISMO pipeline exacto que
 * hidrogeoIntegration.ts usa para 'integrated-hidrogeo' (control
 * explícito, nunca asumir que ya viene en el EPSG del proyecto).
 * `charts === null` o sin entradas geográficas produce una capa con
 * `items: []` — capa válida sin tarjetas, no un error (mismo criterio
 * que buildHidrogeoLayer con `state: null`).
 */
export async function buildHidrogeoStiffLayer(
  charts: PublishedChartData[] | null,
  targetEPSG: string,
  order: number,
): Promise<GisLayer> {
  const items: HidrogeoStiffCardItem[] = [];
  for (const chart of charts ?? []) {
    if (chart.location.kind !== 'geographic') continue;
    const { pixels, width, height } = await decodeImageFileToRGBA(chart.blob);
    const [centerEast, centerNorth] = reprojectCoordinates(
      [[chart.location.lon, chart.location.lat]],
      'EPSG:4326',
      targetEPSG,
    )[0];
    const placement = buildRectPlacement(centerEast, centerNorth, STIFF_RASTER_WIDTH_UNITS, width, height);
    items.push({
      // diagramId viene como `stiff-<sampleId>` (ver getPublishedCharts en HydrogeochemistryModule.tsx) — se recupera el sampleId real quitando ese prefijo.
      sampleId: chart.diagramId.replace(/^stiff-/, ''),
      sampleName: chart.label.replace(/^Stiff — /, ''),
      pixels, pixelWidth: width, pixelHeight: height, placement,
    });
  }

  const data: HidrogeoStiffLayerData = { items };

  return {
    id: HIDROGEO_STIFF_LAYER_ID,
    name: 'Tarjetas de Stiff (Hidrogeoquímica)',
    type: 'integrated-hidrogeo-stiff',
    visible: true,
    order,
    symbology: { mode: 'flat', flatColor: '#ffffff' },
    data,
  };
}
