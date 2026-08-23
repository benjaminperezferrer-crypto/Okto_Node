/**
 * src/estructural/EstructuralWorkspace.tsx
 * Etapa 3 del rediseño a pestañas múltiples — UN espacio de trabajo
 * independiente: selector de archivo QA/QC (Etapa 2) + clasificación/
 * filtro + ambos diagramas, exactamente lo que antes vivía directo en
 * AnalisisEstructuralModule.tsx cuando solo existía un espacio de
 * trabajo único. Ese componente pasa a ser un "shell" de pestañas — ver
 * su JSDoc — que monta UNA instancia de este componente por vez (la
 * pestaña activa), con `key` distinta por pestaña para forzar un
 * remount limpio al cambiar.
 *
 * ── Por qué remount, no un `loadState()` imperativo, al restaurar ──────
 * A diferencia del nivel superior (AnalisisEstructuralModule.tsx,
 * necesita seguir usando refs + setTimeout porque `loadProjectState()`
 * le llega por postMessage cross-frame, con una carrera real entre eso y
 * el primer montaje), acá NO hay postMessage de por medio — el padre
 * tiene `initialState` disponible de forma SÍNCRONA antes de renderizar
 * este componente. La restauración de clasificación/familias/toggles
 * ocurre en un solo `useEffect(() => {...}, [])` que corre una vez
 * apenas este componente (re)monta — sin macrotareas ni condiciones de
 * carrera, porque los refs de los hijos ya están poblados en el momento
 * en que React ejecuta los efectos (después del commit). El estilo de
 * ambos diagramas es la única excepción: se sigue leyendo por
 * inicializador perezoso desde localStorage (namespaced por `tabId`, ver
 * chartStyleIds.ts) — el padre garantiza que esa clave YA tiene el valor
 * correcto ANTES de que este componente exista (escritura síncrona en
 * loadProjectState()/al crear la pestaña), así que ni siquiera hace
 * falta un remount adicional para el estilo acá.
 *
 * ── Cambiar de archivo DENTRO de una pestaña ya montada ─────────────────
 * `fileChangeGeneration` (interno, no viaja al padre) — se incrementa
 * cada vez que el usuario elige un archivo distinto en el `<select>` y
 * fuerza un remount INTERNO de ClassificationFilterPanel/StereonetPlanes/
 * RoseDiagram (vía `key`), reseteando clasificación/filtro/familias/modo
 * comparación a sus defaults — confirmado explícitamente: los valores
 * viejos hacen referencia a campos/measurementIds del archivo ANTERIOR,
 * que pueden no existir en el nuevo. El estilo de los diagramas NO se
 * resetea acá (es apariencia, no depende del dataset) — por eso el
 * efecto de restauración inicial de arriba solo corre en
 * `fileChangeGeneration === 0` (la carga original de la pestaña, nunca
 * un cambio de archivo posterior).
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import StereonetPlanes, { KambScaleBar } from './StereonetPlanes';
import RoseDiagram from './RoseDiagram';
import type { StereonetPlanesHandle, StereonetDisplayState } from './StereonetPlanes';
import type { RoseDiagramHandle } from './RoseDiagram';
import ClassificationFilterPanel from './ClassificationFilterPanel';
import type { ClassificationFilterResult, ClassificationFilterPanelHandle } from './ClassificationFilterPanel';
import type { PlanarMeasurement } from './structuralTypes';
import type { QaqcStructuralFileRef } from '../projectBridge';
import { ChartStyleSettings, loadChartStyleMap, saveChartStyleMap, DEFAULT_PLANE_SYMMETRIC } from '../shared/chartStyle';
import { ChartStyleEditor } from '../shared/ChartStyleEditor';
import { ExportButton } from '../shared/ExportButton';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { CHART_STYLE_EDITOR_CSS } from './chartStyleEditorCss';
import { structuralChartStyleStorageKey } from './chartStyleIds';
import type { EstructuralTabState } from './structuralProjectTypes';
import type { FilterPreset } from './filterPresets';
import { createCrossHighlightBus } from './crossHighlight';
import { computeFisherStats } from './stereonet';
import { exportReportFigure } from './exportReportFigure';
import { getClassifiableFieldLabel } from './classification';

/** Nivel de confianza del cono de Fisher — compartido entre el toggle (etiqueta) y el diagrama. Ver computeFisherStats(). */
const FISHER_CONFIDENCE_LEVEL = 0.95;
const STEREONET_STYLE_ID = 'stereonet' as const;
const ROSE_STYLE_ID = 'rose' as const;

