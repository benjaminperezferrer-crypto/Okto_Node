/**
 * src/estructural/exportReportFigure.ts
 * Paquete de mejoras de Análisis Estructural — exportación de "figura de
 * informe": una sola imagen que reúne el estereograma + la roseta + la
 * leyenda de clasificación + la estadística direccional de Fisher del
 * filtro activo, lista para pegar en un informe.
 *
 * ── Reutiliza exportDiagramToPNG/exportDiagramToSVG (src/shared/
 *    exportDiagram.ts), no reinventa el pipeline de exportación ────────
 * `resolveSVG()` (interno a exportDiagram.ts) ya acepta un `SVGSVGElement`
 * YA RESUELTO además de una ref/contenedor — así que `buildReportFigureSVG()`
 * de acá construye un `<svg>` COMPUESTO nuevo (con los 2 diagramas
 * embebidos como `<svg>` anidados + texto de leyenda/estadística) y se lo
 * pasa DIRECTO a exportDiagramToPNG/exportDiagramToSVG, sin duplicar nada
 * de la lógica de serializar/rasterizar/descargar que esas funciones ya
 * tienen (clon, XMLSerializer, canvas, blob, ≥300 DPI vía MIN_EXPORT_SCALE).
 *
 * ── Decisión: la figura SIEMPRE exporta la vista completa, SIN el zoom/
 *    paneo que el usuario tenga activo en pantalla ─────────────────────
 * Una "figura de informe" es un resumen representativo y reproducible del
 * conjunto de datos — no una captura de un estado de interacción
 * transitorio. Si el usuario quiere exportar específicamente un detalle
 * ampliado, ya existe el botón de exportación POR DIAGRAMA (ExportButton,
 * src/shared/), que sí clona el DOM tal cual está en pantalla (incluido
 * el zoom). Acá, en cambio, cada `<svg>` fuente se CLONA y su `<g>` de
 * zoom (marcado con `data-testid="zoom-content-group"` en
 * StereonetBase.tsx/RoseDiagram.tsx) se resetea a transform identidad
 * SOLO en el clon — la vista real en pantalla del usuario NUNCA se toca
 * (ni se llama a `resetZoom()` de ninguno de los 2 diagramas).
 *
 * ── Todo lo demás del estado visual SÍ se refleja tal cual está ────────
 * Kamb, plano/polo medio, cono de confianza, símbolos por tipo, anillos
 * de familia, opacidad — todo eso ya es parte del DOM real de cada
 * `<svg>` en el momento de exportar (atributos/elementos ya renderizados
 * por React), así que clonar el nodo los incluye automáticamente sin
 * ninguna lógica extra acá — coherente con "reutiliza con su
 * configuración de estilo actual" del pedido.
 */

import { exportDiagramToPNG, exportDiagramToSVG, MIN_EXPORT_SCALE } from '../shared/exportDiagram';
import type { FisherStats } from './stereonet';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MARGIN = 20;
const GAP = 24;
const TITLE_HEIGHT = 32;
const STATS_ROW_HEIGHT = 18;
const LEGEND_SWATCH = 12;
const LEGEND_ITEMS_PER_ROW = 4;
const DEFAULT_DIAGRAM_SIZE = 480;

export interface ReportFigureLegendEntry {
  label: string;
  color: string;
}

