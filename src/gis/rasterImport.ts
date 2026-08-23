/**
 * src/gis/rasterImport.ts
 * Importa capas ráster georreferenciadas — GeoTIFF (.tif/.tiff) o imagen +
 * world file (.jpg+.jgw, .png+.pgw, etc.) — como una GisLayer nueva.
 * Reproyección vía reprojection.ts (Etapa 5), mismo patrón de control
 * explícito que shapefileImport.ts (Etapa 6): NUNCA se deja que la
 * librería de turno reproyecte por su cuenta.
 *
 * ── geotiff.js: investigación previa a integrar (pedida explícitamente) ──
 * Se revisó el código fuente real (node_modules/geotiff/src/), no solo la
 * documentación:
 *   - `package.json` no depende de proj4 ni de ninguna librería de
 *     reproyección — sus dependencias son todas de decodificación
 *     (lerc, pako, zstddec, parse-headers, xml-utils). geotiff.js NO
 *     reproyecta nada por su cuenta, a diferencia de shpjs.
 *   - `getOrigin()`/`getResolution()`/`getBoundingBox()`
 *     (geotiffimage.js) solo leen las etiquetas de georreferenciación
 *     crudas (ModelTiepoint/ModelPixelScale/ModelTransformation) y hacen
 *     aritmética de transformación afín en el CRS nativo del archivo —
 *     nunca lo transforman a otro CRS.
 *   - `parseGeoKeyDirectory()` (imagefiledirectory.js) devuelve `null` si
 *     no hay geo keys, y tira un Error explícito si una key referenciada
 *     no se puede leer — sin fallback silencioso ni CRS inventado.
 * Conclusión: geotiff.js es más simple que shpjs en este aspecto — no
 * hay ningún comportamiento silencioso que evitar, porque no hay ninguna
 * reproyección interna de la que desconfiar. Igual se reproyecta acá con
 * reprojectCoordinates() y control explícito, tal como se pidió.
 *
 * ── Simplificación deliberada de la geometría del plano ─────────────
 * Un plano Three.js es, como mucho, un rectángulo (posición + ancho/alto
 * + una única rotación). Una reproyección de CRS general puede curvar un
 * rectángulo — no hay forma de representar eso exactamente con un plano
 * simple. Por eso, cuando SÍ hace falta reproyectar, se reproyectan las 4
 * esquinas reales del ráster y se ubica un rectángulo alineado a los ejes
 * que las contiene (AABB) — se pierde la rotación nativa en ese caso,
 * pero la posición/tamaño quedan correctos. Cuando NO hace falta
 * reproyectar (mismo EPSG, o sin CRS conocido — se asume ya correcto),
 * si el archivo trae rotación propia (world file con B/D ≠ 0) SÍ se
 * respeta exactamente, rotando el plano — no hace falta aproximar nada
 * porque no hay curvatura de por medio.
 */
import { fromArrayBuffer } from 'geotiff';
import type { GisLayer } from './gisTypes';
import { registerProjection, reprojectCoordinates, isProjectionRegistered } from './reprojection';
import type { AffineTransform } from './affineFit';
import { applyAffineTransform } from './affineFit';

/**
 * Ubicación como rectángulo (posición del centro + ancho/alto + una única
 * rotación) — todo lo que GeoTIFF/world file necesitan (nunca tienen
 * cizalla real, ver notas de cabecera). Usa `buildRasterMesh`'s camino
 * existente de PlaneGeometry+rotation.z, sin tocar (Etapa 7).
 */
export interface RectPlacement {
  kind: 'rect';
  centerEast: number;
  centerNorth: number;
  width: number;
  height: number;
  rotationRad: number;
}

/**
 * Ubicación como cuadrilátero general (paralelogramo) — para cuando la
 * transformación puede tener cizalla/escala no uniforme por eje (Etapa 8,
 * georreferenciación manual con 3+ puntos de control) y un
 * rectángulo+rotación no alcanza para representarla. `bottomRight` no se
 * guarda — se deriva como topRight + bottomLeft − topLeft (válido porque
 * una transformación afín de un rectángulo SIEMPRE da un paralelogramo).
 */
