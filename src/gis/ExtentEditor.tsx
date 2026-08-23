/**
 * src/gis/ExtentEditor.tsx
 * Formulario para definir el ProjectExtent (gisTypes.ts): los 7 campos de
 * Vector3DBox, los 2 de CameraBounds, y la proyección del proyecto.
 *
 * Proyección (Etapa 15): dejó de ser un input de texto libre — ahora es un
 * desplegable obligatorio con las 4 opciones recomendadas para Chile más
 * "Otro" (que conserva el input de texto libre de antes, para cualquier
 * EPSG no listado — sigue funcionando con registerProjection(), Etapa 5).
 * GisViewport.tsx es quien decide CUÁNDO mostrar este formulario como
 * "puerta" bloqueante (proyección aún sin confirmar) y cuándo pasar
 * `projectionLocked` (ya hay datos cargados) — este componente solo sabe
 * dibujar el desplegable/input y deshabilitarlos si se lo piden.
 *
 * Componente controlado: no guarda su propio estado de NEGOCIO — value/
 * onChange siguen siendo la única fuente de verdad de projectionEPSG. El
 * único estado local (`manualEntry`) es puramente de PRESENTACIÓN: distingue
 * "el usuario acaba de elegir Otro pero todavía no escribió nada" (texto
 * vacío) de "todavía no eligió nada" (placeholder) — ambos casos comparten
 * value.projectionEPSG === '', así que no hay forma de derivarlos solo de
 * `value`. En cuanto el usuario escribe un EPSG no listado, el modo "Otro"
 * ya se puede derivar de sobra del propio valor (no vacío y no está en
 * PROJECTION_PRESETS) y este estado deja de ser necesario para ese caso.
 */
import React from 'react';
import type { ProjectExtent, Vector3DBox, CameraBounds, GisLayer } from './gisTypes';
import { computeLayersCentroid } from './gisLayerRender';
import { CollapsibleSection, COLLAPSIBLE_SECTION_CSS } from '../shared/CollapsibleSection';

const EXTENT_EDITOR_CSS = `
  .gis-extent-editor {
    font-family: 'Courier New', Courier, monospace; color: var(--hud-text);
    background: rgba(1,15,32,.92); border: 1px solid var(--hud-border);
    padding: 14px; width: 260px; overflow-y: auto;
  }
  .gis-ee-title {
    font-size: .68rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
    color: var(--hud-cyan); margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid rgba(0,244,255,.15);
  }
  .gis-ee-section-lbl {
    font-size: .58rem; letter-spacing: .1em; text-transform: uppercase;
    color: rgba(0,244,255,.4); margin: 12px 0 6px;
  }
  .gis-ee-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
  .gis-ee-label { font-size: .64rem; color: var(--hud-text-dim); flex: 1; }
  .gis-ee-input {
    width: 110px; background: rgba(0,15,40,.9); border: 1px solid var(--hud-border);
    color: var(--hud-text); font-family: inherit; font-size: .68rem; padding: 3px 6px; outline: none;
  }
  .gis-ee-input:focus { border-color: var(--hud-cyan); }
  .gis-ee-autocenter-btn {
    width: 100%; margin-bottom: 8px; padding: 5px 8px;
    font-family: 'Courier New', Courier, monospace; font-size: .62rem; font-weight: 700;
    letter-spacing: .06em; text-transform: uppercase; color: var(--hud-cyan);
    background: rgba(0,244,255,.08); border: 1px solid rgba(0,244,255,.35); cursor: pointer;
    transition: background .15s;
  }
  .gis-ee-autocenter-btn:hover:not(:disabled) { background: rgba(0,244,255,.18); }
  .gis-ee-autocenter-btn:disabled {
    opacity: .4; cursor: not-allowed; color: var(--hud-text-dim); border-color: rgba(203,213,225,.35);
  }
  .gis-ee-checkrow { display: flex; align-items: center; gap: 6px; font-size: .64rem; color: var(--hud-text); cursor: pointer; user-select: none; margin-bottom: 6px; }
  .gis-ee-checkrow input { accent-color: var(--hud-cyan); }
`;

interface FieldConfig<T> {
  key: keyof T;
  label: string;
  step?: number;
}

const BOX_FIELDS: FieldConfig<Vector3DBox>[] = [
  { key: 'centerEast', label: 'Centro Este' },
  { key: 'centerNorth', label: 'Centro Norte' },
  { key: 'width', label: 'Ancho' },
  { key: 'height', label: 'Alto' },
  { key: 'rotationDeg', label: 'Rotación (°)', step: 1 },
  { key: 'topElevation', label: 'Cota superior' },
  { key: 'bottomElevation', label: 'Cota inferior' },
];

