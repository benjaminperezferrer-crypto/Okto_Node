/**
 * src/gis/GisViewport.tsx
 * Etapa 3: conecta el ProjectExtent (gisTypes.ts, Etapa 1) con la escena
 * de Etapa 2 — formulario (ExtentEditor), grilla/piso 3D (gisGrid.ts) y
 * encuadre automático de la cámara 2D. El cubo de prueba de la Etapa 2
 * (que solo existía para confirmar visualmente el toggle 2D/3D) se retira
 * acá: la grilla real cumple ese mismo rol de confirmación visual y de
 * sobra, mantener el cubo al lado sería ruido, no algo pedido.
 *
 * Convención de ejes: X = Este, Y = Norte, Z = Elevación (arriba) — igual
 * que Etapa 2 y gisGrid.ts.
 *
 * Sin react-three-fiber a propósito (ver diagnóstico de arquitectura
 * acordado) — Three.js se maneja directo vía useRef/useEffect.
 *
 * Las DOS cámaras, la escena y el renderer se crean UNA vez al montar
 * (primer useEffect) y se mantienen vivos todo el ciclo de vida del
 * componente. Un SEGUNDO useEffect, separado, reconstruye solo la grilla
 * cuando cambia `extent` — lee los objetos persistentes vía refs en vez
 * de recrear la escena.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import HUD_THEME_CSS from '../shared/hudTheme.css';
import { ExtentEditor } from './ExtentEditor';
import { ProjectionSelector } from './ProjectionSelector';
import { GisModulesPanel } from './GisModulesPanel';
import type { GisModuleKey } from './GisModulesPanel';
import { LayerTableOfContents } from './LayerTableOfContents';
import { ShapefileImportButton } from './ShapefileImportButton';
import { RasterImportButton } from './RasterImportButton';
import { GeoreferencingTool } from './GeoreferencingTool';
import { buildGridMesh, buildDepthFrame, disposeObject3D, computeCameraBounds, calculateDefaultCellSize, GRID_LABEL_WORLD_HEIGHT } from './gisGrid';
import type { CoordinateLabelInfo } from './gisGrid';
import { buildLayerMesh, layerHasData } from './gisLayerRender';
import { buildCollarsLayer, COLLARS_LAYER_ID } from './collarsIntegration';
import { buildDrillholesLayer, DRILLHOLES_LAYER_ID } from './drillholesIntegration';
import { buildColumnasLayer, COLUMNAS_LAYER_ID } from './columnasIntegration';
import type { ColumnasLayerData } from './columnasIntegration';
import { buildHidrogeoChartLayers, buildHidrogeoStiffLayer, isHidrogeoChartLayerId, HIDROGEO_STIFF_LAYER_ID } from './hidrogeoChartIntegration';
import type { HidrogeoStiffLayerData } from './hidrogeoChartIntegration';
import { requestCollarsFromParent, requestSurveysFromParent, requestModuleStateFromParent, requestModuleChartsFromParent, requestHydroFromParent } from '../projectBridge';
import type { QaqcHydroPoint } from '../projectBridge';
import type { ColumnasProjectState, HidrogeoquimicaProjectState } from '../projectTypes';
import type { ProjectExtent, GisLayer, GisProjectState } from './gisTypes';

/** --bg de la paleta de Okto Node (ver HydrogeochemistryModule.tsx). */
const BG_COLOR = 0x010f20;

type ViewMode = '2d' | '3d';

/** Valor inicial del formulario — coordenadas UTM 19S de ejemplo, ancho ≠ alto a propósito (facilita distinguir rotación de estiramiento). */
const DEFAULT_EXTENT: ProjectExtent = {
  box: {
    centerEast: 500000,
    centerNorth: 7500000,
    width: 500,
    height: 300,
    rotationDeg: 0,
    topElevation: 1000,
    bottomElevation: 500,
  },
  cameraBounds: { horizontalMargin: 100, verticalMargin: 50 },
  // Vacío a propósito (Etapa 15): un proyecto nuevo arranca sin proyección
  // confirmada — GisViewport bloquea el resto del módulo hasta que el
  // usuario elija una en el ExtentEditor (ver hasProjection más abajo), en
  // vez de asumir en silencio una UTM 19S implícita.
  projectionEPSG: '',
};

interface OrthoFit {
  centerEast: number;
  centerNorth: number;
  /** Semi-extensión horizontal a encuadrar, ya con el padding aplicado. */
  halfWidth: number;
  /** Semi-extensión vertical a encuadrar, ya con el padding aplicado. */
  halfHeight: number;
  /**
   * Posición Z de la cámara ortográfica — DEBE quedar por encima de
   * topElevation, no un valor fijo. Con near=0.1/far=100000 mirando hacia
   * -Z, cualquier punto con Z mayor que `cameraZ - near` queda detrás de
   * la cámara y jamás se dibuja (bug real encontrado al testear: con
   * cameraZ=100 fijo y una caja con topElevation=1000, la grilla entera
   * quedaba fuera del frustum, sin ningún error visible).
   */
  cameraZ: number;
}

/** 10% de aire alrededor de la caja al encuadrar — no queda pegada al borde de la vista. */
const FRAME_PADDING = 1.1;

/**
 * Aplica un encuadre a `camera` dado un `fit` (centro + semi-extensiones)
 * y el aspect ratio del canvas — comparte la misma fórmula entre el
 * ResizeObserver (mount effect) y el efecto de grilla (cuando cambia el
 * extent), para no duplicarla en dos lugares.
 */
