/**
 * src/estructural/structuralProjectTypes.ts
 * Etapa 3 del rediseño a pestañas múltiples — forma del estado de
 * Análisis Estructural dentro del sistema de Proyectos (.geoproj).
 * Mismo patrón que GisProjectState (src/gis/gisTypes.ts): el módulo
 * dueño de sus datos define su propio tipo de proyecto, y
 * projectTypes.ts solo lo importa para el campo `estructural` de
 * ProjectState — no lo redefine ahí.
 *
 * schemaVersion 7 (bump desde 6) — reemplaza por completo el estado
 * PLANO de un solo espacio de trabajo por `tabs: EstructuralTabState[]`
 * + `activeTabId`. Ver migrations[6] en projectMigrations.js para la
 * migración desde v6 (un archivo viejo se convierte en UNA pestaña
 * "heredada"; `imported` — datos CSV, función ya eliminada en la Etapa 1
 * — se descarta ahí, con aviso al usuario si tenía datos reales).
 *
 * ── EstructuralTabState — UN espacio de trabajo independiente ──────────
 * `id`: identidad estable de la pestaña, generada al crearla — nunca la
 *   edita el usuario (eso es `name`). Se usa como `key` de React
 *   (EstructuralWorkspace.tsx remonta por completo al cambiar de
 *   pestaña) y como namespace de localStorage para `chartStyles` (ver
 *   structuralChartStyleStorageKey() en chartStyleIds.ts) — CADA pestaña
 *   necesita su propia clave, si no, dos pestañas compartirían el mismo
 *   estilo de diagrama.
 * `name`: definido por el usuario al crear la pestaña (sin default
 *   automático — ver AnalisisEstructuralModule.tsx) o al renombrarla.
 * `qaqcFileId`: archivo QA/QC elegido para ESTA pestaña — `null` = "sin
 *   elegir todavía" (gate obligatorio, ver Etapa 2). Dos pestañas PUEDEN
 *   apuntar al mismo archivo (caso de uso explícito: distintos
 *   gráficos/clasificaciones para el mismo dataset).
 * `classification`/`chartStyles`/`families`/`displayToggles`: MISMA
 *   forma que en la etapa anterior (estado plano) — lo único que cambió
 *   es que ahora hay UN juego de estos campos POR PESTAÑA en vez de uno
 *   solo para todo el módulo.
 *
 * ── `filterPresets` sigue GLOBAL, fuera de `tabs[]` ─────────────────────
 * Un preset es una receta de filtro por NOMBRE DE CAMPO (`tipo`/
 * `cinemática`/etc.), no depende de qué archivo QA/QC use cada pestaña —
 * guardado desde una pestaña, aplicable en cualquier otra (confirmado
 * explícitamente, sin cambio de forma respecto a la etapa anterior). Ver
 * JSDoc de filterPresets.ts para el criterio de fusión con localStorage
 * al cargar un proyecto (mergeFilterPresets(), por nombre, el proyecto
 * gana en conflicto) — sigue aplicándose igual, ahora orquestado desde
 * AnalisisEstructuralModule.tsx vía EstructuralWorkspaceHandle.getFilterPresets()/
 * setFilterPresetsFromProject() sobre la pestaña ACTIVAMENTE montada (el
 * panel que sea, siempre lee/escribe la MISMA clave global — no importa
 * cuál pestaña esté abierta en ese momento).
 *
 * ── Qué NO viaja acá (a propósito) ──────────────────────────────────
 * Los datos leídos de QA/QC (fetchQaqcStructuralDataset(), qaqcBridge.ts)
 * NO se guardan — mismo criterio ya usado por GIS para sus capas
 * 'integrated-*' (ver JSDoc de GisProjectState en src/gis/gisTypes.ts):
 * se recalculan solos desde QA/QC cada vez que el módulo monta, así que
 * persistirlos sería redundante y podría desincronizarse del estado real
 * de QA/QC si algo cambió mientras tanto en ese módulo.
 */

import type { ClassificationFilterPanelState } from './ClassificationFilterPanel';
import type { ChartStyleSettings } from '../shared/chartStyle';
import type { FilterPreset } from './filterPresets';
import type { StructuralFamily, StereonetDisplayState } from './StereonetPlanes';
import type { RoseDisplayState } from './RoseDiagram';

export interface EstructuralTabState {
  id: string;
  name: string;
  qaqcFileId: number | null;
  classification: ClassificationFilterPanelState;
  chartStyles: {
    stereonet: ChartStyleSettings;
    rose: ChartStyleSettings;
  };
  families: StructuralFamily[];
  displayToggles: {
    stereonet: StereonetDisplayState;
    rose: RoseDisplayState;
  };
}

export interface AnalisisEstructuralProjectState {
  tabs: EstructuralTabState[];
  /** Debe coincidir con el `id` de alguna entrada de `tabs` — si no matchea ninguna al cargar, se usa la primera (mismo criterio que ColumnasProjectState.activeProjectId). */
  activeTabId: string;
  filterPresets: FilterPreset[];
}
