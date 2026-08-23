/**
 * src/shared/ChartStyleEditor.tsx
 * Panel de edición COMPARTIDO para ChartStyleSettings (chartStyle.ts): un
 * control por campo, reutilizable por cualquier diagrama SVG de cualquier
 * módulo. Originalmente src/hidrogeo/ChartStyleEditor.tsx (Etapa 4.5b de
 * Hidrogeoquímica) — movido acá en la Etapa 10 de Análisis Estructural.
 *
 * Completamente controlado (sin estado propio): recibe `style` y notifica
 * cambios vía `onChange(patch)`, nunca muta nada por su cuenta.
 *
 * Reusa las clases CSS `.hgm-*` (nombre heredado de Hidrogeoquímica, no se
 * renombran acá para no romper el CSS ya definido en
 * HydrogeochemistryModule.tsx, que sigue siendo un consumidor real de este
 * componente) — cualquier módulo que lo use debe proveer esas mismas
 * clases (o equivalentes) en su propio CSS; ver ejemplo mínimo en
 * StereonetPlanes.tsx/RoseDiagram.tsx.
 *
 * `pointSizeMayBeOverridden`: algunos diagramas tienen su PROPIO override
 * de tamaño de punto POR GRUPO (p.ej. PiperStyleSettings.points[grupo].
 * size en hidrogeo) que le gana a `pointSize` genérico cuando existe.
 * Cuando el llamador pasa `true` acá, se muestra una nota junto al input
 * de tamaño de marcador para que quede claro que el valor puede no
 * reflejarse en un grupo con override propio.
 */

import React from 'react';
import { ChartStyleSettings, DEFAULT_CHART_OPACITY, FONT_OPTIONS, LegendPosition } from './chartStyle';

// ─────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────

export interface ChartStyleEditorProps {
  style: ChartStyleSettings;
  /** Nombre por defecto del diagrama — se muestra como placeholder del input de título cuando `style.title` está vacío. */
  defaultTitle: string;
  onChange: (patch: Partial<ChartStyleSettings>) => void;
  pointSizeMayBeOverridden?: boolean;
  /**
   * Muestra el selector de POSICIÓN de la leyenda (4 esquinas). Default true
   * (Hidrogeoquímica, que posiciona su leyenda por esquina). Análisis
   * Estructural lo pasa `false`: ahí la leyenda vive en una banda fija debajo
   * del gráfico (ver SvgLegend.tsx), así que elegir esquina no aplica — solo
   * queda el toggle mostrar/ocultar.
   */
  showLegendPosition?: boolean;
}

const LEGEND_POSITIONS: { value: LegendPosition; label: string }[] = [
  { value: 'top-right',    label: 'Sup. derecha' },
  { value: 'top-left',     label: 'Sup. izquierda' },
  { value: 'bottom-right', label: 'Inf. derecha' },
  { value: 'bottom-left',  label: 'Inf. izquierda' },
];

// ─────────────────────────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────────────────────────

export function ChartStyleEditor({ style, defaultTitle, onChange, pointSizeMayBeOverridden, showLegendPosition = true }: ChartStyleEditorProps) {
  return (
    <>
      <div className="hgm-sub-label">Título</div>
      <div className="hgm-style-row">
        <input
          type="text"
          className="hgm-select"
          placeholder={defaultTitle}
          value={style.title ?? ''}
          onChange={e => onChange({ title: e.target.value })}
        />
      </div>

      <div className="hgm-sub-label">Fuente</div>
      <div className="hgm-style-row">
        <select className="hgm-select" value={style.fontFamily} onChange={e => onChange({ fontFamily: e.target.value })}>
          {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>
      <div className="hgm-style-row">
        <span className="hgm-style-lbl">Tamaño</span>
        <input
          type="number" className="hgm-num-input" min={6} max={24} step={0.5}
          value={style.fontSize}
          onChange={e => onChange({ fontSize: Math.max(6, Math.min(24, parseFloat(e.target.value) || style.fontSize)) })}
        />
      </div>

      <div className="hgm-sub-label">Ejes / líneas de referencia</div>
      <div className="hgm-style-row">
        <span className="hgm-style-lbl">Grosor</span>
        <input
          type="number" className="hgm-num-input" min={0.3} max={5} step={0.1}
          value={style.lineThickness}
          onChange={e => onChange({ lineThickness: Math.max(0.3, Math.min(5, parseFloat(e.target.value) || style.lineThickness)) })}
        />
      </div>

      <div className="hgm-sub-label">Marcadores</div>
      <div className="hgm-style-row">
        <span className="hgm-style-lbl">Tamaño</span>
        <input
          type="number" className="hgm-num-input" min={1} max={10} step={0.5}
          value={style.pointSize}
          onChange={e => onChange({ pointSize: Math.max(1, Math.min(10, parseFloat(e.target.value) || style.pointSize)) })}
        />
      </div>
      {pointSizeMayBeOverridden && (
        <div className="hgm-empty-note" style={{ marginTop: -2, marginBottom: 6 }}>
          Un grupo con tamaño propio (panel de estilo específico) le gana a este valor.
        </div>
      )}
      <div className="hgm-style-row">
        <span className="hgm-style-lbl">Opacidad</span>
        <input
          type="range" min={0.05} max={1} step={0.05}
          value={style.opacity ?? DEFAULT_CHART_OPACITY}
          onChange={e => onChange({ opacity: parseFloat(e.target.value) })}
          style={{ flex: 1, accentColor: 'var(--hud-cyan, #00F4FF)' }}
        />
        <span className="hgm-style-lbl" style={{ width: 34, textAlign: 'right', flexShrink: 0 }}>
          {Math.round((style.opacity ?? DEFAULT_CHART_OPACITY) * 100)}%
        </span>
      </div>

      <div className="hgm-style-row">
        <label className="hgm-checkrow">
          <input type="checkbox" checked={style.showGrid} onChange={e => onChange({ showGrid: e.target.checked })} />
          Mostrar grilla
        </label>
      </div>

      <div className="hgm-sub-label">Leyenda</div>
      <div className="hgm-style-row">
        <label className="hgm-checkrow">
          <input type="checkbox" checked={style.legend.visible} onChange={e => onChange({ legend: { ...style.legend, visible: e.target.checked } })} />
          Mostrar leyenda
        </label>
      </div>
      {/* Posición por esquinas — solo cuando la leyenda se superpone sobre el
          gráfico (Hidrogeoquímica). En Análisis Estructural vive en una banda
          fija debajo del gráfico (SvgLegend.tsx), así que se oculta este control. */}
      {showLegendPosition && (
        <div className="hgm-style-row">
          <select
            className="hgm-select"
            value={style.legend.position}
            disabled={!style.legend.visible}
            onChange={e => onChange({ legend: { ...style.legend, position: e.target.value as LegendPosition } })}
          >
            {LEGEND_POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      )}
    </>
  );
}
