/**
 * src/shared/collapsibleState.ts
 * Persistencia de "¿esta sección plegable está abierta o cerrada?" para
 * CollapsibleSection.tsx — es preferencia de UI del usuario, no dato de
 * proyecto: vive en localStorage, nunca en getProjectState()/
 * loadProjectState() de ningún módulo.
 *
 * UN SOLO key global (`STORAGE_KEY`), con un mapa `{ id -> boolean }`
 * adentro — mismo patrón que loadChartStyleMap()/saveChartStyleMap()
 * (src/shared/chartStyle.ts), pero acá el mapa es compartido por TODOS
 * los módulos (Hidrogeoquímica hoy, GIS/Estructural/Columnas/QA-QC
 * después con el mismo componente) en vez de un mapa por módulo — cada
 * `id` de sección ya viene namespaced por quien lo define (p.ej.
 * "hgm.filtroClasificacion", "gis.gridSettings"), así que un solo mapa
 * alcanza sin riesgo de colisión entre módulos y sin necesidad de un
 * archivo/key distinto por cada uno.
 */

const STORAGE_KEY = 'okto.collapsedSections.v1';

type SectionOpenMap = Record<string, boolean>;

/** Lee el mapa completo desde localStorage; nunca lanza — mapa vacío si no hay nada, está corrupto, o localStorage no está disponible. */
function loadMap(): SectionOpenMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const result: SectionOpenMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'boolean') result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

/** Persiste el mapa completo; falla en silencio si localStorage no está disponible o está lleno. */
function saveMap(map: SectionOpenMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // No persiste, pero no debe romper la UI por esto.
  }
}

/**
 * Estado guardado de la sección `id` — si nunca se guardó nada para ese
 * id (primera vez que el usuario la ve), devuelve `defaultOpen` tal cual
 * lo definió quien la declaró (ver CollapsibleSection.tsx).
 */
export function loadSectionOpen(id: string, defaultOpen: boolean): boolean {
  const map = loadMap();
  return typeof map[id] === 'boolean' ? map[id] : defaultOpen;
}

/** Guarda el estado abierto/cerrado de la sección `id`, sin tocar el resto del mapa (otras secciones, de este módulo u otro). */
export function saveSectionOpen(id: string, open: boolean): void {
  const map = loadMap();
  map[id] = open;
  saveMap(map);
}
