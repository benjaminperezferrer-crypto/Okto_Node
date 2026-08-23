/**
 * src/gis/GeoreferencingTool.tsx
 * Herramienta de georreferenciación manual (Etapa 8) — para un PDF o
 * imagen SIN georreferenciación embebida (mapa escaneado, dibujado a
 * mano, plano). El usuario marca 2+ puntos de control sobre un editor 2D
 * simple (esta pantalla, NO la escena 3D) e ingresa las coordenadas
 * reales de cada uno; con eso se ajusta una transformación (affineFit.ts)
 * y se agrega la imagen como una capa ráster más, reutilizando
 * `buildGeoreferencedRasterLayer` (rasterImport.ts) — que a su vez
 * reutiliza `buildRasterMesh` (gisLayerRender.ts, Etapa 7) para el
 * renderizado 3D real, sin duplicar esa lógica.
 *
 * Se presenta como overlay modal (fixed, cubre el viewport) — es un flujo
 * 2D separado del canvas 3D de GisViewport.tsx, no vive dentro de él.
 */
import React, { useEffect, useRef, useState } from 'react';
import { fitControlPoints, type AffineFitResult } from './affineFit';
import { assertRasterDimensionsWithinLimit, buildGeoreferencedRasterLayer } from './rasterImport';
import { renderPDFFirstPageToCanvas } from './pdfRender';
import type { GisLayer } from './gisTypes';

const TOOL_CSS = `
  .gis-georef-overlay {
    position: fixed; inset: 0; z-index: 100;
    background: rgba(1,5,15,.92); display: flex; align-items: center; justify-content: center;
    font-family: 'Courier New', Courier, monospace; color: var(--hud-text);
  }
  .gis-georef-panel {
    width: min(1100px, 96vw); height: min(720px, 92vh);
    background: rgba(1,15,32,.98); border: 1px solid rgba(0,244,255,.3);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .gis-georef-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; border-bottom: 1px solid rgba(0,244,255,.2);
  }
  .gis-georef-title { font-size: .72rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--hud-cyan); }
  .gis-georef-close { background: none; border: none; color: var(--hud-text-dim); cursor: pointer; font-size: .8rem; }
  .gis-georef-close:hover { color: #ff3355; }
  .gis-georef-body { flex: 1; display: flex; min-height: 0; }
  .gis-georef-canvas-area {
    flex: 1; min-width: 0; overflow: auto; position: relative;
    background: repeating-conic-gradient(#0a1626 0% 25%, #0d1c30 0% 50%) 50% / 20px 20px;
    display: flex; align-items: flex-start; justify-content: center; padding: 10px;
  }
  .gis-georef-canvas-wrap { position: relative; display: inline-block; }
  .gis-georef-canvas-wrap canvas { display: block; max-width: 100%; height: auto; cursor: crosshair; }
  .gis-georef-marker {
    position: absolute; width: 18px; height: 18px; margin: -9px 0 0 -9px;
    border: 2px solid #ffcc00; border-radius: 50%; background: rgba(255,204,0,.15);
    display: flex; align-items: center; justify-content: center;
    font-size: .58rem; font-weight: 700; color: #ffcc00; pointer-events: none;
  }
  .gis-georef-sidebar {
    width: 320px; flex-shrink: 0; border-left: 1px solid rgba(0,244,255,.2);
    padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px;
  }
  .gis-georef-file-btn, .gis-georef-add-btn {
    width: 100%; padding: 7px 10px; font-family: inherit; font-size: .64rem; font-weight: 700;
    letter-spacing: .08em; text-transform: uppercase; color: var(--hud-cyan);
    background: rgba(0,244,255,.08); border: 1px solid rgba(0,244,255,.35); cursor: pointer;
  }
  .gis-georef-file-btn:hover, .gis-georef-add-btn:hover:not(:disabled) { background: rgba(0,244,255,.18); }
  .gis-georef-add-btn:disabled { opacity: .4; cursor: default; }
  .gis-georef-hint { font-size: .6rem; color: var(--hud-text-dim); line-height: 1.5; }
  .gis-georef-point-row {
    border: 1px solid rgba(0,244,255,.15); padding: 6px 8px; display: flex; flex-direction: column; gap: 4px;
  }
  .gis-georef-point-hdr { display: flex; align-items: center; justify-content: space-between; }
  .gis-georef-point-num { font-size: .62rem; font-weight: 700; color: #ffcc00; }
  .gis-georef-point-px { font-size: .56rem; color: var(--hud-text-dim); }
  .gis-georef-point-del { background: none; border: none; color: #ff3355; cursor: pointer; font-size: .6rem; }
  .gis-georef-point-inputs { display: flex; gap: 6px; }
  .gis-georef-point-inputs input {
    flex: 1; min-width: 0; background: rgba(0,15,40,.9); border: 1px solid var(--hud-border);
    color: var(--hud-text); font-family: inherit; font-size: .64rem; padding: 3px 5px; outline: none;
  }
  .gis-georef-result { border: 1px solid rgba(0,244,255,.2); padding: 8px; font-size: .62rem; line-height: 1.6; }
  .gis-georef-result-bad { border-color: rgba(255,51,85,.4); color: #ff3355; }
  .gis-georef-error { color: #ff3355; font-size: .62rem; }
`;

