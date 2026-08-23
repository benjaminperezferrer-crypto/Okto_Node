// @vitest-environment jsdom
/**
 * src/estructural/exportReportFigure.test.ts
 * Necesita DOM (document.createElementNS, cloneNode) — mismo pragma que
 * filterPresets.test.ts. Solo testea buildReportFigureSVG() (estructura
 * del SVG compuesto) — exportReportFigure() en sí (descarga de archivo)
 * se verifica en el navegador, mismo criterio que exportDiagram.ts.
 */
import { describe, it, expect } from 'vitest';
import { buildReportFigureSVG } from './exportReportFigure';
import type { FisherStats } from './stereonet';

const SVG_NS = 'http://www.w3.org/2000/svg';

function makeSourceSvg(width: number, height: number, includeZoomGroup: boolean): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  if (includeZoomGroup) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('data-testid', 'zoom-content-group');
    g.setAttribute('transform', 'translate(50 50) scale(2.5)'); // simula un zoom activo
    const marker = document.createElementNS(SVG_NS, 'circle');
    marker.setAttribute('data-testid', 'pole-1');
    marker.setAttribute('cx', '10');
    g.appendChild(marker);
    svg.appendChild(g);
  }
  return svg;
}

const fisherStats: FisherStats = {
  dipDirection: 60, dip: 40, n: 25, resultantLength: 0.999,
  kappa: 3485, confidenceConeDeg: 0.5, confidenceLevel: 0.95,
};

describe('buildReportFigureSVG', () => {
  it('devuelve un <svg> con fondo blanco, título y fecha', () => {
    const stereonetSvg = makeSourceSvg(400, 430, false);
    const roseSvg = makeSourceSvg(400, 430, false);
    const svg = buildReportFigureSVG({
      stereonetSvg, roseSvg, legendEntries: [], classificationLabel: null,
      fisherStats: null, measurementCount: 0,
    });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    const bg = svg.querySelector('rect');
    expect(bg?.getAttribute('fill')).toBe('#ffffff');
    const texts = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts.some((t) => t?.includes('Figura de informe'))).toBe(true);
  });

  it('el zoom del clon queda RESETEADO (sin transform), y el nodo original fuente NO se toca', () => {
    const stereonetSvg = makeSourceSvg(400, 430, true);
    const roseSvg = makeSourceSvg(400, 430, true);
    const originalTransform = stereonetSvg.querySelector('[data-testid="zoom-content-group"]')!.getAttribute('transform');
    const svg = buildReportFigureSVG({
      stereonetSvg, roseSvg, legendEntries: [], classificationLabel: null,
      fisherStats: null, measurementCount: 0,
    });
    // el original NO cambia (nunca se muta el SVG fuente, ver JSDoc de archivo)
    expect(stereonetSvg.querySelector('[data-testid="zoom-content-group"]')!.getAttribute('transform')).toBe(originalTransform);
    // el clon SÍ queda sin transform (reseteado a identidad)
    const clonedGroups = svg.querySelectorAll('[data-testid="zoom-content-group"]');
    expect(clonedGroups.length).toBe(2); // uno por diagrama embebido
    for (const g of clonedGroups) {
      expect(g.getAttribute('transform')).toBeNull();
    }
    // el contenido (el marcador de adentro) SÍ se preservó al clonar
    expect(svg.querySelectorAll('[data-testid="pole-1"]').length).toBe(2);
  });

  it('embebe ambos diagramas como <svg> anidados, lado a lado (x del segundo > x+width del primero)', () => {
    const stereonetSvg = makeSourceSvg(300, 330, false);
    const roseSvg = makeSourceSvg(300, 330, false);
    const svg = buildReportFigureSVG({
      stereonetSvg, roseSvg, legendEntries: [], classificationLabel: null,
      fisherStats: null, measurementCount: 0,
    });
    const nested = svg.querySelectorAll(':scope > svg');
    expect(nested.length).toBe(2);
    const [first, second] = Array.from(nested);
    const firstX = parseFloat(first.getAttribute('x')!);
    const firstW = parseFloat(first.getAttribute('width')!);
    const secondX = parseFloat(second.getAttribute('x')!);
    expect(secondX).toBeGreaterThanOrEqual(firstX + firstW);
  });

  it('dibuja la leyenda con un swatch de color por entrada', () => {
    const stereonetSvg = makeSourceSvg(300, 330, false);
    const roseSvg = makeSourceSvg(300, 330, false);
    const svg = buildReportFigureSVG({
      stereonetSvg, roseSvg,
      legendEntries: [{ label: 'Falla', color: '#2563eb' }, { label: 'Diaclasa', color: '#dc2626' }],
      classificationLabel: 'Tipo de estructura',
      fisherStats: null, measurementCount: 0,
    });
    const texts = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toContain('Falla');
    expect(texts).toContain('Diaclasa');
    expect(texts.some((t) => t?.includes('Tipo de estructura'))).toBe(true);
    const swatchColors = Array.from(svg.querySelectorAll('rect')).map((r) => r.getAttribute('fill'));
    expect(swatchColors).toContain('#2563eb');
    expect(swatchColors).toContain('#dc2626');
  });

  it('con fisherStats no-null, muestra N/orientación/κ/cono con los valores exactos', () => {
    const stereonetSvg = makeSourceSvg(300, 330, false);
    const roseSvg = makeSourceSvg(300, 330, false);
    const svg = buildReportFigureSVG({
      stereonetSvg, roseSvg, legendEntries: [], classificationLabel: null,
      fisherStats, measurementCount: 25,
    });
    const texts = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent ?? '');
    expect(texts.some((t) => t === 'N = 25')).toBe(true);
    expect(texts.some((t) => t.includes('60°/40°'))).toBe(true);
    expect(texts.some((t) => t.includes('κ = 3485'))).toBe(true);
    expect(texts.some((t) => t.includes('0.5°'))).toBe(true);
  });

  it('con fisherStats null, muestra el conteo y el aviso de "sin dirección media"', () => {
    const stereonetSvg = makeSourceSvg(300, 330, false);
    const roseSvg = makeSourceSvg(300, 330, false);
    const svg = buildReportFigureSVG({
      stereonetSvg, roseSvg, legendEntries: [], classificationLabel: null,
      fisherStats: null, measurementCount: 7,
    });
    const texts = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent ?? '');
    expect(texts.some((t) => t === 'N = 7')).toBe(true);
    expect(texts.some((t) => t.includes('Sin dirección media'))).toBe(true);
  });
});
