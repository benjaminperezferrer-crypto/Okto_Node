/**
 * src/shared/exportDiagram.ts
 * Utilidades de exportación de diagramas SVG a archivos .svg / .png.
 * Originalmente src/hidrogeo/exportDiagram.ts (Etapa 13 de
 * Hidrogeoquímica) — movido acá en la Etapa 10 de Análisis Estructural.
 *
 * Diseño: ninguna de las funciones depende de un componente de diagrama
 * en particular — reciben una ref (o el propio nodo DOM) a un contenedor
 * que tenga un <svg> adentro (o que SEA el <svg>), y buscan ese <svg> con
 * querySelector. Esto significa que ExportButton.tsx funciona con
 * cualquier diagrama de cualquier módulo sin tener que modificarlo — el
 * llamador simplemente envuelve el diagrama en un <div ref={...}> propio.
 *
 * Nota sobre "300 DPI equivalente": un SVG en el navegador usa el pixel
 * de referencia CSS (96 px = 1 pulgada). Para que el PNG resultante se
 * imprima a 300 DPI reales hay que rasterizar a 300/96 ≈ 3.125× el
 * tamaño en px del SVG — MIN_EXPORT_SCALE es exactamente ese factor, y
 * exportDiagramToPNG nunca usa una escala menor, sin importar lo que
 * pida el llamador.
 */

import type { RefObject } from 'react';

// ─────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────

const CSS_DPI = 96;
export const MIN_EXPORT_DPI = 300;
/** Factor de escala mínimo para que el PNG equivalga a ≥300 DPI (300/96). */
export const MIN_EXPORT_SCALE = MIN_EXPORT_DPI / CSS_DPI;

// ─────────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────────

type SVGSource = RefObject<HTMLElement | SVGSVGElement | null> | HTMLElement | SVGSVGElement | null;

function resolveSVG(source: SVGSource): SVGSVGElement | null {
  const el: HTMLElement | SVGSVGElement | null =
    source && typeof source === 'object' && 'current' in source ? source.current : source;
  if (!el) return null;
  if (el instanceof SVGSVGElement) return el;
  return el.querySelector('svg');
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function serializeSVG(svg: SVGSVGElement, width?: number, height?: number): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (width)  clone.setAttribute('width', String(width));
  if (height) clone.setAttribute('height', String(height));
  return new XMLSerializer().serializeToString(clone);
}

/** Ancho/alto reales del SVG en px CSS, con fallback a viewBox y luego a getBoundingClientRect. */
function getSVGSize(svg: SVGSVGElement): { width: number; height: number } {
  let width  = parseFloat(svg.getAttribute('width')  ?? '') || 0;
  let height = parseFloat(svg.getAttribute('height') ?? '') || 0;
  if ((!width || !height) && svg.getAttribute('viewBox')) {
    const parts = svg.getAttribute('viewBox')!.trim().split(/\s+/).map(Number);
    width  = width  || parts[2] || 0;
    height = height || parts[3] || 0;
  }
  if (!width || !height) {
    const box = svg.getBoundingClientRect();
    width  = width  || box.width;
    height = height || box.height;
  }
  return { width, height };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo rasterizar el SVG a imagen'));
    img.src = src;
  });
}

// ─────────────────────────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────────────────────────

/**
 * Descarga el <svg> encontrado dentro de `source` (o `source` mismo si ya
 * es un <svg>) como archivo .svg standalone.
 */
export function exportDiagramToSVG(source: SVGSource, filename = 'diagrama.svg'): void {
  const svg = resolveSVG(source);
  if (!svg) {
    console.warn('exportDiagramToSVG: no se encontró un <svg> en el elemento indicado.');
    return;
  }
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n${serializeSVG(svg)}`;
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(blob, filename);
}

/**
 * Wrapper delgado sobre exportDiagramToSVG/exportDiagramToPNG para un
 * `<svg>` YA RESUELTO (a diferencia de las dos funciones de abajo, que
 * también aceptan un contenedor/ref y buscan el `<svg>` adentro) —
 * pensado para ExportButton.tsx, que ya tiene el elemento en mano. No
 * duplica lógica de serialización/rasterizado.
 *
 * El título configurado en ChartStyleSettings no necesita tratamiento
 * especial acá: si el diagrama lo renderiza como parte de su propio
 * `<svg>`, ya viaja incluido al clonar/serializar el SVG en vivo, igual
 * que cualquier otro texto del diagrama.
 */
export function exportChartAsImage(svgElement: SVGSVGElement, format: 'png' | 'svg', filename: string): void {
  if (format === 'svg') {
    exportDiagramToSVG(svgElement, filename);
  } else {
    void exportDiagramToPNG(svgElement, MIN_EXPORT_SCALE, filename);
  }
}

/**
 * Rasteriza el <svg> encontrado dentro de `source` a un Blob PNG en
 * memoria — SIN descargar nada. Es el núcleo de exportDiagramToPNG
 * (extraído en la Etapa 3 del paquete de ubicación espacial de gráficos
 * de Hidrogeoquímica) para poder generar el PNG programáticamente (ej.
 * para publicarlo como capa ráster en GIS) sin pasar por
 * triggerDownload(). `scale` nunca baja de MIN_EXPORT_SCALE (≥300 DPI
 * equivalente), aunque se pida un valor menor. `backgroundColor` rellena
 * el canvas antes de dibujar (por defecto blanco, mismo motivo que en
 * exportDiagramToPNG).
 */
export async function renderDiagramToPNGBlob(
  source: SVGSource,
  scale = MIN_EXPORT_SCALE,
  backgroundColor = '#ffffff',
): Promise<Blob> {
  const svg = resolveSVG(source);
  if (!svg) {
    throw new Error('renderDiagramToPNGBlob: no se encontró un <svg> en el elemento indicado.');
  }

  const effectiveScale = Math.max(scale, MIN_EXPORT_SCALE);
  const { width, height } = getSVGSize(svg);
  if (!width || !height) {
    throw new Error('renderDiagramToPNGBlob: no se pudo determinar el tamaño del SVG.');
  }

  const xml = serializeSVG(svg, width, height);
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(width  * effectiveScale);
    canvas.height = Math.round(height * effectiveScale);

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo crear el contexto 2D del canvas.');

    if (backgroundColor) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('canvas.toBlob() devolvió null'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/**
 * Rasteriza el <svg> encontrado dentro de `source` a PNG y lo descarga.
 * Envoltorio delgado sobre renderDiagramToPNGBlob — mismos mensajes de
 * warning y mismo comportamiento (no lanza, solo avisa y no descarga) que
 * antes de la Etapa 3, ahora reutilizando esa función en vez de duplicar
 * la lógica de rasterizado.
 */
export async function exportDiagramToPNG(
  source: SVGSource,
  scale = MIN_EXPORT_SCALE,
  filename = 'diagrama.png',
  backgroundColor = '#ffffff',
): Promise<void> {
  let blob: Blob;
  try {
    blob = await renderDiagramToPNGBlob(source, scale, backgroundColor);
  } catch (err) {
    console.warn(err instanceof Error ? err.message : String(err));
    return;
  }
  triggerDownload(blob, filename);
}
