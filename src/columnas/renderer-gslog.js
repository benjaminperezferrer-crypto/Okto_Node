/**
 * src/columnas/renderer-gslog.js
 * Renderiza un log estratigráfico extendido como string SVG.
 *
 * Columnas (px):
 *   ┌────────┬───────────┬──────────────────┬────────────┬──────────────┐
 *   │ Escala │ Litología │ Divisiones gran. │ Estructuras│ Observaciones│
 *   │   38   │    76     │      110         │   108      │    172       │
 *   └────────┴───────────┴──────────────────┴────────────┴──────────────┘
 *   SVG_W = 364 + espacio para el recuadro de leyenda flotante
 *
 * La litología es un rectángulo completo con patrón geológico (igual al
 * renderer clásico). El perfil granulométrico es una columna contigua y
 * SEPARADA cuyo ancho visible sigue el perfilGranulometrico.
 *
 * La leyenda es un RECUADRO FLOTANTE (no una columna más del grid) a la
 * derecha de Observaciones, con su propio fondo/borde. Se autogenera a
 * partir de `computed`: litologías, tipos de contacto y estructuras/
 * fósiles EFECTIVAMENTE usados en la columna (no el catálogo completo de
 * GEO_SYMBOLS), cada uno dibujado una sola vez con el mismo swatch/ícono
 * que aparece en las unidades. Si el recuadro necesita más alto que el
 * área de dibujo (DRAW_H), el SVG crece verticalmente para que no se
 * corte. Cada fila queda envuelta en `<g data-legend-kind="…"
 * data-legend-key="…">` — viewer.html usa esos atributos para detectar el
 * clic y abrir un editor de texto in-situ (ver startLegendEdit()); el
 * texto editado se guarda como override en `column.legendOverrides`
 * (columnas: litho/contact/struct) y `state.column.legendOverrides` es lo
 * que este renderer lee para mostrar el texto custom en vez del nombre
 * canónico.
 *
 * @param {object} state      — ColumnState del store
 * @param {object} [opts]
 * @param {object} [opts.geoConfig]   — GEO_SYMBOLS (geo-symbols.js)
 * @param {number} [opts.pxPerMeter]  — px/m fijo; auto si se omite
 * @param {number} [opts.maxDrawH]    — altura máxima del área de dibujo en px
 * @param {string} [opts.selectedId]  — id de unidad seleccionada
 * @returns {string} SVG markup
 */

