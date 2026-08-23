/**
 * src/estructural/filterPresets.ts
 * Paquete de mejoras de Análisis Estructural — presets de filtro
 * guardables: combinaciones nombradas de clasificación+filtro
 * (ClassificationFilterPanel.tsx) para recuperar rápido una vista usada
 * seguido, sin tener que rearmar los checkboxes cada vez.
 *
 * ── Persistencia: localStorage Y el sistema de Proyectos ──
 * localStorage sigue siendo la fuente de lectura/escritura INMEDIATA
 * (caché rápido de sesión) — pero desde la etapa de persistencia final
 * del paquete de mejoras, esta lista TAMBIÉN viaja en
 * AnalisisEstructuralProjectState.filterPresets (GLOBAL, no por pestaña
 * — ver diagnóstico de la etapa de rediseño a pestañas múltiples: un
 * preset es una receta de filtro por NOMBRE DE CAMPO, no depende de qué
 * archivo QA/QC esté usando cada pestaña). Ver JSDoc de
 * mergeFilterPresets() para el criterio de fusión al cargar un proyecto.
 * Mismo mecanismo try/catch + validación que el resto de los módulos de
 * datos de este directorio (localStorage puede no estar disponible o el
 * JSON puede estar corrupto — nunca debe romper la UI por eso).
 *
 * `filters` tiene la MISMA forma que SerializableFilterState de
 * ClassificationFilterPanel.tsx (Record<string,string[]>) — no se
 * importa ese tipo acá (evita un import cruzado componente→módulo de
 * datos solo por un alias) porque TypeScript los unifica igual por
 * tipado estructural; ambos representan lo mismo por construcción.
 */

export interface FilterPreset {
  id: string;
  name: string;
  /** Campo de clasificación activo al guardar — null si no había clasificación. */
  field: string | null;
  /** Mismo shape que SerializableFilterState (ClassificationFilterPanel.tsx). */
  filters: Record<string, string[]>;
}

const STORAGE_KEY = 'estructural.filterPresets.v1';

function isValidPreset(p: unknown): p is FilterPreset {
  if (!p || typeof p !== 'object') return false;
  const r = p as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.name === 'string'
    && (r.field === null || typeof r.field === 'string')
    && !!r.filters && typeof r.filters === 'object';
}

/** Lee los presets guardados — `[]` si no hay nada, localStorage no está disponible, o el JSON está corrupto (nunca lanza). */
export function loadFilterPresets(): FilterPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidPreset);
  } catch {
    return [];
  }
}

/** Persiste la lista completa de presets — falla en silencio si localStorage no está disponible o está lleno. */
export function saveFilterPresets(presets: FilterPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // No persiste, pero no debe romper la UI por esto.
  }
}

/**
 * Fusiona los presets del .geoproj (`fromProject`) con los que ya haya en
 * localStorage de ESTE navegador (`local`) al cargar un proyecto — etapa
 * de persistencia final del paquete de mejoras. Ver JSDoc de archivo:
 * localStorage sigue siendo el caché rápido de sesión, el .geoproj es la
 * fuente de verdad que sobrevive el cierre de la app y viaja entre
 * computadores — pero un reemplazo directo (proyecto pisa localStorage
 * entero) borraría sin aviso presets armados en OTRAS sesiones/proyectos
 * que solo viven en el caché local, lo cual sería una pérdida de datos
 * silenciosa que el usuario no pidió.
 *
 * Criterio elegido: fusión por NOMBRE (no por id — los ids llevan
 * `Date.now()`, así que el mismo preset conceptual guardado en 2
 * sesiones distintas nunca comparte id). Un preset del proyecto
 * reemplaza a uno local del MISMO nombre (el proyecto es la fuente de
 * verdad en caso de conflicto); un preset local sin conflicto de nombre
 * se conserva tal cual. El orden resultante: primero los presets locales
 * no reemplazados (en su orden original), después los del proyecto (los
 * que reemplazaron y los nuevos), en su orden original — estable y
 * predecible, sin reordenar nada que el usuario no haya tocado.
 */
export function mergeFilterPresets(local: FilterPreset[], fromProject: FilterPreset[]): FilterPreset[] {
  const projectNames = new Set(fromProject.map((p) => p.name));
  const keptLocal = local.filter((p) => !projectNames.has(p.name));
  return [...keptLocal, ...fromProject];
}
