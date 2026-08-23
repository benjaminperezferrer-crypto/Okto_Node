/**
 * src/hidrogeo/hydroTypes.ts
 * Modelo de datos para el módulo de Hidrogeoquímica.
 * Solo tipos — sin lógica ni UI.
 *
 * Referencia algorítmica: WQChartPy (Yang et al. 2022)
 * https://doi.org/10.1016/j.jhydrol.2022.127716
 */

// ─────────────────────────────────────────────────────────────────
// MUESTRA DE AGUA
// ─────────────────────────────────────────────────────────────────

/**
 * Muestra de agua con sus concentraciones iónicas y parámetros físico-químicos.
 *
 * Convención de unidades:
 *   - Iones mayores: mg/L
 *   - pH: escala de Sørensen (adimensional, 0–14)
 *   - TDS: mg/L (total de sólidos disueltos)
 *   - EC: µS/cm (conductividad eléctrica a 25 °C)
 *   - temperature: °C
 */
export interface WaterSample {
  /** Identificador único de la muestra */
  id: string;

  /** Nombre del punto de muestreo o pozo, e.g. "Pozo PW-04", "Manantial Quebrada Honda" */
  name: string;

  /**
   * Fecha de muestreo en formato ISO 8601, e.g. "2026-03-15" (opcional —
   * solo display, ningún diagrama la usa; queda `undefined` si la tabla de
   * QA/QC no mapeó una columna de fecha).
   */
  samplingDate?: string;

  /** Coordenadas geográficas WGS-84 (opcionales) */
  coordinates?: {
    lat: number;
    lon: number;
  };

  /** Altura/cota del punto de muestreo (opcional) — complemento de lat/lon para posición completa. */
  elevation?: number;

  /** Nombre de la campaña o temporada de muestreo, e.g. "Campaña I 2026" */
  campaign?: string;

  // ── Cationes mayores (mg/L) ──────────────────────────────────
  /** Calcio */
  Ca: number;
  /** Magnesio */
  Mg: number;
  /** Sodio */
  Na: number;
  /** Potasio */
  K: number;

  // ── Aniones mayores (mg/L) ──────────────────────────────────
  /** Cloruro */
  Cl: number;
  /** Sulfato */
  SO4: number;
  /** Bicarbonato */
  HCO3: number;
  /** Carbonato (suele ser 0 en aguas con pH < 8.3) */
  CO3: number;
  /** Nitrato (opcional — no siempre analizado) */
  NO3?: number;

  // ── Parámetros físico-químicos ───────────────────────────────
  /**
   * pH (opcional — solo lo usa el diagrama Eh-pH, que omite las muestras sin
   * pH, igual que hace con las que no traen Eh). Queda `undefined` si la
   * tabla de QA/QC no mapeó la columna de pH. Los campos MÍNIMOS de una
   * muestra usable son los 7 iones mayores (Ca/Mg/Na/K/Cl/SO4/HCO3), no pH.
   */
  pH?: number;
  /** Total de sólidos disueltos (mg/L, opcional — ningún diagrama lo usa hoy, solo display). */
  TDS?: number;
  /** Conductividad eléctrica (µS/cm, opcional — solo el diagrama Cl vs EC, que ya omite las muestras sin EC finito). */
  EC?: number;
  /** Temperatura del agua en el punto de muestreo (°C, opcional) */
  temperature?: number;
  /**
   * Potencial redox / ORP (mV, opcional) — no todos los equipos de campo
   * lo miden, así que las muestras existentes/importadas sin esta columna
   * siguen siendo válidas (queda `undefined`, no se asume 0 ni ningún otro
   * valor). Alimenta el diagrama Eh-pH (Merkel y Planer-Friedrich, Etapa
   * posterior) — ese diagrama debe omitir o marcar aparte las muestras sin
   * Eh, no inventar un valor.
   */
  Eh?: number;

