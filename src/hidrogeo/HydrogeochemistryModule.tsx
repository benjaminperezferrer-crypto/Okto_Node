/**
 * src/hidrogeo/HydrogeochemistryModule.tsx
 * Etapa 12 (rediseño) — contenedor que integra los diagramas del módulo
 * de Hidrogeoquímica dentro de Okto Node:
 *   1. Nav vertical a la izquierda para alternar entre Piper, Stiff y
 *      Schoeller-Berkaloff (y los demás diagramas del módulo).
 *   2. Diagrama centrado en pantalla, sobre una "hoja" blanca — igual que
 *      src/columnas/viewer.html hace con la columna estratigráfica (los
 *      6 diagramas ya están coloreados para verse sobre fondo blanco, no
 *      sobre el HUD oscuro, así que esto además los hace legibles).
 *   3. Panel de edición (filtros, color, QA/QC) a la derecha.
 *   4. Todo el "chrome" (header, nav, panel) reusa la paleta/tipografía de
 *      columnas (Courier New, --bg #010F20, acentos --cyan #00F4FF,
 *      labels en mayúscula) vía un <style> embebido con estilos propios —
 *      no depende de que viewer.html defina nada.
 *
 * La lógica de estado (filtros, balance iónico, color compartido) no
 * cambió respecto de la versión anterior — este rediseño es solo de
 * layout/CSS.
 *
 * Etapa 17 — consolidación del tema HUD: las variables (--bg/--cyan/
 * --text/etc.) migraron a src/shared/hudTheme.css (única fuente de
 * verdad, junto con index.html/columnas/viewer.html/GIS). Ver JSDoc de
 * ese archivo y el bloque `ESTILO` más abajo.
 *
 * No agrega lógica de conversión ni de balance iónico nueva — solo
 * orquesta los componentes y funciones ya construidos en las etapas
 * anteriores (PiperDiagram, StiffDiagram, SchoellerBerkaloffDiagram,
 * calculateIonBalance, sampleColor.ts).
 */

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { WaterSample, IonBalanceResult } from './hydroTypes';
import type { HidrogeoquimicaProjectState } from '../projectTypes';
import { calculateIonBalance } from './hydroCalculations';
import {
  CLASSIFIABLE_FIELD_LABELS, DEFAULT_PALETTE, buildColorMap,
  getClassifiableFields, getFieldValue,
} from './sampleColor';
import { getStiffValues, stiffDataMax } from './stiffGeometry';
import {
  DEFAULT_DASHED, DEFAULT_OUTLINE, DEFAULT_POINT_SHAPE, DEFAULT_POINT_SIZE,
  GroupPointStyle, LineStyle, loadPiperStyle, PiperStyleSettings,
  POINT_SHAPES, savePiperStyle,
} from './diagramStyle';
import { fetchQaqcHydroDataset } from './qaqcBridge';
import { loadStiffStyle, saveStiffStyle, StiffStyleSettings } from './stiffStyle';
import {
  ChartStyleSettings, legendPositionStyle, loadChartStyleMap, saveChartStyleMap,
} from '../shared/chartStyle';
import { ChartStyleEditor } from '../shared/ChartStyleEditor';
import { ExportButton } from '../shared/ExportButton';
import { renderDiagramToPNGBlob } from '../shared/exportDiagram';
import HUD_THEME_CSS from '../shared/hudTheme.css';
import { CollapsibleSection, COLLAPSIBLE_SECTION_CSS } from '../shared/CollapsibleSection';
import { PiperDiagram } from './PiperDiagram';
import { StiffDiagram } from './StiffDiagram';
import { SchoellerBerkaloffDiagram } from './SchoellerBerkaloffDiagram';
import { EhPhDiagram } from './EhPhDiagram';
import { ClConductivityDiagram } from './ClConductivityDiagram';
import { IonRatioDiagram, type AxisScale } from './IonRatioDiagram';
import {
  DEFAULT_X_FIELD, DEFAULT_Y_FIELD, ION_KEYS, ION_LABELS,
  type AxisField, type IonKey, type IonUnit,
} from './ionicRatios';
import { requestModuleStateFromParent } from '../projectBridge';
import type { GisProjectState } from '../gis/gisTypes';
import type { PublishedChartData } from '../projectBridge';

// ─────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────

export type DiagramKey = 'piper' | 'stiff' | 'schoellerBerkaloff' | 'ehph' | 'clec' | 'ionratio';

/**
 * Los 5 diagramas "combinados" (todo menos Stiff) pueden ubicarse en GIS
 * con UNA coordenada manual — Stiff no entra acá porque cada tarjeta
 * reutiliza la coordenada propia de SU muestra (lat/lon ya existente),
 * no una ubicación manual por diagrama. Ver plan de la Etapa 2.
 */
export type LocatableDiagramKey = Exclude<DiagramKey, 'stiff'>;

/** Este/Norte como string (mismo criterio "input controlado" que schoellerMeqLMinInput) — '' = sin definir, no "auto". */
export interface ChartLocation {
  east: string;
  north: string;
  published: boolean;
}

export interface HydrogeochemistryModuleProps {
  initialTab?: DiagramKey;
}

/** Estado de la carga de muestras desde QA/QC (mismo patrón que Análisis Estructural). */
type QaqcFetchStatus =
  | { kind: 'loading' }
  | { kind: 'ok'; count: number }
  | { kind: 'error'; message: string };

/**
 * Métodos imperativos expuestos vía ref — puente para el sistema de
 * Proyectos (ver src/hidrogeo/main.tsx). El estado en sí sigue viviendo
 * como useState normal acá adentro; esto solo lo expone hacia afuera del
 * árbol de React, que es lo único que necesitaba un cambio.
 */
export interface HydrogeochemistryModuleHandle {
  getProjectState: () => HidrogeoquimicaProjectState;
  loadProjectState: (state: HidrogeoquimicaProjectState) => void;
  /**
   * PNG (Blob, en memoria) del diagrama `diagramId` TAL COMO se ve ahora
   * mismo — Etapa 3 del paquete de ubicación espacial. `null` si el
   * diagrama no tiene "Publicar en GIS" activo (Etapa 2) o si su copia
   * fuera de pantalla todavía no montó. Se regenera en cada llamada — sin
   * caché, ver nota junto a `chartLocations` más abajo.
   */
  getChartPNGBlob: (diagramId: LocatableDiagramKey) => Promise<Blob | null>;
  /**
   * Todos los gráficos con "Publicar en GIS" activo Y coordenadas válidas
   * cargadas, listos para que GIS los ubique como capas ráster (Etapa 4)
   * — un PublishedChartData (projectBridge.ts) por diagrama. Es lo que
   * `listenForChartsRequests()` (src/hidrogeo/main.tsx) expone del otro
   * lado del puente cuando GIS pide "los gráficos publicados de
   * Hidrogeoquímica" vía requestModuleChartsFromParent('hidro-frame').
   * Publicado sin coordenadas numéricas válidas (este/norte vacíos o no
   * numéricos) se omite en silencio — no hay dónde ubicarlo todavía.
   */
  getPublishedCharts: () => Promise<PublishedChartData[]>;
}

// ─────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────

const TABS: Array<{ key: DiagramKey; label: string }> = [
  { key: 'piper',              label: 'Diagrama de Piper' },
  { key: 'stiff',              label: 'Diagrama de Stiff' },
  { key: 'schoellerBerkaloff', label: 'Schoeller-Berkaloff' },
  { key: 'ehph',               label: 'Merkel y Planer-Friedrich' },
  { key: 'clec',               label: 'Cl vs Conductividad Eléctrica' },
  { key: 'ionratio',           label: 'Relaciones iónicas' },
];

/** Ids de diagrama para getDefaultChartStyleMap/loadChartStyleMap/saveChartStyleMap (src/shared/chartStyle.ts, Etapa 10) — mismos 6 keys que TABS. */
const DIAGRAM_IDS: DiagramKey[] = TABS.map((t) => t.key);
const CHART_STYLE_STORAGE_KEY = 'hgm.chartStyle.v1';

/** Los mismos 5 keys de TABS salvo 'stiff' — ver LocatableDiagramKey. */
const LOCATABLE_DIAGRAM_IDS: LocatableDiagramKey[] = DIAGRAM_IDS.filter((k): k is LocatableDiagramKey => k !== 'stiff');
const DEFAULT_CHART_LOCATION: ChartLocation = { east: '', north: '', published: false };

/** Tamaño fijo del diagrama (px) por pestaña — la "hoja" blanca se centra igual sea cual sea. */
const DIAGRAM_SIZE: Record<DiagramKey, { width: number; height: number }> = {
  piper:              { width: 680, height: 620 },
  stiff:              { width: 700, height: 0 }, // height no se usa — StiffGrid fluye con auto-fill
  schoellerBerkaloff: { width: 940, height: 780 },
  ehph:               { width: 700, height: 440 },
  clec:               { width: 680, height: 440 },
  ionratio:           { width: 680, height: 440 },
};

/**
 * '' o no-numérico → null; si no, el número tal cual — nunca `0 || null`
 * (0 es un input válido, aunque el rango de Schoeller-Berkaloff lo
 * recorte a 0.001 al usarlo por ser un dominio log). Genérica desde la
 * Etapa 6: además del rango de Schoeller-Berkaloff, también sirve para
 * serializar el Este/Norte de ChartLocation (mismo "input vacío = sin
 * definir" que ya tenían esos dos casos).
 */
function parseOptionalNumber(input: string): number | null {
  if (input.trim() === '') return null;
  const v = parseFloat(input);
  return Number.isFinite(v) ? v : null;
}

const QUALITY_META: Record<IonBalanceResult['quality'], { label: string; cls: string }> = {
  ok:      { label: 'OK',      cls: 'hgm-badge-ok' },
  warning: { label: '⚠ 5–10%', cls: 'hgm-badge-warn' },
  error:   { label: '⛔ ≥10%',  cls: 'hgm-badge-err' },
};

// ─────────────────────────────────────────────────────────────────
// ESTILO (Etapa 17: las variables/paleta compartidas — --bg/--cyan/--text/
// etc. — ya NO viven acá, vienen de src/shared/hudTheme.css, inyectado
// ANTES de este bloque vía <style>{HUD_THEME_CSS}</style> — ver JSDoc de
// ese archivo. HGM_CSS quedó recortado a SOLO las ~30 clases propias de
// este módulo (.hgm-nav-item, .hgm-stiff-grid, .hgm-qaqc-list, etc.), que
// siguen usando var(--bg)/var(--cyan)/etc. sin cambios — hudTheme.css
// define esos mismos nombres como alias de --hud-bg/--hud-cyan/etc. en
// :root, así que no hizo falta reescribir ninguna referencia acá.
//
// `.hgm-root` conserva sus propiedades de LAYOUT (font-family/background/
// color/height/display/etc.) — no son "variables compartidas", son cómo
// ESTE módulo específicamente quiere que se vea su contenedor raíz (flex
// column a pantalla completa) — hudTheme.css no tiene una regla
// equivalente para `.hgm-root` (esa clase es propia de Hidrogeoquímica).
// ─────────────────────────────────────────────────────────────────

