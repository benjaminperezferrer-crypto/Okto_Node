/**
 * src/gis/minimumCurvature.ts
 * Método de curvatura mínima estándar de la industria para calcular la
 * traza 3D real de un sondaje a partir de su collar y sus estaciones de
 * Survey (profundidad/azimut/dip) — Etapa 10. Función pura, sin
 * React/Three.js — misma separación que affineFit.ts.
 *
 * ── Convención de `dip` (confirmada con el usuario, ver tabla Survey de
 * QA/QC — DB_FIELDS.Survey en index.html, rango validado [-90, 90]) ──────
 *   dip =   0°  →  sondaje horizontal
 *   dip = -90°  →  sondaje vertical, apuntando hacia ABAJO
 *   dip = +90°  →  sondaje vertical, apuntando hacia ARRIBA (raro, pero válido)
 * Es el ángulo desde la horizontal, CON signo — no el "ángulo de
 * inclinación desde la vertical" (0=abajo, 90=horizontal, siempre
 * positivo) que usan los manuales clásicos de curvatura mínima. La
 * fórmula de abajo está re-derivada directo en términos de ESTA
 * convención (no es una traducción literal del manual) — ver el
 * comentario de `stationUnitVector()` para la derivación completa.
 *
 * `azimuthDeg`: grados 0-360 desde el Norte, sentido horario (rumbo de
 * brújula estándar) — misma convención que el resto del módulo (Este=X,
 * Norte=Y).
 *
 * ── Método de curvatura mínima (resumen) ──────────────────────────────
 * Entre dos estaciones consecutivas, el sondaje se modela como un arco de
 * curvatura CONSTANTE que va suavemente de la dirección de la estación 1
 * a la de la estación 2 (el círculo que mejor concilia ambas
 * orientaciones) — a diferencia del método "ángulo promedio" (que
 * promedia las orientaciones sin más) o "tangencial" (que ignora una de
 * las dos), es el estándar de la industria porque es geométricamente
 * exacto para esa asunción de curvatura constante, no una aproximación.
 */

export interface SurveyStation {
  /** Profundidad medida a lo largo del sondaje (MD) desde el collar, en metros. */
  depth: number;
  /** Azimut en grados, 0-360, desde el Norte, sentido horario. */
  azimuthDeg: number;
  /** Dip en grados: 0=horizontal, -90=vertical abajo, +90=vertical arriba (ver comentario de archivo). */
  dipDeg: number;
}

export interface Point3D {
  east: number;
  north: number;
  elevation: number;
}

const DEG_TO_RAD = Math.PI / 180;
/** Bajo este ángulo (radianes) entre dos estaciones, se usa RF=1 directo — evita 0/0 en 2/β·tan(β/2) cuando β→0 (el límite real es 1, pero la fórmula tal cual no se puede evaluar en β=0). */
const MIN_DOGLEG_RAD = 1e-9;

/**
 * Vector unitario (Este, Norte, Arriba) de la dirección del sondaje en una
 * estación — derivado directo de la convención de `dip` de este archivo
 * (no es una copia de la fórmula del manual clásico, que usa la
 * inclinación desde la vertical):
 *
 *   Con I = inclinación desde la vertical-abajo (convención de manual,
 *   0=abajo, 90=horizontal, 180=arriba) y la relación I = dip + 90 (se
 *   verifica en los 3 casos límite: dip=-90→I=0, dip=0→I=90, dip=+90→I=180),
 *   las fórmulas estándar en (Norte, Este, TVD-abajo) son:
 *     N = sin(I)·cos(Az),  E = sin(I)·sin(Az),  TVD = cos(I)
 *   Sustituyendo I=dip+90 y usando identidades trigonométricas
 *   (sin(dip+90)=cos(dip), cos(dip+90)=−sin(dip)), y convirtiendo TVD
 *   (positivo hacia abajo) a Z de este módulo (positivo hacia arriba,
 *   Z=−TVD):
 *     N = cos(dip)·cos(Az),  E = cos(dip)·sin(Az),  Z = sin(dip)
 *
 * Verificación de los 3 casos límite con esta fórmula final:
 *   dip=-90 → (E,N,Z) = (0, 0, -1)  — recto hacia abajo, sin importar Az. ✓
 *   dip=  0 → (E,N,Z) = (sin Az, cos Az, 0) — horizontal, en la dirección de Az. ✓
 *   dip=+90 → (E,N,Z) = (0, 0, 1)  — recto hacia arriba. ✓
 * Magnitud: E²+N²+Z² = cos²(dip)(sin²Az+cos²Az) + sin²(dip) = cos²(dip)+sin²(dip) = 1. ✓
 */
