/**
 * src/gis/ProjectionSelector.tsx
 * Selector de proyección (EPSG) del proyecto GIS — EXTRAÍDO de ExtentEditor.tsx
 * (etapa de rediseño del panel lateral): la proyección pasa a ser la PRIMERA
 * sección del panel, siempre visible (sin ella el módulo no funciona), en vez
 * de vivir al fondo del editor de extensión. ExtentEditor ya no la conoce.
 *
 * Desplegable con presets recomendados para Chile (Etapa 15) + opción "Otro"
 * para un EPSG/proj4 no listado (sigue funcionando con registerProjection()).
 * `manualEntry` solo distingue "Otro recién elegido, aún sin escribir" del
 * placeholder sin elegir — `projectionEPSG`/`onChange` siguen siendo la única
 * fuente de verdad. `locked` deshabilita la edición (el proyecto ya tiene capas
 * con datos: cambiar la proyección reinterpretaría coordenadas ya cargadas).
 */
import React, { useState } from 'react';

const PROJECTION_SELECTOR_CSS = `
  .gis-proj {
    font-family: 'Courier New', Courier, monospace; color: var(--hud-text);
    background: rgba(1,15,32,.92); border: 1px solid var(--hud-border);
    padding: 14px; width: 260px;
  }
  .gis-proj-title {
    font-size: .68rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
    color: var(--hud-cyan); margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid rgba(0,244,255,.15);
  }
  .gis-proj-select {
    width: 100%; background: rgba(0,15,40,.9); border: 1px solid var(--hud-border);
    color: var(--hud-text); font-family: inherit; font-size: .64rem; padding: 4px 6px; outline: none;
  }
  .gis-proj-select:focus { border-color: var(--hud-cyan); }
  .gis-proj-select:disabled, .gis-proj-input:disabled { opacity: .55; cursor: not-allowed; }
  .gis-proj-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; }
  .gis-proj-label { font-size: .64rem; color: var(--hud-text-dim); flex: 1; }
  .gis-proj-input {
    width: 130px; background: rgba(0,15,40,.9); border: 1px solid var(--hud-border);
    color: var(--hud-text); font-family: inherit; font-size: .68rem; padding: 3px 6px; outline: none;
  }
  .gis-proj-input:focus { border-color: var(--hud-cyan); }
  .gis-proj-desc { font-size: .6rem; color: var(--hud-text-dim); line-height: 1.45; margin-top: 8px; }
  .gis-proj-lock-msg { font-size: .6rem; color: var(--hud-text-dim); line-height: 1.4; margin-top: 6px; }
`;

/** Opciones recomendadas para Chile — ver requisito de la Etapa 15. */
const PROJECTION_PRESETS: { epsg: string; label: string }[] = [
  { epsg: 'EPSG:32718', label: 'EPSG:32718 — UTM WGS84 zona 18S' },
  { epsg: 'EPSG:32719', label: 'EPSG:32719 — UTM WGS84 zona 19S (la más común en Chile continental)' },
  { epsg: 'EPSG:5361', label: 'EPSG:5361 — SIRGAS-Chile 2002 / UTM zona 18S (datum oficial chileno)' },
  { epsg: 'EPSG:5362', label: 'EPSG:5362 — SIRGAS-Chile 2002 / UTM zona 19S (datum oficial chileno)' },
];

const OTHER_OPTION_VALUE = '__other__';

function isPresetEPSG(epsg: string): boolean {
  return PROJECTION_PRESETS.some((p) => p.epsg === epsg);
}

export interface ProjectionSelectorProps {
  projectionEPSG: string;
  onChange: (epsg: string) => void;
  /** true cuando el proyecto ya tiene capas con datos reales — deshabilita la edición (ver JSDoc de archivo). */
  locked?: boolean;
}

export function ProjectionSelector({ projectionEPSG, onChange, locked = false }: ProjectionSelectorProps) {
  const [manualEntry, setManualEntry] = useState(false);

  const isOtherMode = manualEntry || (projectionEPSG !== '' && !isPresetEPSG(projectionEPSG));
  const selectValue = isOtherMode ? OTHER_OPTION_VALUE : projectionEPSG;

  function handleSelectChange(raw: string) {
    if (raw === OTHER_OPTION_VALUE) {
      setManualEntry(true);
      return;
    }
    setManualEntry(false);
    onChange(raw);
  }

  const hasProjection = !!projectionEPSG;

  return (
    <div className="gis-proj">
      <style>{PROJECTION_SELECTOR_CSS}</style>
      <div className="gis-proj-title">Proyección del proyecto</div>
      <select
        className="gis-proj-select"
        value={selectValue}
        disabled={locked}
        onChange={(e) => handleSelectChange(e.target.value)}
      >
        <option value="" disabled>Selecciona una proyección…</option>
        {PROJECTION_PRESETS.map((p) => (
          <option key={p.epsg} value={p.epsg}>{p.label}</option>
        ))}
        <option value={OTHER_OPTION_VALUE}>Otro (EPSG/proj4 manual)</option>
      </select>
      {isOtherMode && (
        <div className="gis-proj-row">
          <span className="gis-proj-label">Código EPSG</span>
          <input
            className="gis-proj-input"
            type="text"
            value={projectionEPSG}
            disabled={locked}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )}
      {!hasProjection && (
        <div className="gis-proj-desc">
          Elige la proyección antes de importar capas, ver los módulos o ajustar
          la extensión. Todas las coordenadas del proyecto se interpretan con
          este EPSG.
        </div>
      )}
      {locked && (
        <div className="gis-proj-lock-msg">
          El proyecto ya tiene capas con datos cargados — la proyección queda
          bloqueada porque cambiarla reinterpretaría todas las coordenadas ya
          cargadas. Para usar otra proyección, empieza un proyecto nuevo.
        </div>
      )}
    </div>
  );
}
