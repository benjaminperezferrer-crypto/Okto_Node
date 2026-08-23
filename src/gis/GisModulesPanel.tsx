/**
 * src/gis/GisModulesPanel.tsx
 * Sección "Módulos" del panel lateral de GIS — 3 íconos de acceso rápido
 * (Columnas, Hidrogeoquímica, Sondajes) que agregan al lienzo las capas
 * 'integrated-*' de cada módulo hermano. Reemplaza el disparo AUTOMÁTICO
 * anterior (mount effects que aparecían solos al detectar datos) por un
 * disparo POR CLIC:
 *   - GRIS (sin datos): no hay datos reconocidos para plotear ese módulo
 *     (ninguna columna con coordenadas / ningún collar / ningún gráfico
 *     publicado con ubicación válida) — no clickeable.
 *   - COLOREADO (hay datos): clickeable; el clic agrega/refresca la capa.
 *   - YA AGREGADO (disparado): la capa está en el lienzo — el clic la
 *     refresca con el estado actual de datos. Se resalta con el estilo
 *     `.active` del HUD.
 * Componente presentacional puro: toda la lógica de disponibilidad/disparo
 * vive en GisViewport.tsx.
 */
import React from 'react';

export type GisModuleKey = 'columnas' | 'hidro' | 'sondajes';

const MODULE_ORDER: { key: GisModuleKey; icon: string; label: string }[] = [
  { key: 'columnas', icon: '📊', label: 'Columnas' },
  { key: 'hidro', icon: '💧', label: 'Hidro' },
  { key: 'sondajes', icon: '⛏️', label: 'Sondajes' },
];

const NOUN: Record<GisModuleKey, string> = {
  columnas: 'columnas estratigráficas',
  hidro: 'gráficos publicados de Hidrogeoquímica',
  sondajes: 'collars y trazas de sondaje',
};

const GIS_MODULES_CSS = `
  .gis-modules {
    font-family: 'Courier New', Courier, monospace; color: var(--hud-text);
    background: rgba(1,15,32,.92); border: 1px solid var(--hud-border);
    padding: 14px; width: 260px;
  }
  .gis-modules-title {
    font-size: .68rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
    color: var(--hud-cyan); margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid rgba(0,244,255,.15);
  }
  .gis-modules-row { display: flex; gap: 8px; }
  .gis-module-btn {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 8px 4px; background: rgba(0,15,40,.6); border: 1px solid var(--hud-border);
    color: var(--hud-text-dim); font-family: inherit; cursor: pointer; transition: all .15s;
  }
  .gis-module-icon { font-size: 1.5rem; line-height: 1; }
  .gis-module-label { font-size: .56rem; letter-spacing: .06em; text-transform: uppercase; }
  /* Coloreado (hay datos): clickeable, acento cian en hover. */
  .gis-module-btn.available { color: var(--hud-text); border-color: rgba(0,244,255,.35); }
  .gis-module-btn.available:hover { background: rgba(0,244,255,.1); border-color: var(--hud-cyan); box-shadow: var(--hud-cyan-glow); }
  /* Ya agregado (disparado): la capa está en el lienzo — resaltado activo. */
  .gis-module-btn.added { color: var(--hud-cyan); border-color: var(--hud-cyan); background: rgba(0,244,255,.12); }
  /* Gris (sin datos): no clickeable. */
  .gis-module-btn.disabled { filter: grayscale(1); opacity: .4; cursor: not-allowed; }
`;

export interface GisModulesPanelProps {
  available: Record<GisModuleKey, boolean>;
  /** Módulos ya disparados (capa presente en el lienzo). */
  added: Set<GisModuleKey>;
  onActivate: (key: GisModuleKey) => void;
}

export function GisModulesPanel({ available, added, onActivate }: GisModulesPanelProps) {
  return (
    <div className="gis-modules">
      <style>{GIS_MODULES_CSS}</style>
      <div className="gis-modules-title">Módulos</div>
      <div className="gis-modules-row">
        {MODULE_ORDER.map(({ key, icon, label }) => {
          const isAvail = available[key];
          const isAdded = added.has(key) && isAvail;
          const cls = isAdded ? 'added' : isAvail ? 'available' : 'disabled';
          const title = !isAvail
            ? `Sin datos reconocidos para ${NOUN[key]}.`
            : isAdded
              ? `Refrescar ${NOUN[key]} en el lienzo con los datos actuales.`
              : `Agregar ${NOUN[key]} al lienzo.`;
          return (
            <button
              key={key}
              type="button"
              className={`gis-module-btn ${cls}`}
              disabled={!isAvail}
              onClick={() => onActivate(key)}
              title={title}
              data-testid={`gis-module-${key}`}
              data-state={cls}
            >
              <span className="gis-module-icon">{icon}</span>
              <span className="gis-module-label">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
