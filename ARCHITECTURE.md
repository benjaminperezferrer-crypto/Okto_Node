# Arquitectura — Okto Node

Este documento captura decisiones de arquitectura y hallazgos de diagnóstico
del sistema de Proyectos (guardado/carga de sesiones completas) descubiertos
durante su desarrollo. El objetivo es que una sesión nueva de Claude Code
que trabaje en este repo lea esto primero, en vez de tener que
re-descubrir por diagnóstico desde cero cosas que ya se investigaron a
fondo una vez.

## 1. Estado y runtime por módulo

Okto Node no es una sola aplicación con un único runtime: es una
ventana raíz (`index.html`) que aloja tres módulos con arquitecturas de
frontend completamente distintas entre sí, cada uno desarrollado de forma
independiente antes de que existiera el sistema de Proyectos. Esa
heterogeneidad no es accidental ni algo a "corregir" — es la razón de ser
de buena parte del diseño del sistema de Proyectos, así que vale la pena
entenderla módulo por módulo antes de tocar nada.

**QA/QC** vive directamente en la ventana raíz (`index.html`): es JS
vanilla, sin ningún framework, con el estado repartido en variables
globales sueltas del propio script de `index.html` (no hay un store ni un
objeto de estado centralizado). Como corre en la misma ventana que
orquesta el sistema de Proyectos, no necesita ningún puente para exponer
su estado — se lee y se restaura por llamada directa de función
(`getQaqcProjectState()` / `loadQaqcProjectState()`). Su estado inicial es
genuino y conocido de antemano (`files: []` al cargar la página, antes de
que el usuario suba nada), así que su `ProjectState` nunca es nulable: a
diferencia de los otros dos módulos, QA/QC siempre tiene *algo* que
guardar, incluso en una sesión donde el usuario nunca lo tocó.

**Columnas** (`src/columnas/`) usa un store manual, escrito a mano en
`store.js`, con un patrón estilo Flux: `createColumnStore()` crea una
instancia con `getState()`/`subscribe()`/métodos de mutación que hacen
commit de un nuevo estado inmutable en cada cambio. No usa Redux ni
ninguna librería — es una implementación propia, deliberadamente simple.
Corre en su propio `<iframe>` (`src/columnas/viewer.html`), separado de la
ventana raíz. Antes de que existiera el sistema de Proyectos, Columnas ya
soportaba múltiples columnas abiertas en memoria simultáneamente
(`_projects[]`, con pestañas propias) — el sistema de Proyectos no
introdujo ese concepto, simplemente aprendió a serializar/restaurar esa
estructura preexistente completa.

**Hidrogeoquímica** (`src/hidrogeo/`) es React puro — `useState`/
`useEffect`, sin Context API ni ningún store global propio. También corre
en su propio `<iframe>`, separado tanto de la ventana raíz como de
Columnas. Antes del sistema de Proyectos, su persistencia estaba
fragmentada en tres claves de `localStorage` independientes entre sí (sin
un único objeto de estado consolidado) — el sistema de Proyectos tuvo que
unificar esas tres fuentes en un único `ProjectState` parcial coherente al
guardar, y repartirlas de vuelta a sus tres claves originales al cargar.

**El hallazgo central que terminó dando forma a todo el resto del sistema
de Proyectos**: Columnas e Hidrogeoquímica corren en `<iframe>`s con su
propio *realm* de JavaScript — cada uno con su propio `window`, sus
propias variables globales, su propio ciclo de vida — sin ninguna
comunicación entre ventanas por defecto. La ventana raíz no tiene acceso
directo a las variables internas de esos iframes (ni ellos a las de la
raíz), no hay `postMessage` a menos que se implemente explícitamente, y no
alcanza con guardar una referencia a `contentWindow` para "ver adentro".
Este hecho — descubierto al empezar a diseñar cómo la raíz podría siquiera
pedirle su estado a Columnas o Hidrogeoquímica — es lo que obligó a
construir un puente de mensajería dedicado antes de poder implementar
ningún guardado o carga que cruzara la frontera de ventana/iframe. (El
protocolo de ese puente se documenta en la siguiente sección de este
archivo, no acá.)

