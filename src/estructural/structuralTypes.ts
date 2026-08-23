/**
 * src/estructural/structuralTypes.ts
 * Etapa 1 — modelo de datos del módulo Análisis Estructural + funciones de
 * conversión geométrica puras (sin proyección estereográfica, sin UI, sin
 * importación — eso queda para etapas posteriores).
 *
 * Ajustado a la estructura REAL de la tabla "Estructuras" de QA/QC
 * (DB_FIELDS['Datos estructurales'] en index.html, línea 1425 —
 * confirmado, no inventado):
 *   ID, Este, Norte, Cota, Tipo, Azimut, Dip, Rake, Dirección rake,
 *   Cinemática, Observaciones, + columnas "Otro" repetibles.
 *
 * Dos hallazgos de esa investigación que fijan el diseño de acá:
 *   - "Azimut" en QA/QC es DIRECCIÓN DE MANTEO, no rumbo — confirmado por
 *     la fórmula del polo en buildPoleSVG() (index.html): `trend =
 *     azimut+180°`, que solo es geológicamente correcta si `azimut` ya es
 *     dirección de manteo (el polo de un plano es siempre opuesto a su
 *     dirección de manteo). Por eso PlanarMeasurement.azimut se llama así
 *     y se documenta como dirección de manteo, no rumbo.
 *   - "Tipo" y "Cinemática" son texto libre en QA/QC (no hay una lista de
 *     valores fija en DB_FIELDS) — se copia ese mismo criterio acá
 *     (`tipo: string`, `cinemática?: string`), no se inventa un enum.
 */

// ─────────────────────────────────────────────────────────────────
// TIPOS DE DATO
// ─────────────────────────────────────────────────────────────────

/**
 * Una medición planar (plano estructural: falla, fractura, foliación,
 * estratificación, etc.) — el equivalente estructural de una fila de la
 * tabla "Datos estructurales" de QA/QC. `zona`/`campaña` son 2 campos
 * PROPIOS del módulo que QA/QC no tiene — quedan SIEMPRE `undefined`
 * desde la eliminación de la importación directa por CSV/Excel (única
 * fuente que alguna vez los completaba); se dejan en el tipo por si algún
 * día QA/QC agrega columnas equivalentes, pero hoy son inalcanzables.
 *
 * `sourceFileId`/`sourceFileName`: identifican el archivo QA/QC de origen
 * de esta medición (Etapa 2 del rediseño a pestañas múltiples — selector
 * de archivo). Obligatorios (no opcionales): desde la eliminación de la
 * importación directa, TODA medición viene de QA/QC, nunca de otra
 * fuente — ver mapQaqcStructureToPlanarMeasurement() en qaqcBridge.ts,
 * el único lugar que construye un PlanarMeasurement.
 */
export interface PlanarMeasurement {
  id: string;

  sourceFileId: number;
  sourceFileName: string;

  /** Coordenadas reales — opcionales (igual que en QA/QC, no todas las filas las traen). */
  este?: number;
  norte?: number;
  cota?: number;

  /** Texto libre, sin enum — mismo criterio que DB_FIELDS['Datos estructurales'] en QA/QC (Tipo no tiene lista fija de valores). */
  tipo: string;
  /** Texto libre, sin enum — mismo criterio que "Cinemática" en QA/QC (normal/inversa/dextral/sinestral/etc., como venga en el dato). */
  cinemática?: string;

  /** Dirección de manteo (0-360°, azimut desde el Norte) — NO rumbo. Ver nota de archivo. */
  azimut: number;
  /** Ángulo de manteo (0-90°). */
  dip: number;

  /** Rake/pitch de una lineación sobre este plano (0-180°), medida desde el extremo de rumbo indicado por `direccionRake`. Ambos opcionales — no todo plano tiene una lineación asociada. */
  rake?: number;
  /** Texto libre (igual que en QA/QC) que indica desde qué extremo del rumbo se midió `rake` — ver JSDoc de planeRakeToTrendPlunge() para cómo se interpreta en el cálculo (ahí se documenta la limitación: la función pura espera un azimut numérico, no este texto libre). */
  direccionRake?: string;

  observaciones?: string;
  /** Columnas "Otro" repetibles de QA/QC — nombre de columna → valor, sin estructura fija. */
  otros?: Record<string, string>;

