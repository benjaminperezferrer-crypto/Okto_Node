/**
 * src/estructural/stereonet.ts
 * Etapa 2 — núcleo matemático de la proyección estereográfica (Schmidt
 * equiareal / Wulff equiangular), hemisferio inferior. Funciones PURAS,
 * sin SVG ni UI — misma separación y mismo nivel de rigor que
 * minimumCurvature.ts (ver ese archivo para el patrón de derivación
 * documentada + verificación a mano antes de escribir el test).
 *
 * ── Convención de salida (x, y) ─────────────────────────────────────
 * Coordenadas CENTRADAS EN EL ORIGEN (0,0 = centro del estereograma),
 * en convención de MAPA (x=Este, y=Norte, Norte=arriba) — NO son
 * coordenadas de pantalla/SVG (que en index.html usan y hacia abajo).
 * Una capa de renderizado futura debe trasladar por (cx,cy) y, si dibuja
 * en SVG, invertir el eje Y (o aplicar la transformación equivalente).
 * Se elige esta convención (en vez de pantalla) porque este archivo es
 * puramente geométrico — no debe saber nada de SVG/pantalla — y porque
 * es la misma convención (x=Este,y=Norte) que trendPlungeToVector() de
 * structuralTypes.ts, para hablar el mismo idioma en todo el módulo.
 *
 * ── Derivación de las 2 proyecciones (verificada a mano antes de
 *    escribir el test, casos límite incluidos) ─────────────────────
 * Para una LÍNEA con plunge δ (0-90°, hacia abajo desde la horizontal),
 * el ángulo polar medido desde el eje vertical-abajo (colatitud) es
 * θ = 90°−δ (δ=90°→θ=0°, recto abajo, centro del estereograma;
 * δ=0°→θ=90°, horizontal, borde del estereograma).
 *
 * Proyección equiareal (Schmidt / Lambert azimutal equiareal), fórmula
 * estándar: r = R·√2·sin(θ/2). Sustituyendo θ=90−δ:
 *     r_schmidt(δ) = R·√2·sin((90°−δ)/2)
 *
 * Proyección equiangular (Wulff / estereográfica clásica), fórmula
 * estándar (proyección desde el polo antipodal sobre el plano
 * ecuatorial): r = R·tan(θ/2). Sustituyendo θ=90−δ:
 *     r_wulff(δ) = R·tan((90°−δ)/2)
 *
 * Verificación de casos límite (ambas fórmulas, R=1):
 *   δ=0°  (horizontal) → θ=90° → r_schmidt=√2·sin45°=1, r_wulff=tan45°=1
 *                          → AMBAS dan r=R exacto en el borde (coinciden
 *                            ahí por construcción: las 2 proyecciones se
 *                            calibran para que el ecuador caiga en el
 *                            borde del estereograma).
 *   δ=90° (vertical abajo) → θ=0° → ambas dan r=0 (sin0=tan0=0) → centro.
 * Verificación de que DIFIEREN en un punto intermedio (δ=45°, R=1):
 *   θ=45° → r_schmidt=√2·sin(22.5°)≈0.5412, r_wulff=tan(22.5°)≈0.4142
 *   → distintos, como exige la geometría (Schmidt comprime hacia el
 *     centro relativo a Wulff en la zona intermedia) — confirmado
 *     también en el test.
 *
 * El POLO de un plano (dirección de manteo D, dip δ) es una línea con
 * trend=D+180° y plunge=90°−δ (mismo razonamiento que buildPoleSVG() en
 * index.html). Sustituyendo en r_schmidt(90−δ) = R·√2·sin(δ/2) —
 * EXACTAMENTE la fórmula ya validada en buildPoleSVG() (`r = R·√2·sin(dip
 * en rad /2)`), confirmando que projectPole() no reinventa nada, solo
 * generaliza esa misma fórmula vía projectLine(). Por eso projectPole()
 * se implementa delegando en projectLine() con el trend/plunge del polo,
 * en vez de duplicar la fórmula radial.
 */

export type Projection = 'schmidt' | 'wulff';

export interface Point2D {
  x: number;
  y: number;
}

const DEG2RAD = Math.PI / 180;

