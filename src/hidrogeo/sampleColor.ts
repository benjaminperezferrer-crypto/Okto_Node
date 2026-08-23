/**
 * src/hidrogeo/sampleColor.ts
 * Esquema de color por grupo compartido entre todos los diagramas del
 * módulo, para que pinten la misma muestra con el mismo color cuando
 * reciben el mismo array de WaterSample[].
 *
 * Clasificación por campo arbitrario (Etapa 3): mismo patrón conceptual
 * que getCategorizableFields()/getCategoryValues() de GIS
 * (gisLayerRender.ts, Etapa 12 de ese módulo) — acá el tipo de entrada es
 * WaterSample en vez de GisLayer, así que no hace falta filtrar primero
 * por un "type" de capa; el switch de getFieldValue() ES el equivalente
 * directo. `getClassifiableFields()` deliberadamente NO incluye campos
 * numéricos continuos (pH, Eh, TDS, EC, cualquier ion en mg/L) — agrupar
 * por un valor que casi nunca se repite entre muestras produciría un color
 * distinto por muestra, que no es "clasificar", es no-clasificar.
 */

import type { WaterSample } from './hydroTypes';

/** Paleta por defecto para colorBy, ciclada si hay más grupos que colores. */
export const DEFAULT_PALETTE = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5',
];

/**
 * Asigna un color de DEFAULT_PALETTE a cada etiqueta de grupo distinta,
 * en orden de primera aparición dentro de `samples`. Devuelve un Map
 * preservando ese orden, reutilizado tal cual para pintar los puntos y
 * para la leyenda.
 */
export function buildColorMap(
  samples: WaterSample[], groupOf: (s: WaterSample) => string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of samples) {
    const key = groupOf(s);
    if (!map.has(key)) {
      map.set(key, DEFAULT_PALETTE[map.size % DEFAULT_PALETTE.length]);
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────
// CLASIFICACIÓN POR CAMPO ARBITRARIO (Etapa 3)
// ─────────────────────────────────────────────────────────────────

/**
 * Campos por los que hoy se puede clasificar — solo 'name' (pozo, siempre
 * disponible: toda muestra tiene nombre) y 'campaign' (solo si AL MENOS
 * una muestra del conjunto la trae; no tiene sentido ofrecer un campo que
 * ninguna muestra completó). `id` queda afuera a propósito: es único por
 * muestra, así que "clasificar" por id equivaldría a un color distinto
 * por punto — mismo motivo que excluye los campos numéricos continuos.
 */
export function getClassifiableFields(samples: WaterSample[]): string[] {
  const fields = ['name'];
  if (samples.some((s) => !!s.campaign)) fields.push('campaign');
  return fields;
}

/** Etiqueta legible para mostrar en el selector — mismo criterio "Pozo"/"Campaña" que ya usaba el selector fijo. */
export const CLASSIFIABLE_FIELD_LABELS: Record<string, string> = {
  name: 'Pozo',
  campaign: 'Campaña',
};

/**
 * Valor de clasificación de `sample` para `field` — la contraparte directa
 * de getCategoryValues() en GIS, pero por MUESTRA en vez de por lista
 * (los llamadores ya iteran samples uno por uno, vía groupOf). Si `field`
 * no es uno de los campos conocidos (o la muestra no trae `campaign`),
 * cae a `sample.name` — mismo fallback que ya usaba el groupOf por
 * defecto en cada diagrama (`colorBy ?? (s => s.name)`).
 */
export function getFieldValue(sample: WaterSample, field: string): string {
  switch (field) {
    case 'campaign':
      return sample.campaign ?? sample.name;
    case 'name':
    default:
      return sample.name;
  }
}

/**
 * Un color por cada valor único de `field` entre `samples` — misma
 * asignación que buildColorMap(), pero como Record (no Map) porque acá el
 * consumidor típico es estado de React/JSON serializable, no otro
 * builder interno que necesite iterar en orden.
 */
export function getClassificationColors(samples: WaterSample[], field: string): Record<string, string> {
  return Object.fromEntries(buildColorMap(samples, (s) => getFieldValue(s, field)));
}
