/**
 * src/gis/LayerTableOfContents.tsx
 * Tabla de contenidos de capas (GisLayer[], gisTypes.ts Etapa 1):
 * visibilidad, reordenar arriba/abajo, nombre, color plano o categorizado.
 *
 * Las capas type:'raster' (Etapa 7) NO muestran selector de color — son
 * de solo visualización, sin simbología editable más allá de
 * mostrar/ocultar (ver rasterImport.ts). Se deja un espaciador del mismo
 * tamaño para que el nombre y los botones de reordenar sigan alineados
 * con las filas de capas vectoriales.
 *
 * Componente controlado — sin estado propio, igual que ExtentEditor.tsx.
 *
 * Simbología categorizada (Etapa 12): el control de modo (plano/
 * categorizar) + selector de campo + leyenda solo aparece para capas con
 * al menos un campo categorizable (`getCategorizableFields()`,
 * gisLayerRender.ts — la MISMA fuente de verdad que usa el renderizado
 * real, para que la lista de campos acá nunca se desincronice de lo que
 * gisLayerRender.ts efectivamente sabe leer). Capas sin atributos (los
 * puntos de prueba sintéticos de la Etapa 4) o ráster nunca muestran este
 * control.
 *
 * Convención de orden: `order` ascendente = más arriba en la lista. Arriba
 * de la lista = se dibuja AL FINAL (encima), como en QGIS/ArcGIS — ver
 * GisViewport.tsx para el lado del renderizado que usa esta misma
 * convención en sentido inverso (dibuja de abajo hacia arriba).
 *
 * Eliminar capa (Etapa 9): las 4 variantes `type` que empiezan con
 * `'integrated-'` (gisTypes.ts) NO muestran el botón — no son un archivo
 * importado por el usuario, se regeneran solas al montar GIS (ver
 * collarsIntegration.ts para 'integrated-collars'), así que borrarlas a
 * mano no tendría ningún efecto persistente y solo confundiría. Para esas
 * capas, ocultar (el checkbox de visibilidad) ya cubre el caso de uso.
 */
import React from 'react';
import type { GisLayer, GisLayerSymbology } from './gisTypes';
import { getCategorizableFields, getCategoryValues } from './gisLayerRender';
import { pickDefaultLayerColor } from './shapefileImport';