/** Azimut normalizado a [0, 360) — copia mínima de structuralTypes.ts, evita import circular/cruzado para un helper de una línea. */
function normalizeAzimuth(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Distancia radial desde el centro del estereograma para una línea de
 * plunge δ, según la proyección elegida — ver derivación en el
 * encabezado del archivo. Única fuente de la fórmula radial: tanto
 * projectLine() como projectPole() (vía projectLine) pasan por acá.
 */
function radiusForPlunge(plungeDeg: number, radius: number, projection: Projection): number {
  const halfColatitudeRad = ((90 - plungeDeg) / 2) * DEG2RAD;
  return projection === 'schmidt'
    ? radius * Math.SQRT2 * Math.sin(halfColatitudeRad)
    : radius * Math.tan(halfColatitudeRad);
}

/**
 * Proyecta una línea (trend/plunge) al estereograma, hemisferio
 * inferior — punto único. Base de projectPole() y de cada punto de
 * projectGreatCircle().
 *
 * @param trend azimut de la línea (0-360°, desde el Norte)
 * @param plunge inmersión de la línea (0-90°, hacia abajo desde la horizontal)
 * @param projection 'schmidt' (equiareal) | 'wulff' (equiangular)
 * @param radius radio del estereograma (mismas unidades que el x,y devuelto)
 */
export function projectLine(trend: number, plunge: number, projection: Projection, radius: number): Point2D {
  const r = radiusForPlunge(plunge, radius, projection);
  const trendRad = normalizeAzimuth(trend) * DEG2RAD;
  return {
    x: r * Math.sin(trendRad), // Este
    y: r * Math.cos(trendRad), // Norte
  };
}

/**
 * Inversa matemática de projectLine(): dado un punto ya proyectado
 * (x,y) en el mismo sistema de coordenadas que projectLine()/
 * projectPole() devuelven, recupera su trend/plunge original.
 *
 * Se obtiene invirtiendo radiusForPlunge() — despejando plunge de
 * r=R√2·sin((90−plunge)/2) (Schmidt) o r=R·tan((90−plunge)/2) (Wulff) —
 * y recuperando trend con atan2(x,y) (inversa de x=r·sin(trend),
 * y=r·cos(trend)). Con r=0 (plunge=90°, el centro exacto) el trend
 * queda indefinido geométricamente — atan2(0,0) da 0° por convención de
 * JavaScript, un valor arbitrario pero inofensivo (una línea con
 * plunge=90° no tiene trend significativo de todas formas).
 *
 * Usada por el contorneo de densidad de Kamb (kambDensity.ts, Etapa 8)
 * para convertir cada nodo de una grilla en el plano proyectado de
 * vuelta a coordenadas esféricas, donde la distancia angular a cada
 * polo tiene sentido estadístico real (una distancia euclidiana en el
 * plano proyectado sería geométricamente incorrecta, especialmente
 * cerca del borde, por la distorsión propia de ambas proyecciones).
 */
export function invertProjection(x: number, y: number, radius: number, projection: Projection): { trend: number; plunge: number } {
  const r = Math.hypot(x, y);
  const halfColatitudeRad = projection === 'schmidt'
    ? Math.asin(Math.min(1, r / (radius * Math.SQRT2)))
    : Math.atan(r / radius);
  const colatitudeDeg = 2 * halfColatitudeRad * (180 / Math.PI);
  const plunge = 90 - colatitudeDeg;
  const trend = normalizeAzimuth(Math.atan2(x, y) * (180 / Math.PI));
  return { trend, plunge };
}

/**
 * Proyecta el polo de un plano (dirección de manteo + dip) al
 * estereograma, hemisferio inferior — punto único. El polo es la línea
 * perpendicular al plano, trend=dirManteo+180°, plunge=90°−dip (ver
 * derivación en el encabezado del archivo); se delega en projectLine()
 * con ese trend/plunge en vez de duplicar la fórmula radial.
 *
 * @param dipDirection dirección de manteo del plano (0-360°)
 * @param dip manteo del plano (0-90°)
 */
export function projectPole(dipDirection: number, dip: number, projection: Projection, radius: number): Point2D {
  const poleTrend = normalizeAzimuth(dipDirection + 180);
  const polePlunge = 90 - dip;
  return projectLine(poleTrend, polePlunge, projection, radius);
}

/**
 * Genera la polilínea (círculo máximo) que representa un plano en el
 * estereograma — la traza clásica que va de un extremo del rumbo,
 * pasando por la línea de máximo manteo, al otro extremo del rumbo.
 *
 * Reutiliza EXACTAMENTE la parametrización ya verificada en
 * planeRakeToTrendPlunge() (Etapa 1, structuralTypes.ts):
 * v(α)=cos(α)·rumboVec+sin(α)·manteoVec — barriendo α (tratado acá como
 * un "rake" sintético) de 0° a 180° con rakeDirection fijo en el extremo
 * canónico del rumbo (dirManteo−90°) se traza exactamente esa curva,
 * punto a punto: α=0°→un extremo del rumbo (borde, plunge=0), α=90°→
 * línea de máximo manteo (trend=dirManteo, plunge=dip), α=180°→el otro
 * extremo del rumbo (borde, plunge=0) — sin necesitar reimplementar la
 * geometría vectorial acá.
 *
 * CASO DEGENERADO CONOCIDO (dip=0°, plano horizontal): la traza real de
 * un plano horizontal es el círculo primitivo COMPLETO (360°), pero esta
 * parametrización (0-180°) solo cubre medio círculo, porque para dip=0
 * no existe una "línea de máximo manteo" que fije un eje de barrido
 * único. No se soluciona acá porque no es un caso geológicamente útil de
 * graficar (ningún software de referencia dibuja el "círculo máximo" de
 * un plano horizontal) — se documenta la limitación en vez de ignorarla
 * en silencio.
 *
 * @param steps cantidad de segmentos de la polilínea (default 90 → resolución de 2°, suficiente para una curva visualmente suave)
 */
export function projectGreatCircle(
  dipDirection: number,
  dip: number,
  projection: Projection,
  radius: number,
  steps = 90,
): Point2D[] {
  const canonicalStrikeEnd = normalizeAzimuth(dipDirection - 90);
  const dipDirRad = dipDirection * DEG2RAD;
  const dipRad = dip * DEG2RAD;
  const strikeRad = canonicalStrikeEnd * DEG2RAD;

  // rumboVec y manteoVec en convención (x=Este,y=Norte,z=Abajo), igual
  // que trendPlungeToVector() de structuralTypes.ts (no importada acá
  // para mantener este archivo autocontenido; misma fórmula exacta).
  const strikeVec = { x: Math.sin(strikeRad), y: Math.cos(strikeRad), z: 0 };
  const dipVec = {
    x: Math.cos(dipRad) * Math.sin(dipDirRad),
    y: Math.cos(dipRad) * Math.cos(dipDirRad),
    z: Math.sin(dipRad),
  };

  const points: Point2D[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 180 * DEG2RAD;
    const cosA = Math.cos(a), sinA = Math.sin(a);
    const v = {
      x: cosA * strikeVec.x + sinA * dipVec.x,
      y: cosA * strikeVec.y + sinA * dipVec.y,
      z: cosA * strikeVec.z + sinA * dipVec.z,
    };
    // z=sin(a)·sin(dip) ≥ 0 para a∈[0°,180°] y dip∈[0°,90°] (sin(a)≥0 y
    // sin(dip)≥0 en esos rangos) — nunca hace falta antípoda acá, a
    // diferencia de vectorToTrendPlunge() en structuralTypes.ts.
    const trend = normalizeAzimuth(Math.atan2(v.x, v.y) * (180 / Math.PI));
    const plunge = Math.asin(Math.max(-1, Math.min(1, v.z))) * (180 / Math.PI);
    points.push(projectLine(trend, plunge, projection, radius));
  }
  return points;
}

// ─────────────────────────────────────────────────────────────────
// PLANO/POLO MEDIO — suma vectorial en la esfera unitaria
// ─────────────────────────────────────────────────────────────────

const RAD2DEG = 180 / Math.PI;

/** Forma mínima que acepta computeMeanPole() — PlanarMeasurement[] cumple esto estructuralmente, sin necesidad de importar ese tipo (mismo criterio "archivo autocontenido" del resto de stereonet.ts). */
export interface MeanPoleInput {
  azimut: number;
  dip: number;
}

export interface MeanPoleResult {
  /** Dirección de manteo del plano medio (0-360°) — mismo formato que PlanarMeasurement.azimut, listo para pasar directo a projectPole()/projectGreatCircle(). */
  dipDirection: number;
  /** Manteo del plano medio (0-90°). */
  dip: number;
  /**
   * Longitud del vector resultante normalizada por n (R/n, rango [0,1])
   * — 1 = todos los polos exactamente coincidentes (máxima concentración
   * posible), valores cercanos a 0 = polos muy dispersos, sin dirección
   * media significativa. Es el parámetro `R` de estadística direccional
   * de Fisher dividido por n — la misma cantidad que después alimenta κ
   * en el panel de estadística direccional (etapa futura del paquete).
   */
  resultantLength: number;
  /** Cantidad de mediciones que entraron al promedio (después de filtrar cualquier valor no numérico que el llamador ya haya descartado — esta función no valida, asume datos limpios como el resto del módulo). */
  n: number;
}

/**
 * Polo/plano medio de un conjunto de mediciones planares — MISMA
 * matemática ya validada en buildPoleSVG() (index.html, sección "Mean
 * pole (vector mean on unit sphere)"): cada polo se convierte a un
 * vector unitario (trend=dirManteo+180°, plunge=90°-dip — el polo del
 * plano, no la línea de máximo manteo), se suman los 3 componentes, se
 * normaliza el vector resultante, y se convierte de vuelta a trend/
 * plunge — exactamente la técnica de estadística direccional de Fisher
 * para el vector medio sobre la esfera unitaria (promediar ángulos
 * directo, sin pasar por vectores, da resultados incorrectos por el
 * wraparound de 360° — por eso hace falta la suma vectorial). El
 * resultado se devuelve como (dipDirection, dip) del plano medio (no
 * como trend/plunge del polo medio) para que el llamador lo pueda pasar
 * DIRECTO a projectPole()/projectGreatCircle(), igual que cualquier
 * PlanarMeasurement real.
 *
 * `null` si `measurements` está vacío o si el vector resultante es
 * prácticamente nulo (polos perfectamente antipodales/uniformemente
 * distribuidos — no hay una dirección media significativa que graficar,
 * mismo umbral que usa buildPoleSVG: `len > 0.001`).
 */
export function computeMeanPole(measurements: MeanPoleInput[]): MeanPoleResult | null {
  const n = measurements.length;
  if (n === 0) return null;

  let sx = 0, sy = 0, sz = 0;
  for (const m of measurements) {
    const trendRad = normalizeAzimuth(m.azimut + 180) * DEG2RAD;
    const plungeRad = (90 - m.dip) * DEG2RAD;
    sx += Math.cos(plungeRad) * Math.sin(trendRad);
    sy += Math.cos(plungeRad) * Math.cos(trendRad);
    sz += Math.sin(plungeRad);
  }

  const len = Math.sqrt(sx * sx + sy * sy + sz * sz);
  if (len <= 0.001) return null; // sin dirección media significativa — mismo umbral que buildPoleSVG.

  const meanTrend = normalizeAzimuth(Math.atan2(sx / len, sy / len) * RAD2DEG);
  const meanPlunge = Math.asin(Math.max(-1, Math.min(1, sz / len))) * RAD2DEG;

  return {
    dipDirection: normalizeAzimuth(meanTrend + 180), // polo → plano: mismo -180° que projectPole() aplica a la inversa.
    dip: 90 - meanPlunge,
    resultantLength: len / n,
    n,
  };
}

// ─────────────────────────────────────────────────────────────────
// ESTADÍSTICA DIRECCIONAL DE FISHER — κ (concentración) + cono de
// confianza, paquete de mejoras de Análisis Estructural.
//
// ── Referencia y fórmula (confirmadas con el usuario ANTES de
//    implementar, mismo criterio que el método de Kamb) ────────────
// Fisher, R.A. (1953), "Dispersion on a sphere", Proc. Roy. Soc. London
// A, 217, 295-305 — derivación original para datos direccionales sobre
// la ESFERA (caso 3D — DISTINTO del caso circular/von Mises 2D, que
// tiene estimadores de κ diferentes y NO aplica acá). Reproducida como
// referencia aplicada estándar en Fisher, Lewis & Embleton (1987)
// "Statistical Analysis of Spherical Data" (Cambridge), en Davis (2002)
// "Statistics and Data Analysis in Geology", e implementada igual en
// Allmendinger, Cardozo & Fisher (2011/2020) "Structural Geology
// Algorithms" — la referencia detrás de la mayoría del software de
// estereogramas (Stereonet, Orient, etc.).
//
// Con N vectores unitarios y R = longitud del vector resultante SIN
// normalizar (= resultantLength·n de computeMeanPole() — se REUTILIZA
// ese cálculo, no se vuelve a sumar el vector acá):
//
//   κ (estimador MLE aproximado, caso esférico) = (N−1) / (N−R)
//
//   Semi-ángulo del cono de confianza θ al nivel (1−P) (P=0.05 → 95%):
//     cos(θ) = 1 − [(N−R)/R]·[(1/P)^(1/(N−1)) − 1]
//     θ = arccos(cos(θ) recortado a [−1,1])
//
// ── Casos límite verificados a mano antes de escribir el test ──────
// R→N (concentración perfecta): (N−R)→0 ⇒ κ→∞ y cos(θ)→1 ⇒ θ→0°.
// N→∞ a R̄=R/N fijo (<1): el corchete [(1/P)^(1/(N−1))−1]→0 (el
// exponente 1/(N−1)→0), mientras (N−R)/R se mantiene proporcional a N
// (∝(1−R̄)/R̄) — el producto → 0, así que θ→0° (más datos a la MISMA
// concentración angosta el cono, como se espera).
//
// ── Por qué se recorta cos(θ) a [−1,1] antes de arccos ──────────────
// La aproximación es confiable para κ≳3 (concentración moderada-alta,
// el caso típico en geología estructural); con datos MUY dispersos el
// cos(θ) calculado puede caer por debajo de −1 — se recorta (mismo
// patrón que el clamp de asin() en computeMeanPole()) para devolver
// θ=180° en vez de NaN, en lugar de fallar.
//
// ── Por qué requiere N≥2 ───────────────────────────────────────────
// El exponente 1/(N−1) divide por cero en N=1 — se devuelve `null`
// (mismo criterio que computeMeanPole() con conjunto vacío/resultante
// nulo: "no hay estadística significativa que mostrar", no un error).
// ─────────────────────────────────────────────────────────────────

export interface FisherStats {
  /** Dirección de manteo del plano medio — idéntico a MeanPoleResult.dipDirection (mismo cálculo, reutilizado). */
  dipDirection: number;
  dip: number;
  n: number;
  /** R/n — ver JSDoc de MeanPoleResult.resultantLength. */
  resultantLength: number;
  /** Parámetro de concentración de Fisher — más alto = más concentrado. */
  kappa: number;
  /** Semi-ángulo del cono de confianza, en grados, al nivel `confidenceLevel`. */
  confidenceConeDeg: number;
  /** Nivel de confianza usado (0-1) — p.ej. 0.95 para el default de 95%. */
  confidenceLevel: number;
}

/**
 * Estadística direccional de Fisher del conjunto filtrado — REUTILIZA
 * computeMeanPole() para la orientación media y R (no reimplementa la
 * suma vectorial), y le agrega κ + el cono de confianza. `null` si
 * computeMeanPole() ya devuelve `null` (sin dirección media
 * significativa) o si `n < 2` (κ/cono indefinidos, ver JSDoc de arriba).
 */
export function computeFisherStats(measurements: MeanPoleInput[], confidenceLevel = 0.95): FisherStats | null {
  const mean = computeMeanPole(measurements);
  if (!mean) return null;
  const { n, resultantLength } = mean;
  if (n < 2) return null;

  const R = resultantLength * n;
  const kappa = (n - 1) / (n - R);

  const P = 1 - confidenceLevel;
  const bracket = Math.pow(1 / P, 1 / (n - 1)) - 1;
  const cosTheta = 1 - ((n - R) / R) * bracket;
  const confidenceConeDeg = Math.acos(Math.max(-1, Math.min(1, cosTheta))) * RAD2DEG;

  return {
    dipDirection: mean.dipDirection,
    dip: mean.dip,
    n,
    resultantLength,
    kappa,
    confidenceConeDeg,
    confidenceLevel,
  };
}

// ─────────────────────────────────────────────────────────────────
// CÍRCULO PEQUEÑO (CONO) ALREDEDOR DE UN EJE ARBITRARIO — usado para
// dibujar el overlay del cono de confianza de Fisher alrededor del
// polo medio (StereonetPlanes.tsx). DISTINTO de projectGreatCircle()
// (que traza el círculo MÁXIMO de un plano, radio angular 90° fijo,
// eje = normal del plano) — acá el radio angular es arbitrario
// (`radiusDeg`) y el eje es cualquier trend/plunge, no necesariamente
// el polo de un plano real.
// ─────────────────────────────────────────────────────────────────

interface Vec3 { x: number; y: number; z: number; }

/** Vector unitario (x=Este,y=Norte,z=Abajo) — misma convención que el resto del archivo (ver projectGreatCircle arriba); no se importa de structuralTypes.ts a propósito (archivo autocontenido, ver encabezado). */
function toVector(trendDeg: number, plungeDeg: number): Vec3 {
  const tr = trendDeg * DEG2RAD, pl = plungeDeg * DEG2RAD;
  return { x: Math.cos(pl) * Math.sin(tr), y: Math.cos(pl) * Math.cos(tr), z: Math.sin(pl) };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalizeVec(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Puntos (ya proyectados, listos para un `<polygon>`) de un círculo
 * pequeño de radio angular `radiusDeg` alrededor del eje (axisTrendDeg,
 * axisPlungeDeg) — parametrización estándar: se arma una base
 * ortonormal (u, v, eje) perpendicular al eje, y se recorre
 * p(t) = cos(r)·eje + sin(r)·(cos(t)·u + sin(t)·v) para t en [0,2π).
 * `ref` (el vector auxiliar para construir u) se elige (1,0,0) cuando
 * el eje está casi vertical (|z|≥0.999, donde (0,0,1) sería casi
 * paralelo al eje y u colapsaría a longitud ~0) y (0,0,1) en cualquier
 * otro caso.
 *
 * Puntos que caen en el hemisferio SUPERIOR (z<0 — puede pasar si el
 * eje tiene poco plunge y el radio del cono es grande) se reflejan a su
 * antípoda (mismo criterio que vectorToTrendPlunge() de
 * structuralTypes.ts) para mantener la convención de hemisferio
 * inferior de todo el archivo — el overlay puede verse "partido" cerca
 * del horizonte en ese caso límite, una simplificación aceptada para un
 * overlay opcional (no es la matemática central del estereograma).
 */
export function projectSmallCircle(
  axisTrendDeg: number,
  axisPlungeDeg: number,
  radiusDeg: number,
  projection: Projection,
  radius: number,
  nPoints = 64,
): Point2D[] {
  const axis = toVector(axisTrendDeg, axisPlungeDeg);
  const ref: Vec3 = Math.abs(axis.z) >= 0.999 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const u = normalizeVec(cross(axis, ref));
  const v = cross(axis, u); // ya unitario: axis⊥u, ambos unitarios.

  const rRad = radiusDeg * DEG2RAD;
  const cosR = Math.cos(rRad), sinR = Math.sin(rRad);

  const points: Point2D[] = [];
  for (let i = 0; i < nPoints; i++) {
    const t = (i / nPoints) * 2 * Math.PI;
    const cosT = Math.cos(t), sinT = Math.sin(t);
    let px = cosR * axis.x + sinR * (cosT * u.x + sinT * v.x);
    let py = cosR * axis.y + sinR * (cosT * u.y + sinT * v.y);
    let pz = cosR * axis.z + sinR * (cosT * u.z + sinT * v.z);
    if (pz < 0) { px = -px; py = -py; pz = -pz; } // reflejo a hemisferio inferior — ver JSDoc.
    const trend = normalizeAzimuth(Math.atan2(px, py) * RAD2DEG);
    const plunge = Math.asin(Math.max(-1, Math.min(1, pz))) * RAD2DEG;
    points.push(projectLine(trend, plunge, projection, radius));
  }
  return points;
}
