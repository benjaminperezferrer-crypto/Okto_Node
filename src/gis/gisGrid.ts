/**
 * src/gis/gisGrid.ts
 * Geometría 3D derivada de ProjectExtent (gisTypes.ts) — grilla/piso de
 * referencia y cálculo de la caja exterior de cámara. Sin React, sin
 * estado propio — funciones puras sobre THREE.Object3D, para que
 * GisViewport.tsx las reconstruya y haga dispose() cada vez que cambia el
 * ProjectExtent (ver GisViewport.tsx para el ciclo de vida).
 *
 * Misma convención de ejes que GisViewport.tsx: X = Este, Y = Norte,
 * Z = Elevación (arriba).
 */
import * as THREE from 'three';
import type { Vector3DBox, CameraBounds } from './gisTypes';
import { createTextSprite } from './textSprite';

/** --cyan de la paleta — grilla del techo (topElevation), protagonista. */
const GRID_COLOR_TOP = 0x00f4ff;
/** Tenue a propósito — grilla del piso (bottomElevation), solo referencia de profundidad. */
const GRID_COLOR_BOTTOM = 0x0d5064;
// Etapa 18: bajadas para que la grilla se vea más tenue/menos protagonista
// — SOLO la opacidad, no el grosor de línea. Se verificó empíricamente
// contra el navegador real (gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE))
// que el backend ANGLE/D3D11 devuelve [1, 1]: cualquier `linewidth` que se
// le asigne a LineBasicMaterial queda clampeado a 1px sin importar el
// valor — limitación real del driver, no algo que este código pueda
// evitar sin reescribir la grilla entera como un shader de línea con
// grosor real (fuera de alcance acá, ver discusión en la Etapa 18).
const GRID_TOP_OPACITY = 0.45;
const GRID_BOTTOM_OPACITY = 0.2;

/**
 * Tamaño de celda por defecto (Etapa 1 del sistema de grilla por tamaño
 * de celda real): el eje MÁS LARGO de la caja (`width` o `height`, el que
 * sea mayor) queda con exactamente 10 divisiones — el otro eje usa ese
 * mismo tamaño de celda, con la cantidad de divisiones que resulte
 * naturalmente (no necesariamente 10). Exportada para que
 * GisViewport.tsx la use como valor inicial de su estado de sesión
 * `cellSize` (NO persistido en ProjectExtent — mismo criterio ya
 * acordado para `depthBands`: un `useState` que se inicializa una sola
 * vez, sin recalcularse si la caja cambia después).
 */
export function calculateDefaultCellSize(width: number, height: number): number {
  return Math.max(width, height) / 10;
}

/**
 * Cuántas líneas de grilla hay a cada lado del centro (sin contar la
 * línea central) para una caja de `halfExtent` (mitad del ancho o del
 * alto) con celdas de `cellSize` — ancladas al CENTRO de la caja
 * (confirmado con el usuario: corte simétrico en ambos bordes si
 * `cellSize` no divide exacto a `2*halfExtent`, consistente con cómo ya
 * se define `centerEast`/`centerNorth` para el resto del módulo). El
 * total de líneas de ese eje es `2*linesPerSide + 1` (la línea central
 * más las de cada lado) y el total de DIVISIONES es `2*linesPerSide`.
 */
function gridLinesPerSide(halfExtent: number, cellSize: number): number {
  return Math.floor(halfExtent / cellSize);
}

/**
 * Etiquetas de coordenadas (Este/Norte): UNA por cada línea real de la
 * grilla (Etapa 2 del rediseño de etiquetas) — ya no hay muestreo
 * (`labelStepForAxis`/`labelIndicesForAxis`, que apuntaban a ~6
 * etiquetas por eje, se retiraron por completo al dejar de usarse en
 * ningún otro lado). Con `cellSize` chico esto puede saturarse
 * visualmente (celdas angostas, muchas etiquetas juntas) — es un
 * trade-off aceptado explícitamente a favor de "todas las líneas
 * etiquetadas, sin excepción"; el tamaño de fuente ajustable
 * (`coordinateLabelFontSize`) es la única mitigación disponible hoy.
 */