  // ── Campos adicionales de laboratorio (opcionales, aditivos) ──────────
  /** Salinidad (unidad libre — sin conversión especial). Solo display por ahora. */
  salinity?: number;
  /** Densidad (unidad libre — sin conversión especial). Solo display por ahora. */
  density?: number;
  /**
   * Suma de cationes en meq/L, ingresada/importada DIRECTO del reporte de
   * laboratorio (NO la calcula la app a partir de Ca/Mg/Na/K — para
   * verificación de balance por parte del usuario). Ver calculateIonBalance()
   * si se necesita el cálculo derivado (independiente de este campo).
   */
  cationsTotal?: number;
  /** Suma de aniones en meq/L, ingresada/importada directo del laboratorio (mismo criterio que cationsTotal). */
  anionsTotal?: number;
  /**
   * Elementos traza disueltos (As, Fe, Mn, …): nombre del elemento → valor
   * como texto (preserva límites de detección "<0.5"). Mismo patrón repetible
   * que el campo "Elemento" de la tabla Assay de QA/QC. Ausente/vacío si no se
   * mapeó ninguno.
   */
  elements?: Record<string, string>;
  /** Columnas personalizadas repetibles ('Otro' de QA/QC) → valor como texto. Ausente/vacío si no se mapeó ninguna. */
  otros?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────
// BALANCE IÓNICO
// ─────────────────────────────────────────────────────────────────

/**
 * Resultado del error de balance iónico (Charge Balance Error, CBE).
 *
 * Fórmula:  CBE = (Σcationes − Σaniones) / (Σcationes + Σaniones) × 100
 *
 * Umbrales (Freeze & Cherry 1979; Appelo & Postma 2005):
 *   |CBE| < 5 %           → 'ok'      (análisis aceptable)
 *   5 % ≤ |CBE| < 10 %   → 'warning' (revisar procedimiento analítico)
 *   |CBE| ≥ 10 %          → 'error'   (análisis no confiable)
 */
export interface IonBalanceResult {
  /**
   * Error de balance iónico en %.
   * Positivo → exceso de cationes; negativo → exceso de aniones.
   */
  ionBalance: number;
  /** Suma de aniones en meq/L (Cl + SO4 + HCO3 + CO3 + NO3) */
  anionSum: number;
  /** Suma de cationes en meq/L (Ca + Mg + Na + K) */
  cationSum: number;
  quality: 'ok' | 'warning' | 'error';
}

// ─────────────────────────────────────────────────────────────────
// TIPOS AUXILIARES — SALIDAS DEL MOTOR DE CÁLCULO
// ─────────────────────────────────────────────────────────────────

/**
 * Concentraciones de los iones mayores convertidas a meq/L.
 * Resultado intermedio de `calculatePercentages`; también entrada
 * directa para el diagrama de Stiff (que usa valores absolutos, no %).
 */
export interface IonMeqL {
  Ca: number;
  Mg: number;
  Na: number;
  K: number;
  Cl: number;
  SO4: number;
  HCO3: number;
  CO3: number;
  NO3: number;
}

/**
 * Porcentajes iónicos en meq/L relativos al total de su grupo.
 * Alimenta directamente los diagramas de Piper y Schoeller-Berkaloff.
 *
 * Nota para Piper estándar:
 *   - Triángulo cationes:  Ca%, Mg%, (Na+K)%
 *   - Triángulo aniones:   Cl%, SO4%, (HCO3+CO3)%
 *   Los componentes de diagrama combinan Na+K y HCO3+CO3
 *   a partir de los valores individuales aquí devueltos.
 */
export interface IonPercentages {
  /** Concentraciones en meq/L para cada ion */
  meqL: IonMeqL;

  /** % de cada catión respecto al total de cationes en meq/L */
  cationPct: {
    Ca: number;
    Mg: number;
    Na: number;
    K: number;
  };

  /** % de cada anión respecto al total de aniones en meq/L */
  anionPct: {
    Cl: number;
    SO4: number;
    HCO3: number;
    CO3: number;
    NO3: number;
  };

  /** Σcationes en meq/L (útil para normalización en Stiff) */
  totalCationsMeqL: number;
  /** Σaniones en meq/L (útil para normalización en Stiff) */
  totalAnionsMeqL: number;
}
