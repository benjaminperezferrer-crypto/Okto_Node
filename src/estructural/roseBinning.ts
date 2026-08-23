/**
 * src/estructural/roseBinning.ts
 * Etapa 7 — binning angular puro para el diagrama de rosetas
 * (RoseDiagram.tsx). Separado del componente React para poder testearlo
 * con el mismo rigor que el resto del módulo (función pura, sin SVG).
 *
 * ── Decisión: simetría 180° SOLO para datos de planos, NUNCA para
 *    líneas ────────────────────────────────────────────────────────
 * El azimut (dirección de manteo) de un PLANO tiene ambigüedad de 180°
 * en la práctica de terreno: el mismo plano se puede anotar mirándolo
 * "desde cualquiera de sus 2 lados" según por dónde se paró el geólogo,
 * y de hecho ya existe esa ambigüedad de raíz en rumbo↔dirección de
 * manteo (strikeDipToDipDirectionDip, Etapa 1) — un rumbo por sí solo no
 * distingue sus 2 extremos. El diagrama de rosetas CLÁSICO para datos
 * planares (usado en literatura estructural para fracturas/diaclasas)
 * refleja esto contando cada medición en AMBOS extremos (v y v+180°),
 * dando el patrón simétrico característico ("bowtie") — es la
 * convención estándar, no una elección arbitraria de este archivo.
 *
 * Una LÍNEA (trend/plunge — eje de pliegue, estría, lineación mineral)
 * NO tiene esa ambigüedad: su trend apunta en un sentido específico y
 * con significado geológico propio (p.ej. sentido de transporte, de
 * flujo) — duplicarla a trend+180° destruiría esa información,
 * mezclando 2 sentidos opuestos como si fueran el mismo dato. Por eso
 * `symmetric` debe ser `false` para trends de líneas.
 *
 * `buildRoseBins()`/`buildGroupedRoseBins()` son agnósticas de cuál caso
 * aplica — el llamador (RoseDiagram.tsx) decide `symmetric` según el
 * tipo de dato, no esta función.
 *
 * ── buildGroupedRoseBins (Etapa 9) ──────────────────────────────────
 * Generalización de buildRoseBins() que además separa el conteo de cada
 * sector POR GRUPO (p.ej. por tipo de estructura, para pétalos
 * apilados/coloreados por clasificación en RoseDiagram.tsx — ver
 * classification.ts). `buildRoseBins()` se reimplementó como un caso
 * particular de esta (un solo grupo interno) para no duplicar la lógica
 * de binning — su firma y comportamiento público NO cambiaron (mismos
 * tests de la Etapa 7 siguen pasando tal cual).
 */

import { normalizeAzimuth } from './structuralTypes';

export interface RoseBin {
  /** Ángulo de inicio del sector, en grados [0,360). */
  a1: number;
  /** Ángulo de fin del sector, en grados (a1 + tamaño de bin; puede llegar a 360 exacto en el último bin). */
  a2: number;
  count: number;
}

export interface RoseBinGroup {
  a1: number;
  a2: number;
  total: number;
  /** Conteo por grupo dentro de este sector, en orden de primera aparición del grupo (no alfabético). */
  groups: { group: string; count: number }[];
}

const SINGLE_GROUP = '_all';

/** Cantidad de sectores para un `binSizeDeg` dado — misma fórmula que usa buildGroupedRoseBins() internamente, extraída para que cualquier consumidor externo (p.ej. el resaltado cruzado de StereonetPlanes.tsx) calcule el MISMO número de bins sin duplicar la fórmula. */
export function binCountFor(binSizeDeg: number): number {
  return Math.max(1, Math.round(360 / binSizeDeg));
}

/**
 * Índice de sector [0, binCountFor(binSizeDeg)) al que pertenece un
 * ángulo — MISMA fórmula que usa buildGroupedRoseBins() internamente
 * (`Math.floor(ángulo normalizado / tamaño de sector)`, recortada al
 * último bin para que 360° exacto no se salga del arreglo). Exportada
 * para el resaltado cruzado (paquete de mejoras de Estructural):
 * StereonetPlanes.tsx necesita saber a qué pétalo de RoseDiagram.tsx
 * pertenece un dato individual, sin reimplementar el binning.
 */
export function binIndexOf(deg: number, binSizeDeg: number): number {
  const nBins = binCountFor(binSizeDeg);
  const size = 360 / nBins;
  return Math.min(nBins - 1, Math.floor(normalizeAzimuth(deg) / size));
}

/**
 * Como buildRoseBins(), pero cada valor trae además un `group` (p.ej. el
 * valor del campo de clasificación activo) — cada sector queda separado
 * en conteos por grupo, además del total. La regla de `symmetric`
 * (duplicar a v+180°) se aplica IGUAL por grupo: si un valor se
 * duplica, su duplicado cuenta para el mismo grupo, no se mezcla con
 * otros.
 */
export function buildGroupedRoseBins(
  items: { angle: number; group: string }[],
  binSizeDeg: number,
  symmetric: boolean,
): RoseBinGroup[] {
  const nBins = binCountFor(binSizeDeg);
  const size = 360 / nBins;
  const binIndex = (deg: number) => binIndexOf(deg, binSizeDeg);

  const perBin: Map<string, number>[] = Array.from({ length: nBins }, () => new Map());
  const addTo = (idx: number, group: string) => {
    const m = perBin[idx];
    m.set(group, (m.get(group) ?? 0) + 1);
  };

  for (const { angle, group } of items) {
    addTo(binIndex(angle), group);
    if (symmetric) addTo(binIndex(angle + 180), group);
  }

  return perBin.map((m, i) => {
    const groups = Array.from(m.entries()).map(([group, count]) => ({ group, count }));
    const total = groups.reduce((s, g) => s + g.count, 0);
    return { a1: i * size, a2: (i + 1) * size, total, groups };
  });
}

/**
 * Agrupa `values` (azimuts/trends en grados, cualquier rango — se
 * normalizan a [0,360) antes de binnear) en `Math.round(360/binSizeDeg)`
 * sectores angulares de tamaño uniforme, empezando en 0° (Norte).
 *
 * Si `symmetric` es true, cada valor se cuenta DOS veces: una en su
 * propio sector y otra en el sector opuesto (v+180°) — ver la
 * justificación geológica en el encabezado del archivo. Si es false,
 * cada valor se cuenta una sola vez.
 *
 * @param binSizeDeg tamaño de cada sector en grados (p.ej. 10 → 36 bins). Debe ser >0 y ≤360.
 */
export function buildRoseBins(values: number[], binSizeDeg: number, symmetric: boolean): RoseBin[] {
  const grouped = buildGroupedRoseBins(
    values.map((angle) => ({ angle, group: SINGLE_GROUP })),
    binSizeDeg,
    symmetric,
  );
  return grouped.map((b) => ({ a1: b.a1, a2: b.a2, count: b.total }));
}
