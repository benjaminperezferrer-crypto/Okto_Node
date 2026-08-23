/**
 * src/estructural/ClassificationFilterPanel.tsx
 * Etapa 9 — UI compartida de clasificación por color + filtro, aplicable
 * a TODOS los diagramas del módulo desde un solo lugar. Es el único
 * componente que conoce el estado de clasificación/filtro; los
 * diagramas (StereonetPlanes.tsx, RoseDiagram.tsx) no implementan su
 * propia lógica — reciben datos ya filtrados y funciones de color ya
 * resueltas vía el patrón children(ctx), el mismo que StereonetBase.tsx
 * usa para su propio contexto (projection/radius/toScreen) — acá el
 * contexto es measurements/linearMeasurements/getColor/getGroup/
 * groupColor/colors.
 *
 * Recibe la data COMPLETA sin filtrar (measurements/linearMeasurements)
 * — calcula los campos clasificables y sus valores distintos sobre esa
 * data completa (no sobre el resultado ya filtrado, para que el panel
 * de filtro siga mostrando TODAS las opciones incluso después de
 * aplicar un filtro — si el usuario filtra por campaña=2025 y después
 * quiere ver también 2024, la casilla de 2024 debe seguir estando ahí
 * para marcarla de nuevo).
 *
 * No incluye las líneas derivadas por rake (RenderableLine) como input
 * separado: StereonetPlanes.tsx/RoseDiagram.tsx ya llaman
 * deriveRakeLines(measurements) internamente, y como esas líneas
 * heredan tipo/cinemática/zona/campaña de SU PlanarMeasurement de
 * origen (ver structuralTypes.ts), filtrar `measurements` alcanza para
 * que sus líneas derivadas también queden filtradas/coloreadas
 * correctamente sin que este panel necesite duplicar esa derivación.
 *
 * Etapa 14 — expone getState()/loadState() vía ref (mismo patrón
 * imperativo que GisViewportHandle/HydrogeochemistryModuleHandle) para
 * que AnalisisEstructuralModule.tsx pueda leer/restaurar la
 * clasificación+filtro activos al guardar/cargar un Proyecto (.geoproj).
 * `filters` viaja serializado como `Record<string,string[]>`
 * (SerializableFilterState) en vez de `FilterState` (con `Set`) porque
 * un `Set` no sobrevive JSON.stringify — se convierte en el borde
 * (getState serializa, loadState deserializa), el estado INTERNO del
 * componente sigue usando `Set` como siempre.
 */

import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  getClassifiableFields, getFieldValue, getClassificationColors,
  applyFilter, passesFilter, getClassifiableFieldLabel, NO_DATA_LABEL,
} from './classification';
import type { FilterState, ClassifiableRecord } from './classification';
import type { PlanarMeasurement, LinearMeasurement, RenderableLine } from './structuralTypes';
import { getClassificationShapes, shapePolygonPoints, SHAPE_KINDS } from './symbolAssignment';
import type { SymbolAssignment } from './symbolAssignment';
import { computeFisherStats } from './stereonet';
import { loadFilterPresets, saveFilterPresets } from './filterPresets';
import type { FilterPreset } from './filterPresets';
import { CollapsibleSection } from '../shared/CollapsibleSection';

/** Forma serializable de FilterState (Record<string,Set<string>>) para viajar dentro de AnalisisEstructuralProjectState — ver JSDoc de archivo. */
export type SerializableFilterState = Record<string, string[]>;

/** Forma serializable del modo comparación (Grupo A/B) — ver declaración de `comparisonMode`/`groupAFilters`/`groupBFilters` más abajo. Etapa de persistencia final del paquete de mejoras: antes vivía SOLO en useState, nunca viajaba en getState()/loadState(). */
export interface ComparisonModeState {
  enabled: boolean;
  groupA: { label: string; filters: SerializableFilterState };
  groupB: { label: string; filters: SerializableFilterState };
}

export interface ClassificationFilterPanelState {
  field: string | null;
  filters: SerializableFilterState;
  /**
   * Campos elegidos para el bloque "Filtrar" (etapa de selección
   * explícita — reemplaza el comportamiento anterior de mostrar el
   * checklist de TODOS los campos clasificables a la vez), en orden —
   * `filterFields[0]` es "campo 1", `filterFields[1]` (si existe) es
   * "campo 2". Máximo 2 elementos — nunca más, ver JSDoc de
   * `MAX_FILTER_FIELDS` más abajo. `filters` NUNCA debe tener una clave
   * que no esté en `filterFields` (invariante de esta etapa: cambiar o
   * quitar un campo resetea su filtro por completo, nunca deja un `Set`
   * oculto aplicando una restricción invisible).
   *
   * Retrocompatibilidad: un proyecto guardado ANTES de esta etapa no
   * trae este campo — `loadState()` lo deriva de las claves YA
   * presentes en `filters` (ver ahí) sin necesitar un bump de
   * schemaVersion, mismo criterio ya usado para `ChartStyleSettings.
   * opacity`/`planeSymmetric` (sanitizeChartStyle() en chartStyle.ts).
   */
  filterFields: string[];
  /** Etapa de persistencia final del paquete de mejoras — antes excluido a propósito de getState()/loadState() (ver comentario histórico junto a `showSymbols` más abajo), ahora sí viaja. */
  showSymbols: boolean;
  comparisonMode: ComparisonModeState;
}