const CAMERA_BOUNDS_FIELDS: FieldConfig<CameraBounds>[] = [
  { key: 'horizontalMargin', label: 'Margen horizontal' },
  { key: 'verticalMargin', label: 'Margen vertical' },
];

export interface ExtentEditorProps {
  value: ProjectExtent;
  onChange: (next: ProjectExtent) => void;
  /**
   * Todas las capas del proyecto (integradas + importadas) — usadas SOLO
   * para el botón "Centrar automáticamente" (computeLayersCentroid(),
   * gisLayerRender.ts). Sin relación con projectionLocked: acá se usan
   * TODAS las capas sin importar si tienen datos, la función misma filtra
   * qué cuenta. Por defecto [] (no rompe si no se pasa, ej. en el panel-
   * puerta de GisViewport.tsx donde tampoco hay capas todavía).
   */
  layers?: GisLayer[];
  /**
   * Franjas del armazón de referencia 3D ("fish tank", Etapa 2) —
   * NÚMERO de anillos horizontales = depthBands + 1 (incluye tope y
   * fondo). Deliberadamente FUERA de `value`/`onChange` (ProjectExtent):
   * es estado de SESIÓN de GisViewport.tsx, no persistido todavía
   * (confirmado con el usuario — evaluar migración de esquema en una
   * etapa aparte si hace falta persistirlo más adelante).
   */
  depthBands: number;
  onDepthBandsChange: (next: number) => void;
  /**
   * Tamaño de celda REAL (en metros) de la grilla del techo/piso — celdas
   * siempre cuadradas, con los bordes cortados si `width`/`height` no son
   * múltiplos exactos (Etapa 1 del sistema de grilla por tamaño de
   * celda). Mismo criterio que `depthBands`: estado de SESIÓN de
   * GisViewport.tsx, deliberadamente FUERA de `value`/`onChange`
   * (ProjectExtent) — no persistido, y NO se recalcula solo si el
   * usuario cambia ancho/alto después (el valor por defecto es contextual
   * — ver `calculateDefaultCellSize` en gisGrid.ts — pero una vez
   * inicializado se comporta igual que cualquier otro estado de sesión).
   */
  cellSize: number;
  onCellSizeChange: (next: number) => void;
  /**
   * Factor de reducción de las grillas internas de profundidad (Etapa 4)
   * — desactivado por defecto (grilla interna completa). Mismo criterio
   * que `depthBands`/`cellSize`: estado de SESIÓN de GisViewport.tsx, no
   * persistido. Cuando está activo, cada nivel interno del armazón
   * muestra solo 1 de cada `gridReductionFactor` líneas de la MISMA
   * grilla ya calculada (nunca una grilla independiente) — no afecta el
   * contorno de 4 esquinas, las verticales, ni las etiquetas de cota.
   */
  reduceInternalGrid: boolean;
  onReduceInternalGridChange: (next: boolean) => void;
  gridReductionFactor: number;
  onGridReductionFactorChange: (next: number) => void;
  /**
   * Tamaño de fuente de las etiquetas de coordenadas (Este/Norte de la
   * grilla) — mismo criterio que `cellSize`/`depthBands`: estado de
   * SESIÓN de GisViewport.tsx, no persistido. Independiente del tamaño
   * de las etiquetas de cota del armazón (esas no tienen control acá,
   * mantienen su tamaño fijo).
   */
  coordinateLabelFontSize: number;
  onCoordinateLabelFontSizeChange: (next: number) => void;
}

