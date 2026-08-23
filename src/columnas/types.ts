/**
 * src/columnas/types.ts
 * Modelo de datos para el módulo de Columnas Estratigráficas.
 * Solo tipos — sin lógica ni UI.
 */

// ─────────────────────────────────────────────────────────────────
// LITOLOGÍA
// ─────────────────────────────────────────────────────────────────

/**
 * Litologías frecuentes en secuencias andino-sudamericanas.
 * `| string` es un escape hatch deliberado: conserva autocompletado
 * para las opciones conocidas sin rechazar litologías de campo no listadas.
 */
export type Litologia =
  // Siliciclásticas detríticas
  | 'Conglomerado'
  | 'Brecha sedimentaria'
  | 'Arenisca gruesa'
  | 'Arenisca media'
  | 'Arenisca fina'
  | 'Limolita'
  | 'Lutita'
  | 'Pelita'
  | 'Arcilita'
  // Carbonáticas (clasificación de Dunham)
  | 'Caliza'
  | 'Dolomita'
  | 'Calcarenita'
  | 'Mudstone calcáreo'
  | 'Wackestone'
  | 'Packstone'
  | 'Grainstone'
  | 'Rudstone'
  | 'Boundstone'
  // Evaporíticas
  | 'Yeso'
  | 'Anhidrita'
  | 'Halita'
  // Carbonosas / orgánicas
  | 'Carbón'
  | 'Lignito'
  | 'Lutita negra (black shale)'
  // Silíceas
  | 'Chert'
  | 'Radiolarita'
  // Volcaniclásticas (clasificación de Fisher & Schmincke)
  | 'Toba'
  | 'Toba lítica'
  | 'Toba vítrea'
  | 'Toba cristalina'
  | 'Lapilli'
  | 'Ignimbrita'
  | 'Brecha volcánica'
  // Lavas
  | 'Basalto'
  | 'Andesita'
  | 'Dacita'
  | 'Riolita'
  | 'Traquita'
  // Mezcla o transición
  | 'Diamictita'
  | 'Arenisca tobácea'
  | 'Limolita calcárea'
  | 'Heterolita'
  | string;

// ─────────────────────────────────────────────────────────────────
// FACIES VOLCÁNICAS
// ─────────────────────────────────────────────────────────────────

/**
 * Subtipo de facies volcánica cuando la litología principal es
 * una roca volcánica o volcaniclástica. Complementa a `Litologia`
 * dando el contexto genético / ambiental del depósito.
 *
 * Una unidad puede tener `primaryLithology: 'Ignimbrita'` y
 * `volcanicFacies: 'Ignimbrita soldada'` simultáneamente.
 * `| string` permite registrar facies de campo no listadas.
 */
export type VolcanicFaciesType =
  // ── Efusivas (flujos lávicos)
  | 'Flujo lávico basáltico'
  | 'Flujo lávico andesítico'
  | 'Flujo lávico dacítico'
  | 'Flujo lávico riolítico'
  | 'Lava almohadillada (pillow)'   // emplazamiento subacuático
  | 'Lava aa'                       // superficie escoriácea irregular
  | 'Lava pahoehoe'                 // superficie cordada, flujo viscoso lento
  | 'Domo lávico'                   // extrusión en domo, composición silícica
  | 'Colada de lava masiva'
  // ── Piroclásticas de caída (tephra fall)
  | 'Caída de ceniza (ash fall)'
  | 'Caída de lapilli'
  | 'Caída de pómez'
  | 'Caída de escoria'
  // ── Piroclásticas de flujo (PDC – Pyroclastic Density Currents)
  | 'Ignimbrita soldada'
  | 'Ignimbrita no soldada'
  | 'Flujo piroclástico denso'
  | 'Avalancha piroclástica'
  // ── Piroclásticas de oleada (surge)
  | 'Surge piroclástico diluido'
  | 'Surge base (hidrovolcánico)'   // asociado a interacción magma-agua
  | 'Surge de baja concentración'
  // ── Brechas y laháres
  | 'Brecha de colapso caldérico'
  | 'Brecha hidrotermal'
  | 'Brecha de flujo lávico'
  | 'Lahár (flujo de escombros volcánicos)'
  | 'Depósito de avalancha de escombros'
  // ── Epiclásticas / retrabajadas
  | 'Conglomerado volcaniclástico retrabajado'
  | 'Arenisca volcaniclástica retrabajada'
  | 'Pelita volcaniclástica'
  // ── Intrusivos someros (subvolcánicos)
  | 'Dique'
  | 'Sill'
  | 'Criptodomo'
  | 'Cuello volcánico / chimenea'
  | string;

