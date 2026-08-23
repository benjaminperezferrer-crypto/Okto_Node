/**
 * src/estructural/AnalisisEstructuralModule.tsx
 * Etapa 3 del rediseño a pestañas múltiples — este componente pasa a ser
 * el "shell" de pestañas: mantiene `tabs: EstructuralTabState[]` (datos
 * planos, serializables — mismo espíritu que `_projects[]`/`_projIdx` de
 * Columnas, adaptado a React) y monta UNA sola instancia de
 * EstructuralWorkspace.tsx a la vez (la pestaña activa), con
 * `key={activeTabId}` para forzar un remount limpio al cambiar — cada
 * pestaña tiene así su propia instancia fresca de
 * ClassificationFilterPanel/StereonetPlanes/RoseDiagram, sin estado
 * compartido entre pestañas ni riesgo de que se pisen entre sí.
 *
 * Todo lo que antes vivía acá directo (selector de archivo, panel de
 * clasificación, ambos diagramas — Etapas 1-2 de este rediseño) se movió
 * a EstructuralWorkspace.tsx — ver su JSDoc para el detalle de CADA
 * pestaña. Este archivo ahora solo orquesta: pide las estructuras de
 * QA/QC UNA vez (compartidas por todas las pestañas, cada una filtra por
 * su propio `qaqcFileId`), dibuja la barra de pestañas, y hace de puente
 * entre el sistema de Proyectos (.geoproj) y `tabs[]`.
 *
 * ── "Snapshot antes de cambiar" — el mecanismo central ──────────────────
 * `tabs[]` es la fuente de verdad para toda pestaña QUE NO sea la activa
 * en este momento — la activa vive, mientras está montada, en el estado
 * INTERNO de su EstructuralWorkspace (más rápido, sin serializar en cada
 * tecla). Antes de cualquier operación que vaya a DESMONTAR la pestaña
 * activa (cambiar de pestaña, crear una nueva, guardar el proyecto),
 * `snapshotActiveTab()` lee su estado vivo vía
 * `workspaceRef.current.getWorkspaceState()` (el mismo ref imperativo
 * que ya exponían ClassificationFilterPanel/StereonetPlanes/RoseDiagram,
 * ahora agregado un nivel más arriba) y lo escribe en `tabs[]` ANTES de
 * tocar `activeTabId` — así nunca se pierde el último cambio en el momento
 * exacto de cambiar de pestaña.
 *
 * ── Botón "Nueva pestaña" y renombrar: SIN window.prompt() ──────────────
 * `window.prompt()` no muestra ningún diálogo dentro de Electron (ver
 * JSDoc histórico de saveProjectToFile() en projectManager.js) — "pide un
 * nombre" se resuelve con un `<input>` inline en la barra de pestañas
 * (mismo patrón ya usado para "Guardar preset actual" en
 * ClassificationFilterPanel.tsx: texto + botón deshabilitado si está
 * vacío), nunca con un diálogo del navegador. Renombrar es doble clic
 * sobre el nombre de la pestaña, que lo vuelve un `<input>` en el lugar
 * (blur/Enter confirma, Escape cancela). `window.confirm()` SÍ funciona
 * en Electron (a diferencia de `prompt()`) — se usa tal cual para la
 * confirmación de "cerrar pestaña con datos".
 *
 * ── Presets de filtro: GLOBALES, gestionados vía la pestaña MONTADA ─────
 * Ver JSDoc de structuralProjectTypes.ts — `getFilterPresets()`/
 * `setFilterPresetsFromProject()` en EstructuralWorkspaceHandle delegan
 * directo al ClassificationFilterPanel de la pestaña que esté montada en
 * ese momento; como todas leen/escriben la MISMA clave de localStorage,
 * no importa cuál esté activa cuando este shell necesita leer/fusionar
 * la lista global.
 *
 * ── `loadGeneration` — por qué el nivel superior SÍ necesita el viejo
 *    mecanismo de remount con setTimeout, a diferencia de
 *    EstructuralWorkspace.tsx ──────────────────────────────────────────
 * `loadProjectState()` (este componente) llega por postMessage desde la
 * ventana raíz — la MISMA carrera real de siempre entre PROJECT_READY y
 * el primer montaje de React (ver JSDoc histórico). El estilo de cada
 * pestaña se escribe a localStorage de forma SÍNCRONA para TODAS las
 * pestañas restauradas (namespaced por `tabId`, ver chartStyleIds.ts)
 * ANTES de reemplazar `tabs`/`activeTabId` — así, cuando la pestaña activa
 * (re)monte, su inicializador perezoso ya encuentra el valor correcto,
 * sin importar si el `id` coincide por casualidad con el de la pestaña
 * que ya estaba montada. `loadGeneration` (bumped en loadProjectState())
 * se suma a la `key` del EstructuralWorkspace activo para GARANTIZAR un
 * remount fresco incluso en ese caso borde de ids coincidentes.
 * Clasificación/familias/toggles, en cambio, ya NO necesitan la danza de
 * doble macrotarea de la etapa anterior — EstructuralWorkspace.tsx los
 * restaura solo, en su propio primer montaje (ver su JSDoc) — este nivel
 * ya no tiene que orquestar esa parte.
 *
 * Etapa 16/17 (heredado) — tema visual HUD compartido
 * (src/shared/hudTheme.css), sin cambios en esta etapa.
 */