const TOC_CSS = `
  .gis-toc {
    font-family: 'Courier New', Courier, monospace; color: var(--hud-text);
    background: rgba(1,15,32,.92); border: 1px solid var(--hud-border);
    padding: 14px; width: 260px; overflow-y: auto;
  }
  .gis-toc-title {
    font-size: .68rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
    color: var(--hud-cyan); margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid rgba(0,244,255,.15);
  }
  .gis-toc-row {
    display: flex; align-items: center; gap: 8px; padding: 5px 0;
    border-bottom: 1px solid var(--hud-border-dim);
  }
  .gis-toc-row:last-child { border-bottom: none; }
  .gis-toc-visible { accent-color: var(--hud-cyan); cursor: pointer; flex-shrink: 0; }
  .gis-toc-color { width: 22px; height: 22px; padding: 0; border: 1px solid rgba(0,244,255,.3); background: none; cursor: pointer; flex-shrink: 0; }
  .gis-toc-color-spacer { width: 22px; height: 22px; flex-shrink: 0; }
  .gis-toc-name { flex: 1; min-width: 0; font-size: .66rem; color: var(--hud-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gis-toc-reorder { display: flex; flex-direction: column; flex-shrink: 0; }
  .gis-toc-reorder-btn {
    background: none; border: none; color: var(--hud-text-dim); cursor: pointer; font-size: .55rem;
    line-height: 1; padding: 1px 4px;
  }
  .gis-toc-reorder-btn:hover:not(:disabled) { color: var(--hud-cyan); }
  .gis-toc-reorder-btn:disabled { color: rgba(203,213,225,.25); cursor: default; }
  .gis-toc-delete-btn {
    background: none; border: none; color: var(--hud-text-dim); cursor: pointer; font-size: .68rem;
    flex-shrink: 0; padding: 1px 4px; transition: color .15s;
  }
  .gis-toc-delete-btn:hover { color: #ff3355; }
  .gis-toc-delete-spacer { width: 15px; flex-shrink: 0; }
  .gis-toc-empty { font-size: .64rem; color: var(--hud-text-dim); padding: 8px 0; }
  .gis-toc-symbology {
    padding: 0 0 8px 30px; display: flex; flex-direction: column; gap: 6px;
    border-bottom: 1px solid var(--hud-border-dim);
  }
  .gis-toc-mode-toggle { display: flex; border: 1px solid rgba(0,244,255,.25); width: fit-content; }
  .gis-toc-mode-btn {
    padding: 3px 8px; font-family: inherit; font-size: .58rem; font-weight: 700;
    letter-spacing: .05em; text-transform: uppercase; color: var(--hud-text-dim);
    background: transparent; border: none; cursor: pointer; transition: background .15s, color .15s;
  }
  .gis-toc-mode-btn.active { background: var(--hud-cyan); color: var(--hud-bg); }
  .gis-toc-mode-btn:not(.active):hover { background: var(--hud-cyan-dim); color: var(--hud-text); }
  .gis-toc-field-select {
    font-family: inherit; font-size: .62rem; color: var(--hud-text);
    background: rgba(1,15,32,.85); border: 1px solid rgba(0,244,255,.25); padding: 2px 4px;
  }
  .gis-toc-legend { display: flex; flex-direction: column; gap: 3px; max-height: 130px; overflow-y: auto; }
  .gis-toc-legend-item { display: flex; align-items: center; gap: 6px; }
  .gis-toc-legend-swatch { width: 10px; height: 10px; flex-shrink: 0; border: 1px solid rgba(255,255,255,.35); }
  .gis-toc-legend-label { font-size: .6rem; color: var(--hud-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

export interface LayerTableOfContentsProps {
  layers: GisLayer[];
  onChange: (next: GisLayer[]) => void;
}

export function LayerTableOfContents({ layers, onChange }: LayerTableOfContentsProps) {
  const sorted = [...layers].sort((a, b) => a.order - b.order);

  function toggleVisible(id: string) {
    onChange(layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
  }

  function setColor(id: string, flatColor: string) {
    onChange(layers.map((l) => (l.id === id ? { ...l, symbology: { ...l.symbology, flatColor } } : l)));
  }

  /** Valores únicos de `field` en `layer`, con un color de la paleta rotada asignado a cada uno (mismo orden en que aparecen, no alfabético). */
  function buildCategorizedSymbology(layer: GisLayer, field: string): GisLayerSymbology {
    const unique = [...new Set(getCategoryValues(layer, field))];
    const categoryColors: Record<string, string> = {};
    unique.forEach((value, i) => {
      categoryColors[value] = pickDefaultLayerColor(i);
    });
    return { mode: 'categorized', flatColor: layer.symbology.flatColor, categorizedField: field, categoryColors };
  }

  function setSymbologyMode(id: string, mode: 'flat' | 'categorized') {
    onChange(layers.map((l) => {
      if (l.id !== id) return l;
      if (mode === 'flat') {
        // Conserva categorizedField/categoryColors (no los borra) — si el
        // usuario vuelve a categorizar después, recupera la misma
        // configuración en vez de tener que elegir el campo de nuevo.
        return { ...l, symbology: { ...l.symbology, mode: 'flat' } };
      }
      if (l.symbology.categorizedField && l.symbology.categoryColors) {
        return { ...l, symbology: { ...l.symbology, mode: 'categorized' } };
      }
      const field = getCategorizableFields(l)[0];
      if (!field) return l; // no debería pasar (el control está oculto sin campos), pero por seguridad no cambia nada
      return { ...l, symbology: buildCategorizedSymbology(l, field) };
    }));
  }

  function setCategorizedField(id: string, field: string) {
    onChange(layers.map((l) => (l.id === id ? { ...l, symbology: buildCategorizedSymbology(l, field) } : l)));
  }

  function remove(id: string) {
    onChange(layers.filter((l) => l.id !== id));
  }

  function move(id: string, direction: -1 | 1) {
    const idx = sorted.findIndex((l) => l.id === id);
    const targetIdx = idx + direction;
    if (idx === -1 || targetIdx < 0 || targetIdx >= sorted.length) return;
    // Intercambia los valores de `order` entre las dos capas vecinas en
    // la lista mostrada — más simple que renumerar toda la lista, y
    // alcanza porque `order` solo importa en relación a las demás capas.
    const a = sorted[idx];
    const b = sorted[targetIdx];
    onChange(layers.map((l) => {
      if (l.id === a.id) return { ...l, order: b.order };
      if (l.id === b.id) return { ...l, order: a.order };
      return l;
    }));
  }

  return (
    <div className="gis-toc">
      <style>{TOC_CSS}</style>
      <div className="gis-toc-title">Capas</div>
      {sorted.length === 0 && <div className="gis-toc-empty">Sin capas</div>}
      {sorted.map((layer, idx) => {
        const isRasterLike = layer.type === 'raster' || layer.type === 'integrated-hidrogeo-chart' || layer.type === 'integrated-hidrogeo-stiff';
        const categorizableFields = isRasterLike ? [] : getCategorizableFields(layer);
        const showSymbologyControl = categorizableFields.length > 0;

        return (
          <React.Fragment key={layer.id}>
            <div className="gis-toc-row">
              <input
                type="checkbox"
                className="gis-toc-visible"
                checked={layer.visible}
                onChange={() => toggleVisible(layer.id)}
                title="Visible"
              />
              {isRasterLike ? (
                <span className="gis-toc-color-spacer" title="Los ráster no tienen color editable" />
              ) : (
                <input
                  type="color"
                  className="gis-toc-color"
                  value={layer.symbology.flatColor}
                  onChange={(e) => setColor(layer.id, e.target.value)}
                  title={layer.symbology.mode === 'categorized' ? 'Color de respaldo (valores sin categoría asignada)' : 'Color'}
                />
              )}
              <span className="gis-toc-name" title={layer.name}>{layer.name}</span>
              <div className="gis-toc-reorder">
                <button
                  type="button"
                  className="gis-toc-reorder-btn"
                  disabled={idx === 0}
                  onClick={() => move(layer.id, -1)}
                  title="Subir"
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="gis-toc-reorder-btn"
                  disabled={idx === sorted.length - 1}
                  onClick={() => move(layer.id, 1)}
                  title="Bajar"
                >
                  ▼
                </button>
              </div>
              {layer.type.startsWith('integrated-') ? (
                <span className="gis-toc-delete-spacer" title="Capa automática — no se puede eliminar, solo ocultar" />
              ) : (
                <button
                  type="button"
                  className="gis-toc-delete-btn"
                  onClick={() => remove(layer.id)}
                  title="Eliminar capa"
                >
                  ✕
                </button>
              )}
            </div>
            {showSymbologyControl && (
              <div className="gis-toc-symbology">
                <div className="gis-toc-mode-toggle">
                  <button
                    type="button"
                    className={`gis-toc-mode-btn${layer.symbology.mode === 'flat' ? ' active' : ''}`}
                    onClick={() => setSymbologyMode(layer.id, 'flat')}
                  >
                    Plano
                  </button>
                  <button
                    type="button"
                    className={`gis-toc-mode-btn${layer.symbology.mode === 'categorized' ? ' active' : ''}`}
                    onClick={() => setSymbologyMode(layer.id, 'categorized')}
                  >
                    Categorizar
                  </button>
                </div>
                {layer.symbology.mode === 'categorized' && (
                  <>
                    <select
                      className="gis-toc-field-select"
                      value={layer.symbology.categorizedField ?? ''}
                      onChange={(e) => setCategorizedField(layer.id, e.target.value)}
                      title="Campo de categorización"
                    >
                      {categorizableFields.map((field) => (
                        <option key={field} value={field}>{field}</option>
                      ))}
                    </select>
                    <div className="gis-toc-legend">
                      {Object.entries(layer.symbology.categoryColors ?? {}).map(([value, color]) => (
                        <div className="gis-toc-legend-item" key={value}>
                          <span className="gis-toc-legend-swatch" style={{ background: color }} />
                          <span className="gis-toc-legend-label" title={value || '(vacío)'}>{value || '(vacío)'}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
