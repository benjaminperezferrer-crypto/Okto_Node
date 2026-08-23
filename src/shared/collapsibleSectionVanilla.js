/**
 * src/shared/collapsibleSectionVanilla.js
 * Equivalente vanilla (sin build/JSX) de CollapsibleSection.tsx — para
 * módulos como Columnas (src/columnas/viewer.html) que cargan todo vía
 * <script> clásicos, sin pipeline de esbuild. Mismo comportamiento
 * visual/funcional (header clickeable con flecha ▸/▾, contenido
 * colapsable, persistencia en localStorage), mismo CSS real
 * (collapsibleSection.css, enlazado por el consumidor con <link>, NO
 * duplicado acá) — implementado aparte porque un archivo .tsx no se
 * puede `<script src>` directo en un documento sin build.
 *
 * Sigue el patrón IIFE + `globalScope.X = ...` de geo-symbols.js (el
 * precedente más parecido dentro de src/columnas/: una utilidad genérica
 * compartida, no estado propio de un módulo como store.js) — expone un
 * único global `CollapsibleSectionVanilla` en vez de funciones sueltas,
 * para no ensuciar el scope global con nombres genéricos como `hydrate`.
 *
 * Persistencia: MISMA key (`okto.collapsedSections.v1`) y mismo formato
 * de mapa `{ id: boolean }` que collapsibleState.ts (React) — localStorage
 * se particiona por origen, no por iframe, así que un id
 * `columnas.editorLitologia` convive sin colisión con los `hgm.*`/
 * `estructural.*` ya existentes en el mismo mapa (confirmado en las
 * etapas de Hidrogeoquímica/Estructural). Si algún día Columnas migra a
 * React, el estado de colapso de los usuarios ya persistido sigue siendo
 * válido tal cual — mismo mapa, mismas claves.
 *
 * Diferencia deliberada con la versión React: acá se usa `body.hidden`
 * (atributo HTML nativo) en vez de desmontar el nodo del DOM al
 * colapsar. Equivalente en accesibilidad (contenido oculto, no
 * enfocable, no anunciado), pero evita tener que reconstruir el
 * contenido de `body` cada vez que se reabre una sección — encaja mejor
 * con el estilo de Columnas (manipulación DOM directa vía innerHTML, no
 * un ciclo de render declarativo que re-crea children en cada toggle).
 */
(function (globalScope) {
  'use strict';

  var STORAGE_KEY = 'okto.collapsedSections.v1';

  /** Lee el mapa completo desde localStorage; nunca lanza — mapa vacío si no hay nada, está corrupto, o localStorage no está disponible. */
  function loadMap() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      var result = {};
      for (var k in parsed) {
        if (Object.prototype.hasOwnProperty.call(parsed, k) && typeof parsed[k] === 'boolean') {
          result[k] = parsed[k];
        }
      }
      return result;
    } catch (e) {
      return {};
    }
  }

  /** Persiste el mapa completo; falla en silencio si localStorage no está disponible o está lleno. */
  function saveMap(map) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch (e) {
      // No persiste, pero no debe romper la UI por esto.
    }
  }

  /** Estado guardado de la sección `id` — si nunca se guardó nada, devuelve `defaultOpen` tal cual. */
  function loadSectionOpen(id, defaultOpen) {
    var map = loadMap();
    return typeof map[id] === 'boolean' ? map[id] : defaultOpen;
  }

  /** Guarda el estado abierto/cerrado de la sección `id`, sin tocar el resto del mapa (otras secciones, de este módulo u otro). */
  function saveSectionOpen(id, open) {
    var map = loadMap();
    map[id] = open;
    saveMap(map);
  }

  /**
   * Engancha el comportamiento plegable sobre markup ESTÁTICO ya
   * existente en el HTML (caso de Columnas: las secciones del editor de
   * unidad traen cientos de líneas de chips/selects fijos — reconstruir
   * ese contenido a mano vía JS sería mucho más riesgoso que reusar el
   * DOM que ya está ahí). `sectionEl` debe tener adentro un
   * `.cs-header` (con un `.cs-caret` y un `.cs-title` ya en el markup, el
   * título como texto fijo) y un `.cs-body` — esta función solo LEE el
   * estado persistido, aplica el estado inicial, y ENGANCHA el click;
   * no crea ningún nodo nuevo.
   */
  function hydrate(sectionEl, id, defaultOpen) {
    var header = sectionEl.querySelector('.cs-header');
    var caret = sectionEl.querySelector('.cs-caret');
    var body = sectionEl.querySelector('.cs-body');
    if (!header || !caret || !body) return;

    var open = loadSectionOpen(id, !!defaultOpen);

    function render() {
      caret.textContent = open ? '▾' : '▸';
      body.hidden = !open;
      header.setAttribute('aria-expanded', String(open));
    }

    header.addEventListener('click', function () {
      open = !open;
      saveSectionOpen(id, open);
      render();
    });

    render();
  }

  // Solo se expone `hydrate` — el único consumidor real (Columnas).
  // `loadSectionOpen`/`saveSectionOpen` quedan internos (los usa `hydrate`).
  globalScope.CollapsibleSectionVanilla = {
    hydrate: hydrate,
  };
})(window);