/** Cuántos campos puede tener elegidos el bloque "Filtrar" a la vez — pedido explícito, ver JSDoc de archivo. */
export const MAX_FILTER_FIELDS = 2;

/**
 * Resuelve `filterFields` + `filters` de un estado cargado, aplicando la
 * retrocompatibilidad de esta etapa (ver JSDoc de
 * ClassificationFilterPanelState.filterFields) — función PURA y exportada
 * para poder testear la lógica de derivación sin renderizar el
 * componente. Reglas:
 *  - Si el estado trae `filterFields` explícito (proyecto guardado DESDE
 *    esta etapa): se respeta tal cual, topado a MAX_FILTER_FIELDS, y
 *    `filters` se devuelve intacto (la invariante ya la garantizó quien
 *    guardó).
 *  - Si NO lo trae (proyecto viejo): se derivan de las claves de
 *    `filters` (las primeras MAX_FILTER_FIELDS), y se DESCARTAN del
 *    resultado las claves de `filters` que sobren — nunca se restaura una
 *    restricción sin un campo visible que la represente.
 */
export function resolveLoadedFilterFields(
  state: Pick<ClassificationFilterPanelState, 'filters'> & { filterFields?: string[] },
): { filterFields: string[]; filters: SerializableFilterState } {
  const hasExplicit = Array.isArray(state.filterFields);
  const filterFields = (hasExplicit ? state.filterFields! : Object.keys(state.filters)).slice(0, MAX_FILTER_FIELDS);
  const filters = hasExplicit
    ? state.filters
    : Object.fromEntries(Object.entries(state.filters).filter(([k]) => filterFields.includes(k)));
  return { filterFields, filters };
}

export interface ClassificationFilterPanelHandle {
  getState: () => ClassificationFilterPanelState;
  loadState: (state: ClassificationFilterPanelState) => void;
  /** Presets de filtro guardables — lista COMPLETA tal como vive hoy en este componente (localStorage, `estructural.filterPresets.v1`). Ver JSDoc de `setPresetsFromProject` para el criterio de fusión al cargar un proyecto. */
  getPresets: () => FilterPreset[];
  /** Reemplaza la lista de presets en memoria (y por lo tanto en localStorage, vía el mismo useEffect que ya persiste `presets`) con el resultado YA FUSIONADO que decide AnalisisEstructuralModule.loadProjectState() — este componente no conoce la política de fusión, solo aplica la lista final. */
  setPresetsFromProject: (merged: FilterPreset[]) => void;
}

function serializeFilters(filters: FilterState): SerializableFilterState {
  return Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, Array.from(v)]));
}

function deserializeFilters(filters: SerializableFilterState): FilterState {
  return Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, new Set(v)]));
}

export interface ClassificationFilterResult {
  /** measurements/linearMeasurements YA FILTRADOS — pasar directo a los diagramas. */
  measurements: PlanarMeasurement[];
  linearMeasurements: LinearMeasurement[];
  /** Campo de clasificación activo, o null si no hay clasificación (todo un solo color). */
  field: string | null;
  /** value de clasificación -> color, solo con entradas si field!=null. */
  colors: Record<string, string>;
  /** Para StereonetPlanes.getColor — undefined si no hay clasificación activa (el diagrama usa sus colores flat por default). */
  getColor?: (item: PlanarMeasurement | RenderableLine) => string;
  /** Para RoseDiagram.getGroup — undefined si no hay clasificación activa. */
  getGroup?: (item: PlanarMeasurement | RenderableLine) => string;
  /** Para RoseDiagram.groupColor — undefined si no hay clasificación activa. */
  groupColor?: (group: string) => string;
  /**
   * Para StereonetPlanes.getSymbol (paquete de mejoras — símbolos por
   * tipo) — undefined salvo que HAYA clasificación activa Y el toggle
   * "Símbolos por tipo" esté encendido (apagado por default, ver
   * symbolAssignment.ts). RoseDiagram no lo recibe: sus pétalos no son
   * marcadores puntuales, no hay "forma" que variar ahí.
   */
  getSymbol?: (item: PlanarMeasurement | RenderableLine) => SymbolAssignment;
  /**
   * Entradas de leyenda YA RESUELTAS (clasificación normal O modo
   * comparación, paquete de mejoras) — AnalisisEstructuralModule.tsx las
   * usa tal cual en vez de derivarlas de `colors` (que queda vacío en
   * modo comparación). `undefined` = usar la leyenda por defecto de cada
   * diagrama (Polo/Plano/Línea con colores planos).
   */
  legendEntries?: { label: string; color: string }[];
  /**
   * Grupos del modo comparación (paquete de mejoras) — SOLO para que
   * StereonetPlanes.tsx calcule/dibuje el plano/polo medio y el cono de
   * confianza POR GRUPO por separado (nunca un promedio combinado sin
   * sentido, ver JSDoc de archivo más abajo) en vez de sobre
   * `measurements` completo. `undefined` si el modo comparación no está
   * activo — StereonetPlanes.tsx vuelve a su comportamiento normal de un
   * solo plano/polo medio.
   */
  comparisonGroups?: ComparisonGroupInfo[];
}

/** Un grupo del modo comparación, ya filtrado — ver ClassificationFilterResult.comparisonGroups. */
export interface ComparisonGroupInfo {
  label: string;
  color: string;
  measurements: PlanarMeasurement[];
}