// ─────────────────────────────────────────────────────────────────
// TIPO DE CONTACTO
// ─────────────────────────────────────────────────────────────────

/**
 * Naturaleza del contacto entre una unidad y la unidad que le suprayace.
 * El valor vive en la unidad INFERIOR: describe cómo termina hacia arriba.
 * La unidad más alta de la columna usa `NoExpuesto` si el techo no aflora.
 */
export enum ContactType {
  Neto       = 'neto',        // plano, definido en < 1 cm
  Gradual    = 'gradual',     // transición progresiva > 1 cm
  Erosivo    = 'erosivo',     // superficie irregular, ravinement
  Tectonico  = 'tectonico',   // falla, sutura, cabalgamiento
  NoExpuesto = 'no_expuesto', // cubierto, coluvio, o límite de afloramiento
}

// ─────────────────────────────────────────────────────────────────
// GRANULOMETRÍA — escala de Udden-Wentworth simplificada
// ─────────────────────────────────────────────────────────────────

/**
 * Tamaño de grano según Udden-Wentworth (versión de campo simplificada).
 * Ordenado de FINO (índice 0) a GRUESO (índice 10) — el orden es relevante
 * para el renderizado del perfil granulométrico (eje x = más grueso a la derecha).
 *
 * Aplica principalmente a rocas clásticas; en carbonatos y volcánicas
 * usar el campo libre `texture` de StratigraphicUnit.
 */
export enum GrainSize {
  Arcilla        = 'arcilla',          // < 0.004 mm
  Limo           = 'limo',             // 0.004–0.063 mm
  ArenaMuyFina   = 'arena_muy_fina',   // 0.063–0.125 mm
  ArenaFina      = 'arena_fina',       // 0.125–0.25 mm
  ArenaMedia     = 'arena_media',      // 0.25–0.5 mm
  ArenaGruesa    = 'arena_gruesa',     // 0.5–1 mm
  ArenaMuyGruesa = 'arena_muy_gruesa', // 1–2 mm
  Granulo        = 'granulo',          // 2–4 mm
  Guijarro       = 'guijarro',         // 4–64 mm  (pebble)
  Grava          = 'grava',            // 64–256 mm (cobble)
  Bloque         = 'bloque',           // > 256 mm
}

/**
 * Array ordenado de fino a grueso — usar como índice x en el perfil.
 * GRAIN_SIZE_ORDER[0] = Arcilla (izquierda), GRAIN_SIZE_ORDER[10] = Bloque (derecha).
 */
export const GRAIN_SIZE_ORDER: GrainSize[] = [
  GrainSize.Arcilla,
  GrainSize.Limo,
  GrainSize.ArenaMuyFina,
  GrainSize.ArenaFina,
  GrainSize.ArenaMedia,
  GrainSize.ArenaGruesa,
  GrainSize.ArenaMuyGruesa,
  GrainSize.Granulo,
  GrainSize.Guijarro,
  GrainSize.Grava,
  GrainSize.Bloque,
];

/** Etiquetas cortas para el encabezado del perfil granulométrico. */
export const GRAIN_SIZE_LABELS: Record<GrainSize, string> = {
  [GrainSize.Arcilla]:        'Ar',
  [GrainSize.Limo]:           'Li',
  [GrainSize.ArenaMuyFina]:   'Amf',
  [GrainSize.ArenaFina]:      'Af',
  [GrainSize.ArenaMedia]:     'Am',
  [GrainSize.ArenaGruesa]:    'Ag',
  [GrainSize.ArenaMuyGruesa]: 'Amg',
  [GrainSize.Granulo]:        'Gr',
  [GrainSize.Guijarro]:       'Gu',
  [GrainSize.Grava]:          'Gv',
  [GrainSize.Bloque]:         'Bl',
};