const HGM_CSS = `
.hgm-root {
  font-family: 'Courier New', Courier, monospace;
  background: var(--bg); color: var(--text);
  height: 100vh; width: 100%;
  display: flex; flex-direction: column;
  overflow: hidden; font-size: 13px;
  box-sizing: border-box;
}
.hgm-root *, .hgm-root *::before, .hgm-root *::after { box-sizing: border-box; }

.hgm-header {
  flex-shrink: 0; display: flex; align-items: center; gap: 14px;
  padding: 9px 18px; background: var(--bg2); border-bottom: 1px solid var(--border);
}
.hgm-title { font-size: .9rem; font-weight: 700; letter-spacing: .12em; color: var(--cyan); }
.hgm-sub   { font-size: .68rem; color: var(--text-dim); margin-top: 1px; }
.hgm-badge { margin-left: auto; font-size: .65rem; color: var(--text-muted); border: 1px solid var(--border-dim); padding: 2px 8px; letter-spacing: .08em; }

.hgm-body { flex: 1; display: grid; grid-template-columns: 236px 1fr 340px; overflow: hidden; min-height: 0; }

.hgm-nav { background: var(--bg2); border-right: 1px solid var(--border); overflow-y: auto; padding: 6px 0; }
.hgm-nav-sep { height: 1px; background: var(--border-dim); margin: 6px 0; }
.hgm-nav-item {
  display: block; width: 100%; text-align: left; padding: 10px 18px;
  border: none; border-left: 2px solid transparent; background: none;
  color: var(--text-dim); font-family: inherit; font-size: .72rem;
  letter-spacing: .08em; text-transform: uppercase; cursor: pointer;
  transition: all .15s;
}
.hgm-nav-item:hover  { color: var(--text); background: rgba(0,244,255,.04); }
.hgm-nav-item.active { color: var(--cyan); background: var(--cyan-dim); border-left-color: var(--cyan); font-weight: 700; }

.hgm-import { padding: 13px 13px 6px; }
.hgm-file-btn {
  display: block; text-align: center; font-size: .68rem; color: var(--text-dim);
  border: 1px dashed var(--border); border-radius: 3px; padding: 9px 6px;
  cursor: pointer; transition: all .15s;
}
.hgm-file-btn:hover { border-color: var(--cyan); color: var(--cyan); }
.hgm-import-err { font-size: .66rem; color: var(--red); margin-top: 6px; }
.hgm-import-ok  { font-size: .66rem; color: var(--green); margin-top: 6px; }
.hgm-link-btn {
  display: block; margin-top: 8px; background: none; border: none; padding: 0;
  font-family: inherit; font-size: .65rem; color: var(--text-muted);
  text-decoration: underline; cursor: pointer;
}
.hgm-link-btn:hover { color: var(--cyan); }

.hgm-mapping { margin-top: 10px; }
.hgm-import-file { font-size: .64rem; color: var(--text-dim); margin-bottom: 6px; overflow-wrap: break-word; }
.hgm-mapping-list { max-height: 260px; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; }
.hgm-mapping-row { display: flex; flex-direction: column; gap: 2px; }
.hgm-mapping-lbl { font-size: .62rem; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hgm-mapping-row select.hgm-select { font-size: .66rem; padding: 3px 5px; }
.hgm-mapping-actions { display: flex; gap: 6px; margin-top: 9px; }
.hgm-btn-primary, .hgm-btn-secondary {
  flex: 1; font-family: inherit; font-size: .68rem; padding: 6px 8px; cursor: pointer;
  border-radius: 2px; border: 1px solid var(--border);
}
.hgm-btn-primary   { background: var(--cyan); color: #010F20; font-weight: 700; border-color: var(--cyan); }
.hgm-btn-primary:hover   { filter: brightness(1.1); }
.hgm-btn-secondary { background: none; color: var(--text-dim); }
.hgm-btn-secondary:hover { color: var(--text); border-color: var(--text-dim); }

.hgm-zoom-btn {
  font-family: inherit; font-size: .68rem; padding: 5px 9px; cursor: pointer;
  border-radius: 2px; border: 1px solid var(--border); background: none; color: var(--text-dim);
}
.hgm-zoom-btn:hover  { color: var(--text); border-color: var(--text-dim); }
.hgm-zoom-btn.active { border-color: var(--cyan); background: var(--cyan-dim); color: var(--cyan); }
.hgm-stiff-grid.zoom-tool-active { cursor: zoom-in; }

.hgm-view  { overflow: auto; padding: 28px; background: var(--bg); display: flex; align-items: flex-start; justify-content: center; }
.hgm-paper { background: #ffffff; box-shadow: 0 4px 24px rgba(0,0,0,.45); padding: 20px; border-radius: 2px; flex-shrink: 0; }
.hgm-paper.zoom-tool-active { cursor: zoom-in; }
.hgm-empty { color: var(--text-muted); font-size: .78rem; padding: 40px; text-align: center; max-width: 360px; }
.hgm-empty-hint { font-size: .68rem; color: #64748b; margin-top: 8px; line-height: 1.5; }
.hgm-empty-action-btn {
  display: inline-block; margin-top: 16px; font-family: inherit; font-size: .7rem; font-weight: 700;
  letter-spacing: .04em; padding: 7px 16px; cursor: pointer; border-radius: 2px;
  border: 1px solid #0f172a; background: none; color: #0f172a;
}
.hgm-empty-action-btn:hover { background: #0f172a; color: #fff; }

.hgm-panel   { background: var(--bg2); border-left: 1px solid var(--border); overflow-y: auto; }
.hgm-section { padding: 13px; border-bottom: 1px solid var(--border-dim); }
.hgm-sec-label { font-size: .62rem; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; color: var(--text-muted); margin-bottom: 8px; }
.hgm-sub-label { font-size: .65rem; color: var(--text-dim); margin: 8px 0 4px; }
.hgm-sub-label:first-child { margin-top: 0; }

.hgm-checklist { max-height: 130px; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; }
.hgm-checkrow  { display: flex; align-items: center; gap: 6px; font-size: .72rem; color: var(--text); cursor: pointer; user-select: none; }
.hgm-checkrow input { accent-color: var(--cyan); }
.hgm-empty-note { font-size: .68rem; color: var(--text-muted); }

.hgm-select {
  background: var(--bg3); border: 1px solid var(--border); color: var(--text);
  font-family: inherit; font-size: .72rem; padding: 5px 7px; outline: none; width: 100%;
}
.hgm-select:focus { border-color: var(--cyan); box-shadow: var(--cyan-glow); }
.hgm-select option { background: #0d1e36; }

.hgm-qaqc-list { max-height: 260px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.hgm-qaqc-row  { display: flex; align-items: center; gap: 6px; font-size: .68rem; }
.hgm-qaqc-row input { accent-color: var(--cyan); }
.hgm-qaqc-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
.hgm-badge-ok, .hgm-badge-warn, .hgm-badge-err {
  font-size: .58rem; font-weight: 700; padding: 1px 6px; letter-spacing: .03em; flex-shrink: 0; border: 1px solid transparent; white-space: nowrap;
}
.hgm-badge-ok   { color: var(--green);  border-color: rgba(34,197,94,.35);  background: rgba(34,197,94,.1); }
.hgm-badge-warn { color: var(--orange); border-color: rgba(245,158,11,.35); background: rgba(245,158,11,.1); }
.hgm-badge-err  { color: var(--red);    border-color: rgba(239,68,68,.35);  background: rgba(239,68,68,.1); }

.hgm-stiff-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.hgm-stiff-card { border: 1px solid #e2e8f0; }

.hgm-style-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.hgm-style-row:last-child { margin-bottom: 0; }
.hgm-style-lbl { font-size: .68rem; color: var(--text-dim); width: 52px; flex-shrink: 0; }
.hgm-color-input {
  width: 26px; height: 22px; padding: 0; border: 1px solid var(--border); border-radius: 2px;
  background: var(--bg3); cursor: pointer; flex-shrink: 0;
}
.hgm-num-input {
  width: 46px; background: var(--bg3); border: 1px solid var(--border); color: var(--text);
  font-family: inherit; font-size: .7rem; padding: 3px 5px; outline: none;
}
.hgm-num-input:focus { border-color: var(--cyan); box-shadow: var(--cyan-glow); }
.hgm-point-list { max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.hgm-point-row { border-top: 1px solid var(--border-dim); padding-top: 7px; }
.hgm-point-row:first-child { border-top: none; padding-top: 0; }
.hgm-point-name { font-size: .7rem; color: var(--text); margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hgm-point-ctrls { display: flex; align-items: center; gap: 6px; }
.hgm-point-ctrls select.hgm-select { flex: 1; min-width: 0; padding: 3px 5px; font-size: .68rem; }
`;

// ─────────────────────────────────────────────────────────────────
// SUB-COMPONENTES INTERNOS
// ─────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="hgm-section">
      <div className="hgm-sec-label">{title}</div>
      {children}
    </div>
  );
}

/**
 * Estado "sin muestras visibles" (Etapa 6 de divulgación progresiva) —
 * NUNCA significa "no importaste nada": `samples` (prop de
 * HydrogeochemistryModule, ver main.tsx) siempre trae datos de ejemplo, así
 * que `samples` nunca está vacío por sí solo. Este mensaje solo
 * puede aparecer porque los filtros de "Filtro y clasificación" y/o las
 * exclusiones de "QA/QC — balance iónico" dejaron `plottedSamples` en 0 —
 * antes de la Etapa 2-4 (divulgación progresiva) esos 2 paneles estaban
 * siempre visibles al lado del diagrama, así que la causa era obvia de un
 * vistazo; ahora viven detrás de acordeones colapsados por defecto, así
 * que el mensaje necesita nombrar EXACTAMENTE esos 2 títulos (para que el
 * usuario los reconozca en el panel) y ofrecer una salida de un clic, en
 * vez de asumir que el usuario va a ir a buscarlos por su cuenta.
 */
function EmptyStateMessage({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <div className="hgm-empty">
      <div>No hay muestras visibles con la configuración actual.</div>
      <div className="hgm-empty-hint">
        Puede deberse a los filtros de <strong>&quot;Filtro y clasificación&quot;</strong> o a
        exclusiones en <strong>&quot;QA/QC — balance iónico&quot;</strong> (ambas secciones
        están en el panel de la derecha).
      </div>
      <button type="button" className="hgm-empty-action-btn" onClick={onClearFilters}>
        Quitar filtros y exclusiones
      </button>
    </div>
  );
}