function stationUnitVector(station: SurveyStation): Point3D {
  const az = station.azimuthDeg * DEG_TO_RAD;
  const dip = station.dipDeg * DEG_TO_RAD;
  const cosDip = Math.cos(dip);
  return {
    east: cosDip * Math.sin(az),
    north: cosDip * Math.cos(az),
    elevation: Math.sin(dip),
  };
}

/**
 * Traslada `from` un tramo de curvatura mínima hacia la dirección de
 * `curr`, dado el vector unitario de la estación anterior (`prevUnit`), el
 * de la actual (`currUnit`) y la longitud del tramo (`courseLength` =
 * diferencia de profundidad entre ambas estaciones).
 *
 * Ratio Factor (RF): la fórmula estándar de curvatura mínima —
 *   β = ángulo entre prevUnit y currUnit (el "dogleg")
 *   RF = (2/β)·tan(β/2)
 *   Δpos = (courseLength/2)·(prevUnit + currUnit)·RF
 * En el límite β→0 (mismo rumbo en ambas estaciones, sin curvatura),
 * tan(β/2)/(β/2) → 1, así que RF → 1 y la fórmula se reduce a
 * Δpos = courseLength·prevUnit — una línea recta, el caso trivial.
 */
function applyMinimumCurvatureSegment(
  from: Point3D,
  prevUnit: Point3D,
  currUnit: Point3D,
  courseLength: number,
): Point3D {
  const dot = prevUnit.east * currUnit.east + prevUnit.north * currUnit.north + prevUnit.elevation * currUnit.elevation;
  const beta = Math.acos(Math.min(1, Math.max(-1, dot)));
  const rf = beta < MIN_DOGLEG_RAD ? 1 : (2 / beta) * Math.tan(beta / 2);
  const half = (courseLength / 2) * rf;

  return {
    east: from.east + half * (prevUnit.east + currUnit.east),
    north: from.north + half * (prevUnit.north + currUnit.north),
    elevation: from.elevation + half * (prevUnit.elevation + currUnit.elevation),
  };
}

/**
 * Calcula la traza 3D completa de un sondaje por curvatura mínima, dado su
 * collar y sus estaciones de Survey (no necesariamente ordenadas por
 * profundidad — se ordenan acá, nunca se asume el orden del archivo de
 * origen, ver getQaqcSurveys() en index.html).
 *
 * Si la estación más superficial NO está a profundidad 0, se asume que el
 * sondaje va en línea recta desde el collar hasta esa estación con SU
 * MISMA orientación (sin datos de curvatura por encima de la primera
 * medición real — asunción estándar de la industria cuando no hay un
 * survey en profundidad 0). Si ya hay una estación a profundidad 0, se usa
 * tal cual, sin agregar nada.
 *
 * Devuelve el collar como primer punto, seguido de un punto por cada
 * estación real (una estación a profundidad 0 coincide con el collar, sin
 * punto duplicado). Con 0 estaciones, devuelve solo `[collar]`.
 */
export function computeMinimumCurvatureTrace(collar: Point3D, stations: SurveyStation[]): Point3D[] {
  if (stations.length === 0) return [collar];

  const sorted = [...stations].sort((a, b) => a.depth - b.depth);

  const effective: SurveyStation[] = sorted[0].depth > 0
    ? [{ depth: 0, azimuthDeg: sorted[0].azimuthDeg, dipDeg: sorted[0].dipDeg }, ...sorted]
    : sorted;

  const points: Point3D[] = [collar];
  let current = collar;

  for (let i = 1; i < effective.length; i++) {
    const prev = effective[i - 1];
    const curr = effective[i];
    const courseLength = curr.depth - prev.depth;
    current = applyMinimumCurvatureSegment(current, stationUnitVector(prev), stationUnitVector(curr), courseLength);
    points.push(current);
  }

  return points;
}
