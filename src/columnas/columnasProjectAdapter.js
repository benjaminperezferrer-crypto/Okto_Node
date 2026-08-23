/**
 * src/columnas/columnasProjectAdapter.js
 * Adaptador de Proyectos para el módulo Columnas — puente entre el store
 * multi-columna de viewer.html (_projects / _applyProject / _renderProjTabs)
 * y projectBridge.js. JS plano, sin import/export — mismo estilo que
 * store.js — se carga vía <script src>, igual que el resto de los
 * archivos del módulo.
 *
 * Se carga DESPUÉS del <script> principal de viewer.html (que define
 * _projects, _applyProject, _makeProject, createColumnStore vía store.js,
 * etc.) para no depender de orden de declaración.
 *
 * Ver ColumnasProjectState en src/projectTypes.ts para la forma exacta.
 */

/**
 * @returns {object} ColumnasProjectState — ver src/projectTypes.ts
 *
 * NO envuelve el resultado en structuredClone() aparte — store.getState()
 * (store.js) ya devuelve `column` deep-cloneado vía
 * JSON.parse(JSON.stringify(_column)), así que duplicar el clon acá era
 * puro trabajo de más sobre datos que ya estaban aislados del estado vivo
 * (medido: con columnas grandes, ese segundo clon nunca fue el cuello de
 * botella real — el bug de la Etapa 12 estaba en projectBridge.ts, no
 * acá — pero sigue siendo trabajo innecesario).
 *
 * Nota: `computed` (parte de lo que devuelve getState(), NO `column`) se
 * arma en store.js con un shallow-spread de las unidades VIVAS
 * (`{ ...unit, heightFromBase, heightToTop }`), así que sus arrays
 * anidados (estructurasSedimentarias, observaciones, etc.) siguen siendo
 * las mismas referencias que `_column.units` mientras no se serialice.
 * No importa en la práctica: `computed`/`validation` son 100% derivados y
 * nunca se leen al restaurar (loadColumn() en store.js solo usa
 * `column`), y todo esto igual termina en JSON.stringify() antes de
 * guardarse — pero si algún día algo retiene el `ColumnasProjectState`
 * devuelto acá por más tiempo sin serializarlo, esa parte puntual ya no
 * tiene la garantía de aislamiento total que sí tiene `column`.
 */
function getColumnasProjectState() {
  return {
    projects: _projects.map(function (p, i) {
      var s = p.store.getState();
      return {
        id: p.id,
        name: s.column.metadata.name || ('Columna ' + (i + 1)), // misma derivación que _renderProjTabs()
        columnState: s, // incluye column.metadata.topElevation (cota del tope, Etapa 1) — se persiste gratis
      };
    }),
    activeProjectId: _projects[_projIdx] ? _projects[_projIdx].id : undefined,
    // Configuración de la pestaña de Correlación (Etapas 2-5). Ver
    // ColumnasCorrelationState en src/projectTypes.ts. `_correlationSlots`
    // puede ser null (nunca inicializado → auto-fill al abrir) y
    // `_corrScaleOverride` null (escala automática) — ambos se persisten
    // tal cual para restaurar el modo exacto, no solo el valor.
    // ColumnasCorrelationState v9 (ver src/projectTypes.ts): slots en su forma
    // real { id, columnId } (el id estable ancla las líneas), más lines[] y
    // textBoxes[]. El id de slot DEBE persistirse tal cual: las líneas anclan
    // por slotId, así que regenerarlo al cargar rompería la desambiguación.
    correlation: {
      slots: _correlationSlots
        ? _correlationSlots.map(function (s) { return { id: s.id, columnId: (s.columnId == null ? null : s.columnId) }; })
        : null,
      scaleOverride: typeof _corrScaleOverride === 'number' ? _corrScaleOverride : null,
      alignByElevation: !!_corrAlignByElevation,
      lines: (_corrLines || []).map(function (l) {
        return {
          id: l.id, color: l.color, thickness: _corrLineThickness(l),
          from: { slotId: l.from.slotId, unitId: l.from.unitId, edge: l.from.edge, side: l.from.side },
          to:   { slotId: l.to.slotId,   unitId: l.to.unitId,   edge: l.to.edge,   side: l.to.side },
        };
      }),
      textBoxes: (_corrTextBoxes || []).map(function (t) {
        return { id: t.id, x: t.x, y: t.y, text: t.text, fontSize: t.fontSize, rotation: t.rotation, color: t.color };
      }),
    },
  };
}

/**
 * Restaura el estado de Columnas desde un ColumnasProjectState: vacía
 * _projects, crea un store nuevo por proyecto guardado (vía
 * store.loadColumn(), que reemplaza la columna completa manteniendo su
 * id/metadata/units/legendOverrides exactos), y deja activo el proyecto
 * que indique activeProjectId (o el primero). _applyProject() se encarga
 * de reconstruir las pestañas y volver a renderizar — no se duplica esa
 * lógica acá.
 */
function loadColumnasProjectState(state) {
  var incoming = (state && state.projects) || [];

  _projects = incoming.map(function (p) {
    var freshStore = createColumnStore();
    freshStore.loadColumn(p.columnState.column);
    return { id: p.id, store: freshStore };
  });

  if (_projects.length === 0) {
    // Nunca debería pasar (siempre hay al menos 1 columna abierta), pero
    // por seguridad no se deja la app sin proyectos.
    _projects.push(_makeProject({ name: 'Columna 1', scale: 500 }));
  }

  var idx = 0;
  if (state && state.activeProjectId) {
    var found = _projects.findIndex(function (p) { return p.id === state.activeProjectId; });
    if (found !== -1) idx = found;
  }

  // Configuración de la pestaña de Correlación (Etapas 2-5). Ausente
  // (proyecto v7 sin migrar en memoria, o guardado antes de esta función)
  // ⇒ defaults: slots sin inicializar (auto-fill al abrir), escala
  // automática, toggle apagado. Los ids de slot siguen siendo válidos
  // porque loadColumn() de arriba preserva `p.id` de cada proyecto.
  var corr = (state && state.correlation) || null;
  // v9: slots como { id, columnId } — se PRESERVA el id (las líneas anclan a
  // él). Defensivo con el formato plano v8 (columnId suelto) por si llega un
  // estado sin migrar: en ese caso se genera un id nuevo.
  _correlationSlots = corr && Array.isArray(corr.slots)
    ? corr.slots.map(function (s) {
        if (s && typeof s === 'object') return { id: s.id || _corrGenId(), columnId: (s.columnId == null ? null : s.columnId) };
        return { id: _corrGenId(), columnId: (s == null ? null : s) };
      })
    : null;
  _corrScaleOverride = corr && typeof corr.scaleOverride === 'number' && isFinite(corr.scaleOverride)
    ? corr.scaleOverride : null;
  _corrAlignByElevation = !!(corr && corr.alignByElevation);
  // Líneas y cuadros de texto (copia aislada del estado entrante).
  _corrLines     = (corr && Array.isArray(corr.lines))     ? JSON.parse(JSON.stringify(corr.lines))     : [];
  _corrTextBoxes = (corr && Array.isArray(corr.textBoxes)) ? JSON.parse(JSON.stringify(corr.textBoxes)) : [];
  // Poda líneas cuyo slotId/unitId ya no resuelve (sin dejar referencias rotas).
  if (typeof _corrPruneLines === 'function') _corrPruneLines();

  _applyProject(idx); // reconstruye pestañas + re-renderiza + limpia la suscripción/editor anteriores
}

window.ProjectBridge.listenForStateRequests(getColumnasProjectState, loadColumnasProjectState);