/** Empuje de la etiqueta hacia afuera del borde de la caja, en unidades de mundo — mismo criterio que LABEL_CORNER_OFFSET del armazón de profundidad (gisGrid.ts), para no superponerse con la línea de grilla real. */
const GRID_LABEL_EDGE_OFFSET = 15;
/**
 * Largo (en unidades de mundo) del vector `worldDirection` que acompaña a
 * cada etiqueta (ver `CoordinateLabelInfo`) — un desplazamiento arbitrario
 * pero "razonable" desde la posición real de la etiqueta, usado SOLO para
 * proyectar un segundo punto con la cámara y sacar el ángulo en pantalla
 * (GisViewport.tsx, `animate()`). Su magnitud no afecta el ángulo
 * resultante (es una dirección, no una distancia real) — 10 se eligió
 * nada más por ser del mismo orden que otras constantes de offset de este
 * archivo (LABEL_CORNER_OFFSET, GRID_LABEL_EDGE_OFFSET), sin ningún
 * significado especial.
 */
const LABEL_DIRECTION_LENGTH = 10;
/**
 * Default del tamaño de fuente de las etiquetas de coordenadas — más
 * chico que el de las etiquetas de cota del armazón (24): acá hay más
 * etiquetas más cerca entre sí, así que un tamaño menor reduce el riesgo
 * de que se toquen. Ajustable en vivo desde ExtentEditor.tsx
 * (`coordinateLabelFontSize`, estado de sesión de GisViewport.tsx — ver
 * `buildCoordinateLabels`) — esta constante solo queda como valor
 * INICIAL de ese estado, no como límite ni tamaño fijo.
 */
export const GRID_LABEL_WORLD_HEIGHT = 12;

