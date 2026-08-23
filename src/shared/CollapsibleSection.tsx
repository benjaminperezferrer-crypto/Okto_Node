/**
 * src/shared/CollapsibleSection.tsx
 * Sección plegable GENÉRICA para divulgación progresiva ("esconder lo
 * avanzado, mostrar solo lo esencial por defecto") — Etapa 1 del paquete,
 * construida en Hidrogeoquímica (módulo piloto) pero sin ninguna
 * dependencia de ese módulo, para que GIS/Análisis Estructural/Columnas/
 * QA-QC la reutilicen tal cual en etapas futuras.
 *
 * Completamente autocontenida a propósito (a diferencia de
 * ChartStyleEditor.tsx/ExportButton.tsx, que asumen que el módulo
 * consumidor ya define las clases `.hgm-*` en su propio CSS): expone
 * `COLLAPSIBLE_SECTION_CSS` como string para que el módulo consumidor lo
 * inyecte UNA vez junto a su propio `<style>` (mismo patrón que ya usa
 * cada módulo con HUD_THEME_CSS/su propio *_CSS — ver
 * HydrogeochemistryModule.tsx), en vez de que cada instancia de
 * CollapsibleSection imprima su propio `<style>` duplicado. Reusa
 * únicamente las variables `--hud-*` de hudTheme.css (ya global en
 * `:root` de cualquier documento que la use), no clases con nombres
 * heredados de ningún módulo.
 *
 * Estado de apertura/cierre persistido en localStorage vía
 * collapsibleState.ts (mapa GLOBAL compartido entre todos los módulos,
 * namespaced por `id`) — es preferencia de UI, nunca dato de proyecto.
 *
 * El CSS vive en collapsibleSection.css (archivo real, no un string
 * inline acá) para que Columnas (sin build, ver
 * collapsibleSectionVanilla.js) lo consuma con un <link> directo sin
 * duplicar las reglas — misma fuente única para ambas implementaciones.
 */
import React, { useState } from 'react';
import { loadSectionOpen, saveSectionOpen } from './collapsibleState';
import COLLAPSIBLE_SECTION_CSS from './collapsibleSection.css';

export { COLLAPSIBLE_SECTION_CSS };

export interface CollapsibleSectionProps {
  /**
   * Identificador ÚNICO y ESTABLE de esta sección, namespaced por el
   * módulo que la declara (p.ej. "hgm.filtroClasificacion") — es la clave
   * dentro del mapa compartido de collapsibleState.ts. Cambiarlo entre
   * versiones pierde el estado guardado de los usuarios (queda como una
   * sección "nueva", vuelve a `defaultOpen`) — tratarlo con el mismo
   * cuidado que cualquier otra clave de localStorage ya persistida en la
   * app (ver hgm.chartStyle.v1, etc.).
   */
  id: string;
  title: string;
  /**
   * Estado inicial SOLO la primera vez que este `id` se ve en el
   * navegador del usuario (nada guardado todavía). Una vez que el
   * usuario expande o colapsa, esa elección persiste y le gana a este
   * valor en visitas futuras — no es un valor que se pueda usar para
   * forzar el estado en cada render.
   */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * Nota de implementación: `id` se lee UNA sola vez, dentro del
 * inicializador perezoso de useState — si un mismo componente montado
 * cambiara de `id` en un re-render (no ocurre en ningún uso actual, cada
 * instancia tiene un id fijo de por vida) el estado mostrado no se
 * resincronizaría solo con el nuevo id hasta el próximo montaje. No hace
 * falta un useEffect para ese caso hoy — se documenta acá para no
 * sorprender a quien lo reutilice con ids dinámicos en el futuro.
 */
export function CollapsibleSection({ id, title, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(() => loadSectionOpen(id, defaultOpen));

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      saveSectionOpen(id, next);
      return next;
    });
  }

  return (
    <div className="cs-section">
      <button type="button" className="cs-header" onClick={toggle} aria-expanded={open}>
        <span className="cs-caret">{open ? '▾' : '▸'}</span>
        <span className="cs-title">{title}</span>
      </button>
      {open && <div className="cs-body">{children}</div>}
    </div>
  );
}
