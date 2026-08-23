/**
 * src/columnas/renderer.js
 * Renderiza una columna estratigráfica como string SVG.
 *
 * Función pura: sin acceso al DOM, sin efectos laterales.
 * Funciona como global en el browser y como módulo CJS en Node.js.
 *
 * @param {object} state      — ColumnState del store
 * @param {object} [opts]
 * @param {object} [opts.geoConfig]   — objeto GEO_SYMBOLS (de geo-symbols.js)
 *                                      Si se omite, usa rellenos grises simples.
 * @param {number} [opts.pxPerMeter]  — px/m fijo; auto si se omite
 * @param {number} [opts.maxDrawH]    — altura máxima del área de dibujo en px
 * @param {boolean} [opts.asContent]  — si es true, devuelve
 *   `{ content, width, height, barLeft, barRight, units }` con el contenido
 *   SIN envoltorio `<svg>`, sin `<rect>` de fondo y sin `<defs>` (para
 *   incrustar la columna como un `<g>` dentro de un lienzo `<svg>` compartido
 *   — ver correlación en viewer.html). `barLeft`/`barRight` = bordes izq/der
 *   de la barra de litología (coords locales); `units` = `[{unitId, topY,
 *   bottomY}]` con la Y local de techo/base de cada unidad, para anclar
 *   puntos conectables sin coordenadas fijas.
 * @returns {string|{content:string,width:number,height:number,barLeft:number,barRight:number,units:Array}} SVG markup, u objeto si asContent
 */

