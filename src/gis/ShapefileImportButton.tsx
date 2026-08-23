/**
 * src/gis/ShapefileImportButton.tsx
 * Botón + selector de archivos para importar un shapefile
 * (.shp/.dbf/.prj/.shx/.cpg) como una GisLayer nueva — usa
 * importShapefile() (shapefileImport.ts, Etapa 6). El usuario selecciona
 * los archivos individuales juntos (multi-select del mismo input) — sin
 * soporte de .zip en esta etapa, ver shapefileImport.ts para la razón.
 *
 * Sin estado de capas propio: solo orquesta el import y avisa al padre
 * vía callbacks (`onImported`/`onWarning`) — GisViewport.tsx decide qué
 * hacer con la capa resultante y cómo mostrar el aviso.
 */
import React, { useRef, useState } from 'react';
import { importShapefile } from './shapefileImport';
import type { GisLayer } from './gisTypes';

const IMPORT_CSS = `
  .gis-shp-import { padding: 0 0 10px; border-bottom: 1px solid rgba(0,244,255,.15); margin-bottom: 4px; }
  .gis-shp-import-btn {
    width: 100%; padding: 6px 10px; font-family: 'Courier New', Courier, monospace;
    font-size: .64rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
    color: var(--hud-cyan); background: rgba(0,244,255,.08); border: 1px solid rgba(0,244,255,.35);
    cursor: pointer; transition: background .15s;
  }
  .gis-shp-import-btn:hover:not(:disabled) { background: rgba(0,244,255,.18); }
  .gis-shp-import-btn:disabled { opacity: .5; cursor: default; }
  .gis-shp-import-error {
    margin-top: 6px; font-size: .6rem; color: #ff3355; line-height: 1.4;
  }
`;

export interface ShapefileImportButtonProps {
  targetEPSG: string;
  existingLayerCount: number;
  onImported: (layer: GisLayer) => void;
  onWarning: (message: string) => void;
}

export function ShapefileImportButton({
  targetEPSG,
  existingLayerCount,
  onImported,
  onWarning,
}: ShapefileImportButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const { layer, warning } = await importShapefile(Array.from(fileList), targetEPSG, existingLayerCount);
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
    <div className="gis-shp-import">
      <style>{IMPORT_CSS}</style>
      <button
        type="button"
        className="gis-shp-import-btn"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Importando…' : '+ Importar shapefile'}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".shp,.dbf,.prj,.shx,.cpg"
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && <div className="gis-shp-import-error">{error}</div>}
    </div>
  );
}