export interface ReportFigureParams {
  stereonetSvg: SVGSVGElement;
  roseSvg: SVGSVGElement;
  legendEntries: ReportFigureLegendEntry[];
  /** Etiqueta legible del campo de clasificación activo (p.ej. "Tipo de estructura"), o null si no hay clasificación. */
  classificationLabel: string | null;
  fisherStats: FisherStats | null;
  /** Cantidad de mediciones que entraron a fisherStats — se muestra incluso cuando fisherStats es null (para distinguir "0 mediciones" de "sin dirección media significativa"). */
  measurementCount: number;
  title?: string;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function text(x: number, y: number, content: string, attrs: Record<string, string> = {}): SVGTextElement {
  const t = el('text', { x: String(x), y: String(y), 'font-family': 'Arial, Helvetica, sans-serif', fill: '#0f172a', ...attrs });
  t.textContent = content;
  return t;
}

/** Clona un `<svg>` fuente y resetea a transform identidad el `<g data-testid="zoom-content-group">` de ADENTRO del clon — la vista real en pantalla nunca se toca (ver JSDoc de archivo). */
function cloneWithZoomReset(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const zoomGroup = clone.querySelector('[data-testid="zoom-content-group"]');
  zoomGroup?.removeAttribute('transform');
  return clone;
}

function svgSize(svg: SVGSVGElement): { width: number; height: number } {
  const width = parseFloat(svg.getAttribute('width') ?? '') || svg.getBoundingClientRect().width || DEFAULT_DIAGRAM_SIZE;
  const height = parseFloat(svg.getAttribute('height') ?? '') || svg.getBoundingClientRect().height || DEFAULT_DIAGRAM_SIZE;
  return { width, height };
}

function formatKappa(kappa: number): string {
  return Number.isFinite(kappa) ? kappa.toFixed(kappa < 100 ? 1 : 0) : '∞';
}

/**
 * Construye el `<svg>` COMPUESTO — estereograma + roseta lado a lado
 * arriba, leyenda + estadística de Fisher debajo. Devuelve el elemento
 * (no lo descarga ni lo rasteriza — eso lo hace `exportReportFigure()`,
 * reutilizando exportDiagramToPNG/exportDiagramToSVG).
 */
export function buildReportFigureSVG(params: ReportFigureParams): SVGSVGElement {
  const {
    stereonetSvg, roseSvg, legendEntries, classificationLabel, fisherStats, measurementCount,
    title = 'Análisis Estructural — Figura de informe',
  } = params;

  const sClone = cloneWithZoomReset(stereonetSvg);
  const rClone = cloneWithZoomReset(roseSvg);
  const sSize = svgSize(stereonetSvg);
  const rSize = svgSize(roseSvg);

  const legendRows = Math.max(1, Math.ceil(legendEntries.length / LEGEND_ITEMS_PER_ROW));
  const legendHeight = legendEntries.length > 0 ? legendRows * 20 + 20 : 0;
  const statsLines = fisherStats ? 4 : 2; // N + orientación + κ + cono, o N + "sin dirección media"
  const statsHeight = statsLines * STATS_ROW_HEIGHT + 26;
  const bottomHeight = legendHeight + statsHeight;

  const rowWidth = sSize.width + GAP + rSize.width;
  const rowHeight = Math.max(sSize.height, rSize.height);
  const totalWidth = Math.max(rowWidth, 460) + MARGIN * 2;
  const totalHeight = MARGIN + TITLE_HEIGHT + rowHeight + GAP + bottomHeight + MARGIN;

  const root = el('svg', {
    xmlns: SVG_NS,
    width: String(totalWidth),
    height: String(totalHeight),
    viewBox: `0 0 ${totalWidth} ${totalHeight}`,
  });

  // Fondo blanco explícito EN el propio SVG (no solo en el canvas de
  // exportDiagramToPNG) — así el .svg exportado también se ve bien
  // pegado en un documento, no transparente.
  root.appendChild(el('rect', { x: '0', y: '0', width: String(totalWidth), height: String(totalHeight), fill: '#ffffff' }));

  root.appendChild(text(MARGIN, MARGIN + 18, title, { 'font-size': '18', 'font-weight': '700' }));
  root.appendChild(text(totalWidth - MARGIN, MARGIN + 18, new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' }), { 'font-size': '11', fill: '#475569', 'text-anchor': 'end' }));

  const rowY = MARGIN + TITLE_HEIGHT;

  sClone.setAttribute('x', String(MARGIN));
  sClone.setAttribute('y', String(rowY));
  sClone.setAttribute('width', String(sSize.width));
  sClone.setAttribute('height', String(sSize.height));
  root.appendChild(sClone);

  rClone.setAttribute('x', String(MARGIN + sSize.width + GAP));
  rClone.setAttribute('y', String(rowY));
  rClone.setAttribute('width', String(rSize.width));
  rClone.setAttribute('height', String(rSize.height));
  root.appendChild(rClone);

  let y = rowY + rowHeight + GAP;

  // ── Leyenda de clasificación ──────────────────────────────────────
  if (legendEntries.length > 0) {
    root.appendChild(text(MARGIN, y, classificationLabel ? `Clasificado por: ${classificationLabel}` : 'Leyenda', { 'font-size': '13', 'font-weight': '700' }));
    y += 18;
    legendEntries.forEach((entry, i) => {
      const col = i % LEGEND_ITEMS_PER_ROW;
      const row = Math.floor(i / LEGEND_ITEMS_PER_ROW);
      const itemWidth = (totalWidth - MARGIN * 2) / LEGEND_ITEMS_PER_ROW;
      const x = MARGIN + col * itemWidth;
      const swatchY = y + row * 20;
      root.appendChild(el('rect', { x: String(x), y: String(swatchY - LEGEND_SWATCH + 2), width: String(LEGEND_SWATCH), height: String(LEGEND_SWATCH), fill: entry.color, stroke: '#0f172a', 'stroke-width': '1' }));
      root.appendChild(text(x + LEGEND_SWATCH + 6, swatchY, entry.label, { 'font-size': '12' }));
    });
    y += legendRows * 20 + 20;
  }

  // ── Estadística direccional de Fisher ───────────────────────────────
  root.appendChild(text(MARGIN, y, 'Estadística direccional (Fisher)', { 'font-size': '13', 'font-weight': '700' }));
  y += 20;
  if (fisherStats) {
    root.appendChild(text(MARGIN, y, `N = ${fisherStats.n}`, { 'font-size': '12' })); y += STATS_ROW_HEIGHT;
    root.appendChild(text(MARGIN, y, `Orientación media: ${fisherStats.dipDirection.toFixed(0)}°/${fisherStats.dip.toFixed(0)}°`, { 'font-size': '12' })); y += STATS_ROW_HEIGHT;
    root.appendChild(text(MARGIN, y, `κ = ${formatKappa(fisherStats.kappa)}`, { 'font-size': '12' })); y += STATS_ROW_HEIGHT;
    root.appendChild(text(MARGIN, y, `Cono de confianza (${Math.round(fisherStats.confidenceLevel * 100)}%): ${fisherStats.confidenceConeDeg.toFixed(1)}°`, { 'font-size': '12' }));
  } else {
    root.appendChild(text(MARGIN, y, `N = ${measurementCount}`, { 'font-size': '12' })); y += STATS_ROW_HEIGHT;
    root.appendChild(text(MARGIN, y, 'Sin dirección media significativa.', { 'font-size': '12', fill: '#64748b' }));
  }

  return root;
}

/** Arma la figura compuesta y la descarga — reutiliza exportDiagramToPNG/exportDiagramToSVG (src/shared/exportDiagram.ts) pasándoles el `<svg>` YA CONSTRUIDO como fuente (ambas funciones aceptan un SVGSVGElement resuelto directo, no solo una ref/contenedor). */
export async function exportReportFigure(params: ReportFigureParams, format: 'png' | 'svg', filename: string): Promise<void> {
  const svg = buildReportFigureSVG(params);
  if (format === 'svg') {
    exportDiagramToSVG(svg, filename);
  } else {
    await exportDiagramToPNG(svg, MIN_EXPORT_SCALE, filename);
  }
}