/** Coordenada real (sin redondear "bonito", 2 decimales como mucho) con el prefijo de eje — ej. "E 506000", "N 7500000". */
function formatCoordLabel(axis: 'E' | 'N', value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${axis} ${rounded}`;
}

/**
 * Empuja al array `positions` compartido los pares de vértices (2 por
 * línea: inicio y fin) de la grilla interna de tamaño `width`×`height`
 * con celdas cuadradas de `cellSize`, ancladas al CENTRO (confirmado con
 * el usuario: corte simétrico en ambos bordes si `cellSize` no divide
 * exacto — mismo criterio que `centerEast`/`centerNorth`), TODAS a la
 * misma coordenada `z` — factorizada de `makeGridPlane` (Etapa 1) para
 * que `buildDepthFrame` (Etapa 3) reuse EXACTO el mismo cálculo de
 * líneas en cada nivel del armazón de profundidad, con la MISMA
 * `cellSize` que el techo, sin duplicar la fórmula.
 *
 * `step` (Etapa 4, factor de reducción de las grillas internas de
 * profundidad): filtra cuáles de los mismos índices `i`/`j` (relativos al
 * centro, igual que `gridLinesPerSide`) se incluyen — solo los múltiplos
 * de `step` (`i % step === 0`). Por default `step=1` incluye TODOS los
 * índices (comportamiento sin reducir, igual que antes de esta etapa) —
 * `makeGridPlane` (techo/piso) siempre llama con el default, nunca se ve
 * afectada por el factor de reducción (confirmado con el usuario: solo
 * las grillas internas de profundidad lo usan). Como el filtro es sobre
 * el mismo `i`/`j` ya centrado en 0, el resultado sigue siendo simétrico
 * y SIEMPRE es un subconjunto exacto de las posiciones sin reducir —
 * nunca calcula una línea nueva que no exista ya en la grilla completa.
 */
function appendGridLinePositions(positions: number[], width: number, height: number, cellSize: number, z: number, step: number = 1): void {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const linesPerSideX = gridLinesPerSide(halfWidth, cellSize);
  const linesPerSideY = gridLinesPerSide(halfHeight, cellSize);

  // Líneas verticales (Norte-Sur, X constante) — una por cada múltiplo de
  // cellSize desde el centro hasta donde alcance sin pasarse de halfWidth,
  // salteando las que no sean múltiplo de `step`.
  for (let i = -linesPerSideX; i <= linesPerSideX; i++) {
    if (i % step !== 0) continue;
    const x = i * cellSize;
    positions.push(x, -halfHeight, z, x, halfHeight, z);
  }
  // Líneas horizontales (Este-Oeste, Y constante) — mismo criterio en el otro eje.
  for (let j = -linesPerSideY; j <= linesPerSideY; j++) {
    if (j % step !== 0) continue;
    const y = j * cellSize;
    positions.push(-halfWidth, y, z, halfWidth, y, z);
  }
}

/**
 * Empuja al array `positions` compartido los 4 segmentos del contorno
 * rectangular exacto de la caja (sus 4 esquinas reales) a la coordenada
 * `z` dada — equivalente a un `THREE.LineLoop` cerrado, pero expresado
 * como 4 pares de segmentos independientes para poder mezclarlo en el
 * MISMO buffer de `THREE.LineSegments` que la grilla interna de un nivel
 * (`buildDepthFrame`, Etapa 3: "una sola LineSegments por nivel" —
 * `LineLoop` y `LineSegments` son primitivas GL distintas, no se pueden
 * combinar en un solo objeto, así que el contorno se expresa con la
 * MISMA primitiva que la grilla interna). Necesario porque `cellSize`
 * puede no llegar exacto al borde real (corte simétrico) — el contorno
 * explícito garantiza que el límite verdadero de la caja SIEMPRE se vea,
 * sin importar cómo caiga la grilla interna (confirmado con el usuario:
 * se mantiene como COMPLEMENTO de la grilla interna, no en su reemplazo).
 */
function appendBoundaryRectanglePositions(positions: number[], width: number, height: number, z: number): void {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const corners: [number, number][] = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ];
  for (let i = 0; i < corners.length; i++) {
    const [x0, y0] = corners[i];
    const [x1, y1] = corners[(i + 1) % corners.length];
    positions.push(x0, y0, z, x1, y1, z);
  }
}

/**
 * Una grilla horizontal (plano XY) del tamaño `width`×`height`, a la
 * elevación `elevation` — todo en el espacio LOCAL de este objeto, sin
 * centrar ni rotar (eso lo hace el grupo padre en `buildGridMesh`, para no
 * tener que componer dos rotaciones distintas en el mismo Euler).
 *
 * Etapa 1 del sistema de grilla por tamaño de celda REAL: reemplaza el
 * `THREE.GridHelper(1, N)` + escalado no-uniforme de antes (que
 * distorsionaba las celdas a rectángulos no-cuadrados cuando
 * `width ≠ height` — un `GridHelper` de N×N divisiones estirado por
 * `scale.set(width,1,height)` da celdas de `width/N` × `height/N`, iguales
 * solo si `width === height`) por líneas armadas a mano (`appendGridLinePositions`),
 * todas del mismo `cellSize` REAL en ambos ejes → celdas SIEMPRE cuadradas.
 *
 * UNA sola `THREE.LineSegments` con todos los segmentos en un solo buffer
 * (no un `THREE.Line` por línea individual) — mismo criterio de mantener
 * bajo el conteo de draw calls ya aplicado en `buildDepthFrame`.
 */
function makeGridPlane(width: number, height: number, elevation: number, color: number, opacity: number, cellSize: number): THREE.Object3D {
  const positions: number[] = [];
  appendGridLinePositions(positions, width, height, cellSize, 0);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  const material = new THREE.LineBasicMaterial({ color });
  material.transparent = true;
  material.opacity = opacity;

  const grid = new THREE.LineSegments(geometry, material);
  grid.position.z = elevation; // seguro: la rotación Z del padre no altera Z
  // renderOrder explícito y bajo (no el default implícito 0 compartido
  // con cualquier otra cosa sin setear) — las capas (gisLayerRender.ts,
  // Etapa 4) reservan renderOrder >= LAYER_RENDER_ORDER_BASE para
  // garantizar que se dibujan DESPUÉS de la grilla y quedan encima donde
  // coincidan, en vez de depender del desempate interno no garantizado de
  // Three.js entre objetos con el mismo renderOrder.
  grid.renderOrder = 0;

  return grid;
}

/**
 * Una etiqueta de coordenada + la dirección real (en espacio de MUNDO, ya
 * rotada por `box.rotationDeg`) de la línea de grilla que representa —
 * Etapa 3-4 de la orientación paralela: `GisViewport.tsx` recalcula
 * `sprite.material.rotation` en cada frame (`animate()`) proyectando con
 * la cámara activa la posición real de la etiqueta y un segundo punto
 * `posición + worldDirection`, sacando el ángulo en pantalla entre ambos
 * (ver LABEL_DIRECTION_LENGTH). `worldDirection` se calcula UNA sola vez
 * acá (al construir la grilla) porque solo depende de `box.rotationDeg`
 * (fijo hasta que se reconstruya la grilla) — lo que cambia frame a frame
 * es la CÁMARA, no la línea, así que no hace falta recalcular esto en
 * cada frame, solo reproyectarlo.
 */
export interface CoordinateLabelInfo {
  sprite: THREE.Sprite;
  /** Dirección de la línea representada, en espacio de MUNDO — sumarla directo a `sprite.getWorldPosition()` sin aplicar ninguna rotación adicional. */
  worldDirection: THREE.Vector3;
}

/**
 * Etiquetas de coordenadas Este (a lo largo del borde SUR, y=-halfHeight,
 * empujadas más al sur) y Norte (a lo largo del borde OESTE,
 * x=-halfWidth, empujadas más al oeste) — UNA por cada línea real de la
 * grilla (Etapa 2 del rediseño de etiquetas: sin muestreo, todas las
 * líneas de `-linesPerSide` a `linesPerSide` llevan su propia etiqueta),
 * en `topElevation` (mismo nivel que la grilla protagonista). Devuelve un
 * array plano de `CoordinateLabelInfo` (sprite + dirección de mundo), no
 * un Group propio — `buildGridMesh` agrega cada `.sprite` directo a SU
 * grupo para heredar la misma traslación/rotación que la grilla, sin una
 * capa de anidamiento extra, y guarda el array completo en
 * `group.userData.coordinateLabels` para que GisViewport.tsx lo lea.
 *
 * Mismo criterio LOCAL-sin-rotar que `makeGridPlane`/`buildDepthFrame`
 * para la POSICIÓN de cada sprite: se calcula centrada en (0,0) sin
 * aplicar la rotación acá — el grupo padre (`buildGridMesh`) rota TODO
 * junto, así cada etiqueta se mueve con su línea real de grilla sin
 * importar `box.rotationDeg`, mientras el sprite en sí (billboard) nunca
 * se ve inclinado por esa herencia — el VALOR que muestra tampoco cambia
 * con la rotación, sigue siendo el Este/Norte real de esa línea.
 *
 * La DIRECCIÓN sí se rota acá explícitamente (a diferencia de la
 * posición): a diferencia de un punto, una dirección no hereda la
 * traslación del grupo padre, y GisViewport.tsx necesita la dirección ya
 * en espacio de MUNDO (no local) para sumarla directo a
 * `sprite.getWorldPosition()` sin tener que conocer `box.rotationDeg` en
 * cada frame — Este es una línea vertical local (dirección local (0,1),
 * Norte-Sur), Norte es una línea horizontal local (dirección local (1,0),
 * Este-Oeste); ambas rotadas por el mismo ángulo Z que aplica el grupo.
 *
 * `fontWorldHeight` (tamaño de fuente ajustable, en unidades de mundo —
 * mismo parámetro `worldHeight` de `createTextSprite`/`TextSpriteOptions`,
 * textSprite.ts): estado de SESIÓN de GisViewport.tsx
 * (`coordinateLabelFontSize`), completamente independiente del tamaño
 * fijo de las etiquetas de cota del armazón (`buildDepthFrame` sigue
 * usando el default de `createTextSprite` sin tocar, nunca este
 * parámetro) — ajustarlo acá no mueve ni un píxel las etiquetas de cota.
 */
function buildCoordinateLabels(box: Vector3DBox, cellSize: number, fontWorldHeight: number): CoordinateLabelInfo[] {
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  const linesPerSideX = gridLinesPerSide(halfWidth, cellSize);
  const linesPerSideY = gridLinesPerSide(halfHeight, cellSize);
  const rotationRad = THREE.MathUtils.degToRad(box.rotationDeg);
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  const labels: CoordinateLabelInfo[] = [];

  // Este: línea local vertical (dirección local (0,1,0)) rotada por Z.
  const eastWorldDirection = new THREE.Vector3(-sin, cos, 0).multiplyScalar(LABEL_DIRECTION_LENGTH);
  for (let i = -linesPerSideX; i <= linesPerSideX; i++) {
    const localX = i * cellSize;
    const eastValue = box.centerEast + localX;
    const sprite = createTextSprite(formatCoordLabel('E', eastValue), { worldHeight: fontWorldHeight });
    sprite.position.set(localX, -halfHeight - GRID_LABEL_EDGE_OFFSET, box.topElevation);
    labels.push({ sprite, worldDirection: eastWorldDirection.clone() });
  }

  // Norte: línea local horizontal (dirección local (1,0,0)) rotada por Z.
  const northWorldDirection = new THREE.Vector3(cos, sin, 0).multiplyScalar(LABEL_DIRECTION_LENGTH);
  for (let j = -linesPerSideY; j <= linesPerSideY; j++) {
    const localY = j * cellSize;
    const northValue = box.centerNorth + localY;
    const sprite = createTextSprite(formatCoordLabel('N', northValue), { worldHeight: fontWorldHeight });
    sprite.position.set(-halfWidth - GRID_LABEL_EDGE_OFFSET, localY, box.topElevation);
    labels.push({ sprite, worldDirection: northWorldDirection.clone() });
  }

  return labels;
}

/**
 * Construye la grilla/piso visual de `box`: una grilla en `topElevation`
 * (protagonista) y una segunda, tenue, en `bottomElevation` (referencia de
 * profundidad) — ambas con el MISMO `cellSize` (celdas cuadradas reales,
 * Etapa 1 del sistema de grilla por tamaño de celda: `makeGridPlane` es
 * la misma función compartida por techo y piso, así que ambas se
 * benefician igual del cambio — no tendría sentido mantener el piso con
 * el `GridHelper` viejo mientras el techo ya usa celdas cuadradas reales,
 * misma caja, mismo tamaño). Incluye etiquetas de coordenadas Este/Norte
 * (`buildCoordinateLabels`) — a diferencia del armazón de profundidad
 * (Etapa 2/3 del paquete de "fish tank"), este grupo NUNCA se oculta por
 * modo: GisViewport.tsx nunca alterna `.visible` acá, así que las
 * etiquetas de la grilla se ven en 2D y 3D por igual, sin código
 * adicional — son parte de la grilla misma, no del armazón.
 *
 * `cellSize` es estado de SESIÓN de GisViewport.tsx (mismo criterio que
 * `depthBands`) — no vive en `Vector3DBox`/`ProjectExtent`, no se
 * persiste todavía. `coordinateLabelFontSize` (tamaño de fuente de las
 * etiquetas de coordenadas, mismo criterio de estado de sesión) default
 * `GRID_LABEL_WORLD_HEIGHT` si no se pasa.
 *
 * `group.userData.coordinateLabels` (Etapa 3-4 de la orientación
 * paralela): el array `CoordinateLabelInfo[]` completo de
 * `buildCoordinateLabels`, para que GisViewport.tsx lo guarde en un ref y
 * lo recorra en `animate()` sin tener que volver a recorrer los hijos del
 * grupo ni adivinar cuáles son sprites de coordenada.
 */
export function buildGridMesh(box: Vector3DBox, cellSize: number, coordinateLabelFontSize: number = GRID_LABEL_WORLD_HEIGHT): THREE.Object3D {
  const group = new THREE.Group();
  group.name = 'gis-extent-grid';

  group.add(makeGridPlane(box.width, box.height, box.topElevation, GRID_COLOR_TOP, GRID_TOP_OPACITY, cellSize));
  group.add(makeGridPlane(box.width, box.height, box.bottomElevation, GRID_COLOR_BOTTOM, GRID_BOTTOM_OPACITY, cellSize));
  const coordinateLabels = buildCoordinateLabels(box, cellSize, coordinateLabelFontSize);
  for (const { sprite } of coordinateLabels) group.add(sprite);
  group.userData.coordinateLabels = coordinateLabels;

  group.position.set(box.centerEast, box.centerNorth, 0);
  group.rotation.z = THREE.MathUtils.degToRad(box.rotationDeg);

  return group;
}

/**
 * renderOrder propio del armazón de referencia — distinto del `0` de la
 * grilla (para no depender del desempate interno de Three.js entre
 * ambos) y por debajo de LAYER_RENDER_ORDER_BASE=10 (gisLayerRender.ts):
 * es ayuda visual/referencia, igual que la grilla, nunca debe tapar una
 * capa de datos real. Confirmado con el usuario (Etapa 2 del armazón).
 */
const DEPTH_FRAME_RENDER_ORDER = 5;
/** Mismo cian que el techo de la grilla (GRID_COLOR_TOP) — el armazón es la misma familia de "referencia", no un elemento de datos. */
const FRAME_COLOR = GRID_COLOR_TOP;
/** Entre GRID_TOP_OPACITY (0.45) y GRID_BOTTOM_OPACITY (0.2) — visible pero no protagonista. */
const FRAME_OPACITY = 0.35;
/**
 * Cuánto se empuja la etiqueta de cota MÁS ALLÁ de la esquina de
 * referencia, en unidades de mundo — hacia afuera de la caja (restando de
 * una esquina ya negativa en ambos ejes la acerca más al origen; acá se
 * hace lo opuesto, ver `buildDepthFrame`), para no tapar la esquina real
 * del armazón ni ningún dato que pudiera haber justo ahí (Etapa 3,
 * requisito explícito: "no en el centro, para no tapar datos").
 */
const LABEL_CORNER_OFFSET = 15;

/** Cota redondeada a 2 decimales (sin ceros de más) + " m" — ej. "850 m", "850.5 m". */
function formatElevationLabel(elevation: number): string {
  const rounded = Math.round(elevation * 100) / 100;
  return `${rounded} m`;
}

/**
 * Armazón de referencia de profundidad ("fish tank") de `box`: 4 líneas
 * verticales (una por esquina) + `stripeCount + 1` niveles horizontales
 * interpolados entre `topElevation` y `bottomElevation`, cada uno con su
 * propia etiqueta de cota (Etapa 3 del paquete de texto, `createTextSprite`
 * — textSprite.ts) cerca de una esquina fija — ayuda visual pura, sin
 * ninguna otra función (conteo de datos por franja, etc. quedan fuera de
 * alcance).
 *
 * Etapa 3 del sistema de grilla por tamaño de celda: cada nivel ya NO es
 * un simple contorno rectangular — es la GRILLA INTERNA completa (mismas
 * divisiones Este/Norte que el techo, mismo `cellSize`, reusando
 * `appendGridLinePositions` — Etapa 1) MÁS el contorno rectangular real
 * de la caja (`appendBoundaryRectanglePositions`, confirmado con el
 * usuario: se mantiene como COMPLEMENTO, no en su reemplazo, para que el
 * límite verdadero de la caja se vea siempre aunque `cellSize` no lo
 * alcance exacto). Ambos se empujan al MISMO array de posiciones →
 * UNA sola `THREE.LineSegments` por nivel (mismo criterio de mantener
 * bajo el conteo de draw calls que ya se aplicó en la Etapa 1 del techo).
 * Al usar el mismo `cellSize`/mismo criterio de anclaje al centro que
 * `makeGridPlane`, las líneas de cada nivel caen EXACTO en las mismas
 * coordenadas Este/Norte locales que las líneas del techo — se alinean
 * verticalmente sin ningún ajuste adicional.
 *
 * Mismo criterio LOCAL-sin-rotar que `makeGridPlane`: las líneas/
 * etiquetas se arman centradas en (0,0) sin trasladar ni rotar cada una
 * por separado — el grupo padre aplica la traslación/rotación real de
 * `box` una sola vez al final, igual que `buildGridMesh`, así el armazón
 * (líneas Y etiquetas) queda SIEMPRE alineado con la grilla existente
 * (misma caja, misma rotación).
 *
 * `stripeCount` se redondea y se acota a un mínimo de 1 (al menos 2
 * niveles — tope y fondo) para tolerar un valor inválido/vacío del
 * control numérico de ExtentEditor.tsx sin romper la geometría.
 *
 * Visibilidad (`.visible`, solo modo 3D) NO se decide acá — la controla
 * GisViewport.tsx en un efecto separado ligado a `mode`, para no tener
 * que reconstruir toda la geometría del armazón solo por alternar 2D/3D
 * (ver diagnóstico acordado). Los sprites de etiqueta son HIJOS del mismo
 * Group que las líneas — heredan `.visible` del padre igual que ellas
 * (confirmado en la práctica en la Etapa 2: un Group con
 * `visible=false` corta la recursión de render para TODA la subrama, no
 * solo para su propia geometría).
 *
 * `gridReductionFactor` (Etapa 4): filtra las líneas INTERNAS de cada
 * nivel a solo 1 de cada N (ver `step` en `appendGridLinePositions`) —
 * default 1 = sin reducir (comportamiento de la Etapa 3, sin cambios).
 * NO afecta el contorno de 4 esquinas (`appendBoundaryRectanglePositions`,
 * siempre completo), ni las 4 verticales de esquina, ni las etiquetas de
 * cota — confirmado con el usuario: el factor es solo sobre las líneas
 * internas de la grilla de cada nivel.
 */
export function buildDepthFrame(box: Vector3DBox, stripeCount: number, cellSize: number, gridReductionFactor: number = 1): THREE.Object3D {
  const group = new THREE.Group();
  group.name = 'gis-depth-frame';

  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  const safeStripeCount = Math.max(1, Math.round(stripeCount));
  const safeReductionFactor = Math.max(1, Math.round(gridReductionFactor));

  // Material único, compartido por TODAS las líneas del armazón — igual
  // de válido disponerlo varias veces (una por nivel, ver disposeObject3D)
  // que una sola: THREE.Material.dispose() es idempotente. A diferencia
  // de la geometría de un THREE.Sprite (Etapa 1, textSprite.ts), este
  // material NO es un singleton compartido a nivel de módulo entre TODA
  // la sesión — es una instancia nueva por cada llamada a
  // buildDepthFrame(), con el mismo ciclo de vida que el grupo que
  // devuelve, así que no hay ningún riesgo de romper otro armazón/línea
  // al disponerlo.
  const material = new THREE.LineBasicMaterial({ color: FRAME_COLOR });
  material.transparent = true;
  material.opacity = FRAME_OPACITY;

  const corners: [number, number][] = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ];

  for (const [x, y] of corners) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, y, box.topElevation),
      new THREE.Vector3(x, y, box.bottomElevation),
    ]);
    const line = new THREE.Line(geometry, material);
    line.renderOrder = DEPTH_FRAME_RENDER_ORDER;
    group.add(line);
  }

  for (let i = 0; i <= safeStripeCount; i++) {
    const t = i / safeStripeCount;
    const elevation = box.topElevation + (box.bottomElevation - box.topElevation) * t;

    // Grilla completa del nivel (contorno + líneas internas, mismo
    // cellSize que el techo) en UN solo buffer/objeto.
    const positions: number[] = [];
    appendBoundaryRectanglePositions(positions, box.width, box.height, elevation);
    appendGridLinePositions(positions, box.width, box.height, cellSize, elevation, safeReductionFactor);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const levelGrid = new THREE.LineSegments(geometry, material);
    levelGrid.renderOrder = DEPTH_FRAME_RENDER_ORDER;
    group.add(levelGrid);

    // Etiqueta de cota — SIEMPRE en la misma esquina (la primera,
    // -halfWidth/-halfHeight) para las depthBands+1 etiquetas, empujada
    // hacia afuera de la caja (LABEL_CORNER_OFFSET) para no coincidir con
    // la esquina real del armazón.
    const label = createTextSprite(formatElevationLabel(elevation));
    label.position.set(-halfWidth - LABEL_CORNER_OFFSET, -halfHeight - LABEL_CORNER_OFFSET, elevation);
    label.renderOrder = DEPTH_FRAME_RENDER_ORDER;
    group.add(label);
  }

  group.position.set(box.centerEast, box.centerNorth, 0);
  group.rotation.z = THREE.MathUtils.degToRad(box.rotationDeg);

  return group;
}

/** Slots de textura habituales en subtipos de THREE.Material — ver disposeObject3D. */
const TEXTURE_PROPERTIES = [
  'map', 'alphaMap', 'bumpMap', 'normalMap', 'displacementMap',
  'roughnessMap', 'metalnessMap', 'emissiveMap', 'envMap',
] as const;

function disposeMaterialTextures(material: THREE.Material): void {
  for (const prop of TEXTURE_PROPERTIES) {
    const value = (material as unknown as Record<string, unknown>)[prop];
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
}

/**
 * Libera la memoria GPU de un árbol de Three.js completo — recorre y hace
 * dispose() de cada geometría/material/textura, porque Three.js no lo
 * hace solo. Genérica a propósito: la usa `buildGridMesh` (acá),
 * `buildLayerMesh` (gisLayerRender.ts, Etapa 4) y las capas ráster
 * (rasterImport.ts, Etapa 7 — las texturas tampoco se liberan solas) —
 * mismo patrón que el cubo de prueba de GisViewport.tsx (Etapa 2).
 *
 * `THREE.Sprite` (Etapa 1 del armazón de referencia, ver textSprite.ts)
 * es un caso especial: TODAS las instancias de Sprite de toda la sesión
 * comparten la MISMA geometría (`let _geometry` a nivel de módulo dentro
 * de node_modules/three/src/objects/Sprite.js, creada una sola vez de
 * forma perezosa y NUNCA vuelta a crear) — si se le hiciera dispose()
 * como a cualquier Mesh/LineSegments, se rompería todo sprite existente o
 * futuro por el resto de la sesión (etiquetas de cota, de coordenadas,
 * cualquier otro). Por eso el dispose de geometría se salta explícitamente
 * para instancias de Sprite — su material y la textura del canvas (que sí
 * son por-instancia, no compartidos) se siguen disponiendo normal más
 * abajo, sin ningún otro cambio.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Sprite)) {
      const withGeometry = obj as THREE.Mesh | THREE.LineSegments;
      withGeometry.geometry?.dispose();
    }
    const material = (obj as THREE.Mesh).material;
    if (Array.isArray(material)) {
      material.forEach((m) => { disposeMaterialTextures(m); m.dispose(); });
    } else if (material) {
      disposeMaterialTextures(material);
      material.dispose();
    }
  });
}

/**
 * Caja exterior real (límite de navegación de cámara): la caja interior
 * `box`, expandida por los márgenes de `bounds`. Calcula primero el AABB
 * (bounding box alineado a los ejes) del rectángulo interior YA ROTADO
 * por `box.rotationDeg` — un rectángulo rotado ocupa más espacio en X/Y
 * que sus propias `width`/`height` sin rotar, salvo que la rotación sea
 * múltiplo de 90°.
 *
 * Devuelve un valor de referencia — NO restringe la cámara de forma dura.
 * Se usa, por ejemplo, para ubicar la cámara inicial a una distancia
 * razonable (ver GisViewport.tsx), no para bloquear OrbitControls.
 */
export function computeCameraBounds(
  box: Vector3DBox,
  bounds: CameraBounds,
): { min: THREE.Vector3; max: THREE.Vector3 } {
  const rotationRad = THREE.MathUtils.degToRad(box.rotationDeg);
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  const cos = Math.abs(Math.cos(rotationRad));
  const sin = Math.abs(Math.sin(rotationRad));

  // AABB del rectángulo rotado — fórmula estándar (proyección de las
  // mitades de cada lado sobre los ejes X/Y del mundo).
  const aabbHalfWidth = halfWidth * cos + halfHeight * sin;
  const aabbHalfHeight = halfWidth * sin + halfHeight * cos;

  return {
    min: new THREE.Vector3(
      box.centerEast - aabbHalfWidth - bounds.horizontalMargin,
      box.centerNorth - aabbHalfHeight - bounds.horizontalMargin,
      box.bottomElevation - bounds.verticalMargin,
    ),
    max: new THREE.Vector3(
      box.centerEast + aabbHalfWidth + bounds.horizontalMargin,
      box.centerNorth + aabbHalfHeight + bounds.horizontalMargin,
      box.topElevation + bounds.verticalMargin,
    ),
  };
}
