/**
 * src/estructural/classification.ts
 * Etapa 9 — clasificación por color + filtro combinable, aplicable a
 * todos los diagramas del módulo (polos, planos, líneas, rosetas) desde
 * un solo lugar. Mismo patrón conceptual que src/hidrogeo/sampleColor.ts
 * (getClassifiableFields/getFieldValue/getClassificationColors) y
 * src/gis/gisLayerRender.ts (getCategorizableFields/getCategoryValues) —
 * nombres alineados con el primero por ser el más cercano en forma
 * (clasificación por color de un array de mediciones, no de capas GIS).
 *
 * No se importa buildColorMap de sampleColor.ts (aunque el algoritmo es
 * idéntico): esa función está tipada específicamente sobre WaterSample,
 * y forzar un import cruzado hidrogeo→estructural para una función de
 * ~10 líneas agregaría acoplamiento entre módulos por poco beneficio —
 * se reimplementa acá, self-contained, documentando que es
 * intencionalmente la misma paleta/algoritmo, no una convención nueva.
 *
 * ── Qué se puede clasificar/filtrar ─────────────────────────────────
 * `tipo` — siempre presente (campo requerido en ambos tipos de dato).
 * `cinemática`/`direccionRake` — solo en PlanarMeasurement (planos/
 *   polos); las líneas (LinearMeasurement o derivadas por rake) no las
 *   tienen (salvo `cinemática`, heredada por las líneas derivadas de
 *   rake — ver RenderableLine en structuralTypes.ts), quedan en el
 *   bucket "(sin dato)".
 * `zona`/`campaña` — campos PROPIOS del módulo (Etapa 1), opcionales,
 *   AUSENTES en datos leídos de QA/QC (solo se completaban por
 *   importación directa, función eliminada — ver JSDoc de
 *   AnalisisEstructuralModule.tsx) — cualquier medición sin el campo cae
 *   en "(sin dato)", un bucket explícito en vez de mezclarse
 *   silenciosamente con otro valor. Quedan en la lista de candidatos por
 *   si QA/QC algún día agrega columnas equivalentes, pero hoy son
 *   inalcanzables (mismo criterio que LinearMeasurement, ver Etapa 1).
 * Columnas "Otro" (repetibles, definidas por el usuario en QA/QC — ver
 *   DB_FIELDS['Datos estructurales'] en index.html): CADA columna
 *   presente en los datos se ofrece como un campo de clasificación
 *   propio, con el id `otros.<nombre de columna>` (ver
 *   OTRO_FIELD_PREFIX/isOtroField/otroFieldColumnName más abajo) — el
 *   usuario ve el nombre de columna tal cual, sin el prefijo (ver
 *   getClassifiableFieldLabel()).
 *
 * ── Deliberadamente EXCLUIDOS de la clasificación ────────────────────
 * `este`/`norte`/`cota` (coordenadas) y `azimut`/`dip`/`rake` (numéricos
 * continuos): clasificar por un valor numérico casi continuo generaría
 * prácticamente un color distinto por punto — cero agrupación útil, la
 * antítesis de lo que esta clasificación existe para hacer. `sourceFileId`/
 * `sourceFileName` (Etapa 2 del rediseño a pestañas): son bookkeeping
 * interno del módulo (de qué archivo QA/QC vino la medición), no un dato
 * geológico — además cada pestaña ya filtra por UN solo archivo, así que
 * `sourceFileId` sería literalmente constante dentro de cualquier
 * pestaña, sin ninguna variación que mostrar. `observaciones` (texto
 * libre): mismo problema práctico que los numéricos continuos aunque sea
 * un string — en la práctica cada fila trae una redacción distinta, así
 * que "clasificar por observaciones" en general no agrupa nada real
 * (con `PALETTE` de 10 colores cíclica, valores casi únicos por fila
 * generan una leyenda enorme con colores repetidos entre observaciones
 * SIN relación entre sí — más confuso que útil). Se excluye por nombre
 * fijo (no con una heurística general de cardinalidad — ninguna columna
 * "Otro" se filtra por esto, se confía en que el usuario elige nombrar
 * ahí datos genuinamente categóricos, igual criterio que ya usa QA/QC
 * para esa columna).
 *
 * ── Clasificación vs filtro — 2 mecanismos independientes, combinables ──
 * La clasificación (getClassificationColors) SOLO decide el color de
 * cada punto — nunca oculta datos. El filtro (FilterState/applyFilter)
 * SOLO decide qué mediciones se incluyen en el resultado — nunca les
 * cambia el color. Se combinan porque son ortogonales: se puede
 * clasificar por `tipo` mientras se filtra por `campaña`, o cualquier
 * otra combinación, sin que un mecanismo sepa nada del otro.
 */