export interface QuadPlacement {
  kind: 'quad';
  topLeft: [number, number];
  topRight: [number, number];
  bottomLeft: [number, number];
}

/**
 * Forma de `GisLayer.data` para capas ráster — píxeles ya decodificados a
 * RGBA (fila 0 = borde superior/norte de la imagen original) y la
 * ubicación real en `projectionEPSG` del proyecto (ya reproyectada si
 * hacía falta).
 */
export interface RasterLayerData {
  pixels: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  placement: RectPlacement | QuadPlacement;
}

export interface RasterImportResult {
  layer: GisLayer;
  warning: string | null;
}

function extOf(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot === -1 ? '' : file.name.slice(dot + 1).toLowerCase();
}

function baseNameOf(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot === -1 ? file.name : file.name.slice(0, dot);
}

let nextSourceKey = 0;
let nextLayerId = 0;

// ─────────────────────────────────────────────────────────────────
// DECODIFICACIÓN DE PÍXELES A RGBA
// ─────────────────────────────────────────────────────────────────

/** Normaliza cualquier TypedArray de un banda a 0-255 por estiramiento lineal min/max (contraste automático) — 8-bit ya viene en rango, se usa directo. */
function normalizeBandTo255(band: ArrayLike<number>): Uint8Array {
  if (band instanceof Uint8Array || band instanceof Uint8ClampedArray) {
    return Uint8Array.from(band);
  }
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < band.length; i++) {
    const v = band[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const out = new Uint8Array(band.length);
  for (let i = 0; i < band.length; i++) {
    out[i] = Math.round(((band[i] - min) / range) * 255);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────
// LÍMITES DE DIMENSIONES (defensa contra archivos diseñados / DoS)
// ─────────────────────────────────────────────────────────────────
// Un ráster asigna memoria proporcional a width*height (RGBA = ×4 bytes).
// Un archivo puede DECLARAR dimensiones absurdas (p.ej. 100000×100000 =
// 10^10 px = 40 GB) siendo el archivo en sí pequeño → agotaría la memoria
// y colgaría la app ANTES de que cualquier try/catch pueda reaccionar. Se
// valida ANTES de leer/asignar los píxeles y se rechaza con mensaje claro.
// Son topes de guardia (no límites funcionales); un ráster legítimo queda
// muy por debajo. Si el piloto necesita rásters mayores, subir estos valores.
const MAX_RASTER_SIDE = 32767;          // límite práctico de <canvas>/textura WebGL por lado
const MAX_RASTER_PIXELS = 100_000_000;  // 100 megapíxeles (~400 MB en RGBA)

/**
 * Rechaza dimensiones de ráster fuera de rango ANTES de cualquier asignación
 * de memoria proporcional a ellas. Exportada para reusarla en todo punto de
 * entrada que decodifique un ráster a partir de dimensiones leídas del archivo
 * (GeoTIFF, imagen+world file, imagen de georreferenciación).
 */
export function assertRasterDimensionsWithinLimit(width: number, height: number, sourceLabel: string): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`${sourceLabel}: el archivo declara dimensiones de ráster inválidas (${width}×${height}).`);
  }
  if (width > MAX_RASTER_SIDE || height > MAX_RASTER_SIDE) {
    throw new Error(
      `${sourceLabel}: el archivo declara un ráster de ${width}×${height} px, que excede el máximo por lado `
      + `(${MAX_RASTER_SIDE}). Se rechaza para no agotar la memoria; si es un archivo real, recórtalo o reduce su resolución antes de importarlo.`,
    );
  }
  if (width * height > MAX_RASTER_PIXELS) {
    throw new Error(
      `${sourceLabel}: el archivo declara un ráster de ${width}×${height} = ${Math.round((width * height) / 1e6)} megapíxeles, `
      + `que excede el máximo de ${MAX_RASTER_PIXELS / 1e6} MP. Se rechaza para no agotar la memoria.`,
    );
  }
}