// ─────────────────────────────────────────────────────────────────
// PERFIL GRANULOMÉTRICO
// ─────────────────────────────────────────────────────────────────

/**
 * Punto del perfil granulométrico dentro de una unidad.
 * `alturaRelativa` 0 = base de la unidad, 1 = techo de la unidad.
 * El renderer interpola linealmente entre puntos consecutivos.
 *
 * Uso típico:
 *  - Grano uniforme:         un solo punto (cualquier alturaRelativa)
 *  - Afinamiento hacia arriba: [{alturaRelativa:0, tamanoGrano:ArenaGruesa},
 *                               {alturaRelativa:1, tamanoGrano:ArenaFina}]
 *  - Forma lenticular:       [{alturaRelativa:0, ...Arcilla},
 *                             {alturaRelativa:0.5, ...ArenaMedia},
 *                             {alturaRelativa:1, ...Arcilla}]
 */
export interface GrainSizePoint {
  alturaRelativa: number;  // 0–1 (base a techo de la unidad)
  tamanoGrano:    GrainSize;
}

// ─────────────────────────────────────────────────────────────────
// ESTRUCTURAS SEDIMENTARIAS ANCLADAS A POSICIÓN
// ─────────────────────────────────────────────────────────────────

/**
 * Entrada de estructura sedimentaria con posición vertical explícita.
 * Reemplaza el array plano `sedimentaryStructures` cuando se necesita
 * representación posicional en el log (columna de símbolos).
 *
 * `alturaRelativa` es relativa a la UNIDAD (0 = base, 1 = techo).
 * El renderer convierte a altura absoluta al renderizar.
 */
export interface EstructuraSedimentaria {
  alturaRelativa: number;         // 0–1, relativo a la unidad
  tipoEstructura: SedimentaryStructure;
  /** Clave de símbolo en GEO_SYMBOLS. Si se omite, se usa tipoEstructura. */
  simbolo?:       string;
}

// ─────────────────────────────────────────────────────────────────
// OBSERVACIONES DE CAMPO ANCLADAS A POSICIÓN
// ─────────────────────────────────────────────────────────────────

/**
 * Nota de campo vinculada a una posición vertical dentro de la unidad.
 * Reemplaza el campo libre `fieldObservations: string` cuando se necesita
 * representar múltiples observaciones en posiciones distintas del log.
 */
export interface Observacion {
  alturaRelativa: number;  // 0–1, relativo a la unidad
  texto:          string;
}

// ─────────────────────────────────────────────────────────────────
// ESTRUCTURAS SEDIMENTARIAS
// ─────────────────────────────────────────────────────────────────

/**
 * Estructuras primarias, biogénicas y diagenéticas observables en
 * afloramiento. Una unidad puede tener múltiples estructuras.
 * `| string` permite registrar estructuras no listadas.
 */
export type SedimentaryStructure =
  // Primarias físicas
  | 'Masiva'
  | 'Laminación paralela'
  | 'Estratificación cruzada planar'
  | 'Estratificación cruzada en artesa'
  | 'Estratificación cruzada de bajo ángulo'
  | 'Gradación normal'
  | 'Gradación inversa'
  | 'Ripples de corriente'
  | 'Ripples de ola'
  | 'Hummocky cross-stratification (HCS)'
  | 'Swaley cross-stratification (SCS)'
  // Mixtas (tidal / flaser)
  | 'Laminación flaser'
  | 'Laminación lenticular'
  | 'Laminación ondulada (wavy)'
  // Biogénicas / icnológicas
  | 'Bioturbación intensa (> 60 %)'
  | 'Bioturbación moderada (20–60 %)'
  | 'Bioturbación leve (< 20 %)'
  | 'Trazas fósiles'
  | 'Estromatolitos'
  | 'Thrombolitos'
  // Deformacionales sin-sedimentarias
  | 'Slumping / deslizamiento gravitacional'
  | 'Inyecciones de arena (sand injectites)'
  | 'Marcas de carga (load casts)'
  | 'Estructuras en llama'
  | 'Deformación por licuefacción'
  // Diagenéticas / pedogénicas
  | 'Concreciones calcáreas'
  | 'Concreciones ferrosas'
  | 'Nódulos silíceos'
  | 'Calcretes / Paleosuelo'
  | 'Estilolitas'
  | 'Marcas de raíces'
  | 'Moteado de reducción / oxidación'
  | string;