import type { PlanarMeasurement, LinearMeasurement, RenderableLine } from './structuralTypes';

/** Cualquier registro que se pueda clasificar/filtrar — PlanarMeasurement, LinearMeasurement o una línea ya derivada (RenderableLine). */
export type ClassifiableRecord = PlanarMeasurement | LinearMeasurement | RenderableLine;

export const CLASSIFIABLE_FIELD_LABELS: Record<string, string> = {
  tipo: 'Tipo de estructura',
  cinemática: 'Cinemática',
  direccionRake: 'Dirección de rake',
  zona: 'Zona',
  campaña: 'Campaña',
};

/** Valor mostrado cuando el campo elegido no existe en ese registro (p.ej. cinemática en una línea, o zona/campaña en un dato leído de QA/QC). */
export const NO_DATA_LABEL = '(sin dato)';

const CANDIDATE_FIELDS = ['tipo', 'cinemática', 'direccionRake', 'zona', 'campaña'] as const;

/**
 * Prefijo de id para un campo de clasificación derivado de una columna
 * "Otro" (ver JSDoc de archivo) — namespacing para no chocar con un campo
 * fijo real si el usuario nombrara su columna "Otro" igual que uno
 * (p.ej. una columna "Otro" literalmente llamada "tipo").
 */
const OTRO_FIELD_PREFIX = 'otros.';

export function isOtroField(field: string): boolean {
  return field.startsWith(OTRO_FIELD_PREFIX);
}

/** Nombre de columna original (tal como lo tipeó el usuario en QA/QC) a partir de un id de campo `otros.<nombre>`. */
export function otroFieldColumnName(field: string): string {
  return field.slice(OTRO_FIELD_PREFIX.length);
}

/** Etiqueta visible de un campo de clasificación — despacha a CLASSIFIABLE_FIELD_LABELS para los fijos, o al nombre de columna crudo (sin el prefijo `otros.`) para una columna "Otro". Único lugar que debe usarse para mostrar un field id al usuario — evita que `otros.<nombre>` se vea tal cual en la UI. */
export function getClassifiableFieldLabel(field: string): string {
  if (isOtroField(field)) return otroFieldColumnName(field);
  return CLASSIFIABLE_FIELD_LABELS[field] ?? field;
}

/** Paleta cíclica — mismos colores/orden que DEFAULT_PALETTE de src/hidrogeo/sampleColor.ts, reimplementada acá a propósito (ver nota de archivo). */
const PALETTE = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5',
];

/**
 * Lee el valor de `field` en un registro — devuelve NO_DATA_LABEL si el
 * campo no existe en ese registro (p.ej. `cinemática` en una línea, o un
 * campo `otros.<nombre>` en cualquier registro sin esa columna) o está
 * vacío. Un campo `otros.<nombre>` se resuelve contra
 * `record.otros[<nombre>]` (solo PlanarMeasurement tiene `otros` — ver
 * structuralTypes.ts), nunca contra una propiedad de nivel superior.
 */
export function getFieldValue(record: ClassifiableRecord, field: string): string {
  let value: unknown;
  if (isOtroField(field)) {
    const otros = (record as Partial<PlanarMeasurement>).otros;
    value = otros ? otros[otroFieldColumnName(field)] : undefined;
  } else {
    value = (record as unknown as Record<string, unknown>)[field];
  }
  return typeof value === 'string' && value.length > 0 ? value : NO_DATA_LABEL;
}

