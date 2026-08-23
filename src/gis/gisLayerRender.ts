/**
 * src/gis/gisLayerRender.ts
 * Construcción de geometría 3D para una GisLayer (gisTypes.ts, Etapa 1).
 * Sin React, sin estado propio — misma separación que gisGrid.ts.
 *
 * Formas de `GisLayer.data` soportadas:
 *   - `SyntheticPointData` (Etapa 4) — puntos de prueba hardcodeados.
 *   - GeoJSON `FeatureCollection` (Etapa 6) — lo que produce
 *     shapefileImport.ts al importar un shapefile real. Soporta
 *     Point/MultiPoint, LineString/MultiLineString y Polygon/MultiPolygon
 *     — sin GeometryCollection (fuera del alcance: "puntos, líneas o
 *     polígonos").
 *   - `RasterLayerData` (Etapa 7/8, type:'raster') — ver rasterImport.ts.
 *   - `CollarLayerData` (Etapa 9, type:'integrated-collars') — ver
 *     collarsIntegration.ts.
 *   - `DrillholeLayerData` (Etapa 10, type:'integrated-drillholes') — ver
 *     drillholesIntegration.ts.
 *   - `ColumnasLayerData` (Etapa 11, type:'integrated-columnas') — ver
 *     columnasIntegration.ts.
 *
 * Misma convención de ejes que GisViewport.tsx/gisGrid.ts: X = Este,
 * Y = Norte, Z = Elevación (arriba). GeoJSON no trae Z — las geometrías
 * importadas se ubican todas a `defaultElevation` (ver buildLayerMesh),
 * como un "drape" sobre la caja del proyecto, no con elevación real.
 */
import * as THREE from 'three';
import type { Feature, FeatureCollection } from 'geojson';
import type { GisLayer } from './gisTypes';
import type { RasterLayerData } from './rasterImport';
import type { CollarLayerData } from './collarsIntegration';
import type { DrillholeLayerData } from './drillholesIntegration';
import type { ColumnasLayerData } from './columnasIntegration';
import type { HidrogeoStiffLayerData } from './hidrogeoChartIntegration';

/**
 * Forma de `GisLayer.data` para las capas de prueba de la Etapa 4 —
 * placeholder previo al formato real de archivo importado.
 */
export interface SyntheticPointData {
  points: Array<{ east: number; north: number; elevation: number }>;
}

function isSyntheticPointData(data: unknown): data is SyntheticPointData {
  return !!data && typeof data === 'object' && Array.isArray((data as { points?: unknown }).points);
}

function isGeoJSONFeatureCollection(data: unknown): data is FeatureCollection {
  return (
    !!data
    && typeof data === 'object'
    && (data as { type?: unknown }).type === 'FeatureCollection'
    && Array.isArray((data as { features?: unknown }).features)
  );
}

function isCollarLayerData(data: unknown): data is CollarLayerData {
  return !!data && typeof data === 'object' && Array.isArray((data as { points?: unknown }).points);
}

function isDrillholeLayerData(data: unknown): data is DrillholeLayerData {
  return !!data && typeof data === 'object' && Array.isArray((data as { traces?: unknown }).traces);
}

function isColumnasLayerData(data: unknown): data is ColumnasLayerData {
  return !!data && typeof data === 'object' && Array.isArray((data as { points?: unknown }).points);
}

function isRasterLayerData(data: unknown): data is RasterLayerData {
  return (
    !!data
    && typeof data === 'object'
    && (data as { pixels?: unknown }).pixels instanceof Uint8Array
    && typeof (data as { pixelWidth?: unknown }).pixelWidth === 'number'
    && typeof (data as { pixelHeight?: unknown }).pixelHeight === 'number'
  );
}

function isHidrogeoStiffLayerData(data: unknown): data is HidrogeoStiffLayerData {
  return !!data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items);
}

// ─────────────────────────────────────────────────────────────────
// SIMBOLOGÍA CATEGORIZADA (Etapa 12)
// ─────────────────────────────────────────────────────────────────
// `GisLayerSymbology.mode === 'categorized'` (gisTypes.ts, ya tipado desde
// la Etapa 1) le asigna un color distinto por valor único de un campo —
// `getCategorizableFields()`/`getCategoryValues()` son la ÚNICA fuente de
// verdad de qué campos existen y qué valor tiene cada feature/punto/traza
// para ese campo: las usa tanto LayerTableOfContents.tsx (para listar
// campos y armar la leyenda) como los builders de acá abajo (para resolver
// el color real de cada mesh) — evita que ambos lados se desincronicen
// sobre qué atributos están disponibles.
//
// Ambas funciones filtran PRIMERO por `layer.type` (no solo por la forma
// de `layer.data`): CollarLayerData/ColumnasLayerData son estructuralmente
// IDÉNTICAS (ambas son `{ points: [...] }`) — sin el
// filtro por type, isCollarLayerData() aceptaría también los datos de una
// capa de columnas o de hidrogeo, devolviendo los campos/valores
// EQUIVOCADOS. Mismo criterio de "type primero, forma después" que ya usa
// buildLayerMesh() más abajo.