/** Colores fijos del modo comparación — DELIBERADAMENTE distintos de FAMILY_PALETTE (StereonetPlanes.tsx) para que un anillo de familia y un marcador de Grupo B nunca se confundan si coincidieran en pantalla (aunque en la práctica StereonetPlanes.tsx oculta las familias mientras el modo comparación está activo, ver su JSDoc). Azul/rojo son además los colores flat por defecto de polos/planos del módulo — reutilizados a propósito, no una paleta nueva. */
const COMPARISON_COLOR_A = '#2563eb';
const COMPARISON_COLOR_B = '#dc2626';
/** Valor "de grupo" que devuelve getGroup() para un ítem que no cae en NINGUNO de los 2 filtros — no debería pasar en la práctica (measurements ya es la UNIÓN de ambos grupos, ver más abajo), pero groupColor() lo maneja sin lanzar por robustez. */
const UNMATCHED_GROUP = '_unmatched';

function toggleFilterValue(filters: FilterState, allValues: string[], field: string, value: string): FilterState {
  const current = filters[field] ?? new Set<string>();
  const effective = current.size === 0 ? new Set(allValues) : new Set(current);
  if (effective.has(value)) effective.delete(value);
  else effective.add(value);
  // Si vuelve a quedar "todo permitido", colapsa a Set vacío (forma canónica de "sin restricción").
  const next = effective.size === allValues.length ? new Set<string>() : effective;
  return { ...filters, [field]: next };
}

export interface ClassificationFilterPanelProps {
  measurements: PlanarMeasurement[];
  linearMeasurements?: LinearMeasurement[];
  children: (result: ClassificationFilterResult) => React.ReactNode;
  /**
   * Contenido extra apilado DEBAJO del panel de filtro/clasificación, en la
   * MISMA columna izquierda de ancho reducido (etapa de reorganización visual):
   * los editores de estilo del estereograma y la roseta viven acá. Render-prop
   * (recibe el mismo `result`) para que esos editores accedan al estado del
   * filtro cuando lo necesitan (p.ej. si hay modo comparación activo, para las
   * etiquetas de los toggles avanzados).
   */
  belowPanel?: (result: ClassificationFilterResult) => React.ReactNode;
}

