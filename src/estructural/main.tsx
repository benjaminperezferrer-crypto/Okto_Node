/**
 * src/estructural/main.tsx
 * Etapa 13 — punto de entrada del módulo Análisis Estructural, mismo
 * patrón exacto que src/gis/main.tsx: monta el componente contenedor en
 * `#root` (ver viewer.html).
 *
 * Etapa 14 — agrega la integración al sistema de Proyectos que la Etapa
 * 13 dejó explícitamente pendiente: mismo patrón imperativo (createRef +
 * wrappers get/loadProjectState + listenForStateRequests) que
 * src/gis/main.tsx y src/hidrogeo/main.tsx.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { listenForStateRequests } from '../projectBridge';
import AnalisisEstructuralModule from './AnalisisEstructuralModule';
import type { AnalisisEstructuralModuleHandle } from './AnalisisEstructuralModule';
import type { AnalisisEstructuralProjectState } from './structuralProjectTypes';

const container = document.getElementById('root');
if (!container) {
  throw new Error('main.tsx: no se encontró el elemento #root en viewer.html.');
}

const moduleRef = React.createRef<AnalisisEstructuralModuleHandle>();
createRoot(container).render(<AnalisisEstructuralModule ref={moduleRef} />);

function getAnalisisEstructuralProjectState(): AnalisisEstructuralProjectState {
  if (!moduleRef.current) throw new Error('getAnalisisEstructuralProjectState: el módulo todavía no montó.');
  return moduleRef.current.getProjectState();
}

function loadAnalisisEstructuralProjectState(state: unknown): void {
  if (!moduleRef.current) throw new Error('loadAnalisisEstructuralProjectState: el módulo todavía no montó.');
  moduleRef.current.loadProjectState(state as AnalisisEstructuralProjectState);
}

listenForStateRequests(getAnalisisEstructuralProjectState, loadAnalisisEstructuralProjectState);
