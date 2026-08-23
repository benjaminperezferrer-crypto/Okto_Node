/**
 * src/gis/main.tsx
 * Punto de entrada del módulo GIS como app standalone, montado dentro de
 * viewer.html (servido vía iframe desde index.html, igual que
 * src/hidrogeo/main.tsx) — mismo patrón que ese archivo.
 *
 * Puente de Proyectos (Etapa 13): GIS SÍ tiene pipeline de esbuild, así
 * que importa projectBridge.ts como TypeScript normal en vez de cargar el
 * window.ProjectBridge compilado vía <script src> (eso es lo que hacen
 * QA/QC y Columnas, JS plano sin build step).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { GisViewport, GisViewportHandle } from './GisViewport';
import { listenForStateRequests } from '../projectBridge';
import type { GisProjectState } from './gisTypes';

const container = document.getElementById('root');
if (!container) {
  throw new Error('main.tsx: no se encontró #root en viewer.html');
}

const gisRef = React.createRef<GisViewportHandle>();

createRoot(container).render(<GisViewport ref={gisRef} />);

// ── Puente de Proyectos ─────────────────────────────────────────────
// Wrappers finos: el estado real vive en GisViewport (ver
// getProjectState/loadProjectState ahí), esto solo lo conecta con
// projectBridge.ts.

function getGisProjectState(): GisProjectState {
  if (!gisRef.current) {
    throw new Error('getGisProjectState: el módulo todavía no montó.');
  }
  return gisRef.current.getProjectState();
}

function loadGisProjectState(state: unknown): void {
  if (!gisRef.current) {
    throw new Error('loadGisProjectState: el módulo todavía no montó.');
  }
  gisRef.current.loadProjectState(state as GisProjectState);
}

listenForStateRequests(getGisProjectState, loadGisProjectState);