**GIS** corre en su propio `<iframe>` (`src/gis/viewer.html`, lanzado
perezoso vía `launchGIS()`), con pipeline de esbuild propio — mismo
patrón que Hidrogeoquímica, no uno nuevo. `ProjectState.gis` es
`GisProjectState | null` (`null` solo si el iframe nunca se lanzó en la
sesión, igual que Columnas/Hidrogeoquímica). Solo persiste las capas
IMPORTADAS por el usuario (`type:'vector'`/`'raster'`) — las 4 variantes
`'integrated-*'` (collars/drillholes/columnas/hidrogeo) se excluyen a
propósito: se recalculan solas desde los otros módulos cada vez que GIS
monta, persistirlas sería redundante. Los binarios grandes de capas
ráster importadas (`Uint8Array` de píxeles) se codifican en base64 al
guardar/cargar el `.geoproj` (`jsonReplacer`/`jsonReviver` en
`projectManager.js`) — el `JSON.stringify` por defecto de un `Uint8Array`
lo serializa como un objeto con una clave por byte, varias veces más
pesado.

## 2. Puente de mensajería y orquestación

### Autenticación por identidad de ventana, no por origin

El puente (`src/projectBridge.ts`, compilado a `src/projectBridge.js` para
que `index.html` y Columnas lo carguen sin build step) autentica cada
mensaje comparando `event.source` contra la ventana exacta esperada —
`frame.contentWindow` del lado del padre, `window.parent` del lado del
iframe — en vez de comparar `event.origin` contra un string de origen
esperado.

El motivo no es preferencia de estilo: es un requisito de producto. La app
tiene que poder abrirse con doble clic directo sobre `index.html` (protocolo
`file://`), sin levantar ningún servidor local y funcionando 100% offline.
Bajo `file://`, cada documento recibe un origen **opaco** (`"null"`), y
además `window.location.origin` se comporta de forma inconsistente entre
navegadores bajo ese protocolo — a veces reportando `"null"`, a veces
`"file://"` u otro valor. El resultado práctico es que cualquier
comparación de string de origen (`event.origin !== window.location.origin`)
queda rota bajo `file://`: los dos lados nunca coinciden, así que el
mensaje se descarta siempre, sin importar los datos ni el módulo. Esto es
justamente lo que causó el bug documentado en la sección de hallazgos: un
timeout genérico de 5s en "Guardar proyecto" que no tenía nada que ver con
el tamaño ni el contenido de los datos.

Autenticar por `event.source` evita el problema de raíz porque no depende
en absoluto del string de origen — funciona idéntico bajo `file://` y bajo
`http://`. Es seguro para este caso de uso puntual porque la arquitectura
es de un único iframe fijo y conocido por módulo (Columnas siempre es
`document.getElementById('columnas-frame')`, Hidrogeoquímica siempre
`hidro-frame`): el padre y cada iframe siempre saben de antemano,
exactamente, cuál es la única ventana legítima del otro lado — no hay
ambigüedad ni necesidad de aceptar mensajes de un conjunto abierto de
orígenes posibles, como sí la habría en una app que se comunica con
ventanas de terceros. Como contraparte de este cambio, los `postMessage`
salientes usan `'*'` como `targetOrigin` (el string de destino ya no es
confiable bajo `file://`, y la autenticación real la hace quien recibe el
mensaje, no quien lo envía).

### Los 4 tipos de mensaje del protocolo

- **`PROJECT_GET_STATE_REQUEST`** — el padre le pide al iframe su estado
  actual, con un `requestId` de correlación para no cruzar la respuesta
  con la de otro pedido en vuelo.
- **`PROJECT_GET_STATE_RESPONSE`** — el iframe responde con el estado
  actual del módulo (lo que devuelve su `getState()`).
- **`PROJECT_GET_STATE_ERROR`** — el iframe avisa que `getState()` lanzó
  una excepción en vez de devolver un estado utilizable. Ver más abajo por
  qué existe este mensaje aparte del anterior.
- **`PROJECT_LOAD_STATE`** — el padre le envía al iframe un estado para
  que lo restaure. Es fire-and-forget: no hay una respuesta de
  confirmación en este canal (si se necesita saber cuándo el iframe ya
  puede recibir mensajes en general, para eso está `PROJECT_READY`, no
  esto).