  /**
   * Campos PROPIOS del módulo, ausentes en la tabla "Estructuras" de
   * QA/QC — solo se completan cuando el dato se importa directamente por
   * CSV al módulo (no cuando se lee desde QA/QC, que no los tiene).
   */
  zona?: string;
  campaña?: string;
}

/**
 * Una medición lineal INDEPENDIENTE de un plano (una lineación medida
 * directamente en el campo por su trend/plunge — p.ej. un eje de
 * pliegue, una estría medida con brújula-clinómetro sin referenciarla a
 * un plano) — a diferencia de una lineación derivada de un rake sobre un
 * PlanarMeasurement (ver planeRakeToTrendPlunge() más abajo), que no
 * necesita este tipo porque ya es un plano con su propio rake.
 *
 * Solo se completa vía importación directa por CSV al módulo — QA/QC no
 * tiene una tabla de datos lineales independiente, así que esto no tiene
 * equivalente ahí.
 */
export interface LinearMeasurement {
  id: string;
  /** Texto libre, sin enum — mismo criterio que PlanarMeasurement.tipo (p.ej. "eje de pliegue", "estría", "lineación mineral"). */
  tipo: string;
  zona?: string;
  campaña?: string;
  /** Azimut de la dirección de buzamiento de la línea (0-360°, desde el Norte). */
  trend: number;
  /** Ángulo de inmersión de la línea (0-90°, hacia abajo desde la horizontal). */
  plunge: number;
}

// ─────────────────────────────────────────────────────────────────
// HELPERS INTERNOS (no exportados — geometría vectorial de apoyo)
// ─────────────────────────────────────────────────────────────────

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Azimut normalizado a [0, 360) — nunca negativo, nunca ≥360. Exportado
 * porque stereonet.ts (Etapa 2) también la necesita para normalizar
 * trend/dirección de manteo antes de proyectar — se reutiliza esta misma
 * implementación en vez de duplicarla.
 */