(function (globalScope) {
  'use strict';

  // ── Helpers internos ────────────────────────────────────────────

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

  /** Intervalo de ticks apuntando a 8–15 marcas. */
  function tickInterval(totalM) {
    for (const t of [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 250, 500]) {
      if (totalM / t <= 15) return t;
    }
    return 500;
  }

  // ── Constantes de layout ────────────────────────────────────────

  const AXIS_W  = 58;   // área eje + labels numéricos
  const COL_W   = 130;  // ancho de los rectángulos
  const LABEL_W = 190;  // área de etiquetas a la derecha
  const SVG_W   = AXIS_W + COL_W + LABEL_W;
  const PAD_TOP = 32;
  const PAD_BOT = 36;

  // Rellenos grises alternos (modo sin geoConfig)
  const FILLS_DEFAULT = ['#dce7f3', '#c8d9ec'];
  const BORDER        = '#7a9abf';

  // ── Render principal ────────────────────────────────────────────

  function renderColumnSVG(state, opts = {}) {
    const { computed, column } = state;
    const geo = opts.geoConfig ?? null;
    // asContent=true → devuelve { content, width, height } SIN el envoltorio
    // <svg> ni el <rect> de fondo blanco, para poder posicionar la columna
    // como un <g> dentro de un lienzo <svg> compartido (ver computeCorrelationLayout()
    // en viewer.html). Los <defs> de patrones tampoco se incluyen acá: el
    // lienzo compartido los agrega UNA sola vez (evita IDs duplicados).
    const asContent = opts.asContent === true;

    // ── Estado vacío ──────────────────────────────────────────────
    if (!computed || computed.length === 0) {
      const emptyBody =
        `<text x="${SVG_W / 2}" y="100" text-anchor="middle" dominant-baseline="middle"
               font-family="monospace" font-size="13" fill="#94a3b8">Sin unidades — agrega la primera unidad</text>`;
      if (asContent) return { content: emptyBody, width: SVG_W, height: 200, barLeft: AXIS_W, barRight: AXIS_W + COL_W, units: [] };
      return `<svg width="${SVG_W}" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="${SVG_W}" height="200" fill="#f8fafc"/>
        ${emptyBody}
      </svg>`;
    }

    // ── Métricas ──────────────────────────────────────────────────
    const totalM    = computed[computed.length - 1].heightToTop;
    const MAX_H     = opts.maxDrawH ?? 740;
    const PX_PER_M  = opts.pxPerMeter ?? clamp(MAX_H / totalM, 6, 38);
    const selectedId = opts.selectedId ?? null;
    const DRAW_H   = totalM * PX_PER_M;
    const SVG_H    = DRAW_H + PAD_TOP + PAD_BOT;
    const INTERVAL = tickInterval(totalM);

    /**
     * Altura geológica (0 = base) → SVG y (0 = tope del SVG).
     * La unidad más antigua queda abajo en el SVG.
     */
    const gY = (h) => PAD_TOP + (totalM - h) * PX_PER_M;

    const parts = [];

    // ── Defs de patrones (solo con geoConfig) ─────────────────────
    // En modo asContent los <defs> los pone el lienzo compartido una sola vez.
    if (geo && !asContent) parts.push(geo.getSVGDefs());

    // ── Fondo blanco ──────────────────────────────────────────────
    // En modo asContent el fondo blanco es un único <rect> del lienzo
    // compartido que envuelve TODAS las columnas — no uno por columna.
    if (!asContent) {
      parts.push(
        `<rect width="${SVG_W}" height="${SVG_H.toFixed(0)}" fill="#ffffff"/>`
      );
    }

    // ── Título ────────────────────────────────────────────────────
    if (column?.metadata?.name) {
      parts.push(
        `<text x="${(AXIS_W + COL_W / 2).toFixed(1)}" y="${(PAD_TOP / 2).toFixed(1)}"
               text-anchor="middle" dominant-baseline="middle"
               font-family="monospace" font-size="12" font-weight="700" fill="#1e293b">
          ${esc(trunc(column.metadata.name, 28))}
        </text>`
      );
    }

    // ── Eje vertical ──────────────────────────────────────────────
    parts.push(
      `<line x1="${AXIS_W}" y1="${gY(totalM).toFixed(2)}"
             x2="${AXIS_W}" y2="${gY(0).toFixed(2)}"
             stroke="#475569" stroke-width="1.5"/>`
    );

    // ── Ticks de escala ───────────────────────────────────────────
    for (let m = 0; m <= totalM + 1e-6; m += INTERVAL) {
      const ty  = gY(m);
      const lbl = Number.isInteger(m) ? `${m}` : m.toFixed(1);
      parts.push(
        `<line x1="${AXIS_W - 7}" y1="${ty.toFixed(2)}" x2="${AXIS_W}" y2="${ty.toFixed(2)}"
               stroke="#475569" stroke-width="1"/>`,
        `<text x="${AXIS_W - 10}" y="${ty.toFixed(2)}"
               text-anchor="end" dominant-baseline="middle"
               font-family="monospace" font-size="11" fill="#475569">${esc(lbl)}</text>`
      );
    }

    // Unidad "m" rotada
    const axMid = (PAD_TOP + DRAW_H / 2).toFixed(1);
    parts.push(
      `<text x="11" y="${axMid}" text-anchor="middle" dominant-baseline="middle"
             transform="rotate(-90 11 ${axMid})"
             font-family="monospace" font-size="11" fill="#64748b">m</text>`
    );

    // ── TECHO / BASE ──────────────────────────────────────────────
    parts.push(
      `<text x="${(AXIS_W + COL_W / 2).toFixed(1)}" y="${(gY(totalM) - 14).toFixed(1)}"
             text-anchor="middle" font-family="monospace" font-size="9"
             letter-spacing="2" fill="#94a3b8">TECHO</text>`,
      `<text x="${(AXIS_W + COL_W / 2).toFixed(1)}" y="${(gY(0) + 18).toFixed(1)}"
             text-anchor="middle" font-family="monospace" font-size="9"
             letter-spacing="2" fill="#94a3b8">BASE</text>`
    );

    // ── Unidades ──────────────────────────────────────────────────
    computed.forEach((unit, i) => {
      const ry  = gY(unit.heightToTop); // SVG y de la arista superior del rect
      const rh  = Math.max(2, unit.thickness * PX_PER_M);
      const rx  = AXIS_W;
      const mid = ry + rh / 2;

      // Colores y texto según configuración
      const baseColor = geo ? geo.getBaseColor(unit) : FILLS_DEFAULT[i % 2];
      const patFill   = geo ? geo.getFill(unit)      : FILLS_DEFAULT[i % 2];
      const textColor = geo ? geo.getTextColor(unit)  : '#1e293b';

      // ── Rect: color base ──────────────────────────────────────
      const isSelected  = selectedId && unit.id === selectedId;
      const rectStroke  = isSelected ? '#00F4FF' : BORDER;
      const rectStrokeW = isSelected ? 2.5 : 1;

      parts.push(
        `<rect x="${rx}" y="${ry.toFixed(2)}" width="${COL_W}"
               height="${rh.toFixed(2)}" fill="${baseColor}"
               stroke="${rectStroke}" stroke-width="${rectStrokeW}"/>`
      );

      // ── Rect: overlay de patrón (si existe y difiere del color base) ──
      if (geo && patFill !== baseColor) {
        parts.push(
          `<rect x="${rx}" y="${ry.toFixed(2)}" width="${COL_W}"
                 height="${rh.toFixed(2)}" fill="${patFill}" stroke="none"/>`,
          `<rect x="${rx}" y="${ry.toFixed(2)}" width="${COL_W}"
                 height="${rh.toFixed(2)}" fill="none"
                 stroke="${rectStroke}" stroke-width="${rectStrokeW}"/>`
        );
      }

      // ── Divisores de subunidades ──────────────────────────────
      if (unit.subUnits?.length > 1) {
        unit.subUnits.slice(0, -1).forEach(sub => {
          const dy = gY(sub.heightToTop);
          parts.push(
            `<line x1="${rx}" y1="${dy.toFixed(2)}"
                   x2="${rx + COL_W}" y2="${dy.toFixed(2)}"
                   stroke="${BORDER}" stroke-width="0.8" stroke-dasharray="4 2"/>`
          );
        });
      }

      // ── Línea de contacto en la arista superior ───────────────
      if (unit.upperContactType) {
        if (geo) {
          parts.push(geo.drawContact(unit.upperContactType, rx, ry, rx + COL_W));
        } else if (unit.upperContactType !== 'neto') {
          // Modo sin geo: estilos simples
          const simpleStyles = {
            gradual:     { stroke: '#475569', w: 1.5, dash: '6 3' },
            erosivo:     { stroke: '#b45309', w: 2,   dash: '' },
            tectonico:   { stroke: '#dc2626', w: 2.5, dash: '' },
            no_expuesto: { stroke: '#94a3b8', w: 1.5, dash: '2 4' },
          };
          const cs = simpleStyles[unit.upperContactType];
          if (cs) {
            parts.push(
              `<line x1="${rx}" y1="${ry.toFixed(2)}"
                     x2="${rx + COL_W}" y2="${ry.toFixed(2)}"
                     stroke="${cs.stroke}" stroke-width="${cs.w}"
                     ${cs.dash ? `stroke-dasharray="${cs.dash}"` : ''}/>`
            );
          }
        }
      }

      // ── Estructuras sedimentarias ─────────────────────────────
      if (geo && rh >= 14) {
        const ss = geo.drawSedStructs(unit, rx, ry, COL_W, rh);
        if (ss) parts.push(ss);
      }

      // ── Indicador fosilífero ──────────────────────────────────
      if (geo && rh >= 14) {
        const fs = geo.drawFossil(unit, rx, ry, COL_W, rh);
        if (fs) parts.push(fs);
        const ft = geo.drawFossilTypes ? geo.drawFossilTypes(unit, rx, ry, COL_W, rh) : '';
        if (ft) parts.push(ft);
      }

      // ── Etiqueta dentro del rect (código) ────────────────────
      if (rh >= 18) {
        const label = trunc(unit.code || `U${i + 1}`, Math.floor(COL_W / 7));
        parts.push(
          `<text x="${(rx + COL_W / 2).toFixed(2)}" y="${mid.toFixed(2)}"
                 text-anchor="middle" dominant-baseline="middle"
                 font-family="monospace" font-size="11" font-weight="700"
                 fill="${textColor}">
            ${esc(label)}
          </text>`
        );
      }

      // ── Etiquetas a la derecha ────────────────────────────────
      const lx    = rx + COL_W + 10;
      const code  = esc(unit.code || `U${i + 1}`);
      const litho = unit.primaryLithology ? trunc(unit.primaryLithology, 24) : null;
      const thick = `${unit.thickness.toFixed(1)} m`;

      if (rh >= 36) {
        parts.push(
          `<text x="${lx}" y="${(ry + 12).toFixed(2)}"
                 dominant-baseline="middle"
                 font-family="monospace" font-size="12" font-weight="700" fill="#1e293b">
            ${code}
          </text>`,
          litho
            ? `<text x="${lx}" y="${(ry + 26).toFixed(2)}"
                     dominant-baseline="middle"
                     font-family="monospace" font-size="9.5" fill="#475569">
                ${esc(litho)}
              </text>`
            : '',
          `<text x="${lx}" y="${(ry + rh - 7).toFixed(2)}"
                 dominant-baseline="middle"
                 font-family="monospace" font-size="9" fill="#94a3b8">
            ${esc(thick)}
          </text>`
        );
      } else if (rh >= 14) {
        parts.push(
          `<text x="${lx}" y="${mid.toFixed(2)}"
                 dominant-baseline="middle"
                 font-family="monospace" font-size="10" fill="#334155">
            ${code} · ${esc(thick)}
          </text>`
        );
      } else {
        parts.push(
          `<line x1="${rx + COL_W}" y1="${mid.toFixed(2)}"
                 x2="${lx - 2}" y2="${mid.toFixed(2)}"
                 stroke="#cbd5e1" stroke-width="0.7"/>`,
          `<text x="${lx}" y="${mid.toFixed(2)}"
                 dominant-baseline="middle"
                 font-family="monospace" font-size="8.5" fill="#64748b">
            ${code}
          </text>`
        );
      }
    });

    // ── Espesor total ─────────────────────────────────────────────
    parts.push(
      `<text x="${(AXIS_W + COL_W / 2).toFixed(1)}" y="${(SVG_H - 9).toFixed(1)}"
             text-anchor="middle"
             font-family="monospace" font-size="10" fill="#64748b">
        Espesor total: ${totalM.toFixed(1)} m
      </text>`
    );

    const body = parts.filter(Boolean).join('\n      ');
    // Modo asContent: contenido "desnudo" + dimensiones + geometría de anclaje,
    // para el lienzo compartido de Correlación. `units` da, por unidad, la Y
    // LOCAL de su techo (topY) y su base (bottomY); barLeft/barRight son los
    // bordes izq/der de la barra de litología. Con esto y la posición (x,
    // contentY) de la columna en el lienzo compartido, un PuntoConectable
    // {unitId, edge, side} se resuelve a un píxel exacto en cualquier momento
    // (ver _resolveCorrPoint() en viewer.html) — sin coordenadas fijas.
    if (asContent) {
      const anchors = computed.map((u) => ({
        unitId:  u.id,
        topY:    gY(u.heightToTop),
        bottomY: gY(u.heightFromBase),
      }));
      return { content: body, width: SVG_W, height: SVG_H, barLeft: AXIS_W, barRight: AXIS_W + COL_W, units: anchors };
    }
    return `<svg width="${SVG_W}" height="${SVG_H.toFixed(0)}"
                 viewBox="0 0 ${SVG_W} ${SVG_H.toFixed(0)}"
                 xmlns="http://www.w3.org/2000/svg">
      ${body}
    </svg>`;
  }

  // ── Exports ─────────────────────────────────────────────────────
  globalScope.renderColumnSVG = renderColumnSVG;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderColumnSVG };
  }

})(typeof window !== 'undefined' ? window
   : typeof global !== 'undefined' ? global
   : this);