- **`PROJECT_READY`** — el iframe avisa al padre, apenas termina de
  registrar su listener de mensajes, que ya está listo para recibir
  pedidos. El padre lo usa para saber cuándo es seguro enviarle un
  `PROJECT_LOAD_STATE` a un módulo que acaba de lanzar (ver
  `applyProjectState()` más abajo).

### `getState()` envuelto en try/catch — de excepción silenciosa a error real

`listenForStateRequests()`, del lado del iframe, envuelve la llamada a
`getState()` en un try/catch. Si el módulo lanza una excepción real al
intentar construir su estado (por ejemplo, un valor no serializable en los
datos reales de una columna), el padre recibe un `PROJECT_GET_STATE_ERROR`
con el mensaje real de la excepción, en vez de quedarse esperando en
silencio hasta agotar el timeout genérico de 5 segundos sin ninguna pista
de qué pasó. Antes de este cambio, cualquier excepción no capturada del
lado del iframe se traducía, del lado del padre, en el mismo timeout
genérico indistinguible de "el módulo tardó demasiado" — este fue
precisamente el primer bug real diagnosticado en el sistema de Proyectos.

### `isModuleFrameLaunched()` — saber si un módulo fue usado en la sesión

Cada `<iframe>` de módulo arranca en el HTML con `src=""`. Leído como
propiedad de JS (`frame.src`, no `getAttribute('src')`), un `src=""` vacío
se resuelve al URL de la propia página (`window.location.href`) — así que
"el módulo fue lanzado en esta sesión" se define como `frame.src` está
seteado **y** es distinto de `window.location.href`. Esta es la misma
condición que ya usan `launchColumnas()`/`launchHidro()` para decidir si
asignarle `src` al iframe la primera vez, no un mecanismo nuevo.

`collectProjectState()` usa esta condición para decidir si le pide estado
a un módulo o no: si Columnas o Hidrogeoquímica nunca se lanzaron en la
sesión actual, no se les pide nada (ni tiene sentido — el iframe ni
siquiera cargó su documento real, no habría quién responda) y su campo en
`ProjectState` queda `null`. Esto es lo que hace que el campo `gis` de la
sección 1 y los campos `columnas`/`hidrogeoquimica` compartan el mismo
significado de `null`: "el usuario no usó este módulo en esta sesión", no
"hubo un error".

### `applyProjectState()` — lanzar, esperar `PROJECT_READY`, recién ahí enviar

Al cargar un proyecto guardado, si el estado trae datos para un módulo
(Columnas o Hidrogeoquímica) que todavía no está lanzado en la sesión
actual, `applyProjectState()` no puede simplemente mandarle un
`PROJECT_LOAD_STATE` de una — el iframe ni siquiera existe todavía. La
secuencia es: asignar `frame.src` (lo que dispara la carga real del
documento del módulo), esperar a que ese iframe específico emita su propio
`PROJECT_READY` (filtrando por `event.source` para no confundirlo con el
`PROJECT_READY` de otro módulo lanzándose en paralelo), y solo entonces
enviarle el `PROJECT_LOAD_STATE` con los datos guardados. Si el módulo ya
estaba lanzado de antes, se salta la espera y se le envía el estado
directo.

Tanto `collectProjectState()` como `applyProjectState()` tratan el timeout
o error de un módulo de forma aislada: si Columnas falla al responder pero
Hidrogeoquímica no, el proceso completo no se aborta de inmediato — se
sigue intentando con los módulos restantes, se juntan todos los errores
encontrados, y recién al final se lanza un único `Error` con el detalle de
cuáles módulos fallaron. La alternativa (abortar todo en el primer error)
arriesgaría, por ejemplo, guardar un proyecto sin avisar de que le falta
un módulo entero, o dejar cargados solo algunos módulos de un proyecto sin
que quede claro cuáles.

## 3. Decisiones de diseño y lecciones aprendidas

