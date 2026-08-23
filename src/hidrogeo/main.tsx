/**
 * src/hidrogeo/main.tsx
 * Punto de entrada del módulo de Hidrogeoquímica como app standalone,
 * montado dentro de viewer.html (servido vía iframe desde index.html,
 * igual que src/columnas/viewer.html).
 *
 * También registra el puente de Proyectos: a diferencia de QA/QC y
 * Columnas (JS plano, sin build step), este módulo sí tiene pipeline de
 * esbuild, así que importa projectBridge.ts como TypeScript normal en vez
 * de cargar el window.ProjectBridge compilado vía <script src>.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  HydrogeochemistryModule,
  HydrogeochemistryModuleHandle,
} from './HydrogeochemistryModule';
import { listenForStateRequests, listenForChartsRequests } from '../projectBridge';
import type { HidrogeoquimicaProjectState } from '../projectTypes';
import type { PublishedChartData } from '../projectBridge';

const container = document.getElementById('root');
if (!container) {
  throw new Error('main.tsx: no se encontró #root en viewer.html');
}

const hgmRef = React.createRef<HydrogeochemistryModuleHandle>();

createRoot(container).render(
  <HydrogeochemistryModule ref={hgmRef} />,
);

// ── Puente de Proyectos ─────────────────────────────────────────────
// Wrappers finos: el estado real vive en HydrogeochemistryModule (ver
// getProjectState/loadProjectState ahí), esto solo lo conecta con
// projectBridge.ts.

function getHidrogeoquimicaProjectState(): HidrogeoquimicaProjectState {
  if (!hgmRef.current) {
    throw new Error('getHidrogeoquimicaProjectState: el módulo todavía no montó.');
  }
  return hgmRef.current.getProjectState();
}

function loadHidrogeoquimicaProjectState(state: unknown): void {
  if (!hgmRef.current) {
    throw new Error('loadHidrogeoquimicaProjectState: el módulo todavía no montó.');
  }
  hgmRef.current.loadProjectState(state as HidrogeoquimicaProjectState);
}

listenForStateRequests(getHidrogeoquimicaProjectState, loadHidrogeoquimicaProjectState);

// ── Puente de gráficos publicados (Etapa 4, ubicación espacial) ─────
// getPublishedCharts() vive en el handle imperativo (no en
// ProjectState — ver Etapa 3: sin caché, se rasteriza a pedido), así que
// este puente es SEPARADO del de arriba, no una extensión del mismo.

function getHidrogeoquimicaPublishedCharts(): Promise<PublishedChartData[]> {
  if (!hgmRef.current) {
    return Promise.reject(new Error('getHidrogeoquimicaPublishedCharts: el módulo todavía no montó.'));
  }
  return hgmRef.current.getPublishedCharts();
}

listenForChartsRequests(getHidrogeoquimicaPublishedCharts);