async function decodeGeoTIFFToRGBA(
  buffer: ArrayBuffer,
): Promise<{ pixels: Uint8Array; width: number; height: number }> {
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  // ANTES de readRasters() (que ya asigna memoria ∝ width*height) y de la
  // asignación de `pixels` más abajo: un GeoTIFF puede declarar dimensiones
  // enormes en su cabecera siendo un archivo diminuto.
  assertRasterDimensionsWithinLimit(width, height, 'importGeoTIFF');
  const samplesPerPixel = image.getSamplesPerPixel();

  const raster = await image.readRasters({ interleave: false });
  const bands = Array.isArray(raster) ? raster : [raster];

  if (samplesPerPixel !== 1 && samplesPerPixel < 3) {
    throw new Error(`importGeoTIFF: no se sabe interpretar un GeoTIFF con ${samplesPerPixel} banda(s) (soportado: 1, 3 o 4).`);
  }

  const r = normalizeBandTo255(bands[0]);
  const g = samplesPerPixel === 1 ? r : normalizeBandTo255(bands[1]);
  const b = samplesPerPixel === 1 ? r : normalizeBandTo255(bands[2]);
  const a = samplesPerPixel >= 4 ? normalizeBandTo255(bands[3]) : null;

  const pixelCount = width * height;
  const pixels = new Uint8Array(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    pixels[i * 4] = r[i];
    pixels[i * 4 + 1] = g[i];
    pixels[i * 4 + 2] = b[i];
    pixels[i * 4 + 3] = a ? a[i] : 255;
  }

  return { pixels, width, height };
}

/**
 * Exportada: GeoreferencingTool.tsx (Etapa 8) la reusa para imágenes
 * planas (jpg/png) sin world file. Tipo de parámetro `Blob`, no `File`
 * (Etapa 4, ubicación espacial de gráficos): un `File` ES un `Blob`, así
 * que ampliar el tipo no rompe ningún llamador existente — hidrogeoChartIntegration.ts
 * necesita decodificar el PNG en memoria que llega por postMessage
 * (`PublishedChartData.blob`), que es un `Blob` sin nombre de archivo,
 * no un `File`.
 */
export async function decodeImageFileToRGBA(
  file: Blob,
): Promise<{ pixels: Uint8Array; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  // Capturados ANTES de bitmap.close(): close() invalida el ImageBitmap
  // (sus getters width/height devuelven 0 después) — bug real encontrado
  // al testear, no hipotético: leerlos en el return de más abajo (después
  // de close()) daba silenciosamente 0x0, colapsando toda la ubicación
  // del ráster a un solo punto sin ningún error visible.
  const width = bitmap.width;
  const height = bitmap.height;
  // ANTES de asignar el canvas y el getImageData (memoria ∝ width*height):
  // una imagen puede declarar dimensiones enormes con un archivo pequeño.
  try {
    assertRasterDimensionsWithinLimit(width, height, 'importWorldFileImage');
  } catch (err) {
    bitmap.close();
    throw err;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('importWorldFileImage: no se pudo obtener un contexto 2D de canvas para decodificar la imagen.');
  }
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  bitmap.close();
  return { pixels: new Uint8Array(imageData.data.buffer.slice(0)), width, height };
}

// ─────────────────────────────────────────────────────────────────
// UBICACIÓN GEOGRÁFICA
// ─────────────────────────────────────────────────────────────────

type Corner = [number, number];