interface ViewZoomPanelProps {
  zoom: number;
  zoomToolActive: boolean;
  onToggleZoomTool: () => void;
  onResetZoom: () => void;
}

/**
 * Herramienta de lupa para el diagrama activo (Piper, Schoeller) — mismo
 * patrón que el zoom de la grilla de Stiff, pero como panel propio (Stiff
 * tiene su propia grilla con su propio zoom, ver StiffGrid).
 */
function ViewZoomPanel({ zoom, zoomToolActive, onToggleZoomTool, onResetZoom }: ViewZoomPanelProps) {
  return (
    <Section title="Vista">
      <div className="hgm-style-row">
        <button className={`hgm-zoom-btn${zoomToolActive ? ' active' : ''}`} onClick={onToggleZoomTool}
                title="Herramienta de lupa: clic en el diagrama para acercar, Mayús+clic para alejar">
          🔍 Zoom
        </button>
        <button className="hgm-zoom-btn" onClick={onResetZoom} style={{ marginLeft: 6 }}>{Math.round(zoom * 100)}%</button>
      </div>
    </Section>
  );
}

/**
 * Un selector de campo de eje (ion individual o relación) — usado dos
 * veces (X e Y) por IonRatioAxisPanel. Completamente controlado: no
 * guarda estado propio, `field.kind` decide qué sub-selectores mostrar.
 */
function AxisFieldEditor({ label, field, onChange }: { label: string; field: AxisField; onChange: (f: AxisField) => void }) {
  return (
    <>
      <div className="hgm-sub-label">{label}</div>
      <div className="hgm-style-row">
        <select
          className="hgm-select"
          value={field.kind}
          onChange={e => onChange(
            e.target.value === 'ion'
              ? { kind: 'ion', ion: 'Na', unit: 'meq/L' }
              : { kind: 'ratio', numerator: 'Na', denominator: 'Cl' },
          )}
        >
          <option value="ion">Ion individual</option>
          <option value="ratio">Relación (ratio)</option>
        </select>
      </div>
      {field.kind === 'ion' ? (
        <div className="hgm-style-row">
          <select className="hgm-select" value={field.ion} onChange={e => onChange({ ...field, ion: e.target.value as IonKey })}>
            {ION_KEYS.map(k => <option key={k} value={k}>{ION_LABELS[k]}</option>)}
          </select>
          <select className="hgm-select" value={field.unit} onChange={e => onChange({ ...field, unit: e.target.value as IonUnit })}>
            <option value="mg/L">mg/L</option>
            <option value="meq/L">meq/L</option>
          </select>
        </div>
      ) : (
        <div className="hgm-style-row">
          <select className="hgm-select" value={field.numerator} onChange={e => onChange({ ...field, numerator: e.target.value as IonKey })}>
            {ION_KEYS.map(k => <option key={k} value={k}>{ION_LABELS[k]}</option>)}
          </select>
          <span style={{ fontSize: '.72rem', color: 'var(--text-dim)' }}>/</span>
          <select className="hgm-select" value={field.denominator} onChange={e => onChange({ ...field, denominator: e.target.value as IonKey })}>
            {ION_KEYS.map(k => <option key={k} value={k}>{ION_LABELS[k]}</option>)}
          </select>
        </div>
      )}
    </>
  );
}

interface IonRatioAxisPanelProps {
  xField: AxisField;
  yField: AxisField;
  yScale: AxisScale;
  onXFieldChange: (f: AxisField) => void;
  onYFieldChange: (f: AxisField) => void;
  onYScaleChange: (s: AxisScale) => void;
}

/**
 * Panel de configuración del diagrama de relaciones iónicas (Etapa 7) —
 * eje X (siempre log) y eje Y (log/lineal, toggle) editables, cada uno
 * como ion individual o relación numerador/denominador. Ver
 * ionicRatios.ts para la lógica de cálculo.
 */
function IonRatioAxisPanel({ xField, yField, yScale, onXFieldChange, onYFieldChange, onYScaleChange }: IonRatioAxisPanelProps) {
  return (
    <Section title="Ejes (relaciones iónicas)">
      <AxisFieldEditor label="Eje X (siempre log)" field={xField} onChange={onXFieldChange} />
      <AxisFieldEditor label="Eje Y" field={yField} onChange={onYFieldChange} />
      <div className="hgm-sub-label">Escala eje Y</div>
      <div className="hgm-style-row">
        <button className={`hgm-zoom-btn${yScale === 'linear' ? ' active' : ''}`} onClick={() => onYScaleChange('linear')}>Lineal</button>
        <button className={`hgm-zoom-btn${yScale === 'log' ? ' active' : ''}`} onClick={() => onYScaleChange('log')} style={{ marginLeft: 6 }}>Log</button>
      </div>
    </Section>
  );
}

interface SchoellerBerkaloffAxisPanelProps {
  meqLMinInput: string;
  meqLMaxInput: string;
  onMeqLMinChange: (v: string) => void;
  onMeqLMaxChange: (v: string) => void;
}

/**
 * Panel de rango del eje meq/L compartido (Etapa 8) — vacío = auto
 * (calculado del rango real de los datos, ver SchoellerBerkaloffDiagram),
 * o un mínimo/máximo manual. Mismo patrón de inputs vacío=auto que la
 * escala manual de Stiff (StiffStylePanel) más arriba.
 */
function SchoellerBerkaloffAxisPanel({ meqLMinInput, meqLMaxInput, onMeqLMinChange, onMeqLMaxChange }: SchoellerBerkaloffAxisPanelProps) {
  return (
    <Section title="Rango del eje meq/L">
      <div className="hgm-sub-label">Mínimo (vacío = auto)</div>
      <div className="hgm-style-row">
        <input type="number" className="hgm-num-input" min={0.001} step="any" placeholder="auto"
               value={meqLMinInput} onChange={e => onMeqLMinChange(e.target.value)} />
      </div>
      <div className="hgm-sub-label">Máximo (vacío = auto)</div>
      <div className="hgm-style-row">
        <input type="number" className="hgm-num-input" min={0.001} step="any" placeholder="auto"
               value={meqLMaxInput} onChange={e => onMeqLMaxChange(e.target.value)} />
      </div>
    </Section>
  );
}

interface CheckListProps {
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}

function CheckList({ options, selected, onToggle }: CheckListProps) {
  if (options.length === 0) return <div className="hgm-empty-note">— sin datos —</div>;
  return (
    <div className="hgm-checklist">
      {options.map(opt => (
        <label key={opt} className="hgm-checkrow">
          <input type="checkbox" checked={selected.has(opt)} onChange={() => onToggle(opt)} />
          {opt}
        </label>
      ))}
    </div>
  );
}

interface FilterPanelProps {
  allPozos: string[];
  pozoFilter: Set<string>;
  onTogglePozo: (v: string) => void;
}

function FilterPanel(p: FilterPanelProps) {
  return (
    <Section title="Filtro de muestras">
      <div className="hgm-sub-label">Pozo (vacío = todos)</div>
      <CheckList options={p.allPozos} selected={p.pozoFilter} onToggle={p.onTogglePozo} />
    </Section>
  );
}

/**
 * Selector de clasificación (Etapa 3) — poblado con
 * getClassifiableFields(samples), no con 2 opciones fijas: si en
 * el futuro se agregan más campos categóricos a WaterSample, aparecen acá
 * solos, sin tocar este componente.
 */
function ClassificationSelector({ fields, field, onChange }: { fields: string[]; field: string; onChange: (f: string) => void }) {
  return (
    <Section title="Colorear por">
      <select className="hgm-select" value={field} onChange={e => onChange(e.target.value)}>
        {fields.map(f => (
          <option key={f} value={f}>{CLASSIFIABLE_FIELD_LABELS[f] ?? f}</option>
        ))}
      </select>
    </Section>
  );
}

interface PiperStylePanelProps {
  style: PiperStyleSettings;
  /** (color,shape) automáticos por grupo — se usan como valor inicial de cada fila hasta que el usuario la edite. */
  autoColors: Map<string, string>;
  onOutlineChange: (patch: Partial<LineStyle>) => void;
  onDashedChange: (patch: Partial<LineStyle>) => void;
  onPointStyleChange: (group: string, patch: Partial<GroupPointStyle>) => void;
}

/**
 * Panel de estilo del Piper triangular — Etapa de edición de gráfico:
 * color/grosor de contornos y líneas segmentadas (estilo COMPARTIDO entre
 * las 3 figuras, no uno por triángulo), y forma/tamaño/color por GRUPO
 * para los puntos (misma agrupación que "Colorear por" arriba).
 */
