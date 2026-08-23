/**
 * src/gis/RasterImportButton.tsx
 * Botón + selector de archivos para importar una capa ráster —
 * GeoTIFF (.tif/.tiff) o imagen + world file (.jpg+.jgw, .png+.pgw, +
 * .prj opcional) — usa importGeoTIFF()/importWorldFileImage()
 * (rasterImport.ts, Etapa 7). Mismo patrón que ShapefileImportButton.tsx
 * (Etapa 6): sin estado de capas propio, solo orquesta el import y avisa
 * al padre vía callbacks.
 *
 * Un solo input multi-select: si hay un .tif/.tiff entre los archivos
 * elegidos se interpreta como GeoTIFF; si no, se busca el par
 * imagen+world file.
 */
import React, { useRef, useState } from 'react';
import { importGeoTIFF, importWorldFileImage } from './rasterImport';
import type { GisLayer } from './gisTypes';

const IMPORT_CSS = `
  .gis-raster-import { padding: 0 0 10px; border-bottom: 1px solid rgba(0,244,255,.15); margin-bottom: 4px; }
  .gis-raster-import-btn {
    width: 100%; padding: 6px 10px; font-family: 'Courier New', Courier, monospace;
    font-size: .64rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
    color: var(--hud-cyan); background: rgba(0,244,255,.08); border: 1px solid rgba(0,244,255,.35);
    cursor: pointer; transition: background .15s;
  }
  .gis-raster-import-btn:hover:not(:disabled) { background: rgba(0,244,255,.18); }
  .gis-raster-import-btn:disabled { opacity: .5; cursor: default; }
  .gis-raster-import-error { margin-top: 6px; font-size: .6rem; color: #ff3355; line-height: 1.4; }
  .gis-raster-max-texture { margin-top: 6px; font-size: .6rem; color: var(--hud-text-dim); line-height: 1.4; }
`;

export interface RasterImportButtonProps {
  targetEPSG: string;
  existingLayerCount: number;
  onImported: (layer: GisLayer) => void;
  onWarning: (message: string) => void;
  /**
   * gl.getParameter(gl.MAX_TEXTURE_SIZE) medido en vivo contra el contexto
   * WebGL real de la escena (GisViewport.tsx, mount effect) — null antes
   * de que se mida (primer render) o si la medición falló (sin WebGL, gl
   * no disponible). Se muestra tal cual, sin ningún valor supuesto: si es
   * null, se explica que no se pudo determinar en vez de inventar un
   * número.
   */
  maxTextureSize: number | null;
}

const GEOTIFF_EXTENSIONS = ['tif', 'tiff'];

function extOf(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot === -1 ? '' : file.name.slice(dot + 1).toLowerCase();
}

export function RasterImportButton({
  targetEPSG,
  existingLayerCount,
  onImported,
  onWarning,
  maxTextureSize,
}: RasterImportButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setBusy(true);
    setError(null);
    try {
      const geotiffFile = files.find((f) => GEOTIFF_EXTENSIONS.includes(extOf(f)));
      const { layer, warning } = geotiffFile
        ? await importGeoTIFF(geotiffFile, targetEPSG, existingLayerCount)
        : await importWorldFileImage(files, targetEPSG, existingLayerCount);
      onImported(layer);
      if (warning) onWarning(warning);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="gis-raster-import">
      <style>{IMPORT_CSS}</style>
      <button
        type="button"
        className="gis-raster-import-btn"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Importando…' : '+ Importar ráster'}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".tif,.tiff,.jpg,.jpeg,.png,.jgw,.jpgw,.pgw,.pngw,.wld,.prj"
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="gis-raster-max-texture">
        {maxTextureSize
          ? `Tu GPU soporta texturas de hasta ${maxTextureSize}×${maxTextureSize} px`
          : 'No se pudo determinar el límite de tu GPU.'}
      </div>
      {error && <div className="gis-raster-import-error">{error}</div>}
    </div>
  );
}
