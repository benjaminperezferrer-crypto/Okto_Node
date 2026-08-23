/**
 * src/columnas/geo-symbols.js
 * Simbología geológica para columnas estratigráficas.
 *
 * Inspirada en USGS/FGDC Digital Cartographic Standard for Geologic Map
 * Symbolization (FGDC-STD-013-2006) y en convenciones argentinas (SEGEMAR).
 *
 * Estructura para extensibilidad:
 *   - LITHOLOGY_STYLES  → tabla editable: color base + id de patrón
 *   - PATTERNS[]        → array de strings SVG: agregar aquí nuevos patrones
 *   - CONTACT_DRAW      → objeto con funciones por tipo de contacto
 *   - STRUCT_ICONS      → objeto con funciones por estructura sedimentaria
 *   - GEO_SYMBOLS       → API pública para el renderer
 *
 * Para agregar un nuevo patrón:
 *   1. Añadir entrada en LITHOLOGY_STYLES con { baseColor, patternId: 'gl-nuevo' }
 *   2. Añadir string '<pattern id="gl-nuevo" ...>...</pattern>' a PATTERNS
 *   Sin tocar renderer.js.
 */

(function (globalScope) {
  'use strict';

  // ─────────────────────────────────────────────────────────────────
  // HELPERS INTERNOS
  // ─────────────────────────────────────────────────────────────────

  /** Redondea a 2 decimales para coordenadas SVG. */
  function f(n) { return n.toFixed(2); }

  /** Escapa texto libre de usuario antes de insertarlo en el SVG (evita romper el markup). */
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Luminancia percibida. Acepta '#RRGGBB' o 'rgb(r,g,b)'. True = fondo oscuro. */
  function _isDark(color) {
    if (!color) return false;
    let r, g, b;
    if (color[0] === '#' && color.length >= 7) {
      r = parseInt(color.slice(1, 3), 16);
      g = parseInt(color.slice(3, 5), 16);
      b = parseInt(color.slice(5, 7), 16);
    } else {
      const m = color.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (!m) return false;
      r = +m[1]; g = +m[2]; b = +m[3];
    }
    return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
  }

  /** Color ICS del nivel geológico más específico seleccionado en unit.age. */
  function _getIcsColor(unit) {
    const age = unit && unit.age;
    if (!age) return null;
    const cd = (typeof window !== 'undefined') && window.CHRONOSTRAT_DATA;
    if (!cd) return null;
    const rgb = (cd.findEdad(age.eon, age.era, age.period, age.epoca, age.edad)
      || cd.findEpoca(age.eon, age.era, age.period, age.epoca)
      || cd.findPeriodo(age.eon, age.era, age.period)
      || cd.findEra(age.eon, age.era)
      || cd.findEon(age.eon))?.rgb;
    return rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : null;
  }

  /**
   * Genera un path SVG sinusoidal con bezier cuadráticos.
   * Usado para contactos graduales.
   */
  function wavyPath(x1, y, x2, amp, period) {
    const n  = Math.max(2, Math.round((x2 - x1) / period));
    const dx = (x2 - x1) / n;
    let d = `M ${f(x1)} ${f(y)}`;
    for (let i = 0; i < n; i++) {
      const sx  = x1 + i * dx;
      const ex  = sx + dx;
      const cpx = sx + dx / 2;
      const cpy = y + (i % 2 === 0 ? -amp : amp);
      d += ` Q ${f(cpx)} ${f(cpy)} ${f(ex)} ${f(y)}`;
    }
    return d;
  }

  /**
   * Genera un path SVG dentado.
   * Los dientes apuntan hacia arriba (la erosión proviene de arriba).
   */
  function zigzagPath(x1, y, x2, amp, period) {
    const teeth = Math.max(3, Math.round((x2 - x1) / period));
    const dx    = (x2 - x1) / (teeth * 2);
    let d = `M ${f(x1)} ${f(y)}`;
    for (let i = 0; i < teeth * 2; i++) {
      const xi = x1 + (i + 1) * dx;
      const yi = (i % 2 === 0) ? y - amp : y;
      d += ` L ${f(xi)} ${f(yi)}`;
    }
    return d;
  }

  // ─────────────────────────────────────────────────────────────────
  // TABLA DE ESTILOS POR LITOLOGÍA
  // ─────────────────────────────────────────────────────────────────
  // Editar aquí para personalizar colores y patrones.
  // patternId → id del <pattern> definido en PATTERNS[].
  // textColor → opcional; si se omite se calcula automáticamente por contraste.

  const LITHOLOGY_STYLES = {

    // ── Clásticas ────────────────────────────────────────────────
    'Conglomerado':              { baseColor: '#C89450', patternId: 'gl-conglomerate' },
    'Brecha sedimentaria':       { baseColor: '#BE8040', patternId: 'gl-breccia' },
    'Arenisca gruesa':           { baseColor: '#E8C060', patternId: 'gl-ss-coarse' },
    'Arenisca media':            { baseColor: '#EDD070', patternId: 'gl-ss-medium' },
    'Arenisca fina':             { baseColor: '#F3E090', patternId: 'gl-ss-fine' },
    'Arenisca muy fina':         { baseColor: '#F5E8A0', patternId: 'gl-ss-fine' },
    'Limolita':                  { baseColor: '#D8B060', patternId: 'gl-siltstone' },
    'Arcillita':                 { baseColor: '#8AACC8', patternId: 'gl-shale' },
    'Lutita':                    { baseColor: '#7E9EB8', patternId: 'gl-shale' },
    'Pelita':                    { baseColor: '#8AACC8', patternId: 'gl-shale' },
    'Wacka':                     { baseColor: '#D8B880', patternId: 'gl-ss-medium' },

    // ── Carbonáticas ─────────────────────────────────────────────
    'Caliza':                    { baseColor: '#72C872', patternId: 'gl-limestone' },
    'Caliza arrecifal':          { baseColor: '#5AB85A', patternId: 'gl-limestone' },
    'Caliza dolomítica':         { baseColor: '#70C090', patternId: 'gl-limestone' },
    'Caliza margosa':            { baseColor: '#88C888', patternId: 'gl-limestone' },
    'Dolomía':                   { baseColor: '#48A870', patternId: 'gl-dolostone' },
    'Marga':                     { baseColor: '#A8C8A0', patternId: 'gl-marl' },

    // ── Químicas / bioquímicas ───────────────────────────────────
    'Evaporita':                 { baseColor: '#E8A0B8', patternId: 'gl-evaporite' },
    'Yeso':                      { baseColor: '#ECC0D0', patternId: 'gl-evaporite' },
    'Sal':                       { baseColor: '#F0D0E0', patternId: 'gl-evaporite' },
    'Carbón':                    { baseColor: '#282828', patternId: null, textColor: '#d4d4d4' },
    'Lignito':                   { baseColor: '#383838', patternId: null, textColor: '#cccccc' },
    'Pedernal':                  { baseColor: '#A07878', patternId: 'gl-chert' },
    'Chert':                     { baseColor: '#A07878', patternId: 'gl-chert' },
    'Fosforita':                 { baseColor: '#B090A0', patternId: 'gl-chert' },

    // ── Volcánicas efusivas ──────────────────────────────────────
    'Lava basáltica':            { baseColor: '#505050', patternId: 'gl-basalt', textColor: '#d4d4d4' },
    'Flujo lávico basáltico':    { baseColor: '#505050', patternId: 'gl-basalt', textColor: '#d4d4d4' },
    'Lava almohadillada (pillow)':{ baseColor: '#485E68', patternId: 'gl-pillow', textColor: '#d4d4d4' },
    'Lava andesítica':           { baseColor: '#686868', patternId: 'gl-andesite', textColor: '#d4d4d4' },
    'Lava riolítica':            { baseColor: '#A88060', patternId: 'gl-rhyolite' },
    'Lava dacítica':             { baseColor: '#907870', patternId: 'gl-rhyolite' },

    // ── Piroclásticas ────────────────────────────────────────────
    'Ignimbrita soldada':        { baseColor: '#C85048', patternId: 'gl-ignimbrite', textColor: '#ffe0dc' },
    'Ignimbrita no soldada':     { baseColor: '#D86858', patternId: 'gl-tuff' },
    'Toba':                      { baseColor: '#D08050', patternId: 'gl-tuff' },
    'Toba vítrea':               { baseColor: '#D89060', patternId: 'gl-tuff' },
    'Toba lítica':               { baseColor: '#C07040', patternId: 'gl-tuff-lithic' },
    'Epiclastita volcánica':     { baseColor: '#C08868', patternId: 'gl-tuff' },
    'Lahár':                     { baseColor: '#906040', patternId: 'gl-lahar' },
    'Brecha volcánica':          { baseColor: '#B06050', patternId: 'gl-volcanic-breccia' },
    'Depósito de caída piroclástica': { baseColor: '#E0A870', patternId: 'gl-tuff' },

    // ── Subvolcánicas ────────────────────────────────────────────
    'Dique':                     { baseColor: '#383838', patternId: 'gl-intrusive', textColor: '#cccccc' },
    'Sill':                      { baseColor: '#404040', patternId: 'gl-intrusive', textColor: '#cccccc' },
    'Brecha de dique':           { baseColor: '#484848', patternId: 'gl-intrusive', textColor: '#cccccc' },

    // ── USGS FGDC-STD-013-2006 — Clastic Sedimentary ────────────
    'Gravel':                    { baseColor: '#BF9050', patternId: 'gl-usgs-gravel' },
    'Crossbedded gravel':        { baseColor: '#C09858', patternId: 'gl-usgs-xbd-gravel' },
    'Massive sandstone':         { baseColor: '#EAC868', patternId: 'gl-usgs-massive-ss' },
    'Bedded sandstone':          { baseColor: '#E8C060', patternId: 'gl-usgs-bedded-ss' },
    'Crossbedded sandstone':     { baseColor: '#ECC870', patternId: 'gl-usgs-xbd-ss' },
    'Ripple-marked sandstone':   { baseColor: '#F0D078', patternId: 'gl-usgs-ripple-ss' },
    'Argillaceous sandstone':    { baseColor: '#D8B870', patternId: 'gl-usgs-arg-ss' },
    'Calcareous sandstone':      { baseColor: '#E0C080', patternId: 'gl-usgs-cal-ss' },
    'Sandy siltstone':           { baseColor: '#D0A858', patternId: 'gl-usgs-sandy-silt' },
    'Bedded siltstone':          { baseColor: '#C8A048', patternId: 'gl-usgs-bedded-silt' },
    'Sandy shale':               { baseColor: '#90A0B0', patternId: 'gl-usgs-sandy-shale' },
    'Clay shale':                { baseColor: '#788098', patternId: 'gl-usgs-clay-shale', textColor: '#e0e4f0' },
    'Chalk':                     { baseColor: '#E8F0D8', patternId: 'gl-usgs-chalk' },
    'Sandy limestone':           { baseColor: '#78D078', patternId: 'gl-usgs-sandy-ls' },
    'Fossiliferous limestone':   { baseColor: '#58C858', patternId: 'gl-usgs-fossil-ls' },
    'Oolitic limestone':         { baseColor: '#70D070', patternId: 'gl-usgs-oolitic-ls' },
    'Cherty limestone':          { baseColor: '#60B860', patternId: 'gl-usgs-cherty-ls' },
    'Oolitic dolostone':         { baseColor: '#40A870', patternId: 'gl-usgs-oolitic-dolo' },

    // ── USGS FGDC-STD-013-2006 — Chemical / Organic ──────────────
    'Peat':                      { baseColor: '#604820', patternId: 'gl-usgs-peat', textColor: '#e8d8b8' },
    'Oil shale':                 { baseColor: '#404040', patternId: 'gl-usgs-oil-shale', textColor: '#cccccc' },
    'Bentonite':                 { baseColor: '#C8A0C8', patternId: 'gl-usgs-bentonite' },
    'Glauconite':                { baseColor: '#609060', patternId: 'gl-usgs-glauconite', textColor: '#d8f0d8' },
    'Limonite':                  { baseColor: '#C07840', patternId: 'gl-usgs-limonite' },
    'Chert (USGS)':              { baseColor: '#987060', patternId: 'gl-usgs-chert' },
    'Gypsum (USGS)':             { baseColor: '#E8B8D0', patternId: 'gl-usgs-gypsum' },
    'Salt / Halite':             { baseColor: '#F0E0F0', patternId: 'gl-usgs-salt' },

    // ── USGS FGDC-STD-013-2006 — Glacial / Unconsolidated ────────
    'Till / Diamicton':          { baseColor: '#8898A8', patternId: 'gl-usgs-till', textColor: '#f0f4f8' },
    'Loess':                     { baseColor: '#D8C880', patternId: 'gl-usgs-loess' },

    // ── USGS FGDC-STD-013-2006 — Metamorphic ─────────────────────
    'Metamorphic rock':          { baseColor: '#9080A8', patternId: 'gl-usgs-metamorphic', textColor: '#f0ecff' },
    'Quartzite':                 { baseColor: '#C0B0A0', patternId: 'gl-usgs-quartzite' },
    'Slate':                     { baseColor: '#606880', patternId: 'gl-usgs-slate', textColor: '#e0e4f0' },
    'Phyllite':                  { baseColor: '#707890', patternId: 'gl-usgs-phyllite', textColor: '#e4e8f4' },
    'Schist':                    { baseColor: '#807898', patternId: 'gl-usgs-schist', textColor: '#f0eeff' },
    'Marble':                    { baseColor: '#D8D8D0', patternId: 'gl-usgs-marble' },
    'Gneiss':                    { baseColor: '#908890', patternId: 'gl-usgs-gneiss', textColor: '#f4f0f4' },
    'Serpentinite':              { baseColor: '#507060', patternId: 'gl-usgs-serpentinite', textColor: '#d0e8d8' },

    // ── USGS FGDC-STD-013-2006 — Igneous ─────────────────────────
    'Granite':                   { baseColor: '#D09898', patternId: 'gl-usgs-granite' },
    'Granodiorite':              { baseColor: '#B88898', patternId: 'gl-usgs-granodiorite' },
    'Diorite':                   { baseColor: '#909090', patternId: 'gl-usgs-diorite', textColor: '#f0f0f0' },
    'Gabbro':                    { baseColor: '#606060', patternId: 'gl-usgs-gabbro', textColor: '#e4e4e4' },
    'Peridotite':                { baseColor: '#485840', patternId: 'gl-usgs-peridotite', textColor: '#d0e0c8' },
    'Porphyritic rock':          { baseColor: '#A08080', patternId: 'gl-usgs-porphyritic' },
    'Vitrophyre':                { baseColor: '#303030', patternId: 'gl-usgs-vitrophyre', textColor: '#d0d0d0' },

    // ── USGS — Full catalog additions (remaining codes) ───────────
    // Gravel / Breccia
    'Gravel (2nd option)':       { baseColor: '#B89048', patternId: 'gl-u602' },
    'Breccia (1st option)':      { baseColor: '#BE8040', patternId: 'gl-u605' },
    'Breccia (2nd option)':      { baseColor: '#B07838', patternId: 'gl-u606' },
    // Sandstone variants
    'Crossbedded sandstone (2nd)': { baseColor: '#EBC86A', patternId: 'gl-u610' },
    'Dolomitic sandstone':       { baseColor: '#DCC070', patternId: 'gl-u614' },
    // Siltstone
    'Silt / Siltstone':          { baseColor: '#C8A048', patternId: 'gl-u616' },
    'Calcareous siltstone':      { baseColor: '#C8A860', patternId: 'gl-u617' },
    'Dolomitic siltstone':       { baseColor: '#C0A050', patternId: 'gl-u618' },
    // Shale variants
    'Cherty shale':              { baseColor: '#808898', patternId: 'gl-u621', textColor: '#f0f2f8' },
    'Dolomitic shale':           { baseColor: '#7890A0', patternId: 'gl-u622', textColor: '#e8f0f4' },
    'Calcareous shale':          { baseColor: '#90A898', patternId: 'gl-u623' },
    'Carbonaceous shale':        { baseColor: '#303838', patternId: 'gl-u624', textColor: '#c0c8c8' },
    // Limestone
    'Limestone':                 { baseColor: '#72C872', patternId: 'gl-u627' },
    'Clastic limestone':         { baseColor: '#68C068', patternId: 'gl-u628' },
    'Nodular limestone':         { baseColor: '#60B060', patternId: 'gl-u630' },
    'Limestone saccharoidal dolomite': { baseColor: '#5AB88A', patternId: 'gl-u631' },
    'Crossbedded limestone':     { baseColor: '#70C870', patternId: 'gl-u632' },
    'Cherty crossbedded limestone': { baseColor: '#58B068', patternId: 'gl-u633' },
    'Cherty sandy clastic limestone': { baseColor: '#60A870', patternId: 'gl-u634' },
    'Silty limestone':           { baseColor: '#78C878', patternId: 'gl-u637' },
    'Argillaceous limestone':    { baseColor: '#80B890', patternId: 'gl-u638' },
    'Cherty limestone (2nd)':    { baseColor: '#50A860', patternId: 'gl-u640' },
    'Dolomitic limestone':       { baseColor: '#48A870', patternId: 'gl-u641' },
    // Dolostone
    'Dolostone':                 { baseColor: '#40A068', patternId: 'gl-u642' },
    'Crossbedded dolostone':     { baseColor: '#38A060', patternId: 'gl-u643' },
    'Sandy dolostone':           { baseColor: '#48A878', patternId: 'gl-u645' },
    'Silty dolostone':           { baseColor: '#50A880', patternId: 'gl-u646' },
    'Argillaceous dolostone':    { baseColor: '#58A888', patternId: 'gl-u647' },
    'Cherty dolostone':          { baseColor: '#3A9868', patternId: 'gl-u648' },
    // Chert
    'Bedded chert (1st)':        { baseColor: '#987070', patternId: 'gl-u649' },
    'Bedded chert (2nd)':        { baseColor: '#906868', patternId: 'gl-u650' },
    'Fossiliferous bedded chert': { baseColor: '#886068', patternId: 'gl-u651' },
    // Other sedimentary
    'Fossiliferous rock':        { baseColor: '#58A858', patternId: 'gl-u652' },
    'Diatomaceous rock':         { baseColor: '#D8E0C8', patternId: 'gl-u653' },
    'Subgraywacke':              { baseColor: '#C8A860', patternId: 'gl-u654' },
    'Crossbedded subgraywacke':  { baseColor: '#C0A050', patternId: 'gl-u655' },
    'Ripple-bedded subgraywacke': { baseColor: '#C8A058', patternId: 'gl-u656' },
    'Coal':                      { baseColor: '#181818', patternId: 'gl-u658', textColor: '#c8c8c8' },
    'Bony coal':                 { baseColor: '#282828', patternId: 'gl-u659', textColor: '#c0c0c0' },
    'Underclay':                 { baseColor: '#A09878', patternId: 'gl-u660' },
    'Flint clay':                { baseColor: '#907060', patternId: 'gl-u661' },
    'Siderite':                  { baseColor: '#A08060', patternId: 'gl-u665' },
    'Phosphatic rock':           { baseColor: '#B09880', patternId: 'gl-u666' },
    // Interbedded
    'Interbedded ss/siltstone':  { baseColor: '#D0B050', patternId: 'gl-u669' },
    'Interbedded ss/shale':      { baseColor: '#A89870', patternId: 'gl-u670' },
    'Interbedded ripple ss/shale': { baseColor: '#A89878', patternId: 'gl-u671' },
    'Interbedded shale/ls (shale dom.)': { baseColor: '#7898A0', patternId: 'gl-u672' },
    'Interbedded shale/ls (1st)': { baseColor: '#7890A8', patternId: 'gl-u673' },
    'Interbedded shale/ls (2nd)': { baseColor: '#7888A0', patternId: 'gl-u674' },
    'Interbedded calc-shale/ls': { baseColor: '#90A898', patternId: 'gl-u675' },
    'Interbedded silty ls/shale': { baseColor: '#80A890', patternId: 'gl-u676' },
    'Interbedded ls/shale (1st)': { baseColor: '#78C888', patternId: 'gl-u677' },
    'Interbedded ls/shale (2nd)': { baseColor: '#70C880', patternId: 'gl-u678' },
    'Interbedded ls/shale (ls dom.)': { baseColor: '#68C878', patternId: 'gl-u679' },
    'Interbedded ls/calc-shale': { baseColor: '#60C870', patternId: 'gl-u680' },
    // Glacial / aeolian variants
    'Till (2nd option)':         { baseColor: '#8090A0', patternId: 'gl-u682', textColor: '#f0f4f8' },
    'Till (3rd option)':         { baseColor: '#7888A0', patternId: 'gl-u683', textColor: '#f0f4f8' },
    'Loess (2nd option)':        { baseColor: '#D0C078', patternId: 'gl-u685' },
    'Loess (3rd option)':        { baseColor: '#C8B870', patternId: 'gl-u686' },
    // Metamorphic additional
    'Schistose granite':         { baseColor: '#C0A890', patternId: 'gl-u704' },
    'Contorted schist':          { baseColor: '#705880', patternId: 'gl-u706', textColor: '#e8e0f4' },
    'Schist and gneiss':         { baseColor: '#807090', patternId: 'gl-u707', textColor: '#f0ecff' },
    'Contorted gneiss':          { baseColor: '#988898', patternId: 'gl-u709' },
    'Soapstone / Talc':          { baseColor: '#486858', patternId: 'gl-u710', textColor: '#d0e8d8' },
    // Volcanic / tuffaceous
    'Tuffaceous rock':           { baseColor: '#C07040', patternId: 'gl-u711' },
    'Crystal tuff':              { baseColor: '#C07848', patternId: 'gl-u712' },
    'Devitrified tuff':          { baseColor: '#C08050', patternId: 'gl-u713' },
    'Volcanic breccia and tuff': { baseColor: '#B06050', patternId: 'gl-u714' },
    'Volcanic breccia / agglomerate': { baseColor: '#A85848', patternId: 'gl-u715' },
    'Zeolitic rock':             { baseColor: '#C0A098', patternId: 'gl-u716' },
    'Basaltic flows':            { baseColor: '#484848', patternId: 'gl-u717', textColor: '#c8c8c8' },
    // Igneous additional
    'Granite (2nd option)':      { baseColor: '#C89090', patternId: 'gl-u719' },
    'Banded igneous rock':       { baseColor: '#888888', patternId: 'gl-u720', textColor: '#f0f0f0' },
    'Igneous rock (1st)':        { baseColor: '#A08888', patternId: 'gl-u721' },
    'Igneous rock (2nd)':        { baseColor: '#989090', patternId: 'gl-u722' },
    'Igneous rock (3rd)':        { baseColor: '#888888', patternId: 'gl-u723', textColor: '#f0f0f0' },
    'Igneous rock (4th)':        { baseColor: '#707070', patternId: 'gl-u724', textColor: '#e8e8e8' },
    'Igneous rock (5th)':        { baseColor: '#585858', patternId: 'gl-u725', textColor: '#e0e0e0' },
    'Igneous rock (6th)':        { baseColor: '#585868', patternId: 'gl-u726', textColor: '#dce0e8' },
    'Igneous rock (7th)':        { baseColor: '#484858', patternId: 'gl-u727', textColor: '#d8dce4' },
    'Igneous rock (8th)':        { baseColor: '#404050', patternId: 'gl-u728', textColor: '#d4d8e0' },
    'Porphyritic rock (2nd)':    { baseColor: '#988080', patternId: 'gl-u730' },
    'Quartz':                    { baseColor: '#F0F0E8', patternId: 'gl-u732' },
    'Ore':                       { baseColor: '#403828', patternId: 'gl-u733', textColor: '#d0c8b8' },

    // ── Fallback ─────────────────────────────────────────────────
    '_default':                  { baseColor: '#D8D8D8', patternId: null },
  };

  // ─────────────────────────────────────────────────────────────────
  // PATRONES SVG (FGDC-inspirados)
  // ─────────────────────────────────────────────────────────────────
  // Agregar nuevos patrones aquí sin modificar el renderer.
  // Fondo transparente: el color base viene del rect subyacente.

  const PATTERNS = [

    // ── Arenisca gruesa: puntos grandes (stipple grueso) ─────────
    `<pattern id="gl-ss-coarse" patternUnits="userSpaceOnUse" width="10" height="9">
      <circle cx="2.5" cy="2.5" r="2"   fill="#000000" opacity="0.55"/>
      <circle cx="7.5" cy="7"   r="2"   fill="#000000" opacity="0.55"/>
      <circle cx="7"   cy="2"   r="1.1" fill="#000000" opacity="0.35"/>
      <circle cx="2"   cy="7"   r="1.1" fill="#000000" opacity="0.35"/>
    </pattern>`,

    // ── Arenisca media: puntos medianos ──────────────────────────
    `<pattern id="gl-ss-medium" patternUnits="userSpaceOnUse" width="9" height="8">
      <circle cx="2"   cy="2"   r="1.5" fill="#000000" opacity="0.52"/>
      <circle cx="6.5" cy="6"   r="1.5" fill="#000000" opacity="0.52"/>
      <circle cx="6.5" cy="2"   r="0.9" fill="#000000" opacity="0.35"/>
      <circle cx="2"   cy="6"   r="0.9" fill="#000000" opacity="0.35"/>
    </pattern>`,

    // ── Arenisca fina: puntos pequeños ──────────────────────────
    `<pattern id="gl-ss-fine" patternUnits="userSpaceOnUse" width="7" height="6">
      <circle cx="1.5" cy="1.5" r="1"   fill="#000000" opacity="0.48"/>
      <circle cx="5"   cy="4.5" r="1"   fill="#000000" opacity="0.48"/>
      <circle cx="5"   cy="1.5" r="0.6" fill="#000000" opacity="0.32"/>
      <circle cx="1.5" cy="4.5" r="0.6" fill="#000000" opacity="0.32"/>
    </pattern>`,

    // ── Limolita: puntos muy finos + líneas horizontales ─────────
    `<pattern id="gl-siltstone" patternUnits="userSpaceOnUse" width="8" height="5">
      <circle cx="2"   cy="2"   r="0.6" fill="#000000" opacity="0.45"/>
      <circle cx="6"   cy="4"   r="0.6" fill="#000000" opacity="0.45"/>
      <line x1="0" y1="5" x2="8" y2="5" stroke="#000000" stroke-width="0.4" opacity="0.4"/>
    </pattern>`,

    // ── Lutita/Arcillita: líneas horizontales paralelas ──────────
    `<pattern id="gl-shale" patternUnits="userSpaceOnUse" width="10" height="4">
      <line x1="0" y1="2" x2="10" y2="2" stroke="#000000" stroke-width="0.75"/>
    </pattern>`,

    // ── Caliza: patrón ladrillo ───────────────────────────────────
    `<pattern id="gl-limestone" patternUnits="userSpaceOnUse" width="20" height="8">
      <!-- Líneas horizontales del mortero -->
      <line x1="0"  y1="0" x2="20" y2="0" stroke="#000000" stroke-width="0.7"/>
      <line x1="0"  y1="4" x2="20" y2="4" stroke="#000000" stroke-width="0.7"/>
      <!-- Juntas verticales (alternadas) -->
      <line x1="10" y1="0" x2="10" y2="4" stroke="#000000" stroke-width="0.6"/>
      <line x1="0"  y1="4" x2="0"  y2="8" stroke="#000000" stroke-width="0.6"/>
      <line x1="5"  y1="4" x2="5"  y2="8" stroke="#000000" stroke-width="0.6"/>
      <line x1="15" y1="4" x2="15" y2="8" stroke="#000000" stroke-width="0.6"/>
    </pattern>`,

    // ── Dolomía: ladrillo + marca de dolomita ────────────────────
    `<pattern id="gl-dolostone" patternUnits="userSpaceOnUse" width="20" height="8">
      <line x1="0"  y1="0" x2="20" y2="0" stroke="#000000" stroke-width="0.7"/>
      <line x1="0"  y1="4" x2="20" y2="4" stroke="#000000" stroke-width="0.7"/>
      <line x1="10" y1="0" x2="10" y2="4" stroke="#000000" stroke-width="0.6"/>
      <line x1="0"  y1="4" x2="0"  y2="8" stroke="#000000" stroke-width="0.6"/>
      <line x1="5"  y1="4" x2="5"  y2="8" stroke="#000000" stroke-width="0.6"/>
      <line x1="15" y1="4" x2="15" y2="8" stroke="#000000" stroke-width="0.6"/>
      <!-- Marca de dolomita: pequeña cruz en centro de ladrillo -->
      <line x1="3" y1="2"   x2="6" y2="2"   stroke="#000000" stroke-width="0.5"/>
      <line x1="4.5" y1="1" x2="4.5" y2="3" stroke="#000000" stroke-width="0.5"/>
    </pattern>`,

    // ── Marga: ladrillo + líneas shale (mixto) ───────────────────
    `<pattern id="gl-marl" patternUnits="userSpaceOnUse" width="20" height="6">
      <line x1="0"  y1="0" x2="20" y2="0" stroke="#000000" stroke-width="0.5"/>
      <line x1="0"  y1="3" x2="20" y2="3" stroke="#000000" stroke-width="0.5" stroke-dasharray="4 4"/>
      <line x1="10" y1="0" x2="10" y2="3" stroke="#000000" stroke-width="0.4"/>
    </pattern>`,

    // ── Conglomerado: clastos redondeados ────────────────────────
    `<pattern id="gl-conglomerate" patternUnits="userSpaceOnUse" width="22" height="17">
      <ellipse cx="4.5" cy="4"  rx="3.8" ry="3"   fill="none" stroke="#000000" stroke-width="0.85"/>
      <ellipse cx="15"  cy="5"  rx="4.5" ry="3"   fill="none" stroke="#000000" stroke-width="0.85"/>
      <ellipse cx="5"   cy="13" rx="3.2" ry="2.2" fill="none" stroke="#000000" stroke-width="0.75"/>
      <ellipse cx="17"  cy="13" rx="3.5" ry="2.5" fill="none" stroke="#000000" stroke-width="0.75"/>
      <circle  cx="10"  cy="10" r="2"    fill="none" stroke="#000000" stroke-width="0.7"/>
      <!-- Matriz: puntos finos -->
      <circle cx="9"  cy="2"  r="0.6" fill="#000000" opacity="0.3"/>
      <circle cx="20" cy="8"  r="0.6" fill="#000000" opacity="0.3"/>
      <circle cx="12" cy="15" r="0.6" fill="#000000" opacity="0.3"/>
    </pattern>`,

    // ── Brecha sedimentaria: fragmentos angulosos ─────────────────
    `<pattern id="gl-breccia" patternUnits="userSpaceOnUse" width="22" height="17">
      <polygon points="2,2 8,1 9,6 3,7"    fill="none" stroke="#000000" stroke-width="0.85"/>
      <polygon points="11,3 18,2 18,8 10,7" fill="none" stroke="#000000" stroke-width="0.85"/>
      <polygon points="2,10 7,9 8,15 2,16"  fill="none" stroke="#000000" stroke-width="0.75"/>
      <polygon points="12,11 20,12 19,16 11,15" fill="none" stroke="#000000" stroke-width="0.75"/>
      <polygon points="9,9 12,8 12,11 9,11"  fill="none" stroke="#000000" stroke-width="0.65"/>
    </pattern>`,

    // ── Basalto: rayado diagonal denso (claro sobre oscuro) ───────
    `<pattern id="gl-basalt" patternUnits="userSpaceOnUse" width="6" height="6">
      <line x1="0"  y1="6" x2="6"  y2="0"  stroke="#000000" stroke-width="0.8" opacity="0.55"/>
      <line x1="-2" y1="4" x2="2"  y2="0"  stroke="#000000" stroke-width="0.8" opacity="0.55"/>
      <line x1="4"  y1="6" x2="8"  y2="2"  stroke="#000000" stroke-width="0.8" opacity="0.55"/>
    </pattern>`,

    // ── Lava almohadillada: elipses apiladas ─────────────────────
    `<pattern id="gl-pillow" patternUnits="userSpaceOnUse" width="18" height="14">
      <ellipse cx="5"  cy="4"  rx="4.5" ry="3.5" fill="none" stroke="#000000" stroke-width="0.85" opacity="0.7"/>
      <ellipse cx="14" cy="9"  rx="4"   ry="3"   fill="none" stroke="#000000" stroke-width="0.85" opacity="0.7"/>
      <ellipse cx="15" cy="3"  rx="3"   ry="2"   fill="none" stroke="#000000" stroke-width="0.7"  opacity="0.6"/>
      <ellipse cx="3"  cy="12" rx="2.5" ry="2"   fill="none" stroke="#000000" stroke-width="0.7"  opacity="0.6"/>
    </pattern>`,

    // ── Lava andesítica: rayado oblicuo medio ────────────────────
    `<pattern id="gl-andesite" patternUnits="userSpaceOnUse" width="8" height="8">
      <line x1="0" y1="8" x2="8" y2="0"  stroke="#000000" stroke-width="0.75" opacity="0.5"/>
      <line x1="-2" y1="6" x2="2" y2="0" stroke="#000000" stroke-width="0.75" opacity="0.5"/>
      <line x1="6" y1="8" x2="10" y2="4" stroke="#000000" stroke-width="0.75" opacity="0.5"/>
      <circle cx="4" cy="4" r="0.8" fill="#000000" opacity="0.4"/>
    </pattern>`,

    // ── Riolita/Dacita: rayado grueso + clasto ───────────────────
    `<pattern id="gl-rhyolite" patternUnits="userSpaceOnUse" width="10" height="8">
      <line x1="0" y1="8" x2="8" y2="0" stroke="#000000" stroke-width="0.9" opacity="0.45"/>
      <circle cx="5" cy="5" r="1.3" fill="#000000" opacity="0.3"/>
    </pattern>`,

    // ── Ignimbrita soldada: fiammes (lentes curvadas) ─────────────
    `<pattern id="gl-ignimbrite" patternUnits="userSpaceOnUse" width="18" height="12">
      <!-- Fiammes: lentes aplastadas curvas (claro sobre rojo) -->
      <path d="M 1 5  Q 5 2  10 5 Q 14 8  18 5"  fill="none" stroke="#000000" stroke-width="1.1" opacity="0.85"/>
      <path d="M 0 9  Q 4 12  9 9 Q 13 6  18 9"  fill="none" stroke="#000000" stroke-width="1.1" opacity="0.85"/>
      <path d="M 3 2  Q 5  0   7 2"               fill="none" stroke="#000000" stroke-width="0.8" opacity="0.6"/>
      <path d="M 11 11 Q 14 13 16 11"             fill="none" stroke="#000000" stroke-width="0.8" opacity="0.6"/>
    </pattern>`,

    // ── Toba vítrica/no soldada: triángulos de vidrio ─────────────
    `<pattern id="gl-tuff" patternUnits="userSpaceOnUse" width="14" height="11">
      <polygon points="2,9 5.5,3 9,9"     fill="none" stroke="#000000" stroke-width="0.75"/>
      <polygon points="10,10 12.5,6 15,10" fill="none" stroke="#000000" stroke-width="0.75"/>
      <circle cx="1"  cy="4" r="0.8" fill="#000000" opacity="0.4"/>
      <circle cx="11" cy="2" r="0.8" fill="#000000" opacity="0.4"/>
    </pattern>`,

    // ── Toba lítica: triángulos + clastos redondeados ─────────────
    `<pattern id="gl-tuff-lithic" patternUnits="userSpaceOnUse" width="14" height="11">
      <polygon points="2,9 5.5,3 9,9"  fill="none" stroke="#000000" stroke-width="0.75"/>
      <circle cx="11" cy="6"  r="2.2"  fill="none" stroke="#000000" stroke-width="0.75"/>
      <circle cx="1.5" cy="3" r="0.8"  fill="#000000" opacity="0.4"/>
    </pattern>`,

    // ── Lahár: mezcla de clastos y matriz gruesa ──────────────────
    `<pattern id="gl-lahar" patternUnits="userSpaceOnUse" width="20" height="15">
      <ellipse cx="4"   cy="4"  rx="3.2" ry="2.5" fill="none" stroke="#000000" stroke-width="0.8"/>
      <ellipse cx="14"  cy="10" rx="4"   ry="2.8" fill="none" stroke="#000000" stroke-width="0.8"/>
      <polygon points="10,3 14,2 13,7 9,6" fill="none" stroke="#000000" stroke-width="0.7"/>
      <circle cx="7"  cy="10" r="0.8" fill="#000000" opacity="0.4"/>
      <circle cx="18" cy="4"  r="0.8" fill="#000000" opacity="0.4"/>
    </pattern>`,

    // ── Brecha volcánica: clastos angulosos oscuros ───────────────
    `<pattern id="gl-volcanic-breccia" patternUnits="userSpaceOnUse" width="20" height="15">
      <polygon points="2,2 8,1 8,6 3,7"    fill="none" stroke="#000000" stroke-width="0.8"/>
      <polygon points="11,4 17,3 18,8 11,9" fill="none" stroke="#000000" stroke-width="0.8"/>
      <circle cx="5"  cy="12" r="2.2" fill="none" stroke="#000000" stroke-width="0.7"/>
      <circle cx="15" cy="13" r="1.7" fill="none" stroke="#000000" stroke-width="0.7"/>
    </pattern>`,

    // ── Rocas intrusivas: tramado cruzado (claro sobre oscuro) ────
    `<pattern id="gl-intrusive" patternUnits="userSpaceOnUse" width="8" height="8">
      <line x1="0" y1="0" x2="8" y2="8" stroke="#000000" stroke-width="0.75" opacity="0.5"/>
      <line x1="8" y1="0" x2="0" y2="8" stroke="#000000" stroke-width="0.75" opacity="0.5"/>
    </pattern>`,

    // ── Evaporita: líneas onduladas horizontales ─────────────────
    `<pattern id="gl-evaporite" patternUnits="userSpaceOnUse" width="14" height="6">
      <path d="M 0 3 Q 3.5 1 7 3 Q 10.5 5 14 3" fill="none" stroke="#000000" stroke-width="0.85"/>
    </pattern>`,

    // ── Chert/Pedernal: stipple denso ────────────────────────────
    `<pattern id="gl-chert" patternUnits="userSpaceOnUse" width="6" height="5">
      <circle cx="1"   cy="1"   r="0.5" fill="#000000" opacity="0.5"/>
      <circle cx="4"   cy="3.5" r="0.5" fill="#000000" opacity="0.5"/>
      <circle cx="2.5" cy="4"   r="0.4" fill="#000000" opacity="0.4"/>
      <circle cx="5"   cy="1"   r="0.4" fill="#000000" opacity="0.4"/>
    </pattern>`,

    // ═══════════════════════════════════════════════════════════
    // USGS FGDC-STD-013-2006 PATTERNS
    // ═══════════════════════════════════════════════════════════

    // ── Gravel (601): large rounded pebbles ──────────────────
    `<pattern id="gl-usgs-gravel" patternUnits="userSpaceOnUse" width="26" height="18">
      <ellipse cx="5"  cy="5"  rx="4"   ry="3"   fill="none" stroke="#000000" stroke-width="0.8"/>
      <ellipse cx="17" cy="4"  rx="5"   ry="3.5" fill="none" stroke="#000000" stroke-width="0.8"/>
      <ellipse cx="5"  cy="14" rx="4.5" ry="3"   fill="none" stroke="#000000" stroke-width="0.8"/>
      <ellipse cx="19" cy="13" rx="4"   ry="3.5" fill="none" stroke="#000000" stroke-width="0.8"/>
      <circle  cx="11" cy="9"  r="0.7"  fill="#000000" opacity="0.4"/>
      <circle  cx="24" cy="8"  r="0.7"  fill="#000000" opacity="0.4"/>
    </pattern>`,

    // ── Crossbedded gravel (603): pebbles + foreset lines ────
    `<pattern id="gl-usgs-xbd-gravel" patternUnits="userSpaceOnUse" width="24" height="16">
      <ellipse cx="4"  cy="4"  rx="3.5" ry="2.5" fill="none" stroke="#000000" stroke-width="0.8"/>
      <ellipse cx="15" cy="5"  rx="4"   ry="3"   fill="none" stroke="#000000" stroke-width="0.8"/>
      <ellipse cx="5"  cy="13" rx="3.5" ry="2.5" fill="none" stroke="#000000" stroke-width="0.8"/>
      <ellipse cx="18" cy="12" rx="4"   ry="2.5" fill="none" stroke="#000000" stroke-width="0.8"/>
      <line x1="0"  y1="16" x2="8"  y2="8"  stroke="#000000" stroke-width="0.5" opacity="0.4"/>
      <line x1="8"  y1="16" x2="16" y2="8"  stroke="#000000" stroke-width="0.5" opacity="0.4"/>
      <line x1="16" y1="16" x2="24" y2="8"  stroke="#000000" stroke-width="0.5" opacity="0.4"/>
    </pattern>`,

    // ── Massive sandstone (607): uniform stipple ─────────────
    `<pattern id="gl-usgs-massive-ss" patternUnits="userSpaceOnUse" width="10" height="9">
      <circle cx="2"   cy="2"   r="1.5" fill="#000000" opacity="0.5"/>
      <circle cx="7"   cy="2"   r="1.5" fill="#000000" opacity="0.5"/>
      <circle cx="2"   cy="7"   r="1.5" fill="#000000" opacity="0.5"/>
      <circle cx="7"   cy="7"   r="1.5" fill="#000000" opacity="0.5"/>
      <circle cx="4.5" cy="4.5" r="1"   fill="#000000" opacity="0.3"/>
    </pattern>`,

    // ── Bedded sandstone (608): stipple + bedding line ───────
    `<pattern id="gl-usgs-bedded-ss" patternUnits="userSpaceOnUse" width="10" height="10">
      <circle cx="2"   cy="3"   r="1.3" fill="#000000" opacity="0.5"/>
      <circle cx="7"   cy="3"   r="1.3" fill="#000000" opacity="0.5"/>
      <circle cx="4.5" cy="7"   r="1.3" fill="#000000" opacity="0.5"/>
      <line x1="0" y1="10" x2="10" y2="10" stroke="#000000" stroke-width="0.7"/>
    </pattern>`,

    // ── Crossbedded sandstone (609): stipple + foreset lines ─
    `<pattern id="gl-usgs-xbd-ss" patternUnits="userSpaceOnUse" width="12" height="10">
      <circle cx="2"  cy="2"   r="1.1" fill="#000000" opacity="0.45"/>
      <circle cx="7"  cy="2"   r="1.1" fill="#000000" opacity="0.45"/>
      <circle cx="11" cy="4"   r="1.1" fill="#000000" opacity="0.45"/>
      <circle cx="4"  cy="6"   r="1.1" fill="#000000" opacity="0.45"/>
      <line x1="0"  y1="10" x2="6"  y2="0"  stroke="#000000" stroke-width="0.6" opacity="0.45"/>
      <line x1="6"  y1="10" x2="12" y2="0"  stroke="#000000" stroke-width="0.6" opacity="0.45"/>
    </pattern>`,

    // ── Ripple-marked sandstone (610): stipple + ripple marks ─
    `<pattern id="gl-usgs-ripple-ss" patternUnits="userSpaceOnUse" width="14" height="10">
      <circle cx="2"  cy="4"   r="1.1" fill="#000000" opacity="0.45"/>
      <circle cx="7"  cy="4"   r="1.1" fill="#000000" opacity="0.45"/>
      <circle cx="12" cy="4"   r="1.1" fill="#000000" opacity="0.45"/>
      <path d="M 0 8 Q 3.5 5 7 8 Q 10.5 11 14 8" fill="none" stroke="#000000" stroke-width="0.65"/>
    </pattern>`,

    // ── Argillaceous sandstone (611): stipple + clay laminae ─
    `<pattern id="gl-usgs-arg-ss" patternUnits="userSpaceOnUse" width="10" height="8">
      <circle cx="2.5" cy="2.5" r="1.2" fill="#000000" opacity="0.48"/>
      <circle cx="7.5" cy="2.5" r="1.2" fill="#000000" opacity="0.48"/>
      <circle cx="5"   cy="6"   r="1.2" fill="#000000" opacity="0.48"/>
      <line x1="0" y1="8" x2="10" y2="8" stroke="#000000" stroke-width="0.5" opacity="0.45"/>
    </pattern>`,

    // ── Calcareous sandstone (612): stipple + carbonate marks ─
    `<pattern id="gl-usgs-cal-ss" patternUnits="userSpaceOnUse" width="16" height="10">
      <circle cx="2"  cy="2"   r="1.2" fill="#000000" opacity="0.48"/>
      <circle cx="7"  cy="2"   r="1.2" fill="#000000" opacity="0.48"/>
      <circle cx="12" cy="4"   r="1.2" fill="#000000" opacity="0.48"/>
      <circle cx="4"  cy="7"   r="1.2" fill="#000000" opacity="0.48"/>
      <circle cx="14" cy="8"   r="1.2" fill="#000000" opacity="0.48"/>
      <line x1="6"  y1="6" x2="11" y2="6" stroke="#000000" stroke-width="0.5" opacity="0.5"/>
      <line x1="8"  y1="6" x2="8"  y2="9" stroke="#000000" stroke-width="0.5" opacity="0.5"/>
    </pattern>`,

    // ── Sandy siltstone (614): small dots + horizontal line ──
    `<pattern id="gl-usgs-sandy-silt" patternUnits="userSpaceOnUse" width="8" height="7">
      <circle cx="2" cy="2"   r="1"   fill="#000000" opacity="0.45"/>
      <circle cx="6" cy="5"   r="1"   fill="#000000" opacity="0.45"/>
      <circle cx="6" cy="2"   r="0.6" fill="#000000" opacity="0.35"/>
      <circle cx="2" cy="5"   r="0.6" fill="#000000" opacity="0.35"/>
      <line x1="0" y1="7" x2="8" y2="7" stroke="#000000" stroke-width="0.4" opacity="0.4"/>
    </pattern>`,

    // ── Bedded siltstone (616): tiny dots + bedding lines ────
    `<pattern id="gl-usgs-bedded-silt" patternUnits="userSpaceOnUse" width="8" height="6">
      <circle cx="2" cy="1.5" r="0.5" fill="#000000" opacity="0.4"/>
      <circle cx="6" cy="4"   r="0.5" fill="#000000" opacity="0.4"/>
      <line x1="0" y1="3" x2="8" y2="3" stroke="#000000" stroke-width="0.4" opacity="0.4"/>
      <line x1="0" y1="6" x2="8" y2="6" stroke="#000000" stroke-width="0.4" opacity="0.4"/>
    </pattern>`,

    // ── Sandy shale (619): horizontal lines + medium dots ────
    `<pattern id="gl-usgs-sandy-shale" patternUnits="userSpaceOnUse" width="12" height="6">
      <line x1="0" y1="2" x2="12" y2="2" stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="5" x2="12" y2="5" stroke="#000000" stroke-width="0.7"/>
      <circle cx="3" cy="3.5" r="1" fill="#000000" opacity="0.45"/>
      <circle cx="9" cy="3.5" r="1" fill="#000000" opacity="0.45"/>
    </pattern>`,

    // ── Clay shale (620): dense horizontal lines ──────────────
    `<pattern id="gl-usgs-clay-shale" patternUnits="userSpaceOnUse" width="10" height="3">
      <line x1="0" y1="1"   x2="10" y2="1"   stroke="#000000" stroke-width="0.65"/>
      <line x1="0" y1="2.5" x2="10" y2="2.5" stroke="#000000" stroke-width="0.65"/>
    </pattern>`,

    // ── Chalk (626): very fine light stipple ──────────────────
    `<pattern id="gl-usgs-chalk" patternUnits="userSpaceOnUse" width="6" height="5">
      <circle cx="1.5" cy="1.5" r="0.5"  fill="#000000" opacity="0.3"/>
      <circle cx="4.5" cy="3.5" r="0.5"  fill="#000000" opacity="0.3"/>
      <circle cx="4"   cy="1"   r="0.35" fill="#000000" opacity="0.2"/>
      <circle cx="1"   cy="4"   r="0.35" fill="#000000" opacity="0.2"/>
    </pattern>`,

    // ── Sandy limestone (627): brick + sand dots ──────────────
    `<pattern id="gl-usgs-sandy-ls" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.5"/>
      <circle cx="4"  cy="2.5" r="0.9" fill="#000000" opacity="0.4"/>
      <circle cx="17" cy="2.5" r="0.9" fill="#000000" opacity="0.4"/>
      <circle cx="9"  cy="7.5" r="0.9" fill="#000000" opacity="0.4"/>
    </pattern>`,

    // ── Fossiliferous limestone (629): brick + shell arcs ─────
    `<pattern id="gl-usgs-fossil-ls" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.5"/>
      <path d="M 3 3.5 A 2 1.5 0 0 1 7 3.5"   fill="none" stroke="#000000" stroke-width="0.7"/>
      <path d="M 15 7.5 A 2 1.5 0 0 1 19 7.5" fill="none" stroke="#000000" stroke-width="0.7"/>
    </pattern>`,

    // ── Oolitic limestone (630): brick + ooid circles ─────────
    `<pattern id="gl-usgs-oolitic-ls" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.5"/>
      <circle cx="4"  cy="2.5" r="1.3" fill="none" stroke="#000000" stroke-width="0.55"/>
      <circle cx="17" cy="2.5" r="1.3" fill="none" stroke="#000000" stroke-width="0.55"/>
      <circle cx="9"  cy="7.5" r="1.3" fill="none" stroke="#000000" stroke-width="0.55"/>
    </pattern>`,

    // ── Cherty limestone (633): brick + chert nodules ─────────
    `<pattern id="gl-usgs-cherty-ls" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.5"/>
      <ellipse cx="16" cy="2.5" rx="2.5" ry="1.5" fill="#000000" opacity="0.35"/>
      <ellipse cx="4"  cy="7.5" rx="2"   ry="1.2" fill="#000000" opacity="0.35"/>
    </pattern>`,

    // ── Oolitic dolostone (639): dolostone brick + ooids ──────
    `<pattern id="gl-usgs-oolitic-dolo" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="4"    y1="2"  x2="7"    y2="2"  stroke="#000000" stroke-width="0.45"/>
      <line x1="5.5"  y1="1"  x2="5.5"  y2="3"  stroke="#000000" stroke-width="0.45"/>
      <circle cx="16" cy="2.5" r="1.3" fill="none" stroke="#000000" stroke-width="0.55"/>
      <circle cx="9"  cy="7.5" r="1.3" fill="none" stroke="#000000" stroke-width="0.55"/>
    </pattern>`,

    // ── Peat (657): organic squiggles ─────────────────────────
    `<pattern id="gl-usgs-peat" patternUnits="userSpaceOnUse" width="16" height="10">
      <path d="M 1 3 Q 3 1 5 3 Q 7 5 9 3"     fill="none" stroke="#000000" stroke-width="0.7" opacity="0.7"/>
      <path d="M 7 8 Q 9 6 11 8 Q 13 10 15 8"  fill="none" stroke="#000000" stroke-width="0.7" opacity="0.7"/>
      <circle cx="2"  cy="7" r="0.8" fill="#000000" opacity="0.5"/>
      <circle cx="13" cy="2" r="0.8" fill="#000000" opacity="0.5"/>
    </pattern>`,

    // ── Oil shale (660): dense lines + wavy mark ──────────────
    `<pattern id="gl-usgs-oil-shale" patternUnits="userSpaceOnUse" width="10" height="5">
      <line x1="0" y1="1.5" x2="10" y2="1.5" stroke="#000000" stroke-width="0.6"/>
      <line x1="0" y1="3.5" x2="10" y2="3.5" stroke="#000000" stroke-width="0.6"/>
      <path d="M 0 5 Q 2.5 4 5 5 Q 7.5 6 10 5" fill="none" stroke="#000000" stroke-width="0.45" opacity="0.5"/>
    </pattern>`,

    // ── Bentonite (662): undulating horizontal lines ───────────
    `<pattern id="gl-usgs-bentonite" patternUnits="userSpaceOnUse" width="14" height="6">
      <path d="M 0 2 Q 3.5 0.5 7 2 Q 10.5 3.5 14 2" fill="none" stroke="#000000" stroke-width="0.7"/>
      <path d="M 0 5 Q 3.5 3.5 7 5 Q 10.5 6.5 14 5" fill="none" stroke="#000000" stroke-width="0.7"/>
    </pattern>`,

    // ── Glauconite (663): dots + asterisk marks ───────────────
    `<pattern id="gl-usgs-glauconite" patternUnits="userSpaceOnUse" width="10" height="10">
      <circle cx="2.5" cy="2.5" r="1.2" fill="#000000" opacity="0.55"/>
      <circle cx="7.5" cy="7.5" r="1.2" fill="#000000" opacity="0.55"/>
      <line x1="6"   y1="1.5" x2="9"   y2="1.5" stroke="#000000" stroke-width="0.55"/>
      <line x1="7.5" y1="0"   x2="7.5" y2="3"   stroke="#000000" stroke-width="0.55"/>
      <line x1="6.3" y1="0.7" x2="8.7" y2="2.3" stroke="#000000" stroke-width="0.45"/>
      <line x1="6.3" y1="2.3" x2="8.7" y2="0.7" stroke="#000000" stroke-width="0.45"/>
    </pattern>`,

    // ── Limonite (664): brownish fine stipple ─────────────────
    `<pattern id="gl-usgs-limonite" patternUnits="userSpaceOnUse" width="6" height="5">
      <circle cx="1.5" cy="1.5" r="0.6"  fill="#000000" opacity="0.55"/>
      <circle cx="4.5" cy="3.5" r="0.6"  fill="#000000" opacity="0.55"/>
      <circle cx="4"   cy="1"   r="0.4"  fill="#000000" opacity="0.4"/>
      <circle cx="1"   cy="4"   r="0.4"  fill="#000000" opacity="0.4"/>
      <circle cx="3"   cy="2.5" r="0.35" fill="#000000" opacity="0.35"/>
    </pattern>`,

    // ── Chert USGS (666): dense stipple ───────────────────────
    `<pattern id="gl-usgs-chert" patternUnits="userSpaceOnUse" width="6" height="5">
      <circle cx="1"   cy="1"   r="0.55" fill="#000000" opacity="0.55"/>
      <circle cx="4"   cy="3.5" r="0.55" fill="#000000" opacity="0.55"/>
      <circle cx="2.5" cy="4"   r="0.45" fill="#000000" opacity="0.45"/>
      <circle cx="5"   cy="1"   r="0.45" fill="#000000" opacity="0.45"/>
      <circle cx="1.5" cy="2.5" r="0.35" fill="#000000" opacity="0.4"/>
      <circle cx="4.5" cy="2"   r="0.35" fill="#000000" opacity="0.4"/>
    </pattern>`,

    // ── Gypsum USGS (667): wavy lines + bar marks ─────────────
    `<pattern id="gl-usgs-gypsum" patternUnits="userSpaceOnUse" width="14" height="6">
      <path d="M 0 2 Q 3.5 0 7 2 Q 10.5 4 14 2" fill="none" stroke="#000000" stroke-width="0.8"/>
      <line x1="4"  y1="4" x2="4"  y2="6" stroke="#000000" stroke-width="0.5" opacity="0.6"/>
      <line x1="10" y1="4" x2="10" y2="6" stroke="#000000" stroke-width="0.5" opacity="0.6"/>
    </pattern>`,

    // ── Salt / Halite (668): cubic crystal grid ───────────────
    `<pattern id="gl-usgs-salt" patternUnits="userSpaceOnUse" width="8" height="8">
      <rect x="0.5" y="0.5" width="3" height="3" fill="none" stroke="#000000" stroke-width="0.55"/>
      <rect x="4.5" y="4.5" width="3" height="3" fill="none" stroke="#000000" stroke-width="0.55"/>
      <rect x="4.5" y="0.5" width="3" height="3" fill="none" stroke="#000000" stroke-width="0.4" opacity="0.5"/>
      <rect x="0.5" y="4.5" width="3" height="3" fill="none" stroke="#000000" stroke-width="0.4" opacity="0.5"/>
    </pattern>`,

    // ── Till / Diamicton (681): unsorted angular+round clasts ─
    `<pattern id="gl-usgs-till" patternUnits="userSpaceOnUse" width="24" height="18">
      <polygon points="2,2 7,1 8,6 2,7"         fill="none" stroke="#000000" stroke-width="0.8"/>
      <ellipse cx="15" cy="4"  rx="3.5" ry="3"  fill="none" stroke="#000000" stroke-width="0.8"/>
      <polygon points="10,12 14,11 14,15 10,15"  fill="none" stroke="#000000" stroke-width="0.7"/>
      <ellipse cx="4"  cy="14" rx="3"   ry="1.8" fill="none" stroke="#000000" stroke-width="0.7"/>
      <circle  cx="19" cy="11" r="0.7"  fill="#000000" opacity="0.4"/>
      <circle  cx="8"  cy="9"  r="0.7"  fill="#000000" opacity="0.4"/>
    </pattern>`,

    // ── Loess (684): very fine uniform stipple ────────────────
    `<pattern id="gl-usgs-loess" patternUnits="userSpaceOnUse" width="7" height="6">
      <circle cx="1.5" cy="1.5" r="0.5"  fill="#000000" opacity="0.4"/>
      <circle cx="5"   cy="4"   r="0.5"  fill="#000000" opacity="0.4"/>
      <circle cx="5"   cy="1.5" r="0.4"  fill="#000000" opacity="0.3"/>
      <circle cx="1.5" cy="4"   r="0.4"  fill="#000000" opacity="0.3"/>
      <circle cx="3.2" cy="2.8" r="0.35" fill="#000000" opacity="0.25"/>
    </pattern>`,

    // ── Metamorphic rock (701): diagonal foliation lines ──────
    `<pattern id="gl-usgs-metamorphic" patternUnits="userSpaceOnUse" width="8" height="8">
      <line x1="0"  y1="8" x2="8"  y2="0"  stroke="#000000" stroke-width="0.75"/>
      <line x1="-2" y1="6" x2="2"  y2="0"  stroke="#000000" stroke-width="0.75"/>
      <line x1="6"  y1="8" x2="10" y2="4"  stroke="#000000" stroke-width="0.75"/>
    </pattern>`,

    // ── Quartzite (702): brick + medium stipple ───────────────
    `<pattern id="gl-usgs-quartzite" patternUnits="userSpaceOnUse" width="18" height="8">
      <line x1="0"    y1="0"  x2="18"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="4"  x2="18"   y2="4"  stroke="#000000" stroke-width="0.6"/>
      <line x1="9"    y1="0"  x2="9"    y2="4"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="4"  x2="0"    y2="8"  stroke="#000000" stroke-width="0.5"/>
      <line x1="4.5"  y1="4"  x2="4.5"  y2="8"  stroke="#000000" stroke-width="0.5"/>
      <line x1="13.5" y1="4"  x2="13.5" y2="8"  stroke="#000000" stroke-width="0.5"/>
      <circle cx="4"  cy="2"  r="0.8" fill="#000000" opacity="0.35"/>
      <circle cx="13" cy="2"  r="0.8" fill="#000000" opacity="0.35"/>
      <circle cx="8"  cy="6"  r="0.8" fill="#000000" opacity="0.35"/>
    </pattern>`,

    // ── Slate (703): very close parallel cleavage lines ───────
    `<pattern id="gl-usgs-slate" patternUnits="userSpaceOnUse" width="10" height="3">
      <line x1="0" y1="1"   x2="10" y2="1"   stroke="#000000" stroke-width="0.6"/>
      <line x1="0" y1="2.5" x2="10" y2="2.5" stroke="#000000" stroke-width="0.45" opacity="0.6"/>
    </pattern>`,

    // ── Phyllite (704): slightly wavy parallel lines ──────────
    `<pattern id="gl-usgs-phyllite" patternUnits="userSpaceOnUse" width="14" height="6">
      <path d="M 0 2 Q 3.5 1.2 7 2 Q 10.5 2.8 14 2" fill="none" stroke="#000000" stroke-width="0.65"/>
      <path d="M 0 5 Q 3.5 4.2 7 5 Q 10.5 5.8 14 5" fill="none" stroke="#000000" stroke-width="0.65"/>
    </pattern>`,

    // ── Schist (705): wavy foliation + mica lenses ───────────
    `<pattern id="gl-usgs-schist" patternUnits="userSpaceOnUse" width="14" height="8">
      <path d="M 0 3 Q 3.5 1.5 7 3 Q 10.5 4.5 14 3" fill="none" stroke="#000000" stroke-width="0.7"/>
      <path d="M 0 7 Q 3.5 5.5 7 7 Q 10.5 8.5 14 7" fill="none" stroke="#000000" stroke-width="0.7"/>
      <line x1="3"  y1="1.2" x2="5"  y2="1.8" stroke="#000000" stroke-width="0.55"/>
      <line x1="9"  y1="4.5" x2="11" y2="5.1" stroke="#000000" stroke-width="0.55"/>
    </pattern>`,

    // ── Marble (706): brick + sinuous veins ───────────────────
    `<pattern id="gl-usgs-marble" patternUnits="userSpaceOnUse" width="20" height="8">
      <line x1="0"  y1="0"  x2="20" y2="0"  stroke="#000000" stroke-width="0.55"/>
      <line x1="0"  y1="4"  x2="20" y2="4"  stroke="#000000" stroke-width="0.55"/>
      <line x1="10" y1="0"  x2="10" y2="4"  stroke="#000000" stroke-width="0.45"/>
      <line x1="0"  y1="4"  x2="0"  y2="8"  stroke="#000000" stroke-width="0.45"/>
      <line x1="5"  y1="4"  x2="5"  y2="8"  stroke="#000000" stroke-width="0.45"/>
      <line x1="15" y1="4"  x2="15" y2="8"  stroke="#000000" stroke-width="0.45"/>
      <path d="M 2 1.5 Q 5 2.5 8 1.5"  fill="none" stroke="#000000" stroke-width="0.4" opacity="0.5"/>
      <path d="M 12 6 Q 16 7 20 6"     fill="none" stroke="#000000" stroke-width="0.4" opacity="0.5"/>
    </pattern>`,

    // ── Gneiss (708): alternating compositional bands ─────────
    `<pattern id="gl-usgs-gneiss" patternUnits="userSpaceOnUse" width="16" height="10">
      <rect x="0" y="0" width="16" height="2" fill="#000000" opacity="0.5"/>
      <rect x="0" y="4" width="16" height="2" fill="#000000" opacity="0.5"/>
      <rect x="0" y="8" width="16" height="2" fill="#000000" opacity="0.5"/>
    </pattern>`,

    // ── Serpentinite (710): irregular serpentine mesh ─────────
    `<pattern id="gl-usgs-serpentinite" patternUnits="userSpaceOnUse" width="14" height="14">
      <path d="M 0 4 L 3 0 L 8 2 L 7 7 L 3 8 Z"     fill="none" stroke="#000000" stroke-width="0.7"/>
      <path d="M 7 7 L 11 5 L 14 8 L 12 13 L 7 12 Z" fill="none" stroke="#000000" stroke-width="0.7"/>
      <path d="M 0 10 L 3 8 L 7 12 L 5 14 L 0 14 Z"  fill="none" stroke="#000000" stroke-width="0.6"/>
      <circle cx="5"  cy="4"  r="0.8" fill="#000000" opacity="0.4"/>
      <circle cx="10" cy="10" r="0.8" fill="#000000" opacity="0.4"/>
    </pattern>`,

    // ── Granite (718): salt-and-pepper + quartz cross ─────────
    `<pattern id="gl-usgs-granite" patternUnits="userSpaceOnUse" width="10" height="10">
      <circle cx="2"   cy="2"   r="1.2" fill="#000000" opacity="0.45"/>
      <circle cx="7"   cy="4"   r="1"   fill="#000000" opacity="0.4"/>
      <circle cx="3"   cy="7"   r="0.8" fill="#000000" opacity="0.5"/>
      <circle cx="8"   cy="8"   r="1.2" fill="#000000" opacity="0.4"/>
      <line x1="5" y1="0" x2="5" y2="4" stroke="#000000" stroke-width="0.45" opacity="0.4"/>
      <line x1="3" y1="2" x2="7" y2="2" stroke="#000000" stroke-width="0.45" opacity="0.4"/>
    </pattern>`,

    // ── Granodiorite (719): mixed dark + light minerals ───────
    `<pattern id="gl-usgs-granodiorite" patternUnits="userSpaceOnUse" width="10" height="10">
      <circle cx="2"   cy="2"   r="1.2" fill="#000000" opacity="0.45"/>
      <circle cx="7.5" cy="3"   r="1.1" fill="#000000" opacity="0.45"/>
      <circle cx="3"   cy="7"   r="1"   fill="#000000" opacity="0.4"/>
      <circle cx="8"   cy="8"   r="1.1" fill="#000000" opacity="0.4"/>
      <circle cx="5.5" cy="5.5" r="0.7" fill="#000000" opacity="0.35"/>
    </pattern>`,

    // ── Diorite (723): dark pyroxene + light plagioclase ──────
    `<pattern id="gl-usgs-diorite" patternUnits="userSpaceOnUse" width="10" height="10">
      <circle cx="2.5" cy="2.5" r="1.5" fill="#000000" opacity="0.5"/>
      <circle cx="7.5" cy="2.5" r="1.3" fill="#000000" opacity="0.4"/>
      <circle cx="5"   cy="6.5" r="1.5" fill="#000000" opacity="0.5"/>
      <circle cx="2"   cy="7.5" r="1"   fill="#000000" opacity="0.35"/>
      <circle cx="8.5" cy="7"   r="1.2" fill="#000000" opacity="0.45"/>
    </pattern>`,

    // ── Gabbro (724): coarse dark pyroxene + pale plagioclase ─
    `<pattern id="gl-usgs-gabbro" patternUnits="userSpaceOnUse" width="10" height="10">
      <circle cx="2.5" cy="2.5" r="1.8" fill="#000000" opacity="0.6"/>
      <circle cx="7.5" cy="7.5" r="1.8" fill="#000000" opacity="0.6"/>
      <circle cx="7.5" cy="2.5" r="1.5" fill="#000000" opacity="0.35"/>
      <circle cx="2.5" cy="7.5" r="1.5" fill="#000000" opacity="0.35"/>
    </pattern>`,

    // ── Peridotite (725): olivine hexagons in dark matrix ─────
    `<pattern id="gl-usgs-peridotite" patternUnits="userSpaceOnUse" width="12" height="10">
      <polygon points="3,1 5.5,2 5.5,5 3,6 0.5,5 0.5,2"   fill="none" stroke="#000000" stroke-width="0.7"/>
      <polygon points="9,4 11.5,5 11.5,8 9,9 6.5,8 6.5,5"  fill="none" stroke="#000000" stroke-width="0.7"/>
      <circle cx="8" cy="2" r="0.8" fill="#000000" opacity="0.55"/>
      <circle cx="2" cy="8" r="0.8" fill="#000000" opacity="0.55"/>
    </pattern>`,

    // ── Porphyritic rock (729): phenocrysts in fine matrix ────
    `<pattern id="gl-usgs-porphyritic" patternUnits="userSpaceOnUse" width="16" height="14">
      <rect x="1"  y="1" width="5"   height="4" fill="none" stroke="#000000" stroke-width="0.8"/>
      <rect x="10" y="8" width="5"   height="4" fill="none" stroke="#000000" stroke-width="0.8"/>
      <rect x="8"  y="1" width="3.5" height="3" fill="none" stroke="#000000" stroke-width="0.7"/>
      <circle cx="7"  cy="7"  r="0.6" fill="#000000" opacity="0.35"/>
      <circle cx="3"  cy="10" r="0.6" fill="#000000" opacity="0.35"/>
      <circle cx="13" cy="3"  r="0.6" fill="#000000" opacity="0.35"/>
    </pattern>`,

    // ── Vitrophyre (731): glassy flow banding + spherulites ───
    `<pattern id="gl-usgs-vitrophyre" patternUnits="userSpaceOnUse" width="14" height="8">
      <path d="M 0 3 Q 7 0.5 14 3"     fill="none" stroke="#000000" stroke-width="0.7" opacity="0.55"/>
      <path d="M 0 6.5 Q 7 4 14 6.5"   fill="none" stroke="#000000" stroke-width="0.7" opacity="0.55"/>
      <circle cx="3"  cy="1.5" r="0.7" fill="none" stroke="#000000" stroke-width="0.4" opacity="0.5"/>
      <circle cx="11" cy="5"   r="0.7" fill="none" stroke="#000000" stroke-width="0.4" opacity="0.5"/>
    </pattern>`,

    // ══ USGS full-catalog patterns (remaining codes) ══════════════

    `<pattern id="gl-u602" patternUnits="userSpaceOnUse" width="20" height="14">
      <ellipse cx="4" cy="4" rx="3" ry="2" fill="none" stroke="#000000" stroke-width="0.75"/>
      <ellipse cx="13" cy="3" rx="3.5" ry="2.5" fill="none" stroke="#000000" stroke-width="0.75"/>
      <ellipse cx="5" cy="11" rx="3.5" ry="2" fill="none" stroke="#000000" stroke-width="0.75"/>
      <ellipse cx="15" cy="10" rx="3" ry="2.5" fill="none" stroke="#000000" stroke-width="0.75"/>
      <circle cx="9" cy="7" r="1.5" fill="none" stroke="#000000" stroke-width="0.7"/>
    </pattern>`,

    `<pattern id="gl-u605" patternUnits="userSpaceOnUse" width="20" height="15">
      <polygon points="2,1 7,2 7,7 1,6" fill="none" stroke="#000000" stroke-width="0.85"/>
      <polygon points="10,2 17,1 18,6 11,7" fill="none" stroke="#000000" stroke-width="0.85"/>
      <polygon points="1,10 5,8 7,13 2,14" fill="none" stroke="#000000" stroke-width="0.75"/>
      <polygon points="12,9 18,10 17,14 11,13" fill="none" stroke="#000000" stroke-width="0.75"/>
      <polygon points="8,8 10,7 10,10 7,10" fill="none" stroke="#000000" stroke-width="0.6"/>
    </pattern>`,

    `<pattern id="gl-u606" patternUnits="userSpaceOnUse" width="18" height="14">
      <polygon points="1,2 6,1 7,5 2,5" fill="none" stroke="#000000" stroke-width="0.8"/>
      <polygon points="9,1 15,2 14,6 9,5" fill="none" stroke="#000000" stroke-width="0.8"/>
      <polygon points="2,8 6,7 7,12 2,12" fill="none" stroke="#000000" stroke-width="0.75"/>
      <polygon points="10,8 15,8 14,13 9,12" fill="none" stroke="#000000" stroke-width="0.75"/>
      <circle cx="8" cy="5.5" r="0.6" fill="#000000" opacity="0.4"/>
    </pattern>`,

    `<pattern id="gl-u610" patternUnits="userSpaceOnUse" width="12" height="10">
      <circle cx="2" cy="7" r="1.1" fill="#000000" opacity="0.45"/>
      <circle cx="7" cy="7" r="1.1" fill="#000000" opacity="0.45"/>
      <circle cx="4" cy="3" r="1.1" fill="#000000" opacity="0.45"/>
      <line x1="0" y1="0" x2="6" y2="10" stroke="#000000" stroke-width="0.6" opacity="0.45"/>
      <line x1="6" y1="0" x2="12" y2="10" stroke="#000000" stroke-width="0.6" opacity="0.45"/>
    </pattern>`,

    `<pattern id="gl-u614" patternUnits="userSpaceOnUse" width="12" height="10">
      <circle cx="2" cy="2" r="1.2" fill="#000000" opacity="0.48"/>
      <circle cx="8" cy="3" r="1.2" fill="#000000" opacity="0.48"/>
      <circle cx="3" cy="7" r="1.2" fill="#000000" opacity="0.48"/>
      <line x1="8" y1="6" x2="11" y2="6" stroke="#000000" stroke-width="0.5"/>
      <line x1="9.5" y1="5" x2="9.5" y2="8" stroke="#000000" stroke-width="0.5"/>
    </pattern>`,

    `<pattern id="gl-u616" patternUnits="userSpaceOnUse" width="8" height="6">
      <circle cx="2" cy="1.5" r="0.5" fill="#000000" opacity="0.4"/>
      <circle cx="6" cy="4" r="0.5" fill="#000000" opacity="0.4"/>
      <line x1="0" y1="2" x2="8" y2="2" stroke="#000000" stroke-width="0.35" opacity="0.5"/>
      <line x1="0" y1="4" x2="8" y2="4" stroke="#000000" stroke-width="0.35" opacity="0.5"/>
      <line x1="0" y1="6" x2="8" y2="6" stroke="#000000" stroke-width="0.35" opacity="0.5"/>
    </pattern>`,

    `<pattern id="gl-u617" patternUnits="userSpaceOnUse" width="16" height="8">
      <circle cx="2" cy="2" r="0.5" fill="#000000" opacity="0.4"/>
      <circle cx="8" cy="5" r="0.5" fill="#000000" opacity="0.4"/>
      <circle cx="14" cy="2" r="0.5" fill="#000000" opacity="0.4"/>
      <line x1="0" y1="4" x2="16" y2="4" stroke="#000000" stroke-width="0.4" opacity="0.4"/>
      <line x1="8" y1="0" x2="8" y2="4" stroke="#000000" stroke-width="0.35" opacity="0.35"/>
    </pattern>`,

    `<pattern id="gl-u618" patternUnits="userSpaceOnUse" width="12" height="8">
      <circle cx="2" cy="2" r="0.5" fill="#000000" opacity="0.4"/>
      <circle cx="7" cy="5" r="0.5" fill="#000000" opacity="0.4"/>
      <circle cx="11" cy="2" r="0.5" fill="#000000" opacity="0.4"/>
      <line x1="3" y1="6" x2="6" y2="6" stroke="#000000" stroke-width="0.5"/>
      <line x1="4.5" y1="5" x2="4.5" y2="7.5" stroke="#000000" stroke-width="0.5"/>
    </pattern>`,

    `<pattern id="gl-u621" patternUnits="userSpaceOnUse" width="14" height="6">
      <line x1="0" y1="2" x2="14" y2="2" stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="5" x2="14" y2="5" stroke="#000000" stroke-width="0.7"/>
      <ellipse cx="9" cy="3.5" rx="2.5" ry="1" fill="#000000" opacity="0.4"/>
    </pattern>`,

    `<pattern id="gl-u622" patternUnits="userSpaceOnUse" width="14" height="6">
      <line x1="0" y1="2" x2="14" y2="2" stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="5" x2="14" y2="5" stroke="#000000" stroke-width="0.7"/>
      <line x1="5" y1="3.5" x2="8" y2="3.5" stroke="#000000" stroke-width="0.5"/>
      <line x1="6.5" y1="2.8" x2="6.5" y2="4.5" stroke="#000000" stroke-width="0.5"/>
    </pattern>`,

    `<pattern id="gl-u623" patternUnits="userSpaceOnUse" width="20" height="6">
      <line x1="0" y1="2" x2="20" y2="2" stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="5" x2="20" y2="5" stroke="#000000" stroke-width="0.7"/>
      <line x1="8" y1="2" x2="8" y2="4" stroke="#000000" stroke-width="0.4" opacity="0.45"/>
      <line x1="16" y1="2" x2="16" y2="4" stroke="#000000" stroke-width="0.4" opacity="0.45"/>
      <line x1="4" y1="4" x2="4" y2="6" stroke="#000000" stroke-width="0.4" opacity="0.45"/>
      <line x1="12" y1="4" x2="12" y2="6" stroke="#000000" stroke-width="0.4" opacity="0.45"/>
    </pattern>`,

    `<pattern id="gl-u624" patternUnits="userSpaceOnUse" width="10" height="4">
      <rect x="0" y="0" width="10" height="2" fill="#000000"/>
      <rect x="0" y="2" width="10" height="0.5" fill="#000000" opacity="0.5"/>
    </pattern>`,

    `<pattern id="gl-u627" patternUnits="userSpaceOnUse" width="20" height="8">
      <line x1="0"  y1="0" x2="20" y2="0" stroke="#000000" stroke-width="0.7"/>
      <line x1="0"  y1="4" x2="20" y2="4" stroke="#000000" stroke-width="0.7"/>
      <line x1="10" y1="0" x2="10" y2="4" stroke="#000000" stroke-width="0.6"/>
      <line x1="0"  y1="4" x2="0"  y2="8" stroke="#000000" stroke-width="0.6"/>
      <line x1="5"  y1="4" x2="5"  y2="8" stroke="#000000" stroke-width="0.6"/>
      <line x1="15" y1="4" x2="15" y2="8" stroke="#000000" stroke-width="0.6"/>
    </pattern>`,

    `<pattern id="gl-u628" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.5"/>
      <polygon points="3,2 6,1 6,4 3,4" fill="none" stroke="#000000" stroke-width="0.55"/>
      <polygon points="15,7 18,6 18,9 15,9" fill="none" stroke="#000000" stroke-width="0.55"/>
    </pattern>`,

    `<pattern id="gl-u630" patternUnits="userSpaceOnUse" width="22" height="12">
      <ellipse cx="5"  cy="3"   rx="4"   ry="2.5" fill="none" stroke="#000000" stroke-width="0.7"/>
      <ellipse cx="16" cy="4"   rx="4.5" ry="2.5" fill="none" stroke="#000000" stroke-width="0.7"/>
      <ellipse cx="4"  cy="9"   rx="3.5" ry="2"   fill="none" stroke="#000000" stroke-width="0.7"/>
      <ellipse cx="16" cy="9.5" rx="4"   ry="2"   fill="none" stroke="#000000" stroke-width="0.7"/>
      <ellipse cx="10" cy="6.5" rx="2.5" ry="1.5" fill="none" stroke="#000000" stroke-width="0.6"/>
    </pattern>`,

    `<pattern id="gl-u631" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.5"/>
      <ellipse cx="4"  cy="2.5" rx="1.5" ry="1.2" fill="none" stroke="#000000" stroke-width="0.55"/>
      <ellipse cx="17" cy="7.5" rx="1.3" ry="1"   fill="none" stroke="#000000" stroke-width="0.55"/>
    </pattern>`,

    `<pattern id="gl-u632" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="10" x2="11"   y2="0"  stroke="#000000" stroke-width="0.5" opacity="0.5"/>
      <line x1="11"   y1="10" x2="22"   y2="0"  stroke="#000000" stroke-width="0.5" opacity="0.5"/>
    </pattern>`,

    `<pattern id="gl-u633" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="10" x2="11"   y2="0"  stroke="#000000" stroke-width="0.45" opacity="0.45"/>
      <ellipse cx="16" cy="7.5" rx="2.5" ry="1.5" fill="#000000" opacity="0.35"/>
    </pattern>`,

    `<pattern id="gl-u634" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="10" x2="11"   y2="0"  stroke="#000000" stroke-width="0.45" opacity="0.4"/>
      <circle cx="4"  cy="2.5" r="0.9" fill="#000000" opacity="0.4"/>
      <ellipse cx="16" cy="7.5" rx="2" ry="1" fill="#000000" opacity="0.3"/>
    </pattern>`,

    `<pattern id="gl-u637" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="2.5" x2="22"  y2="2.5" stroke="#000000" stroke-width="0.3" opacity="0.35"/>
      <line x1="0"    y1="7.5" x2="22"  y2="7.5" stroke="#000000" stroke-width="0.3" opacity="0.35"/>
    </pattern>`,

    `<pattern id="gl-u638" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="2.5" x2="22"  y2="2.5" stroke="#000000" stroke-width="0.5" opacity="0.4"/>
      <line x1="0"    y1="7.5" x2="22"  y2="7.5" stroke="#000000" stroke-width="0.5" opacity="0.4"/>
    </pattern>`,

    `<pattern id="gl-u640" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.5"/>
      <circle cx="4"  cy="2.5" r="1.5" fill="#000000" opacity="0.4"/>
      <circle cx="18" cy="7.5" r="1.5" fill="#000000" opacity="0.4"/>
    </pattern>`,

    `<pattern id="gl-u641" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="3"    y1="2.5" x2="6"   y2="2.5" stroke="#000000" stroke-width="0.5"/>
      <line x1="4.5"  y1="1.5" x2="4.5" y2="3.5" stroke="#000000" stroke-width="0.5"/>
      <line x1="10"   y1="6.5" x2="13"  y2="6.5" stroke="#000000" stroke-width="0.4" opacity="0.5"/>
      <line x1="11.5" y1="5.5" x2="11.5" y2="7.5" stroke="#000000" stroke-width="0.4" opacity="0.5"/>
    </pattern>`,

    `<pattern id="gl-u642" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.7"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.7"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.6"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.6"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.6"/>
      <line x1="3"    y1="2.5" x2="6"   y2="2.5" stroke="#000000" stroke-width="0.5"/>
      <line x1="4.5"  y1="1.5" x2="4.5" y2="3.5" stroke="#000000" stroke-width="0.5"/>
      <line x1="14"   y1="7.5" x2="17"  y2="7.5" stroke="#000000" stroke-width="0.5"/>
      <line x1="15.5" y1="6.5" x2="15.5" y2="8.5" stroke="#000000" stroke-width="0.5"/>
    </pattern>`,

    `<pattern id="gl-u643" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.7"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.7"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.6"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.6"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.6"/>
      <line x1="3"    y1="2.5" x2="6"   y2="2.5" stroke="#000000" stroke-width="0.5"/>
      <line x1="4.5"  y1="1.5" x2="4.5" y2="3.5" stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="10" x2="11"   y2="0"  stroke="#000000" stroke-width="0.45" opacity="0.45"/>
      <line x1="11"   y1="10" x2="22"   y2="0"  stroke="#000000" stroke-width="0.45" opacity="0.45"/>
    </pattern>`,

    `<pattern id="gl-u645" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="3"    y1="2.5" x2="6"   y2="2.5" stroke="#000000" stroke-width="0.45"/>
      <line x1="4.5"  y1="1.5" x2="4.5" y2="3.5" stroke="#000000" stroke-width="0.45"/>
      <circle cx="16" cy="2.5" r="0.9" fill="#000000" opacity="0.4"/>
      <circle cx="9"  cy="7.5" r="0.9" fill="#000000" opacity="0.4"/>
    </pattern>`,

    `<pattern id="gl-u646" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="3"    y1="2.5" x2="6"   y2="2.5" stroke="#000000" stroke-width="0.45"/>
      <line x1="4.5"  y1="1.5" x2="4.5" y2="3.5" stroke="#000000" stroke-width="0.45"/>
      <line x1="0"    y1="7.5" x2="22"  y2="7.5" stroke="#000000" stroke-width="0.3" opacity="0.4"/>
    </pattern>`,

    `<pattern id="gl-u647" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="3"    y1="2.5" x2="6"   y2="2.5" stroke="#000000" stroke-width="0.45"/>
      <line x1="4.5"  y1="1.5" x2="4.5" y2="3.5" stroke="#000000" stroke-width="0.45"/>
      <line x1="0"    y1="7.5" x2="22"  y2="7.5" stroke="#000000" stroke-width="0.5" opacity="0.4"/>
    </pattern>`,

    `<pattern id="gl-u648" patternUnits="userSpaceOnUse" width="22" height="10">
      <line x1="0"    y1="0"  x2="22"   y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"    y1="5"  x2="22"   y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="11"   y1="0"  x2="11"   y2="5"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"    y1="5"  x2="0"    y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="5.5"  y1="5"  x2="5.5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="16.5" y1="5"  x2="16.5" y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="3"    y1="2.5" x2="6"   y2="2.5" stroke="#000000" stroke-width="0.45"/>
      <line x1="4.5"  y1="1.5" x2="4.5" y2="3.5" stroke="#000000" stroke-width="0.45"/>
      <ellipse cx="16" cy="7.5" rx="2.5" ry="1.5" fill="#000000" opacity="0.35"/>
    </pattern>`,

    `<pattern id="gl-u649" patternUnits="userSpaceOnUse" width="14" height="8">
      <line x1="0" y1="1" x2="14" y2="1" stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="3" x2="14" y2="3" stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="5" x2="14" y2="5" stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="7" x2="14" y2="7" stroke="#000000" stroke-width="0.7"/>
      <rect x="2" y="1" width="5" height="2" fill="#000000" opacity="0.25"/>
      <rect x="9" y="3" width="4" height="2" fill="#000000" opacity="0.25"/>
    </pattern>`,

    `<pattern id="gl-u650" patternUnits="userSpaceOnUse" width="14" height="8">
      <line x1="0" y1="2" x2="14" y2="2" stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="5" x2="14" y2="5" stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="8" x2="14" y2="8" stroke="#000000" stroke-width="0.7"/>
      <ellipse cx="5"  cy="3.5" rx="2.5" ry="1.2" fill="#000000" opacity="0.45"/>
      <ellipse cx="11" cy="6.5" rx="2"   ry="1"   fill="#000000" opacity="0.45"/>
    </pattern>`,

    `<pattern id="gl-u651" patternUnits="userSpaceOnUse" width="14" height="8">
      <line x1="0" y1="2" x2="14" y2="2" stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="5" x2="14" y2="5" stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="8" x2="14" y2="8" stroke="#000000" stroke-width="0.7"/>
      <path d="M 4 3.5 A 1.5 1 0 0 1 7 3.5"  fill="none" stroke="#000000" stroke-width="0.6"/>
      <path d="M 9 6.5 A 1.5 1 0 0 1 12 6.5" fill="none" stroke="#000000" stroke-width="0.6"/>
    </pattern>`,

    `<pattern id="gl-u652" patternUnits="userSpaceOnUse" width="16" height="12">
      <path d="M 2 4 A 2 1.5 0 0 1 6 4"   fill="none" stroke="#000000" stroke-width="0.7"/>
      <path d="M 10 8 A 2 1.5 0 0 1 14 8" fill="none" stroke="#000000" stroke-width="0.7"/>
      <path d="M 8 2 A 1.5 1 0 0 1 11 2"  fill="none" stroke="#000000" stroke-width="0.6"/>
      <circle cx="3"  cy="8" r="1"  fill="none" stroke="#000000" stroke-width="0.55"/>
      <circle cx="13" cy="3" r="1"  fill="none" stroke="#000000" stroke-width="0.55"/>
    </pattern>`,

    `<pattern id="gl-u653" patternUnits="userSpaceOnUse" width="14" height="12">
      <circle cx="3"  cy="3"  r="2" fill="none" stroke="#000000" stroke-width="0.6"/>
      <line x1="1" y1="3" x2="5" y2="3" stroke="#000000" stroke-width="0.35"/>
      <line x1="3" y1="1" x2="3" y2="5" stroke="#000000" stroke-width="0.35"/>
      <circle cx="10" cy="8"  r="2" fill="none" stroke="#000000" stroke-width="0.6"/>
      <line x1="8" y1="8" x2="12" y2="8" stroke="#000000" stroke-width="0.35"/>
      <line x1="10" y1="6" x2="10" y2="10" stroke="#000000" stroke-width="0.35"/>
      <circle cx="5"  cy="10" r="1.3" fill="none" stroke="#000000" stroke-width="0.5"/>
    </pattern>`,

    `<pattern id="gl-u654" patternUnits="userSpaceOnUse" width="10" height="9">
      <circle cx="2.5" cy="2.5" r="1.4" fill="#000000" opacity="0.5"/>
      <circle cx="7.5" cy="2.5" r="1.2" fill="#000000" opacity="0.45"/>
      <circle cx="2.5" cy="7"   r="1.2" fill="#000000" opacity="0.45"/>
      <circle cx="7.5" cy="7"   r="1.4" fill="#000000" opacity="0.5"/>
      <circle cx="5"   cy="4.5" r="0.9" fill="#000000" opacity="0.35"/>
    </pattern>`,

    `<pattern id="gl-u655" patternUnits="userSpaceOnUse" width="12" height="10">
      <circle cx="2" cy="2" r="1.2" fill="#000000" opacity="0.48"/>
      <circle cx="7" cy="2" r="1.2" fill="#000000" opacity="0.48"/>
      <circle cx="4" cy="6" r="1.2" fill="#000000" opacity="0.48"/>
      <line x1="0" y1="10" x2="6"  y2="0"  stroke="#000000" stroke-width="0.6" opacity="0.45"/>
      <line x1="6" y1="10" x2="12" y2="0"  stroke="#000000" stroke-width="0.6" opacity="0.45"/>
    </pattern>`,

    `<pattern id="gl-u656" patternUnits="userSpaceOnUse" width="14" height="10">
      <circle cx="2"  cy="3" r="1.2" fill="#000000" opacity="0.48"/>
      <circle cx="7"  cy="3" r="1.2" fill="#000000" opacity="0.48"/>
      <circle cx="12" cy="3" r="1.2" fill="#000000" opacity="0.48"/>
      <path d="M 0 7 Q 3.5 4.5 7 7 Q 10.5 9.5 14 7" fill="none" stroke="#000000" stroke-width="0.65"/>
    </pattern>`,

    `<pattern id="gl-u658" patternUnits="userSpaceOnUse" width="10" height="4">
      <rect x="0" y="0" width="10" height="4" fill="#000000"/>
    </pattern>`,

    `<pattern id="gl-u659" patternUnits="userSpaceOnUse" width="10" height="6">
      <rect x="0" y="0" width="10" height="6" fill="#000000"/>
      <circle cx="3" cy="2" r="0.8" fill="#000000" opacity="0.7"/>
      <circle cx="7" cy="4" r="0.8" fill="#000000" opacity="0.7"/>
      <circle cx="1" cy="5" r="0.5" fill="#000000" opacity="0.6"/>
    </pattern>`,

    `<pattern id="gl-u660" patternUnits="userSpaceOnUse" width="10" height="5">
      <line x1="0" y1="1.5" x2="10" y2="1.5" stroke="#000000" stroke-width="0.55"/>
      <line x1="0" y1="3.5" x2="10" y2="3.5" stroke="#000000" stroke-width="0.55"/>
      <circle cx="5" cy="2.5" r="0.5" fill="#000000" opacity="0.35"/>
    </pattern>`,

    `<pattern id="gl-u661" patternUnits="userSpaceOnUse" width="14" height="10">
      <ellipse cx="4"  cy="3"  rx="3"   ry="2"   fill="#000000" opacity="0.45"/>
      <ellipse cx="11" cy="7"  rx="2.5" ry="1.8" fill="#000000" opacity="0.45"/>
      <ellipse cx="10" cy="2"  rx="1.5" ry="1"   fill="#000000" opacity="0.35"/>
      <ellipse cx="3"  cy="8"  rx="2"   ry="1.2" fill="#000000" opacity="0.35"/>
    </pattern>`,

    `<pattern id="gl-u665" patternUnits="userSpaceOnUse" width="10" height="8">
      <polygon points="3,1 5,3 3,5 1,3" fill="none" stroke="#000000" stroke-width="0.6"/>
      <polygon points="8,4 10,6 8,8 6,6" fill="none" stroke="#000000" stroke-width="0.6"/>
      <polygon points="8,0 10,2 8,4 6,2" fill="none" stroke="#000000" stroke-width="0.5" opacity="0.5"/>
    </pattern>`,

    `<pattern id="gl-u666" patternUnits="userSpaceOnUse" width="10" height="8">
      <circle cx="2"   cy="2"   r="1.2" fill="none" stroke="#000000" stroke-width="0.55"/>
      <circle cx="7"   cy="2"   r="1"   fill="none" stroke="#000000" stroke-width="0.55"/>
      <circle cx="4.5" cy="5.5" r="1.3" fill="none" stroke="#000000" stroke-width="0.55"/>
      <circle cx="9"   cy="6"   r="0.9" fill="none" stroke="#000000" stroke-width="0.5"/>
      <circle cx="1"   cy="6.5" r="0.8" fill="none" stroke="#000000" stroke-width="0.5"/>
    </pattern>`,

    `<pattern id="gl-u669" patternUnits="userSpaceOnUse" width="10" height="12">
      <circle cx="2.5" cy="2" r="1.2" fill="#000000" opacity="0.5"/>
      <circle cx="7.5" cy="2" r="1.2" fill="#000000" opacity="0.5"/>
      <line x1="0" y1="5"  x2="10" y2="5"  stroke="#000000" stroke-width="0.7"/>
      <circle cx="2" cy="7.5" r="0.5" fill="#000000" opacity="0.4"/>
      <circle cx="6" cy="8.5" r="0.5" fill="#000000" opacity="0.4"/>
      <line x1="0" y1="9.5" x2="10" y2="9.5" stroke="#000000" stroke-width="0.35" opacity="0.5"/>
      <line x1="0" y1="12"  x2="10" y2="12"  stroke="#000000" stroke-width="0.7"/>
    </pattern>`,

    `<pattern id="gl-u670" patternUnits="userSpaceOnUse" width="10" height="12">
      <circle cx="2.5" cy="2" r="1.2" fill="#000000" opacity="0.5"/>
      <circle cx="7.5" cy="2" r="1.2" fill="#000000" opacity="0.5"/>
      <line x1="0" y1="5"  x2="10" y2="5"  stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="7"  x2="10" y2="7"  stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="9"  x2="10" y2="9"  stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="12" x2="10" y2="12" stroke="#000000" stroke-width="0.7"/>
    </pattern>`,

    `<pattern id="gl-u671" patternUnits="userSpaceOnUse" width="14" height="12">
      <circle cx="2"  cy="2" r="1.1" fill="#000000" opacity="0.45"/>
      <circle cx="7"  cy="2" r="1.1" fill="#000000" opacity="0.45"/>
      <circle cx="12" cy="2" r="1.1" fill="#000000" opacity="0.45"/>
      <path d="M 0 4.5 Q 3.5 3 7 4.5 Q 10.5 6 14 4.5" fill="none" stroke="#000000" stroke-width="0.55"/>
      <line x1="0" y1="6"  x2="14" y2="6"  stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="8"  x2="14" y2="8"  stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="10" x2="14" y2="10" stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="12" x2="14" y2="12" stroke="#000000" stroke-width="0.7"/>
    </pattern>`,

    `<pattern id="gl-u672" patternUnits="userSpaceOnUse" width="20" height="12">
      <line x1="0" y1="1"  x2="20" y2="1"  stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="3"  x2="20" y2="3"  stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="5"  x2="20" y2="5"  stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="7"  x2="20" y2="7"  stroke="#000000" stroke-width="0.5"/>
      <line x1="10" y1="7" x2="10" y2="9"  stroke="#000000" stroke-width="0.45"/>
      <line x1="0" y1="9"  x2="20" y2="9"  stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="11" x2="20" y2="11" stroke="#000000" stroke-width="0.7"/>
    </pattern>`,

    `<pattern id="gl-u673" patternUnits="userSpaceOnUse" width="20" height="12">
      <line x1="0" y1="1"  x2="20" y2="1"  stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="3"  x2="20" y2="3"  stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="6"  x2="20" y2="6"  stroke="#000000" stroke-width="0.5"/>
      <line x1="10" y1="6" x2="10" y2="8"  stroke="#000000" stroke-width="0.45"/>
      <line x1="5"  y1="6" x2="5"  y2="8"  stroke="#000000" stroke-width="0.45"/>
      <line x1="15" y1="6" x2="15" y2="8"  stroke="#000000" stroke-width="0.45"/>
      <line x1="0" y1="8"  x2="20" y2="8"  stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="10" x2="20" y2="10" stroke="#000000" stroke-width="0.7"/>
    </pattern>`,

    `<pattern id="gl-u674" patternUnits="userSpaceOnUse" width="20" height="10">
      <line x1="0" y1="1" x2="20" y2="1" stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="3" x2="20" y2="3" stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="5" x2="20" y2="5" stroke="#000000" stroke-width="0.55"/>
      <line x1="8" y1="5" x2="8" y2="7"  stroke="#000000" stroke-width="0.45"/>
      <line x1="0" y1="7" x2="20" y2="7" stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="9" x2="20" y2="9" stroke="#000000" stroke-width="0.7"/>
    </pattern>`,

    `<pattern id="gl-u675" patternUnits="userSpaceOnUse" width="20" height="10">
      <line x1="0" y1="1" x2="20" y2="1" stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="3" x2="20" y2="3" stroke="#000000" stroke-width="0.7"/>
      <line x1="0" y1="5" x2="20" y2="5" stroke="#000000" stroke-width="0.55"/>
      <line x1="8" y1="5" x2="8" y2="7"  stroke="#000000" stroke-width="0.45"/>
      <line x1="0" y1="7" x2="20" y2="7" stroke="#000000" stroke-width="0.5" stroke-dasharray="3 3"/>
      <line x1="0" y1="9" x2="20" y2="9" stroke="#000000" stroke-width="0.7"/>
    </pattern>`,

    `<pattern id="gl-u676" patternUnits="userSpaceOnUse" width="20" height="10">
      <line x1="0"  y1="1" x2="20" y2="1" stroke="#000000" stroke-width="0.6"/>
      <line x1="8"  y1="1" x2="8"  y2="3" stroke="#000000" stroke-width="0.5"/>
      <line x1="0"  y1="3" x2="20" y2="3" stroke="#000000" stroke-width="0.6"/>
      <line x1="0"  y1="5" x2="20" y2="5" stroke="#000000" stroke-width="0.7"/>
      <line x1="0"  y1="7" x2="20" y2="7" stroke="#000000" stroke-width="0.6"/>
      <line x1="12" y1="7" x2="12" y2="9" stroke="#000000" stroke-width="0.5"/>
      <line x1="0"  y1="9" x2="20" y2="9" stroke="#000000" stroke-width="0.6"/>
    </pattern>`,

    `<pattern id="gl-u677" patternUnits="userSpaceOnUse" width="20" height="10">
      <line x1="0"  y1="0" x2="20" y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"  y1="4" x2="20" y2="4"  stroke="#000000" stroke-width="0.6"/>
      <line x1="10" y1="0" x2="10" y2="4"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"  y1="6" x2="20" y2="6"  stroke="#000000" stroke-width="0.7"/>
      <line x1="0"  y1="8" x2="20" y2="8"  stroke="#000000" stroke-width="0.7"/>
      <line x1="0"  y1="10" x2="20" y2="10" stroke="#000000" stroke-width="0.6"/>
    </pattern>`,

    `<pattern id="gl-u678" patternUnits="userSpaceOnUse" width="20" height="10">
      <line x1="0"  y1="0" x2="20" y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"  y1="4" x2="20" y2="4"  stroke="#000000" stroke-width="0.6"/>
      <line x1="5"  y1="0" x2="5"  y2="4"  stroke="#000000" stroke-width="0.5"/>
      <line x1="15" y1="0" x2="15" y2="4"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"  y1="7" x2="20" y2="7"  stroke="#000000" stroke-width="0.7"/>
      <line x1="0"  y1="10" x2="20" y2="10" stroke="#000000" stroke-width="0.6"/>
    </pattern>`,

    `<pattern id="gl-u679" patternUnits="userSpaceOnUse" width="20" height="10">
      <line x1="0"  y1="0" x2="20" y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"  y1="3" x2="20" y2="3"  stroke="#000000" stroke-width="0.6"/>
      <line x1="10" y1="0" x2="10" y2="3"  stroke="#000000" stroke-width="0.5"/>
      <line x1="0"  y1="5" x2="20" y2="5"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"  y1="7" x2="20" y2="7"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"  y1="10" x2="20" y2="10" stroke="#000000" stroke-width="0.6"/>
      <line x1="5"  y1="7" x2="5"  y2="10" stroke="#000000" stroke-width="0.5"/>
      <line x1="15" y1="7" x2="15" y2="10" stroke="#000000" stroke-width="0.5"/>
    </pattern>`,

    `<pattern id="gl-u680" patternUnits="userSpaceOnUse" width="20" height="10">
      <line x1="0"  y1="0" x2="20" y2="0"  stroke="#000000" stroke-width="0.6"/>
      <line x1="0"  y1="4" x2="20" y2="4"  stroke="#000000" stroke-width="0.6"/>
      <line x1="10" y1="0" x2="10" y2="4"  stroke="#000000" stroke-width="0.5"/>
      <path d="M 0 6 Q 5 5 10 6 Q 15 7 20 6" fill="none" stroke="#000000" stroke-width="0.6"/>
      <path d="M 0 9 Q 5 8 10 9 Q 15 10 20 9" fill="none" stroke="#000000" stroke-width="0.6"/>
    </pattern>`,

    `<pattern id="gl-u682" patternUnits="userSpaceOnUse" width="22" height="16">
      <polygon points="5,1 9,3 8,7 4,8 1,5"       fill="none" stroke="#000000" stroke-width="0.8"/>
      <ellipse cx="16" cy="5"  rx="4"   ry="3"   fill="none" stroke="#000000" stroke-width="0.8"/>
      <ellipse cx="4"  cy="13" rx="3"   ry="2.5" fill="none" stroke="#000000" stroke-width="0.7"/>
      <polygon points="13,11 17,10 18,14 14,15"    fill="none" stroke="#000000" stroke-width="0.7"/>
      <circle  cx="10" cy="10" r="0.7"             fill="#000000" opacity="0.4"/>
    </pattern>`,

    `<pattern id="gl-u683" patternUnits="userSpaceOnUse" width="20" height="14">
      <ellipse cx="5"  cy="4"  rx="4"   ry="2.5" fill="none" stroke="#000000" stroke-width="0.8"/>
      <ellipse cx="15" cy="5"  rx="3.5" ry="2.5" fill="none" stroke="#000000" stroke-width="0.8"/>
      <ellipse cx="4"  cy="11" rx="3"   ry="2"   fill="none" stroke="#000000" stroke-width="0.7"/>
      <ellipse cx="14" cy="11" rx="4"   ry="2"   fill="none" stroke="#000000" stroke-width="0.7"/>
      <circle  cx="10" cy="7"  r="0.6"            fill="#000000" opacity="0.35"/>
      <circle  cx="18" cy="9"  r="0.6"            fill="#000000" opacity="0.35"/>
    </pattern>`,

    `<pattern id="gl-u685" patternUnits="userSpaceOnUse" width="8" height="7">
      <circle cx="2"   cy="2"   r="0.55" fill="#000000" opacity="0.4"/>
      <circle cx="6"   cy="5"   r="0.55" fill="#000000" opacity="0.4"/>
      <circle cx="5.5" cy="2"   r="0.45" fill="#000000" opacity="0.3"/>
      <circle cx="2"   cy="5.5" r="0.45" fill="#000000" opacity="0.3"/>
    </pattern>`,

    `<pattern id="gl-u686" patternUnits="userSpaceOnUse" width="7" height="5">
      <circle cx="1.5" cy="1.5" r="0.45" fill="#000000" opacity="0.35"/>
      <circle cx="4.5" cy="3.5" r="0.45" fill="#000000" opacity="0.35"/>
      <circle cx="4"   cy="1"   r="0.35" fill="#000000" opacity="0.25"/>
      <circle cx="1"   cy="4"   r="0.35" fill="#000000" opacity="0.25"/>
    </pattern>`,

    `<pattern id="gl-u704" patternUnits="userSpaceOnUse" width="14" height="10">
      <path d="M 0 3 Q 3.5 2 7 3 Q 10.5 4 14 3" fill="none" stroke="#000000" stroke-width="0.7"/>
      <path d="M 0 7 Q 3.5 6 7 7 Q 10.5 8 14 7" fill="none" stroke="#000000" stroke-width="0.7"/>
      <circle cx="3"  cy="5" r="1.5" fill="none" stroke="#000000" stroke-width="0.6"/>
      <circle cx="10" cy="5" r="1.8" fill="none" stroke="#000000" stroke-width="0.6"/>
    </pattern>`,

    `<pattern id="gl-u706" patternUnits="userSpaceOnUse" width="14" height="8">
      <path d="M 0 2 Q 2 0 4 2 Q 6 4 8 2 Q 10 0 12 2 Q 13 3 14 2" fill="none" stroke="#000000" stroke-width="0.7"/>
      <path d="M 0 6 Q 2 4 4 6 Q 6 8 8 6 Q 10 4 12 6 Q 13 7 14 6" fill="none" stroke="#000000" stroke-width="0.7"/>
    </pattern>`,

    `<pattern id="gl-u707" patternUnits="userSpaceOnUse" width="16" height="10">
      <path d="M 0 2 Q 4 1 8 2 Q 12 3 16 2" fill="none" stroke="#000000" stroke-width="0.7"/>
      <path d="M 0 5 Q 4 4 8 5 Q 12 6 16 5" fill="none" stroke="#000000" stroke-width="0.7"/>
      <rect x="0" y="7" width="16" height="2" fill="#000000" opacity="0.45"/>
    </pattern>`,

    `<pattern id="gl-u709" patternUnits="userSpaceOnUse" width="20" height="12">
      <path d="M 0 2 Q 5 0 10 2 Q 15 4 20 2"  fill="none" stroke="#000000" stroke-width="1.5" opacity="0.45"/>
      <path d="M 0 6 Q 5 4 10 6 Q 15 8 20 6"  fill="none" stroke="#000000" stroke-width="1.5" opacity="0.45"/>
      <path d="M 0 10 Q 5 8 10 10 Q 15 12 20 10" fill="none" stroke="#000000" stroke-width="1.5" opacity="0.45"/>
    </pattern>`,

    `<pattern id="gl-u710" patternUnits="userSpaceOnUse" width="14" height="14">
      <path d="M 0 4 L 4 0 L 9 2 L 8 7 L 4 8 Z"     fill="none" stroke="#000000" stroke-width="0.7"/>
      <path d="M 8 7 L 12 5 L 14 9 L 12 13 L 7 12 Z" fill="none" stroke="#000000" stroke-width="0.7"/>
      <path d="M 0 10 L 4 8 L 7 12 L 5 14 L 0 14 Z"  fill="none" stroke="#000000" stroke-width="0.6"/>
      <circle cx="5" cy="4"  r="0.7" fill="#000000" opacity="0.35"/>
    </pattern>`,

    `<pattern id="gl-u711" patternUnits="userSpaceOnUse" width="14" height="11">
      <polygon points="2,9 5.5,3 9,9"      fill="none" stroke="#000000" stroke-width="0.75"/>
      <polygon points="10,10 12.5,6 15,10" fill="none" stroke="#000000" stroke-width="0.75"/>
      <line x1="0"  y1="9"  x2="14" y2="9"  stroke="#000000" stroke-width="0.4" opacity="0.4"/>
    </pattern>`,

    `<pattern id="gl-u712" patternUnits="userSpaceOnUse" width="16" height="12">
      <polygon points="4,10 7,5 10,10"    fill="none" stroke="#000000" stroke-width="0.75"/>
      <polygon points="1,5 4,1 6,4"        fill="none" stroke="#000000" stroke-width="0.6"/>
      <polygon points="11,4 13,1 15,4"     fill="none" stroke="#000000" stroke-width="0.6"/>
      <circle cx="12" cy="9" r="1" fill="none" stroke="#000000" stroke-width="0.55"/>
    </pattern>`,

    `<pattern id="gl-u713" patternUnits="userSpaceOnUse" width="14" height="10">
      <ellipse cx="3"  cy="3"  rx="2.5" ry="2" fill="none" stroke="#000000" stroke-width="0.7"/>
      <ellipse cx="10" cy="7"  rx="3"   ry="2" fill="none" stroke="#000000" stroke-width="0.7"/>
      <ellipse cx="11" cy="2"  rx="2"   ry="1.5" fill="none" stroke="#000000" stroke-width="0.6"/>
      <circle  cx="4"  cy="8"  r="1"    fill="none" stroke="#000000" stroke-width="0.55"/>
    </pattern>`,

    `<pattern id="gl-u714" patternUnits="userSpaceOnUse" width="20" height="15">
      <polygon points="2,2 6,1 7,6 2,6"   fill="none" stroke="#000000" stroke-width="0.8"/>
      <polygon points="12,4 18,3 18,8 12,9" fill="none" stroke="#000000" stroke-width="0.8"/>
      <polygon points="4,9 7,8 9,12 5,12" fill="none" stroke="#000000" stroke-width="0.7"/>
      <polygon points="8,11 11,11 10,14 7,14" fill="none" stroke="#000000" stroke-width="0.65"/>
    </pattern>`,

    `<pattern id="gl-u715" patternUnits="userSpaceOnUse" width="22" height="18">
      <ellipse cx="5"  cy="5"  rx="4"   ry="4"   fill="none" stroke="#000000" stroke-width="0.9"/>
      <ellipse cx="16" cy="6"  rx="4.5" ry="3.5" fill="none" stroke="#000000" stroke-width="0.9"/>
      <polygon points="3,13 7,11 9,15 4,16"  fill="none" stroke="#000000" stroke-width="0.8"/>
      <ellipse cx="16" cy="14" rx="3.5" ry="3"   fill="none" stroke="#000000" stroke-width="0.8"/>
    </pattern>`,

    `<pattern id="gl-u716" patternUnits="userSpaceOnUse" width="14" height="12">
      <ellipse cx="4"  cy="4"  rx="2.5" ry="2"   fill="none" stroke="#000000" stroke-width="0.6"/>
      <ellipse cx="10" cy="8"  rx="3"   ry="2"   fill="none" stroke="#000000" stroke-width="0.6"/>
      <ellipse cx="11" cy="3"  rx="2"   ry="1.5" fill="none" stroke="#000000" stroke-width="0.55"/>
      <ellipse cx="3"  cy="10" rx="2"   ry="1.3" fill="none" stroke="#000000" stroke-width="0.55"/>
      <circle  cx="7"  cy="6"  r="1.2"  fill="none" stroke="#000000" stroke-width="0.5"/>
    </pattern>`,

    `<pattern id="gl-u717" patternUnits="userSpaceOnUse" width="12" height="8">
      <path d="M 0 2 Q 6 0 12 2" fill="none" stroke="#000000" stroke-width="0.9" opacity="0.6"/>
      <path d="M 0 5 Q 6 3 12 5" fill="none" stroke="#000000" stroke-width="0.9" opacity="0.6"/>
      <line x1="0" y1="8" x2="12" y2="8" stroke="#000000" stroke-width="0.7" opacity="0.5"/>
    </pattern>`,

    `<pattern id="gl-u719" patternUnits="userSpaceOnUse" width="10" height="10">
      <circle cx="2"   cy="3"   r="1.3" fill="#000000" opacity="0.4"/>
      <circle cx="7.5" cy="2"   r="1.1" fill="#000000" opacity="0.45"/>
      <circle cx="3"   cy="7.5" r="1.1" fill="#000000" opacity="0.4"/>
      <circle cx="8"   cy="7"   r="1.3" fill="#000000" opacity="0.4"/>
      <circle cx="5.5" cy="5"   r="0.8" fill="#000000" opacity="0.3"/>
    </pattern>`,

    `<pattern id="gl-u720" patternUnits="userSpaceOnUse" width="16" height="10">
      <rect x="0" y="0" width="16" height="2" fill="#000000" opacity="0.55"/>
      <rect x="0" y="4" width="16" height="2" fill="#000000" opacity="0.55"/>
      <rect x="0" y="8" width="16" height="2" fill="#000000" opacity="0.55"/>
    </pattern>`,

    `<pattern id="gl-u721" patternUnits="userSpaceOnUse" width="10" height="10">
      <circle cx="2.5" cy="2.5" r="1.3" fill="#000000" opacity="0.45"/>
      <circle cx="7.5" cy="2.5" r="1.1" fill="#000000" opacity="0.4"/>
      <circle cx="2.5" cy="7.5" r="1.1" fill="#000000" opacity="0.4"/>
      <circle cx="7.5" cy="7.5" r="1.3" fill="#000000" opacity="0.45"/>
    </pattern>`,

    `<pattern id="gl-u722" patternUnits="userSpaceOnUse" width="10" height="10">
      <circle cx="2"   cy="2.5" r="1.3" fill="#000000" opacity="0.5"/>
      <circle cx="7.5" cy="2"   r="1.2" fill="#000000" opacity="0.45"/>
      <circle cx="2"   cy="7.5" r="1.2" fill="#000000" opacity="0.5"/>
      <circle cx="7.5" cy="7.5" r="1.4" fill="#000000" opacity="0.5"/>
      <circle cx="5"   cy="5"   r="0.8" fill="#000000" opacity="0.35"/>
    </pattern>`,

    `<pattern id="gl-u723" patternUnits="userSpaceOnUse" width="10" height="10">
      <circle cx="2.5" cy="2.5" r="1.5" fill="#000000" opacity="0.5"/>
      <circle cx="7.5" cy="2.5" r="1.3" fill="#000000" opacity="0.4"/>
      <circle cx="5"   cy="6.5" r="1.5" fill="#000000" opacity="0.5"/>
      <circle cx="2"   cy="7.5" r="1"   fill="#000000" opacity="0.35"/>
      <circle cx="8.5" cy="7"   r="1.2" fill="#000000" opacity="0.45"/>
    </pattern>`,

    `<pattern id="gl-u724" patternUnits="userSpaceOnUse" width="10" height="10">
      <circle cx="2.5" cy="2.5" r="1.8" fill="#000000" opacity="0.6"/>
      <circle cx="7.5" cy="7.5" r="1.8" fill="#000000" opacity="0.6"/>
      <circle cx="7.5" cy="2.5" r="1.5" fill="#000000" opacity="0.35"/>
      <circle cx="2.5" cy="7.5" r="1.5" fill="#000000" opacity="0.35"/>
    </pattern>`,

    `<pattern id="gl-u725" patternUnits="userSpaceOnUse" width="10" height="10">
      <circle cx="2.5" cy="2.5" r="2"   fill="#000000" opacity="0.65"/>
      <circle cx="7.5" cy="7.5" r="2"   fill="#000000" opacity="0.65"/>
      <circle cx="7.5" cy="2.5" r="1.6" fill="#000000" opacity="0.4"/>
      <circle cx="2.5" cy="7.5" r="1.6" fill="#000000" opacity="0.4"/>
    </pattern>`,

    `<pattern id="gl-u726" patternUnits="userSpaceOnUse" width="10" height="10">
      <circle cx="2.5" cy="2.5" r="1.8" fill="#000000" opacity="0.7"/>
      <circle cx="7.5" cy="7.5" r="1.8" fill="#000000" opacity="0.7"/>
      <circle cx="7.5" cy="2.5" r="1.5" fill="#000000" opacity="0.4"/>
      <circle cx="2.5" cy="7.5" r="1.5" fill="#000000" opacity="0.4"/>
      <circle cx="5"   cy="5"   r="0.8" fill="#000000" opacity="0.5"/>
    </pattern>`,

    `<pattern id="gl-u727" patternUnits="userSpaceOnUse" width="10" height="10">
      <circle cx="2.5" cy="2.5" r="2"   fill="#000000" opacity="0.75"/>
      <circle cx="7.5" cy="7.5" r="2"   fill="#000000" opacity="0.75"/>
      <circle cx="7.5" cy="2.5" r="1.6" fill="#000000" opacity="0.45"/>
      <circle cx="2.5" cy="7.5" r="1.6" fill="#000000" opacity="0.45"/>
    </pattern>`,

    `<pattern id="gl-u728" patternUnits="userSpaceOnUse" width="10" height="10">
      <rect x="0" y="0" width="10" height="10" fill="#000000" opacity="0.6"/>
      <circle cx="2.5" cy="2.5" r="1.8" fill="#000000" opacity="0.5"/>
      <circle cx="7.5" cy="7.5" r="1.8" fill="#000000" opacity="0.5"/>
      <circle cx="7.5" cy="2.5" r="1.5" fill="#000000" opacity="0.3"/>
    </pattern>`,

    `<pattern id="gl-u730" patternUnits="userSpaceOnUse" width="16" height="14">
      <circle cx="5"   cy="4"   r="2.5" fill="none" stroke="#000000" stroke-width="0.8"/>
      <circle cx="12"  cy="10"  r="2"   fill="none" stroke="#000000" stroke-width="0.8"/>
      <rect   x="10"   y="1"    width="4" height="3" fill="none" stroke="#000000" stroke-width="0.7"/>
      <circle cx="3"   cy="11"  r="1.5" fill="none" stroke="#000000" stroke-width="0.7"/>
      <circle cx="7"   cy="7"   r="0.6" fill="#000000" opacity="0.35"/>
    </pattern>`,

    `<pattern id="gl-u732" patternUnits="userSpaceOnUse" width="6" height="5">
      <circle cx="1.5" cy="1.5" r="0.4" fill="#000000" opacity="0.3"/>
      <circle cx="4.5" cy="3.5" r="0.4" fill="#000000" opacity="0.3"/>
      <circle cx="4"   cy="1"   r="0.3" fill="#000000" opacity="0.2"/>
      <circle cx="1"   cy="4"   r="0.3" fill="#000000" opacity="0.2"/>
    </pattern>`,

    `<pattern id="gl-u733" patternUnits="userSpaceOnUse" width="8" height="8">
      <rect x="0" y="0" width="8" height="8" fill="#000000" opacity="0.7"/>
      <line x1="0" y1="4" x2="8" y2="4" stroke="#000000" stroke-width="0.5" opacity="0.5"/>
      <circle cx="2"   cy="2"   r="1"   fill="#000000" opacity="0.4"/>
      <circle cx="6"   cy="6"   r="1.2" fill="#000000" opacity="0.45"/>
    </pattern>`,

  ]; // fin PATTERNS


  // ─────────────────────────────────────────────────────────────────
  // FUNCIÓN DE DEFS SVG
  // Retorna el bloque <defs> con todos los patrones.
  // ─────────────────────────────────────────────────────────────────

  function getSVGDefs() {
    return `<defs>\n${PATTERNS.join('\n')}\n</defs>`;
  }


  // ─────────────────────────────────────────────────────────────────
  // DIBUJO DE CONTACTOS
  // ─────────────────────────────────────────────────────────────────

  const CONTACT_DRAW = {

    neto(x1, y, x2) {
      return `<line x1="${f(x1)}" y1="${f(y)}" x2="${f(x2)}" y2="${f(y)}"
                    stroke="#1e293b" stroke-width="2"/>`;
    },

    gradual(x1, y, x2) {
      return `<path d="${wavyPath(x1, y, x2, 3.5, 16)}"
                    fill="none" stroke="#475569" stroke-width="1.6"/>`;
    },

    erosivo(x1, y, x2) {
      // Dientes hacia arriba: la erosión viene de arriba
      return `<path d="${zigzagPath(x1, y, x2, 4.5, 9)}"
                    fill="none" stroke="#b45309" stroke-width="2"/>`;
    },

    tectonico(x1, y, x2) {
      // Línea roja gruesa + triángulos de cabalgamiento
      const spacing = 20;
      let tris = '';
      for (let x = x1 + spacing / 2; x < x2 - 6; x += spacing) {
        tris += `<polygon points="${f(x)},${f(y)} ${f(x - 5)},${f(y + 6)} ${f(x + 5)},${f(y + 6)}"
                          fill="#dc2626"/>`;
      }
      return `<line x1="${f(x1)}" y1="${f(y)}" x2="${f(x2)}" y2="${f(y)}"
                    stroke="#dc2626" stroke-width="2.5"/>` + tris;
    },

    no_expuesto(x1, y, x2) {
      return `<line x1="${f(x1)}" y1="${f(y)}" x2="${f(x2)}" y2="${f(y)}"
                    stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="2 5"/>`;
    },
  };

  function drawContact(contactType, x1, y, x2) {
    const fn = CONTACT_DRAW[contactType] ?? CONTACT_DRAW.neto;
    return fn(x1, y, x2);
  }


  // ─────────────────────────────────────────────────────────────────
  // INDICADOR DE CONTENIDO FOSILÍFERO
  // ─────────────────────────────────────────────────────────────────

  const FOSSIL_COLOR = '#1a6b35';

  function drawFossil(unit, rx, ry, rw, rh) {
    const level = unit.fossilContent;
    if (!level || level === 'esteril' || rh < 14) return '';

    // Ancla en la esquina inferior derecha del rect
    const bx = rx + rw - 5;
    const by = ry + rh - 5;

    switch (level) {
      case 'escasos':
        return _fossilCircle(bx - 3, by - 3, 3.2);

      case 'comun':
        return _fossilCircle(bx - 9, by - 3, 3.2)
             + _fossilCircle(bx - 3, by - 3, 3.2);

      case 'abundante':
        return _fossilCircle(bx - 15, by - 3, 3.2)
             + _fossilCircle(bx - 9,  by - 3, 3.2)
             + _fossilCircle(bx - 3,  by - 3, 3.2)
             + (rh >= 26
                ? `<text x="${f(rx + rw - 3)}" y="${f(ry + 10)}"
                         text-anchor="end" font-family="monospace"
                         font-size="8" font-weight="700" fill="${FOSSIL_COLOR}">F</text>`
                : '');

      case 'bioherma':
        // Arco de arrecife
        return `<path d="M ${f(bx - 8)} ${f(by)} A 5 5 0 0 1 ${f(bx)} ${f(by)}"
                      fill="none" stroke="${FOSSIL_COLOR}" stroke-width="1.4"/>
                <line x1="${f(bx - 8)}" y1="${f(by)}"
                      x2="${f(bx)}"   y2="${f(by)}"
                      stroke="${FOSSIL_COLOR}" stroke-width="1"/>`;

      default:
        return '';
    }
  }

  function _fossilCircle(cx, cy, r) {
    return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${r}"
                    fill="none" stroke="${FOSSIL_COLOR}" stroke-width="1.1"/>
            <circle cx="${f(cx)}" cy="${f(cy)}" r="1"
                    fill="${FOSSIL_COLOR}"/>`;
  }


  // ─────────────────────────────────────────────────────────────────
  // SÍMBOLOS DE ESTRUCTURAS SEDIMENTARIAS
  // ─────────────────────────────────────────────────────────────────
  // Agregar nuevas estructuras en STRUCT_ICONS sin tocar el renderer.

  const SC = '#1e293b'; // color de los iconos de estructura

  /**
   * Fábrica de íconos raster (PNG) para estructuras/fósiles cuyo dibujo
   * vectorial no alcanza a representarlos (fotos/escaneos reales).
   *
   * Cada archivo vive en src/columnas/icons/, nombrado EXACTO igual a la
   * clave de STRUCT_ICONS (con tildes/mayúsculas), p.ej. 'Fucoides' →
   * icons/Fucoides.png. No se embeben en base64: quedan como archivos
   * sueltos (livianos, cacheados por el navegador).
   *
   * exportSVG()/exportPNG() en viewer.html convierten estas referencias a
   * data URI justo antes de exportar (_inlineImages), así el archivo
   * exportado queda autocontenido igual que si hubiera sido base64 desde
   * el principio.
   *
   * preserveAspectRatio="none": estira la imagen para llenar exactamente
   * la caja (w,h), sin mantener proporción. Es intencional — el editor
   * tiene controles de Tamaño X y Tamaño Y separados precisamente para
   * elongar el ícono en un solo eje (igual que ya hacían los íconos
   * vectoriales, que calculan su geometría a partir de w y h por
   * separado); con "xMidYMid meet" la imagen quedaba centrada sin
   * distorsión y el control del eje no-limitante no tenía efecto visible.
   *
   * Para agregar íconos nuevos: soltar los PNG (nombrados igual que la
   * estructura) en Iconos/, correr icons/resize-icons.ps1, y sumar cada
   * nombre a RASTER_ICON_NAMES más abajo.
   */
  function rasterIcon(fileName) {
    const href = `./icons/${encodeURIComponent(fileName)}.png`;
    return (x, y, w, h) =>
      `<image x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" href="${href}" preserveAspectRatio="none"/>`;
  }

  const STRUCT_ICONS = {

    'Laminación paralela'(x, y, w, h) {
      return `<line x1="${x}" y1="${y+1}"   x2="${x+w}" y2="${y+1}"   stroke="${SC}" stroke-width="0.7"/>
              <line x1="${x}" y1="${y+h/2}" x2="${x+w}" y2="${y+h/2}" stroke="${SC}" stroke-width="0.7"/>
              <line x1="${x}" y1="${y+h-1}" x2="${x+w}" y2="${y+h-1}" stroke="${SC}" stroke-width="0.7"/>`;
    },

    'Estratificación cruzada'(x, y, w, h) {
      return `<line x1="${x}"       y1="${y+h}" x2="${x+w/2}"   y2="${y}"   stroke="${SC}" stroke-width="0.65"/>
              <line x1="${x+w/3}"   y1="${y+h}" x2="${x+w*5/6}" y2="${y}"   stroke="${SC}" stroke-width="0.65"/>
              <line x1="${x}"       y1="${y}"   x2="${x+w}"     y2="${y}"   stroke="${SC}" stroke-width="0.9"/>
              <line x1="${x}"       y1="${y+h}" x2="${x+w}"     y2="${y+h}" stroke="${SC}" stroke-width="0.9"/>`;
    },

    'Estratificación cruzada planar'(x, y, w, h) {
      return STRUCT_ICONS['Estratificación cruzada'](x, y, w, h);
    },

    'Estratificación cruzada en artesa'(x, y, w, h) {
      return `<path d="M ${f(x)} ${f(y)} Q ${f(x+w/2)} ${f(y+h+2)} ${f(x+w)} ${f(y)}"
                    fill="none" stroke="${SC}" stroke-width="0.7"/>
              <path d="M ${f(x+w/5)} ${f(y)} Q ${f(x+w/2)} ${f(y+h/2+2)} ${f(x+w*4/5)} ${f(y)}"
                    fill="none" stroke="${SC}" stroke-width="0.6"/>
              <line x1="${x}" y1="${y}" x2="${x+w}" y2="${y}" stroke="${SC}" stroke-width="0.9"/>
              <line x1="${x}" y1="${y+h}" x2="${x+w}" y2="${y+h}" stroke="${SC}" stroke-width="0.9"/>`;
    },

    'Ondulitas'(x, y, w, h) {
      const mid = y + h / 2;
      return `<path d="M ${f(x)} ${f(mid)} Q ${f(x+w/4)} ${f(y)} ${f(x+w/2)} ${f(mid)} Q ${f(x+w*3/4)} ${f(y+h)} ${f(x+w)} ${f(mid)}"
                    fill="none" stroke="${SC}" stroke-width="0.8"/>`;
    },

    'Marcas de oleaje'(x, y, w, h) {
      return STRUCT_ICONS['Ondulitas'](x, y, w, h);
    },

    'Gradación normal'(x, y, w, h) {
      // Triángulo: base ancha abajo (granos gruesos), ápice arriba (finos)
      return `<polygon points="${f(x)},${f(y+h)} ${f(x+w)},${f(y+h)} ${f(x+w/2)},${f(y)}"
                       fill="none" stroke="${SC}" stroke-width="0.75"/>`;
    },

    'Gradación inversa'(x, y, w, h) {
      // Triángulo invertido
      return `<polygon points="${f(x)},${f(y)} ${f(x+w)},${f(y)} ${f(x+w/2)},${f(y+h)}"
                       fill="none" stroke="${SC}" stroke-width="0.75"/>`;
    },

    'Deformación por licuefacción'(x, y, w, h) {
      return `<path d="M ${f(x)} ${f(y+h)} Q ${f(x+w/4)} ${f(y+h/2)} ${f(x+w/2)} ${f(y+h)} Q ${f(x+w*3/4)} ${f(y+h/3)} ${f(x+w)} ${f(y+h)}"
                    fill="none" stroke="${SC}" stroke-width="0.7"/>`;
    },

    'Fluidización'(x, y, w, h) {
      return STRUCT_ICONS['Deformación por licuefacción'](x, y, w, h);
    },

    'Masiva'(_x, _y, _w, _h) { return ''; },

    // ── Ordenamiento interno ──────────────────────────────────────
    'Laminación ondulada'(x, y, w, h) {
      const a = h * 0.12;
      return ['0.25','0.55','0.8'].map(t => {
        const my = y + h * parseFloat(t);
        return `<path d="M ${f(x)} ${f(my)} C ${f(x+w*0.25)} ${f(my-a)} ${f(x+w*0.75)} ${f(my+a)} ${f(x+w)} ${f(my)}" fill="none" stroke="${SC}" stroke-width="0.65"/>`;
      }).join('');
    },

    'Laminación cruzada'(x, y, w, h) {
      return `<line x1="${f(x)}" y1="${f(y)}"   x2="${f(x+w)}" y2="${f(y)}"   stroke="${SC}" stroke-width="0.9"/>
              <line x1="${f(x)}" y1="${f(y+h)}" x2="${f(x+w)}" y2="${f(y+h)}" stroke="${SC}" stroke-width="0.9"/>
              <line x1="${f(x+w*0.08)}" y1="${f(y+h)}" x2="${f(x+w*0.52)}" y2="${f(y)}" stroke="${SC}" stroke-width="0.55"/>
              <line x1="${f(x+w*0.32)}" y1="${f(y+h)}" x2="${f(x+w*0.76)}" y2="${f(y)}" stroke="${SC}" stroke-width="0.55"/>
              <line x1="${f(x+w*0.56)}" y1="${f(y+h)}" x2="${f(x+w)}"       y2="${f(y)}" stroke="${SC}" stroke-width="0.55"/>`;
    },

    'Estratificación flaser'(x, y, w, h) {
      const mid = y + h / 2;
      return `<path d="M ${f(x)} ${f(mid)} Q ${f(x+w*0.25)} ${f(y+h*0.12)} ${f(x+w*0.5)} ${f(mid)} Q ${f(x+w*0.75)} ${f(y+h*0.88)} ${f(x+w)} ${f(mid)}" fill="none" stroke="${SC}" stroke-width="0.75"/>
              <ellipse cx="${f(x)}"       cy="${f(mid)}" rx="${f(w*0.055)}" ry="${f(h*0.12)}" fill="${SC}" opacity="0.5"/>
              <ellipse cx="${f(x+w*0.5)}" cy="${f(mid)}" rx="${f(w*0.07)}"  ry="${f(h*0.14)}" fill="${SC}" opacity="0.55"/>
              <ellipse cx="${f(x+w)}"     cy="${f(mid)}" rx="${f(w*0.055)}" ry="${f(h*0.12)}" fill="${SC}" opacity="0.5"/>`;
    },

    'Estratificación lenticular'(x, y, w, h) {
      return `<line x1="${f(x)}" y1="${f(y+h*0.22)}" x2="${f(x+w)}" y2="${f(y+h*0.22)}" stroke="${SC}" stroke-width="0.5" opacity="0.55"/>
              <line x1="${f(x)}" y1="${f(y+h*0.48)}" x2="${f(x+w)}" y2="${f(y+h*0.48)}" stroke="${SC}" stroke-width="0.5" opacity="0.55"/>
              <line x1="${f(x)}" y1="${f(y+h*0.75)}" x2="${f(x+w)}" y2="${f(y+h*0.75)}" stroke="${SC}" stroke-width="0.5" opacity="0.55"/>
              <ellipse cx="${f(x+w*0.28)}" cy="${f(y+h*0.35)}" rx="${f(w*0.18)}" ry="${f(h*0.1)}" fill="${SC}" opacity="0.3"/>
              <ellipse cx="${f(x+w*0.72)}" cy="${f(y+h*0.35)}" rx="${f(w*0.14)}" ry="${f(h*0.09)}" fill="${SC}" opacity="0.28"/>
              <ellipse cx="${f(x+w*0.5)}"  cy="${f(y+h*0.62)}" rx="${f(w*0.16)}" ry="${f(h*0.09)}" fill="${SC}" opacity="0.28"/>`;
    },

    'Estratificación ondulada'(x, y, w, h) {
      const a = h * 0.1;
      return `<line x1="${f(x)}" y1="${f(y+h*0.12)}" x2="${f(x+w)}" y2="${f(y+h*0.12)}" stroke="${SC}" stroke-width="0.65"/>
              <path d="M ${f(x)} ${f(y+h*0.37)} C ${f(x+w*0.25)} ${f(y+h*0.27)} ${f(x+w*0.75)} ${f(y+h*0.47)} ${f(x+w)} ${f(y+h*0.37)}" fill="none" stroke="${SC}" stroke-width="0.65"/>
              <line x1="${f(x)}" y1="${f(y+h*0.62)}" x2="${f(x+w)}" y2="${f(y+h*0.62)}" stroke="${SC}" stroke-width="0.65"/>
              <path d="M ${f(x)} ${f(y+h*0.87)} C ${f(x+w*0.25)} ${f(y+h*0.77)} ${f(x+w*0.75)} ${f(y+h*0.97)} ${f(x+w)} ${f(y+h*0.87)}" fill="none" stroke="${SC}" stroke-width="0.65"/>`;
    },

    // ── Superficies de estratificación ───────────────────────────
    'Flute casts'(x, y, w, h) {
      // Hook shape: rounded closed head at left, tail extends right
      const cy = y + h*0.5;
      return `<path d="M ${f(x+w*0.05)} ${f(y+h*0.82)} C ${f(x)} ${f(y+h*0.82)} ${f(x)} ${f(y+h*0.18)} ${f(x+w*0.22)} ${f(y+h*0.12)} C ${f(x+w*0.55)} ${f(y+h*0.12)} ${f(x+w)} ${f(cy-h*0.02)} ${f(x+w)} ${f(cy)}" fill="none" stroke="${SC}" stroke-width="0.85"/>`;
    },

    'Crescent marks'(x, y, w, h) {
      // Simple C shape open to the right
      const cx = x + w*0.42, cy = y + h/2, r = Math.min(w, h)*0.42;
      return `<path d="M ${f(cx)} ${f(cy-r)} A ${f(r)} ${f(r*0.85)} 0 1 0 ${f(cx)} ${f(cy+r)}" fill="none" stroke="${SC}" stroke-width="0.9"/>`;
    },

    'Groove casts'(x, y, w, h) {
      // Single thick straight line
      return `<line x1="${f(x)}" y1="${f(y+h/2)}" x2="${f(x+w)}" y2="${f(y+h/2)}" stroke="${SC}" stroke-width="1.6"/>`;
    },

    'Bounce casts'(x, y, w, h) {
      // Simple wavy line ~ (one S-curve)
      const cy = y + h/2, a = h*0.32;
      return `<path d="M ${f(x)} ${f(cy)} Q ${f(x+w*0.25)} ${f(cy-a)} ${f(x+w*0.5)} ${f(cy)} Q ${f(x+w*0.75)} ${f(cy+a)} ${f(x+w)} ${f(cy)}" fill="none" stroke="${SC}" stroke-width="0.9"/>`;
    },

    'Prod casts'(x, y, w, h) {
      // Gentle hump then sharp V dip then flat line
      const cy = y + h/2, a = h*0.28;
      return `<path d="M ${f(x)} ${f(cy)} Q ${f(x+w*0.2)} ${f(cy-a)} ${f(x+w*0.36)} ${f(cy)} L ${f(x+w*0.46)} ${f(cy+a*1.3)} L ${f(x+w*0.56)} ${f(cy)} L ${f(x+w)} ${f(cy)}" fill="none" stroke="${SC}" stroke-width="0.85"/>`;
    },

    'Chevron casts'(x, y, w, h) {
      // Arrow chevrons pointing right >>>
      const cy = y + h/2, ah = h*0.4, aw = w*0.22;
      return [0, 0.3, 0.58].map(tx => {
        const bx = x + w*tx;
        return `<path d="M ${f(bx)} ${f(cy-ah)} L ${f(bx+aw)} ${f(cy)} L ${f(bx)} ${f(cy+ah)}" fill="none" stroke="${SC}" stroke-width="0.85"/>`;
      }).join('') + `<line x1="${f(x+w*0.85)}" y1="${f(cy)}" x2="${f(x+w)}" y2="${f(cy)}" stroke="${SC}" stroke-width="0.85"/>`;
    },

    'Skip casts'(x, y, w, h) {
      // Multiple small arches + straight tail
      const cy = y + h/2, a = h*0.35;
      return `<path d="M ${f(x)} ${f(cy+a*0.25)} Q ${f(x+w*0.1)} ${f(cy-a)} ${f(x+w*0.22)} ${f(cy+a*0.2)} Q ${f(x+w*0.32)} ${f(cy-a*0.65)} ${f(x+w*0.42)} ${f(cy)} L ${f(x+w)} ${f(cy)}" fill="none" stroke="${SC}" stroke-width="0.85"/>`;
    },

    'Brush casts'(x, y, w, h) {
      // Fan of short parallel strokes at left, then horizontal tail
      const cy = y + h/2, ox = x+w*0.04, tx = x+w*0.4;
      return [-0.38, -0.2, 0, 0.2, 0.38].map(dy =>
        `<line x1="${f(ox)}" y1="${f(cy+h*dy)}" x2="${f(tx)}" y2="${f(cy)}" stroke="${SC}" stroke-width="0.7"/>`
      ).join('') + `<line x1="${f(tx)}" y1="${f(cy)}" x2="${f(x+w)}" y2="${f(cy)}" stroke="${SC}" stroke-width="0.9"/>`;
    },

    'Impresiones de gotas de lluvia'(x, y, w, h) {
      const r = Math.min(w, h) * 0.13;
      return [[0.18,0.28],[0.65,0.22],[0.42,0.65],[0.82,0.7],[0.1,0.74]].map(([tx,ty]) =>
        `<circle cx="${f(x+w*tx)}" cy="${f(y+h*ty)}" r="${f(r)}" fill="none" stroke="${SC}" stroke-width="0.6"/>`
      ).join('');
    },

    'Grietas de desecación'(x, y, w, h) {
      // Horizontal surface line + small circles representing plan-view polygon cells
      // (convention used in standard sedimentary column legends, as per Ricci Lucchi).
      const sy = y + h * 0.44;
      const r  = Math.min(w, h) * 0.13;
      let out = `<line x1="${f(x)}" y1="${f(sy)}" x2="${f(x+w)}" y2="${f(sy)}" stroke="${SC}" stroke-width="0.9"/>`;
      // Three polygon cells above the line
      [[0.16, 0.22], [0.50, 0.20], [0.84, 0.22]].forEach(([tx, ty]) => {
        const cx = x + w * tx, cy = y + h * ty;
        out += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${SC}" stroke-width="0.65"/>`;
        out += `<line x1="${f(cx)}" y1="${f(cy + r)}" x2="${f(cx)}" y2="${f(sy)}" stroke="${SC}" stroke-width="0.45"/>`;
      });
      return out;
    },

    'Superficie de omisión'(x, y, w, h) {
      // Horizontal line with small downward ticks (boring channels)
      const sy = y + h*0.42, tl = h*0.32;
      return `<line x1="${f(x)}" y1="${f(sy)}" x2="${f(x+w)}" y2="${f(sy)}" stroke="${SC}" stroke-width="0.9"/>` +
        [0.12, 0.35, 0.58, 0.82].map(tx =>
          `<line x1="${f(x+w*tx)}" y1="${f(sy)}" x2="${f(x+w*tx)}" y2="${f(sy+tl)}" stroke="${SC}" stroke-width="0.7"/>`
        ).join('');
    },

    'Superficie karstificada'(x, y, w, h) {
      // ⊓⊓ shapes: stalactite/karst columns hanging from baseline
      const sy = y + h*0.52, bw = w*0.22, bh = h*0.42;
      return `<line x1="${f(x)}" y1="${f(sy)}" x2="${f(x+w)}" y2="${f(sy)}" stroke="${SC}" stroke-width="0.9"/>` +
        [0.04, 0.37, 0.7].map(tx => {
          const bx = x + w*tx;
          return `<path d="M ${f(bx)} ${f(sy)} L ${f(bx)} ${f(sy-bh)} L ${f(bx+bw)} ${f(sy-bh)} L ${f(bx+bw)} ${f(sy)}" fill="none" stroke="${SC}" stroke-width="0.8"/>`;
        }).join('');
    },

    'Superficie erosionada'(x, y, w, h) {
      // Angular irregular jagged line
      const cy = y + h*0.5;
      return `<path d="M ${f(x)} ${f(cy+h*0.1)} L ${f(x+w*0.16)} ${f(cy-h*0.3)} L ${f(x+w*0.3)} ${f(cy+h*0.14)} L ${f(x+w*0.5)} ${f(cy-h*0.24)} L ${f(x+w*0.68)} ${f(cy+h*0.18)} L ${f(x+w*0.82)} ${f(cy-h*0.12)} L ${f(x+w)} ${f(cy)}" fill="none" stroke="${SC}" stroke-width="0.9"/>`;
    },

    'Ripples de corrientes'(x, y, w, h) {
      // Asymmetric triangle: gentle slope left, steep face right
      const b = y + h - 1;
      return `<path d="M ${f(x)} ${f(b)} L ${f(x+w*0.62)} ${f(y+1)} L ${f(x+w)} ${f(b)}" fill="none" stroke="${SC}" stroke-width="0.9"/>
              <line x1="${f(x)}" y1="${f(b)}" x2="${f(x+w)}" y2="${f(b)}" stroke="${SC}" stroke-width="0.7"/>`;
    },

    'Ripples de olas'(x, y, w, h) {
      // Two symmetric peaks /\/\
      const b = y + h - 1;
      return `<path d="M ${f(x)} ${f(b)} L ${f(x+w*0.25)} ${f(y+1)} L ${f(x+w*0.5)} ${f(b)} L ${f(x+w*0.75)} ${f(y+1)} L ${f(x+w)} ${f(b)}" fill="none" stroke="${SC}" stroke-width="0.9"/>
              <line x1="${f(x)}" y1="${f(b)}" x2="${f(x+w)}" y2="${f(b)}" stroke="${SC}" stroke-width="0.7"/>`;
    },

    // ── Deformación ───────────────────────────────────────────────
    'Areniscas almohadilladas'(x, y, w, h) {
      const cy = y + h / 2;
      return [[0.18, 0.15, 0.36], [0.5, 0.18, 0.38], [0.82, 0.12, 0.3]].map(([tx, rx, ry]) =>
        `<ellipse cx="${f(x+w*tx)}" cy="${f(cy)}" rx="${f(w*rx)}" ry="${f(h*ry)}" fill="${SC}" opacity="0.2" stroke="${SC}" stroke-width="0.65"/>`
      ).join('');
    },

    'Diques clásticos'(x, y, w, h) {
      // Lightning-bolt / Z zigzag cutting through strata
      const cx = x + w*0.5, zw = w*0.16;
      return `<line x1="${f(x)}" y1="${f(y+h*0.25)}" x2="${f(x+w)}" y2="${f(y+h*0.25)}" stroke="${SC}" stroke-width="0.45" opacity="0.4"/>
              <line x1="${f(x)}" y1="${f(y+h*0.75)}" x2="${f(x+w)}" y2="${f(y+h*0.75)}" stroke="${SC}" stroke-width="0.45" opacity="0.4"/>
              <path d="M ${f(cx+zw)} ${f(y+1)} L ${f(cx-zw)} ${f(y+h*0.5)} L ${f(cx+zw)} ${f(y+h-1)}" fill="none" stroke="${SC}" stroke-width="1.2"/>`;
    },

    'Slumping'(x, y, w, h) {
      return `<path d="M ${f(x)} ${f(y+h*0.3)} C ${f(x+w*0.2)} ${f(y+h*0.08)} ${f(x+w*0.32)} ${f(y+h*0.52)} ${f(x+w*0.52)} ${f(y+h*0.18)} C ${f(x+w*0.72)} ${f(y-h*0.08)} ${f(x+w*0.85)} ${f(y+h*0.42)} ${f(x+w)} ${f(y+h*0.3)}" fill="none" stroke="${SC}" stroke-width="0.72"/>
              <path d="M ${f(x)} ${f(y+h*0.66)} C ${f(x+w*0.2)} ${f(y+h*0.44)} ${f(x+w*0.35)} ${f(y+h*0.88)} ${f(x+w*0.55)} ${f(y+h*0.56)} C ${f(x+w*0.75)} ${f(y+h*0.24)} ${f(x+w*0.88)} ${f(y+h*0.76)} ${f(x+w)} ${f(y+h*0.66)}" fill="none" stroke="${SC}" stroke-width="0.72"/>`;
    },

    'Rudita intraformacional'(x, y, w, h) {
      // Sun/wheel symbol: asterisk enclosed in circle (as per Ricci Lucchi standard legend).
      const wheel = (cx, cy, r) => {
        const circ = `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 1.35)}" fill="none" stroke="${SC}" stroke-width="0.6"/>`;
        const spokes = [0, 60, 120].map(a => {
          const rad = a * Math.PI / 180;
          return `<line x1="${f(cx - r * Math.cos(rad))}" y1="${f(cy - r * Math.sin(rad))}" x2="${f(cx + r * Math.cos(rad))}" y2="${f(cy + r * Math.sin(rad))}" stroke="${SC}" stroke-width="0.75"/>`;
        }).join('');
        return circ + spokes;
      };
      const r = Math.min(w, h) * 0.13;
      return wheel(x + w * 0.18, y + h * 0.36, r)
           + wheel(x + w * 0.54, y + h * 0.65, r)
           + wheel(x + w * 0.86, y + h * 0.33, r);
    },

    'Estructuras dish'(x, y, w, h) {
      return `<path d="M ${f(x)} ${f(y+h*0.28)} Q ${f(x+w*0.5)} ${f(y+h*0.62)} ${f(x+w)} ${f(y+h*0.28)}" fill="none" stroke="${SC}" stroke-width="0.75"/>
              <path d="M ${f(x+w*0.06)} ${f(y+h*0.64)} Q ${f(x+w*0.5)} ${f(y+h*0.9)} ${f(x+w*0.94)} ${f(y+h*0.64)}" fill="none" stroke="${SC}" stroke-width="0.65"/>`;
    },

    'Pilares'(x, y, w, h) {
      const pw = w * 0.1;
      return `<path d="M ${f(x)} ${f(y+h*0.33)} Q ${f(x+w*0.5)} ${f(y+h*0.55)} ${f(x+w)} ${f(y+h*0.33)}" fill="none" stroke="${SC}" stroke-width="0.5" opacity="0.5"/>
              <rect x="${f(x+w*0.25-pw/2)}" y="${f(y)}" width="${f(pw)}" height="${f(h)}" fill="${SC}" opacity="0.35"/>
              <rect x="${f(x+w*0.65-pw/2)}" y="${f(y)}" width="${f(pw)}" height="${f(h)}" fill="${SC}" opacity="0.35"/>`;
    },

    'Fallas sinsedimentarias'(x, y, w, h) {
      const fx = x + w * 0.5;
      return `<line x1="${f(x)}" y1="${f(y+h*0.3)}"  x2="${f(fx-1)}" y2="${f(y+h*0.3)}"  stroke="${SC}" stroke-width="0.65"/>
              <line x1="${f(fx+1)}" y1="${f(y+h*0.47)}" x2="${f(x+w)}" y2="${f(y+h*0.47)}" stroke="${SC}" stroke-width="0.65"/>
              <line x1="${f(x)}" y1="${f(y+h*0.67)}"  x2="${f(fx-1)}" y2="${f(y+h*0.67)}"  stroke="${SC}" stroke-width="0.65"/>
              <line x1="${f(fx+1)}" y1="${f(y+h*0.84)}" x2="${f(x+w)}" y2="${f(y+h*0.84)}" stroke="${SC}" stroke-width="0.65"/>
              <line x1="${f(fx)}" y1="${f(y)}" x2="${f(fx)}" y2="${f(y+h)}" stroke="${SC}" stroke-width="1.0"/>`;
    },

    'Tepee'(x, y, w, h) {
      const b = y + h - 1;
      return `<polyline points="${f(x+1)},${f(b)} ${f(x+w*0.24)},${f(y+2)} ${f(x+w*0.34)},${f(b)}" fill="none" stroke="${SC}" stroke-width="0.85"/>
              <polyline points="${f(x+w*0.42)},${f(b)} ${f(x+w*0.64)},${f(y+2)} ${f(x+w*0.74)},${f(b)}" fill="none" stroke="${SC}" stroke-width="0.85"/>`;
    },

    // ── Orgánicas y diagenéticas ──────────────────────────────────
    'Laminación de algas'(x, y, w, h) {
      const a = h * 0.1;
      return `<path d="M ${f(x)} ${f(y+h*0.3)} C ${f(x+w*0.25)} ${f(y+h*0.3-a)} ${f(x+w*0.75)} ${f(y+h*0.3+a)} ${f(x+w)} ${f(y+h*0.3)}" fill="none" stroke="${SC}" stroke-width="0.65"/>
              <path d="M ${f(x)} ${f(y+h*0.62)} C ${f(x+w*0.25)} ${f(y+h*0.62-a)} ${f(x+w*0.75)} ${f(y+h*0.62+a)} ${f(x+w)} ${f(y+h*0.62)}" fill="none" stroke="${SC}" stroke-width="0.65"/>
              <circle cx="${f(x+w*0.2)}" cy="${f(y+h*0.46)}" r="0.9" fill="${SC}" opacity="0.5"/>
              <circle cx="${f(x+w*0.5)}" cy="${f(y+h*0.46)}" r="0.9" fill="${SC}" opacity="0.5"/>
              <circle cx="${f(x+w*0.8)}" cy="${f(y+h*0.46)}" r="0.9" fill="${SC}" opacity="0.5"/>`;
    },

    'Estromatolitos'(x, y, w, h) {
      const b = y + h;
      return `<path d="M ${f(x+w*0.12)} ${f(b)} Q ${f(x+w*0.25)} ${f(y+h*0.5)} ${f(x+w*0.38)} ${f(b)}" fill="none" stroke="${SC}" stroke-width="0.8"/>
              <path d="M ${f(x+w*0.25)} ${f(y+h*0.5)} Q ${f(x+w*0.35)} ${f(y+h*0.1)} ${f(x+w*0.45)} ${f(y+h*0.5)}" fill="none" stroke="${SC}" stroke-width="0.65"/>
              <path d="M ${f(x+w*0.55)} ${f(b)} Q ${f(x+w*0.67)} ${f(y+h*0.45)} ${f(x+w*0.78)} ${f(b)}" fill="none" stroke="${SC}" stroke-width="0.8"/>
              <path d="M ${f(x+w*0.67)} ${f(y+h*0.45)} Q ${f(x+w*0.75)} ${f(y+h*0.08)} ${f(x+w*0.84)} ${f(y+h*0.45)}" fill="none" stroke="${SC}" stroke-width="0.65"/>`;
    },

    'Perforaciones'(x, y, w, h) {
      const sy = y + h * 0.58;
      return `<line x1="${f(x)}" y1="${f(sy)}" x2="${f(x+w)}" y2="${f(sy)}" stroke="${SC}" stroke-width="0.9"/>
              <line x1="${f(x+w*0.14)}" y1="${f(sy)}" x2="${f(x+w*0.14)}" y2="${f(y+2)}" stroke="${SC}" stroke-width="0.7"/>
              <line x1="${f(x+w*0.38)}" y1="${f(sy)}" x2="${f(x+w*0.38)}" y2="${f(y+2)}" stroke="${SC}" stroke-width="0.7"/>
              <line x1="${f(x+w*0.62)}" y1="${f(sy)}" x2="${f(x+w*0.62)}" y2="${f(y+2)}" stroke="${SC}" stroke-width="0.7"/>
              <line x1="${f(x+w*0.86)}" y1="${f(sy)}" x2="${f(x+w*0.86)}" y2="${f(y+2)}" stroke="${SC}" stroke-width="0.7"/>`;
    },

    'Excavaciones'(x, y, w, h) {
      const t = y + 2, b2 = y + h - 2;
      return `<path d="M ${f(x+2)} ${f(t)} Q ${f(x+2)} ${f(b2)} ${f(x+w*0.34)} ${f(b2)} Q ${f(x+w*0.34)} ${f(t)} ${f(x+w*0.34)} ${f(t)}" fill="none" stroke="${SC}" stroke-width="0.75"/>
              <path d="M ${f(x+w*0.5)} ${f(t)} Q ${f(x+w*0.5)} ${f(b2)} ${f(x+w*0.82)} ${f(b2)} Q ${f(x+w*0.82)} ${f(t)} ${f(x+w*0.82)} ${f(t)}" fill="none" stroke="${SC}" stroke-width="0.75"/>`;
    },

    'Pistas'(x, y, w, h) {
      const my = y + h / 2;
      return `<path d="M ${f(x)} ${f(my+h*0.1)} C ${f(x+w*0.2)} ${f(my-h*0.22)} ${f(x+w*0.42)} ${f(my+h*0.28)} ${f(x+w*0.62)} ${f(my-h*0.1)} C ${f(x+w*0.8)} ${f(my-h*0.38)} ${f(x+w)} ${f(my+h*0.06)} ${f(x+w)} ${f(my)}" fill="none" stroke="${SC}" stroke-width="0.75"/>`;
    },

    'Pisadas'(x, y, w, h) {
      return [[0.28,0.28],[0.52,0.7],[0.8,0.28]].map(([tx,ty]) =>
        `<ellipse cx="${f(x+w*tx)}" cy="${f(y+h*ty)}" rx="${f(w*0.13)}" ry="${f(h*0.22)}" fill="none" stroke="${SC}" stroke-width="0.65"/>`
      ).join('');
    },

    'Rizocreciones'(x, y, w, h) {
      const tx = x + w / 2, ty = y + 1;
      return `<line x1="${f(tx)}" y1="${f(ty)}" x2="${f(tx)}" y2="${f(y+h-2)}" stroke="${SC}" stroke-width="0.8"/>
              <line x1="${f(tx)}" y1="${f(ty+h*0.26)}" x2="${f(tx-w*0.26)}" y2="${f(ty+h*0.5)}" stroke="${SC}" stroke-width="0.6"/>
              <line x1="${f(tx)}" y1="${f(ty+h*0.36)}" x2="${f(tx+w*0.28)}" y2="${f(ty+h*0.6)}" stroke="${SC}" stroke-width="0.6"/>
              <line x1="${f(tx)}" y1="${f(ty+h*0.56)}" x2="${f(tx-w*0.2)}" y2="${f(ty+h*0.75)}" stroke="${SC}" stroke-width="0.55"/>
              <line x1="${f(tx)}" y1="${f(ty+h*0.64)}" x2="${f(tx+w*0.22)}" y2="${f(ty+h*0.84)}" stroke="${SC}" stroke-width="0.55"/>`;
    },

    'Chondrites'(x, y, w, h) {
      const ox = x + w * 0.12, oy = y + h / 2;
      return `<line x1="${f(ox)}" y1="${f(oy)}" x2="${f(x+w*0.78)}" y2="${f(oy)}" stroke="${SC}" stroke-width="0.7"/>
              <line x1="${f(x+w*0.4)}" y1="${f(oy)}" x2="${f(x+w*0.55)}" y2="${f(oy-h*0.32)}" stroke="${SC}" stroke-width="0.55"/>
              <line x1="${f(x+w*0.55)}" y1="${f(oy-h*0.32)}" x2="${f(x+w*0.7)}" y2="${f(oy-h*0.48)}" stroke="${SC}" stroke-width="0.45"/>
              <line x1="${f(x+w*0.55)}" y1="${f(oy-h*0.32)}" x2="${f(x+w*0.72)}" y2="${f(oy-h*0.16)}" stroke="${SC}" stroke-width="0.45"/>
              <line x1="${f(x+w*0.4)}" y1="${f(oy)}" x2="${f(x+w*0.55)}" y2="${f(oy+h*0.32)}" stroke="${SC}" stroke-width="0.55"/>
              <line x1="${f(x+w*0.55)}" y1="${f(oy+h*0.32)}" x2="${f(x+w*0.7)}" y2="${f(oy+h*0.48)}" stroke="${SC}" stroke-width="0.45"/>`;
    },

    'Estilolitos'(x, y, w, h) {
      const sy = y + h / 2, n = 8;
      const pts = Array.from({length: n+1}, (_, i) => {
        const xi = f(x + w * i / n);
        const yi = f(sy + (i % 2 === 0 ? -h*0.3 : h*0.3));
        return `${xi},${yi}`;
      }).join(' ');
      return `<polyline points="${pts}" fill="none" stroke="${SC}" stroke-width="0.85"/>`;
    },

    'Cristales de pirita'(x, y, w, h) {
      const s = Math.min(w, h) * 0.3;
      return [[x+w*0.18, y+h*0.42, 15], [x+w*0.58, y+h*0.32, -10], [x+w*0.85, y+h*0.62, 22]].map(([cx,cy,rot]) =>
        `<rect x="${f(cx-s/2)}" y="${f(cy-s/2)}" width="${f(s)}" height="${f(s)}" fill="${SC}" opacity="0.3" stroke="${SC}" stroke-width="0.6" transform="rotate(${rot},${f(cx)},${f(cy)})"/>`
      ).join('');
    },

    'Fenestras'(x, y, w, h) {
      return `<line x1="${f(x)}" y1="${f(y+h*0.3)}"  x2="${f(x+w)}" y2="${f(y+h*0.3)}"  stroke="${SC}" stroke-width="0.5" opacity="0.5"/>
              <line x1="${f(x)}" y1="${f(y+h*0.65)}" x2="${f(x+w)}" y2="${f(y+h*0.65)}" stroke="${SC}" stroke-width="0.5" opacity="0.5"/>
              <ellipse cx="${f(x+w*0.22)}" cy="${f(y+h*0.475)}" rx="${f(w*0.15)}" ry="${f(h*0.14)}" fill="none" stroke="${SC}" stroke-width="0.65"/>
              <ellipse cx="${f(x+w*0.6)}"  cy="${f(y+h*0.475)}" rx="${f(w*0.17)}" ry="${f(h*0.13)}" fill="none" stroke="${SC}" stroke-width="0.65"/>
              <ellipse cx="${f(x+w*0.88)}" cy="${f(y+h*0.48)}"  rx="${f(w*0.1)}"  ry="${f(h*0.11)}" fill="none" stroke="${SC}" stroke-width="0.6"/>`;
    },

    'Nereites'(x, y, w, h) {
      const my = y + h / 2;
      return `<path d="M ${f(x)} ${f(my)} C ${f(x+w*0.2)} ${f(y+h*0.12)} ${f(x+w*0.42)} ${f(y+h*0.88)} ${f(x+w*0.62)} ${f(my)} C ${f(x+w*0.82)} ${f(y+h*0.12)} ${f(x+w)} ${f(my-h*0.1)} ${f(x+w)} ${f(my)}" fill="none" stroke="${SC}" stroke-width="0.9"/>
              <circle cx="${f(x+w*0.2)}"  cy="${f(y+h*0.36)}" r="1.2" fill="none" stroke="${SC}" stroke-width="0.5"/>
              <circle cx="${f(x+w*0.52)}" cy="${f(my)}"        r="1.2" fill="none" stroke="${SC}" stroke-width="0.5"/>
              <circle cx="${f(x+w*0.78)}" cy="${f(y+h*0.3)}"  r="1.0" fill="none" stroke="${SC}" stroke-width="0.5"/>`;
    },

    'Helmintoides'(x, y, w, h) {
      const my = y + h / 2;
      return `<path d="M ${f(x)} ${f(my)} C ${f(x+w*0.15)} ${f(y+h*0.08)} ${f(x+w*0.35)} ${f(y+h*0.92)} ${f(x+w*0.5)} ${f(my)} C ${f(x+w*0.65)} ${f(y+h*0.08)} ${f(x+w*0.85)} ${f(y+h*0.92)} ${f(x+w)} ${f(my)}" fill="none" stroke="${SC}" stroke-width="0.85"/>`;
    },

    'Paleodictyon'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.38;
      const hex = (rcx, rcy, rr) => {
        const pts = Array.from({length:6}, (_, i) => {
          const a = (i * 60 - 30) * Math.PI / 180;
          return `${f(rcx + rr * Math.cos(a))},${f(rcy + rr * Math.sin(a))}`;
        }).join(' ');
        return `<polygon points="${pts}" fill="none" stroke="${SC}" stroke-width="0.7"/>`;
      };
      return hex(cx, cy, r) + hex(cx - r*0.92, cy, r*0.52) + hex(cx + r*0.92, cy, r*0.52);
    },

    'Zoophycos'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r1 = Math.min(w,h)*0.18, r2 = Math.min(w,h)*0.38;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r1)}" fill="none" stroke="${SC}" stroke-width="0.65"/>
              <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r2)}" fill="none" stroke="${SC}" stroke-width="0.65"/>
              <path d="M ${f(cx)} ${f(cy-r2)} A ${f(r2)} ${f(r2)} 0 0 1 ${f(cx+r2)} ${f(cy)}" fill="none" stroke="${SC}" stroke-width="0.55" stroke-dasharray="1.2 1.1"/>`;
    },

    'Thalassinoides'(x, y, w, h) {
      const oy = y + h * 0.7;
      return `<line x1="${f(x)}"       y1="${f(oy)}"       x2="${f(x+w*0.4)}" y2="${f(oy)}"       stroke="${SC}" stroke-width="0.75"/>
              <line x1="${f(x+w*0.4)}" y1="${f(oy)}"       x2="${f(x+w*0.7)}" y2="${f(y+h*0.22)}" stroke="${SC}" stroke-width="0.75"/>
              <line x1="${f(x+w*0.4)}" y1="${f(oy)}"       x2="${f(x+w*0.7)}" y2="${f(y+h*0.88)}" stroke="${SC}" stroke-width="0.75"/>
              <line x1="${f(x+w*0.7)}" y1="${f(y+h*0.22)}" x2="${f(x+w)}"     y2="${f(y+h*0.08)}" stroke="${SC}" stroke-width="0.6"/>
              <line x1="${f(x+w*0.7)}" y1="${f(y+h*0.22)}" x2="${f(x+w)}"     y2="${f(y+h*0.38)}" stroke="${SC}" stroke-width="0.6"/>`;
    },

    'Cruziana'(x, y, w, h) {
      const my = y + h / 2;
      return `<line x1="${f(x)}" y1="${f(my)}" x2="${f(x+w)}" y2="${f(my)}" stroke="${SC}" stroke-width="1.05"/>` +
        [[0.12,0.38],[0.42,0.68],[0.68,0.92]].map(([t0,t1]) =>
          `<line x1="${f(x+w*t0)}" y1="${f(my-h*0.38)}" x2="${f(x+w*t1)}" y2="${f(my)}" stroke="${SC}" stroke-width="0.5"/>
           <line x1="${f(x+w*t0)}" y1="${f(my+h*0.38)}" x2="${f(x+w*t1)}" y2="${f(my)}" stroke="${SC}" stroke-width="0.5"/>`
        ).join('');
    },

    'Skolithos'(x, y, w, h) {
      // Vertical U-shaped burrows open at top, closed at bottom — standard ichnofacies symbol.
      return [[0.18, 0.13], [0.52, 0.13], [0.84, 0.12]].map(([tx, rw]) => {
        const cx  = x + w * tx;
        const r   = w * rw;
        const top = y + 2;
        const bot = y + h - r - 2;
        return `<line x1="${f(cx-r)}" y1="${f(top)}" x2="${f(cx-r)}" y2="${f(bot)}" stroke="${SC}" stroke-width="0.7"/>` +
               `<line x1="${f(cx+r)}" y1="${f(top)}" x2="${f(cx+r)}" y2="${f(bot)}" stroke="${SC}" stroke-width="0.7"/>` +
               `<path d="M ${f(cx-r)} ${f(bot)} A ${f(r)} ${f(r)} 0 0 0 ${f(cx+r)} ${f(bot)}" fill="none" stroke="${SC}" stroke-width="0.7"/>`;
      }).join('');
    },

    'Rhizocorallium'(x, y, w, h) {
      const ty = y + h * 0.2, by = y + h * 0.8, ex = x + w * 0.82;
      return `<line x1="${f(x+1)}" y1="${f(ty)}" x2="${f(ex)}" y2="${f(ty)}" stroke="${SC}" stroke-width="0.75"/>
              <line x1="${f(x+1)}" y1="${f(by)}" x2="${f(ex)}" y2="${f(by)}" stroke="${SC}" stroke-width="0.75"/>
              <path d="M ${f(ex)} ${f(ty)} A ${f(h*0.3)} ${f(h*0.3)} 0 0 1 ${f(ex)} ${f(by)}" fill="none" stroke="${SC}" stroke-width="0.75"/>
              <line x1="${f(x+w*0.28)}" y1="${f(ty)}" x2="${f(x+w*0.28)}" y2="${f(by)}" stroke="${SC}" stroke-width="0.38" opacity="0.45"/>
              <line x1="${f(x+w*0.48)}" y1="${f(ty)}" x2="${f(x+w*0.48)}" y2="${f(by)}" stroke="${SC}" stroke-width="0.38" opacity="0.45"/>
              <line x1="${f(x+w*0.66)}" y1="${f(ty)}" x2="${f(x+w*0.66)}" y2="${f(by)}" stroke="${SC}" stroke-width="0.38" opacity="0.45"/>`;
    },

    'Nódulos y concreciones'(x, y, w, h) {
      const cy = y + h / 2;
      return `<ellipse cx="${f(x+w*0.2)}" cy="${f(cy-h*0.04)}" rx="${f(w*0.17)}" ry="${f(h*0.34)}" fill="${SC}" opacity="0.15" stroke="${SC}" stroke-width="0.65"/>
              <ellipse cx="${f(x+w*0.6)}" cy="${f(cy+h*0.06)}" rx="${f(w*0.22)}" ry="${f(h*0.38)}" fill="${SC}" opacity="0.15" stroke="${SC}" stroke-width="0.65"/>
              <ellipse cx="${f(x+w*0.9)}" cy="${f(cy)}"         rx="${f(w*0.1)}"  ry="${f(h*0.26)}" fill="${SC}" opacity="0.12" stroke="${SC}" stroke-width="0.6"/>`;
    },

    'Venas'(x, y, w, h) {
      // Zigzag /\/\ pattern representing veins
      const cy = y + h/2, a = h*0.38;
      return `<path d="M ${f(x)} ${f(cy)} L ${f(x+w*0.2)} ${f(cy-a)} L ${f(x+w*0.4)} ${f(cy+a)} L ${f(x+w*0.6)} ${f(cy-a)} L ${f(x+w*0.8)} ${f(cy+a)} L ${f(x+w)} ${f(cy)}" fill="none" stroke="${SC}" stroke-width="0.9"/>`;
    },

    // ── Contenido fosilífero (abundancia) — mismo símbolo que
    // drawFossil() dibuja automáticamente en la esquina de la unidad,
    // pero aquí como ícono posicionable/editable como cualquier otro.
    'Fósiles escasos'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.28;
      return _fossilCircle(cx, cy, r);
    },

    'Fósiles común'(x, y, w, h) {
      const cy = y + h / 2, r = Math.min(w, h) * 0.24;
      return _fossilCircle(x + w * 0.32, cy, r) + _fossilCircle(x + w * 0.68, cy, r);
    },

    'Fósiles abundante'(x, y, w, h) {
      const cy = y + h / 2, r = Math.min(w, h) * 0.2;
      return _fossilCircle(x + w * 0.18, cy, r)
           + _fossilCircle(x + w * 0.5,  cy, r)
           + _fossilCircle(x + w * 0.82, cy, r);
    },

    'Bioherma'(x, y, w, h) {
      const cy = y + h * 0.68, r = Math.min(w, h) * 0.42;
      return `<path d="M ${f(x + w * 0.1)} ${f(cy)} A ${f(r)} ${f(r)} 0 0 1 ${f(x + w * 0.9)} ${f(cy)}"
                    fill="none" stroke="${FOSSIL_COLOR}" stroke-width="1.4"/>
              <line x1="${f(x + w * 0.1)}" y1="${f(cy)}" x2="${f(x + w * 0.9)}" y2="${f(cy)}"
                    stroke="${FOSSIL_COLOR}" stroke-width="1"/>`;
    },

    'Granoclasificación normal'(x, y, w, h) {
      // Dots larger at bottom (coarse), smaller at top (fine)
      return [
        [0.18,0.1,0.8],[0.5,0.1,0.8],[0.82,0.1,0.8],
        [0.15,0.35,1.2],[0.48,0.35,1.2],[0.8,0.35,1.2],
        [0.12,0.62,1.7],[0.45,0.62,1.7],[0.78,0.62,1.7],
        [0.15,0.88,2.3],[0.5,0.88,2.3],[0.85,0.88,2.3],
      ].map(([tx,ty,r]) =>
        `<circle cx="${f(x+w*tx)}" cy="${f(y+h*ty)}" r="${f(r)}" fill="${SC}" opacity="0.75"/>`
      ).join('');
    },

    'Granoclasificación inversa'(x, y, w, h) {
      // Dots larger at top (coarse), smaller at bottom (fine)
      return [
        [0.15,0.12,2.3],[0.5,0.12,2.3],[0.85,0.12,2.3],
        [0.12,0.38,1.7],[0.45,0.38,1.7],[0.78,0.38,1.7],
        [0.15,0.65,1.2],[0.48,0.65,1.2],[0.8,0.65,1.2],
        [0.18,0.9,0.8],[0.5,0.9,0.8],[0.82,0.9,0.8],
      ].map(([tx,ty,r]) =>
        `<circle cx="${f(x+w*tx)}" cy="${f(y+h*ty)}" r="${f(r)}" fill="${SC}" opacity="0.75"/>`
      ).join('');
    },

    '_default'(x, y, w, h) {
      // Punto genérico como fallback
      return `<circle cx="${f(x+w/2)}" cy="${f(y+h/2)}" r="2" fill="${SC}" opacity="0.25"/>`;
    },
  };

  // Íconos raster registrados vía rasterIcon() — ver el comentario junto a
  // esa función más arriba para cómo sumar nuevos.
  //
  // Cada entrada es [nombre, anchoNatural, altoNatural] — las dimensiones
  // EXACTAS que imprime icons/resize-icons.ps1 para el PNG ya redimensionado
  // en icons/ (no inventar/adivinar: copiar el "WxH" que el script reporta
  // al agregar un ícono nuevo). Se usan para mantener la proporción real de
  // la foto cuando el usuario no fijó Tamaño X y Tamaño Y a mano — ver
  // resolveStructIconSize() más abajo.
  const RASTER_ICON_NAMES = [
    ['Fucoides', 80, 120],
    // Carpeta 1 (Iconos/1).
    ['Belemnites', 120, 76], ['Bioturbación (en general)', 80, 120],
    ['Bounce casts', 120, 18], ['Braquiópodos', 120, 84],
    ['Briozoos', 120, 67], ['Briozoos (colonias)', 82, 120],
    ['Brush casts', 120, 38], ['Calciesferas', 120, 120],
    ['Calcos de carga (load casts)', 120, 76], ['Caráceas', 108, 120],
    ['Chevron casts', 120, 29], ['Chondrites', 94, 120],
    ['Cirrípedos', 120, 104], ['Cocolitos', 115, 120],
    ['Conodontos', 120, 48], ['Corales (hexacoralarios)', 108, 120],
    ['Corales (tetracoralarios)', 120, 112], ['Corales aislados', 110, 120],
    ['Corales coloniales', 120, 97], ['Crescent marks', 120, 84],
    ['Crinoides', 119, 120], ['Cristales de pirita', 98, 120],
    ['Cristales de yeso', 84, 120], ['Cruziana', 120, 96],
    ['Diatomeas', 120, 120], ['Dientes de mamíferos', 90, 120],
    ['Dinoflagelados', 106, 120], ['Diques clásticos', 81, 120],
    ['Discociclinas', 120, 49], ['Equínidos', 120, 94],
    ['Esponjas', 116, 120], ['Espículas de esponjas', 111, 120],
    ['Estilolitos', 104, 120], ['Estratificación cruzada en surco', 120, 37],
    ['Estratificación cruzada herringbone', 120, 53],
    ['Estratificación cruzada hummocky', 120, 18],
    ['Estratificación cruzada planar', 120, 62],
    ['Estratificación flaser', 120, 24], ['Estratificación lenticular', 120, 32],
    ['Estratificación ondulada', 120, 24], ['Estromatolitos', 120, 45],
    ['Estromatopóridos', 100, 120], ['Estructuras dish', 120, 17],
    ['Excavaciones', 94, 120], ['Fallas sinsedimentarias', 120, 41],
    ['Fauna (en general)', 94, 120], ['Fenestras', 91, 120],
    // Carpeta 2 (Iconos/2).
    ['Filamentos', 120, 64], ['Flora (en general)', 72, 120],
    ['Flute casts', 120, 34], ['Foraminíferos bentónicos (en general)', 120, 111],
    ['Foraminíferos planctónicos', 120, 112], ['Fusulinas', 120, 50],
    ['Gasterópodos continentales', 120, 117], ['Gasterópodos marinos', 76, 120],
    ['Granoclasificación inversa', 77, 120], ['Granoclasificación normal', 73, 120],
    ['Graptolites', 59, 120], ['Grietas de desecación', 120, 27],
    ['Groove casts', 120, 81], ['Helmintoides', 103, 120],
    ['Imbricación de clastos', 120, 57], ['Impresiones de gotas de lluvia', 120, 43],
    ['Lamelibranquios (en general)', 120, 103], ['Laminación convoluta', 120, 55],
    ['Laminación cruzada', 120, 39], ['Laminación de algas', 120, 36],
    ['Laminación ondulada', 120, 36], ['Laminación paralela', 120, 62],
    ['Miliólidos', 67, 120], ['Moluscos (en general)', 94, 120],
    ['Nannoplancton calizo', 120, 110], ['Nautiloideos', 97, 120],
    ['Nereites', 84, 120], ['Nummulites', 63, 120],
    ['Nódulos y concreciones', 82, 120], ['Operculinas', 120, 76],
    ['Orbitoides', 120, 118], ['Orbitolinas', 120, 96],
    ['Ortocerátidos', 120, 72], ['Ostreidos', 120, 55], ['Ostrácodos', 106, 120],
    // Carpeta 3 (Iconos/3).
    ['Algas (en general)', 112, 120], ['Algas coralináceas', 120, 120],
    ['Algas dasycladáceas', 102, 120],
    ['Algas verdes - azules (cianofíceas)', 120, 120],
    ['Alveolinas', 120, 50], ['Ammonites', 104, 120],
    ['Areniscas almohadilladas', 120, 66], ['Arqueociátidos', 120, 80],
    ['Asilinas', 120, 50], ['Paleodictyon', 120, 112], ['Peces', 120, 50],
    ['Perforaciones', 120, 70], ['Pilares', 120, 39], ['Pisadas', 120, 66],
    ['Pistas', 120, 70], ['Polen y esporas', 115, 120], ['Prod casts', 120, 23],
    ['Radiolarios', 120, 104], ['Raíces', 67, 120], ['Rhizocorallium', 113, 120],
    ['Ripples de corrientes', 120, 37], ['Ripples de olas', 120, 43],
    ['Rizocreciones', 77, 120], ['Rudistas', 113, 120],
    ['Rudita intraformacional', 120, 52], ['Saccocomidae', 120, 71],
    ['Serpúlidos', 102, 120], ['Skip casts', 120, 26], ['Skolithos', 80, 120],
    ['Slumping', 120, 75], ['Superficie de omisión', 120, 10],
    ['Superficie endurecida', 120, 10], ['Superficie erosionada', 120, 26],
    ['Superficie karstificada', 120, 29], ['Tentaculites', 93, 120],
    ['Tepee', 120, 56], ['Thalassinoides', 120, 98], ['Tintínidos', 120, 86],
    ['Trilobites', 120, 64], ['Venas', 120, 111], ['Vertebrados', 54, 120],
    ['Zoophycos', 110, 120],
  ];
  const RASTER_NATURAL_SIZE = {};
  RASTER_ICON_NAMES.forEach(([name, w, h]) => {
    STRUCT_ICONS[name] = rasterIcon(name);
    RASTER_NATURAL_SIZE[name] = [w, h];
  });

  /**
   * Ajusta [natW,natH] dentro de una caja boxW×boxH conservando la
   * proporción (equivalente a preserveAspectRatio="meet" pero calculado
   * a mano, porque rasterIcon() ahora usa "none" para permitir el
   * estiramiento independiente que pide el panel de Tamaño X/Tamaño Y).
   * Si `name` no es un ícono raster (no tiene tamaño natural registrado),
   * devuelve la caja tal cual — los íconos vectoriales no tienen relación
   * de aspecto propia, su geometría ya se calcula a partir de w y h.
   */
  function naturalFitBox(name, boxW, boxH) {
    const nat = RASTER_NATURAL_SIZE[name];
    if (!nat) return { w: boxW, h: boxH };
    const [nw, nh] = nat;
    const scale = Math.min(boxW / nw, boxH / nh);
    return { w: nw * scale, h: nh * scale };
  }

  /**
   * Resuelve el w,h final de un ícono de estructura a partir de sus
   * overrides individuales (iconSize = alto, iconSizeX = ancho):
   *   - ninguno fijado  → ajusta la proporción natural dentro de la caja
   *     por defecto (defaultW × defaultH).
   *   - solo uno fijado → el otro eje sigue la proporción natural a
   *     partir del valor fijado (para que tocar un solo control no
   *     deforme el ícono).
   *   - ambos fijados   → tamaño literal, estiramiento independiente.
   * Para íconos vectoriales (sin tamaño natural registrado) el
   * comportamiento es el de siempre: cada eje usa su propio default.
   */
  function resolveStructIconSize(name, iconSize, iconSizeX, defaultH, defaultW) {
    const nat = RASTER_NATURAL_SIZE[name];
    if (!nat) return { w: iconSizeX ?? defaultW, h: iconSize ?? defaultH };
    const ratio = nat[0] / nat[1]; // w/h
    if (iconSize != null && iconSizeX != null) return { w: iconSizeX, h: iconSize };
    if (iconSize != null) return { w: iconSize * ratio, h: iconSize };
    if (iconSizeX != null) return { w: iconSizeX, h: iconSizeX / ratio };
    return naturalFitBox(name, defaultW, defaultH);
  }

  // ─────────────────────────────────────────────────────────────────
  // ICONOS DE FÓSILES
  // ─────────────────────────────────────────────────────────────────

  const FC = '#1e6b1e'; // color de los iconos de fósil

  const FOSSIL_TYPE_ICONS = {

    // ── Macrofósiles ─────────────────────────────────────────────
    'Ammonites'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.42;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.8"/>
              <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r*0.62)}" fill="none" stroke="${FC}" stroke-width="0.6"/>
              <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r*0.3)}" fill="none" stroke="${FC}" stroke-width="0.55"/>
              <line x1="${f(cx)}" y1="${f(cy-r)}" x2="${f(cx+r*0.72)}" y2="${f(cy-r*0.72)}" stroke="${FC}" stroke-width="0.5"/>`;
    },

    'Arqueociátidos'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.38;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.8"/>
              <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r*0.5)}" fill="none" stroke="${FC}" stroke-width="0.7"/>
              <line x1="${f(cx-r)}" y1="${f(cy)}" x2="${f(cx+r)}" y2="${f(cy)}" stroke="${FC}" stroke-width="0.4" opacity="0.5"/>
              <line x1="${f(cx)}" y1="${f(cy-r)}" x2="${f(cx)}" y2="${f(cy+r)}" stroke="${FC}" stroke-width="0.4" opacity="0.5"/>`;
    },

    'Belemnites'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2;
      return `<ellipse cx="${f(cx-w*0.05)}" cy="${f(cy)}" rx="${f(w*0.38)}" ry="${f(h*0.28)}" fill="none" stroke="${FC}" stroke-width="0.75"/>
              <path d="M ${f(cx+w*0.33)} ${f(cy)} L ${f(x+w-1)} ${f(cy)}" stroke="${FC}" stroke-width="1.1"/>`;
    },

    'Briozoos (colonias)'(x, y, w, h) {
      const tx = x + w / 2, ty = y + h * 0.85;
      return `<line x1="${f(tx)}" y1="${f(ty)}" x2="${f(tx)}" y2="${f(y+h*0.45)}" stroke="${FC}" stroke-width="0.7"/>
              <line x1="${f(tx)}" y1="${f(y+h*0.45)}" x2="${f(tx-w*0.3)}" y2="${f(y+h*0.12)}" stroke="${FC}" stroke-width="0.6"/>
              <line x1="${f(tx)}" y1="${f(y+h*0.45)}" x2="${f(tx+w*0.3)}" y2="${f(y+h*0.12)}" stroke="${FC}" stroke-width="0.6"/>
              <line x1="${f(tx-w*0.3)}" y1="${f(y+h*0.12)}" x2="${f(tx-w*0.45)}" y2="${f(y+1)}" stroke="${FC}" stroke-width="0.5"/>
              <line x1="${f(tx-w*0.3)}" y1="${f(y+h*0.12)}" x2="${f(tx-w*0.12)}" y2="${f(y+1)}" stroke="${FC}" stroke-width="0.5"/>
              <line x1="${f(tx+w*0.3)}" y1="${f(y+h*0.12)}" x2="${f(tx+w*0.45)}" y2="${f(y+1)}" stroke="${FC}" stroke-width="0.5"/>
              <line x1="${f(tx+w*0.3)}" y1="${f(y+h*0.12)}" x2="${f(tx+w*0.12)}" y2="${f(y+1)}" stroke="${FC}" stroke-width="0.5"/>`;
    },

    'Braquiópodos'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2;
      return `<path d="M ${f(x+1)} ${f(cy)} Q ${f(cx)} ${f(y+1)} ${f(x+w-1)} ${f(cy)}" fill="none" stroke="${FC}" stroke-width="0.8"/>
              <path d="M ${f(x+1)} ${f(cy)} Q ${f(cx)} ${f(y+h-1)} ${f(x+w-1)} ${f(cy)}" fill="none" stroke="${FC}" stroke-width="0.8"/>
              <line x1="${f(cx)}" y1="${f(y+2)}" x2="${f(cx)}" y2="${f(y+h-2)}" stroke="${FC}" stroke-width="0.4" opacity="0.5"/>`;
    },

    'Cirrípedos'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2;
      return `<polygon points="${f(cx)},${f(y+1)} ${f(x+w-1)},${f(y+h*0.45)} ${f(x+w*0.75)},${f(y+h-1)} ${f(cx-w*0.25)},${f(y+h-1)} ${f(x+1)},${f(y+h*0.45)}" fill="none" stroke="${FC}" stroke-width="0.7"/>
              <line x1="${f(x+1)}" y1="${f(y+h*0.45)}" x2="${f(x+w-1)}" y2="${f(y+h*0.45)}" stroke="${FC}" stroke-width="0.4" opacity="0.5"/>`;
    },

    'Corales aislados'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.38;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.75"/>` +
        Array.from({length:6}, (_,i) => {
          const a = i * 60 * Math.PI / 180;
          return `<line x1="${f(cx)}" y1="${f(cy)}" x2="${f(cx+r*0.85*Math.cos(a))}" y2="${f(cy+r*0.85*Math.sin(a))}" stroke="${FC}" stroke-width="0.45"/>`;
        }).join('');
    },

    'Corales coloniales'(x, y, w, h) {
      const r = Math.min(w,h) * 0.18;
      return [[0.25,0.32],[0.62,0.28],[0.42,0.65],[0.78,0.65],[0.12,0.68]].map(([tx,ty]) =>
        `<circle cx="${f(x+w*tx)}" cy="${f(y+h*ty)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.6"/>`
      ).join('');
    },

    'Corales (hexacoralarios)'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.4;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.75"/>` +
        Array.from({length:6}, (_,i) => {
          const a = i * 60 * Math.PI / 180;
          return `<line x1="${f(cx)}" y1="${f(cy)}" x2="${f(cx+r*Math.cos(a))}" y2="${f(cy+r*Math.sin(a))}" stroke="${FC}" stroke-width="0.5"/>`;
        }).join('');
    },

    'Corales (tetracoralarios)'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.4;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.75"/>` +
        Array.from({length:4}, (_,i) => {
          const a = i * 90 * Math.PI / 180;
          return `<line x1="${f(cx)}" y1="${f(cy)}" x2="${f(cx+r*Math.cos(a))}" y2="${f(cy+r*Math.sin(a))}" stroke="${FC}" stroke-width="0.5"/>`;
        }).join('');
    },

    'Crinoides'(x, y, w, h) {
      const tx = x + w * 0.5;
      return `<line x1="${f(tx)}" y1="${f(y+h)}" x2="${f(tx)}" y2="${f(y+h*0.4)}" stroke="${FC}" stroke-width="0.8"/>
              <circle cx="${f(tx)}" cy="${f(y+h*0.28)}" r="${f(Math.min(w,h)*0.2)}" fill="none" stroke="${FC}" stroke-width="0.75"/>
              <line x1="${f(tx-w*0.22)}" y1="${f(y+h*0.62)}" x2="${f(tx+w*0.22)}" y2="${f(y+h*0.62)}" stroke="${FC}" stroke-width="0.45"/>
              <line x1="${f(tx-w*0.18)}" y1="${f(y+h*0.75)}" x2="${f(tx+w*0.18)}" y2="${f(y+h*0.75)}" stroke="${FC}" stroke-width="0.45"/>`;
    },

    'Dientes de mamíferos'(x, y, w, h) {
      const b = y + h - 1;
      return `<path d="M ${f(x+1)} ${f(b)} L ${f(x+1)} ${f(y+h*0.4)} Q ${f(x+w*0.25)} ${f(y+1)} ${f(x+w*0.5)} ${f(y+h*0.4)} Q ${f(x+w*0.75)} ${f(y+1)} ${f(x+w-1)} ${f(y+h*0.4)} L ${f(x+w-1)} ${f(b)} Z" fill="none" stroke="${FC}" stroke-width="0.75"/>`;
    },

    'Equínidos'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.38;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.75"/>` +
        Array.from({length:5}, (_,i) => {
          const a = (i * 72 - 90) * Math.PI / 180;
          return `<line x1="${f(cx+r*Math.cos(a))}" y1="${f(cy+r*Math.sin(a))}" x2="${f(cx+(r+2)*Math.cos(a))}" y2="${f(cy+(r+2)*Math.sin(a))}" stroke="${FC}" stroke-width="0.65"/>`;
        }).join('');
    },

    'Esponjas'(x, y, w, h) {
      const cx = x + w / 2;
      return `<path d="M ${f(cx-w*0.28)} ${f(y+h-1)} Q ${f(cx-w*0.32)} ${f(y+1)} ${f(cx)} ${f(y+1)} Q ${f(cx+w*0.32)} ${f(y+1)} ${f(cx+w*0.28)} ${f(y+h-1)} Z" fill="none" stroke="${FC}" stroke-width="0.75"/>
              <line x1="${f(cx-w*0.18)}" y1="${f(y+h*0.35)}" x2="${f(cx+w*0.18)}" y2="${f(y+h*0.35)}" stroke="${FC}" stroke-width="0.4" opacity="0.5"/>
              <line x1="${f(cx-w*0.22)}" y1="${f(y+h*0.58)}" x2="${f(cx+w*0.22)}" y2="${f(y+h*0.58)}" stroke="${FC}" stroke-width="0.4" opacity="0.5"/>`;
    },

    'Estromatopóridos'(x, y, w, h) {
      return `<line x1="${f(x)}" y1="${f(y+h*0.2)}" x2="${f(x+w)}" y2="${f(y+h*0.2)}" stroke="${FC}" stroke-width="0.6"/>
              <line x1="${f(x)}" y1="${f(y+h*0.42)}" x2="${f(x+w)}" y2="${f(y+h*0.42)}" stroke="${FC}" stroke-width="0.6"/>
              <line x1="${f(x)}" y1="${f(y+h*0.64)}" x2="${f(x+w)}" y2="${f(y+h*0.64)}" stroke="${FC}" stroke-width="0.6"/>
              <line x1="${f(x)}" y1="${f(y+h*0.86)}" x2="${f(x+w)}" y2="${f(y+h*0.86)}" stroke="${FC}" stroke-width="0.6"/>
              <line x1="${f(x+w*0.25)}" y1="${f(y)}" x2="${f(x+w*0.25)}" y2="${f(y+h)}" stroke="${FC}" stroke-width="0.4" opacity="0.5"/>
              <line x1="${f(x+w*0.55)}" y1="${f(y)}" x2="${f(x+w*0.55)}" y2="${f(y+h)}" stroke="${FC}" stroke-width="0.4" opacity="0.5"/>
              <line x1="${f(x+w*0.82)}" y1="${f(y)}" x2="${f(x+w*0.82)}" y2="${f(y+h)}" stroke="${FC}" stroke-width="0.4" opacity="0.5"/>`;
    },

    'Gasterópodos continentales'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.4;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.7"/>
              <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r*0.55)}" fill="none" stroke="${FC}" stroke-width="0.55"/>
              <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r*0.22)}" fill="${FC}" opacity="0.35"/>`;
    },

    'Gasterópodos marinos'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.4;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.7"/>
              <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r*0.55)}" fill="none" stroke="${FC}" stroke-width="0.55"/>
              <path d="M ${f(cx+r*0.55)} ${f(cy)} L ${f(cx+r+2)} ${f(cy-1)}" stroke="${FC}" stroke-width="0.8"/>`;
    },

    'Graptolites'(x, y, w, h) {
      const my = y + h / 2;
      return `<line x1="${f(x+1)}" y1="${f(my)}" x2="${f(x+w-1)}" y2="${f(my)}" stroke="${FC}" stroke-width="1.0"/>` +
        Array.from({length:5}, (_,i) =>
          `<line x1="${f(x+w*0.1+i*w*0.17)}" y1="${f(my)}" x2="${f(x+w*0.1+i*w*0.17-w*0.06)}" y2="${f(my-h*0.38)}" stroke="${FC}" stroke-width="0.5"/>`
        ).join('');
    },

    'Nautiloideos'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.42;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.8"/>
              <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r*0.65)}" fill="none" stroke="${FC}" stroke-width="0.55"/>
              <line x1="${f(cx-r*0.65)}" y1="${f(cy)}" x2="${f(cx-r)}" y2="${f(cy)}" stroke="${FC}" stroke-width="0.45"/>
              <line x1="${f(cx)}" y1="${f(cy-r*0.65)}" x2="${f(cx)}" y2="${f(cy-r)}" stroke="${FC}" stroke-width="0.45"/>`;
    },

    'Ortocerátidos'(x, y, w, h) {
      return `<path d="M ${f(x+w*0.12)} ${f(y+h-1)} L ${f(x+w*0.88)} ${f(y+1)}" stroke="${FC}" stroke-width="1.1"/>
              <path d="M ${f(x+w*0.22)} ${f(y+h-1)} L ${f(x+w*0.78)} ${f(y+1)}" stroke="${FC}" stroke-width="1.1"/>
              <line x1="${f(x+w*0.3)}" y1="${f(y+h*0.65)}" x2="${f(x+w*0.7)}" y2="${f(y+h*0.42)}" stroke="${FC}" stroke-width="0.4" opacity="0.5"/>
              <line x1="${f(x+w*0.2)}" y1="${f(y+h*0.45)}" x2="${f(x+w*0.6)}" y2="${f(y+h*0.22)}" stroke="${FC}" stroke-width="0.4" opacity="0.5"/>`;
    },

    'Ostreidos'(x, y, w, h) {
      const cx = x + w / 2;
      return `<path d="M ${f(x+2)} ${f(y+h-1)} C ${f(x+1)} ${f(y+h*0.4)} ${f(cx-w*0.15)} ${f(y+1)} ${f(cx)} ${f(y+1)} C ${f(cx+w*0.22)} ${f(y+1)} ${f(x+w-1)} ${f(y+h*0.5)} ${f(x+w-2)} ${f(y+h-1)}" fill="none" stroke="${FC}" stroke-width="0.75"/>
              <line x1="${f(x+2)}" y1="${f(y+h-1)}" x2="${f(x+w-2)}" y2="${f(y+h-1)}" stroke="${FC}" stroke-width="0.6"/>`;
    },

    'Peces'(x, y, w, h) {
      const cy = y + h / 2;
      return `<path d="M ${f(x+w*0.75)} ${f(y+1)} L ${f(x+w-1)} ${f(cy)} L ${f(x+w*0.75)} ${f(y+h-1)} Z" fill="${FC}" opacity="0.3" stroke="${FC}" stroke-width="0.6"/>
              <ellipse cx="${f(x+w*0.42)}" cy="${f(cy)}" rx="${f(w*0.33)}" ry="${f(h*0.4)}" fill="none" stroke="${FC}" stroke-width="0.75"/>
              <circle cx="${f(x+w*0.22)}" cy="${f(cy-h*0.08)}" r="1.2" fill="${FC}" opacity="0.5"/>`;
    },

    'Rudistas'(x, y, w, h) {
      const cx = x + w * 0.5;
      return `<path d="M ${f(cx-w*0.22)} ${f(y+h-1)} L ${f(cx-w*0.22)} ${f(y+1)} Q ${f(cx)} ${f(y+1)} ${f(cx+w*0.22)} ${f(y+1)} L ${f(cx+w*0.22)} ${f(y+h-1)}" fill="none" stroke="${FC}" stroke-width="0.8"/>
              <line x1="${f(cx-w*0.22)}" y1="${f(y+h*0.38)}" x2="${f(cx+w*0.22)}" y2="${f(y+h*0.38)}" stroke="${FC}" stroke-width="0.4" opacity="0.5"/>
              <line x1="${f(cx-w*0.22)}" y1="${f(y+h*0.62)}" x2="${f(cx+w*0.22)}" y2="${f(y+h*0.62)}" stroke="${FC}" stroke-width="0.4" opacity="0.5"/>`;
    },

    'Serpúlidos'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.3;
      return `<path d="M ${f(cx+r)} ${f(cy)} A ${f(r)} ${f(r)} 0 1 1 ${f(cx+r*0.02)} ${f(cy+r)}" fill="none" stroke="${FC}" stroke-width="1.2"/>
              <line x1="${f(cx+r*0.02)}" y1="${f(cy+r)}" x2="${f(cx+r*0.02)}" y2="${f(y+h-1)}" stroke="${FC}" stroke-width="1.0"/>`;
    },

    'Trilobites'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2;
      return `<ellipse cx="${f(cx)}" cy="${f(y+h*0.28)}" rx="${f(w*0.3)}" ry="${f(h*0.22)}" fill="none" stroke="${FC}" stroke-width="0.75"/>
              <rect x="${f(cx-w*0.12)}" y="${f(y+h*0.48)}" width="${f(w*0.24)}" height="${f(h*0.42)}" rx="2" fill="none" stroke="${FC}" stroke-width="0.7"/>
              <line x1="${f(cx)}" y1="${f(y+h*0.48)}" x2="${f(cx)}" y2="${f(y+h*0.9)}" stroke="${FC}" stroke-width="0.4" opacity="0.5"/>`;
    },

    'Vertebrados'(x, y, w, h) {
      const cx = x + w / 2, r = Math.min(w,h) * 0.28;
      return `<circle cx="${f(cx)}" cy="${f(y+h*0.35)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.75"/>
              <line x1="${f(cx)}" y1="${f(y+h*0.35+r)}" x2="${f(cx)}" y2="${f(y+h-1)}" stroke="${FC}" stroke-width="0.6"/>
              <line x1="${f(cx-w*0.28)}" y1="${f(y+h*0.55)}" x2="${f(cx+w*0.28)}" y2="${f(y+h*0.55)}" stroke="${FC}" stroke-width="0.5" opacity="0.5"/>`;
    },

    // ── Microfósiles ──────────────────────────────────────────────
    'Algas coralináceas'(x, y, w, h) {
      const tx = x + w / 2, ty = y + h / 2;
      return `<line x1="${f(tx)}" y1="${f(ty)}" x2="${f(tx-w*0.25)}" y2="${f(y+1)}"   stroke="${FC}" stroke-width="0.6"/>
              <line x1="${f(tx)}" y1="${f(ty)}" x2="${f(tx+w*0.28)}" y2="${f(y+1)}"   stroke="${FC}" stroke-width="0.6"/>
              <line x1="${f(tx)}" y1="${f(ty)}" x2="${f(tx-w*0.3)}"  y2="${f(y+h-1)}" stroke="${FC}" stroke-width="0.6"/>
              <line x1="${f(tx)}" y1="${f(ty)}" x2="${f(tx+w*0.26)}" y2="${f(y+h-1)}" stroke="${FC}" stroke-width="0.6"/>
              <circle cx="${f(tx)}" cy="${f(ty)}" r="1.5" fill="${FC}" opacity="0.5"/>`;
    },

    'Algas dasycladáceas'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2;
      return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(w*0.16)}" ry="${f(h*0.44)}" fill="none" stroke="${FC}" stroke-width="0.75"/>` +
        Array.from({length:6}, (_,i) => {
          const yy = y + h * (0.15 + i * 0.14);
          return `<line x1="${f(cx+w*0.16)}" y1="${f(yy)}" x2="${f(cx+w*0.35)}" y2="${f(yy)}" stroke="${FC}" stroke-width="0.45"/>`;
        }).join('');
    },

    'Calciesferas'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.34;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.7"/>
              <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r*0.4)}" fill="${FC}" opacity="0.3"/>`;
    },

    'Caráceas'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2;
      return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(w*0.3)}" ry="${f(h*0.4)}" fill="none" stroke="${FC}" stroke-width="0.7"/>
              <path d="M ${f(cx-w*0.18)} ${f(cy-h*0.1)} C ${f(cx-w*0.05)} ${f(cy-h*0.35)} ${f(cx+w*0.15)} ${f(cy+h*0.1)} ${f(cx+w*0.18)} ${f(cy)}" fill="none" stroke="${FC}" stroke-width="0.5"/>`;
    },

    'Cocolitos'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.36;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.7"/>
              <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r*0.42)}" fill="none" stroke="${FC}" stroke-width="0.55"/>` +
        Array.from({length:8}, (_,i) => {
          const a = i * 45 * Math.PI / 180;
          return `<line x1="${f(cx+r*0.42*Math.cos(a))}" y1="${f(cy+r*0.42*Math.sin(a))}" x2="${f(cx+r*Math.cos(a))}" y2="${f(cy+r*Math.sin(a))}" stroke="${FC}" stroke-width="0.4"/>`;
        }).join('');
    },

    'Conodontos'(x, y, w, h) {
      const my = y + h / 2;
      return `<path d="M ${f(x+1)} ${f(my)} C ${f(x+w*0.4)} ${f(y+1)} ${f(x+w*0.7)} ${f(y+2)} ${f(x+w-1)} ${f(my)}" fill="none" stroke="${FC}" stroke-width="0.8"/>
              <line x1="${f(x+w*0.2)}" y1="${f(my)}" x2="${f(x+w*0.22)}" y2="${f(my-h*0.38)}" stroke="${FC}" stroke-width="0.5"/>
              <line x1="${f(x+w*0.4)}" y1="${f(my)}" x2="${f(x+w*0.4)}" y2="${f(my-h*0.42)}" stroke="${FC}" stroke-width="0.5"/>
              <line x1="${f(x+w*0.6)}" y1="${f(my)}" x2="${f(x+w*0.58)}" y2="${f(my-h*0.32)}" stroke="${FC}" stroke-width="0.5"/>`;
    },

    'Diatomeas'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2;
      return `<rect x="${f(cx-w*0.32)}" y="${f(cy-h*0.38)}" width="${f(w*0.64)}" height="${f(h*0.76)}" rx="3" fill="none" stroke="${FC}" stroke-width="0.7"/>` +
        Array.from({length:5}, (_,i) =>
          `<line x1="${f(cx-w*0.28)}" y1="${f(cy-h*0.3+i*h*0.15)}" x2="${f(cx+w*0.28)}" y2="${f(cy-h*0.3+i*h*0.15)}" stroke="${FC}" stroke-width="0.4" opacity="0.6"/>`
        ).join('');
    },

    'Dinoflagelados'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.32;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.7"/>
              <line x1="${f(cx)}" y1="${f(cy-r)}" x2="${f(cx+2)}" y2="${f(cy-r-3)}" stroke="${FC}" stroke-width="0.6"/>
              <line x1="${f(cx)}" y1="${f(cy+r)}" x2="${f(cx-2)}" y2="${f(cy+r+3)}" stroke="${FC}" stroke-width="0.6"/>
              <path d="M ${f(cx-r)} ${f(cy)} Q ${f(cx-r-2)} ${f(cy+1)} ${f(cx+r)} ${f(cy)}" fill="none" stroke="${FC}" stroke-width="0.45" stroke-dasharray="1 1"/>`;
    },

    'Espículas de esponjas'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = h * 0.38;
      return `<line x1="${f(cx-r)}" y1="${f(cy)}" x2="${f(cx+r)}" y2="${f(cy)}" stroke="${FC}" stroke-width="0.65"/>
              <line x1="${f(cx)}" y1="${f(cy-r)}" x2="${f(cx)}" y2="${f(cy+r)}" stroke="${FC}" stroke-width="0.65"/>
              <line x1="${f(cx-r*0.7)}" y1="${f(cy-r*0.7)}" x2="${f(cx+r*0.7)}" y2="${f(cy+r*0.7)}" stroke="${FC}" stroke-width="0.55"/>
              <line x1="${f(cx+r*0.7)}" y1="${f(cy-r*0.7)}" x2="${f(cx-r*0.7)}" y2="${f(cy+r*0.7)}" stroke="${FC}" stroke-width="0.55"/>`;
    },

    'Filamentos'(x, y, w, h) {
      const my = y + h / 2;
      return `<path d="M ${f(x+1)} ${f(my)} C ${f(x+w*0.3)} ${f(y+h*0.1)} ${f(x+w*0.6)} ${f(y+h*0.85)} ${f(x+w-1)} ${f(my)}" fill="none" stroke="${FC}" stroke-width="0.65"/>`;
    },

    'Alveolinas'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2;
      return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(w*0.42)}" ry="${f(h*0.3)}" fill="none" stroke="${FC}" stroke-width="0.75"/>
              <ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(w*0.28)}" ry="${f(h*0.18)}" fill="none" stroke="${FC}" stroke-width="0.5"/>`;
    },

    'Discociclinas'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.4;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.75"/>
              <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r*0.55)}" fill="none" stroke="${FC}" stroke-width="0.5"/>
              <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r*0.2)}" fill="${FC}" opacity="0.35"/>`;
    },

    'Fusulinas'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2;
      return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(w*0.44)}" ry="${f(h*0.28)}" fill="none" stroke="${FC}" stroke-width="0.8"/>
              <ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(w*0.3)}" ry="${f(h*0.18)}" fill="none" stroke="${FC}" stroke-width="0.5"/>
              <ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(w*0.16)}" ry="${f(h*0.1)}" fill="none" stroke="${FC}" stroke-width="0.45"/>`;
    },

    'Milióidos'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.35;
      return `<path d="M ${f(cx)} ${f(cy-r)} A ${f(r)} ${f(r)} 0 1 0 ${f(cx)} ${f(cy+r)}" fill="none" stroke="${FC}" stroke-width="0.75"/>
              <path d="M ${f(cx)} ${f(cy+r)} A ${f(r)} ${f(r)} 0 1 0 ${f(cx)} ${f(cy-r)}" fill="none" stroke="${FC}" stroke-width="0.5" stroke-dasharray="2 1"/>`;
    },

    'Nummulites'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.4;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.8"/>
              <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r*0.68)}" fill="none" stroke="${FC}" stroke-width="0.55"/>
              <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r*0.38)}" fill="none" stroke="${FC}" stroke-width="0.45"/>
              <line x1="${f(cx-r)}" y1="${f(cy)}" x2="${f(cx+r)}" y2="${f(cy)}" stroke="${FC}" stroke-width="0.4" opacity="0.4"/>`;
    },

    'Operculinas'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.4;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.75"/>
              <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r*0.62)}" fill="none" stroke="${FC}" stroke-width="0.55"/>
              <path d="M ${f(cx)} ${f(cy-r*0.62)} A ${f(r*0.62)} ${f(r*0.62)} 0 0 1 ${f(cx+r*0.62)} ${f(cy)}" fill="none" stroke="${FC}" stroke-width="0.45"/>`;
    },

    'Orbitoides'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.38;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.75"/>` +
        Array.from({length:8}, (_,i) => {
          const a = i * 45 * Math.PI / 180;
          return `<line x1="${f(cx+r*0.55*Math.cos(a))}" y1="${f(cy+r*0.55*Math.sin(a))}" x2="${f(cx+r*Math.cos(a))}" y2="${f(cy+r*Math.sin(a))}" stroke="${FC}" stroke-width="0.4"/>`;
        }).join('');
    },

    'Orbitolinas'(x, y, w, h) {
      const cx = x + w / 2;
      return `<path d="M ${f(x+1)} ${f(y+h-1)} L ${f(cx)} ${f(y+1)} L ${f(x+w-1)} ${f(y+h-1)} Z" fill="none" stroke="${FC}" stroke-width="0.8"/>
              <line x1="${f(x+1)}" y1="${f(y+h-1)}" x2="${f(x+w-1)}" y2="${f(y+h-1)}" stroke="${FC}" stroke-width="0.55"/>`;
    },

    'Foraminíferos planctónicos'(x, y, w, h) {
      const r = Math.min(w,h) * 0.2;
      return [[0.22,0.32],[0.6,0.28],[0.4,0.68],[0.78,0.65]].map(([tx,ty]) =>
        `<circle cx="${f(x+w*tx)}" cy="${f(y+h*ty)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.6"/>` +
        `<circle cx="${f(x+w*tx)}" cy="${f(y+h*ty)}" r="${f(r*0.35)}" fill="${FC}" opacity="0.3"/>`
      ).join('');
    },

    'Nannoplancton calizo'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.38;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.65"/>` +
        Array.from({length:5}, (_,i) => {
          const a = (i * 72 - 90) * Math.PI / 180;
          return `<line x1="${f(cx)}" y1="${f(cy)}" x2="${f(cx+r*Math.cos(a))}" y2="${f(cy+r*Math.sin(a))}" stroke="${FC}" stroke-width="0.4"/>`;
        }).join('');
    },

    'Ostrácodos'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2;
      return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(w*0.4)}" ry="${f(h*0.35)}" fill="none" stroke="${FC}" stroke-width="0.8"/>
              <line x1="${f(cx-w*0.4)}" y1="${f(cy)}" x2="${f(cx+w*0.4)}" y2="${f(cy)}" stroke="${FC}" stroke-width="0.45" stroke-dasharray="1.5 1"/>`;
    },

    'Polen y esporas'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.32;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.7"/>` +
        Array.from({length:3}, (_,i) => {
          const a = i * 120 * Math.PI / 180;
          return `<circle cx="${f(cx+r*1.05*Math.cos(a))}" cy="${f(cy+r*1.05*Math.sin(a))}" r="${f(r*0.35)}" fill="none" stroke="${FC}" stroke-width="0.55"/>`;
        }).join('');
    },

    'Radiolarios'(x, y, w, h) {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w,h) * 0.28;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.7"/>` +
        Array.from({length:8}, (_,i) => {
          const a = i * 45 * Math.PI / 180;
          return `<line x1="${f(cx+r*Math.cos(a))}" y1="${f(cy+r*Math.sin(a))}" x2="${f(cx+(r+3)*Math.cos(a))}" y2="${f(cy+(r+3)*Math.sin(a))}" stroke="${FC}" stroke-width="0.55"/>`;
        }).join('');
    },

    'Tentaculites'(x, y, w, h) {
      const cx = x + w / 2;
      return `<path d="M ${f(cx-w*0.1)} ${f(y+h-1)} L ${f(cx-w*0.22)} ${f(y+1)}" stroke="${FC}" stroke-width="1.1"/>
              <path d="M ${f(cx+w*0.1)} ${f(y+h-1)} L ${f(cx+w*0.22)} ${f(y+1)}" stroke="${FC}" stroke-width="1.1"/>
              <line x1="${f(cx-w*0.2)}" y1="${f(y+h*0.3)}" x2="${f(cx+w*0.2)}" y2="${f(y+h*0.3)}" stroke="${FC}" stroke-width="0.4" opacity="0.5"/>
              <line x1="${f(cx-w*0.16)}" y1="${f(y+h*0.5)}" x2="${f(cx+w*0.16)}" y2="${f(y+h*0.5)}" stroke="${FC}" stroke-width="0.4" opacity="0.5"/>
              <line x1="${f(cx-w*0.12)}" y1="${f(y+h*0.7)}" x2="${f(cx+w*0.12)}" y2="${f(y+h*0.7)}" stroke="${FC}" stroke-width="0.4" opacity="0.5"/>`;
    },

    'Tintínidos'(x, y, w, h) {
      const cx = x + w / 2;
      return `<path d="M ${f(cx-w*0.28)} ${f(y+h-1)} Q ${f(cx-w*0.32)} ${f(y+1)} ${f(cx)} ${f(y+1)} Q ${f(cx+w*0.32)} ${f(y+1)} ${f(cx+w*0.28)} ${f(y+h-1)}" fill="none" stroke="${FC}" stroke-width="0.75"/>
              <line x1="${f(cx-w*0.28)}" y1="${f(y+h-1)}" x2="${f(cx+w*0.28)}" y2="${f(y+h-1)}" stroke="${FC}" stroke-width="0.6"/>
              <circle cx="${f(cx)}" cy="${f(y+h*0.38)}" r="${f(Math.min(w,h)*0.15)}" fill="none" stroke="${FC}" stroke-width="0.5"/>`;
    },

    'Briozoos'(x, y, w, h) {
      const cx = x + w/2, cy = y + h/2, r = Math.min(w,h)*0.38;
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${FC}" stroke-width="0.75"/>
              <line x1="${f(cx-r)}" y1="${f(cy)}" x2="${f(cx+r)}" y2="${f(cy)}" stroke="${FC}" stroke-width="0.45"/>
              <line x1="${f(cx)}" y1="${f(cy-r)}" x2="${f(cx)}" y2="${f(cy+r)}" stroke="${FC}" stroke-width="0.45"/>`;
    },

    'Asilinas'(x, y, w, h) {
      const cx = x+w/2, cy = y+h/2, rx2 = w*0.42, ry2 = h*0.3;
      return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx2)}" ry="${f(ry2)}" fill="none" stroke="${FC}" stroke-width="0.75"/>
              <ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx2*0.55)}" ry="${f(ry2*0.55)}" fill="none" stroke="${FC}" stroke-width="0.5" opacity="0.6"/>
              <line x1="${f(cx-rx2*0.85)}" y1="${f(cy)}" x2="${f(cx+rx2*0.85)}" y2="${f(cy)}" stroke="${FC}" stroke-width="0.35" opacity="0.4"/>`;
    },

    'Miliólidos'(x, y, w, h) {
      const cx = x+w/2, cy = y+h/2, rx2 = w*0.4, ry2 = h*0.27;
      return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx2)}" ry="${f(ry2)}" fill="none" stroke="${FC}" stroke-width="0.75"/>
              <ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx2*0.55)}" ry="${f(ry2*0.55)}" fill="none" stroke="${FC}" stroke-width="0.5" opacity="0.7"/>`;
    },

    'Saccocomidae'(x, y, w, h) {
      const cx = x+w/2, cy = y+h/2, r = Math.min(w,h)*0.4;
      const arms = Array.from({length:5}, (_,i) => {
        const a = (i*72 - 90) * Math.PI/180;
        return `<line x1="${f(cx)}" y1="${f(cy)}" x2="${f(cx+r*Math.cos(a))}" y2="${f(cy+r*Math.sin(a))}" stroke="${FC}" stroke-width="0.7"/>`;
      }).join('');
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r*0.2)}" fill="${FC}" opacity="0.7"/>` + arms;
    },

    '_default'(x, y, w, h) {
      return `<circle cx="${f(x+w/2)}" cy="${f(y+h/2)}" r="2.2" fill="none" stroke="${FC}" stroke-width="0.75"/>
              <circle cx="${f(x+w/2)}" cy="${f(y+h/2)}" r="0.8" fill="${FC}" opacity="0.5"/>`;
    },
  };

  // Puente: todos los iconos de fósiles están disponibles como iconos de estructura
  // para poder renderizarlos en la columna de estructuras sedimentarias.
  Object.entries(FOSSIL_TYPE_ICONS).forEach(([k, fn]) => {
    if (k !== '_default' && !(k in STRUCT_ICONS)) STRUCT_ICONS[k] = fn;
  });

  /**
   * Dibuja los iconos de tipos de fósiles de una unidad.
   * Apilados verticalmente en la esquina superior derecha del rect.
   */
  function drawFossilTypes(unit, rx, ry, rw, rh) {
    const types = unit.fossilTypes;
    if (!types || types.length === 0 || rh < 14) return '';

    const ICON_H = 9;
    const ICON_W = 12;
    const GAP    = 3;
    const MARGIN = 4;

    const maxIcons = Math.floor((rh - MARGIN * 2) / (ICON_H + GAP));
    const shown    = types.slice(0, maxIcons);

    return shown.map((type, idx) => {
      const ix = rx + rw - MARGIN - ICON_W;
      const iy = ry + MARGIN + idx * (ICON_H + GAP);
      const { w: iw, h: ih } = naturalFitBox(type, ICON_W, ICON_H);
      const fn = FOSSIL_TYPE_ICONS[type] ?? FOSSIL_TYPE_ICONS['_default'];
      return fn(ix, iy, iw, ih);
    }).filter(Boolean).join('');
  }

  /**
   * Dibuja los iconos de estructuras sedimentarias de una unidad.
   * Los apila verticalmente en la esquina inferior izquierda del rect.
   */
  function drawSedStructs(unit, rx, ry, rw, rh) {
    if (rh < 14) return '';

    // Prefer the rich format that carries per-icon position & size
    let entries;
    if (unit.estructurasSedimentarias && unit.estructurasSedimentarias.length > 0) {
      entries = unit.estructurasSedimentarias;
    } else if (unit.sedimentaryStructures && unit.sedimentaryStructures.length > 0) {
      const n = unit.sedimentaryStructures.length;
      entries = unit.sedimentaryStructures.map((s, i) => ({
        tipoEstructura: s,
        alturaRelativa: n === 1 ? 0.5 : i / (n - 1),
        offsetX: 0, iconSize: null, iconSizeX: null,
      }));
    } else {
      return '';
    }

    const DEFAULT_H = 9;
    const DEFAULT_W = 14;
    const MARGIN    = 4;

    return entries.map(e => {
      const nombre  = e.tipoEstructura;
      const ar      = Math.max(0, Math.min(1, e.alturaRelativa ?? 0.5));
      const { w: iw, h: ih } = resolveStructIconSize(nombre, e.iconSize, e.iconSizeX, DEFAULT_H, DEFAULT_W);
      const offsetX = e.offsetX ?? 0;
      // ar=1 → tope del rect, ar=0 → base; centrado verticalmente en esa altura
      const ix = rx + MARGIN + offsetX;
      const iy = Math.max(ry + MARGIN,
                   Math.min(ry + rh - ih - MARGIN,
                            ry + (1 - ar) * rh - ih / 2));
      const fn = STRUCT_ICONS[nombre] ?? STRUCT_ICONS['_default'];
      return fn(ix, iy, iw, ih);
    }).filter(Boolean).join('');
  }


  // ─────────────────────────────────────────────────────────────────
  // DATOS ESTRUCTURALES
  // ─────────────────────────────────────────────────────────────────

  const SDATA_COLOR = '#1e40af';

  // Cada símbolo devuelve { svg, labelX?, labelY? }: el palo/línea SIGUE
  // variando su ángulo según `dip` (rotación), pero ya no imprime el
  // número de grados — ese lugar (labelX,labelY) queda libre para el
  // campo "Dato estructural" (ver drawStructuralData). anticlinal/
  // sinclinal no tienen ángulo (su letra A/S no es un dato de inclinación)
  // así que no devuelven labelX/labelY — el dato libre cae a la posición
  // por defecto (debajo del símbolo) en esos dos casos.
  const STRUCT_DATA_SYMBOLS = {
    estratificacion(x, y, w, h, dip) {
      const cx = x + w*0.38, cy = y + h/2, sl = w*0.24, tl = h*0.44;
      const rad = (dip * Math.PI)/180;
      const tx = f(cx + tl*Math.sin(rad)), ty = f(cy + tl*Math.cos(rad));
      return {
        svg: `<line x1="${f(cx-sl)}" y1="${f(cy)}" x2="${f(cx+sl)}" y2="${f(cy)}" stroke="${SDATA_COLOR}" stroke-width="1.2"/>
              <line x1="${f(cx)}" y1="${f(cy)}" x2="${tx}" y2="${ty}" stroke="${SDATA_COLOR}" stroke-width="1.2"/>`,
        labelX: cx + sl + 1.5, labelY: cy + 2.5,
      };
    },
    falla_normal(x, y, w, h, dip) {
      const cx = x + w*0.38, cy = y + h/2, sl = w*0.24, th = h*0.35;
      return {
        svg: `<line x1="${f(cx-sl)}" y1="${f(cy)}" x2="${f(cx+sl)}" y2="${f(cy)}" stroke="${SDATA_COLOR}" stroke-width="1.2"/>
              <polygon points="${f(cx)},${f(cy)} ${f(cx-th*0.55)},${f(cy+th)} ${f(cx+th*0.55)},${f(cy+th)}" fill="none" stroke="${SDATA_COLOR}" stroke-width="0.8"/>`,
        labelX: cx + sl + 1.5, labelY: cy + 2.5,
      };
    },
    falla_inversa(x, y, w, h, dip) {
      const cx = x + w*0.38, cy = y + h/2, sl = w*0.24, th = h*0.35;
      return {
        svg: `<line x1="${f(cx-sl)}" y1="${f(cy)}" x2="${f(cx+sl)}" y2="${f(cy)}" stroke="${SDATA_COLOR}" stroke-width="1.2"/>
              <polygon points="${f(cx)},${f(cy)} ${f(cx-th*0.55)},${f(cy-th)} ${f(cx+th*0.55)},${f(cy-th)}" fill="${SDATA_COLOR}" opacity="0.8" stroke="${SDATA_COLOR}" stroke-width="0.7"/>`,
        labelX: cx + sl + 1.5, labelY: cy + 2.5,
      };
    },
    diaclasa(x, y, w, h, dip) {
      const cx = x + w*0.38, cy = y + h/2, sl = w*0.24, th = h*0.28;
      const rad = (dip * Math.PI)/180;
      const dx = th*Math.cos(rad), dy2 = th*Math.sin(rad);
      const x1 = f(cx - sl*Math.cos(rad)), y1 = f(cy - sl*Math.sin(rad));
      const x2 = f(cx + sl*Math.cos(rad)), y2 = f(cy + sl*Math.sin(rad));
      const ticks = [0.25, 0.5, 0.75].map(t => {
        const bx = cx - sl*Math.cos(rad) + t*2*sl*Math.cos(rad);
        const by = cy - sl*Math.sin(rad) + t*2*sl*Math.sin(rad);
        return `<line x1="${f(bx-dy2*0.5)}" y1="${f(by+dx*0.5)}" x2="${f(bx+dy2*0.5)}" y2="${f(by-dx*0.5)}" stroke="${SDATA_COLOR}" stroke-width="0.8"/>`;
      }).join('');
      return {
        svg: `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SDATA_COLOR}" stroke-width="1.2"/>${ticks}`,
        labelX: cx + sl*Math.cos(rad) + 1.5, labelY: cy + sl*Math.sin(rad) + 2.5,
      };
    },
    anticlinal(x, y, w, h) {
      const cx = x + w*0.38, by = y + h - 2, ty2 = y + 3, sl = w*0.22;
      return {
        svg: `<polyline points="${f(cx-sl)},${f(by)} ${f(cx)},${f(ty2)} ${f(cx+sl)},${f(by)}" fill="none" stroke="${SDATA_COLOR}" stroke-width="1.2"/>
              <line x1="${f(cx-sl)}" y1="${f(by)}" x2="${f(cx-sl-3)}" y2="${f(by-3)}" stroke="${SDATA_COLOR}" stroke-width="0.9"/>
              <line x1="${f(cx+sl)}" y1="${f(by)}" x2="${f(cx+sl+3)}" y2="${f(by-3)}" stroke="${SDATA_COLOR}" stroke-width="0.9"/>
              <text x="${f(cx+sl+5)}" y="${f(y+h/2+2)}" font-size="5" font-family="monospace" fill="${SDATA_COLOR}">A</text>`,
      };
    },
    sinclinal(x, y, w, h) {
      const cx = x + w*0.38, ty2 = y + 2, by = y + h - 3, sl = w*0.22;
      return {
        svg: `<polyline points="${f(cx-sl)},${f(ty2)} ${f(cx)},${f(by)} ${f(cx+sl)},${f(ty2)}" fill="none" stroke="${SDATA_COLOR}" stroke-width="1.2"/>
              <line x1="${f(cx-sl)}" y1="${f(ty2)}" x2="${f(cx-sl-3)}" y2="${f(ty2+3)}" stroke="${SDATA_COLOR}" stroke-width="0.9"/>
              <line x1="${f(cx+sl)}" y1="${f(ty2)}" x2="${f(cx+sl+3)}" y2="${f(ty2+3)}" stroke="${SDATA_COLOR}" stroke-width="0.9"/>
              <text x="${f(cx+sl+5)}" y="${f(y+h/2+2)}" font-size="5" font-family="monospace" fill="${SDATA_COLOR}">S</text>`,
      };
    },
    foliacion(x, y, w, h, dip) {
      const cx = x + w*0.38, cy = y + h/2, sl = w*0.24, tl = h*0.44;
      const rad = (dip * Math.PI)/180;
      const tx = f(cx + tl*Math.sin(rad)), ty = f(cy + tl*Math.cos(rad));
      return {
        svg: `<line x1="${f(cx-sl)}" y1="${f(cy)}" x2="${f(cx+sl)}" y2="${f(cy)}" stroke="${SDATA_COLOR}" stroke-width="1.1" stroke-dasharray="3 2"/>
              <line x1="${f(cx)}" y1="${f(cy)}" x2="${tx}" y2="${ty}" stroke="${SDATA_COLOR}" stroke-width="1.1"/>`,
        labelX: cx + sl + 1.5, labelY: cy + 2.5,
      };
    },
  };

  function drawStructuralData(unit, rx, ry, rw, rh) {
    const data = unit.datosEstructurales;
    if (!data || data.length === 0 || rh < 8) return '';
    const DEFAULT_W = rw, DEFAULT_H = 14, MARGIN = 4;
    return data.map(d => {
      const ar  = Math.max(0, Math.min(1, d.alturaRelativa ?? 0.5));
      // Mismas opciones de modificación que estructuras/fósiles: X, Tamaño Y,
      // Tamaño X — cada eje independiente, sin default compartido raro.
      const iw  = d.iconSizeX != null ? d.iconSizeX : DEFAULT_W;
      const ih  = d.iconSize  != null ? d.iconSize  : DEFAULT_H;
      const ix  = rx + (d.offsetX ?? 0);
      const iy  = Math.max(ry + MARGIN, Math.min(ry + rh - ih - MARGIN, ry + (1 - ar) * rh - ih / 2));
      const fn  = STRUCT_DATA_SYMBOLS[d.tipo] ?? STRUCT_DATA_SYMBOLS.estratificacion;
      const { svg, labelX, labelY } = fn(ix, iy, iw, ih, d.inclinacion ?? 0);
      // "Dato estructural": campo libre texto-numérico. Se dibuja donde
      // antes iba el número de grados (labelX,labelY) para los tipos que
      // lo tenían; si el tipo no tiene esa posición (anticlinal/sinclinal),
      // cae debajo del símbolo.
      const dato = String(d.dato ?? '').trim();
      let datoLabel = '';
      if (dato) {
        datoLabel = labelX != null
          ? `<text x="${f(labelX)}" y="${f(labelY)}"
                   font-size="5.5" font-family="monospace" fill="${SDATA_COLOR}">${esc(dato)}</text>`
          : `<text x="${f(ix + iw * 0.38)}" y="${f(iy + ih + 6)}" text-anchor="middle"
                   font-size="5.5" font-family="monospace" fill="${SDATA_COLOR}">${esc(dato)}</text>`;
      }
      return svg + datoLabel;
    }).filter(Boolean).join('');
  }


  // ─────────────────────────────────────────────────────────────────
  // ACCESO A ESTILOS
  // ─────────────────────────────────────────────────────────────────

  function _getStyle(unit, styles) {
    return styles[unit.primaryLithology] ?? styles['_default'] ?? { baseColor: '#D8D8D8' };
  }

  function getBaseColor(unit) {
    // 1. Color explícito del usuario (hex, aplicado desde ICS o picker)
    if (unit && unit.color && unit.color.fill) return unit.color.fill;
    // 2. Color ICS derivado de la edad geológica seleccionada
    const ics = _getIcsColor(unit);
    if (ics) return ics;
    // 3. Gris neutro por defecto
    return '#d8d8d8';
  }

  function getFill(unit) {
    const s = _getStyle(unit, LITHOLOGY_STYLES);
    return s.patternId ? `url(#${s.patternId})` : getBaseColor(unit);
  }

  function getTextColor(unit) {
    return _isDark(getBaseColor(unit)) ? '#e8e8e8' : '#1e293b';
  }


  // ─────────────────────────────────────────────────────────────────
  // API PÚBLICA
  // ─────────────────────────────────────────────────────────────────

  const GEO_SYMBOLS = {

    /** Tabla de estilos por litología — editar para personalizar */
    LITHOLOGY_STYLES,

    /** Array de defs de patrones SVG — agregar nuevos patrones aquí */
    PATTERNS,

    /** Bloque <defs> completo para incrustar en el SVG */
    getSVGDefs,

    /** Color base de fondo para la unidad */
    getBaseColor,

    /** Fill SVG: 'url(#patternId)' si hay patrón, color base si no */
    getFill,

    /** Color del texto de etiquetas (auto-contraste) */
    getTextColor,

    /** Línea de contacto con simbología (neto/gradual/erosivo/…) */
    drawContact,

    /** Indicador de contenido fosilífero */
    drawFossil,

    /** Iconos de estructuras sedimentarias (apilados en esquina inferior izquierda) */
    drawSedStructs,

    /** Iconos de tipos de fósiles (apilados en esquina superior derecha) */
    drawFossilTypes,

    /** Símbolos de datos estructurales en la columna de estructuras */
    drawStructuralData,

    /** Objeto con todos los iconos de fósiles disponibles */
    FOSSIL_TYPE_ICONS,

    /**
     * Resuelve el w,h final de un ícono de estructura respetando su
     * proporción natural (foto) salvo que ambos ejes hayan sido fijados
     * a mano. Usarla también en el panel de edición (viewer.html) para
     * que los valores por defecto mostrados coincidan con lo dibujado.
     * @param {string} name
     * @param {number|null} iconSize   — alto fijado a mano, o null
     * @param {number|null} iconSizeX  — ancho fijado a mano, o null
     * @param {number} defaultH        — alto de la caja por defecto
     * @param {number} defaultW        — ancho de la caja por defecto
     * @returns {{w:number,h:number}}
     */
    resolveStructIconSize,

    /**
     * Dibuja un icono individual de estructura sedimentaria en un bounding box.
     * @param {string} name  — clave en STRUCT_ICONS
     * @param {number} x     — SVG x del bounding box
     * @param {number} y     — SVG y del bounding box
     * @param {number} w     — ancho del bounding box
     * @param {number} h     — alto del bounding box
     * @returns {string}
     */
    drawStructIcon(name, x, y, w, h) {
      const fn = STRUCT_ICONS[name] ?? STRUCT_ICONS['_default'];
      return fn(x, y, w, h);
    },

    /**
     * Dibuja un icono individual de tipo de fósil en un bounding box.
     */
    drawFossilIcon(name, x, y, w, h) {
      const fn = FOSSIL_TYPE_ICONS[name] ?? FOSSIL_TYPE_ICONS['_default'];
      return fn(x, y, w, h);
    },

    /**
     * Genera una versión personalizada de GEO_SYMBOLS con estilos
     * adicionales o sobreescritos, sin tocar la tabla original.
     *
     * @param {{ extraStyles?: object }} opts
     * @returns {typeof GEO_SYMBOLS}
     */
    customize(opts = {}) {
      const merged = { ...LITHOLOGY_STYLES, ...(opts.extraStyles ?? {}) };
      return {
        ...GEO_SYMBOLS,
        LITHOLOGY_STYLES: merged,
        getBaseColor: (u) => getBaseColor(u),
        getFill:      (u) => { const s = _getStyle(u, merged); return s.patternId ? `url(#${s.patternId})` : getBaseColor(u); },
        getTextColor: (u) => getTextColor(u),
      };
    },
  };

  // ─────────────────────────────────────────────────────────────────
  // EXPORTS
  // ─────────────────────────────────────────────────────────────────
  globalScope.GEO_SYMBOLS = GEO_SYMBOLS;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GEO_SYMBOLS };
  }

})(typeof window !== 'undefined' ? window
   : typeof global !== 'undefined' ? global
   : this);