export function ExtentEditor({
  value, onChange, layers = [],
  depthBands, onDepthBandsChange, cellSize, onCellSizeChange,
  reduceInternalGrid, onReduceInternalGridChange, gridReductionFactor, onGridReductionFactorChange,
  coordinateLabelFontSize, onCoordinateLabelFontSizeChange,
}: ExtentEditorProps) {
  function updateBox(key: keyof Vector3DBox, raw: string) {
    const num = parseFloat(raw);
    if (Number.isNaN(num)) return;
    onChange({ ...value, box: { ...value.box, [key]: num } });
  }

  function updateCameraBounds(key: keyof CameraBounds, raw: string) {
    const num = parseFloat(raw);
    if (Number.isNaN(num)) return;
    onChange({ ...value, cameraBounds: { ...value.cameraBounds, [key]: num } });
  }

  const autoCenter = computeLayersCentroid(layers);

  function applyAutoCenter() {
    if (!autoCenter) return;
    onChange({
      ...value,
      // Solo el centro — ancho/alto/rotación/cotas quedan intactos, para
      // que el usuario los siga ajustando manualmente (requisito explícito).
      box: { ...value.box, centerEast: autoCenter.centerEast, centerNorth: autoCenter.centerNorth },
    });
  }

  return (
    <div className="gis-extent-editor">
      <style>{EXTENT_EDITOR_CSS}</style>
      <style>{COLLAPSIBLE_SECTION_CSS}</style>
      <div className="gis-ee-title">Extensión del proyecto</div>

      <div className="gis-ee-section-lbl">Caja interior</div>
      <button
        type="button"
        className="gis-ee-autocenter-btn"
        disabled={!autoCenter}
        onClick={applyAutoCenter}
        title={
          autoCenter
            ? 'Calcula el promedio de las coordenadas de todos los datos del proyecto y lo usa como Centro Este/Norte — no toca ancho, alto, rotación ni cotas.'
            : 'No hay ningún dato real en el proyecto todavía (ni integraciones con puntos, ni capas importadas) — no hay coordenadas de las que calcular un centro.'
        }
      >
        Centrar automáticamente
      </button>
      {BOX_FIELDS.map((f) => (
        <div className="gis-ee-row" key={String(f.key)}>
          <span className="gis-ee-label">{f.label}</span>
          <input
            className="gis-ee-input"
            type="number"
            step={f.step ?? 'any'}
            value={value.box[f.key]}
            onChange={(e) => updateBox(f.key, e.target.value)}
          />
        </div>
      ))}

      <CollapsibleSection id="gis.grilla" title="Grilla" defaultOpen={false}>
        <div className="gis-ee-row">
          <span className="gis-ee-label" title="Tamaño real de celda (metros) — celdas siempre cuadradas; los bordes quedan cortados si el ancho/alto no son múltiplos exactos.">Tamaño de celda</span>
          <input
            className="gis-ee-input"
            type="number"
            min={0.01}
            step="any"
            value={cellSize}
            onChange={(e) => {
              const num = parseFloat(e.target.value);
              if (Number.isFinite(num) && num > 0) onCellSizeChange(num);
            }}
          />
        </div>
        <div className="gis-ee-row">
          <span className="gis-ee-label" title="Tamaño de fuente de las etiquetas Este/Norte de la grilla, en unidades de mundo — no afecta las etiquetas de cota del armazón.">Tamaño de etiquetas</span>
          <input
            className="gis-ee-input"
            type="number"
            min={0.1}
            step="any"
            value={coordinateLabelFontSize}
            onChange={(e) => {
              const num = parseFloat(e.target.value);
              if (Number.isFinite(num) && num > 0) onCoordinateLabelFontSizeChange(num);
            }}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection id="gis.armazonProfundidad" title="Armazón de referencia (3D)" defaultOpen={false}>
        <div className="gis-ee-row">
          <span className="gis-ee-label" title="Anillos horizontales = franjas + 1 (incluye tope y fondo). Solo visible en modo 3D.">Franjas de profundidad</span>
          <input
            className="gis-ee-input"
            type="number"
            min={1}
            step={1}
            value={depthBands}
            onChange={(e) => {
              const num = Math.round(parseFloat(e.target.value));
              if (Number.isFinite(num) && num >= 1) onDepthBandsChange(num);
            }}
          />
        </div>
        <label className="gis-ee-checkrow" title="Muestra solo 1 de cada N líneas de la grilla base en los niveles internos del armazón — siempre un subconjunto exacto de esa misma grilla, nunca una grilla independiente.">
          <input
            type="checkbox"
            checked={reduceInternalGrid}
            onChange={(e) => onReduceInternalGridChange(e.target.checked)}
          />
          Reducir densidad de grilla interna
        </label>
        {reduceInternalGrid && (
          <div className="gis-ee-row">
            <span className="gis-ee-label">Factor (1 de cada N)</span>
            <input
              className="gis-ee-input"
              type="number"
              min={2}
              step={1}
              value={gridReductionFactor}
              onChange={(e) => {
                const num = Math.round(parseFloat(e.target.value));
                if (Number.isFinite(num) && num >= 2) onGridReductionFactorChange(num);
              }}
            />
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection id="gis.limiteCamara" title="Límite de cámara (márgenes)" defaultOpen={false}>
        {CAMERA_BOUNDS_FIELDS.map((f) => (
          <div className="gis-ee-row" key={String(f.key)}>
            <span className="gis-ee-label">{f.label}</span>
            <input
              className="gis-ee-input"
              type="number"
              value={value.cameraBounds[f.key]}
              onChange={(e) => updateCameraBounds(f.key, e.target.value)}
            />
          </div>
        ))}
      </CollapsibleSection>

    </div>
  );
}