/** Tamaño de sector angular compartido por StereonetPlanes/RoseDiagram — ver JSDoc histórico en AnalisisEstructuralModule.tsx (resaltado cruzado). */
const ROSE_BIN_SIZE_DEG = 10;

export const DEFAULT_CLASSIFICATION_STATE: EstructuralTabState['classification'] = {
  field: null,
  filters: {},
  filterFields: [],
  showSymbols: false,
  comparisonMode: {
    enabled: false,
    groupA: { label: 'Grupo A', filters: {} },
    groupB: { label: 'Grupo B', filters: {} },
  },
};
export const DEFAULT_STEREONET_DISPLAY: EstructuralTabState['displayToggles']['stereonet'] = {
  showPoles: true, showPlanes: true, showLines: true, showKamb: false, showMeanPole: false, showConfidenceCone: false,
};
export const DEFAULT_ROSE_DISPLAY: EstructuralTabState['displayToggles']['rose'] = {
  showPlanes: true, showLines: true,
};

/** Todo lo que este componente sabe reportar sobre sí mismo — el padre le agrega `id`/`name` (que NO gestiona este componente, ver AnalisisEstructuralModule.tsx) para reconstruir un EstructuralTabState completo. */
export type EstructuralWorkspaceState = Omit<EstructuralTabState, 'id' | 'name'>;

export interface EstructuralWorkspaceHandle {
  getWorkspaceState: () => EstructuralWorkspaceState;
  /** Delega directo a ClassificationFilterPanelHandle.getPresets() — ver JSDoc de estructuralProjectTypes.ts sobre por qué presets son GLOBALES: cualquier pestaña montada tiene la MISMA lista (localStorage compartido), no hace falta que sea justo esta. */
  getFilterPresets: () => FilterPreset[];
  setFilterPresetsFromProject: (merged: FilterPreset[]) => void;
}

export interface EstructuralWorkspaceProps {
  /** Namespace de localStorage para el estilo de AMBOS diagramas (Etapa 3) — normalmente el id de esta pestaña. */
  tabId: string;
  /** Leído UNA sola vez, en inicializadores perezosos / el efecto de montaje — este componente se remonta por completo (key distinta) cada vez que el padre necesita aplicarle un estado distinto, nunca actualiza en caliente. */
  initialState: EstructuralWorkspaceState;
  /** Pool COMPLETO de mediciones de QA/QC (todas las pestañas comparten el mismo fetch) — este componente filtra por su propio `qaqcFileId`. */
  qaqcMeasurements: PlanarMeasurement[];
  availableFiles: QaqcStructuralFileRef[];
  filesWithoutValidRows: QaqcStructuralFileRef[];
}