/** AABB de 4 puntos — usado tanto para el caso "reproyectado" (curvatura posible) como de referencia. */
function boundingBoxOf(corners: Corner[]): [number, number, number, number] {
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** GeoTIFF/world file nunca tienen cizalla real (ver notas de cabecera) — Placement es siempre un RectPlacement acá. */
type Placement = RectPlacement;

function placementFromAABB(corners: Corner[]): Placement {
  const [minX, minY, maxX, maxY] = boundingBoxOf(corners);
  return {
    kind: 'rect',
    centerEast: (minX + maxX) / 2,
    centerNorth: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
    rotationRad: 0,
  };
}

/**
 * Reproyecta `corners` si `sourceEPSG` está definido y difiere de
 * `targetEPSG` (registrándolo primero con `proj4Definition`), y devuelve
 * el AABB resultante como Placement (sin rotación — ver nota de cabecera
 * sobre por qué una reproyección general no puede preservar una
 * rotación exacta con un plano simple). Si no hace falta reproyectar,
 * devuelve `null` para que el caller pueda, si quiere, preservar una
 * rotación nativa exacta en vez de perderla innecesariamente.
 */
function reprojectCornersIfNeeded(
  corners: Corner[],
  sourceEPSG: string | null,
  targetEPSG: string,
): { placement: Placement | null; warning: string | null } {
  if (!sourceEPSG) {
    return {
      placement: null,
      warning:
        'No se pudo determinar la proyección de origen — se asume que las coordenadas ya están '
        + `en la proyección del proyecto (${targetEPSG}). Si el ráster viene en otra proyección, `
        + 'la capa va a quedar mal ubicada.',
    };
  }
  if (sourceEPSG === targetEPSG) {
    return { placement: null, warning: null };
  }
  if (!isProjectionRegistered(sourceEPSG)) {
    throw new Error(
      `El ráster viene en "${sourceEPSG}", que no tiene una definición proj4 registrada. `
      + `Usa registerProjection("${sourceEPSG}", "<definición proj4>") antes de importar.`,
    );
  }
  const reprojected = reprojectCoordinates(corners, sourceEPSG, targetEPSG);
  return { placement: placementFromAABB(reprojected), warning: null };
}

// ─────────────────────────────────────────────────────────────────
// CAPA RESULTANTE
// ─────────────────────────────────────────────────────────────────

/**
 * Exportada (Etapa 4, ubicación espacial de gráficos): hidrogeoChartIntegration.ts
 * la reusa para armar `RasterLayerData` directo, sin pasar por
 * `buildRasterLayer` (que fuerza `type:'raster'` e id aleatorio — la capa
 * de gráfico publicado necesita `type:'integrated-hidrogeo-chart'` y un
 * id predecible por diagrama, así que arma su propia GisLayer por fuera,
 * mismo criterio que hidrogeoIntegration.ts/collarsIntegration.ts).
 */
export function buildRasterLayerData(
  pixels: Uint8Array,
  pixelWidth: number,
  pixelHeight: number,
  placement: RectPlacement | QuadPlacement,
): RasterLayerData {
  return { pixels, pixelWidth, pixelHeight, placement };
}

function buildRasterLayer(
  name: string,
  pixels: Uint8Array,
  pixelWidth: number,
  pixelHeight: number,
  placement: RectPlacement | QuadPlacement,
  existingLayerCount: number,
): GisLayer {
  const data = buildRasterLayerData(pixels, pixelWidth, pixelHeight, placement);
  return {
    id: `raster-${name}-${Date.now()}-${nextLayerId++}`,
    name,
    type: 'raster',
    visible: true,
    order: existingLayerCount,
    // Los ráster no tienen simbología de color editable (ver
    // LayerTableOfContents.tsx, que oculta el selector para type:'raster')
    // — flatColor queda sin usar, solo está para cumplir el tipo.
    symbology: { mode: 'flat', flatColor: '#ffffff' },
    data,
  };
}

/**
 * Construye una GisLayer ráster georreferenciada MANUALMENTE (Etapa 8,
 * GeoreferencingTool.tsx) a partir de una transformación afín ya ajustada
 * (affineFit.ts) — sin reproyección de por medio (las coordenadas que
 * ingresó el usuario para cada punto de control YA están en la proyección
 * del proyecto, no hay un CRS de origen distinto que convertir).
 *
 * `transform` mapea PÍXEL (col,row, origen arriba-izquierda) → mundo real
 * — misma convención que WorldFileParams/AffineTransform. Las 3 esquinas
 * necesarias para el paralelogramo se obtienen aplicando `transform`
 * directo a las esquinas de píxel (0,0)/(pixelWidth,0)/(0,pixelHeight).
 */
export function buildGeoreferencedRasterLayer(
  name: string,
  pixels: Uint8Array,
  pixelWidth: number,
  pixelHeight: number,
  transform: AffineTransform,
  existingLayerCount: number,
): GisLayer {
  const placement: QuadPlacement = {
    kind: 'quad',
    topLeft: applyAffineTransform(transform, 0, 0),
    topRight: applyAffineTransform(transform, pixelWidth, 0),
    bottomLeft: applyAffineTransform(transform, 0, pixelHeight),
  };
  return buildRasterLayer(name, pixels, pixelWidth, pixelHeight, placement, existingLayerCount);
}

// ─────────────────────────────────────────────────────────────────
// GEOTIFF
// ─────────────────────────────────────────────────────────────────

/** GTModelTypeGeoKey: 1 = proyectado, 2 = geográfico (lat/lon). 32767 = "definido por el usuario" (sin EPSG estándar). */
function deriveEPSGFromGeoKeys(geoKeys: Record<string, unknown> | null): string | null {
  if (!geoKeys) return null;
  const projected = geoKeys.ProjectedCSTypeGeoKey;
  if (typeof projected === 'number' && projected > 0 && projected !== 32767) {
    return `EPSG:${projected}`;
  }
  const geographic = geoKeys.GeographicTypeGeoKey;
  if (typeof geographic === 'number' && geographic > 0 && geographic !== 32767) {
    return `EPSG:${geographic}`;
  }
  return null;
}

export async function importGeoTIFF(
  file: File,
  targetEPSG: string,
  existingLayerCount: number,
): Promise<RasterImportResult> {
  const buffer = await file.arrayBuffer();
  const { pixels, width, height } = await decodeGeoTIFFToRGBA(buffer);

  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const [minX, minY, maxX, maxY] = image.getBoundingBox();
  const corners: Corner[] = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];

  const sourceEPSG = deriveEPSGFromGeoKeys(image.getGeoKeys());
  const { placement: reprojected, warning } = reprojectCornersIfNeeded(corners, sourceEPSG, targetEPSG);
  const placement = reprojected ?? placementFromAABB(corners);

  const layer = buildRasterLayer(baseNameOf(file), pixels, width, height, placement, existingLayerCount);
  return { layer, warning };
}