/** Campos disponibles para categorizar esta capa — [] si no aplica (ráster, capas sin atributos como SyntheticPointData, o sin datos todavía). */
export function getCategorizableFields(layer: GisLayer): string[] {
  switch (layer.type) {
    case 'integrated-collars':
      return isCollarLayerData(layer.data) && layer.data.points.length ? ['dhid', 'sourceFileName'] : [];
    case 'integrated-drillholes':
      // Una traza entera (no cada segmento) es la unidad categorizable — dhid es el único atributo real que trae DrillholeTrace.
      return isDrillholeLayerData(layer.data) && layer.data.traces.length ? ['dhid'] : [];
    case 'integrated-columnas':
      return isColumnasLayerData(layer.data) && layer.data.points.length ? ['name', 'id'] : [];
    case 'vector':
      if (isGeoJSONFeatureCollection(layer.data)) {
        const fields = new Set<string>();
        for (const feature of layer.data.features) {
          if (feature.properties) Object.keys(feature.properties).forEach((k) => fields.add(k));
        }
        return [...fields];
      }
      return [];
    default:
      return []; // 'raster' u otro tipo sin construcción de simbología definida
  }
}

function fieldValueToString(obj: Record<string, unknown> | null | undefined, field: string): string {
  if (!obj) return '';
  const raw = obj[field];
  return raw == null ? '' : String(raw);
}

/**
 * Valor de categoría de cada punto/traza/feature de la capa, EN EL MISMO
 * ORDEN que `layer.data.points`/`.traces`/`.features` — así los builders de
 * más abajo pueden indexar `categoryValues[i]` alineado con el elemento
 * `i` que están dibujando en ese momento, sin volver a recorrer `layer.data`.
 */
export function getCategoryValues(layer: GisLayer, field: string): string[] {
  switch (layer.type) {
    case 'integrated-collars':
      return isCollarLayerData(layer.data)
        ? layer.data.points.map((p) => fieldValueToString(p as unknown as Record<string, unknown>, field))
        : [];
    case 'integrated-drillholes':
      return isDrillholeLayerData(layer.data)
        ? layer.data.traces.map((t) => fieldValueToString(t as unknown as Record<string, unknown>, field))
        : [];
    case 'integrated-columnas':
      return isColumnasLayerData(layer.data)
        ? layer.data.points.map((p) => fieldValueToString(p as unknown as Record<string, unknown>, field))
        : [];
    case 'vector':
      return isGeoJSONFeatureCollection(layer.data)
        ? layer.data.features.map((f) => fieldValueToString(f.properties as Record<string, unknown> | null, field))
        : [];
    default:
      return [];
  }
}

/** `null` si la capa no está en modo categorizado (o no tiene campo elegido todavía) — evita recalcular getCategoryValues() en cada builder cuando no hace falta. */
function getActiveCategoryValues(layer: GisLayer): string[] | null {
  if (layer.symbology.mode !== 'categorized' || !layer.symbology.categorizedField) return null;
  return getCategoryValues(layer, layer.symbology.categorizedField);
}

/** Color del ítem `i` — el de su categoría si la capa está categorizada y ese valor tiene color asignado; si no, el color plano (mismo fallback para "modo plano" y para "valor sin mapear en categoryColors"). */
function resolveFeatureColor(layer: GisLayer, categoryValues: string[] | null, i: number): string {
  if (!categoryValues) return layer.symbology.flatColor;
  return layer.symbology.categoryColors?.[categoryValues[i]] ?? layer.symbology.flatColor;
}

/**
 * Cachea un material por color EXACTO (no por punto) — con N categorías
 * distintas, como mucho N materiales por capa, sin importar cuántos
 * puntos/features tenga cada una. La geometría sigue siendo una sola,
 * compartida entre todos los Mesh de la capa (sin cambios respecto de las
 * Etapas 9-11) — categorizar solo agrega más MATERIALES (uno por color
 * único que aparezca), nunca más geometrías. Se evaluó `InstancedMesh` con
 * color por instancia (un solo draw call para toda la capa) pero se
 * descartó para esta etapa: a la escala real de este proyecto (decenas o
 * cientos de puntos, no millones) el ahorro de draw calls no justifica
 * reescribir los 5 builders de este archivo a un modelo de matrices por
 * instancia — más materiales (uno por valor único, típicamente unos
 * pocos) es una solución igual de correcta y muchísimo más simple, y
 * mantiene el mismo patrón "Mesh individual" ya establecido en todo el
 * módulo.
 */
function makeMaterialCache<M extends THREE.Material>(factory: (color: string) => M): (color: string) => M {
  const cache = new Map<string, M>();
  return (color: string) => {
    let material = cache.get(color);
    if (!material) {
      material = factory(color);
      cache.set(color, material);
    }
    return material;
  };
}