export function normalizeAzimuth(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Distancia angular MÍNIMA entre 2 azimuts (0-180°) — usada para decidir
 * a qué extremo del rumbo está más cerca un azimut de referencia dado
 * (ver planeRakeToTrendPlunge()).
 */
function angularDistance(a: number, b: number): number {
  const diff = Math.abs(normalizeAzimuth(a) - normalizeAzimuth(b)) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Convención vectorial Norte-Este-Abajo (x=Este, y=Norte, z=Abajo) — LA
 * MISMA que ya usa buildPoleSVG() en index.html para el cálculo del polo
 * medio (ahí: `sx += cos(pl)·sin(tr)`, `sy += cos(pl)·cos(tr)`, `sz +=
 * sin(pl)`, trend recuperado con `atan2(sx,sy)`). Se reutiliza acá tal
 * cual — no se inventa una convención nueva — para que cualquier
 * matemática futura que cruce ambos módulos (o compare resultados)
 * hable el mismo idioma.
 */
function trendPlungeToVector(trendDeg: number, plungeDeg: number): { x: number; y: number; z: number } {
  const tr = trendDeg * DEG2RAD;
  const pl = plungeDeg * DEG2RAD;
  return {
    x: Math.cos(pl) * Math.sin(tr), // Este
    y: Math.cos(pl) * Math.cos(tr), // Norte
    z: Math.sin(pl),                // Abajo
  };
}

/**
 * Inversa de trendPlungeToVector(). Si el vector apunta "hacia arriba"
 * (z<0 — puede pasar como resultado intermedio de una combinación
 * lineal, ver planeRakeToTrendPlunge()), se usa su antípoda (mismo eje,
 * sentido contrario) para devolver siempre un plunge ≥0 — convención
 * geológica estándar: una línea se reporta por la dirección en la que
 * se hunde, nunca la que sube.
 */
function vectorToTrendPlunge(v: { x: number; y: number; z: number }): { trend: number; plunge: number } {
  const s = v.z < 0 ? -1 : 1; // antípoda si apunta hacia arriba
  const x = v.x * s, y = v.y * s, z = v.z * s;
  const trend = normalizeAzimuth(Math.atan2(x, y) * RAD2DEG);
  const plunge = Math.asin(Math.max(-1, Math.min(1, z))) * RAD2DEG;
  return { trend, plunge };
}

// ─────────────────────────────────────────────────────────────────
// CONVERSIONES — RUMBO ↔ DIRECCIÓN DE MANTEO
// ─────────────────────────────────────────────────────────────────

/**
 * Convención regla de la mano derecha (RHR) — la misma que usan
 * Allmendinger/FaultKin/Stereonet: la dirección de manteo es SIEMPRE
 * rumbo+90° (nunca rumbo-90°). Esto resuelve la ambigüedad de 180° que
 * tiene el rumbo por sí solo (una línea de rumbo no distingue sus 2
 * extremos) — al fijar dirección de manteo = rumbo+90°, el rumbo queda
 * unívocamente determinado por dirección de manteo-90°.
 *
 * DECISIÓN NO CONFIRMADA: no tengo el plan original con la convención
 * que se haya definido ahí — si se había acordado la convención opuesta
 * (dirección de manteo = rumbo-90°), avisar para invertir el signo acá
 * (es un cambio de una línea, no afecta nada más de este archivo).
 */
export function strikeDipToDipDirectionDip(strike: number, dip: number): { dipDirection: number; dip: number } {
  return { dipDirection: normalizeAzimuth(strike + 90), dip };
}

/** Inversa exacta de strikeDipToDipDirectionDip() — misma convención RHR. */
export function dipDirectionDipToStrikeDip(dipDirection: number, dip: number): { strike: number; dip: number } {
  return { strike: normalizeAzimuth(dipDirection - 90), dip };
}

// ─────────────────────────────────────────────────────────────────
// CONVERSIÓN — RAKE SOBRE UN PLANO → TREND/PLUNGE INDEPENDIENTE
// ─────────────────────────────────────────────────────────────────

/**
 * Convierte una lineación medida por su rake sobre un plano (dirección
 * de manteo + dip + rake + desde qué extremo del rumbo se midió) a su
 * trend/plunge independiente — para poder graficarla en el estereograma
 * exactamente igual que cualquier LinearMeasurement suelta.
 *
 * ── Derivación (verificada a mano antes de escribir el test, como
 *    pediste) ──────────────────────────────────────────────────────
 * El rumbo (horizontal, plunge=0) y la línea de máximo manteo (trend=
 * dirección de manteo, plunge=dip) son 2 vectores unitarios DENTRO del
 * plano, y son ORTOGONALES entre sí (producto punto = cos(dip)·cos(90°)
 * = 0, porque dirección de manteo − rumbo = 90° exacto por construcción
 * — ver strikeDipToDipDirectionDip). Dos vectores unitarios ortogonales
 * dentro de un plano parametrizan CUALQUIER línea de ese plano por un
 * solo ángulo α (el rake), con combinación lineal simple:
 *
 *     v(α) = cos(α)·rumboVec + sin(α)·manteoVec
 *
 * Por construcción v(α) siempre da un vector unitario (cos²+sin²=1, y
 * son ortogonales) — no hace falta renormalizar.
 *
 * α=0°   → v = rumboVec         (a lo largo del rumbo, horizontal)
 * α=90°  → v = manteoVec        (la línea de máximo manteo del plano)
 * α=180° → v = -rumboVec        (el otro extremo del rumbo)
 *
 * ✓ CASO VERIFICADO A MANO (el que pediste explícitamente): con
 *   rake=90°, v(90°)=manteoVec exacto, sin importar `rakeDirection` —
 *   trend=dirManteo, plunge=dip, SIEMPRE coincide con la dirección de
 *   máximo manteo del plano. Confirmado también en el test.
 *
 * `rakeDirection` (azimut numérico, no el texto libre de
 * PlanarMeasurement.direccionRake — ver nota de diseño abajo) indica
 * desde qué extremo del rumbo se midió el rake EN EL CAMPO: el extremo
 * "canónico" de esta función es rumbo = dirManteo−90° (α=0 ahí). Si
 * `rakeDirection` está más cerca del OTRO extremo (dirManteo+90°), el
 * rake se reinterpreta como (180−rake) antes de aplicar la fórmula —
 * así el resultado es el mismo sin importar desde qué extremo lo haya
 * anotado el geólogo en terreno.
 *
 * ── Nota de diseño: por qué `rakeDirection` es un número, no el string
 *    libre de la tabla ────────────────────────────────────────────
 * PlanarMeasurement.direccionRake es texto libre (copiando el criterio
 * de QA/QC, que no define una lista fija de valores — puede venir "NE",
 * "045", "hacia el techo", etc.). Interpretar ESE texto libre y
 * convertirlo a un azimut es trabajo de la capa de importación/mapeo
 * (Etapa aparte, explícitamente fuera de esta — "no implementes...
 * importación todavía"). Esta función pura recibe directamente el
 * azimut ya resuelto, para quedar simple, determinística y testeable
 * sin parsear texto ambiguo.
 *
 * @param dipDirection dirección de manteo del plano (0-360°)
 * @param dip manteo del plano (0-90°)
 * @param rake rake de la lineación sobre el plano (0-180°)
 * @param rakeDirection azimut (0-360°) del extremo del rumbo desde el que se midió `rake`
 */
export function planeRakeToTrendPlunge(
  dipDirection: number,
  dip: number,
  rake: number,
  rakeDirection: number,
): { trend: number; plunge: number } {
  const canonicalStrikeEnd = normalizeAzimuth(dipDirection - 90);
  const oppositeStrikeEnd  = normalizeAzimuth(dipDirection + 90);

  const effectiveRake =
    angularDistance(rakeDirection, canonicalStrikeEnd) <= angularDistance(rakeDirection, oppositeStrikeEnd)
      ? rake
      : 180 - rake;

  const strikeVec = trendPlungeToVector(canonicalStrikeEnd, 0);
  const dipVec    = trendPlungeToVector(dipDirection, dip);

  const a = effectiveRake * DEG2RAD;
  const cosA = Math.cos(a), sinA = Math.sin(a);
  const v = {
    x: cosA * strikeVec.x + sinA * dipVec.x,
    y: cosA * strikeVec.y + sinA * dipVec.y,
    z: cosA * strikeVec.z + sinA * dipVec.z,
  };

  return vectorToTrendPlunge(v);
}

// ─────────────────────────────────────────────────────────────────
// LÍNEAS DERIVADAS DE UN PLANO CON RAKE — helper compartido
// ─────────────────────────────────────────────────────────────────

/**
 * Una línea ya resuelta a trend/plunge, sin importar si viene de un
 * LinearMeasurement directo ("linear") o derivada de un PlanarMeasurement
 * con rake ("rake") — unifica el render en cualquier vista que dibuje
 * datos lineales (StereonetPlanes.tsx, RoseDiagram.tsx).
 *
 * `zona`/`campaña` se agregaron en la Etapa 9 (clasificación/filtro):
 * una línea derivada de un PlanarMeasurement hereda la zona/campaña de
 * ESE plano (propagadas en deriveRakeLines(), abajo), para que un filtro
 * por campaña aplicado al módulo excluya/incluya también las líneas
 * derivadas de planos de esa campaña, no solo los planos/polos.
 */
export interface RenderableLine {
  id: string;
  tipo: string;
  cinemática?: string;
  trend: number;
  plunge: number;
  origin: 'linear' | 'rake';
  zona?: string;
  campaña?: string;
}

/**
 * Deriva las líneas del origen "rake": PlanarMeasurement con `rake`
 * definido, vía planeRakeToTrendPlunge() — Etapa 6 de Análisis
 * Estructural.
 *
 * LIMITACIÓN CONOCIDA (documentada desde el diseño de PlanarMeasurement
 * más arriba): `direccionRake` es texto LIBRE, mismo criterio que QA/QC
 * (puede venir "NE", "hacia el techo", "045", etc.), pero
 * planeRakeToTrendPlunge() necesita un azimut NUMÉRICO — interpretar
 * texto libre arbitrario es trabajo de la capa de importación/mapeo, no
 * de esta función pura. Acá se resuelve de forma conservadora: si
 * `direccionRake` es un string que representa directamente un número
 * (`Number(direccionRake)` da un valor finito — cubre el caso común de
 * un geólogo anotando el azimut tal cual, p.ej. "045"), se usa ese
 * valor; si no (texto genuinamente no numérico), esa medición se OMITE
 * del resultado sin romper el resto — no se inventa un parseo de texto
 * libre.
 */
export function deriveRakeLines(measurements: PlanarMeasurement[]): RenderableLine[] {
  const result: RenderableLine[] = [];
  for (const m of measurements) {
    if (m.rake === undefined || m.direccionRake === undefined) continue;
    const rakeDirectionNum = Number(m.direccionRake);
    if (!Number.isFinite(rakeDirectionNum)) continue; // texto no numérico — se omite, no se adivina
    const { trend, plunge } = planeRakeToTrendPlunge(m.azimut, m.dip, m.rake, rakeDirectionNum);
    result.push({
      id: `rake-${m.id}`, tipo: m.tipo, cinemática: m.cinemática, trend, plunge, origin: 'rake',
      zona: m.zona, campaña: m.campaña,
    });
  }
  return result;
}