// ─────────────────────────────────────────────────────────────────
// IMAGEN + WORLD FILE
// ─────────────────────────────────────────────────────────────────

interface WorldFileParams { A: number; D: number; B: number; E: number; C: number; F: number }

function parseWorldFile(text: string): WorldFileParams {
  const values = text.trim().split(/\r?\n/).map((line) => parseFloat(line.trim()));
  if (values.length < 6 || values.slice(0, 6).some((v) => Number.isNaN(v))) {
    throw new Error('importWorldFileImage: el world file no tiene el formato esperado (6 números, uno por línea).');
  }
  const [A, D, B, E, C, F] = values;
  return { A, D, B, E, C, F };
}

/** Esquinas reales del ráster (bordes de píxel, no centros — C,F es el centro del píxel (0,0)). */
function worldFileCorners(wf: WorldFileParams, pixelWidth: number, pixelHeight: number): Corner[] {
  const at = (col: number, row: number): Corner => [
    wf.A * col + wf.B * row + wf.C,
    wf.D * col + wf.E * row + wf.F,
  ];
  return [
    at(-0.5, -0.5),
    at(pixelWidth - 0.5, -0.5),
    at(pixelWidth - 0.5, pixelHeight - 0.5),
    at(-0.5, pixelHeight - 0.5),
  ];
}