function applyOrthoFit(camera: THREE.OrthographicCamera, aspect: number, fit: OrthoFit): void {
  // viewSize = semi-altura de la vista; se toma el máximo entre lo que
  // exige la altura de la caja y lo que exige su ancho ya dividido por el
  // aspect ratio, así CUALQUIERA de las dos dimensiones que sea la más
  // restrictiva queda garantizada dentro del frustum.
  const viewSize = Math.max(fit.halfHeight, fit.halfWidth / aspect);
  camera.left = -viewSize * aspect;
  camera.right = viewSize * aspect;
  camera.top = viewSize;
  camera.bottom = -viewSize;
  camera.position.set(fit.centerEast, fit.centerNorth, fit.cameraZ);
  camera.lookAt(fit.centerEast, fit.centerNorth, 0);
  camera.updateProjectionMatrix();
}

const GIS_CSS = `
  .gis-module { position: relative; width: 100%; height: 100%; display: flex; }
  .gis-viewport { position: relative; flex: 1; min-width: 0; overflow: hidden; }
  .gis-viewport canvas { display: block; }
  .gis-mode-toggle {
    position: absolute; top: 12px; left: 12px; z-index: 10;
    display: flex; border: 1px solid rgba(0,244,255,.35);
    background: rgba(1,15,32,.85); font-family: 'Courier New', Courier, monospace;
  }
  .gis-mode-btn {
    padding: 6px 14px; font-size: .68rem; font-weight: 700; letter-spacing: .1em;
    text-transform: uppercase; color: var(--hud-text-dim); background: transparent; border: none;
    cursor: pointer; transition: background .15s, color .15s;
  }
  .gis-mode-btn.active { background: var(--hud-cyan); color: var(--hud-bg); }
  .gis-mode-btn:not(.active):hover { background: var(--hud-cyan-dim); color: var(--hud-text); }
  /* Barra lateral UNIFICADA: una sola caja continua con scroll vertical (antes
     eran varias sub-cajas con borde/fondo propios apiladas con gap). Ancho 338px
     (= 260 + 30%): más aire para las opciones que se veían apretadas. */
  .gis-side-panel {
    display: flex; flex-direction: column; flex-shrink: 0;
    width: 338px; overflow-y: auto;
    background: rgba(1,15,32,.94); border: 1px solid var(--hud-border);
    padding: 0 14px;
  }
  /* Secciones internas: dejan de ser cajas (sin borde/fondo/ancho fijo/scroll
     propio) y fluyen dentro de la barra, separadas solo por un divisor sutil —
     mismo orden y contenido, solo cambia la presentación. */
  .gis-side-panel > .gis-proj,
  .gis-side-panel > .gis-modules,
  .gis-side-panel > .gis-shp-import,
  .gis-side-panel > .gis-raster-import,
  .gis-side-panel > .gis-toc,
  .gis-side-panel > .gis-extent-editor {
    width: 100%; border: none; background: none; overflow: visible;
    padding: 14px 0; margin: 0;
    border-bottom: 1px solid rgba(0,244,255,.1);
  }
  /* Última sección real (Extensión con proyección; Proyección sola sin ella): sin divisor colgante. */
  .gis-side-panel > .gis-extent-editor:last-child,
  .gis-side-panel > .gis-proj:last-child { border-bottom: none; }
  /* Botón "Georreferenciar" (no es sub-caja): solo se le da aire vertical al perder el gap. */
  .gis-side-panel > .gis-georef-open-btn { margin: 12px 0; }
  /* Replegado: fuera del flujo flex por completo (no transparencia) — el lienzo ocupa el hueco. */
  .gis-side-panel.collapsed { display: none; }
  /* Flecha de repliegue — anclada al borde derecho del lienzo, así queda sobre la
     costura con el panel cuando está expandido y en el borde de pantalla cuando está
     replegado. Siempre visible en ambos estados. */
  .gis-panel-toggle {
    position: absolute; top: 50%; right: 0; transform: translateY(-50%); z-index: 10;
    width: 18px; height: 46px; padding: 0;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid rgba(0,244,255,.35); border-right: none; border-radius: 4px 0 0 4px;
    background: rgba(1,15,32,.85); color: var(--hud-cyan);
    font-family: 'Courier New', Courier, monospace; font-size: .9rem; line-height: 1;
    cursor: pointer; transition: background .15s;
  }
  .gis-panel-toggle:hover { background: rgba(0,244,255,.18); }
  .gis-georef-open-btn {
    width: 100%; padding: 6px 10px; font-family: 'Courier New', Courier, monospace;
    font-size: .64rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
    color: var(--hud-cyan); background: rgba(0,244,255,.08); border: 1px solid rgba(0,244,255,.35);
    cursor: pointer; transition: background .15s;
  }
  .gis-georef-open-btn:hover { background: rgba(0,244,255,.18); }
  .gis-import-warning {
    position: absolute; bottom: 12px; left: 12px; right: 12px; z-index: 10;
    background: rgba(40,28,0,.92); border: 1px solid rgba(255,204,0,.45);
    color: #ffcc00; font-family: 'Courier New', Courier, monospace; font-size: .66rem;
    padding: 8px 10px; display: flex; align-items: flex-start; gap: 8px; line-height: 1.4;
  }
  .gis-import-warning-close {
    background: none; border: none; color: #ffcc00; cursor: pointer; font-size: .7rem;
    flex-shrink: 0; padding: 0 2px;
  }
`;