const EstructuralWorkspace = forwardRef<EstructuralWorkspaceHandle, EstructuralWorkspaceProps>(function EstructuralWorkspace({
  tabId,
  initialState,
  qaqcMeasurements,
  availableFiles,
  filesWithoutValidRows,
}, ref) {
  const [selectedFileId, setSelectedFileId] = useState<number | null>(initialState.qaqcFileId);
  // Cambiar de archivo reinicia clasificación/filtro/familias/toggles —
  // ver JSDoc de archivo. 0 = todavía en la carga original (el efecto de
  // restauración de abajo debe correr); >0 = el usuario ya cambió de
  // archivo al menos una vez (ese efecto NO debe volver a correr).
  const [fileChangeGeneration, setFileChangeGeneration] = useState(0);

  const panelRef = useRef<ClassificationFilterPanelHandle>(null);
  const stereonetHandleRef = useRef<StereonetPlanesHandle>(null);
  const roseHandleRef = useRef<RoseDiagramHandle>(null);
  const crossHighlightBusRef = useRef(createCrossHighlightBus());
  const stereonetContainerRef = useRef<HTMLDivElement>(null);
  const roseContainerRef = useRef<HTMLDivElement>(null);
  const [reportFormat, setReportFormat] = useState<'png' | 'svg'>('png');
  const [reportExporting, setReportExporting] = useState(false);

  // ── Estilo de AMBOS gráficos + toggles avanzados del estereograma —
  // SUBIDOS acá desde StereonetPlanes/RoseDiagram (etapa de reorganización
  // visual): los editores de estilo y los toggles avanzados se renderizan en
  // la columna izquierda (bajo el panel de filtro/clasificación), no debajo de
  // cada gráfico. Se conservan las MISMAS claves de localStorage
  // (structuralChartStyleStorageKey) — por eso getWorkspaceState() sigue
  // leyendo el estilo desde ahí sin cambios. Inicializador perezoso: el padre
  // ya escribió la clave correcta antes de montar (ver JSDoc de archivo).
  const stereonetStyleKey = structuralChartStyleStorageKey(STEREONET_STYLE_ID, tabId);
  const roseStyleKey = structuralChartStyleStorageKey(ROSE_STYLE_ID, tabId);
  const [stereonetStyle, setStereonetStyle] = useState<ChartStyleSettings>(
    () => loadChartStyleMap(stereonetStyleKey, [STEREONET_STYLE_ID])[STEREONET_STYLE_ID],
  );
  const [roseStyle, setRoseStyle] = useState<ChartStyleSettings>(
    () => loadChartStyleMap(roseStyleKey, [ROSE_STYLE_ID])[ROSE_STYLE_ID],
  );
  useEffect(() => { saveChartStyleMap(stereonetStyleKey, { [STEREONET_STYLE_ID]: stereonetStyle }); }, [stereonetStyle]);
  useEffect(() => { saveChartStyleMap(roseStyleKey, { [ROSE_STYLE_ID]: roseStyle }); }, [roseStyle]);
  // Toggles de despliegue del estereograma (básicos + avanzados) — controlados
  // acá para poder renderizar los avanzados en la izquierda. Los de la roseta
  // siguen internos a RoseDiagram (no tiene toggles avanzados que mover).
  const [stereonetDisplay, setStereonetDisplay] = useState<StereonetDisplayState>(initialState.displayToggles.stereonet);

  // Opacidad: mismo criterio de rendimiento que antes vivía en StereonetPlanes
  // — arrastrar el slider escribe la opacidad DIRECTO en el DOM (setLiveOpacity
  // vía el handle, sin re-render de ~4000 elementos) y recién 150 ms después
  // del último tick se hace el commit real al estado. El resto de los campos
  // del editor sigue el camino normal sin debounce.
  const opacityCommitTimer = useRef<number | null>(null);
  function updateStereonetStyle(patch: Partial<ChartStyleSettings>) {
    const keys = Object.keys(patch);
    if (keys.length === 1 && keys[0] === 'opacity' && typeof patch.opacity === 'number') {
      stereonetHandleRef.current?.setLiveOpacity(patch.opacity);
      if (opacityCommitTimer.current !== null) window.clearTimeout(opacityCommitTimer.current);
      const opacityValue = patch.opacity;
      opacityCommitTimer.current = window.setTimeout(() => {
        setStereonetStyle((prev) => ({ ...prev, opacity: opacityValue }));
        opacityCommitTimer.current = null;
      }, 150);
      return;
    }
    setStereonetStyle((prev) => ({ ...prev, ...patch }));
  }
  useEffect(() => () => {
    if (opacityCommitTimer.current !== null) window.clearTimeout(opacityCommitTimer.current);
  }, []);
  function updateRoseStyle(patch: Partial<ChartStyleSettings>) {
    setRoseStyle((prev) => ({ ...prev, ...patch }));
  }

  // Restauración de la carga ORIGINAL de esta pestaña — ver JSDoc de
  // archivo para por qué esto no necesita setTimeout/macrotareas acá (a
  // diferencia del nivel superior, que sí lo necesita por el postMessage
  // cross-frame). No depende de `initialState` a propósito (solo debe
  // correr en el montaje real, nunca de nuevo si `initialState` cambiara
  // de identidad sin remount) — el lint de deps se ignora a propósito.
  useEffect(() => {
    if (fileChangeGeneration !== 0) return;
    panelRef.current?.loadState(initialState.classification);
    stereonetHandleRef.current?.loadFamilies(initialState.families);
    // El display del estereograma ya se restauró vía el inicializador de
    // `stereonetDisplay` (arriba) — se controla desde este componente, no por handle.
    roseHandleRef.current?.loadDisplayState(initialState.displayToggles.rose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Alineación vertical estereograma ↔ roseta ──────────────────────────
  // El estereograma tiene más filas de controles arriba de su gráfico que la
  // roseta (el selector Schmidt/Wulff de StereonetBase, que la roseta no tiene,
  // + una barra de capas con más botones que envuelve distinto según el ancho),
  // así que su título+círculo arrancan más abajo que los de la roseta. Igualamos
  // la altura de la "zona de controles" de ambas columnas empujando hacia abajo
  // el <svg> de la más corta, de modo que ambos gráficos arranquen al mismo
  // nivel. El desfase depende del ancho (los toolbars envuelven distinto), por
  // eso se recalcula con un ResizeObserver en cada relayout, en vez de reservar
  // una altura fija — que se rompería al redimensionar. El <svg> es el primer
  // (y único) SVG de cada contenedor; la leyenda va dentro de ese mismo <svg>.
  useLayoutEffect(() => {
    const sc = stereonetContainerRef.current;
    const rc = roseContainerRef.current;
    if (!sc || !rc) return;
    const equalize = () => {
      const sSvg = sc.querySelector('svg');
      const rSvg = rc.querySelector('svg');
      if (!sSvg || !rSvg) return;
      // Resetear compensación previa antes de medir la altura NATURAL de cada zona.
      sSvg.style.marginTop = '';
      rSvg.style.marginTop = '';
      const scTop = sc.getBoundingClientRect().top;
      const rcTop = rc.getBoundingClientRect().top;
      // Solo alinear cuando ambas columnas están en la MISMA fila (lado a lado).
      // En pantallas angostas el contenedor hace flex-wrap y las apila; ahí sus
      // tops difieren mucho y no hay "mismo nivel" que igualar — dejar sin
      // compensación (si no, quedaría un hueco espurio sobre la columna de abajo).
      if (Math.abs(scTop - rcTop) > 60) return;
      const sHead = sSvg.getBoundingClientRect().top - scTop;
      const rHead = rSvg.getBoundingClientRect().top - rcTop;
      const delta = sHead - rHead;
      if (delta > 0) rSvg.style.marginTop = `${delta}px`;
      else if (delta < 0) sSvg.style.marginTop = `${-delta}px`;
    };
    const ro = new ResizeObserver(equalize);
    ro.observe(sc);
    ro.observe(rc);
    equalize();
    return () => ro.disconnect();
  }, [selectedFileId, fileChangeGeneration]);

  function handleFileChange(newFileId: number | null) {
    setSelectedFileId(newFileId);
    setFileChangeGeneration((g) => g + 1);
    // Cambiar de archivo reinicia también los toggles del estereograma (antes
    // lo hacía el remount interno; ahora que el estado vive acá, se resetea a
    // mano para conservar ese comportamiento). El estilo NO se resetea (es
    // apariencia, no depende del dataset — mismo criterio de siempre).
    setStereonetDisplay(DEFAULT_STEREONET_DISPLAY);
  }

  useImperativeHandle(ref, () => ({
    getWorkspaceState: (): EstructuralWorkspaceState => ({
      qaqcFileId: selectedFileId,
      classification: panelRef.current?.getState() ?? DEFAULT_CLASSIFICATION_STATE,
      chartStyles: {
        stereonet: loadChartStyleMap(structuralChartStyleStorageKey('stereonet', tabId), ['stereonet'])['stereonet'],
        rose: loadChartStyleMap(structuralChartStyleStorageKey('rose', tabId), ['rose'])['rose'],
      },
      families: structuredClone(stereonetHandleRef.current?.getFamilies() ?? []),
      displayToggles: {
        stereonet: stereonetDisplay,
        rose: roseHandleRef.current?.getDisplayState() ?? DEFAULT_ROSE_DISPLAY,
      },
    }),
    getFilterPresets: () => panelRef.current?.getPresets() ?? [],
    setFilterPresetsFromProject: (merged) => panelRef.current?.setPresetsFromProject(merged),
  }), [selectedFileId, tabId, stereonetDisplay]);

  const selectedFileMeasurements = useMemo(
    () => (selectedFileId != null ? qaqcMeasurements.filter((m) => m.sourceFileId === selectedFileId) : []),
    [qaqcMeasurements, selectedFileId],
  );

  async function handleExportReportFigure(result: ClassificationFilterResult) {
    const stereonetSvg = stereonetContainerRef.current?.querySelector('svg');
    const roseSvg = roseContainerRef.current?.querySelector('svg');
    if (!stereonetSvg || !roseSvg) return;
    setReportExporting(true);
    try {
      const legendEntries = result.field ? Object.entries(result.colors).map(([label, color]) => ({ label, color })) : [];
      const classificationLabel = result.field ? getClassifiableFieldLabel(result.field) : null;
      const fisherStats = computeFisherStats(result.measurements);
      await exportReportFigure(
        { stereonetSvg, roseSvg, legendEntries, classificationLabel, fisherStats, measurementCount: result.measurements.length },
        reportFormat,
        `figura-informe-estructural.${reportFormat}`,
      );
    } finally {
      setReportExporting(false);
    }
  }

  return (
    <>
      <div className="hud-sub" style={{ marginBottom: 16 }}>
        {availableFiles.length === 0 && 'No hay archivos de estructuras cargados en QA/QC todavía.'}
        {availableFiles.length > 0 && selectedFileId == null && 'Elige un archivo de estructuras para esta pestaña.'}
        {selectedFileId != null
          && `${selectedFileMeasurements.length} medición(es) de "${availableFiles.find((f) => f.id === selectedFileId)?.name ?? ''}".`}
      </div>

      {availableFiles.length > 0 && (
        <div className="hud-panel" style={{ padding: 14, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8, width: 'fit-content' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="hgm-sub-label" style={{ margin: 0 }}>Archivo de estructuras</span>
            <select
              className="hud-select"
              value={selectedFileId ?? ''}
              onChange={(e) => handleFileChange(e.target.value === '' ? null : Number(e.target.value))}
              data-testid="qaqc-file-select"
              title="Cada pestaña se alimenta de UN solo archivo de QA/QC — nunca combinación automática, elige cuál explícitamente. Cambiarlo reinicia clasificación/filtro/familias de esta pestaña."
            >
              <option value="">Elige un archivo…</option>
              {availableFiles.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          {filesWithoutValidRows.length > 0 && (
            <div className="hud-empty-note" data-testid="qaqc-files-without-valid-rows-warning">
              {filesWithoutValidRows.length} archivo(s) de estructuras sin ninguna medición válida (revisa que Tipo/Azimut/Dip
              estén mapeados en QA/QC): {filesWithoutValidRows.map((f) => f.name).join(', ')}.
            </div>
          )}
        </div>
      )}

      {availableFiles.length === 0 && (
        <div className="hud-empty-note">
          Carga y mapea un archivo de tipo "Datos estructurales" en QA/QC (con al menos Tipo/Azimut/Dip mapeados) para
          empezar acá.
        </div>
      )}

      {availableFiles.length > 0 && selectedFileId == null && (
        <div className="hud-empty-note">Elige un archivo arriba para ver sus diagramas.</div>
      )}

      {selectedFileId != null && (
      <ClassificationFilterPanel
        key={`panel-${fileChangeGeneration}`}
        ref={panelRef}
        measurements={selectedFileMeasurements}
        belowPanel={(result: ClassificationFilterResult) => {
          // Toggles avanzados del estereograma (movidos desde el gráfico a la
          // columna izquierda). Kamb se OCULTA en modo comparación; las
          // etiquetas de plano-polo medio/cono cambian a "(por grupo)" — misma
          // lógica que tenían antes dentro de StereonetPlanes.
          const cmp = result.comparisonGroups;
          const advToggles: { key: keyof StereonetDisplayState; label: string }[] = [
            ...(cmp ? [] : [{ key: 'showKamb' as const, label: 'Densidad (Kamb)' }]),
            { key: 'showMeanPole', label: cmp ? 'Plano/polo medio (por grupo)' : 'Plano/polo medio' },
            { key: 'showConfidenceCone', label: `Cono confianza${cmp ? ' (por grupo)' : ''} (${Math.round(FISHER_CONFIDENCE_LEVEL * 100)}%)` },
          ];
          return (
            <>
              <style>{CHART_STYLE_EDITOR_CSS}</style>
              <div className="hgm-root hud-panel" style={{ padding: 0 }}>
                <CollapsibleSection id="estructural.estiloStereonet" title="Estilo estereograma" defaultOpen={false}>
                  <div role="group" aria-label="Capas avanzadas" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
                    {advToggles.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setStereonetDisplay((prev) => ({ ...prev, [t.key]: !prev[t.key] }))}
                        aria-pressed={stereonetDisplay[t.key]}
                        className={`hud-toggle-btn${stereonetDisplay[t.key] ? ' active' : ''}`}
                      >
                        {t.label}
                      </button>
                    ))}
                    {stereonetDisplay.showKamb && <KambScaleBar />}
                  </div>
                  <div className="hgm-sub-label" style={{ marginTop: 0 }}>Exportar</div>
                  <ExportButton targetRef={stereonetContainerRef} filename="estereograma" />
                  <div className="hgm-sub-label">Apariencia del gráfico</div>
                  <ChartStyleEditor style={stereonetStyle} defaultTitle="Estereograma" onChange={updateStereonetStyle} showLegendPosition={false} />
                </CollapsibleSection>
              </div>
              <div className="hgm-root hud-panel" style={{ padding: 0 }}>
                <CollapsibleSection id="estructural.estiloRose" title="Estilo roseta" defaultOpen={false}>
                  <label
                    className="hud-checkrow"
                    style={{ marginBottom: 12 }}
                    title='Solo afecta el binning de PLANOS (azimut) — las líneas (trend) nunca se duplican, tienen sentido direccional propio. Activado (default): cada medición cuenta en su sector Y en el opuesto (patrón "bowtie", convención estándar para rosetas de datos planares). Desactivado: conteo crudo por azimut, sin espejo.'
                  >
                    <input
                      type="checkbox"
                      data-testid="toggle-plane-symmetric"
                      checked={roseStyle.planeSymmetric ?? DEFAULT_PLANE_SYMMETRIC}
                      onChange={(e) => updateRoseStyle({ planeSymmetric: e.target.checked })}
                    />
                    Simetría 180°
                  </label>
                  <div className="hgm-sub-label" style={{ marginTop: 0 }}>Exportar</div>
                  <ExportButton targetRef={roseContainerRef} filename="rosetas" />
                  <div className="hgm-sub-label">Apariencia del gráfico</div>
                  <ChartStyleEditor style={roseStyle} defaultTitle="Diagrama de rosetas" onChange={updateRoseStyle} showLegendPosition={false} />
                </CollapsibleSection>
              </div>
            </>
          );
        }}
      >
        {(result: ClassificationFilterResult) => {
          const legendEntries = result.legendEntries;
          return (
            <>
              <div className="hud-panel" style={{ padding: 10, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', width: 'fit-content' }}>
                <span className="hgm-sub-label" style={{ margin: 0 }}>Figura de informe</span>
                <select
                  className="hud-select"
                  value={reportFormat}
                  onChange={(e) => setReportFormat(e.target.value as 'png' | 'svg')}
                  style={{ flex: '0 0 72px' }}
                  title="Formato de exportación"
                >
                  <option value="png">PNG</option>
                  <option value="svg">SVG</option>
                </select>
                <button
                  type="button"
                  className="hud-toggle-btn"
                  onClick={() => handleExportReportFigure(result)}
                  disabled={reportExporting}
                  data-testid="export-report-figure-btn"
                  title="Combina el estereograma, la roseta, la leyenda y la estadística de Fisher del filtro activo en una sola imagen — vista completa, sin el zoom/paneo que tengas activo en pantalla."
                >
                  {reportExporting ? 'Exportando…' : '⬇ Exportar figura completa'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 0%', minWidth: 320 }} ref={stereonetContainerRef}>
                  <StereonetPlanes
                    ref={stereonetHandleRef}
                    key={`stereonet-${fileChangeGeneration}`}
                    measurements={result.measurements}
                    linearMeasurements={result.linearMeasurements}
                    getColor={result.getColor}
                    getSymbol={result.getSymbol}
                    legendEntries={legendEntries}
                    chartStyle={stereonetStyle}
                    onChartStyleChange={updateStereonetStyle}
                    display={stereonetDisplay}
                    onDisplayChange={setStereonetDisplay}
                    fisherConfidenceLevel={FISHER_CONFIDENCE_LEVEL}
                    crossHighlightBus={crossHighlightBusRef.current}
                    binSizeDeg={ROSE_BIN_SIZE_DEG}
                    comparisonGroups={result.comparisonGroups}
                  />
                </div>
                <div style={{ flex: '1 1 0%', minWidth: 320 }} ref={roseContainerRef}>
                  <RoseDiagram
                    ref={roseHandleRef}
                    key={`rose-${fileChangeGeneration}`}
                    measurements={result.measurements}
                    linearMeasurements={result.linearMeasurements}
                    getGroup={result.getGroup}
                    groupColor={result.groupColor}
                    legendEntries={legendEntries}
                    chartStyle={roseStyle}
                    onChartStyleChange={updateRoseStyle}
                    crossHighlightBus={crossHighlightBusRef.current}
                    binSizeDeg={ROSE_BIN_SIZE_DEG}
                  />
                </div>
              </div>
            </>
          );
        }}
      </ClassificationFilterPanel>
      )}
    </>
  );
});

export default EstructuralWorkspace;
