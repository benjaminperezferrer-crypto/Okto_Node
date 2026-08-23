/**
 * src/shared/ExportButton.tsx
 * Botón de exportación estándar, reutilizable por cualquier diagrama SVG
 * de cualquier módulo. Originalmente src/hidrogeo/ExportButton.tsx (Etapa
 * 4.5b de Hidrogeoquímica) — movido acá en la Etapa 10 de Análisis
 * Estructural. No conoce ningún diagrama en particular: solo necesita una
 * ref al contenedor que envuelve al <svg> del diagrama (mismo contrato
 * que exportDiagramToSVG/exportDiagramToPNG en exportDiagram.ts — busca
 * el primer <svg> adentro).
 *
 * Un único selector de formato + un botón "Exportar" (usa
 * exportChartAsImage(), wrapper delgado sobre las mismas 2 funciones de
 * siempre, en vez de llamarlas directo).
 *
 * Uso típico — no requiere modificar ningún componente de diagrama:
 *
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   return (
 *     <div>
 *       <div ref={containerRef}>
 *         <StereonetPlanes measurements={measurements} />
 *       </div>
 *       <ExportButton targetRef={containerRef} filename="estereograma" />
 *     </div>
 *   );
 */

import React, { useState } from 'react';
import type { RefObject } from 'react';
import { exportChartAsImage } from './exportDiagram';

// ─────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────

export interface ExportButtonProps {
  /** Ref al contenedor del diagrama (o al propio <svg>) a exportar. Si contiene varios <svg>, se exporta solo el primero. */
  targetRef: RefObject<HTMLElement | SVGSVGElement | null>;
  /** Nombre base del archivo, sin extensión. */
  filename?: string;
}

// ─────────────────────────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────────────────────────

export function ExportButton({ targetRef, filename = 'diagrama' }: ExportButtonProps) {
  const [format, setFormat] = useState<'png' | 'svg'>('png');

  function handleExport() {
    const el = targetRef.current;
    if (!el) return;
    const svg: SVGSVGElement | null = el instanceof SVGSVGElement ? el : el.querySelector('svg');
    if (!svg) {
      console.warn('ExportButton: no se encontró un <svg> en el elemento indicado.');
      return;
    }
    exportChartAsImage(svg, format, `${filename}.${format}`);
  }

  return (
    <div className="hgm-style-row">
      <select
        className="hgm-select"
        value={format}
        onChange={e => setFormat(e.target.value as 'png' | 'svg')}
        style={{ flex: '0 0 72px' }}
        title="Formato de exportación"
      >
        <option value="png">PNG</option>
        <option value="svg">SVG</option>
      </select>
      <button type="button" className="hgm-btn-primary" onClick={handleExport}>
        ⬇ Exportar
      </button>
    </div>
  );
}