const POINT_RADIUS = 8;
const POINT_SEGMENTS = 12;
/** Radio del tubo de una traza de sondaje — más delgado que POINT_RADIUS (el marcador de collar) para distinguir visualmente "el punto de partida" de "la traza". */
const DRILLHOLE_TUBE_RADIUS = 3;
const DRILLHOLE_TUBE_RADIAL_SEGMENTS = 8;
/** Marcador de columna estratigráfica: cono — silueta distinta de la esfera de collar y del tubo de sondaje. */
const COLUMNAS_MARKER_RADIUS = 9;
const COLUMNAS_MARKER_HEIGHT = 18;
const COLUMNAS_MARKER_SEGMENTS = 8;

/**
 * Piso reservado de renderOrder para TODAS las capas — deja 0-9 libres
 * para la grilla/piso de gisGrid.ts (que usa renderOrder=0 explícito) y
 * cualquier otro elemento de referencia de la escena que se agregue más
 * adelante. Sin esto, una capa y la grilla podían terminar en el mismo
 * renderOrder (el default implícito 0), y cuál gana en un pixel coincidente
 * quedaba librado al desempate interno no garantizado de Three.js — bug
 * real encontrado al testear en la Etapa 4 (un punto de prueba sobre una
 * intersección de la grilla se veía del color de la grilla, no de la capa).
 */
export const LAYER_RENDER_ORDER_BASE = 10;

/**
 * Material plano para una capa: `depthTest`/`depthWrite` en false +
 * `transparent: true` (aunque el color final sea opaco) — el mismo trío
 * establecido en la Etapa 4. `transparent: true` no es por opacidad: es
 * lo que empuja el mesh a la pasada "transparent" de Three.js, que sí
 * respeta `renderOrder` de forma confiable frente a otros objetos; en la
 * pasada "opaque" (donde cae un material normal sin esto), renderOrder no
 * alcanzó para ganarle a la grilla en un punto de prueba exactamente
 * sobre una intersección — bug real encontrado al testear, no teórico.
 */
function makeLayerMaterial(color: string): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color });
  material.depthTest = false;
  material.depthWrite = false;
  material.transparent = true;
  return material;
}

function makeLayerLineMaterial(color: string): THREE.LineBasicMaterial {
  const material = new THREE.LineBasicMaterial({ color });
  material.depthTest = false;
  material.depthWrite = false;
  material.transparent = true;
  return material;
}

function buildSyntheticPointsMesh(layer: GisLayer, data: SyntheticPointData, renderOrder: number): THREE.Object3D {
  const group = new THREE.Group();
  group.name = `gis-layer-${layer.id}`;

  const geometry = new THREE.SphereGeometry(POINT_RADIUS, POINT_SEGMENTS, POINT_SEGMENTS);
  const material = makeLayerMaterial(layer.symbology.flatColor);

  for (const point of data.points) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(point.east, point.north, point.elevation);
    mesh.renderOrder = renderOrder;
    group.add(mesh);
  }

  return group;
}

function addPointMesh(
  group: THREE.Group,
  coord: [number, number],
  elevation: number,
  material: THREE.Material,
  renderOrder: number,
): void {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(POINT_RADIUS, POINT_SEGMENTS, POINT_SEGMENTS), material);
  mesh.position.set(coord[0], coord[1], elevation);
  mesh.renderOrder = renderOrder;
  group.add(mesh);
}

/**
 * Capa automática de collars (Etapa 9, integrated-collars — ver
 * collarsIntegration.ts). Cada collar usa SU PROPIA elevación (`cota`) si
 * la trae, igual que SyntheticPointData; si no, se drapea a
 * `defaultElevation` — mismo criterio que la geometría GeoJSON sin Z
 * propia (ver comentario de archivo).
 *
 * Simbología categorizada (Etapa 12): un material por color único (ver
 * makeMaterialCache) en vez de uno solo por capa — cada punto toma el
 * material de su categoría.
 */
function buildCollarLayerMesh(layer: GisLayer, data: CollarLayerData, defaultElevation: number, renderOrder: number): THREE.Object3D {
  const group = new THREE.Group();
  group.name = `gis-layer-${layer.id}`;

  const getMaterial = makeMaterialCache(makeLayerMaterial);
  const categoryValues = getActiveCategoryValues(layer);

  data.points.forEach((point, i) => {
    const material = getMaterial(resolveFeatureColor(layer, categoryValues, i));
    addPointMesh(
      group,
      [point.east, point.north],
      point.elevation ?? defaultElevation,
      material,
      renderOrder,
    );
  });

  return group;
}