/**
 * Campos disponibles para clasificar/filtrar, dados los datos REALES
 * (no una lista fija): `tipo` siempre; el resto de CANDIDATE_FIELDS solo
 * si ALGÚN registro del conjunto combinado los trae, MÁS una entrada
 * `otros.<nombre>` por cada columna "Otro" que algún PlanarMeasurement
 * traiga con un valor real — mismo criterio que getClassifiableFields()
 * de sampleColor.ts (no ofrecer en la UI un campo que no va a mostrar
 * ninguna variación real). Las columnas "Otro" solo pueden venir de
 * `planar` (LinearMeasurement no tiene `otros`, ver structuralTypes.ts).
 */
export function getClassifiableFields(planar: PlanarMeasurement[], linear: (LinearMeasurement | RenderableLine)[]): string[] {
  const all: ClassifiableRecord[] = [...planar, ...linear];
  const fixed = CANDIDATE_FIELDS.filter((field) => field === 'tipo' || all.some((r) => getFieldValue(r, field) !== NO_DATA_LABEL));

  const otroColumnNames = new Set<string>();
  for (const p of planar) {
    if (!p.otros) continue;
    for (const [columnName, value] of Object.entries(p.otros)) {
      if (value) otroColumnNames.add(columnName);
    }
  }
  const otroFields = Array.from(otroColumnNames, (columnName) => OTRO_FIELD_PREFIX + columnName);

  return [...fixed, ...otroFields];
}

/**
 * Asigna un color a cada valor DISTINTO de `field`, en orden de primera
 * aparición dentro de `planar` seguido de `linear` — un mismo valor
 * (p.ej. tipo="Falla") recibe el MISMO color sin importar si aparece en
 * un plano o en una línea, para que la leyenda sea coherente entre todos
 * los diagramas del módulo.
 */
export function getClassificationColors(
  planar: PlanarMeasurement[],
  linear: (LinearMeasurement | RenderableLine)[],
  field: string,
): Record<string, string> {
  const colors: Record<string, string> = {};
  let next = 0;
  for (const record of [...planar, ...linear]) {
    const value = getFieldValue(record, field);
    if (!(value in colors)) {
      colors[value] = PALETTE[next % PALETTE.length];
      next++;
    }
  }
  return colors;
}

// ─────────────────────────────────────────────────────────────────
// FILTRO — independiente de la clasificación (ver nota de archivo)
// ─────────────────────────────────────────────────────────────────

/**
 * Estado del filtro: por cada campo, el conjunto de valores PERMITIDOS.
 * Un campo ausente del objeto (o con Set vacío) significa "sin
 * restricción en ese campo" — mismo criterio que pozoFilter/
 * campaignFilter en HydrogeochemistryModule.tsx (Set vacío = todos).
 * Varios campos a la vez se combinan con AND (debe pasar TODOS los
 * filtros activos), lo que permite combinaciones como "campaña=2025 Y
 * tipo=Falla" simultáneamente.
 */
export type FilterState = Record<string, Set<string>>;

/** Un registro pasa el filtro si, para cada campo con restricción activa (Set no vacío), su valor está en ese Set. */
export function passesFilter(record: ClassifiableRecord, filters: FilterState): boolean {
  for (const field of Object.keys(filters)) {
    const allowed = filters[field];
    if (allowed.size === 0) continue; // sin restricción en este campo
    if (!allowed.has(getFieldValue(record, field))) return false;
  }
  return true;
}

/** Aplica el filtro a un array — genérico, sirve tanto para PlanarMeasurement[] como LinearMeasurement[]/RenderableLine[]. */
export function applyFilter<T extends ClassifiableRecord>(records: T[], filters: FilterState): T[] {
  return records.filter((r) => passesFilter(r, filters));
}