export interface GeoreferencingToolProps {
  targetEPSG: string;
  existingLayerCount: number;
  onImported: (layer: GisLayer) => void;
  onCancel: () => void;
}

interface ControlPointDraft {
  id: number;
  imageX: number;
  imageY: number;
  worldEast: string;
  worldNorth: string;
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

async function renderImageFileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  // ANTES de asignar el canvas (memoria ∝ width*height): una imagen puede
  // declarar dimensiones enormes con un archivo pequeño → OOM/cuelgue.
  try {
    assertRasterDimensionsWithinLimit(bitmap.width, bitmap.height, 'Georreferenciación');
  } catch (err) {
    bitmap.close();
    throw err;
  }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('GeoreferencingTool: no se pudo obtener un contexto 2D de canvas.');
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

let nextPointId = 0;

export function GeoreferencingTool({ targetEPSG, existingLayerCount, onImported, onCancel }: GeoreferencingToolProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [fileName, setFileName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [points, setPoints] = useState<ControlPointDraft[]>([]);

  async function handleFileSelected(file: File | undefined) {
    if (!file) return;
    setLoading(true);
    setError(null);
    setPoints([]);
    try {
      const canvas = isPdfFile(file) ? await renderPDFFirstPageToCanvas(file) : await renderImageFileToCanvas(file);
      sourceCanvasRef.current = canvas;
      setFileName(file.name.replace(/\.[^.]+$/, ''));
      setCanvasReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCanvasReady(false);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // Inserta el <canvas> ya renderizado (PDF o imagen) directamente en el
  // DOM — ya es un canvas real, no hace falta volver a dibujarlo en uno
  // segundo solo para mostrarlo.
  useEffect(() => {
    const wrap = canvasWrapRef.current;
    const canvas = sourceCanvasRef.current;
    if (!wrap || !canvas) return;
    wrap.innerHTML = '';
    wrap.appendChild(canvas);
    return () => {
      if (canvas.parentNode === wrap) wrap.removeChild(canvas);
    };
  }, [canvasReady]);

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    const canvas = sourceCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Convierte la posición del clic (en píxeles CSS mostrados, que puede
    // diferir del tamaño nativo del canvas por el max-width:100%) a
    // coordenadas de píxel NATIVAS de la imagen.
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const imageX = (e.clientX - rect.left) * scaleX;
    const imageY = (e.clientY - rect.top) * scaleY;
    setPoints((prev) => [...prev, { id: nextPointId++, imageX, imageY, worldEast: '', worldNorth: '' }]);
  }

  function updatePoint(id: number, field: 'worldEast' | 'worldNorth', value: string) {
    setPoints((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  }

  function removePoint(id: number) {
    setPoints((prev) => prev.filter((p) => p.id !== id));
  }

  const validPoints = points
    .map((p) => ({ p, east: parseFloat(p.worldEast), north: parseFloat(p.worldNorth) }))
    .filter(({ east, north }) => !Number.isNaN(east) && !Number.isNaN(north))
    .map(({ p, east, north }) => ({ imageX: p.imageX, imageY: p.imageY, worldEast: east, worldNorth: north }));

  let fitResult: AffineFitResult | null = null;
  let fitError: string | null = null;
  if (validPoints.length >= 2) {
    try {
      fitResult = fitControlPoints(validPoints);
    } catch (err) {
      fitError = err instanceof Error ? err.message : String(err);
    }
  }

  function handleAddLayer() {
    const canvas = sourceCanvasRef.current;
    if (!canvas || !fitResult) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('GeoreferencingTool: no se pudo leer los píxeles del canvas para construir la capa.');
      return;
    }
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = new Uint8Array(imageData.data.buffer.slice(0));
    const layer = buildGeoreferencedRasterLayer(
      fileName || 'georreferenciado',
      pixels,
      canvas.width,
      canvas.height,
      fitResult.transform,
      existingLayerCount,
    );
    onImported(layer);
  }

  return (
    <div className="gis-georef-overlay">
      <style>{TOOL_CSS}</style>
      <div className="gis-georef-panel">
        <div className="gis-georef-header">
          <span className="gis-georef-title">Georreferenciación manual</span>
          <button type="button" className="gis-georef-close" onClick={onCancel} title="Cerrar">✕ Cerrar</button>
        </div>

        <div className="gis-georef-body">
          <div className="gis-georef-canvas-area">
            {!canvasReady && (
              <div className="gis-georef-hint" style={{ alignSelf: 'center' }}>
                {loading ? 'Cargando…' : 'Elige un PDF o imagen desde el panel de la derecha para empezar.'}
              </div>
            )}
            {canvasReady && (
              <div className="gis-georef-canvas-wrap" ref={canvasWrapRef} onClick={handleCanvasClick}>
                {sourceCanvasRef.current && points.map((p, idx) => (
                  <div
                    key={p.id}
                    className="gis-georef-marker"
                    style={{
                      left: `${(p.imageX / sourceCanvasRef.current!.width) * 100}%`,
                      top: `${(p.imageY / sourceCanvasRef.current!.height) * 100}%`,
                    }}
                  >
                    {idx + 1}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="gis-georef-sidebar">
            <button type="button" className="gis-georef-file-btn" onClick={() => fileInputRef.current?.click()} disabled={loading}>
              {loading ? 'Cargando…' : '+ Elegir PDF o imagen'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              style={{ display: 'none' }}
              onChange={(e) => handleFileSelected(e.target.files?.[0])}
            />
            {error && <div className="gis-georef-error">{error}</div>}

            {canvasReady && (
              <>
                <div className="gis-georef-hint">
                  Haz clic sobre la imagen para marcar un punto de control, e ingresa sus coordenadas reales (Este/Norte, {targetEPSG}).
                  Con 2 puntos se ajusta escala+rotación (sin cizalla); con 3 o más, una transformación afín completa por mínimos cuadrados
                  — el residuo indica qué tan preciso quedó el ajuste.
                </div>

                {points.map((p, idx) => (
                  <div className="gis-georef-point-row" key={p.id}>
                    <div className="gis-georef-point-hdr">
                      <span className="gis-georef-point-num">Punto {idx + 1}</span>
                      <span className="gis-georef-point-px">px ({p.imageX.toFixed(0)}, {p.imageY.toFixed(0)})</span>
                      <button type="button" className="gis-georef-point-del" onClick={() => removePoint(p.id)} title="Quitar">✕</button>
                    </div>
                    <div className="gis-georef-point-inputs">
                      <input
                        type="number"
                        placeholder="Este"
                        value={p.worldEast}
                        onChange={(e) => updatePoint(p.id, 'worldEast', e.target.value)}
                      />
                      <input
                        type="number"
                        placeholder="Norte"
                        value={p.worldNorth}
                        onChange={(e) => updatePoint(p.id, 'worldNorth', e.target.value)}
                      />
                    </div>
                  </div>
                ))}

                {fitError && <div className="gis-georef-result gis-georef-result-bad">{fitError}</div>}
                {fitResult && !fitError && (
                  <div className="gis-georef-result">
                    Puntos válidos: {validPoints.length}<br />
                    Modelo: {validPoints.length === 2 ? 'similitud (sin cizalla)' : 'afín completa (mínimos cuadrados)'}<br />
                    Error residual (RMS): {fitResult.residualRMS.toFixed(3)} {validPoints.length === 2 ? '(ajuste exacto)' : ''}
                  </div>
                )}

                <button type="button" className="gis-georef-add-btn" disabled={!fitResult} onClick={handleAddLayer}>
                  Agregar como capa
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
