/**
 * src/hidrogeo/ionicRatios.ts
 * Etapa 7 — lógica pura (sin React) para el diagrama de relaciones
 * iónicas: qué campo puede ir en un eje (un ion individual, en mg/L o
 * meq/L; o una relación numerador/denominador entre 2 iones) y cómo se
 * calcula su valor para una muestra dada.
 *
 * Decisión de diseño (no especificada en el pedido, documentada acá):
 * las RELACIONES (numerador/denominador) se calculan siempre en meq/L,
 * nunca en mg/L — un ratio de mg/L de dos iones distintos no es
 * químicamente comparable entre iones de peso molecular/valencia
 * distinta (a diferencia de un ion individual, donde mg/L sigue siendo
 * una unidad válida y a veces preferida). meq/L es la convención estándar
 * para relaciones iónicas (Na/Cl, Ca/Mg, etc.) en hidrogeoquímica, y es
 * consistente con lo que ya usa el resto de la app (calculatePercentages
 * en hydroCalculations.ts). El selector de unidad del pedido (mg/L o
 * meq/L) solo aplica al modo "ion individual".
 */

import type { WaterSample } from './hydroTypes';
import { ION_DATA, mgLToMeqL } from './hydroCalculations';

// ─────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────

export type IonKey = keyof typeof ION_DATA;

export const ION_KEYS: IonKey[] = ['Ca', 'Mg', 'Na', 'K', 'Cl', 'SO4', 'HCO3', 'CO3', 'NO3'];

/** Subíndices con notación química real, para las etiquetas de eje/selector. */
export const ION_LABELS: Record<IonKey, string> = {
  Ca: 'Ca', Mg: 'Mg', Na: 'Na', K: 'K',
  Cl: 'Cl', SO4: 'SO₄', HCO3: 'HCO₃', CO3: 'CO₃', NO3: 'NO₃',
};

export type IonUnit = 'mg/L' | 'meq/L';

export interface SingleIonAxisField {
  kind: 'ion';
  ion: IonKey;
  unit: IonUnit;
}

export interface RatioAxisField {
  kind: 'ratio';
  numerator: IonKey;
  denominator: IonKey;
}

export type AxisField = SingleIonAxisField | RatioAxisField;

// ─────────────────────────────────────────────────────────────────
// VALOR DE UN CAMPO DE EJE PARA UNA MUESTRA
// ─────────────────────────────────────────────────────────────────

/** mg/L de `ion` en `sample`, o null si no está disponible (NO3 es opcional — el resto son requeridos por WaterSample, pero se valida igual por robustez). */
function ionMgL(sample: WaterSample, ion: IonKey): number | null {
  const v = sample[ion] as number | undefined;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Valor de un ion individual en la unidad pedida. null si el ion no está
 * disponible en la muestra (NO3 ausente) — nunca se asume 0, a diferencia
 * de toMeqL() interno de hydroCalculations.ts (que sí asume 0 para NO3
 * porque ahí alimenta un balance iónico donde omitir NO3 es razonable;
 * acá el usuario pidió ESE ion explícitamente, así que su ausencia
 * excluye la muestra en vez de graficar un valor inventado).
 */
function ionValue(sample: WaterSample, ion: IonKey, unit: IonUnit): number | null {
  const mgL = ionMgL(sample, ion);
  if (mgL == null) return null;
  if (unit === 'mg/L') return mgL;
  const { molarWeight, valence } = ION_DATA[ion];
  return mgLToMeqL(mgL, molarWeight, valence);
}

/**
 * Valor de un AxisField (ion o relación) para una muestra — null si no se
 * puede calcular: ion no disponible, o relación con denominador ausente
 * o igual a 0 (división por cero). El llamador (IonRatioDiagram.tsx)
 * excluye del scatter cualquier muestra con null en cualquiera de los 2 ejes.
 */
export function axisFieldValue(sample: WaterSample, field: AxisField): number | null {
  if (field.kind === 'ion') {
    return ionValue(sample, field.ion, field.unit);
  }
  const num = ionValue(sample, field.numerator, 'meq/L');
  const den = ionValue(sample, field.denominator, 'meq/L');
  if (num == null || den == null || den === 0) return null;
  return num / den;
}

/** Etiqueta de eje legible — "Na [meq/L]" para un ion, "Na/Cl (meq/L)" para una relación. */
export function axisFieldLabel(field: AxisField): string {
  if (field.kind === 'ion') {
    return `${ION_LABELS[field.ion]} [${field.unit}]`;
  }
  return `${ION_LABELS[field.numerator]}/${ION_LABELS[field.denominator]} (meq/L)`;
}

// ─────────────────────────────────────────────────────────────────
// CAMPOS POR DEFECTO — coinciden con el ejemplo de prueba pedido
// ─────────────────────────────────────────────────────────────────

export const DEFAULT_X_FIELD: AxisField = { kind: 'ratio', numerator: 'Na', denominator: 'Cl' };
export const DEFAULT_Y_FIELD: AxisField = { kind: 'ion', ion: 'Ca', unit: 'meq/L' };