/**
 * Capa automática de trazas de sondaje (Etapa 10, integrated-drillholes —
 * ver drillholesIntegration.ts/minimumCurvature.ts). Cada traza se dibuja
 * como una sucesión de tubos delgados (CylinderGeometry orientado por
 * segmento, no THREE.TubeGeometry sobre una curva suavizada) — un tubo
 * pasa EXACTO por los vértices que calculó curvatura mínima, sin agregar
 * ninguna suavización adicional que distorsione la geometría real. Un
 * `THREE.Line` habría sido más simple, pero su ancho queda fijo en ~1px
 * en la mayoría de los navegadores (limitación conocida de WebGL/ANGLE) —
 * insuficiente para confirmar a simple vista que la traza se curva.
 *
 * Geometría compartida entre TODOS los segmentos de TODAS las trazas de
 * esta capa (mismo criterio que buildSyntheticPointsMesh: una sola
 * geometría reusada por muchos Mesh, cada uno con su propia
 * posición/rotación/escala) — evita crear miles de geometrías idénticas
 * para un proyecto con muchos sondajes largos.
 *
 * Simbología categorizada (Etapa 12): la unidad categorizable es la TRAZA
 * completa (no cada segmento individual) — todos los segmentos de una
 * misma traza comparten el material de su categoría, resuelto UNA vez por
 * traza y reusado en su bucle interno.
 */
function buildDrillholeLayerMesh(layer: GisLayer, data: DrillholeLayerData, renderOrder: number): THREE.Object3D {
  const group = new THREE.Group();
  group.name = `gis-layer-${layer.id}`;

  const getMaterial = makeMaterialCache(makeLayerMaterial);
  const categoryValues = getActiveCategoryValues(layer);
  // Altura 1 a lo largo de Y (default de Three.js) — cada segmento se re-escala/orienta abajo.
  const geometry = new THREE.CylinderGeometry(DRILLHOLE_TUBE_RADIUS, DRILLHOLE_TUBE_RADIUS, 1, DRILLHOLE_TUBE_RADIAL_SEGMENTS);

  const up = new THREE.Vector3(0, 1, 0);
  data.traces.forEach((trace, traceIndex) => {
    const material = getMaterial(resolveFeatureColor(layer, categoryValues, traceIndex));

    for (let i = 1; i < trace.points.length; i++) {
      const p1 = trace.points[i - 1];
      const p2 = trace.points[i];
      const start = new THREE.Vector3(p1.east, p1.north, p1.elevation);
      const end = new THREE.Vector3(p2.east, p2.north, p2.elevation);
      const delta = new THREE.Vector3().subVectors(end, start);
      const length = delta.length();
      if (length < 1e-9) continue; // tramo degenerado (dos estaciones a la misma profundidad) — nada que dibujar

      const segment = new THREE.Mesh(geometry, material);
      segment.position.copy(start).add(end).multiplyScalar(0.5);
      segment.quaternion.setFromUnitVectors(up, delta.normalize());
      segment.scale.set(1, length, 1);
      segment.renderOrder = renderOrder;
      group.add(segment);
    }
  });

  return group;
}

/**
 * Capa automática de columnas estratigráficas (Etapa 11, integrated-columnas
 * — ver columnasIntegration.ts). Marcador cónico — silueta distinta de la
 * esfera de collar y del tubo de sondaje, mismo criterio de "geometría
 * compartida entre todos los puntos" que buildCollarLayerMesh.
 */
function buildColumnasLayerMesh(layer: GisLayer, data: ColumnasLayerData, defaultElevation: number, renderOrder: number): THREE.Object3D {
  const group = new THREE.Group();
  group.name = `gis-layer-${layer.id}`;

  const getMaterial = makeMaterialCache(makeLayerMaterial);
  const categoryValues = getActiveCategoryValues(layer);
  const geometry = new THREE.ConeGeometry(COLUMNAS_MARKER_RADIUS, COLUMNAS_MARKER_HEIGHT, COLUMNAS_MARKER_SEGMENTS);

  data.points.forEach((point, i) => {
    const material = getMaterial(resolveFeatureColor(layer, categoryValues, i));
    const mesh = new THREE.Mesh(geometry, material);
    // Centrado en el punto: ConeGeometry nace centrada en su propio eje —
    // se sube medio alto para que la BASE del cono quede en la elevación
    // real (mismo criterio visual que un pin/marcador de mapa), no el centro.
    mesh.position.set(point.east, point.north, (point.elevation ?? defaultElevation) + COLUMNAS_MARKER_HEIGHT / 2);
    mesh.renderOrder = renderOrder;
    group.add(mesh);
  });

  return group;
}

function addLineMesh(
  group: THREE.Group,
  coords: [number, number][],
  elevation: number,
  material: THREE.LineBasicMaterial,
  renderOrder: number,
): void {
  const points = coords.map(([x, y]) => new THREE.Vector3(x, y, elevation));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
  line.renderOrder = renderOrder;
  group.add(line);
}

/** `rings[0]` es el anillo exterior, `rings[1..]` son huecos — convención GeoJSON estándar. */
function addPolygonMesh(
  group: THREE.Group,
  rings: [number, number][][],
  elevation: number,
  material: THREE.Material,
  renderOrder: number,
): void {
  const [outer, ...holes] = rings;
  if (!outer || outer.length < 3) return;

  // THREE.Shape ya construye en el plano XY — a diferencia de GridHelper
  // (gisGrid.ts), acá no hace falta ninguna rotación de reorientación.
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  holes.forEach((hole) => {
    shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  });

  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  mesh.position.z = elevation;
  mesh.renderOrder = renderOrder;
  group.add(mesh);
}