- **Cada `getXProjectState()` devuelve un `structuredClone()` del
  snapshot, no una referencia al estado vivo.** `collectProjectState()` es
  async y va módulo por módulo esperando respuestas de otros iframes antes
  de terminar — si QA/QC (o el resultado ya obtenido de un módulo) siguiera
  referenciando el estado interno real en vez de una copia aislada,
  cualquier mutación del usuario mientras la promesa de otro módulo sigue
  en vuelo podría filtrarse al snapshot que ya se pensaba "cerrado",
  produciendo un `.geoproj` con datos de un instante que nunca existió
  realmente. Clonar en el momento exacto de la lectura evita esa clase de
  condición de carrera por completo, al costo de una copia extra que, medido en la práctica con columnas
  grandes durante el diagnóstico del bug de guardado mencionado arriba,
  nunca fue el cuello de botella real.

- **`QaqcProjectState` excluye a propósito campos transitorios o
  re-derivables** — `activeTab`, `_s4Groups`, y los campos internos de la
  rosa de rumbos no se guardan. Al cargar un proyecto, QA/QC no intenta
  reconstruir la pantalla o pestaña exacta donde estaba el usuario: aterriza
  siempre en Screen 1 (`renderS1()`) y deja que esos campos transitorios se
  recalculen solos a medida que el usuario vuelve a navegar. La alternativa
  — serializar y restaurar la posición exacta de navegación — agregaría
  superficie de bugs (¿qué pasa si esa pantalla ya no es alcanzable con el
  estado restaurado?) a cambio de un beneficio menor: el usuario ya sabe
  que acaba de abrir un proyecto, empezar en un punto conocido y estable es
  más predecible que intentar clonar la sesión exacta.

- **`HidrogeoquimicaProjectState` persiste `effectiveSamples` — el dataset
  ya RESUELTO (importado si el usuario importó algo, o el fixture si no) —
  en vez de `importedSamples` crudo.** La razón es reproducibilidad real: si
  se guardara solo lo importado y se recalculara el fallback al fixture en
  cada carga, un proyecto abierto en otra computadora o en una versión
  futura de la app (donde el fixture pudo haber cambiado) mostraría datos
  distintos a los que el usuario vio y guardó. Persistir el resultado ya
  resuelto congela exactamente lo que había al momento de guardar,
  independiente de qué le pase al fixture después.

- **`HydrogeochemistryModule` expone `getProjectState()`/
  `loadProjectState()` hacia afuera del árbol de React vía `forwardRef` +
  `useImperativeHandle`**, sin mover ningún estado de lugar (sigue viviendo
  en los `useState` del componente). Es el patrón estándar de React para
  este problema — exponer métodos imperativos a un caller externo (acá, el
  adaptador que responde a `listenForStateRequests()`) — elegido
  puntualmente para no forzar una reestructuración del módulo (por ejemplo,
  subir todo el estado a un Context o a un store externo) solo para
  resolver la necesidad puntual de leer/escribir estado desde afuera.

- **pako 3.x usa `{ toText: true }` en `pako.ungzip()`, no `{ to: 'string'
  }`.** Esa segunda forma es la API vieja de pako 1.x/2.x y no lanza error
  si se usa por error en 3.x — simplemente no hace lo esperado. Relevante
  para cualquier código futuro que descomprima datos con esta librería en
  este repo.

- **La revocación del blob URL al descargar el `.geoproj` se difiere con
  `setTimeout(() => URL.revokeObjectURL(url), 0)`**, en vez de revocarlo
  inmediatamente después de `link.click()`. Revocar de inmediato puede
  cortar la descarga en algunos navegadores, que todavía no terminaron de
  leer el blob en el momento en que el link dispara la descarga — diferir
  un tick es el patrón estándar para este caso.

- **`hasUnsavedRisk()` trata "el módulo está lanzado" como señal de riesgo
  en sí misma, en vez de rastrear el dirty real de Columnas o
  Hidrogeoquímica.** Rastrear el dirty real cruzaría varios archivos
  (instrumentar `store.subscribe()` en Columnas, algún `useEffect` en
  Hidrogeoquímica) solo para una señal de UI de baja importancia. La
  decisión consciente fue aceptar el costo de algún falso positivo
  ocasional en el aviso de "cambios sin guardar" (por ejemplo, justo
  después de guardar exitosamente, cuando técnicamente ya no hay nada
  pendiente) a cambio de no construir esa instrumentación cruzada.