function PiperStylePanel({ style, autoColors, onOutlineChange, onDashedChange, onPointStyleChange }: PiperStylePanelProps) {
  return (
    <Section title="Estilo del gráfico">
      <div className="hgm-sub-label">Contornos (triángulos + rombo)</div>
      <div className="hgm-style-row">
        <span className="hgm-style-lbl">Color</span>
        <input type="color" className="hgm-color-input" value={style.outline.color}
               onChange={e => onOutlineChange({ color: e.target.value })} />
        <span className="hgm-style-lbl">Grosor</span>
        <input type="number" className="hgm-num-input" min={0.5} max={5} step={0.5}
               value={style.outline.width}
               onChange={e => onOutlineChange({ width: Math.max(0.5, Math.min(5, parseFloat(e.target.value) || DEFAULT_OUTLINE.width)) })} />
      </div>

      <div className="hgm-sub-label">Líneas segmentadas (facies 50%)</div>
      <div className="hgm-style-row">
        <span className="hgm-style-lbl">Color</span>
        <input type="color" className="hgm-color-input" value={style.dashed.color}
               onChange={e => onDashedChange({ color: e.target.value })} />
        <span className="hgm-style-lbl">Grosor</span>
        <input type="number" className="hgm-num-input" min={0.3} max={4} step={0.1}
               value={style.dashed.width}
               onChange={e => onDashedChange({ width: Math.max(0.3, Math.min(4, parseFloat(e.target.value) || DEFAULT_DASHED.width)) })} />
      </div>

      <div className="hgm-sub-label">Puntos por grupo</div>
      {autoColors.size === 0 ? (
        <div className="hgm-empty-note">— sin muestras —</div>
      ) : (
        <div className="hgm-point-list">
          {[...autoColors.entries()].map(([group, autoColor]) => {
            const cur = style.points[group] ?? { shape: DEFAULT_POINT_SHAPE, size: DEFAULT_POINT_SIZE, color: autoColor };
            return (
              <div key={group} className="hgm-point-row">
                <div className="hgm-point-name" title={group}>{group}</div>
                <div className="hgm-point-ctrls">
                  <select className="hgm-select" value={cur.shape}
                          onChange={e => onPointStyleChange(group, { ...cur, shape: e.target.value as GroupPointStyle['shape'] })}>
                    {POINT_SHAPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <input type="number" className="hgm-num-input" min={1} max={10} step={0.5}
                         value={cur.size}
                         onChange={e => onPointStyleChange(group, { ...cur, size: Math.max(1, Math.min(10, parseFloat(e.target.value) || DEFAULT_POINT_SIZE)) })} />
                  <input type="color" className="hgm-color-input" value={cur.color}
                         onChange={e => onPointStyleChange(group, { ...cur, color: e.target.value })} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

interface StiffZoomPanelProps {
  zoom: number;
  zoomToolActive: boolean;
  onToggleZoomTool: () => void;
  onResetZoom: () => void;
}

/**
 * Herramienta de lupa de la grilla de Stiff — separada de StiffStylePanel
 * (Etapa 2 de divulgación progresiva): mismo criterio que ViewZoomPanel
 * de los demás diagramas (herramienta de interacción con el lienzo, no un
 * ajuste de apariencia), así que queda ESENCIAL/siempre visible en vez de
 * escondida detrás del acordeón "Estilo" — antes vivía adentro de
 * StiffStylePanel porque Stiff no tenía ViewZoomPanel propio (tiene su
 * propia grilla, con su propio zoom — ver StiffGrid), no porque fuera
 * conceptualmente "estilo".
 */
function StiffZoomPanel({ zoom, zoomToolActive, onToggleZoomTool, onResetZoom }: StiffZoomPanelProps) {
  return (
    <Section title="Vista">
      <div className="hgm-style-row">
        <button className={`hgm-zoom-btn${zoomToolActive ? ' active' : ''}`} onClick={onToggleZoomTool}
                title="Herramienta de lupa: clic en la grilla para acercar, Mayús+clic para alejar">
          🔍 Zoom
        </button>
        <button className="hgm-zoom-btn" onClick={onResetZoom} style={{ marginLeft: 6 }}>{Math.round(zoom * 100)}%</button>
      </div>
    </Section>
  );
}

interface StiffStylePanelProps {
  style: StiffStyleSettings;
  autoColors: Map<string, string>;
  onPolygonColorChange: (group: string, color: string) => void;
  onScaleManualChange: (value: number | null) => void;
}

/**
 * Panel de estilo de la grilla de Stiff: escala manual (reemplaza el
 * autocálculo compartido entre tarjetas) y color de polígono por grupo
 * (mismo agrupamiento que "Colorear por"). La herramienta de zoom vivía
 * acá pero se separó a StiffZoomPanel (ver JSDoc de ese componente) — este
 * panel quedó con SOLO ajustes de apariencia, coherente con que ahora
 * vive detrás del acordeón "Estilo" (Etapa 2 de divulgación progresiva).
 * La tipografía de "los números" (etiquetas de eje + valores de escala)
 * se retiró de acá en la Etapa 4.5b — ahora vive en ChartStyleEditor
 * (fontFamily/fontSize genéricos, ver ChartStyleSettings), renderizado
 * aparte junto a este panel.
 */
function StiffStylePanel({
  style, autoColors, onPolygonColorChange, onScaleManualChange,
}: StiffStylePanelProps) {
  return (
    <Section title="Estilo de Stiff">
      <div className="hgm-sub-label">Escala</div>
      <div className="hgm-style-row">
        <span className="hgm-style-lbl">± meq/L</span>
        <input
          type="number" className="hgm-num-input" min={0.1} step={0.5}
          placeholder="auto"
          value={style.scaleManual ?? ''}
          onChange={e => {
            const v = parseFloat(e.target.value);
            onScaleManualChange(Number.isFinite(v) && v > 0 ? v : null);
          }}
        />
        {style.scaleManual != null && (
          <button className="hgm-link-btn" style={{ marginTop: 0, marginLeft: 6 }} onClick={() => onScaleManualChange(null)}>
            Auto
          </button>
        )}
      </div>

      <div className="hgm-sub-label">Polígono por grupo</div>
      {autoColors.size === 0 ? (
        <div className="hgm-empty-note">— sin muestras —</div>
      ) : (
        <div className="hgm-point-list">
          {[...autoColors.entries()].map(([group, autoColor]) => (
            <div key={group} className="hgm-point-row">
              <div className="hgm-point-name" title={group}>{group}</div>
              <input type="color" className="hgm-color-input" value={style.polygonColors[group] ?? autoColor}
                     onChange={e => onPolygonColorChange(group, e.target.value)} />
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

interface ChartLocationPanelProps {
  location: ChartLocation;
  disabled: boolean;
  disabledReason: string;
  onChange: (patch: Partial<ChartLocation>) => void;
}

/**
 * Ubicación espacial manual (Este/Norte, EPSG del proyecto GIS) de UN
 * diagrama combinado — Etapa 2 del paquete de ubicación espacial. Solo
 * guarda el estado en memoria acá; la publicación real como capa ráster
 * en GIS y la persistencia en HidrogeoquimicaProjectState quedan para
 * etapas posteriores (ver notas junto a `chartLocations` más abajo).
 * `disabled` refleja `gisEpsgStatus !== 'ok'` (ver indicador del header) —
 * mismo mensaje que ese indicador, para no duplicar redacción.
 */
function ChartLocationPanel({ location, disabled, disabledReason, onChange }: ChartLocationPanelProps) {
  return (
    <Section title="Ubicación en GIS">
      {disabled && <div className="hgm-empty-note" style={{ marginBottom: 8 }}>{disabledReason}</div>}
      <div className="hgm-sub-label">Este</div>
      <div className="hgm-style-row">
        <input
          type="number" className="hgm-num-input" style={{ width: '100%' }} step="any"
          placeholder="Este" disabled={disabled} value={location.east}
          onChange={e => onChange({ east: e.target.value })}
          data-testid="chart-location-east"
        />
      </div>
      <div className="hgm-sub-label">Norte</div>
      <div className="hgm-style-row">
        <input
          type="number" className="hgm-num-input" style={{ width: '100%' }} step="any"
          placeholder="Norte" disabled={disabled} value={location.north}
          onChange={e => onChange({ north: e.target.value })}
          data-testid="chart-location-north"
        />
      </div>
      <label className="hgm-checkrow" style={{ marginTop: 8, opacity: disabled ? 0.5 : 1 }}>
        <input
          type="checkbox" checked={location.published} disabled={disabled}
          onChange={e => onChange({ published: e.target.checked })}
          data-testid="chart-location-publish"
        />
        Publicar en GIS
      </label>
    </Section>
  );
}

interface StiffPublishPanelProps {
  published: boolean;
  onChange: (v: boolean) => void;
}

/**
 * Etapa 5: a diferencia de ChartLocationPanel (Este/Norte manual por
 * diagrama), acá NO hay coordenadas que tipear — cada tarjeta usa la
 * ubicación real de SU propia muestra (mismo lat/lon que ya alimenta la
 * capa 'integrated-hidrogeo' de puntos), reproyectada del lado de GIS
 * exactamente igual que esa capa. Un solo checkbox activa/desactiva TODAS
 * las tarjetas juntas — no tiene sentido publicar "algunas" tarjetas de
 * Stiff, a diferencia de los 5 diagramas combinados (cada uno con su
 * propio significado). Sin gate por EPSG: Hidrogeoquímica no necesita
 * saber el EPSG del proyecto para exportar lat/lon crudo, solo GIS lo
 * necesita para reproyectar — mismo desacople que ya tiene la capa de
 * puntos hoy.
 */
function StiffPublishPanel({ published, onChange }: StiffPublishPanelProps) {
  return (
    <Section title="Publicación en GIS">
      <label className="hgm-checkrow">
        <input
          type="checkbox" checked={published}
          onChange={e => onChange(e.target.checked)}
          data-testid="stiff-publish-checkbox"
        />
        Publicar tarjetas de Stiff en GIS
      </label>
      <div className="hgm-empty-note" style={{ marginTop: 6 }}>
        Cada tarjeta usa la ubicación real (lat/lon) de su propia muestra — no requiere coordenadas manuales.
      </div>
    </Section>
  );
}

interface QAQCPanelProps {
  filteredSamples: WaterSample[];
  balances: Map<string, IonBalanceResult>;
  excludedIds: Set<string>;
  onToggleExcluded: (id: string) => void;
}

function QAQCPanel({ filteredSamples, balances, excludedIds, onToggleExcluded }: QAQCPanelProps) {
  const flaggedCount = filteredSamples.filter(s => balances.get(s.id)?.quality !== 'ok').length;
  return (
    <Section title={`QA/QC — balance iónico${flaggedCount ? ` (${flaggedCount} con aviso)` : ''}`}>
      <div className="hgm-qaqc-list">
        {filteredSamples.length === 0 && <div className="hgm-empty-note">— sin muestras —</div>}
        {filteredSamples.map(s => {
          const bal = balances.get(s.id);
          const meta = bal ? QUALITY_META[bal.quality] : QUALITY_META.ok;
          const included = !excludedIds.has(s.id);
          return (
            <div key={s.id} className="hgm-qaqc-row" style={{ opacity: included ? 1 : 0.4 }}>
              <input type="checkbox" checked={included} onChange={() => onToggleExcluded(s.id)} title="Incluir/excluir del gráfico" />
              <span className="hgm-qaqc-name">{s.name}</span>
              <span className={meta.cls} title={bal ? `CBE = ${bal.ionBalance.toFixed(1)} %` : ''}>
                {bal ? `${bal.ionBalance.toFixed(1)}%` : '—'} {meta.label}
              </span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

interface StiffGridProps {
  samples: WaterSample[];
  colorFor: (sample: WaterSample) => string;
  groupOf: (sample: WaterSample) => string;
  style: StiffStyleSettings;
  chartStyle: ChartStyleSettings;
  defaultTitle: string;
  zoom: number;
  zoomToolActive: boolean;
  onGridClick: (ev: React.MouseEvent) => void;
}

/**
 * Etapa 4.5b: `chartStyle` (ChartStyleSettings del diagrama 'stiff') se
 * aplica acá, no en StiffDiagram directamente, porque son settings de
 * NIVEL GRILLA — un único título para el conjunto de tarjetas (no uno por
 * tarjeta; cada StiffDiagram sigue mostrando el nombre de SU muestra,
 * eso no cambia) y una única leyenda de color por grupo (Stiff no tenía
 * leyenda en el diagrama antes de esta etapa — el color por grupo solo se
 * veía en el panel "Polígono por grupo" del costado). `fontFamily`/
 * `fontSize`/`lineThickness`/`showGrid`/`pointSize` sí se reenvían a CADA
 * StiffDiagram (esos aplican por tarjeta).
 */
function StiffGrid({ samples, colorFor, groupOf, style, chartStyle, defaultTitle, zoom, zoomToolActive, onGridClick }: StiffGridProps) {
  // Escala compartida entre todas las tarjetas — Stiff es por muestra, pero
  // deben verse comparables entre sí (ver nota en StiffMiniIcon.tsx/Etapa 10).
  // `scaleManual` (fijado a mano en el panel de estilo) reemplaza este
  // autocálculo cuando está definido.
  const autoScaleMax = samples.length
    ? Math.max(...samples.map(s => stiffDataMax(getStiffValues(s))), 0.01)
    : 1;
  const scaleMax = style.scaleManual ?? autoScaleMax;
  const title = chartStyle.title?.trim() || defaultTitle;
  const legendMap = buildColorMap(samples, groupOf);

  return (
    <div style={{ position: 'relative' }}>
      {title && (
        <div style={{ fontFamily: chartStyle.fontFamily, fontSize: chartStyle.fontSize * 1.15, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
          {title}
        </div>
      )}
      <div
        className={`hgm-stiff-grid${zoomToolActive ? ' zoom-tool-active' : ''}`}
        style={{ width: DIAGRAM_SIZE.stiff.width, zoom }}
        onClick={onGridClick}
      >
        {samples.map(s => {
          const group = groupOf(s);
          const color = style.polygonColors[group] ?? colorFor(s);
          return (
            <div key={s.id} className="hgm-stiff-card">
              <StiffDiagram
                sample={s} width={220} height={170} scaleMax={scaleMax} color={color}
                fontFamily={chartStyle.fontFamily} fontSize={chartStyle.fontSize}
                lineThickness={chartStyle.lineThickness} showGrid={chartStyle.showGrid}
                pointSize={chartStyle.pointSize}
              />
            </div>
          );
        })}
      </div>
      {chartStyle.legend.visible && legendMap.size > 0 && (
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', gap: '4px 14px',
            padding: '6px 8px', fontSize: chartStyle.fontSize, fontFamily: chartStyle.fontFamily, color: '#334155',
            background: 'rgba(255,255,255,.88)', borderRadius: 4,
            ...legendPositionStyle(chartStyle.legend.position),
          }}
        >
          {[...legendMap.entries()].map(([label, autoColor]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: style.polygonColors[label] ?? autoColor, display: 'inline-block', flexShrink: 0 }} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────

export const HydrogeochemistryModule = forwardRef<HydrogeochemistryModuleHandle, HydrogeochemistryModuleProps>(
  function HydrogeochemistryModule({ initialTab = 'piper' }, ref) {
  const [tab, setTab] = useState<DiagramKey>(initialTab);
  // Campo de clasificación (Etapa 3) — 'name' es el default (mismo
  // comportamiento que el antiguo colorMode='pozo').
  const [classifyField, setClassifyField] = useState<string>('name');
  // Config del diagrama de relaciones iónicas (Etapa 7) — deliberadamente
  // NO persistida (getProjectState()/loadProjectState() no la tocan
  // todavía): el bump de HidrogeoquimicaProjectState a schemaVersion 3
  // queda para el final del paquete completo, no etapa por etapa.
  const [ionRatioXField, setIonRatioXField] = useState<AxisField>(DEFAULT_X_FIELD);
  const [ionRatioYField, setIonRatioYField] = useState<AxisField>(DEFAULT_Y_FIELD);
  const [ionRatioYScale, setIonRatioYScale] = useState<AxisScale>('linear');
  // Rango manual del eje meq/L de Schoeller-Berkaloff (Etapa 8) — strings
  // vacíos = auto (SchoellerBerkaloffDiagram calcula el rango del dato real
  // cuando la prop viene undefined). Tampoco persistida, mismo criterio que
  // ionRatioXField/ionRatioYField arriba.
  const [schoellerMeqLMinInput, setSchoellerMeqLMinInput] = useState('');
  const [schoellerMeqLMaxInput, setSchoellerMeqLMaxInput] = useState('');
  const [pozoFilter, setPozoFilter] = useState<Set<string>>(new Set());
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  // Estilo editable del Piper triangular (contornos, líneas segmentadas,
  // puntos por grupo) — persistido en localStorage, ver diagramStyle.ts.
  const [piperStyle, setPiperStyle] = useState<PiperStyleSettings>(() => loadPiperStyle());
  useEffect(() => { savePiperStyle(piperStyle); }, [piperStyle]);
  // Estilo editable de la grilla de Stiff (color de polígono por grupo,
  // color/fuente/tamaño de "los números", escala manual) — persistido en
  // localStorage, ver stiffStyle.ts.
  const [stiffStyle, setStiffStyle] = useState<StiffStyleSettings>(() => loadStiffStyle());
  useEffect(() => { saveStiffStyle(stiffStyle); }, [stiffStyle]);
  // Estilo "de carrocería" genérico (Etapa 4.5b) — título, tipografía,
  // grosor de ejes/referencia, tamaño de marcador, grilla, leyenda — uno
  // por diagrama (chartStyle.ts), independiente del sistema de
  // clasificación por color de datos. Persistido en localStorage, mismo
  // mecanismo que piperStyle/stiffStyle. Todavía NO es parte de
  // HidrogeoquimicaProjectState (igual que piperStyle/stiffStyle antes de
  // integrarse a Proyectos) — decisión aparte, no de esta etapa.
  const [chartStyles, setChartStyles] = useState(() => loadChartStyleMap(CHART_STYLE_STORAGE_KEY, DIAGRAM_IDS));
  useEffect(() => { saveChartStyleMap(CHART_STYLE_STORAGE_KEY, chartStyles); }, [chartStyles]);
  // Ref genérica al contenedor del diagrama ACTIVO (.hgm-paper, más abajo)
  // — un solo ref reutilizable para cualquier pestaña, en vez de uno por
  // diagrama: ExportButton ya busca el primer <svg> adentro (ver
  // ExportButton.tsx/exportDiagram.ts), así que apunta al diagrama que
  // esté montado en cada momento sin necesidad de conmutar refs. Para
  // Stiff (una GRILLA de varios <svg>, uno por muestra) esto exporta solo
  // la primera tarjeta — limitación conocida, documentada en el botón.
  const diagramContainerRef = useRef<HTMLDivElement>(null);
  // Zoom de la grilla de Stiff — herramienta de lupa, mismo patrón que el
  // zoom de columnas/viewer.html: clic para acercar, Mayús+clic para
  // alejar. Vive en el estado del módulo (no persistido) porque es una
  // preferencia de vista puntual, no de estilo del gráfico.
  const [stiffZoom, setStiffZoom] = useState(1);
  const [stiffZoomToolActive, setStiffZoomToolActive] = useState(false);
  // Zoom del diagrama activo para Piper/Schoeller — mismo patrón que
  // stiffZoom, pero uno solo compartido porque estas pestañas muestran un
  // único gráfico (no una grilla) a la vez.
  const [diagramZoom, setDiagramZoom] = useState(1);
  const [diagramZoomToolActive, setDiagramZoomToolActive] = useState(false);
  // Muestras desde QA/QC (tabla "Datos hidrogeoquímicos") — ÚNICA fuente de
  // datos del módulo desde que se eliminó la importación directa por CSV/Excel
  // (mismo patrón que Análisis Estructural: fetchQaqcStructuralDataset). Se
  // recalculan al montar y NO se persisten en el proyecto: viven en el estado
  // de QA/QC, que ya se guarda (ver la migración v9→v10 de
  // HidrogeoquimicaProjectState). Combina todos los archivos de ese tipo.
  const [samples, setSamples] = useState<WaterSample[]>([]);
  const [qaqcStatus, setQaqcStatus] = useState<QaqcFetchStatus>({ kind: 'loading' });
  useEffect(() => {
    fetchQaqcHydroDataset()
      .then((s) => { setSamples(s); setQaqcStatus({ kind: 'ok', count: s.length }); })
      .catch((err) => {
        setSamples([]);
        setQaqcStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      });
  }, []);

  // ── EPSG de GIS (paquete de ubicación espacial de gráficos) ──────────
  // Hidrogeoquímica corre en un iframe HERMANO de GIS, sin canal directo
  // entre ellos — el mismo relevo genérico de la raíz que GIS ya usa para
  // preguntarle a Hidrogeoquímica/Columnas (Etapa 11,
  // requestModuleStateFromParent(), projectBridge.ts), ahora también
  // atendido para 'hidro-frame' (ver index.html,
  // resolveHidroRelayTargetFrame) — CERO cambios al protocolo, solo un
  // segundo registro del lado de la raíz.
  //
  // `gisEpsgStatus` distingue 3 casos que la UI muestra distinto:
  //  - 'no-gis': `state === null` — GIS nunca se abrió en esta sesión
  //    (resolveHidroRelayTargetFrame devuelve null de inmediato) O la
  //    ventana raíz no pudo relevar a tiempo.
  //  - 'no-epsg': GIS SÍ respondió pero `extent` es null (proyecto sin
  //    caja 3D/EPSG configurado todavía).
  //  - 'ok': `extent.projectionEPSG` con un valor real.
  // No se pide en un useEffect con timer propio ni se persiste — es
  // información EN VIVO de otro módulo, se vuelve a pedir al montar y con
  // el botón "↻ Refrescar" (el usuario puede definir el EPSG en GIS
  // DESPUÉS de haber abierto Hidrogeoquímica, en cualquier orden).
  const [gisEpsg, setGisEpsg] = useState<string | null>(null);
  const [gisEpsgStatus, setGisEpsgStatus] = useState<'loading' | 'ok' | 'no-gis' | 'no-epsg'>('loading');

  function refreshGisEpsg() {
    setGisEpsgStatus('loading');
    requestModuleStateFromParent('gis-frame')
      .then((state) => {
        const gisState = state as GisProjectState | null;
        if (!gisState) {
          setGisEpsg(null);
          setGisEpsgStatus('no-gis');
          return;
        }
        const epsg = gisState.extent?.projectionEPSG ?? null;
        setGisEpsg(epsg);
        setGisEpsgStatus(epsg ? 'ok' : 'no-epsg');
      })
      .catch(() => {
        // Documento fuera de un iframe, o timeout del relevo — mismo
        // tratamiento visual que "GIS nunca se abrió": no hay EPSG
        // disponible, sin importar la causa exacta.
        setGisEpsg(null);
        setGisEpsgStatus('no-gis');
      });
  }
  useEffect(() => { refreshGisEpsg(); }, []);

  const gisEpsgMessage =
    gisEpsgStatus === 'loading' ? 'Consultando GIS…' :
    gisEpsgStatus === 'no-epsg' ? 'Define primero el sistema de referencia en GIS' :
    gisEpsgStatus === 'no-gis'  ? 'GIS no está abierto en esta sesión' :
    '';

  // Ubicación en GIS por diagrama (Etapa 2) — solo en memoria por ahora,
  // ver JSDoc de ChartLocationPanel. Deliberadamente NO persistida todavía
  // (getProjectState()/loadProjectState() no la tocan) — la persistencia
  // real es la Etapa 6 del paquete, mismo criterio ya usado con
  // ionRatioXField/schoellerMeqLMinInput antes de integrarse a Proyectos.
  const [chartLocations, setChartLocations] = useState<Record<LocatableDiagramKey, ChartLocation>>(() => {
    const initial = {} as Record<LocatableDiagramKey, ChartLocation>;
    for (const id of LOCATABLE_DIAGRAM_IDS) initial[id] = DEFAULT_CHART_LOCATION;
    return initial;
  });
  function updateChartLocation(diagramId: LocatableDiagramKey, patch: Partial<ChartLocation>) {
    setChartLocations(prev => ({ ...prev, [diagramId]: { ...prev[diagramId], ...patch } }));
  }

  // Publicación de tarjetas de Stiff en GIS (Etapa 5) — a diferencia de
  // chartLocations (Etapa 2), esto es UN checkbox para TODAS las
  // tarjetas, no uno por muestra: cada tarjeta ya tiene su propia
  // ubicación real (WaterSample.coordinates, lat/lon) — no hay nada que
  // el usuario tenga que tipear a mano, así que no hace falta un
  // ChartLocation por muestra ni un gate por EPSG acá (a diferencia del
  // panel de los 5 diagramas combinados, que si necesita saber el EPSG
  // porque el usuario escribe números que solo tienen sentido en ESA
  // proyección — ver ChartLocationPanel). Solo en memoria por ahora,
  // mismo criterio "persistencia real es la Etapa 6" que chartLocations.
  const [stiffPublished, setStiffPublished] = useState(false);

  const allPozos = useMemo(() => [...new Set(samples.map(s => s.name))].sort(), [samples]);

  const filteredSamples = useMemo(() => samples.filter(s => {
    if (pozoFilter.size > 0 && !pozoFilter.has(s.name)) return false;
    return true;
  }), [samples, pozoFilter]);

  const balances = useMemo(
    () => new Map(filteredSamples.map(s => [s.id, calculateIonBalance(s)])),
    [filteredSamples],
  );

  const plottedSamples = useMemo(
    () => filteredSamples.filter(s => !excludedIds.has(s.id)),
    [filteredSamples, excludedIds],
  );

  // Campos disponibles para clasificar HOY (depende de samples:
  // 'campaign' solo aparece si alguna muestra la trae — ver
  // getClassifiableFields en sampleColor.ts). Si el campo elegido deja de
  // estar disponible (ej. se borró el dataset importado y el nuevo no
  // trae campaign), se vuelve a 'name' en vez de quedar en un campo fantasma.
  const classifiableFields = useMemo(() => getClassifiableFields(samples), [samples]);
  useEffect(() => {
    if (!classifiableFields.includes(classifyField)) setClassifyField('name');
  }, [classifiableFields, classifyField]);

  const groupOf = useMemo(() => (s: WaterSample) => getFieldValue(s, classifyField), [classifyField]);

  // Un único colorMap para todo el módulo — la misma muestra tiene el mismo
  // color sin importar qué pestaña esté activa.
  const colorMap = useMemo(() => buildColorMap(plottedSamples, groupOf), [plottedSamples, groupOf]);
  const colorFor = (s: WaterSample) => colorMap.get(groupOf(s)) ?? DEFAULT_PALETTE[0];

  function togglePozo(v: string) {
    setPozoFilter(prev => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });
  }
  function toggleExcluded(id: string) {
    setExcludedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function updateOutline(patch: Partial<LineStyle>) {
    setPiperStyle(prev => ({ ...prev, outline: { ...prev.outline, ...patch } }));
  }
  function updateDashed(patch: Partial<LineStyle>) {
    setPiperStyle(prev => ({ ...prev, dashed: { ...prev.dashed, ...patch } }));
  }
  function updatePointStyle(group: string, patch: Partial<GroupPointStyle>) {
    setPiperStyle(prev => {
      const fallback: GroupPointStyle = { shape: DEFAULT_POINT_SHAPE, size: DEFAULT_POINT_SIZE, color: colorMap.get(group) ?? DEFAULT_PALETTE[0] };
      return { ...prev, points: { ...prev.points, [group]: { ...(prev.points[group] ?? fallback), ...patch } } };
    });
  }

  function updateStiffPolygonColor(group: string, color: string) {
    setStiffStyle(prev => ({ ...prev, polygonColors: { ...prev.polygonColors, [group]: color } }));
  }
  function updateStiffScaleManual(value: number | null) {
    setStiffStyle(prev => ({ ...prev, scaleManual: value }));
  }

  function updateChartStyle(diagramId: DiagramKey, patch: Partial<ChartStyleSettings>) {
    setChartStyles(prev => ({ ...prev, [diagramId]: { ...prev[diagramId], ...patch } }));
  }

  function toggleStiffZoomTool() {
    setStiffZoomToolActive(prev => !prev);
  }
  function onStiffGridClick(ev: React.MouseEvent) {
    if (!stiffZoomToolActive) return;
    setStiffZoom(z => Math.max(0.4, Math.min(3, ev.shiftKey ? z / 1.2 : z * 1.2)));
  }
  function resetStiffZoom() {
    setStiffZoom(1);
  }

  function toggleDiagramZoomTool() {
    setDiagramZoomToolActive(prev => !prev);
  }
  function onDiagramViewClick(ev: React.MouseEvent) {
    if (!diagramZoomToolActive) return;
    setDiagramZoom(z => Math.max(0.4, Math.min(3, ev.shiftKey ? z / 1.2 : z * 1.2)));
  }
  function resetDiagramZoom() {
    setDiagramZoom(1);
  }

  /**
   * Estado "sin muestras visibles": único botón de escape — limpia los
   * filtros/exclusiones que pueden vaciar `plottedSamples` (Pozo y
   * exclusiones). El dataset (que ahora viene de QA/QC) no cambia; solo se
   * destraba lo que lo estaba ocultando.
   */
  function clearFiltersAndExclusions() {
    setPozoFilter(new Set());
    setExcludedIds(new Set());
  }

  // ── Puente de Proyectos (ver src/hidrogeo/main.tsx) ─────────────
  // getProjectState() persiste solo la configuración de vista/estilo/filtros —
  // NO las muestras (vienen de QA/QC, se recalculan al montar; ver la
  // migración v9→v10 de HidrogeoquimicaProjectState). Tampoco persiste la
  // pestaña activa (tab): es navegación pura, se resuelve sola al montar.
  //
  // schemaVersion 3 (Etapa 9): classifyField (Etapa 3) se persiste
  // directo, ya no como el `colorMode` heredado — ver migrations[2] en
  // projectMigrations.js para la migración de archivos v2 viejos. Los
  // inputs de rango de Schoeller-Berkaloff son strings en el estado en
  // vivo (vacío = auto, mismo criterio que el resto de los inputs
  // "vacío=auto" del módulo) pero se serializan como `number | null` —
  // más limpio para el contrato de HidrogeoquimicaProjectState que
  // persistir el string crudo del input.

  function loadProjectState(state: HidrogeoquimicaProjectState) {
    // Las muestras NO se restauran acá: vienen de QA/QC (se recalculan al
    // montar, ver el useEffect de fetchQaqcHydroDataset). Solo se restaura la
    // configuración de vista/estilo/filtros del módulo.
    setExcludedIds(new Set(state.excludedSampleIds));
    setClassifyField(state.classifyField);
    setPozoFilter(new Set(state.filters.pozo));
    // `state.filters.campaign` (LEGADO) se ignora a propósito: el filtro por
    // campaña ya no existe en la UI, así que un proyecto viejo que lo traiga
    // activo simplemente deja de aplicarlo (se muestran todas las campañas).
    setStiffZoom(state.zoom.stiff.value);
    setStiffZoomToolActive(state.zoom.stiff.toolActive);
    setDiagramZoom(state.zoom.diagram.value);
    setDiagramZoomToolActive(state.zoom.diagram.toolActive);
    setPiperStyle(state.diagramStyles.piper);
    setStiffStyle(state.diagramStyles.stiff); // su useEffect ya espeja a localStorage
    setIonRatioXField(state.ionRatio.xField);
    setIonRatioYField(state.ionRatio.yField);
    setIonRatioYScale(state.ionRatio.yScale);
    setSchoellerMeqLMinInput(state.schoellerBerkaloff.meqLMin == null ? '' : String(state.schoellerBerkaloff.meqLMin));
    setSchoellerMeqLMaxInput(state.schoellerBerkaloff.meqLMax == null ? '' : String(state.schoellerBerkaloff.meqLMax));

    // Etapa 6: una key ausente en state.chartLocations (proyecto viejo
    // migrado, o un diagrama que nunca se tocó) usa DEFAULT_CHART_LOCATION
    // — mismo criterio "vacío = sin definir" que el resto del módulo.
    const loadedChartLocations = {} as Record<LocatableDiagramKey, ChartLocation>;
    for (const id of LOCATABLE_DIAGRAM_IDS) {
      const saved = state.chartLocations[id];
      loadedChartLocations[id] = saved
        ? {
            east: saved.east == null ? '' : String(saved.east),
            north: saved.north == null ? '' : String(saved.north),
            published: saved.published,
          }
        : DEFAULT_CHART_LOCATION;
    }
    setChartLocations(loadedChartLocations);
    setStiffPublished(state.stiffPublished);
  }

  function getProjectState(): HidrogeoquimicaProjectState {
    const snapshot: HidrogeoquimicaProjectState = {
      excludedSampleIds: [...excludedIds],
      classifyField,
      // `campaign` (filtro por campaña) ya no se persiste: se eliminó de la UI.
      // Ver HidrogeoquimicaProjectState en projectTypes.ts (campo LEGADO opcional).
      filters: {
        pozo: [...pozoFilter],
      },
      zoom: {
        stiff:   { value: stiffZoom,   toolActive: stiffZoomToolActive },
        diagram: { value: diagramZoom, toolActive: diagramZoomToolActive },
      },
      diagramStyles: {
        piper: piperStyle,
        stiff: stiffStyle,
      },
      ionRatio: {
        xField: ionRatioXField,
        yField: ionRatioYField,
        yScale: ionRatioYScale,
      },
      schoellerBerkaloff: {
        meqLMin: parseOptionalNumber(schoellerMeqLMinInput),
        meqLMax: parseOptionalNumber(schoellerMeqLMaxInput),
      },
      chartLocations: Object.fromEntries(
        LOCATABLE_DIAGRAM_IDS.map(id => [id, {
          east: parseOptionalNumber(chartLocations[id].east),
          north: parseOptionalNumber(chartLocations[id].north),
          published: chartLocations[id].published,
        }]),
      ),
      stiffPublished,
    };
    return structuredClone(snapshot);
  }

  // ── Publicación en GIS: PNG en memoria de los diagramas ubicados ────
  // (Etapa 3 del paquete de ubicación espacial). Solo el tab ACTIVO se
  // monta en `.hgm-view` (`diagramContainerRef`, ver más abajo) — para
  // poder generar el PNG de un diagrama con "Publicar en GIS" activo SIN
  // importar qué pestaña esté mirando el usuario, cada diagrama ubicable
  // con `published: true` se monta TAMBIÉN, siempre, en un contenedor
  // fuera de pantalla (ver `<div className="hgm-offscreen-publish">` en
  // el JSX) — `publishedRefs` guarda un ref por diagrama a esa copia.
  // `renderDiagramElement` arma el elemento de un diagrama dado (mismos
  // props que ya usaba el switch inline de `.hgm-view`) para que la copia
  // visible y la copia fuera de pantalla compartan exactamente la misma
  // lógica, sin duplicarla.
  //
  // Sin caché — se rasteriza de nuevo en cada llamada a getChartPNGBlob.
  // Ver criterio completo en la respuesta de la Etapa 3: los datasets son
  // chicos (rasterizar es barato), la consulta desde GIS es "a pedido"
  // (mismo patrón pull que el indicador de EPSG), y cachear obligaría a
  // invalidar en cada fuente de cambio relevante (datos, clasificación,
  // filtros, estilo por diagrama, estilo de Piper, rango de
  // Schoeller-Berkaloff, ejes de relaciones iónicas) — un solo olvido ahí
  // produce una capa de GIS silenciosamente desactualizada, peor que el
  // costo de recalcular.
  const publishedRefs = useRef<Partial<Record<LocatableDiagramKey, HTMLDivElement | null>>>({});

  // ── Publicación en GIS: tarjetas de Stiff (Etapa 5) ─────────────────
  // Mismo patrón de copias fuera de pantalla que arriba, pero UNA por
  // MUESTRA (no por tipo de diagrama) — `stiffPublishRefs` se indexa por
  // `sample.id`. `stiffScaleMax` duplica a propósito el cálculo interno
  // de StiffGrid (autoScaleMax/style.scaleManual) en vez de que StiffGrid
  // lo exponga hacia afuera: son 2 líneas, y así la vista visible
  // (StiffGrid, ya probada) queda intacta — ambas copias (visible y
  // publicada) usan la MISMA fórmula sobre las MISMAS `plottedSamples`,
  // así que la escala nunca diverge entre lo que el usuario ve y lo que
  // se publica.
  const stiffPublishRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const stiffAutoScaleMax = plottedSamples.length
    ? Math.max(...plottedSamples.map(s => stiffDataMax(getStiffValues(s))), 0.01)
    : 1;
  const stiffScaleMax = stiffStyle.scaleManual ?? stiffAutoScaleMax;
  /** Solo las muestras publicables — sin coordenadas no hay dónde ubicar la tarjeta (mismo criterio que hidrogeoIntegration.ts). */
  const stiffPublishableSamples = plottedSamples.filter(s => s.coordinates);

  function renderDiagramElement(diagramId: LocatableDiagramKey): React.ReactNode {
    const diagramSize = DIAGRAM_SIZE[diagramId];
    const style = chartStyles[diagramId];
    switch (diagramId) {
      case 'piper':
        return (
          <PiperDiagram
            samples={plottedSamples} colorBy={groupOf} width={diagramSize.width} height={diagramSize.height}
            outline={piperStyle.outline} dashed={piperStyle.dashed} pointStyles={piperStyle.points}
            title={style.title?.trim() || 'Diagrama de Piper'}
            fontFamily={style.fontFamily} fontSize={style.fontSize}
            lineThickness={style.lineThickness} pointSize={style.pointSize}
            showGrid={style.showGrid} legend={style.legend}
          />
        );
      case 'schoellerBerkaloff': {
        const meqLMin = parseOptionalNumber(schoellerMeqLMinInput);
        const meqLMax = parseOptionalNumber(schoellerMeqLMaxInput);
        return (
          <SchoellerBerkaloffDiagram
            samples={plottedSamples} colorBy={groupOf} width={diagramSize.width} height={diagramSize.height}
            meqLMin={meqLMin == null ? undefined : Math.max(0.001, meqLMin)}
            meqLMax={meqLMax == null ? undefined : Math.max(0.001, meqLMax)}
            title={style.title?.trim() || 'Schoeller-Berkaloff'}
            fontFamily={style.fontFamily} fontSize={style.fontSize}
            lineThickness={style.lineThickness} pointSize={style.pointSize}
            showGrid={style.showGrid} legend={style.legend}
          />
        );
      }
      case 'ehph':
        return (
          <EhPhDiagram
            samples={plottedSamples} colorBy={groupOf} width={diagramSize.width} height={diagramSize.height}
            title={style.title?.trim() || 'Merkel y Planer-Friedrich'}
            fontFamily={style.fontFamily} fontSize={style.fontSize}
            lineThickness={style.lineThickness} pointSize={style.pointSize}
            showGrid={style.showGrid} legend={style.legend}
          />
        );
      case 'clec':
        return (
          <ClConductivityDiagram
            samples={plottedSamples} colorBy={groupOf} width={diagramSize.width} height={diagramSize.height}
            title={style.title?.trim() || 'Cl vs Conductividad Eléctrica'}
            fontFamily={style.fontFamily} fontSize={style.fontSize}
            lineThickness={style.lineThickness} pointSize={style.pointSize}
            showGrid={style.showGrid} legend={style.legend}
          />
        );
      case 'ionratio':
        return (
          <IonRatioDiagram
            samples={plottedSamples} colorBy={groupOf} width={diagramSize.width} height={diagramSize.height}
            xField={ionRatioXField} yField={ionRatioYField} yScale={ionRatioYScale}
            title={style.title?.trim() || 'Relaciones iónicas'}
            fontFamily={style.fontFamily} fontSize={style.fontSize}
            lineThickness={style.lineThickness} pointSize={style.pointSize}
            showGrid={style.showGrid} legend={style.legend}
          />
        );
    }
  }

  async function getChartPNGBlob(diagramId: LocatableDiagramKey): Promise<Blob | null> {
    if (!chartLocations[diagramId].published) return null;
    const container = publishedRefs.current[diagramId];
    if (!container) return null;
    try {
      return await renderDiagramToPNGBlob(container);
    } catch (err) {
      console.warn(`getChartPNGBlob(${diagramId}): ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** PNG (Blob) de la tarjeta de Stiff de UNA muestra, tal como se ve ahora mismo — mismo criterio sin-caché que getChartPNGBlob. */
  async function getStiffCardPNGBlob(sampleId: string): Promise<Blob | null> {
    const container = stiffPublishRefs.current[sampleId];
    if (!container) return null;
    try {
      return await renderDiagramToPNGBlob(container);
    } catch (err) {
      console.warn(`getStiffCardPNGBlob(${sampleId}): ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * Batch de todos los gráficos publicables con "Publicar en GIS" activo
   * Y coordenadas numéricas válidas — lo que GIS pide en un solo viaje
   * (Etapa 4) en vez de consultar diagrama por diagrama. `east`/`north`
   * strings vacíos o no numéricos se tratan como "publicado pero sin
   * ubicación real todavía" — se omite en silencio, no es un error (mismo
   * criterio que excludedSampleIds/samples sin coordenadas en
   * hidrogeoIntegration.ts).
   *
   * Etapa 5: si `stiffPublished`, agrega UNA entrada por muestra con
   * coordenadas (`stiffPublishableSamples`) — `location: {kind:
   * 'geographic', ...}` en vez de 'projected' (ver PublishedChartLocation
   * en projectBridge.ts): GIS reproyecta, Hidrogeoquímica no.
   */
  async function getPublishedCharts(): Promise<PublishedChartData[]> {
    const results: PublishedChartData[] = [];
    for (const id of LOCATABLE_DIAGRAM_IDS) {
      const loc = chartLocations[id];
      if (!loc.published) continue;
      const east = parseFloat(loc.east);
      const north = parseFloat(loc.north);
      if (!Number.isFinite(east) || !Number.isFinite(north)) continue;
      const blob = await getChartPNGBlob(id);
      if (!blob) continue;
      const label = TABS.find(t => t.key === id)?.label ?? id;
      results.push({ diagramId: id, label, location: { kind: 'projected', east, north }, blob });
    }
    if (stiffPublished) {
      for (const sample of stiffPublishableSamples) {
        const blob = await getStiffCardPNGBlob(sample.id);
        if (!blob) continue;
        results.push({
          diagramId: `stiff-${sample.id}`,
          label: `Stiff — ${sample.name}`,
          location: { kind: 'geographic', lat: sample.coordinates!.lat, lon: sample.coordinates!.lon },
          blob,
        });
      }
    }
    return results;
  }

  useImperativeHandle(ref, () => ({ getProjectState, loadProjectState, getChartPNGBlob, getPublishedCharts }), [
    samples, excludedIds, classifyField, pozoFilter,
    stiffZoom, stiffZoomToolActive, diagramZoom, diagramZoomToolActive,
    piperStyle, stiffStyle, ionRatioXField, ionRatioYField, ionRatioYScale,
    schoellerMeqLMinInput, schoellerMeqLMaxInput, chartLocations,
    stiffPublished, plottedSamples,
  ]);

  const activeLabel = TABS.find(t => t.key === tab)?.label ?? '';
  const showEmpty = plottedSamples.length === 0;

  return (
    <div className="hgm-root">
      <style>{HUD_THEME_CSS}</style>
      <style>{HGM_CSS}</style>
      <style>{COLLAPSIBLE_SECTION_CSS}</style>

      <header className="hgm-header">
        <div>
          <div className="hgm-title">HIDROGEOQUÍMICA</div>
          <div className="hgm-sub">{plottedSamples.length} de {samples.length} muestras · {activeLabel}</div>
        </div>
        <div
          className={`hgm-badge${gisEpsgStatus === 'ok' ? ' hgm-badge-ok' : gisEpsgStatus === 'loading' ? '' : ' hgm-badge-warn'}`}
          data-testid="gis-epsg-indicator"
          title="Sistema de referencia del proyecto GIS — necesario para poder ubicar espacialmente los gráficos de este módulo. Se pide en vivo al iframe de GIS, no se persiste acá."
        >
          {gisEpsgStatus === 'loading' && 'Consultando GIS…'}
          {gisEpsgStatus === 'ok' && `Sistema de referencia: ${gisEpsg}`}
          {gisEpsgStatus === 'no-epsg' && 'Define primero el sistema de referencia en GIS'}
          {gisEpsgStatus === 'no-gis' && 'GIS no está abierto en esta sesión'}
          <button
            type="button"
            onClick={refreshGisEpsg}
            title="Volver a consultar el sistema de referencia de GIS"
            data-testid="refresh-gis-epsg-btn"
            style={{ marginLeft: 6, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit' }}
          >
            ↻
          </button>
        </div>
        <div className="hgm-badge">WQChartPy · v0.1</div>
      </header>

      <div className="hgm-body">
        {/* ── Nav vertical: origen de datos (QA/QC) + pestañas de diagramas ── */}
        <nav className="hgm-nav">
          {/* El módulo ya NO importa CSV/Excel directo: se alimenta EXCLUSIVAMENTE
              de la tabla "Datos hidrogeoquímicos" de QA/QC vía el puente
              (qaqcBridge.ts), mismo patrón que Análisis Estructural. */}
          <div style={{ padding: '8px 14px', fontSize: '.68rem', lineHeight: 1.5 }}>
            <div className="hgm-sub-label" style={{ marginTop: 0 }}>Datos (desde QA/QC)</div>
            {qaqcStatus.kind === 'loading' && <div style={{ color: 'var(--text-dim)' }}>Cargando…</div>}
            {qaqcStatus.kind === 'error' && (
              <div style={{ color: '#ff3355' }}>No se pudieron leer los datos de QA/QC: {qaqcStatus.message}</div>
            )}
            {qaqcStatus.kind === 'ok' && (
              qaqcStatus.count > 0
                ? <div style={{ color: 'var(--text-dim)' }}>{qaqcStatus.count} muestra{qaqcStatus.count === 1 ? '' : 's'}</div>
                : <div style={{ color: 'var(--text-dim)' }}>Sin datos. Carga una tabla "Datos hidrogeoquímicos" en QA/QC.</div>
            )}
          </div>
          <div className="hgm-nav-sep" />
          {TABS.map(t => (
            <button
              key={t.key}
              className={`hgm-nav-item${tab === t.key ? ' active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* ── Diagrama centrado, sobre hoja blanca ── */}
        <main className="hgm-view">
          {showEmpty && tab !== 'stiff' ? (
            <div ref={diagramContainerRef} className="hgm-paper">
              <EmptyStateMessage onClearFilters={clearFiltersAndExclusions} />
            </div>
          ) : (
            <div
              ref={diagramContainerRef}
              className={`hgm-paper${tab !== 'stiff' && diagramZoomToolActive ? ' zoom-tool-active' : ''}`}
              style={tab !== 'stiff' ? { zoom: diagramZoom } : undefined}
              onClick={tab !== 'stiff' ? onDiagramViewClick : undefined}
            >
              {tab === 'stiff' ? (
                showEmpty
                  ? <EmptyStateMessage onClearFilters={clearFiltersAndExclusions} />
                  : (
                    <StiffGrid
                      samples={plottedSamples} colorFor={colorFor} groupOf={groupOf} style={stiffStyle}
                      chartStyle={chartStyles.stiff} defaultTitle="Diagrama de Stiff"
                      zoom={stiffZoom} zoomToolActive={stiffZoomToolActive} onGridClick={onStiffGridClick}
                    />
                  )
              ) : renderDiagramElement(tab)}
            </div>
          )}
        </main>

        {/*
          ── Copias fuera de pantalla de los diagramas "Publicados en GIS" ──
          Ver JSDoc junto a `publishedRefs` más arriba: cada diagrama
          ubicable con chartLocations[id].published === true se monta acá,
          SIEMPRE, sin importar qué pestaña esté activa — es lo que le
          permite a getChartPNGBlob generar el PNG de cualquiera de los 5
          sin que el usuario tenga que cambiar de pestaña primero.
          left:-99999px (no display:none) para que el <svg> SÍ tenga
          tamaño real y se pueda rasterizar.
        */}
        {LOCATABLE_DIAGRAM_IDS.filter(id => chartLocations[id].published).map(id => (
          <div
            key={id}
            ref={el => { publishedRefs.current[id] = el; }}
            className="hgm-paper"
            style={{ position: 'fixed', top: 0, left: '-99999px' }}
            aria-hidden="true"
          >
            {renderDiagramElement(id)}
          </div>
        ))}

        {/*
          ── Copias fuera de pantalla de las tarjetas de Stiff "Publicadas
          en GIS" (Etapa 5) ── Mismo mecanismo que el bloque de arriba,
          pero UNA copia por MUESTRA (stiffPublishableSamples), no por
          diagrama — cada tarjeta usa el MISMO stiffScaleMax que la
          grilla visible (StiffGrid), así la escala nunca diverge entre
          lo que el usuario ve y lo que se publica en GIS.
        */}
        {stiffPublished && stiffPublishableSamples.map(s => (
          <div
            key={`stiff-publish-${s.id}`}
            ref={el => { stiffPublishRefs.current[s.id] = el; }}
            className="hgm-paper"
            style={{ position: 'fixed', top: 0, left: '-99999px' }}
            aria-hidden="true"
          >
            <StiffDiagram
              sample={s} width={220} height={170} scaleMax={stiffScaleMax} color={colorFor(s)}
              fontFamily={chartStyles.stiff.fontFamily} fontSize={chartStyles.stiff.fontSize}
              lineThickness={chartStyles.stiff.lineThickness} showGrid={chartStyles.stiff.showGrid}
              pointSize={chartStyles.stiff.pointSize}
            />
          </div>
        ))}

        {/* ── Panel de edición: filtros + color + QA/QC ── */}
        <aside className="hgm-panel">
          {/*
            ── Esenciales (Etapa 2-4 de divulgación progresiva, ya
            aplicada a las 6 pestañas) — sin acordeón, siempre visibles: la
            herramienta de zoom (interacción con el lienzo, no un ajuste),
            IonRatioAxisPanel SOLO en Relaciones Iónicas (define qué se
            grafica en X/Y — sin elegir los ejes el diagrama no muestra
            nada útil, mismo criterio ya usado para no esconderlo detrás de
            ningún acordeón aunque a primera vista parezca "configuración"),
            y Exportar (acción de fin de flujo). El origen de datos (estado de
            QA/QC) vive en el nav izquierdo, no acá.
          */}
          {tab !== 'stiff' && (
            <ViewZoomPanel
              zoom={diagramZoom}
              zoomToolActive={diagramZoomToolActive}
              onToggleZoomTool={toggleDiagramZoomTool}
              onResetZoom={resetDiagramZoom}
            />
          )}
          {tab === 'stiff' && (
            <StiffZoomPanel
              zoom={stiffZoom}
              zoomToolActive={stiffZoomToolActive}
              onToggleZoomTool={toggleStiffZoomTool}
              onResetZoom={resetStiffZoom}
            />
          )}
          {tab === 'ionratio' && (
            <IonRatioAxisPanel
              xField={ionRatioXField}
              yField={ionRatioYField}
              yScale={ionRatioYScale}
              onXFieldChange={setIonRatioXField}
              onYFieldChange={setIonRatioYField}
              onYScaleChange={setIonRatioYScale}
            />
          )}
          <Section title="Exportar">
            <ExportButton targetRef={diagramContainerRef} filename={tab} />
          </Section>

          {/* ── Avanzado: colapsado por defecto, id compartido entre las 6 pestañas (misma preferencia de UI sin importar qué diagrama esté activo) ── */}
          <CollapsibleSection id="hgm.filtroClasificacion" title="Filtro y clasificación" defaultOpen={false}>
            <FilterPanel
              allPozos={allPozos}
              pozoFilter={pozoFilter}
              onTogglePozo={togglePozo}
            />
            <ClassificationSelector fields={classifiableFields} field={classifyField} onChange={setClassifyField} />
          </CollapsibleSection>

          <CollapsibleSection id="hgm.estilo" title="Estilo" defaultOpen={false}>
            <Section title="Apariencia del gráfico">
              <ChartStyleEditor
                style={chartStyles[tab]}
                defaultTitle={TABS.find(t => t.key === tab)!.label}
                onChange={patch => updateChartStyle(tab, patch)}
                pointSizeMayBeOverridden={tab === 'piper' && Object.keys(piperStyle.points).length > 0}
              />
            </Section>
            {tab === 'piper' && (
              <PiperStylePanel
                style={piperStyle}
                autoColors={colorMap}
                onOutlineChange={updateOutline}
                onDashedChange={updateDashed}
                onPointStyleChange={updatePointStyle}
              />
            )}
            {tab === 'stiff' && (
              <StiffStylePanel
                style={stiffStyle}
                autoColors={colorMap}
                onPolygonColorChange={updateStiffPolygonColor}
                onScaleManualChange={updateStiffScaleManual}
              />
            )}
            {tab === 'schoellerBerkaloff' && (
              <SchoellerBerkaloffAxisPanel
                meqLMinInput={schoellerMeqLMinInput}
                meqLMaxInput={schoellerMeqLMaxInput}
                onMeqLMinChange={setSchoellerMeqLMinInput}
                onMeqLMaxChange={setSchoellerMeqLMaxInput}
              />
            )}
          </CollapsibleSection>

          <CollapsibleSection id="hgm.integracionGis" title="Integración con GIS" defaultOpen={false}>
            {tab !== 'stiff' && (
              <ChartLocationPanel
                location={chartLocations[tab]}
                disabled={gisEpsgStatus !== 'ok'}
                disabledReason={gisEpsgMessage}
                onChange={patch => updateChartLocation(tab, patch)}
              />
            )}
            {tab === 'stiff' && (
              <StiffPublishPanel published={stiffPublished} onChange={setStiffPublished} />
            )}
          </CollapsibleSection>

          <CollapsibleSection id="hgm.qaqc" title="QA/QC — balance iónico" defaultOpen={false}>
            <QAQCPanel
              filteredSamples={filteredSamples}
              balances={balances}
              excludedIds={excludedIds}
              onToggleExcluded={toggleExcluded}
            />
          </CollapsibleSection>
        </aside>
      </div>
    </div>
  );
  },
);