import React, { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import EstructuralWorkspace, {
  DEFAULT_CLASSIFICATION_STATE, DEFAULT_STEREONET_DISPLAY, DEFAULT_ROSE_DISPLAY,
} from './EstructuralWorkspace';
import type { EstructuralWorkspaceHandle, EstructuralWorkspaceState } from './EstructuralWorkspace';
import { fetchQaqcStructuralDataset } from './qaqcBridge';
import type { PlanarMeasurement } from './structuralTypes';
import type { QaqcStructuralFileRef } from '../projectBridge';
import { saveChartStyleMap, getDefaultChartStyle } from '../shared/chartStyle';
import { structuralChartStyleStorageKey } from './chartStyleIds';
import type { AnalisisEstructuralProjectState, EstructuralTabState } from './structuralProjectTypes';
import { mergeFilterPresets } from './filterPresets';
import HUD_THEME_CSS from '../shared/hudTheme.css';
import { COLLAPSIBLE_SECTION_CSS } from '../shared/CollapsibleSection';

type QaqcFetchStatus =
  | { kind: 'loading' }
  | { kind: 'ok'; count: number }
  | { kind: 'error'; message: string };

export interface AnalisisEstructuralModuleHandle {
  getProjectState: () => AnalisisEstructuralProjectState;
  loadProjectState: (state: AnalisisEstructuralProjectState) => void;
}

let _tabIdCounter = 0;
/** Id ESTABLE de pestaña — nunca editado por el usuario (eso es `name`). No necesita ser criptográficamente único, solo distinto dentro de esta sesión/proyecto. */
function makeTabId(): string {
  _tabIdCounter += 1;
  return `tab-${Date.now()}-${_tabIdCounter}`;
}

function makeDefaultTab(name: string): EstructuralTabState {
  return {
    id: makeTabId(),
    name,
    qaqcFileId: null,
    classification: DEFAULT_CLASSIFICATION_STATE,
    chartStyles: { stereonet: getDefaultChartStyle(), rose: getDefaultChartStyle() },
    families: [],
    displayToggles: { stereonet: DEFAULT_STEREONET_DISPLAY, rose: DEFAULT_ROSE_DISPLAY },
  };
}

const AnalisisEstructuralModule = forwardRef<AnalisisEstructuralModuleHandle>(function AnalisisEstructuralModule(_props, ref) {
  const [qaqc, setQaqc] = useState<PlanarMeasurement[]>([]);
  const [allStructuralFiles, setAllStructuralFiles] = useState<QaqcStructuralFileRef[]>([]);
  const [qaqcStatus, setQaqcStatus] = useState<QaqcFetchStatus>({ kind: 'loading' });

  const [tabs, setTabs] = useState<EstructuralTabState[]>(() => [makeDefaultTab('Pestaña 1')]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id);
  // Ver JSDoc de archivo — solo se toca en loadProjectState() (carrera
  // real con el postMessage cross-frame). Cambiar de pestaña NO lo toca:
  // no hay ninguna carrera que resolver ahí, `activeTabId` solo ya alcanza
  // para forzar el remount correcto.
  const [loadGeneration, setLoadGeneration] = useState(0);
  const workspaceRef = useRef<EstructuralWorkspaceHandle>(null);

  const [creatingTab, setCreatingTab] = useState(false);
  const [newTabNameDraft, setNewTabNameDraft] = useState('');
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const availableFiles = useMemo<QaqcStructuralFileRef[]>(() => {
    const byId = new Map<number, string>();
    for (const m of qaqc) {
      if (!byId.has(m.sourceFileId)) byId.set(m.sourceFileId, m.sourceFileName);
    }
    return Array.from(byId, ([id, name]) => ({ id, name }));
  }, [qaqc]);

  const filesWithoutValidRows = useMemo(
    () => allStructuralFiles.filter((f) => !availableFiles.some((a) => a.id === f.id)),
    [allStructuralFiles, availableFiles],
  );

  useEffect(() => {
    fetchQaqcStructuralDataset()
      .then(({ measurements, allStructuralFiles: fileRefs }) => {
        setQaqc(measurements);
        setAllStructuralFiles(fileRefs);
        setQaqcStatus({ kind: 'ok', count: measurements.length });
      })
      .catch((err) => {
        setQaqc([]);
        setAllStructuralFiles([]);
        setQaqcStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      });
  }, []);

  /** Lee el estado vivo de la pestaña activa (si hay una montada) y lo escribe en `tabs[]` — llamar SIEMPRE antes de desmontarla (cambiar de pestaña, crear una nueva, guardar el proyecto). Ver JSDoc de archivo. */
  function snapshotActiveTab(currentTabs: EstructuralTabState[]): EstructuralTabState[] {
    const ws = workspaceRef.current?.getWorkspaceState();
    if (!ws) return currentTabs;
    return currentTabs.map((t) => (t.id === activeTabId ? { ...t, ...ws } : t));
  }

  function switchToTab(id: string) {
    if (id === activeTabId) return;
    setTabs((prev) => snapshotActiveTab(prev));
    setActiveTabId(id);
  }

  function confirmCreateTab() {
    const name = newTabNameDraft.trim();
    if (!name) return; // sin nombre, no-op — "sin default automático" es explícito, no se inventa uno.
    const newTab = makeDefaultTab(name);
    setTabs((prev) => [...snapshotActiveTab(prev), newTab]);
    setActiveTabId(newTab.id);
    setCreatingTab(false);
    setNewTabNameDraft('');
  }

  function startRename(tab: EstructuralTabState) {
    setRenamingTabId(tab.id);
    setRenameDraft(tab.name);
  }

  function commitRename() {
    const name = renameDraft.trim();
    setTabs((prev) => prev.map((t) => (t.id === renamingTabId ? { ...t, name: name || t.name } : t)));
    setRenamingTabId(null);
  }

  function closeTab(id: string) {
    if (tabs.length <= 1) return; // mismo criterio que Columnas — no se puede cerrar la última pestaña.
    const stored = tabs.find((t) => t.id === id);
    if (!stored) return;
    // Si es la pestaña ACTIVA, se lee su estado vivo (más preciso que el
    // último snapshot guardado) para decidir si hace falta confirmación.
    const live = id === activeTabId ? workspaceRef.current?.getWorkspaceState() : null;
    const effective: EstructuralWorkspaceState = live ?? stored;
    const hasData = effective.qaqcFileId != null || effective.families.length > 0;
    if (hasData) {
      const proceed = window.confirm(
        `¿Cerrar la pestaña "${stored.name}"? Tiene un archivo elegido y/o familias guardadas que se perderán.`,
      );
      if (!proceed) return;
    }
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (id === activeTabId) {
        const fallback = next[Math.min(idx, next.length - 1)];
        setActiveTabId(fallback.id);
      }
      return next;
    });
  }

  useImperativeHandle(ref, () => ({
    getProjectState: (): AnalisisEstructuralProjectState => {
      const finalTabs = snapshotActiveTab(tabs);
      return {
        tabs: structuredClone(finalTabs),
        activeTabId,
        filterPresets: workspaceRef.current?.getFilterPresets() ?? [],
      };
    },
    loadProjectState: (state: AnalisisEstructuralProjectState) => {
      // Escritura SÍNCRONA del estilo de CADA pestaña a su clave de
      // localStorage, ANTES de reemplazar tabs/activeTabId — ver JSDoc de
      // archivo (`loadGeneration`) para por qué esto evita la carrera,
      // sin necesitar la danza de doble macrotarea de la etapa anterior.
      state.tabs.forEach((t) => {
        saveChartStyleMap(structuralChartStyleStorageKey('stereonet', t.id), { stereonet: t.chartStyles.stereonet });
        saveChartStyleMap(structuralChartStyleStorageKey('rose', t.id), { rose: t.chartStyles.rose });
      });
      // Presets: FUSIÓN con lo que haya montado ahora mismo (por nombre,
      // el proyecto gana en conflicto) — ver JSDoc de mergeFilterPresets()
      // en filterPresets.ts. Se lee ANTES de reemplazar tabs, mientras el
      // panel viejo todavía existe.
      const localPresets = workspaceRef.current?.getFilterPresets() ?? [];
      const mergedPresets = mergeFilterPresets(localPresets, state.filterPresets);

      const nextActiveId = state.tabs.some((t) => t.id === state.activeTabId)
        ? state.activeTabId
        : (state.tabs[0]?.id ?? makeDefaultTab('Pestaña 1').id);
      setTabs(state.tabs.length > 0 ? state.tabs : [makeDefaultTab('Pestaña 1')]);
      setActiveTabId(nextActiveId);
      setLoadGeneration((g) => g + 1);

      // El panel nuevo (remount por `key`, ver más abajo) ya carga su
      // propia copia de localStorage al montar — puede no incluir lo
      // recién fusionado si el archivo tenía presets con nombres nuevos.
      // Se sobreescribe acá con el resultado ya fusionado, una macrotarea
      // después de que el remount se asiente (mismo criterio ya validado
      // en la etapa de persistencia final del paquete de mejoras).
      setTimeout(() => {
        workspaceRef.current?.setFilterPresetsFromProject(mergedPresets);
      }, 0);
    },
  }), [tabs, activeTabId]);

  return (
    <div className="hud-root" style={{ padding: 20, minHeight: '100vh' }}>
      <style>{HUD_THEME_CSS}</style>
      {/* ClassificationFilterPanel (dentro de EstructuralWorkspace) usa 2
          <CollapsibleSection> ("Clasificación y filtro", "Presets de
          filtro") sin inyectar este CSS por su cuenta — se queda acá,
          inyectado UNA vez para todo el módulo. */}
      <style>{COLLAPSIBLE_SECTION_CSS}</style>

      <div className="hud-header">
        <span className="hud-title">Análisis Estructural</span>
        <span className="hud-badge">Disponible</span>
      </div>

      <div className="hud-sub" style={{ marginBottom: 10 }}>
        {qaqcStatus.kind === 'loading' && 'Cargando estructuras de QA/QC…'}
        {qaqcStatus.kind === 'error' && `No se pudieron cargar datos de QA/QC (${qaqcStatus.message}).`}
        {qaqcStatus.kind === 'ok' && `${qaqcStatus.count} estructura(s) de QA/QC disponibles en total (repartidas entre archivos).`}
      </div>

      {/* ── Barra de pestañas ── */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`hud-toggle-btn${tab.id === activeTabId ? ' active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', paddingRight: tabs.length > 1 ? 6 : undefined }}
            data-testid={`estructural-tab-${tab.id}`}
          >
            {renamingTabId === tab.id ? (
              <input
                autoFocus
                className="hud-select"
                style={{ width: 130 }}
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenamingTabId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                data-testid={`estructural-tab-rename-input-${tab.id}`}
              />
            ) : (
              <span
                onClick={() => switchToTab(tab.id)}
                onDoubleClick={() => startRename(tab)}
                title="Clic para activar — doble clic para renombrar"
              >
                {tab.name}
              </span>
            )}
            {tabs.length > 1 && renamingTabId !== tab.id && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                title="Cerrar pestaña"
                data-testid={`estructural-tab-close-${tab.id}`}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '.8rem', lineHeight: 1, padding: 0 }}
              >
                ✕
              </button>
            )}
          </div>
        ))}

        {creatingTab ? (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              autoFocus
              className="hud-select"
              style={{ width: 150 }}
              placeholder="Nombre de la pestaña"
              value={newTabNameDraft}
              onChange={(e) => setNewTabNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmCreateTab();
                if (e.key === 'Escape') { setCreatingTab(false); setNewTabNameDraft(''); }
              }}
              data-testid="estructural-new-tab-name-input"
            />
            <button
              type="button"
              className="hud-toggle-btn"
              onClick={confirmCreateTab}
              disabled={!newTabNameDraft.trim()}
              data-testid="estructural-new-tab-confirm-btn"
            >
              Crear
            </button>
            <button
              type="button"
              className="hud-toggle-btn"
              onClick={() => { setCreatingTab(false); setNewTabNameDraft(''); }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="hud-toggle-btn"
            onClick={() => setCreatingTab(true)}
            data-testid="estructural-new-tab-btn"
          >
            + Nueva pestaña
          </button>
        )}
      </div>

      {activeTab && (
        <EstructuralWorkspace
          key={`workspace-${activeTabId}-${loadGeneration}`}
          ref={workspaceRef}
          tabId={activeTab.id}
          initialState={activeTab}
          qaqcMeasurements={qaqc}
          availableFiles={availableFiles}
          filesWithoutValidRows={filesWithoutValidRows}
        />
      )}
    </div>
  );
});

export default AnalisisEstructuralModule;