/**
 * Simbología categorizada (Etapa 12): a diferencia de las capas
 * `integrated-*` (una sola geometría por tipo de marcador), acá una
 * feature puede ser Point/Line/Polygon — se resuelve el color UNA vez por
 * feature y se usa para las 3 formas de material (punto/línea/polígono),
 * cacheadas cada una por su cuenta ya que Line necesita un
 * `LineBasicMaterial`, no un `MeshBasicMaterial`.
 */
function buildGeoJSONLayerMesh(
  layer: GisLayer,
  data: FeatureCollection,
  defaultElevation: number,
  renderOrder: number,
): THREE.Object3D {
  const group = new THREE.Group();
  group.name = `gis-layer-${layer.id}`;

  const getPointMaterial = makeMaterialCache(makeLayerMaterial);
  const getLineMaterial = makeMaterialCache(makeLayerLineMaterial);
  const getPolygonMaterial = makeMaterialCache(makeLayerMaterial);
  const categoryValues = getActiveCategoryValues(layer);

  data.features.forEach((feature: Feature, featureIndex: number) => {
    const geometry = feature.geometry;
    if (!geometry) return;

    const color = resolveFeatureColor(layer, categoryValues, featureIndex);
    const pointMaterial = getPointMaterial(color);
    const lineMaterial = getLineMaterial(color);
    const polygonMaterial = getPolygonMaterial(color);

    switch (geometry.type) {
      case 'Point':
        addPointMesh(group, geometry.coordinates as [number, number], defaultElevation, pointMaterial, renderOrder);
        break;
      case 'MultiPoint':
        (geometry.coordinates as [number, number][]).forEach((c) =>
          addPointMesh(group, c, defaultElevation, pointMaterial, renderOrder));
        break;
      case 'LineString':
        addLineMesh(group, geometry.coordinates as [number, number][], defaultElevation, lineMaterial, renderOrder);
        break;
      case 'MultiLineString':
        (geometry.coordinates as [number, number][][]).forEach((line) =>
          addLineMesh(group, line, defaultElevation, lineMaterial, renderOrder));
        break;
      case 'Polygon':
        addPolygonMesh(group, geometry.coordinates as [number, number][][], defaultElevation, polygonMaterial, renderOrder);
        break;
      case 'MultiPolygon':
        (geometry.coordinates as [number, number][][][]).forEach((poly) =>
          addPolygonMesh(group, poly, defaultElevation, polygonMaterial, renderOrder));
        break;
      default:
        // GeometryCollection u otros tipos: fuera del alcance de esta
        // etapa (solo puntos/líneas/polígonos) — se omiten sin romper.
        break;
    }
  });

  return group;
}

/**
 * Geometría explícita de un paralelogramo (transformación afín general,
 * puede tener cizalla — Etapa 8, georreferenciación manual) en
 * coordenadas de MUNDO absolutas — a diferencia del camino 'rect'
 * (PlaneGeometry + position + rotation.z), acá los vértices YA son la
 * posición final, sin transform adicional en el mesh. `bottomRight` se
 * deriva como topRight + bottomLeft − topLeft (paralelogramo).
 *
 * UVs: mismo criterio que el 'rect' con flipY=true — el vértice topLeft
 * (pixel fila 0 = borde norte real, ver rasterImport.ts) recibe v=1, para
 * que la textura quede orientada igual en ambos caminos.
 */