// ─────────────────────────────────────────────────────────────────
// CONTENIDO FOSILÍFERO
// ─────────────────────────────────────────────────────────────────

export enum FossilContent {
  Esteril   = 'esteril',   // ausencia de fósiles reconocibles
  Escasos   = 'escasos',   // < 5 % del volumen visible
  Comun     = 'comun',     // 5–25 %
  Abundante = 'abundante', // > 25 %
  Bioherma  = 'bioherma',  // cuerpo carbonático organo-construido (arrecife, mound)
}

// ─────────────────────────────────────────────────────────────────
// COLOR — NOTACIÓN MUNSELL
// ─────────────────────────────────────────────────────────────────

/**
 * Color en notación Munsell (estándar USGS / GSA para rocas sedimentarias).
 * Ejemplo: hue="5YR", value=4, chroma=4 → "5YR 4/4" (pardo rojizo).
 * Se almacena parseado para validación y para construir un selector UI.
 * String canónico: `${hue} ${value}/${chroma}`.
 */
export interface MunsellColor {
  hue:     string;  // página de la tabla Munsell, e.g. "5YR", "10YR", "N" (neutro/gris)
  value:   number;  // claridad: 0 (negro) – 10 (blanco)
  chroma:  number;  // saturación: 0 (neutro) – 14 (máximo)
  label?:  string;  // nombre coloquial, e.g. "pardo amarillento", "gris oliva"
}

// ─────────────────────────────────────────────────────────────────
// CRONOESTRATIGRAFÍA — ENUMS CERRADOS
// ─────────────────────────────────────────────────────────────────
// Jerarquía: Eon → Era → Period → Epoch → stage (string libre)
// Los pisos/stages no se enumeran: hay >100 en la carta ICS y cambian
// con cada revisión. Se registran como string en GeologicalAge.stage.
// ─────────────────────────────────────────────────────────────────

export enum GeologicalEon {
  Hadaico      = 'Hadaico',
  Arqueano     = 'Arqueano',
  Proterozoico = 'Proterozoico',
  Fanerozoico  = 'Fanerozoico',
}

export enum GeologicalEra {
  // Proterozoico
  Paleoproterozoico = 'Paleoproterozoico',
  Mesoproterozoico  = 'Mesoproterozoico',
  Neoproterozoico   = 'Neoproterozoico',
  // Fanerozoico
  Paleozoico        = 'Paleozoico',
  Mesozoico         = 'Mesozoico',
  Cenozoico         = 'Cenozoico',
}

export enum GeologicalPeriod {
  // Paleozoico
  Cambrico    = 'Cámbrico',
  Ordovicico  = 'Ordovícico',
  Silurico    = 'Silúrico',
  Devonico    = 'Devónico',
  Carbonifero = 'Carbonífero',
  Permico     = 'Pérmico',
  // Mesozoico
  Triasico    = 'Triásico',
  Jurasico    = 'Jurásico',
  Cretacico   = 'Cretácico',
  // Cenozoico
  Paleogeno   = 'Paleógeno',
  Neogeno     = 'Neógeno',
  Cuaternario = 'Cuaternario',
}

/**
 * Épocas / series de la carta ICS (2023).
 * Se incluyen las subdivisiones informal Inferior/Superior/Medio
 * para períodos que no tienen nombres de época formales (Triásico, Jurásico, etc.).
 */