const ClassificationFilterPanel = forwardRef<ClassificationFilterPanelHandle, ClassificationFilterPanelProps>(function ClassificationFilterPanel({
  measurements,
  linearMeasurements = [],
  children,
  belowPanel,
}, ref) {
  const [field, setField] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({});
  // Selección explícita de campos para "Filtrar" — ver JSDoc de
  // ClassificationFilterPanelState.filterFields. Vacío por defecto: sin
  // ningún checklist visible hasta que el usuario elija un campo.
  const [filterFields, setFilterFields] = useState<string[]>([]);
  // Apagado por default, mismo criterio "activable, no siempre visible" que
  // Kamb/plano-polo medio (StereonetPlanes.tsx). Etapa de persistencia final
  // del paquete de mejoras: ahora SÍ viaja en getState()/loadState() (antes
  // era session-only a propósito, ver historial de este comentario).
  const [showSymbols, setShowSymbols] = useState(false);

  // Presets de filtro guardables (paquete de mejoras) — localStorage sigue
  // siendo la fuente de lectura/escritura INMEDIATA (caché rápido de
  // sesión, ver loadFilterPresets/saveFilterPresets abajo) — AHORA TAMBIÉN
  // viajan en AnalisisEstructuralProjectState (etapa de persistencia final
  // del paquete): getPresets()/setPresetsFromProject() (ver
  // ClassificationFilterPanelHandle) le dan a AnalisisEstructuralModule
  // acceso de lectura/escritura completo a esta lista sin que este
  // componente conozca la política de fusión con el .geoproj (esa decisión
  // vive en loadProjectState(), ver su JSDoc).
  const [presets, setPresets] = useState<FilterPreset[]>(() => loadFilterPresets());
  const [presetNameInput, setPresetNameInput] = useState('');
  useEffect(() => { saveFilterPresets(presets); }, [presets]);

  function savePreset() {
    const name = presetNameInput.trim();
    if (!name) return; // a diferencia de familias (StereonetPlanes.tsx), acá el enunciado pide explícitamente "que pida un nombre" — sin nombre, no-op en vez de inventar uno.
    setPresets((prev) => [...prev, { id: `preset-${Date.now()}-${prev.length}`, name, field, filters: serializeFilters(filters) }]);
    setPresetNameInput('');
  }

  function applyPreset(p: FilterPreset) {
    setField(p.field);
    setFilters(deserializeFilters(p.filters));
  }

  function deletePreset(id: string) {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }

  /**
   * Modo comparación (paquete de mejoras) — 2 subconjuntos de filtro
   * INDEPENDIENTES entre sí (Grupo A/B), cada uno reutilizando
   * applyFilter()/passesFilter() de classification.ts (misma
   * infraestructura que el filtro normal, ningún motor nuevo), evaluados
   * DIRECTO sobre `measurements`/`linearMeasurements` completos — NO se
   * combinan con el filtro normal (`filters`, arriba): son 2 conjuntos
   * aparte, no una restricción adicional sobre uno ya filtrado, tal como
   * pide "dos conjuntos de filtro independientes" del enunciado.
   *
   * ── Por qué reutiliza presets solo como "relleno rápido", no como
   *    referencia viva ────────────────────────────────────────────────
   * Elegir un preset copia su `.filters` UNA VEZ al estado propio del
   * grupo (`groupAFilters`/`groupBFilters`) — after eso, el usuario puede
   * seguir ajustando los checkboxes de ESE grupo libremente, sin que se
   * le muevan por su cuenta si el preset original cambia después. Es más
   * simple que mantener 2 modos de UI mutuamente excluyentes
   * (select-de-preset vs. ad-hoc): siempre es ad-hoc por dentro, el
   * preset es solo un atajo para no marcar los checkboxes a mano.
   *
   * ── Por qué se apaga la clasificación normal mientras está activo ────
   * Pedido explícito: 2 sistemas de color superpuestos (clasificación +
   * comparación) serían confusos. Mientras `comparisonMode` es true,
   * `field`/`colors`/`getSymbol` quedan en su estado "apagado" (ver
   * `result` más abajo) sin importar el estado de `field`/`showSymbols` —
   * simplemente no se muestran ni se usan en el resultado expuesto.
   */
  const [comparisonMode, setComparisonMode] = useState(false);
  const [groupALabel, setGroupALabel] = useState('Grupo A');
  const [groupBLabel, setGroupBLabel] = useState('Grupo B');
  const [groupAFilters, setGroupAFilters] = useState<FilterState>({});
  const [groupBFilters, setGroupBFilters] = useState<FilterState>({});

  function toggleGroupAValue(f: string, value: string) {
    setGroupAFilters((prev) => toggleFilterValue(prev, valuesByField[f], f, value));
  }
  function toggleGroupBValue(f: string, value: string) {
    setGroupBFilters((prev) => toggleFilterValue(prev, valuesByField[f], f, value));
  }

  useImperativeHandle(ref, () => ({
    getState: () => ({
      field,
      filters: serializeFilters(filters),
      filterFields,
      showSymbols,
      comparisonMode: {
        enabled: comparisonMode,
        groupA: { label: groupALabel, filters: serializeFilters(groupAFilters) },
        groupB: { label: groupBLabel, filters: serializeFilters(groupBFilters) },
      },
    }),
    loadState: (state) => {
      setField(state.field);
      // Retrocompatibilidad — ver resolveLoadedFilterFields() (pura,
      // testeada) y el JSDoc de ClassificationFilterPanelState.filterFields.
      const resolved = resolveLoadedFilterFields(state);
      setFilters(deserializeFilters(resolved.filters));
      setFilterFields(resolved.filterFields);
      setShowSymbols(state.showSymbols);
      setComparisonMode(state.comparisonMode.enabled);
      setGroupALabel(state.comparisonMode.groupA.label);
      setGroupAFilters(deserializeFilters(state.comparisonMode.groupA.filters));
      setGroupBLabel(state.comparisonMode.groupB.label);
      setGroupBFilters(deserializeFilters(state.comparisonMode.groupB.filters));
    },
    getPresets: () => presets,
    setPresetsFromProject: (merged) => setPresets(merged),
  }), [field, filters, filterFields, showSymbols, comparisonMode, groupALabel, groupBLabel, groupAFilters, groupBFilters, presets]);

  const classifiableFields = getClassifiableFields(measurements, linearMeasurements);

  const allRecords: ClassifiableRecord[] = [...measurements, ...linearMeasurements];
  const valuesByField: Record<string, string[]> = {};
  for (const f of classifiableFields) {
    const seen: string[] = [];
    for (const r of allRecords) {
      const v = getFieldValue(r, f);
      if (!seen.includes(v)) seen.push(v);
    }
    valuesByField[f] = seen;
  }

  function toggleValue(f: string, value: string) {
    setFilters((prev) => toggleFilterValue(prev, valuesByField[f], f, value));
  }

  /** Quita la clave `f` de `filters` por completo — nunca deja un `Set` oculto aplicando una restricción invisible (ver JSDoc de ClassificationFilterPanelState.filterFields). */
  function clearFieldFilter(f: string) {
    setFilters((prev) => {
      if (!(f in prev)) return prev;
      const next = { ...prev };
      delete next[f];
      return next;
    });
  }

  /** Cambia (o quita, con `newField = null`) el campo en la posición `slotIndex` (0 = "campo 1", 1 = "campo 2") del bloque "Filtrar" — resetea el filtro del campo SALIENTE. Elegir "Ninguno" en el campo 1 también quita el campo 2 (dependiente de que haya un campo 1, mismo criterio del mecanismo de UI elegido). */
  function setFilterFieldAt(slotIndex: 0 | 1, newField: string | null) {
    setFilterFields((prev) => {
      const outgoing = prev[slotIndex];
      if (outgoing) clearFieldFilter(outgoing);
      if (slotIndex === 0 && newField === null) {
        const secondOutgoing = prev[1];
        if (secondOutgoing) clearFieldFilter(secondOutgoing);
        return [];
      }
      const next = [...prev];
      if (newField === null) next.splice(slotIndex, 1);
      else next[slotIndex] = newField;
      return next;
    });
  }

  function renderFilterCheckboxes(
    currentFilters: FilterState,
    onToggle: (f: string, value: string) => void,
    testIdPrefix: string,
    fieldsToRender: string[] = classifiableFields,
  ) {
    return fieldsToRender.map((f) => (
      <div key={f} style={{ marginBottom: 12 }}>
        <div style={{ fontSize: '.68rem', color: 'var(--hud-text-dim)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>
          {getClassifiableFieldLabel(f)}
        </div>
        {valuesByField[f].map((value) => {
          const allowed = currentFilters[f] ?? new Set<string>();
          const checked = allowed.size === 0 || allowed.has(value);
          return (
            <label
              key={value}
              data-testid={`${testIdPrefix}-${f}-${value}`}
              className="hud-checkrow"
              style={{ alignItems: 'flex-start' }}
            >
              <input type="checkbox" checked={checked} onChange={() => onToggle(f, value)} style={{ marginTop: 2, flexShrink: 0 }} />
              {/* minWidth:0 + overflowWrap permiten que una etiqueta larga
                  ("Falla Transtensional Sinestral mineralizada", Cinemática, etc.)
                  haga wrap a varias líneas dentro del ancho del panel, en vez de
                  desbordarse por el borde derecho. */}
              <span style={{ minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.3 }}>
                {value === NO_DATA_LABEL ? NO_DATA_LABEL : value}
              </span>
            </label>
          );
        })}
      </div>
    ));
  }

  const filteredMeasurements = applyFilter(measurements, filters);
  const filteredLinear = applyFilter(linearMeasurements, filters);

  // Estadística direccional de Fisher (paquete de mejoras) — re-render
  // NORMAL disparado por el cambio de filtro (measurements/filters ya
  // cambiaron arriba), NO una interacción continua — no necesita el
  // patrón imperativo de zoom/opacidad/resaltado cruzado. Se computa
  // acá sobre `filteredMeasurements` (los polos ACTUALMENTE filtrados,
  // igual criterio que el resto de este panel) — StereonetPlanes.tsx
  // computa su PROPIA copia internamente (mismo criterio que ya usa
  // para plano/polo medio y Kamb: cada diagrama recalcula desde su
  // prop `measurements`, sin depender de un valor pre-computado acá) —
  // duplicar esta llamada barata (O(n), pura) es preferible a acoplar
  // este panel con el estado interno del toggle del cono en el
  // estereograma.
  const fisherStats = computeFisherStats(filteredMeasurements);

  const colors = field ? getClassificationColors(measurements, linearMeasurements, field) : {};
  const fallbackColor = '#2563eb';
  const getColor = field ? (item: PlanarMeasurement | RenderableLine) => colors[getFieldValue(item, field)] ?? fallbackColor : undefined;
  const getGroup = field ? (item: PlanarMeasurement | RenderableLine) => getFieldValue(item, field) : undefined;
  const groupColor = field ? (group: string) => colors[group] ?? fallbackColor : undefined;

  const shapes = field && showSymbols ? getClassificationShapes(colors) : null;
  const fallbackSymbol: SymbolAssignment = { shape: 'circle', dashed: false };
  const getSymbol = shapes
    ? (item: PlanarMeasurement | RenderableLine) => shapes[getFieldValue(item, field!)] ?? fallbackSymbol
    : undefined;
  const symbolValueCount = shapes ? Object.keys(shapes).length : 0;

  // ── Modo comparación (paquete de mejoras) — ver JSDoc completo arriba,
  //    junto a la declaración de comparisonMode ────────────────────────
  const groupAMeasurements = comparisonMode ? applyFilter(measurements, groupAFilters) : [];
  const groupBMeasurements = comparisonMode ? applyFilter(measurements, groupBFilters) : [];
  const groupALinear = comparisonMode ? applyFilter(linearMeasurements, groupAFilters) : [];
  const groupBLinear = comparisonMode ? applyFilter(linearMeasurements, groupBFilters) : [];
  // Fisher POR GRUPO, cada uno reutilizando computeFisherStats() tal cual
  // (nunca un promedio combinado A+B, que no tendría sentido geológico) —
  // pedido explícito del enunciado.
  const fisherA = comparisonMode ? computeFisherStats(groupAMeasurements) : null;
  const fisherB = comparisonMode ? computeFisherStats(groupBMeasurements) : null;

  // Unión SIN DUPLICADOS (un ítem que pasa AMBOS filtros se queda en A,
  // por orden de evaluación — caso borde documentado, no un bug) — es lo
  // que reciben los diagramas como measurements/linearMeasurements
  // cuando el modo comparación está activo: solo lo que pertenece a
  // alguno de los 2 grupos, el resto queda fuera de vista (mismo
  // criterio que un filtro normal).
  const groupAIds = new Set(groupAMeasurements.map((m) => m.id));
  const comparisonMeasurements = comparisonMode
    ? [...groupAMeasurements, ...groupBMeasurements.filter((m) => !groupAIds.has(m.id))]
    : [];
  const groupALinearIds = new Set(groupALinear.map((l) => l.id));
  const comparisonLinear = comparisonMode
    ? [...groupALinear, ...groupBLinear.filter((l) => !groupALinearIds.has(l.id))]
    : [];

  // getColor/getGroup/groupColor del modo comparación — re-evalúan
  // passesFilter() DIRECTO sobre cada ítem (sus propios campos
  // tipo/cinemática/zona/campaña) en vez de armar un mapa por id: evita
  // el problema de que las líneas le llegan a StereonetPlanes/RoseDiagram
  // como RenderableLine con un id DISTINTO al de la LinearMeasurement
  // original (`lin-${id}` o un id derivado de rake) — passesFilter() no
  // usa `.id` para nada, así que funciona igual para PlanarMeasurement Y
  // RenderableLine sin tener que reconciliar esos 2 esquemas de id.
  const comparisonGetColor = (item: PlanarMeasurement | RenderableLine): string => {
    if (passesFilter(item, groupAFilters)) return COMPARISON_COLOR_A;
    if (passesFilter(item, groupBFilters)) return COMPARISON_COLOR_B;
    return '#94a3b8'; // gris neutro — no debería alcanzarse (measurements ya es la unión), robustez.
  };
  const comparisonGetGroup = (item: PlanarMeasurement | RenderableLine): string => {
    if (passesFilter(item, groupAFilters)) return groupALabel;
    if (passesFilter(item, groupBFilters)) return groupBLabel;
    return UNMATCHED_GROUP;
  };
  const comparisonGroupColor = (group: string): string => {
    if (group === groupALabel) return COMPARISON_COLOR_A;
    if (group === groupBLabel) return COMPARISON_COLOR_B;
    return '#94a3b8'; // mismo gris neutro de respaldo que comparisonGetColor — no debería alcanzarse.
  };

  const comparisonLegend = [
    { label: `${groupALabel} (${groupAMeasurements.length + groupALinear.length})`, color: COMPARISON_COLOR_A },
    { label: `${groupBLabel} (${groupBMeasurements.length + groupBLinear.length})`, color: COMPARISON_COLOR_B },
  ];
  const classificationLegend = field
    ? Object.entries(colors).map(([label, color]) => ({ label, color }))
    : undefined;

  const result: ClassificationFilterResult = comparisonMode
    ? {
        measurements: comparisonMeasurements,
        linearMeasurements: comparisonLinear,
        field: null,
        colors: {},
        getColor: comparisonGetColor,
        getGroup: comparisonGetGroup,
        groupColor: comparisonGroupColor,
        getSymbol: undefined, // símbolos por tipo apagados en modo comparación, ver JSDoc.
        legendEntries: comparisonLegend,
        comparisonGroups: [
          { label: groupALabel, color: COMPARISON_COLOR_A, measurements: groupAMeasurements },
          { label: groupBLabel, color: COMPARISON_COLOR_B, measurements: groupBMeasurements },
        ],
      }
    : {
        measurements: filteredMeasurements,
        linearMeasurements: filteredLinear,
        field,
        colors,
        getColor,
        getGroup,
        groupColor,
        getSymbol,
        legendEntries: classificationLegend,
        comparisonGroups: undefined,
      };

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      {/* Columna izquierda: contiene el panel de filtro/clasificación y, apilados
          debajo, los editores de estilo de ambos gráficos (belowPanel). Ancho
          299px (= 230px + 30%): el 230 ya acomodaba las etiquetas largas del
          checklist (que hacen wrap, ver renderFilterCheckboxes), pero el control
          de Opacidad del ChartStyleEditor ("… 100%") seguía saliéndose ~15px del
          recuadro; el ancho extra lo absorbe con margen. Sigue por debajo del
          ancho histórico, así los gráficos quedan solo un poco más chicos y
          todavía grandes (se reajustan solos vía useResponsiveSquareSize). */}
      <div style={{ flex: '0 0 299px', width: 299, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="hud-panel" style={{ padding: 14 }}>
        <label
          className="hud-checkrow"
          style={{ marginBottom: 14 }}
          title="Superpone 2 subconjuntos de filtro independientes (Grupo A/B), cada uno con un color fijo propio — desactiva la clasificación normal por color/símbolo mientras está activo, para no mezclar 2 sistemas de color."
        >
          <input
            type="checkbox"
            data-testid="toggle-comparison-mode"
            checked={comparisonMode}
            onChange={(e) => setComparisonMode(e.target.checked)}
          />
          Modo comparación (2 grupos)
        </label>

        {!comparisonMode && (
        <div className="hud-panel" style={{ padding: 0, marginBottom: 14 }}>
        <CollapsibleSection
          id="estructural.filtroClasificacion"
          title={field ? `Clasificación y filtro — ${getClassifiableFieldLabel(field)}` : 'Clasificación y filtro'}
          defaultOpen={false}
        >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div className="hud-sec-label" style={{ marginTop: 0, marginBottom: 0 }}>Clasificar por color</div>
          {/* Indicador siempre visible del campo activo (además del propio <select>, que ya muestra su valor
              actual sin abrirse) — mismo texto que se agrega al título de la sección de arriba, para que
              quede visible incluso con la sección COLAPSADA, sin tener que expandirla ni abrir el <select>. */}
          {field && (
            <span
              className="hud-badge"
              data-testid="active-classification-field-badge"
              style={{ fontSize: '.6rem', padding: '2px 8px' }}
            >
              {getClassifiableFieldLabel(field)}
            </span>
          )}
        </div>
        <select
          data-testid="classification-field-select"
          className="hud-select"
          value={field ?? ''}
          onChange={(e) => setField(e.target.value === '' ? null : e.target.value)}
          style={{ marginBottom: 14 }}
        >
          <option value="">Sin clasificar</option>
          {classifiableFields.map((f) => (
            <option key={f} value={f}>{getClassifiableFieldLabel(f)}</option>
          ))}
        </select>

        {field && (
          <div style={{ marginBottom: 8 }}>
            <label
              className="hud-checkrow"
              title={
                showSymbols
                  ? 'Cada valor de clasificación recibe además una forma de marcador distinta (polos/líneas del estereograma) — la roseta no se ve afectada (sus pétalos no son marcadores puntuales).'
                  : 'Requiere clasificación activa. Asigna una forma de marcador distinta (círculo/cuadrado/triángulo/diamante/cruz/hexágono) a cada valor, además del color.'
              }
            >
              <input
                type="checkbox"
                data-testid="toggle-symbols-by-type"
                checked={showSymbols}
                onChange={(e) => setShowSymbols(e.target.checked)}
              />
              Símbolos por tipo
            </label>
            {showSymbols && symbolValueCount > SHAPE_KINDS.length && (
              <div className="hud-empty-note" style={{ marginTop: 4 }}>
                {symbolValueCount} categorías, solo {SHAPE_KINDS.length} formas distintas — se reciclan (contorno punteado = forma repetida).
              </div>
            )}
          </div>
        )}

        {field && (
          <div style={{ marginBottom: 14 }}>
            {Object.entries(colors).map(([value, color]) => {
              const sym = shapes ? shapes[value] : null;
              return (
                <div key={value} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, fontSize: '.72rem' }}>
                  {sym ? (
                    <svg width={12} height={12} style={{ flexShrink: 0, overflow: 'visible' }}>
                      {sym.shape === 'circle' ? (
                        <circle cx={6} cy={6} r={4.5} fill={color} stroke="#0f172a" strokeWidth={1} strokeDasharray={sym.dashed ? '2,1.5' : undefined} />
                      ) : (
                        <polygon
                          points={shapePolygonPoints(sym.shape, 6, 6, 3.2)!}
                          fill={color} stroke="#0f172a" strokeWidth={1}
                          strokeDasharray={sym.dashed ? '2,1.5' : undefined}
                        />
                      )}
                    </svg>
                  ) : (
                    <span style={{ width: 10, height: 10, background: color, borderRadius: 2, display: 'inline-block', boxShadow: '0 0 4px rgba(0,244,255,.3)' }} />
                  )}
                  <span>{value}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="hud-sec-label">Filtrar</div>
        {/* Selección explícita de campos (reemplaza el checklist de TODOS
            los campos a la vez): un <select> "Filtrar por campo 1" con
            opción "Ninguno"; el <select> del campo 2 aparece SOLO si el
            campo 1 ya está elegido, y sus opciones excluyen lo elegido en
            el campo 1 (no se puede filtrar 2 veces por el mismo campo).
            Toparse en MAX_FILTER_FIELDS es estructural (no hay UI para un
            3.er slot), no un chequeo runtime aparte. */}
        <select
          className="hud-select"
          style={{ marginBottom: filterFields.length > 0 ? 10 : 0 }}
          value={filterFields[0] ?? ''}
          onChange={(e) => setFilterFieldAt(0, e.target.value === '' ? null : e.target.value)}
          data-testid="filter-field-select-0"
        >
          <option value="">Filtrar por campo… (ninguno)</option>
          {classifiableFields.map((f) => (
            <option key={f} value={f}>{getClassifiableFieldLabel(f)}</option>
          ))}
        </select>

        {filterFields.length >= 1 && (
          <select
            className="hud-select"
            style={{ marginBottom: 10 }}
            value={filterFields[1] ?? ''}
            onChange={(e) => setFilterFieldAt(1, e.target.value === '' ? null : e.target.value)}
            data-testid="filter-field-select-1"
          >
            <option value="">Agregar segundo filtro… (ninguno)</option>
            {classifiableFields
              .filter((f) => f !== filterFields[0])
              .map((f) => (
                <option key={f} value={f}>{getClassifiableFieldLabel(f)}</option>
              ))}
          </select>
        )}

        {filterFields.length === 0 && (
          <div className="hud-empty-note" style={{ marginBottom: 4 }} data-testid="filter-empty-note">
            Elige un campo arriba para filtrar por sus valores. Sin campo elegido, se incluyen todas las mediciones.
          </div>
        )}

        {/* Solo los checklists de los campos EXPLÍCITAMENTE elegidos —
            `filterFields` ya está topado en MAX_FILTER_FIELDS y sin
            duplicados (ver setFilterFieldAt), así que renderiza a lo sumo 2. */}
        {renderFilterCheckboxes(filters, toggleValue, 'filter', filterFields)}

        <div className="hud-sec-label">Estadística direccional (Fisher)</div>
        {fisherStats ? (
          <div style={{ fontSize: '.72rem', color: 'var(--hud-text)', lineHeight: 1.7 }}>
            <div>N = {fisherStats.n}</div>
            <div>Orientación media: {fisherStats.dipDirection.toFixed(0)}°/{fisherStats.dip.toFixed(0)}°</div>
            <div title="Parámetro de concentración de Fisher — más alto = datos más agrupados. Ver JSDoc de computeFisherStats() en stereonet.ts para la referencia (Fisher 1953).">
              κ = {Number.isFinite(fisherStats.kappa) ? fisherStats.kappa.toFixed(fisherStats.kappa < 100 ? 1 : 0) : '∞'}
            </div>
            <div title="Semi-ángulo del cono de confianza alrededor de la orientación media, al nivel de confianza indicado.">
              Cono de confianza ({Math.round(fisherStats.confidenceLevel * 100)}%): {fisherStats.confidenceConeDeg.toFixed(1)}°
            </div>
          </div>
        ) : (
          <div className="hud-empty-note">
            {filteredMeasurements.length === 0
              ? 'Sin mediciones filtradas — nada que calcular.'
              : filteredMeasurements.length === 1
                ? 'Se necesitan al menos 2 mediciones.'
                : 'Sin dirección media significativa (vector resultante ≈0 — datos muy dispersos/antipodales).'}
          </div>
        )}
        </CollapsibleSection>
        </div>
        )}

        <div className="hud-panel" style={{ padding: 0, marginBottom: 14 }}>
        <CollapsibleSection id="estructural.presetsFiltro" title="Presets de filtro" defaultOpen={false}>
        <div style={{ display: 'flex', gap: 6, marginBottom: presets.length > 0 ? 8 : 0 }}>
          <input
            type="text"
            className="hud-select"
            placeholder="Nombre del preset"
            value={presetNameInput}
            onChange={(e) => setPresetNameInput(e.target.value)}
            style={{ flex: 1 }}
            disabled={comparisonMode}
            data-testid="preset-name-input"
          />
          <button
            type="button"
            className="hud-toggle-btn"
            onClick={savePreset}
            disabled={comparisonMode || !presetNameInput.trim()}
            title={comparisonMode ? 'No disponible en modo comparación — no hay un único filtro activo que guardar (hay 2, uno por grupo).' : 'Guarda la clasificación + el filtro ACTUALES (campo activo y el estado exacto de cada checkbox) bajo este nombre.'}
            data-testid="save-preset-btn"
          >
            Guardar preset actual
          </button>
        </div>
        {presets.length > 0 && (
          <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {presets.map((p) => (
              <div key={p.id} data-testid={`preset-row-${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.72rem' }}>
                <button
                  type="button"
                  className="hud-toggle-btn"
                  style={{ flex: 1, textAlign: 'left' }}
                  onClick={() => applyPreset(p)}
                  data-testid={`apply-preset-${p.id}`}
                >
                  {p.name}
                </button>
                <button
                  type="button"
                  className="hud-toggle-btn"
                  title="Eliminar preset"
                  onClick={() => deletePreset(p.id)}
                  data-testid={`delete-preset-${p.id}`}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
        </CollapsibleSection>
        </div>

        {comparisonMode && (
          <>
            {([
              { label: groupALabel, setLabel: setGroupALabel, color: COMPARISON_COLOR_A, groupFilters: groupAFilters, onToggle: toggleGroupAValue, testIdPrefix: 'comparison-groupA', fisher: fisherA, n: groupAMeasurements.length + groupALinear.length },
              { label: groupBLabel, setLabel: setGroupBLabel, color: COMPARISON_COLOR_B, groupFilters: groupBFilters, onToggle: toggleGroupBValue, testIdPrefix: 'comparison-groupB', fisher: fisherB, n: groupBMeasurements.length + groupBLinear.length },
            ] as const).map((g, i) => (
              <div key={i} className="hud-panel" style={{ padding: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                  <input
                    type="text"
                    className="hud-select"
                    value={g.label}
                    onChange={(e) => g.setLabel(e.target.value)}
                    style={{ flex: 1 }}
                    data-testid={`${g.testIdPrefix}-label`}
                  />
                </div>
                {presets.length > 0 && (
                  <select
                    className="hud-select"
                    style={{ marginBottom: 8 }}
                    value=""
                    onChange={(e) => {
                      const p = presets.find((pp) => pp.id === e.target.value);
                      if (p) (g.testIdPrefix === 'comparison-groupA' ? setGroupAFilters : setGroupBFilters)(deserializeFilters(p.filters));
                    }}
                    title="Copia el filtro de un preset guardado a este grupo (una sola vez — después puedes seguir ajustando los checkboxes libremente)."
                    data-testid={`${g.testIdPrefix}-preset-select`}
                  >
                    <option value="">Cargar desde preset…</option>
                    {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
                {renderFilterCheckboxes(g.groupFilters, g.onToggle, g.testIdPrefix)}
                <div style={{ fontSize: '.72rem', color: 'var(--hud-text)', lineHeight: 1.7, marginTop: 6 }}>
                  <div>N = {g.n}</div>
                  {g.fisher ? (
                    <>
                      <div>Orientación media: {g.fisher.dipDirection.toFixed(0)}°/{g.fisher.dip.toFixed(0)}°</div>
                      <div>κ = {Number.isFinite(g.fisher.kappa) ? g.fisher.kappa.toFixed(g.fisher.kappa < 100 ? 1 : 0) : '∞'}</div>
                      <div>Cono ({Math.round(g.fisher.confidenceLevel * 100)}%): {g.fisher.confidenceConeDeg.toFixed(1)}°</div>
                    </>
                  ) : (
                    <div className="hud-empty-note">Sin dirección media significativa.</div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      {/* Editores de estilo apilados debajo, dentro de la misma columna angosta. */}
      {belowPanel?.(result)}
      </div>

      {/* flex:1 (antes sin flex, se achicaba al contenido) — necesario para que
          las 2 columnas responsivas de StereonetPlanes/RoseDiagram (que miden
          SU propio ancho vía ResizeObserver) tengan un padre que realmente
          ocupe el ancho disponible, no uno recortado al tamaño de su contenido. */}
      <div style={{ flex: '1 1 0%', minWidth: 0 }}>{children(result)}</div>
    </div>
  );
});

export default ClassificationFilterPanel;