function buildQuadGeometry(
  topLeft: [number, number],
  topRight: [number, number],
  bottomLeft: [number, number],
  elevation: number,
): THREE.BufferGeometry {
  const bottomRight: [number, number] = [
    topRight[0] + bottomLeft[0] - topLeft[0],
    topRight[1] + bottomLeft[1] - topLeft[1],
  ];

  // prettier-ignore
  const positions = new Float32Array([
    topLeft[0], topLeft[1], elevation,
    bottomLeft[0], bottomLeft[1], elevation,
    topRight[0], topRight[1], elevation,

    topRight[0], topRight[1], elevation,
    bottomLeft[0], bottomLeft[1], elevation,
    bottomRight[0], bottomRight[1], elevation,
  ]);
  // prettier-ignore
  const uvs = new Float32Array([
    0, 1, 0, 0, 1, 1,
    1, 1, 0, 0, 1, 0,
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Textura + plano para UN ráster (rasterImport.ts, Etapa 7/8) — extraída
 * de buildRasterMesh (Etapa 5) para que buildHidrogeoStiffLayerMesh
 * (varios ráster por capa, uno por tarjeta de Stiff) pueda reusar
 * EXACTAMENTE la misma construcción de textura/plano por cada tarjeta,
 * sin duplicarla. Sin `renderOrder`/`name` propios — el llamador los
 * fija (buildRasterMesh en el mesh único, buildHidrogeoStiffLayerMesh en
 * cada mesh del grupo).
 *
 * `data.placement.kind === 'rect'` (GeoTIFF/world file, Etapa 7; también
 * los gráficos publicados de Hidrogeoquímica, Etapa 4/5): plano
 * rectangular con position+rotation.z. `data.placement.kind === 'quad'`
 * (georreferenciación manual con 3+ puntos, Etapa 8): paralelogramo con
 * vértices en coordenadas de mundo absolutas — puede tener cizalla, que
 * un rectángulo+rotación no puede representar.
 */
function makeRasterMeshFromData(data: RasterLayerData, defaultElevation: number): THREE.Mesh {
  const texture = new THREE.DataTexture(data.pixels, data.pixelWidth, data.pixelHeight, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  // flipY: DataTexture NO flipea por defecto — fila 0 del buffer (el
  // borde superior/norte real del ráster, ver rasterImport.ts) terminaba
  // mapeada a v=0 (el borde inferior/sur del plano). Confirmado con
  // prueba real (lectura de píxeles WebGL contra un GeoTIFF con las 4
  // esquinas de colores distintos): sin esto, norte y sur quedaban
  // invertidos. Con flipY:true, fila 0 → v=1 (borde superior del plano),
  // que es lo que corresponde.
  texture.flipY = true;
  texture.needsUpdate = true;

  const material = new THREE.MeshBasicMaterial({ map: texture });
  material.depthTest = false;
  material.depthWrite = false;
  material.transparent = true;
  // DoubleSide: el paralelogramo del camino 'quad' puede quedar con la
  // normal "al revés" según la cizalla/orden de vértices — irrelevante
  // para un material sin luces (MeshBasicMaterial), pero evita cualquier
  // caso donde el backface culling lo hiciera desaparecer.
  material.side = THREE.DoubleSide;

  const { placement } = data;
  const mesh = new THREE.Mesh(
    placement.kind === 'quad'
      ? buildQuadGeometry(placement.topLeft, placement.topRight, placement.bottomLeft, defaultElevation)
      : new THREE.PlaneGeometry(placement.width, placement.height),
    material,
  );
  if (placement.kind === 'rect') {
    mesh.position.set(placement.centerEast, placement.centerNorth, defaultElevation);
    mesh.rotation.z = placement.rotationRad;
  }
  // 'quad': los vértices de buildQuadGeometry ya son posición de mundo
  // absoluta — no hace falta position/rotation adicional en el mesh.
  return mesh;
}

/**
 * Los ráster son de SOLO VISUALIZACIÓN — sin symbology.flatColor
 * editable (LayerTableOfContents.tsx oculta el selector de color para
 * type:'raster'/'integrated-hidrogeo-chart'/'integrated-hidrogeo-stiff'),
 * así que acá no se usa layer.symbology en absoluto.
 */
function buildRasterMesh(layer: GisLayer, data: RasterLayerData, defaultElevation: number, renderOrder: number): THREE.Object3D {
  const mesh = makeRasterMeshFromData(data, defaultElevation);
  mesh.renderOrder = renderOrder;
  mesh.name = `gis-layer-${layer.id}`;
  return mesh;
}

/**
 * Capa automática de tarjetas de Stiff publicadas (Etapa 5, ver
 * `HidrogeoStiffLayerData` en hidrogeoChartIntegration.ts) — UN grupo con
 * VARIOS ráster adentro (uno por tarjeta/muestra), no una capa por
 * muestra, para que la tabla de contenidos no termine con una fila por
 * cada pozo/muestra del proyecto. Mismo `makeRasterMeshFromData` que
 * `buildRasterMesh`, uno por ítem.
 */
function buildHidrogeoStiffLayerMesh(layer: GisLayer, data: HidrogeoStiffLayerData, defaultElevation: number, renderOrder: number): THREE.Object3D {
  const group = new THREE.Group();
  group.name = `gis-layer-${layer.id}`;

  data.items.forEach((item) => {
    const mesh = makeRasterMeshFromData(
      { pixels: item.pixels, pixelWidth: item.pixelWidth, pixelHeight: item.pixelHeight, placement: item.placement },
      defaultElevation,
    );
    mesh.renderOrder = renderOrder;
    group.add(mesh);
  });

  return group;
}

// ─────────────────────────────────────────────────────────────────
// CENTRO AUTOMÁTICO (Etapa 16) — botón "Centrar automáticamente" de
// ExtentEditor.tsx
// ─────────────────────────────────────────────────────────────────
// getLayerCenterPoints() decide, por capa, qué coordenadas [este, norte]
// se consideran representativas de su posición real — el criterio varía
// por tipo (ver JSDoc de cada rama) porque no todas las capas tienen la
// misma noción de "dónde están": un punto ES su posición, pero una traza
// de sondaje o un polígono importado no tienen una única coordenada obvia.
// computeLayersCentroid() junta TODOS esos puntos de TODAS las capas
// (sin importar visible/oculta — "todos los datos actualmente presentes
// en el proyecto", no solo lo que se está mostrando ahora mismo) y
// devuelve el promedio simple, o null si no hay ningún punto en ningún
// lado (ni integraciones con datos ni capas importadas) — ExtentEditor usa
// ese null para deshabilitar el botón.

/** Recorre coordenadas GeoJSON anidadas (Point/LineString/Polygon/Multi*) hasta el par [x,y] hoja, sin asumir profundidad de anidado fija. */
function flattenGeoJSONCoords(coords: unknown): [number, number][] {
  if (Array.isArray(coords) && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return [[coords[0] as number, coords[1] as number]];
  }
  if (Array.isArray(coords)) {
    return (coords as unknown[]).flatMap(flattenGeoJSONCoords);
  }
  return [];
}

/**
 * Las 4 esquinas del footprint real de una capa ráster — no hay una
 * coordenada por-píxel ya calculada en ningún otro lado (buildRasterMesh
 * arma la textura, no una lista de puntos de mundo), así que las 4
 * esquinas son la forma más simple de representar su posición sin iterar
 * píxeles. Para 'quad' son directamente los 3 vértices guardados + el 4º
 * derivado (mismo cálculo que buildQuadGeometry: bottomRight = topRight +
 * bottomLeft − topLeft). Para 'rect' se calculan rotando los 4 semiejes
 * por `rotationRad` — para un rectángulo sin cizalla, el promedio de sus 4
 * esquinas coincide exactamente con su centro ya conocido, así que este
 * camino es consistente con 'quad' sin ser redundante.
 */
function getRasterFootprintCorners(data: RasterLayerData): [number, number][] {
  const { placement } = data;
  if (placement.kind === 'quad') {
    const bottomRight: [number, number] = [
      placement.topRight[0] + placement.bottomLeft[0] - placement.topLeft[0],
      placement.topRight[1] + placement.bottomLeft[1] - placement.topLeft[1],
    ];
    return [placement.topLeft, placement.topRight, placement.bottomLeft, bottomRight];
  }
  const { centerEast, centerNorth, width, height, rotationRad } = placement;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  const localCorners: [number, number][] = [
    [-halfWidth, -halfHeight], [halfWidth, -halfHeight], [halfWidth, halfHeight], [-halfWidth, halfHeight],
  ];
  return localCorners.map(([lx, ly]) => [
    centerEast + lx * cos - ly * sin,
    centerNorth + lx * sin + ly * cos,
  ]);
}

/**
 * Puntos [este, norte] representativos de la posición real de `layer`,
 * para promediar en computeLayersCentroid(). Criterio por tipo:
 *   - integrated-collars/columnas/hidrogeo: cada punto ES su posición.
 *   - integrated-drillholes: TODOS los vértices de cada traza (no solo el
 *     collar — ese ya se cuenta aparte en integrated-collars; un sondaje
 *     desviado se aleja de su collar en profundidad, así que promediar
 *     toda la traza centra la vista en el volumen 3D real que ocupan los
 *     sondajes, no solo en sus bocas).
 *   - vector: todos los vértices de la geometría GeoJSON (puntos, vértices
 *     de línea, vértices de anillo de polígono) — no el centro del
 *     bounding box, mismo criterio que las capas de puntos ("promediar lo
 *     que realmente hay"), y evita que una forma muy irregular (ej. un
 *     polígono en L) quede centrada en un punto vacío de su propio AABB.
 *     SyntheticPointData (Etapa 4, sin productor real desde la Etapa 13)
 *     NO se soporta acá a propósito — 'vector' se trata siempre como
 *     GeoJSON, así que cualquier dato de prueba hipotético queda excluido
 *     sin necesidad de un chequeo aparte.
 *   - raster: las 4 esquinas de su footprint (ver getRasterFootprintCorners).
 */
function getLayerCenterPoints(layer: GisLayer): [number, number][] {
  switch (layer.type) {
    case 'integrated-collars':
      return isCollarLayerData(layer.data) ? layer.data.points.map((p): [number, number] => [p.east, p.north]) : [];
    case 'integrated-drillholes':
      return isDrillholeLayerData(layer.data)
        ? layer.data.traces.flatMap((t) => t.points.map((p): [number, number] => [p.east, p.north]))
        : [];
    case 'integrated-columnas':
      return isColumnasLayerData(layer.data) ? layer.data.points.map((p): [number, number] => [p.east, p.north]) : [];
    case 'vector':
      return isGeoJSONFeatureCollection(layer.data)
        ? layer.data.features.flatMap((f) => (f.geometry ? flattenGeoJSONCoords((f.geometry as { coordinates?: unknown }).coordinates) : []))
        : [];
    case 'raster':
    case 'integrated-hidrogeo-chart':
      return isRasterLayerData(layer.data) ? getRasterFootprintCorners(layer.data) : [];
    case 'integrated-hidrogeo-stiff':
      return isHidrogeoStiffLayerData(layer.data)
        ? layer.data.items.flatMap((item) => getRasterFootprintCorners({ pixels: item.pixels, pixelWidth: item.pixelWidth, pixelHeight: item.pixelHeight, placement: item.placement }))
        : [];
    default:
      return [];
  }
}

/**
 * Promedio simple de este/norte de TODOS los puntos representativos de
 * TODAS las capas del proyecto (ver getLayerCenterPoints) — `null` si no
 * hay ningún punto en ningún lado (proyecto sin ninguna capa con datos
 * reales), para que ExtentEditor deshabilite el botón en ese caso.
 */
export function computeLayersCentroid(layers: GisLayer[]): { centerEast: number; centerNorth: number } | null {
  const allPoints = layers.flatMap(getLayerCenterPoints);
  if (allPoints.length === 0) return null;

  let sumEast = 0;
  let sumNorth = 0;
  for (const [east, north] of allPoints) {
    sumEast += east;
    sumNorth += north;
  }
  return { centerEast: sumEast / allPoints.length, centerNorth: sumNorth / allPoints.length };
}

/**
 * true si la capa tiene al menos un punto/traza/feature/pixel real — usado
 * por GisViewport.tsx (Etapa 15) para decidir si la proyección del
 * proyecto ya debe quedar bloqueada (cambiarla reinterpretaría datos ya
 * cargados). Mismo criterio "type primero, forma después" que
 * getCategorizableFields()/getCategoryValues() de más arriba, por el mismo
 * motivo: varios de estos tipos son estructuralmente idénticos.
 */
export function layerHasData(layer: GisLayer): boolean {
  switch (layer.type) {
    case 'integrated-collars':
      return isCollarLayerData(layer.data) && layer.data.points.length > 0;
    case 'integrated-drillholes':
      return isDrillholeLayerData(layer.data) && layer.data.traces.length > 0;
    case 'integrated-columnas':
      return isColumnasLayerData(layer.data) && layer.data.points.length > 0;
    case 'vector':
      if (isSyntheticPointData(layer.data)) return layer.data.points.length > 0;
      if (isGeoJSONFeatureCollection(layer.data)) return layer.data.features.length > 0;
      return false;
    case 'raster':
    case 'integrated-hidrogeo-chart':
      return isRasterLayerData(layer.data) && layer.data.pixels.length > 0;
    case 'integrated-hidrogeo-stiff':
      return isHidrogeoStiffLayerData(layer.data) && layer.data.items.length > 0;
    default:
      return false;
  }
}

/**
 * Construye la geometría de una capa según su `type` y la forma real de
 * `data` — `SyntheticPointData` (Etapa 4), GeoJSON `FeatureCollection`
 * (Etapa 6, shapefileImport.ts) o `RasterLayerData` (Etapa 7,
 * rasterImport.ts). Devuelve `null` si el tipo o los datos todavía no
 * tienen una construcción definida — GisViewport simplemente omite esa
 * capa en vez de romper.
 *
 * `drawIndex` (0 = primera en dibujarse, la más "de fondo") controla el
 * orden de dibujo relativo a las demás capas (ver GisViewport.tsx: "más
 * abajo en la lista se dibuja primero", como en QGIS/ArcGIS) — se traduce
 * a `renderOrder = LAYER_RENDER_ORDER_BASE + drawIndex`.
 *
 * `defaultElevation` se usa para geometría GeoJSON y ráster (ninguna trae
 * Z propia) — las capas `SyntheticPointData` ya traen su propia elevación
 * por punto.
 */
export function buildLayerMesh(layer: GisLayer, drawIndex: number, defaultElevation: number): THREE.Object3D | null {
  const renderOrder = LAYER_RENDER_ORDER_BASE + drawIndex;

  if ((layer.type === 'raster' || layer.type === 'integrated-hidrogeo-chart') && isRasterLayerData(layer.data)) {
    return buildRasterMesh(layer, layer.data, defaultElevation, renderOrder);
  }
  if (layer.type === 'integrated-hidrogeo-stiff' && isHidrogeoStiffLayerData(layer.data)) {
    return buildHidrogeoStiffLayerMesh(layer, layer.data, defaultElevation, renderOrder);
  }
  if (layer.type === 'integrated-collars' && isCollarLayerData(layer.data)) {
    return buildCollarLayerMesh(layer, layer.data, defaultElevation, renderOrder);
  }
  if (layer.type === 'integrated-drillholes' && isDrillholeLayerData(layer.data)) {
    return buildDrillholeLayerMesh(layer, layer.data, renderOrder);
  }
  if (layer.type === 'integrated-columnas' && isColumnasLayerData(layer.data)) {
    return buildColumnasLayerMesh(layer, layer.data, defaultElevation, renderOrder);
  }
  if (layer.type !== 'vector') return null;

  if (isSyntheticPointData(layer.data)) {
    return buildSyntheticPointsMesh(layer, layer.data, renderOrder);
  }
  if (isGeoJSONFeatureCollection(layer.data)) {
    return buildGeoJSONLayerMesh(layer, layer.data, defaultElevation, renderOrder);
  }
  return null;
}