export enum GeologicalEpoch {
  // ── Cámbrico
  CambricoInferior    = 'Cámbrico Inferior (Series 2)',
  CambricoMedio       = 'Cámbrico Medio (Miaolingiano)',
  CambricoSuperior    = 'Cámbrico Superior (Furongiano)',
  // ── Ordovícico
  OrdovicicoInferior  = 'Ordovícico Inferior (Tremadociano)',
  OrdovicicoMedio     = 'Ordovícico Medio (Floiano–Dapingiano)',
  OrdovicicoSuperior  = 'Ordovícico Superior (Sandviano–Hirnaniano)',
  // ── Silúrico (épocas formales)
  Llandovery          = 'Llandovery',
  Wenlock             = 'Wenlock',
  Ludlow              = 'Ludlow',
  Pridoli             = 'Pridoli',
  // ── Devónico
  DevonicoInferior    = 'Devónico Inferior',
  DevonicoMedio       = 'Devónico Medio',
  DevonicoSuperior    = 'Devónico Superior',
  // ── Carbonífero (división norteamericana / ICS)
  Misisipiano         = 'Misisipiano',
  Pensilvaniano       = 'Pensilvaniano',
  // ── Pérmico (épocas formales ICS)
  Cisuraliano         = 'Cisuraliano',
  Guadalupiano        = 'Guadalupiano',
  Lopingiano          = 'Lopingiano',
  // ── Triásico
  TriasicoInferior    = 'Triásico Inferior',
  TriasicoMedio       = 'Triásico Medio',
  TriasicoSuperior    = 'Triásico Superior',
  // ── Jurásico
  JurasicInferior     = 'Jurásico Inferior (Liásico)',
  JurasicoMedio       = 'Jurásico Medio (Dogger)',
  JurasicoSuperior    = 'Jurásico Superior (Malm)',
  // ── Cretácico
  CretacicoInferior   = 'Cretácico Inferior',
  CretacicoSuperior   = 'Cretácico Superior',
  // ── Paleógeno
  Paleoceno           = 'Paleoceno',
  Eoceno              = 'Eoceno',
  Oligoceno           = 'Oligoceno',
  // ── Neógeno
  Mioceno             = 'Mioceno',
  Plioceno            = 'Plioceno',
  // ── Cuaternario
  Pleistoceno         = 'Pleistoceno',
  Holoceno            = 'Holoceno',
}

// ─────────────────────────────────────────────────────────────────
// EDAD GEOLÓGICA
// ─────────────────────────────────────────────────────────────────

/** Grado de certeza en la asignación de edad */
export type AgeConfidence =
  | 'datado'        // respaldado por datación radiométrica o bioestratigrafía
  | 'interpretado'  // correlación regional o litoestratigráfica
  | 'estimado';     // suposición del autor sin evidencia directa

/**
 * Edad geológica de la unidad.
 * Todos los campos cronostratigráficos son opcionales e independientes:
 * se puede registrar solo el período, o solo la datación radiométrica,
 * o ambos. Los enums garantizan valores válidos en la jerarquía ICS.
 */
export interface GeologicalAge {
  eon?:     GeologicalEon;
  era?:     GeologicalEra;
  period?:  GeologicalPeriod;
  epoch?:   GeologicalEpoch;
  /** Piso / Stage: demasiados en ICS para un enum (> 100). Ingreso libre. */
  stage?:   string;   // e.g. "Albiano inferior", "Tithoniano"
  /** Edad radiométrica o numérica absoluta */
  absolute?: {
    min?:    number;  // límite más joven (techo de la unidad) en `unit`
    max?:    number;  // límite más antiguo (base de la unidad) en `unit`
    unit:    'Ma' | 'ka';
    method?: string;  // e.g. "U-Pb circón", "K-Ar biotita", "Rb-Sr", "14C"
  };
  confidence?: AgeConfidence;
}

// ─────────────────────────────────────────────────────────────────
// RANGO LITOESTRATIGRÁFICO
// ─────────────────────────────────────────────────────────────────

/**
 * Jerarquía litoestratigráfica formal (NACSN / ICS).
 * Una StratigraphicUnit puede ser cualquiera de estos rangos.
 * Las unidades de rango Formacion y superior pueden contener `subUnits`.
 *
 *  Supergrupo
 *   └── Grupo
 *        └── Formacion       ← unidad fundamental de mapeo
 *             └── Miembro
 *                  └── Estrato / Banco / Lenteja  ← unidades de log de campo
 */
export enum LithostratigraphicRank {
  Supergrupo = 'supergrupo',
  Grupo      = 'grupo',
  Formacion  = 'formacion',
  Miembro    = 'miembro',
  Estrato    = 'estrato',   // capa individual, menor unidad reconocible
  Banco      = 'banco',     // capa competente de carbón, caliza o similar
  Lenteja    = 'lenteja',   // cuerpo acuñado lateralmente (lens)
}