(function (globalScope) {
  'use strict';

  // ── Granulometría (Udden-Wentworth simplificada) ─────────────────

  const GS_ORDER = [
    'arcilla', 'limo', 'arena_muy_fina', 'arena_fina', 'arena_media',
    'arena_gruesa', 'arena_muy_gruesa', 'granulo', 'guijarro', 'grava', 'bloque',
  ];

  const GS_LABELS = {
    arcilla: 'Ar', limo: 'Li', arena_muy_fina: 'Amf', arena_fina: 'Af',
    arena_media: 'Am', arena_gruesa: 'Ag', arena_muy_gruesa: 'Amg',
    granulo: 'Gr', guijarro: 'Gu', grava: 'Gv', bloque: 'Bl',
  };

  // ── Layout ───────────────────────────────────────────────────────

  const AXIS_W    = 38;   // escala numérica
  const LITHO_W   = 76;   // litología (rect completo + patrón)
  const GS_COL_W  = 180;  // perfil granulométrico (polígono)
  const STRUCT_W  = 108;  // estructuras sedimentarias
  const OBS_W     = 172;  // observaciones
  const HDR_H     = 56;
  const PAD_BOT   = 36;

  // x positions (derived) — grid principal (sin la leyenda, que es un recuadro aparte)
  const LITHO_LEFT  = AXIS_W;                         //  38
  const LITHO_RIGHT = LITHO_LEFT + LITHO_W;           // 114
  const GS_LEFT     = LITHO_RIGHT;                    // 114 — arcilla axis
  const GS_RIGHT    = GS_LEFT + GS_COL_W;             // 224 — bloque axis
  const STRUCT_LEFT = GS_RIGHT;                        // 224
  const STRUCT_RIGHT= STRUCT_LEFT + STRUCT_W;          // 278
  const OBS_LEFT    = STRUCT_RIGHT;                    // 278
  const OBS_RIGHT   = OBS_LEFT + OBS_W;               // 364

  // ── Leyenda: recuadro flotante a la derecha del grid ──────────────
  const LEGEND_GAP    = 20;   // separación horizontal respecto a Observaciones
  const LEGEND_W       = 190;
  const LEGEND_TOP     = 8;   // margen superior del recuadro (no está atado a HDR_H)
  const LEGEND_MARGIN_R= 12;  // margen a la derecha del recuadro (borde del SVG)
  const LEGEND_MARGIN_B= 16;  // margen bajo el recuadro (borde del SVG)
  const LEGEND_PAD     = 10;  // padding interno del recuadro
  const LEGEND_TITLE_H = 14;

  const LEGEND_LEFT = OBS_RIGHT + LEGEND_GAP;         // 384
  const LEGEND_RIGHT= LEGEND_LEFT + LEGEND_W;         // 574

  const SVG_W = LEGEND_RIGHT + LEGEND_MARGIN_R;        // 586

  const LEG_ICON_W   = 18;
  const LEG_ICON_GAP = 6;
  const LEG_SWATCH_H = 11;
  const LEG_ROW_H    = 19; // deja aire de sobra para el <input> flotante del editor in-situ (11px + padding/borde)
  const LEG_HEADER_H = 13;
  const LEG_GROUP_GAP= 8;
  const LEG_ICON_X   = LEGEND_LEFT + LEGEND_PAD;
  const LEG_LABEL_X  = LEG_ICON_X + LEG_ICON_W + LEG_ICON_GAP;
  const LEG_MAX_CHARS= Math.floor((LEGEND_RIGHT - LEGEND_PAD - LEG_LABEL_X) / 4.8);

  const CONTACT_ORDER  = ['neto', 'gradual', 'erosivo', 'tectonico', 'no_expuesto'];
  const CONTACT_LABELS = {
    neto: 'Neto', gradual: 'Gradual', erosivo: 'Erosivo',
    tectonico: 'Tectónico', no_expuesto: 'No expuesto',
  };

  const N_GS    = GS_ORDER.length;        // 11
  const GS_STEP = GS_COL_W / (N_GS - 1); // 11 px per category

  // Icon bounding box inside the struct column (ICON_H comes from opts.iconSize)
  const ICON_W = 44;
  const ICON_X = STRUCT_LEFT + Math.floor((STRUCT_W - ICON_W) / 2); // centered

  // Max chars in observations column (~4.8 px per monospace char)
  const OBS_MAX_CHARS = Math.floor((OBS_W - 8) / 4.8); // ≈34

  // ── Helpers ──────────────────────────────────────────────────────

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function trunc(s, n) {
    const t = String(s ?? '');
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  }

  function tickInterval(totalM) {
    for (const t of [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 250, 500]) {
      if (totalM / t <= 15) return t;
    }
    return 500;
  }

  /** Grain size value → SVG x coordinate within the GS column. */
  function gsXOf(gs) {
    const idx = GS_ORDER.indexOf(gs);
    return idx < 0 ? GS_LEFT : GS_LEFT + idx * GS_STEP;
  }

  // ── Data resolvers ────────────────────────────────────────────────

  function resolveProfile(unit) {
    // El rango granulométrico está DESACOPLADO de las estructuras de gradación:
    // la forma afinada se dibuja según `perfilGranulometrico` siempre que tenga
    // ≥2 puntos con tamaños DISTINTOS, sin mirar si "Gradación normal/inversa"
    // está marcada (la dirección ya se deriva de comparar los tamaños). Un
    // perfil ausente, o con todos los puntos iguales (base==techo), equivale a
    // "sin rango" → rectángulo plano vía `grainSize`.
    const perfil = unit.perfilGranulometrico;
    if (perfil && perfil.length >= 2 && perfil.some(p => p.tamanoGrano !== perfil[0].tamanoGrano)) {
      return perfil;
    }
    if (unit.grainSize) {
      return [
        { alturaRelativa: 0, tamanoGrano: unit.grainSize },
        { alturaRelativa: 1, tamanoGrano: unit.grainSize },
      ];
    }
    return null;
  }

  function resolveStructures(unit) {
    if (unit.estructurasSedimentarias && unit.estructurasSedimentarias.length > 0) {
      return unit.estructurasSedimentarias.map(e => ({
        alturaRelativa: e.alturaRelativa,
        nombre:         e.tipoEstructura,
        offsetX:        e.offsetX   ?? 0,
        iconSize:       e.iconSize  ?? null,
        iconSizeX:      e.iconSizeX ?? null,
      }));
    }
    if (unit.sedimentaryStructures && unit.sedimentaryStructures.length > 0) {
      const n = unit.sedimentaryStructures.length;
      return unit.sedimentaryStructures.map((nombre, i) => ({
        alturaRelativa: n === 1 ? 0.5 : i / (n - 1),
        nombre,
      }));
    }
    return [];
  }

  function resolveObservations(unit) {
    if (unit.observaciones && unit.observaciones.length > 0) {
      return unit.observaciones;
    }
    if (unit.fieldObservations && unit.fieldObservations.trim()) {
      return [{ alturaRelativa: 0.5, texto: unit.fieldObservations.trim() }];
    }
    return [];
  }

  // ── Leyenda: recolección de entradas usadas ─────────────────────────
  // Recorre `computed` (las mismas unidades que se dibujan) y arma tres
  // listas SIN duplicados — litologías, tipos de contacto, estructuras/
  // fósiles — en orden de primera aparición (contactos con un orden fijo
  // preferente). Solo incluye lo que la columna realmente usa, no el
  // catálogo completo de GEO_SYMBOLS.

  function collectLegendEntries(computed, geo) {
    if (!geo) return { lithologies: [], contacts: [], structs: [] };

    const lithologies = [];
    const seenLitho = new Set();
    const seenContacts = new Set();
    const structs = [];
    const seenStructs = new Set();

    computed.forEach(unit => {
      if (unit.primaryLithology && !seenLitho.has(unit.primaryLithology)) {
        seenLitho.add(unit.primaryLithology);
        lithologies.push(unit);
      }
      if (unit.upperContactType) seenContacts.add(unit.upperContactType);
      resolveStructures(unit).forEach(({ nombre }) => {
        if (nombre && !seenStructs.has(nombre)) {
          seenStructs.add(nombre);
          structs.push(nombre);
        }
      });
    });

    const contacts = CONTACT_ORDER.filter(c => seenContacts.has(c));
    seenContacts.forEach(c => { if (!CONTACT_ORDER.includes(c)) contacts.push(c); });

    return { lithologies, contacts, structs };
  }

  /** Alto total (px) del recuadro de leyenda: título + separador + grupos (vacíos omitidos) + paddings. */
  function legendContentHeight(entries) {
    let h = LEGEND_PAD + LEGEND_TITLE_H + 10; // padding sup. + título + separador
    [entries.lithologies.length, entries.contacts.length, entries.structs.length].forEach(count => {
      if (count === 0) return;
      h += LEG_HEADER_H + count * LEG_ROW_H + LEG_GROUP_GAP;
    });
    h += LEGEND_PAD; // padding inferior
    return h;
  }

  /**
   * Resuelve el texto mostrado para una entrada de leyenda: el override
   * guardado por el usuario (`column.legendOverrides`) si existe, si no el
   * nombre por defecto. `overrides` es `column.legendOverrides` tal cual
   * (puede venir undefined en columnas creadas antes de este campo).
   */
  function _legendLabel(overrides, kind, key, fallback) {
    const v = overrides?.[kind]?.[key];
    return v && v.trim() ? v : fallback;
  }

  /**
   * Dibuja el recuadro de leyenda completo (fondo, borde, título, 3
   * grupos) como elemento FLOTANTE — no forma parte del grid de columnas.
   * `y` es un cursor que arranca en el borde superior del recuadro y solo
   * avanza hacia abajo — cada helper primero AVANZA el cursor el alto de
   * su fila/encabezado y luego dibuja centrado en la posición resultante.
   * Cada fila queda envuelta en un `<g data-legend-kind data-legend-key>`
   * para que viewer.html pueda detectar el clic y editar el texto in-situ.
   */
  function drawLegend(entries, geo, overrides) {
    const parts = [];
    const boxH = legendContentHeight(entries);

    // ── Fondo + borde del recuadro ─────────────────────────────────
    parts.push(
      `<rect x="${LEGEND_LEFT}" y="${LEGEND_TOP}" width="${LEGEND_W}" height="${boxH.toFixed(1)}"
             rx="4" fill="#fafafa" stroke="#94a3b8" stroke-width="1"/>`
    );

    let y = LEGEND_TOP + LEGEND_PAD;

    // ── Título ────────────────────────────────────────────────────
    y += LEGEND_TITLE_H - 4;
    parts.push(
      `<text x="${(LEGEND_LEFT + LEGEND_W / 2).toFixed(1)}" y="${y.toFixed(1)}"
             text-anchor="middle" font-family="monospace" font-size="9.5" font-weight="700"
             letter-spacing="0.06em" fill="#1e293b">LEYENDA</text>`
    );
    y += 6;
    parts.push(
      `<line x1="${LEGEND_LEFT + LEGEND_PAD}" y1="${y.toFixed(1)}" x2="${(LEGEND_RIGHT - LEGEND_PAD).toFixed(1)}" y2="${y.toFixed(1)}"
             stroke="#cbd5e1" stroke-width="1"/>`
    );
    y += 4;

    function groupHeader(title) {
      y += LEG_HEADER_H;
      parts.push(
        `<text x="${LEG_ICON_X}" y="${(y - 4).toFixed(1)}"
               font-family="monospace" font-size="8.5" font-weight="700"
               fill="#334155">${esc(title)}</text>`
      );
    }

    if (entries.lithologies.length) {
      groupHeader('Litologías');
      entries.lithologies.forEach(unit => {
        y += LEG_ROW_H;
        const cy  = y - LEG_ROW_H / 2;
        const sy  = cy - LEG_SWATCH_H / 2;
        const base = geo.getBaseColor(unit);
        const fill = geo.getFill(unit);
        const key  = unit.primaryLithology;
        const label = _legendLabel(overrides, 'litho', key, key);
        parts.push(`<g data-legend-kind="litho" data-legend-key="${esc(key)}">`);
        parts.push(
          `<rect x="${LEG_ICON_X}" y="${sy.toFixed(1)}" width="${LEG_ICON_W}" height="${LEG_SWATCH_H}"
                 fill="${base}" stroke="#7a9abf" stroke-width="0.8"/>`
        );
        if (fill !== base) {
          parts.push(
            `<rect x="${LEG_ICON_X}" y="${sy.toFixed(1)}" width="${LEG_ICON_W}" height="${LEG_SWATCH_H}"
                   fill="${fill}" stroke="none"/>`,
            `<rect x="${LEG_ICON_X}" y="${sy.toFixed(1)}" width="${LEG_ICON_W}" height="${LEG_SWATCH_H}"
                   fill="none" stroke="#7a9abf" stroke-width="0.8"/>`
          );
        }
        parts.push(
          `<text x="${LEG_LABEL_X}" y="${cy.toFixed(1)}" dominant-baseline="middle"
                 font-family="monospace" font-size="8" fill="#334155">${esc(trunc(label, LEG_MAX_CHARS))}</text>`
        );
        parts.push('</g>');
      });
      y += LEG_GROUP_GAP;
    }

    if (entries.contacts.length) {
      groupHeader('Contactos');
      entries.contacts.forEach(ct => {
        y += LEG_ROW_H;
        const cy = y - LEG_ROW_H / 2;
        const label = _legendLabel(overrides, 'contact', ct, CONTACT_LABELS[ct] ?? ct);
        parts.push(`<g data-legend-kind="contact" data-legend-key="${esc(ct)}">`);
        parts.push(geo.drawContact(ct, LEG_ICON_X, cy, LEG_ICON_X + LEG_ICON_W));
        parts.push(
          `<text x="${LEG_LABEL_X}" y="${cy.toFixed(1)}" dominant-baseline="middle"
                 font-family="monospace" font-size="8" fill="#334155">${esc(label)}</text>`
        );
        parts.push('</g>');
      });
      y += LEG_GROUP_GAP;
    }

    if (entries.structs.length) {
      groupHeader('Estructuras y fósiles');
      entries.structs.forEach(nombre => {
        y += LEG_ROW_H;
        const cy = y - LEG_ROW_H / 2;
        const boxIconH = 14;
        const label = _legendLabel(overrides, 'struct', nombre, nombre);
        parts.push(`<g data-legend-kind="struct" data-legend-key="${esc(nombre)}">`);
        parts.push(geo.drawStructIcon(nombre, LEG_ICON_X, cy - boxIconH / 2, LEG_ICON_W, boxIconH));
        parts.push(
          `<text x="${LEG_LABEL_X}" y="${cy.toFixed(1)}" dominant-baseline="middle"
                 font-family="monospace" font-size="8" fill="#334155">${esc(trunc(label, LEG_MAX_CHARS))}</text>`
        );
        parts.push('</g>');
      });
    }

    return parts.join('\n');
  }

  // ── Polygon builder ───────────────────────────────────────────────

  /**
   * Builds SVG polygon points for the grain size profile of one unit.
   * Left edge fixed at GS_LEFT (arcilla), right edge follows the profile.
   * alturaRelativa=0 → base (SVG y = ry+rh), alturaRelativa=1 → top (SVG y = ry).
   */
  function buildPts(profile, ry, rh) {
    const sorted = [...profile].sort((a, b) => a.alturaRelativa - b.alturaRelativa);

    if (sorted[0].alturaRelativa > 0.001) {
      sorted.unshift({ alturaRelativa: 0, tamanoGrano: sorted[0].tamanoGrano });
    }
    if (sorted[sorted.length - 1].alturaRelativa < 0.999) {
      sorted.push({ alturaRelativa: 1, tamanoGrano: sorted[sorted.length - 1].tamanoGrano });
    }

    const right = sorted.map(p => ({
      x: gsXOf(p.tamanoGrano),
      y: ry + rh * (1 - clamp(p.alturaRelativa, 0, 1)),
    }));

    const pts = [
      { x: GS_LEFT, y: ry + rh },
      ...right,
      { x: GS_LEFT, y: ry },
    ];

    return pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  }

  // ── Column header helper ──────────────────────────────────────────

  /** Horizontal centered label(s) in a header cell. label can be a string or string[]. */
  function hdrLabel(x1, x2, label, fontSize = 8) {
    const cx    = ((x1 + x2) / 2).toFixed(1);
    const lines = Array.isArray(label) ? label : [label];
    const lineH = fontSize + 4;
    const totalH = lineH * (lines.length - 1);
    return lines.map((line, i) => {
      const cy = (HDR_H / 2 - totalH / 2 + i * lineH).toFixed(1);
      return `<text x="${cx}" y="${cy}"
                    text-anchor="middle" dominant-baseline="middle"
                    font-family="monospace" font-size="${fontSize}" fill="#475569"
                    letter-spacing="0.02em">${esc(line)}</text>`;
    }).join('\n');
  }

  // ── Main renderer ─────────────────────────────────────────────────

  function renderGrainSizeLogSVG(state, opts = {}) {
    const { computed, column } = state;
    const geo   = opts.geoConfig ?? null;
    const ICON_H = opts.iconSize ?? 14;

    // ── Empty state ────────────────────────────────────────────────
    if (!computed || computed.length === 0) {
      return `<svg width="${SVG_W}" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="${SVG_W}" height="200" fill="#f8fafc"/>
        <text x="${SVG_W / 2}" y="100" text-anchor="middle" dominant-baseline="middle"
              font-family="monospace" font-size="13" fill="#94a3b8">
          Sin unidades — agrega la primera unidad
        </text>
      </svg>`;
    }

    // ── Metrics ────────────────────────────────────────────────────
    const totalM    = computed[computed.length - 1].heightToTop;
    const MAX_H     = opts.maxDrawH ?? 740;
    const PX_PER_M  = opts.pxPerMeter ?? clamp(MAX_H / totalM, 6, 38);
    const DRAW_H    = totalM * PX_PER_M;
    const INTERVAL  = tickInterval(totalM);
    const selectedId = opts.selectedId ?? null;

    // Leyenda autogenerada (recuadro flotante) — si necesita más alto que
    // el área de dibujo, el SVG crece verticalmente para no cortarla.
    const legendEntries = collectLegendEntries(computed, geo);
    const legendH        = legendContentHeight(legendEntries);
    const SVG_H = Math.max(HDR_H + DRAW_H + PAD_BOT, LEGEND_TOP + legendH + LEGEND_MARGIN_B);

    // gY: geologic height (0=base) → SVG y (offset by HDR_H)
    const gY = (h) => HDR_H + (totalM - h) * PX_PER_M;

    const parts = [];

    // ── Geo pattern defs ───────────────────────────────────────────
    if (geo) parts.push(geo.getSVGDefs());

    // ── White background ───────────────────────────────────────────
    parts.push(`<rect width="${SVG_W}" height="${SVG_H.toFixed(0)}" fill="#ffffff"/>`);

    // ── Column headers ─────────────────────────────────────────────

    // Litología header
    parts.push(
      `<rect x="${LITHO_LEFT}" y="0" width="${LITHO_W}" height="${HDR_H}" fill="#f1f5f9"/>`,
      `<line x1="${LITHO_LEFT}" y1="${HDR_H}" x2="${LITHO_RIGHT}" y2="${HDR_H}"
             stroke="#94a3b8" stroke-width="1.5"/>`,
      hdrLabel(LITHO_LEFT, LITHO_RIGHT, 'Litología', 8)
    );

    // Divisiones granulométricas header
    parts.push(
      `<rect x="${GS_LEFT}" y="0" width="${GS_COL_W}" height="${HDR_H}" fill="#f8fafc"/>`,
      `<line x1="${GS_LEFT}" y1="${HDR_H}" x2="${GS_RIGHT}" y2="${HDR_H}"
             stroke="#94a3b8" stroke-width="1.5"/>`,
      // Column title in the top portion (category labels occupy y≈38–52)
      `<text x="${((GS_LEFT + GS_RIGHT) / 2).toFixed(1)}" y="14"
             text-anchor="middle" dominant-baseline="middle"
             font-family="monospace" font-size="7" fill="#475569"
             letter-spacing="0.02em">Granulometría</text>`
    );
    // Category labels (rotated -55°); first and last nudged inward to avoid border clipping
    GS_ORDER.forEach((gs, i) => {
      const pad = i === 0 ? 5 : i === N_GS - 1 ? -5 : 0;
      const x = (gsXOf(gs) + pad).toFixed(2);
      const y = (HDR_H - 4).toFixed(2);
      parts.push(
        `<text x="${x}" y="${y}" text-anchor="start"
               transform="rotate(-55 ${x} ${y})"
               font-family="monospace" font-size="8.5" fill="#475569">${esc(GS_LABELS[gs])}</text>`
      );
    });

    // Estructuras header
    parts.push(
      `<rect x="${STRUCT_LEFT}" y="0" width="${STRUCT_W}" height="${HDR_H}" fill="#f1f5f9"/>`,
      `<line x1="${STRUCT_LEFT}" y1="${HDR_H}" x2="${STRUCT_RIGHT}" y2="${HDR_H}"
             stroke="#94a3b8" stroke-width="1.5"/>`,
      hdrLabel(STRUCT_LEFT, STRUCT_RIGHT, ['Estructuras', 'sedimentarias', 'y fósiles'], 7)
    );

    // Observaciones header
    parts.push(
      `<rect x="${OBS_LEFT}" y="0" width="${OBS_W}" height="${HDR_H}" fill="#f8fafc"/>`,
      `<line x1="${OBS_LEFT}" y1="${HDR_H}" x2="${OBS_RIGHT}" y2="${HDR_H}"
             stroke="#94a3b8" stroke-width="1.5"/>`,
      hdrLabel(OBS_LEFT, OBS_RIGHT, 'Observaciones', 8)
    );

    // ── Column separators (full height) ────────────────────────────
    // La leyenda NO participa acá — es un recuadro flotante aparte, se
    // dibuja al final con su propio fondo/borde (ver drawLegend()).
    [LITHO_LEFT, LITHO_RIGHT, GS_RIGHT, STRUCT_RIGHT, OBS_RIGHT].forEach((x, i, arr) => {
      const sw = i === 0 || i === arr.length - 1 ? 1.5 : 1;
      parts.push(
        `<line x1="${x}" y1="0" x2="${x}" y2="${(HDR_H + DRAW_H + PAD_BOT).toFixed(0)}"
               stroke="#94a3b8" stroke-width="${sw}"/>`
      );
    });

    // ── Grain size vertical grid lines ─────────────────────────────
    GS_ORDER.forEach((gs, i) => {
      if (i === 0 || i === N_GS - 1) return; // edges already drawn
      const x = gsXOf(gs).toFixed(2);
      parts.push(
        `<line x1="${x}" y1="${HDR_H}" x2="${x}" y2="${(HDR_H + DRAW_H).toFixed(2)}"
               stroke="#e2e8f0" stroke-width="0.4"/>`
      );
    });

    // ── Scale axis ─────────────────────────────────────────────────
    for (let m = 0; m <= totalM + 1e-6; m += INTERVAL) {
      const ty  = gY(m);
      const lbl = Number.isInteger(m) ? `${m}` : m.toFixed(1);
      parts.push(
        `<line x1="${(LITHO_LEFT - 6).toFixed(2)}" y1="${ty.toFixed(2)}"
               x2="${LITHO_LEFT}" y2="${ty.toFixed(2)}"
               stroke="#475569" stroke-width="1"/>`,
        `<text x="${(LITHO_LEFT - 9).toFixed(2)}" y="${ty.toFixed(2)}"
               text-anchor="end" dominant-baseline="middle"
               font-family="monospace" font-size="10" fill="#475569">${esc(lbl)}</text>`
      );
    }
    const axMid = (HDR_H + DRAW_H / 2).toFixed(1);
    parts.push(
      `<text x="10" y="${axMid}" text-anchor="middle" dominant-baseline="middle"
             transform="rotate(-90 10 ${axMid})"
             font-family="monospace" font-size="10" fill="#64748b">m</text>`
    );

    // ── Espesor total ──────────────────────────────────────────────
    const lithoMid = ((LITHO_LEFT + LITHO_RIGHT) / 2).toFixed(1);
    parts.push(
      `<text x="${lithoMid}" y="${(SVG_H - 9).toFixed(1)}"
             text-anchor="middle"
             font-family="monospace" font-size="9" fill="#64748b">
        Espesor total: ${totalM.toFixed(1)} m
      </text>`
    );

    // ── Units ──────────────────────────────────────────────────────
    computed.forEach((unit, i) => {
      const ry  = gY(unit.heightToTop);
      const rh  = Math.max(2, unit.thickness * PX_PER_M);
      const mid = ry + rh / 2;

      const baseColor  = geo ? geo.getBaseColor(unit) : (i % 2 === 0 ? '#dce7f3' : '#c8d9ec');
      const patFill    = geo ? geo.getFill(unit)       : baseColor;
      const textColor  = geo ? geo.getTextColor(unit)  : '#1e293b';
      const isSelected = selectedId && unit.id === selectedId;
      const stroke     = isSelected ? '#00F4FF' : '#7a9abf';
      const strokeW    = isSelected ? 2.5 : 1;

      // ── 1. Litología — rectángulo completo con patrón ───────────
      parts.push(
        `<rect x="${LITHO_LEFT}" y="${ry.toFixed(2)}" width="${LITHO_W}" height="${rh.toFixed(2)}"
               fill="${baseColor}" stroke="${stroke}" stroke-width="${strokeW}"/>`
      );
      if (geo && patFill !== baseColor) {
        parts.push(
          `<rect x="${LITHO_LEFT}" y="${ry.toFixed(2)}" width="${LITHO_W}" height="${rh.toFixed(2)}"
                 fill="${patFill}" stroke="none"/>`,
          `<rect x="${LITHO_LEFT}" y="${ry.toFixed(2)}" width="${LITHO_W}" height="${rh.toFixed(2)}"
                 fill="none" stroke="${stroke}" stroke-width="${strokeW}"/>`
        );
      }

      // Fossil indicator inside lithology rect
      if (geo && rh >= 14) {
        const fs = geo.drawFossil(unit, LITHO_LEFT, ry, LITHO_W, rh);
        if (fs) parts.push(fs);
      }

      // Unit code label inside lithology rect
      if (rh >= 18) {
        const label = trunc(unit.code || `U${i + 1}`, Math.floor(LITHO_W / 7));
        parts.push(
          `<text x="${(LITHO_LEFT + LITHO_W / 2).toFixed(2)}" y="${mid.toFixed(2)}"
                 text-anchor="middle" dominant-baseline="middle"
                 font-family="monospace" font-size="11" font-weight="700"
                 fill="${textColor}">${esc(label)}</text>`
        );
      }

      // ── Contact line across litho + GS columns ──────────────────
      if (unit.upperContactType) {
        if (geo) {
          parts.push(geo.drawContact(unit.upperContactType, LITHO_LEFT, ry, GS_RIGHT));
        }
      }

      // ── 2. Perfil granulométrico — polígono en su columna ────────
      // White background for GS column (clears pattern bleed-through)
      parts.push(
        `<rect x="${GS_LEFT}" y="${ry.toFixed(2)}" width="${GS_COL_W}" height="${rh.toFixed(2)}"
               fill="#ffffff" stroke="none"/>`
      );

      const profile = resolveProfile(unit);
      if (profile) {
        const polyPts = buildPts(profile, ry, rh);
        parts.push(`<polygon points="${polyPts}" fill="${baseColor}" stroke="none"/>`);
        if (geo && patFill !== baseColor) {
          parts.push(`<polygon points="${polyPts}" fill="${patFill}" stroke="none"/>`);
        }
        parts.push(`<polygon points="${polyPts}" fill="none" stroke="${stroke}" stroke-width="${strokeW}"/>`);
      } else {
        // No grain size data: draw an empty rect outline
        parts.push(
          `<rect x="${GS_LEFT}" y="${ry.toFixed(2)}" width="${GS_COL_W}" height="${rh.toFixed(2)}"
                 fill="none" stroke="#cbd5e1" stroke-width="0.5" stroke-dasharray="3 3"/>`
        );
      }

      // ── 3. Estructuras sedimentarias ─────────────────────────────
      if (geo && rh >= 8) {
        const structs = resolveStructures(unit);
        structs.forEach(({ alturaRelativa, nombre, offsetX, iconSize: perSz, iconSizeX: perSzX }) => {
          const ar   = clamp(alturaRelativa, 0, 1);
          // resolveStructIconSize mantiene la proporción natural de la foto
          // (RASTER_NATURAL_SIZE) mientras Tamaño Y/Tamaño X no se hayan
          // fijado ambos a mano — ver geo-symbols.js. Los íconos vectoriales
          // (sin tamaño natural registrado) caen al fallback ICON_H/ICON_W
          // de siempre.
          const { w: iw, h: ih } = geo.resolveStructIconSize
            ? geo.resolveStructIconSize(nombre, perSz, perSzX, ICON_H, ICON_W)
            : { w: perSzX ?? ICON_W, h: perSz ?? ICON_H };
          const ix   = ICON_X + (offsetX ?? 0);
          const iconCY = ry + rh * (1 - ar);
          const iconY  = clamp(iconCY - ih / 2, ry, ry + rh - ih);
          parts.push(geo.drawStructIcon(nombre, ix, iconY, iw, ih));
        });
      }

      // ── 3b. Datos estructurales ──────────────────────────────────
      if (geo && geo.drawStructuralData && rh >= 8) {
        const sd = geo.drawStructuralData(unit, STRUCT_LEFT, ry, STRUCT_W, rh);
        if (sd) parts.push(sd);
      }

      // ── 4. Observaciones ─────────────────────────────────────────
      if (rh >= 8) {
        const obs = resolveObservations(unit);
        obs.forEach(({ alturaRelativa, texto }) => {
          const ar   = clamp(alturaRelativa, 0, 1);
          const obsY = ry + rh * (1 - ar);
          const full = String(texto ?? '');
          const disp = trunc(full, OBS_MAX_CHARS);
          parts.push(
            `<text x="${(OBS_LEFT + 4).toFixed(1)}" y="${obsY.toFixed(2)}"
                   dominant-baseline="middle"
                   font-family="monospace" font-size="7.5" fill="#475569">
              <title>${esc(full)}</title>${esc(disp)}
            </text>`
          );
        });
      }
    });

    // ── Leyenda ───────────────────────────────────────────────────────
    if (geo) parts.push(drawLegend(legendEntries, geo, column?.legendOverrides));

    return `<svg width="${SVG_W}" height="${SVG_H.toFixed(0)}"
                 viewBox="0 0 ${SVG_W} ${SVG_H.toFixed(0)}"
                 xmlns="http://www.w3.org/2000/svg">
      ${parts.filter(Boolean).join('\n      ')}
    </svg>`;
  }

  // ── Exports ──────────────────────────────────────────────────────
  globalScope.renderGrainSizeLogSVG = renderGrainSizeLogSVG;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderGrainSizeLogSVG, gsXOf, buildPts };
  }

})(typeof window !== 'undefined' ? window
   : typeof global !== 'undefined' ? global
   : this);