- **`schemaVersion` arranca en 1**, con `GEOFIELD_APP_VERSION = '0.1'` como
  la primera versión de app formalizada — no existía ningún versionado
  antes del sistema de Proyectos. Cualquier cambio futuro que altere la
  FORMA del estado que expone algún `getXProjectState()` (agregar, quitar,
  renombrar, o cambiar el tipo de un campo persistido) requiere subir
  `PROJECT_SCHEMA_VERSION` y agregar la migración correspondiente en
  `src/projectMigrations.js` — no alcanza con cambiar el código que lee/
  escribe el campo nuevo, porque eso rompe la carga de cualquier `.geoproj`
  guardado con la forma anterior.

## Cuándo pedir una actualización de este sistema

Regla práctica: si un cambio hace que un proyecto guardado **antes** de ese
cambio pudiera no cargar bien **después** de aplicarlo, es momento de subir
`PROJECT_SCHEMA_VERSION` y agregar una migración en
`src/projectMigrations.js` — no de asumir que "total, es un cambio chico" o
que nadie va a tener un `.geoproj` viejo a mano.

## Bug histórico: coma decimal chilena mal interpretada al importar CSV

- **Síntoma.** Números en formato chileno/español (coma decimal, ej.
  `"-59,91"` = −59.91) en las tablas de QA/QC se leían con la coma como
  separador de miles: `"-59,91"` → `-5991`, `"58,58"` → `5858`. En la tabla
  Survey esto producía dips/azimuts de miles de grados y, aguas abajo,
  trazas de sondaje geométricamente imposibles en GIS (la traza no
  conservaba la longitud de arco = MD). También afectaba coordenadas de
  Collar (ej. `"345120,50"` → `34512050`) y cualquier otra columna numérica
  importada por CSV.

- **Causa raíz.** El branch CSV de `readFile()` (en `index.html`) llamaba a
  `XLSX.read(texto, {type:'string'})` **sin** `raw:true`. Sin esa opción,
  SheetJS coerciona los strings numéricos con convención en-US (coma =
  miles) *en el momento de importar*, convirtiendo `"-59,91"` en el número
  `-5991` antes de que ninguna función de la app lo viera. El branch XLSX
  binario (`{type:'array'}`) nunca tuvo el problema porque no coerciona.

- **Corrección.** (1) Se agregó `raw:true` al `XLSX.read()` del CSV, que
  desactiva la coerción en-US (y de paso mejora la autodetección de
  delimitador `,` vs `;`). (2) Se creó `parseLocaleNumber()` como parser de
  números locale-aware centralizado: número→passthrough; solo-coma→decimal
  chilena; punto+coma→europeo (punto=miles, coma=decimal); solo-punto o
  sin-separador→intacto; vacío/no-numérico→`null`. Convención confirmada
  con el usuario: **coma = decimal siempre, sin excepción**, dado el
  contexto geológico chileno. (3) Todos los puntos de parseo de datos
  importados pasan por él: `_numOrNull()`, `isNumeric()`, la validación de
  rango (`Dip`/`Azimut`/`Rake`/`Desde`/`Hasta`) y los colectores de la rosa
  de azimuts. La tabla `Datos hidrogeoquímicos` y el resto usan los mismos
  extractores (`_numOrNull`), así que la corrección es transversal a todas
  las tablas.

- **Remediación de proyectos guardados antes de la corrección.** El snapshot
  del proyecto guarda las celdas crudas (`rows: f.rows`, ver
  `getQaqcProjectState()`). Bajo la versión con bug esas celdas ya se
  guardaron como el número corrupto (`-5991`), no como el texto `"-59,91"`.
  Por lo tanto **reabrir el proyecto NO re-parsea ni arregla el dato** —
  `parseLocaleNumber(-5991)` devuelve `-5991` (paso directo de número). La
  única remediación es **re-importar la tabla origen afectada** (Survey,
  Collar, estructurales, etc.), que ahora parsea bien. No se agregó un
  detector automático de corrupción: la validación existente
  (`validateFile` / "Identificar errores") ya expone el síntoma más
  peligroso (ángulos fuera de `[-90, 90]`), y una heurística general para
  coordenadas daría falsos positivos con valores legítimamente grandes.
