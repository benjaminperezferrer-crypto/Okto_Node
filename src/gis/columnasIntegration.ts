/**
 * src/gis/columnasIntegration.ts
 * Construye la GisLayer 'integrated-columnas' (gisTypes.ts) a partir del
 * ColumnasProjectState que expone el módulo Columnas — relevado a través
 * de la raíz (Etapa 11, projectBridge.ts PROJECT_RELAY_STATE_REQUEST /
 * requestModuleStateFromParent), ya que GIS y Columnas corren en iframes
 * hermanos sin acceso directo entre sí.
 *
 * CRS: cada columna trae `metadata.location.coordinates` con Este/Norte
 * (proyectadas) Y/O lat/lon (WGS-84) — ambos opcionales (columnas/types.ts,
 * ColumnLocation). Prioridad: si trae Este/Norte, se usan directo — mismo
 * criterio que collars (Etapa 9): sin un CRS de origen fiable ahí (`datum`/
 * `zone` son texto libre, no un EPSG registrable), se asumen ya en el EPSG
 * del proyecto GIS. Si falta Este/Norte pero SÍ hay lat/lon, se reproyecta
 * desde EPSG:4326 (WGS-84 — ahí SÍ hay un CRS de origen real y conocido)
 * vía reprojectCoordinates(), con el mismo control explícito ya establecido
 * en shapefileImport.ts/rasterImport.ts. Sin ninguna de las dos, la columna
 * se omite — no hay dónde ubicarla, y no se inventa una posición.
 */
import { reprojectCoordinates } from './reprojection';
import type { GisLayer } from './gisTypes';
import type { ColumnasProjectState } from '../projectTypes';

export const COLUMNAS_LAYER_ID = 'integrated-columnas';

/**
 * Color fijo (no la paleta rotada de shapefileImport.ts) — mismo criterio
 * que drillholesIntegration.ts (Etapa 10): las capas automáticas deben
 * distinguirse SIEMPRE entre sí, no solo la mayoría de las veces según en
 * qué posición de la paleta rotada le toque caer a cada una.
 */
const DEFAULT_COLUMNAS_COLOR = '#33cc66';

export interface ColumnasMarkerPoint {
  id: string;
  name: string;
  east: number;
  north: number;
  /** null si la columna no trae `location.elevation` — se drapea a defaultElevation al renderizar. */
  elevation: number | null;
}

export interface ColumnasLayerData {
  points: ColumnasMarkerPoint[];
}

/**
 * Arma la GisLayer 'integrated-columnas'. `state` es `null` si Columnas
 * nunca se lanzó en la sesión (ver resolveGisRelayTargetFrame en
 * index.html) — produce una capa válida sin puntos, no un error.
 * `targetEPSG` es `extent.projectionEPSG` del proyecto GIS, necesario para
 * la rama de reproyección desde lat/lon.
 */
export function buildColumnasLayer(
  state: ColumnasProjectState | null,
  targetEPSG: string,
  existingLayerCount: number,
): GisLayer {
  const points: ColumnasMarkerPoint[] = [];

  for (const entry of state?.projects ?? []) {
    const column = entry.columnState.column;
    const coords = column.metadata.location?.coordinates;
    if (!coords) continue;

    let east: number;
    let north: number;
    if (coords.este != null && coords.norte != null) {
      east = coords.este;
      north = coords.norte;
    } else if (coords.lat != null && coords.lon != null) {
      [east, north] = reprojectCoordinates([[coords.lon, coords.lat]], 'EPSG:4326', targetEPSG)[0];
    } else {
      continue;
    }

    points.push({
      id: column.id,
      name: column.metadata.name || entry.name,
      east,
      north,
      elevation: column.metadata.location.elevation ?? null,
    });
  }

  const data: ColumnasLayerData = { points };

  return {
    id: COLUMNAS_LAYER_ID,
    name: 'Columnas estratigráficas',
    type: 'integrated-columnas',
    visible: true,
    order: existingLayerCount,
    symbology: { mode: 'flat', flatColor: DEFAULT_COLUMNAS_COLOR },
    data,
  };
}