// ─────────────────────────────────────────────────────────────────
// UNIDAD ESTRATIGRÁFICA
// ─────────────────────────────────────────────────────────────────

/**
 * Intervalo estratigráfico homogéneo dentro de una columna.
 *
 * ── Orden ────────────────────────────────────────────────────────
 * Los arrays `units` / `subUnits` se almacenan de BASE a TECHO:
 *   index 0 = unidad más antigua · index n-1 = unidad más joven
 *
 * ── Jerarquía ────────────────────────────────────────────────────
 * Una unidad con `subUnits` es un nodo contenedor (Formacion, Grupo…).
 * Una unidad sin `subUnits` es una hoja de log de campo (Estrato, Banco…).
 *
 * Regla de espesor:
 *   - Hoja    → `thickness` es el valor medido.
 *   - Nodo    → `thickness` debe igualar Σ(subUnit.thickness).
 *     No se calcula automáticamente aquí; es responsabilidad del código
 *     que modifique las unidades mantenerlo en sincronía.
 *
 * ── Campos sedimentológicos ──────────────────────────────────────
 * Los campos de litología, granulometría, estructuras, etc. solo son
 * significativos en unidades hoja. En nodos contenedores pueden omitirse
 * o usarse para describir el carácter general del grupo/formación.
 */
export interface StratigraphicUnit {
  id:   string;  // UUID generado al crear la unidad
  rank: LithostratigraphicRank;

  /** Código o nombre formal, e.g. "Fm. Atacama", "Mb. Rojo", "E-03" */
  code: string;

  /** Espesor en metros (> 0). Ver regla de espesor arriba. */
  thickness: number;

  /**
   * Contacto con la unidad inmediatamente superior.
   * Vive en la unidad INFERIOR: describe cómo termina esta unidad hacia arriba.
   */
  upperContactType: ContactType;

  // ── Campos sedimentológicos (hoja / field log) ──────────────────

  primaryLithology?:     Litologia;
  secondaryLithologies?: Litologia[];  // < 50 % del intervalo, e.g. intercalaciones

  /**
   * Subtipo genético para unidades volcánicas o volcaniclásticas.
   * Complementa a `primaryLithology`, no lo reemplaza.
   */
  volcanicFacies?: VolcanicFaciesType;

  /** Color en húmedo (o en seco; especificar en fieldObservations). */
  color?: MunsellColor;

  /**
   * Estructuras sedimentarias (formato legado — array plano sin posición).
   * @deprecated Usar `estructurasSedimentarias` para logs posicionales.
   *   La función `migrateUnit()` convierte este campo al nuevo formato.
   */
  sedimentaryStructures?: SedimentaryStructure[];

  /**
   * Estructuras sedimentarias ancladas a posición vertical (nuevo formato).
   * Reemplaza a `sedimentaryStructures` en el grain-size log.
   * `alturaRelativa` es relativa a la unidad (0 = base, 1 = techo).
   */
  estructurasSedimentarias?: EstructuraSedimentaria[];

  /**
   * Perfil granulométrico variable.
   * Array de puntos {alturaRelativa, tamanoGrano} ordenados de base a techo.
   * Un único punto representa grano uniforme.
   * Reemplaza al campo escalar `grainSize` para el log posicional.
   */
  perfilGranulometrico?: GrainSizePoint[];

  /**
   * Tamaño de grano dominante escalar (legado / compatibilidad).
   * @deprecated Usar `perfilGranulometrico` para representación en log.
   *   `migrateUnit()` convierte este campo a un perfil de un solo punto.
   */
  grainSize?: GrainSize;

  /**
   * Textura en texto libre para litologías donde Wentworth no aplica.
   * e.g. "wackestone bioclástico", "porfirítica, fenocristales Pl 3 mm".
   */
  texture?: string;

  fossilContent?: FossilContent;

  age?: GeologicalAge;

  /**
   * Observaciones de campo ancladas a posición (nuevo formato).
   * Reemplaza a `fieldObservations` para logs con múltiples notas.
   * `alturaRelativa` es relativa a la unidad (0 = base, 1 = techo).
   */
  observaciones?: Observacion[];

  /**
   * Notas de campo como string libre (legado / compatibilidad).
   * @deprecated Usar `observaciones` para representación posicional en log.
   *   `migrateUnit()` convierte este campo a una entrada en alturaRelativa 0.5.
   */
  fieldObservations?: string;