/** Placement exacto (con rotación) a partir de las 4 esquinas del world file — sin reproyección. */
function placementFromWorldFileCorners(corners: Corner[]): Placement {
  const [topLeft, topRight, , bottomLeft] = corners;
  const widthVec: Corner = [topRight[0] - topLeft[0], topRight[1] - topLeft[1]];
  const heightVec: Corner = [bottomLeft[0] - topLeft[0], bottomLeft[1] - topLeft[1]];
  return {
    kind: 'rect',
    centerEast: topLeft[0] + widthVec[0] / 2 + heightVec[0] / 2,
    centerNorth: topLeft[1] + widthVec[1] / 2 + heightVec[1] / 2,
    width: Math.hypot(widthVec[0], widthVec[1]),
    height: Math.hypot(heightVec[0], heightVec[1]),
    rotationRad: Math.atan2(widthVec[1], widthVec[0]),
  };
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png'];
const WORLD_FILE_EXTENSIONS = ['jgw', 'jpgw', 'pgw', 'pngw', 'wld'];

export async function importWorldFileImage(
  files: File[],
  targetEPSG: string,
  existingLayerCount: number,
): Promise<RasterImportResult> {
  const imageFile = files.find((f) => IMAGE_EXTENSIONS.includes(extOf(f)));
  if (!imageFile) {
    throw new Error('importWorldFileImage: no se encontró ninguna imagen (.jpg/.jpeg/.png) entre los archivos seleccionados.');
  }
  const worldFile = files.find((f) => WORLD_FILE_EXTENSIONS.includes(extOf(f)));
  if (!worldFile) {
    throw new Error('importWorldFileImage: no se encontró el world file (.jgw/.pgw/.wld/...) entre los archivos seleccionados.');
  }
  const prjFile = files.find((f) => extOf(f) === 'prj');

  const { pixels, width, height } = await decodeImageFileToRGBA(imageFile);
  const wf = parseWorldFile(await worldFile.text());
  const corners = worldFileCorners(wf, width, height);

  let sourceEPSG: string | null = null;
  if (prjFile) {
    const prjText = await prjFile.text();
    sourceEPSG = `__raster_source_${nextSourceKey++}__`;
    try {
      registerProjection(sourceEPSG, prjText);
    } catch (err) {
      throw new Error(
        `importWorldFileImage: no se pudo interpretar el archivo .prj ("${prjFile.name}"): `
        + `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  let warning: string | null = null;
  let placement: Placement;
  if (!prjFile) {
    // Sin .prj: los world files nunca traen CRS propio — se asume que ya
    // está en la proyección del proyecto y se preserva la rotación nativa
    // exacta (no hace falta reproyectar, no hay curvatura que perder).
    placement = placementFromWorldFileCorners(corners);
    warning =
      `"${imageFile.name}" no incluye un archivo .prj — se asume que sus coordenadas ya están `
      + `en la proyección del proyecto (${targetEPSG}). Si la imagen viene en otra proyección, `
      + 'la capa va a quedar mal ubicada.';
  } else {
    const result = reprojectCornersIfNeeded(corners, sourceEPSG, targetEPSG);
    // sourceEPSG siempre está definido acá (se generó arriba), así que
    // result.placement nunca es null por "sin EPSG" — solo puede serlo
    // si sourceEPSG === targetEPSG (caso casi imposible con una key
    // sintética), en cuyo caso preservamos la rotación nativa igual.
    placement = result.placement ?? placementFromWorldFileCorners(corners);
    warning = result.warning;
  }

  const layer = buildRasterLayer(baseNameOf(imageFile), pixels, width, height, placement, existingLayerCount);
  return { layer, warning };
}