/**
 * "¿Hay ≥1 gráfico publicado con ubicación válida?" derivado del
 * HidrogeoquimicaProjectState ya relevado + los puntos de QA/QC — chequeo
 * LIVIANO para colorear el ícono de Hidro SIN rasterizar (la rasterización real
 * solo ocurre al agregar la capa, en addHidro()). Espeja el filtro de
 * getPublishedCharts() en Hidrogeoquímica: un diagrama combinado cuenta si está
 * `published` con Este/Norte finitos; las tarjetas de Stiff cuentan si
 * `stiffPublished` y hay ≥1 muestra con coordenadas (lat/lon).
 */
function hasPublishedFromState(
  state: HidrogeoquimicaProjectState | null,
  hydroPoints: QaqcHydroPoint[],
): boolean {
  if (!state) return false;
  const combined = Object.values(state.chartLocations ?? {}).some(
    (c) => c.published && c.east != null && c.north != null,
  );
  const stiff = state.stiffPublished && hydroPoints.some((p) => p.lat != null && p.lon != null);
  return combined || stiff;
}

/**
 * Expuesto vía ref para el puente de Proyectos (Etapa 13) — mismo patrón
 * que HydrogeochemistryModuleHandle (HydrogeochemistryModule.tsx): las
 * funciones reales viven acá (donde vive el estado `extent`/`layers`),
 * main.tsx solo las conecta a listenForStateRequests().
 */
export interface GisViewportHandle {
  getProjectState: () => GisProjectState;
  loadProjectState: (state: GisProjectState) => void;
}