  // ── Jerarquía ───────────────────────────────────────────────────

  /**
   * Subunidades ordenadas de base a techo.
   * Presente solo en nodos contenedores (Formacion, Grupo, Supergrupo).
   * Ausente (undefined) en unidades hoja.
   */
  subUnits?: StratigraphicUnit[];
}

// ─────────────────────────────────────────────────────────────────
// METADATA DE LA COLUMNA
// ─────────────────────────────────────────────────────────────────

export interface ColumnLocation {
  /** Nombre del afloramiento, quebrada, camino, localidad. */
  description: string;
  coordinates?: {
    lat?:   number;  // WGS-84 decimal
    lon?:   number;  // WGS-84 decimal
    norte?: number;  // coordenada proyectada (UTM u otro sistema)
    este?:  number;
    datum?: string;  // e.g. "WGS84", "PSAD56"
    zone?:  string;  // e.g. "19S"
  };
  elevation?: number;  // msnm
}

export interface ColumnMetadata {
  /** Nombre identificador de la sección, e.g. "Columna Quebrada Honda 2026" */
  name:     string;
  location: ColumnLocation;
  /** Nombre completo del geólogo que levantó la columna */
  author:   string;
  /** Fecha de levantamiento en formato ISO 8601, e.g. "2026-07-02" */
  date:     string;
  /**
   * Escala gráfica almacenada como denominador.
   * `scale: 200` → escala 1:200.  `scale: 1000` → escala 1:1 000.
   */
  scale:    number;
  /**
   * Cota (msnm) del TOPE/techo de la columna — la elevación real del
   * punto más alto de la sección levantada. Campo OPCIONAL (columnas
   * anteriores no lo tienen; ausente = "sin cota configurada"). No
   * confundir con `location.elevation`, que es la elevación genérica del
   * afloramiento (campo distinto, semánticamente el punto de referencia
   * del sitio). `topElevation` existe para la pestaña de Correlación
   * estratigráfica: permite alinear varias columnas por su elevación real
   * (opción activable) en vez de por tope parejo. Se edita en la sección
   * de metadata esencial (Nombre/Escala/Autor), junto a las demás.
   */
  topElevation?: number;
  notes?:   string;  // condiciones de afloramiento, referencias bibliográficas, etc.
}

// ─────────────────────────────────────────────────────────────────
// LEYENDA — overrides de texto
// ─────────────────────────────────────────────────────────────────

/**
 * Overrides de texto para la leyenda autogenerada del log (ver
 * renderer-gslog.js). Cada grupo mapea la clave CANÓNICA de la entrada
 * (nombre de litología, valor de `ContactType`, o nombre de estructura/
 * fósil tal como aparece en `estructurasSedimentarias`) al texto que el
 * usuario quiere ver en su lugar. Una clave ausente usa el nombre por
 * defecto; el override se edita haciendo clic sobre el texto de la
 * leyenda en el visor.
 */
export interface LegendOverrides {
  litho?:   Record<string, string>;
  contact?: Record<string, string>;
  struct?:  Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────
// COLUMNA ESTRATIGRÁFICA — entidad raíz
// ─────────────────────────────────────────────────────────────────

/**
 * Columna estratigráfica completa.
 *
 * `units` contiene las unidades de primer nivel (normalmente Formaciones
 * o, en columnas simples, directamente Estratos), ordenadas de base a techo.
 * Las subunidades se acceden a través de `unit.subUnits`.
 *
 * El espesor total NO se almacena; se deriva cuando se necesita:
 *   `units.reduce((acc, u) => acc + u.thickness, 0)`
 */
export interface StratigraphicColumn {
  id:        string;  // UUID de la columna
  metadata:  ColumnMetadata;
  /** Unidades de primer nivel, ordenadas de base (index 0) a techo (index n-1). */
  units:     StratigraphicUnit[];
  /** Overrides de texto de la leyenda autogenerada — ver LegendOverrides. */
  legendOverrides?: LegendOverrides;
  createdAt: string;  // ISO 8601 datetime
  updatedAt: string;  // ISO 8601 datetime — actualizar al modificar units o metadata
}