export const GisViewport = forwardRef<GisViewportHandle>(function GisViewport(_props, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<ViewMode>('2d');
  const [extent, setExtent] = useState<ProjectExtent>(DEFAULT_EXTENT);
  // Franjas del armazón de referencia 3D ("fish tank", Etapa 2) — estado
  // de SESIÓN en GIS, deliberadamente NO en ProjectExtent/Vector3DBox
  // (confirmado con el usuario: persistirlo se evalúa en su propia etapa
  // más adelante, no hace falta otra migración de esquema todavía).
  const [depthBands, setDepthBands] = useState(10);
  // Tamaño de celda de la grilla (Etapa 1 del sistema de grilla por
  // tamaño de celda real) — mismo criterio de estado de SESIÓN que
  // `depthBands`: NO vive en Vector3DBox/ProjectExtent, no se persiste
  // todavía. A diferencia de `depthBands` (una constante fija sin
  // relación con la caja), el DEFAULT acá sí depende de las dimensiones
  // de la caja inicial (`calculateDefaultCellSize` — eje más largo con
  // exactamente 10 divisiones) — pero solo se calcula UNA VEZ al montar
  // (inicializador perezoso de useState), igual que `depthBands`: si el
  // usuario cambia el ancho/alto de la caja después, `cellSize` NO se
  // recalcula solo, queda donde el usuario lo haya dejado (confirmado con
  // el usuario).
  const [cellSize, setCellSize] = useState(() => calculateDefaultCellSize(DEFAULT_EXTENT.box.width, DEFAULT_EXTENT.box.height));
  // Factor de reducción de las grillas internas de profundidad (Etapa 4)
  // — desactivado por defecto (grilla interna completa, comportamiento de
  // la Etapa 3 sin cambios). Mismo criterio de estado de SESIÓN que
  // `depthBands`/`cellSize`: no persistido. Separado en dos variables (el
  // toggle y el factor en sí) en vez de un solo "factor o null" para que
  // el usuario pueda dejar cargado un valor de N sin que apagar/prender
  // el toggle lo borre.
  const [reduceInternalGrid, setReduceInternalGrid] = useState(false);
  const [gridReductionFactor, setGridReductionFactor] = useState(2);
  // Tamaño de fuente de las etiquetas de coordenadas (Este/Norte de la
  // grilla) — mismo criterio de estado de SESIÓN que `cellSize`/
  // `depthBands`, no persistido. Completamente independiente del tamaño
  // de las etiquetas de cota del armazón (esas siguen con su tamaño fijo
  // — ver JSDoc de `buildCoordinateLabels` en gisGrid.ts).
  const [coordinateLabelFontSize, setCoordinateLabelFontSize] = useState(GRID_LABEL_WORLD_HEIGHT);
  // Arranca vacío — a diferencia de la Etapa 4-8 (sin fuentes de datos
  // reales todavía, así que unos "puntos de prueba" hardcodeados eran la
  // única forma de verificar visualmente el renderizado), el módulo ya
  // tiene fuentes reales (import de shapefile/ráster, capas integradas).
  // Mantener esas capas de prueba acá las habría persistido como si
  // fueran datos reales del usuario (ver getProjectState() más abajo, que
  // guarda toda capa type:'vector'/'raster' sin distinguir origen).
  const [layers, setLayers] = useState<GisLayer[]>([]);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const [showGeoreferencingTool, setShowGeoreferencingTool] = useState(false);
  // Medido UNA vez al montar, contra el gl real de la escena (ver más abajo,
  // mount effect) — null mientras no se haya medido todavía o si la
  // medición falla (sin WebGL, gl.getContext() devuelve null, etc.).
  // RasterImportButton.tsx lo muestra tal cual, sin ningún valor supuesto.
  const [maxTextureSize, setMaxTextureSize] = useState<number | null>(null);
  // Repliegue del panel lateral completo (importar/georreferenciar/tabla de
  // contenidos/extent) para dejar visible solo el lienzo 2D/3D. Estado de
  // SESIÓN, deliberadamente NO persistido (confirmado con el usuario): GIS
  // siempre arranca expandido: por eso un simple useState local, sin
  // collapsibleState.ts ni ningún otro mecanismo de persistencia. Al
  // replegarlo, `.gis-side-panel` pasa a display:none y sale del flujo flex,
  // así `.gis-viewport` (flex:1) crece solo hasta ocupar todo el ancho y el
  // ResizeObserver del mount effect reajusta cámaras + renderer.setSize().
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false);

  // extent.box.topElevation cambia si el usuario edita el formulario — el
  // fetch de más abajo es asíncrono (espera la respuesta de QA/QC) y
  // podría resolver después de un re-render, así que lee este valor por
  // ref (igual que modeRef más abajo) en vez de capturarlo directo del
  // closure del montaje, que quedaría con el valor de DEFAULT_EXTENT
  // congelado para siempre.
  const topElevationRef = useRef(extent.box.topElevation);
  useEffect(() => {
    topElevationRef.current = extent.box.topElevation;
  }, [extent.box.topElevation]);

  // ── Sección "Módulos": disponibilidad + disparo por clic ─────────────────
  // Reemplaza los 3 mount-effects automáticos anteriores (collars/trazas,
  // columnas, gráficos publicados) por un modelo de CLIC: al confirmarse la
  // proyección se SONDEA la disponibilidad de cada módulo (sin agregar nada);
  // el ícono queda gris/coloreado según haya datos, y recién el clic agrega la
  // capa. La capa de puntos crudos 'integrated-hidrogeo' se retiró: las
  // tarjetas de Stiff ya marcan la ubicación de las muestras.
  const [moduleAvail, setModuleAvail] = useState<Record<GisModuleKey, boolean>>({
    columnas: false, hidro: false, sondajes: false,
  });
  // `triggered` (persistido como triggeredModules): qué módulos activó el
  // usuario — intención, NO dato derivado. Al reabrir, se re-agregan solos si
  // su dato sigue disponible. `triggeredRef` lo espeja para que el efecto de
  // sondeo (async) lea el valor vigente sin re-suscribirse.
  const [triggered, setTriggered] = useState<Set<GisModuleKey>>(new Set());
  const triggeredRef = useRef<Set<GisModuleKey>>(triggered);
  useEffect(() => { triggeredRef.current = triggered; }, [triggered]);

  // Funciones "agregar/refrescar": piden el dato FRESCO y reemplazan la(s)
  // capa(s) del módulo (un segundo clic refresca con el estado actual). Cada
  // una actualiza también `moduleAvail` con lo que realmente llegó.
  async function addColumnas(): Promise<void> {
    const state = (await requestModuleStateFromParent('columnas-frame').catch(() => null)) as ColumnasProjectState | null;
    const layer = buildColumnasLayer(state, extent.projectionEPSG, 0);
    const avail = (layer.data as ColumnasLayerData).points.length > 0;
    setModuleAvail((a) => ({ ...a, columnas: avail }));
    setLayers((prev) => {
      const without = prev.filter((l) => l.id !== COLUMNAS_LAYER_ID);
      return avail ? [...without, { ...layer, order: without.length }] : without;
    });
  }

  async function addSondajes(): Promise<void> {
    // Un solo disparador combinado: collars SIEMPRE (si hay ≥1), más trazas
    // para los collars que tengan estaciones de Survey — misma fuente (QA/QC).
    const [collars, surveys] = await Promise.all([
      requestCollarsFromParent().catch(() => []),
      requestSurveysFromParent().catch(() => []),
    ]);
    const avail = collars.length > 0;
    setModuleAvail((a) => ({ ...a, sondajes: avail }));
    setLayers((prev) => {
      const without = prev.filter((l) => l.id !== COLLARS_LAYER_ID && l.id !== DRILLHOLES_LAYER_ID);
      if (!avail) return without;
      const collarsLayer = buildCollarsLayer(collars, without.length);
      const drillholesLayer = buildDrillholesLayer(collars, surveys, without.length + 1, topElevationRef.current);
      return [...without, collarsLayer, drillholesLayer];
    });
  }

  async function addHidro(): Promise<void> {
    // Atajo al sistema "Publicar en GIS": rasteriza y agrega los diagramas
    // combinados + las tarjetas de Stiff publicados (la rasterización solo
    // ocurre acá, en el clic — nunca en el sondeo de disponibilidad).
    const charts = await requestModuleChartsFromParent('hidro-frame').catch(() => null);
    setModuleAvail((a) => ({ ...a, hidro: (charts?.length ?? 0) > 0 }));
    const chartLayers = await buildHidrogeoChartLayers(charts, 0);
    const stiffLayer = await buildHidrogeoStiffLayer(charts, extent.projectionEPSG, 0);
    const hasStiff = (stiffLayer.data as HidrogeoStiffLayerData).items.length > 0;
    const newLayers = hasStiff ? [...chartLayers, stiffLayer] : chartLayers;
    setLayers((prev) => {
      const without = prev.filter((l) => !isHidrogeoChartLayerId(l.id) && l.id !== HIDROGEO_STIFF_LAYER_ID);
      const reordered = newLayers.map((l, i) => ({ ...l, order: without.length + i }));
      return [...without, ...reordered];
    });
  }

  function runAddFor(key: GisModuleKey): void {
    if (key === 'columnas') void addColumnas();
    else if (key === 'sondajes') void addSondajes();
    else void addHidro();
  }

  // Clic en un ícono: solo con datos. Marca el módulo como disparado
  // (persistente) y agrega/refresca su capa.
  function onActivateModule(key: GisModuleKey): void {
    if (!moduleAvail[key]) return;
    const next = new Set(triggeredRef.current); next.add(key);
    triggeredRef.current = next;
    setTriggered(next);
    runAddFor(key);
  }

  // Sondeo de disponibilidad al confirmarse la proyección (NO agrega nada) +
  // re-agregado automático de los módulos ya disparados (bandera persistida).
  // El sondeo de Hidro es LIVIANO: deriva "hay ≥1 gráfico publicado con
  // ubicación válida" del ProjectState ya relevado + los puntos de QA/QC, SIN
  // rasterizar (la rasterización real solo ocurre al agregar, en addHidro()).
  useEffect(() => {
    if (!extent.projectionEPSG) return;
    let cancelled = false;
    (async () => {
      const [cState, collars, hState, hPoints] = await Promise.all([
        requestModuleStateFromParent('columnas-frame').catch(() => null),
        requestCollarsFromParent().catch(() => []),
        requestModuleStateFromParent('hidro-frame').catch(() => null),
        requestHydroFromParent().catch(() => []),
      ]);
      if (cancelled) return;
      const columnasAvail = (buildColumnasLayer(cState as ColumnasProjectState | null, extent.projectionEPSG, 0).data as ColumnasLayerData).points.length > 0;
      const sondajesAvail = collars.length > 0;
      const hidroAvail = hasPublishedFromState(hState as HidrogeoquimicaProjectState | null, hPoints);
      setModuleAvail({ columnas: columnasAvail, sondajes: sondajesAvail, hidro: hidroAvail });
      if (triggeredRef.current.has('columnas') && columnasAvail) void addColumnas();
      if (triggeredRef.current.has('sondajes') && sondajesAvail) void addSondajes();
      if (triggeredRef.current.has('hidro') && hidroAvail) void addHidro();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extent.projectionEPSG]);

  // El loop de render (creado una vez en el useEffect de montaje) no puede
  // leer el `mode` de React directamente sin quedar con un closure
  // obsoleto — modeRef siempre tiene el valor más reciente.
  const modeRef = useRef<ViewMode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Refs a los objetos Three.js persistentes, para que el efecto de la
  // grilla (más abajo) pueda leerlos sin recrear la escena/cámaras/renderer.
  const sceneRef = useRef<THREE.Scene | null>(null);
  const orthoCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const perspCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const orthoFitRef = useRef<OrthoFit>({ centerEast: 0, centerNorth: 0, halfWidth: 40, halfHeight: 40, cameraZ: 100 });
  // "Cámara inicial a una distancia razonable" (computeCameraBounds) es
  // un setup de UNA sola vez, no algo que deba re-disparar cada vez que
  // el usuario edita el formulario y ya está orbitando en modo 3D.
  const perspInitializedRef = useRef(false);
  // Armazón de referencia 3D (Etapa 2) — ref al Group vigente para que el
  // efecto de visibilidad (ligado a `mode`, más abajo) pueda alternar
  // `.visible` sin reconstruir la geometría.
  const depthFrameRef = useRef<THREE.Object3D | null>(null);
  // Etiquetas de coordenadas (Este/Norte) + su dirección de mundo (Etapa
  // 3-4 de la orientación paralela) — poblado por el efecto de grilla cada
  // vez que se reconstruye (más abajo), leído en CADA frame dentro de
  // `animate()` (mount effect) para recalcular `sprite.material.rotation`.
  // Un ref, no estado de React: cambia 60 veces por segundo con la órbita
  // de la cámara, nada de esto debe pasar por un re-render.
  const coordinateLabelsRef = useRef<CoordinateLabelInfo[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── Escena base ──────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG_COLOR);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    // ── Cámaras ─────────────────────────────────────────────────
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    const aspect = width / height;

    const orthoCamera = new THREE.OrthographicCamera(-40 * aspect, 40 * aspect, 40, -40, 0.1, 100000);
    orthoCamera.up.set(0, 1, 0); // Norte arriba en pantalla — ver nota de ejes en el módulo
    applyOrthoFit(orthoCamera, aspect, orthoFitRef.current);

    const perspCamera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100000);
    perspCamera.up.set(0, 0, 1); // Z = elevación = arriba — ver nota de ejes en el módulo
    perspCamera.position.set(60, -60, 60);
    perspCamera.lookAt(0, 0, 0);

    // ── Renderer ────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    // Límite real de textura de la GPU (Etapa 17) — se mide UNA vez acá,
    // contra el gl del renderer QUE YA EXISTE (no se crea ningún contexto
    // WebGL aparte solo para esto). try/catch defensivo: si getContext()
    // devolviera null o gl.getParameter() lanzara por algún motivo, el
    // resto del módulo sigue funcionando igual — RasterImportButton.tsx
    // simplemente muestra el mensaje de respaldo con maxTextureSize=null.
    try {
      const gl = renderer.getContext();
      const raw = gl?.getParameter(gl.MAX_TEXTURE_SIZE);
      setMaxTextureSize(typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null);
    } catch {
      setMaxTextureSize(null);
    }

    // ── Controles de órbita — solo mueven la cámara de perspectiva;
    // se deshabilitan mientras el modo activo es 2D para no reaccionar a
    // eventos de mouse sobre una cámara que ni siquiera se está dibujando.
    const controls = new OrbitControls(perspCamera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enabled = modeRef.current === '3d';
    controls.update();

    sceneRef.current = scene;
    orthoCameraRef.current = orthoCamera;
    perspCameraRef.current = perspCamera;
    controlsRef.current = controls;

    // ── Orientación paralela de las etiquetas de coordenadas (Etapa 3-4)
    // — vectores de trabajo reusados en CADA frame (creados una sola vez
    // acá, no dentro de animate()) para no generar basura de GC a 60fps
    // con hasta ~80 etiquetas (ver medición de costo reportada al usuario).
    const scratchWorldPos = new THREE.Vector3();
    const scratchDirPoint = new THREE.Vector3();
    // Recalcula `sprite.material.rotation` de cada etiqueta de coordenada
    // proyectando con `camera` su posición real y un segundo punto
    // (posición + `worldDirection`) — el ángulo en pantalla entre ambos
    // proyectados es el ángulo que necesita el sprite para verse paralelo
    // a su línea, sea cual sea la orientación actual de `camera` (2D fijo
    // u orbitando libre en 3D). `Vector3.project()` MUTA el vector propio
    // (por eso `scratchWorldPos`/`scratchDirPoint` se leen en su forma
    // "mundo" ANTES de proyectar, guardando el punto+dirección en
    // `scratchDirPoint` antes de que `scratchWorldPos` se convierta en NDC).
    // Caso borde (línea de canto, dx=dy=0 tras proyectar — atan2(0,0)
    // indefinido): se deja la rotación sin cambiar ese frame, en vez de
    // forzar un ángulo arbitrario.
    function updateCoordinateLabelRotations(camera: THREE.Camera) {
      const labels = coordinateLabelsRef.current;
      for (let i = 0; i < labels.length; i++) {
        const { sprite, worldDirection } = labels[i];
        sprite.getWorldPosition(scratchWorldPos);
        scratchDirPoint.copy(scratchWorldPos).add(worldDirection);
        scratchWorldPos.project(camera);
        scratchDirPoint.project(camera);
        const dx = scratchDirPoint.x - scratchWorldPos.x;
        const dy = scratchDirPoint.y - scratchWorldPos.y;
        if (dx !== 0 || dy !== 0) {
          sprite.material.rotation = Math.atan2(dy, dx);
        }
      }
    }

    // ── Loop de render ──────────────────────────────────────────
    let frameId: number;
    function animate() {
      frameId = requestAnimationFrame(animate);
      const is3D = modeRef.current === '3d';
      controls.enabled = is3D;
      if (is3D) controls.update();
      const activeCamera = is3D ? perspCamera : orthoCamera;
      updateCoordinateLabelRotations(activeCamera);
      renderer.render(scene, activeCamera);
    }
    animate();

    // ── Resize — ResizeObserver en vez de window.resize para reaccionar
    // a cambios de tamaño del contenedor, no solo de la ventana. Usa el
    // último encuadre calculado por el efecto de grilla (orthoFitRef),
    // así el aspect ratio nuevo respeta la misma caja encuadrada.
    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      const a = w / h;

      applyOrthoFit(orthoCamera, a, orthoFitRef.current);

      perspCamera.aspect = a;
      perspCamera.updateProjectionMatrix();

      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // ── Cleanup — Three.js no libera memoria GPU sola: geometrías,
    // materiales y texturas necesitan dispose() explícito.
    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      scene.remove(ambientLight);

      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }

      sceneRef.current = null;
      orthoCameraRef.current = null;
      perspCameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  // ── Grilla + encuadre — se reconstruye cada vez que cambia el extent.
  // No toca escena/cámaras/renderer del efecto de montaje, solo agrega y
  // luego quita+dispose() la grilla, y reposiciona las cámaras.
  useEffect(() => {
    const scene = sceneRef.current;
    const orthoCamera = orthoCameraRef.current;
    const perspCamera = perspCameraRef.current;
    const controls = controlsRef.current;
    const container = containerRef.current;
    if (!scene || !orthoCamera || !perspCamera || !container) return;

    const grid = buildGridMesh(extent.box, cellSize, coordinateLabelFontSize);
    scene.add(grid);
    coordinateLabelsRef.current = (grid.userData.coordinateLabels as CoordinateLabelInfo[] | undefined) ?? [];

    // Armazón de referencia de profundidad (Etapa 2, "fish tank") —
    // depende de la MISMA box que la grilla, así que se reconstruye en
    // este mismo efecto (agregado a `depthBands` en las dependencias de
    // abajo). Arranca oculto (`visible = false`); el efecto separado
    // ligado a `mode` (más abajo) decide su visibilidad real — evita que
    // aparezca un frame en 3D durante el instante entre que este efecto
    // corre y el de `mode` corre por primera vez.
    const effectiveGridReductionFactor = reduceInternalGrid ? gridReductionFactor : 1;
    const depthFrame = buildDepthFrame(extent.box, depthBands, cellSize, effectiveGridReductionFactor);
    depthFrame.visible = false;
    scene.add(depthFrame);
    depthFrameRef.current = depthFrame;

    // Encuadre 2D: AABB de la caja interior SOLA (sin márgenes) — se
    // reusa computeCameraBounds con márgenes en 0 para no duplicar la
    // fórmula del AABB rotado acá.
    const innerBounds = computeCameraBounds(extent.box, { horizontalMargin: 0, verticalMargin: 0 });
    const halfWidth = ((innerBounds.max.x - innerBounds.min.x) / 2) * FRAME_PADDING;
    const halfHeight = ((innerBounds.max.y - innerBounds.min.y) / 2) * FRAME_PADDING;
    orthoFitRef.current = {
      centerEast: extent.box.centerEast,
      centerNorth: extent.box.centerNorth,
      halfWidth,
      halfHeight,
      // Por encima de topElevation, con margen — no un valor fijo (ver
      // nota en OrthoFit sobre el bug real que causaba un cameraZ fijo).
      cameraZ: extent.box.topElevation + Math.max(halfWidth, halfHeight, 100),
    };
    const aspect = (container.clientWidth || 1) / (container.clientHeight || 1);
    applyOrthoFit(orthoCamera, aspect, orthoFitRef.current);

    return () => {
      scene.remove(grid);
      disposeObject3D(grid);
      scene.remove(depthFrame);
      disposeObject3D(depthFrame);
      depthFrameRef.current = null;
      coordinateLabelsRef.current = [];
    };
  }, [extent, depthBands, cellSize, reduceInternalGrid, gridReductionFactor, coordinateLabelFontSize]);

  // ── Visibilidad del armazón de referencia — SOLO modo 3D, nunca 2D
  // (cámara ortográfica cenital: ver rectángulos concéntricos desde
  // arriba sería puro ruido, y las 4 verticales colapsarían a un punto).
  // Efecto SEPARADO del de arriba a propósito: alternar 2D/3D no debe
  // reconstruir la geometría del armazón, solo su bandera `.visible` —
  // Three.js corta la recursión de render ahí mismo para un Group con
  // visible=false (no es un simple opacity:0, es un skip real de toda la
  // subrama en cada frame).
  //
  // Este mismo efecto también dispara, la PRIMERA vez que `mode` pasa a
  // '3d', el posicionamiento inicial de la cámara de perspectiva —
  // reubicado acá (antes vivía en el efecto de arriba, disparado en el
  // montaje) porque ese efecto corre YA en el primer render, con
  // `extent.box` todavía en su valor de DEFAULT_EXTENT (topElevation=1000/
  // bottomElevation=500) — antes de que el usuario haya tocado un solo
  // campo del formulario. Como `perspInitializedRef` es un flag de una
  // sola vez por montaje, ese disparo temprano dejaba SIEMPRE encuadrada
  // la cámara para la caja por defecto, sin importar qué cotas reales
  // configurara el usuario después (bug real: cajas en cotas absolutas
  // lejos de cero, ej. 3200/2800 msnm, típicas en minería, quedaban casi
  // totalmente fuera de cuadro la primera vez que se entraba a 3D). Acá,
  // en cambio, el modo 3D solo es alcanzable después de que
  // `hasProjection` sea true (ver el gate de proyección más abajo en el
  // JSX, que oculta el toggle 2D/3D hasta entonces) — momento en el que
  // el usuario casi siempre ya terminó de configurar ancho/alto/cotas, así
  // que `extent.box` refleja su caja real, no el default.
  useEffect(() => {
    const frame = depthFrameRef.current;
    if (frame) frame.visible = mode === '3d';

    if (mode === '3d' && !perspInitializedRef.current) {
      const perspCamera = perspCameraRef.current;
      const controls = controlsRef.current;
      if (perspCamera) {
        perspInitializedRef.current = true;
        const outerBounds = computeCameraBounds(extent.box, extent.cameraBounds);
        const diagonal = outerBounds.max.clone().sub(outerBounds.min).length();
        const offset = new THREE.Vector3(1, -1, 1).normalize().multiplyScalar(diagonal * 0.6);
        // Centro real de la caja en Z: (topElevation+bottomElevation)/2, NO
        // un Z=0 fijo (mismo bug de fondo explicado arriba) — el `offset`
        // ya venía bien calculado (deriva de `outerBounds`, que sí usa
        // topElevation/bottomElevation reales vía computeCameraBounds); el
        // único valor que faltaba corregir era este centro.
        const center = new THREE.Vector3(
          extent.box.centerEast,
          extent.box.centerNorth,
          (extent.box.topElevation + extent.box.bottomElevation) / 2,
        );
        perspCamera.position.copy(center).add(offset);
        perspCamera.lookAt(center);
        if (controls) {
          controls.target.copy(center);
          controls.update();
        }
      }
    }
  }, [mode, extent, depthBands, cellSize, reduceInternalGrid, gridReductionFactor]);

  // ── Capas — se reconstruyen cada vez que cambia `layers` (visibilidad,
  // orden o color). Una capa oculta simplemente no se construye acá, así
  // que nunca llega a agregarse a la escena. El orden de dibujo va de
  // abajo hacia arriba de la lista (mayor `order` primero) para que las
  // de más arriba queden encima — mismo criterio que QGIS/ArcGIS, ver
  // LayerTableOfContents.tsx.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const layersGroup = new THREE.Group();
    layersGroup.name = 'gis-layers';

    const visibleByDrawOrder = layers
      .filter((l) => l.visible)
      .slice()
      .sort((a, b) => b.order - a.order); // mayor order (más abajo en la lista) primero

    visibleByDrawOrder.forEach((layer, i) => {
      // defaultElevation: geometría GeoJSON importada (Etapa 6) no trae Z
      // propia — se "drapea" a topElevation. SyntheticPointData (Etapa 4)
      // ignora este valor, ya trae su propia elevación por punto.
      const mesh = buildLayerMesh(layer, i, extent.box.topElevation);
      if (mesh) layersGroup.add(mesh);
    });

    scene.add(layersGroup);

    return () => {
      scene.remove(layersGroup);
      disposeObject3D(layersGroup);
    };
  }, [layers, extent.box.topElevation]);

  // ── Puente de Proyectos (Etapa 13) ───────────────────────────────
  // getProjectState(): solo capas IMPORTADAS (no 'integrated-*' — ver
  // GisProjectState en gisTypes.ts), envuelto en structuredClone() (mismo
  // patrón que getQaqcProjectState()/HydrogeochemistryModule.getProjectState()
  // — copia segura de retener, sin referencias vivas al estado interno de
  // React). loadProjectState(): reemplaza extent (si el proyecto guardado
  // tenía uno — `null` significa "nunca se configuró", se deja el actual)
  // y las capas importadas, PRESERVANDO las 'integrated-*' que ya estén
  // presentes (fetched al montar, en cualquier orden relativo a cuándo
  // llegue este load — ver nota de Etapa 9/11 sobre por qué esos efectos
  // re-agregan sus capas por id sin importar el estado previo de `layers`).
  useImperativeHandle(ref, () => ({
    getProjectState: (): GisProjectState => structuredClone({
      extent,
      layers: layers.filter((l) => !l.type.startsWith('integrated-')),
      // Solo la bandera de intención — las capas 'integrated-*' NO se persisten
      // (se recalculan frescas al reabrir vía el efecto de sondeo).
      triggeredModules: [...triggered],
    }),
    loadProjectState: (state: GisProjectState) => {
      if (state.extent) setExtent(state.extent);
      setLayers((prev) => {
        const integratedOnly = prev.filter((l) => l.type.startsWith('integrated-'));
        return [...integratedOnly, ...state.layers];
      });
      // Restaura la intención del usuario; el efecto de sondeo (disparado por
      // el cambio de projectionEPSG del extent recién cargado) re-agrega las
      // capas de estos módulos si su dato sigue disponible — sin re-clic.
      // triggeredRef se sincroniza de inmediato para que ese efecto async lo lea.
      const trig = new Set((state.triggeredModules ?? []) as GisModuleKey[]);
      triggeredRef.current = trig;
      setTriggered(trig);
    },
  }), [extent, layers, triggered]);

  // ── Puerta de proyección obligatoria (Etapa 15) ──────────────────────
  // hasProjection: mientras sea false, el resto del módulo (importar
  // capas, ver integraciones automáticas, ajustar extent) queda oculto
  // detrás del panel-puerta de abajo — ver JSX. hasAnyLayerData: una vez
  // true, la proyección se bloquea para edición (layerHasData() filtra
  // capas 'integrated-*' o importadas SIN datos reales todavía, para que
  // una capa recién agregada pero aún vacía no bloquee de más).
  const hasProjection = !!extent.projectionEPSG;
  const hasAnyLayerData = layers.some(layerHasData);

  return (
    <div className="gis-module">
      <style>{HUD_THEME_CSS}</style>
      <style>{GIS_CSS}</style>
      <div className="gis-viewport" ref={containerRef}>
        {hasProjection && (
          <div className="gis-mode-toggle">
            <button
              type="button"
              className={`gis-mode-btn${mode === '2d' ? ' active' : ''}`}
              onClick={() => setMode('2d')}
            >
              2D
            </button>
            <button
              type="button"
              className={`gis-mode-btn${mode === '3d' ? ' active' : ''}`}
              onClick={() => setMode('3d')}
            >
              3D
            </button>
          </div>
        )}
        {hasProjection && importWarning && (
          <div className="gis-import-warning">
            <span>{importWarning}</span>
            <button
              type="button"
              className="gis-import-warning-close"
              onClick={() => setImportWarning(null)}
              title="Cerrar"
            >
              ✕
            </button>
          </div>
        )}
        <button
          type="button"
          className="gis-panel-toggle"
          onClick={() => setSidePanelCollapsed((c) => !c)}
          title={sidePanelCollapsed ? 'Mostrar panel lateral' : 'Ocultar panel lateral'}
          aria-label={sidePanelCollapsed ? 'Mostrar panel lateral' : 'Ocultar panel lateral'}
        >
          {sidePanelCollapsed ? '‹' : '›'}
        </button>
      </div>
      <div className={`gis-side-panel${sidePanelCollapsed ? ' collapsed' : ''}`}>
        {/* Proyección SIEMPRE primero — sin ella el módulo no funciona. Cuando
            no hay proyección elegida, es lo único que se muestra (con su
            descripción-guía); el resto aparece recién con proyección confirmada. */}
        <ProjectionSelector
          projectionEPSG={extent.projectionEPSG}
          locked={hasAnyLayerData}
          onChange={(epsg) => setExtent({ ...extent, projectionEPSG: epsg })}
        />
        {hasProjection && (
          <>
            <GisModulesPanel available={moduleAvail} added={triggered} onActivate={onActivateModule} />
            <ShapefileImportButton
              targetEPSG={extent.projectionEPSG}
              existingLayerCount={layers.length}
              onImported={(layer) => setLayers((prev) => [...prev, layer])}
              onWarning={setImportWarning}
            />
            <RasterImportButton
              targetEPSG={extent.projectionEPSG}
              existingLayerCount={layers.length}
              onImported={(layer) => setLayers((prev) => [...prev, layer])}
              onWarning={setImportWarning}
              maxTextureSize={maxTextureSize}
            />
            <button
              type="button"
              className="gis-georef-open-btn"
              onClick={() => setShowGeoreferencingTool(true)}
            >
              + Georreferenciar PDF/imagen
            </button>
            <LayerTableOfContents layers={layers} onChange={setLayers} />
            <ExtentEditor
              value={extent} onChange={setExtent} layers={layers}
              depthBands={depthBands} onDepthBandsChange={setDepthBands}
              cellSize={cellSize} onCellSizeChange={setCellSize}
              reduceInternalGrid={reduceInternalGrid} onReduceInternalGridChange={setReduceInternalGrid}
              gridReductionFactor={gridReductionFactor} onGridReductionFactorChange={setGridReductionFactor}
              coordinateLabelFontSize={coordinateLabelFontSize} onCoordinateLabelFontSizeChange={setCoordinateLabelFontSize}
            />
          </>
        )}
      </div>
      {hasProjection && showGeoreferencingTool && (
        <GeoreferencingTool
          targetEPSG={extent.projectionEPSG}
          existingLayerCount={layers.length}
          onCancel={() => setShowGeoreferencingTool(false)}
          onImported={(layer) => {
            setLayers((prev) => [...prev, layer]);
            setShowGeoreferencingTool(false);
          }}
        />
      )}
    </div>
  );
});
