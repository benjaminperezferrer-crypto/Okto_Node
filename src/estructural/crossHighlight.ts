/**
 * src/estructural/crossHighlight.ts
 * Paquete de mejoras de Análisis Estructural — resaltado cruzado entre
 * StereonetPlanes.tsx y RoseDiagram.tsx: hover sobre un dato en un
 * diagrama resalta el sector/dato correspondiente en el otro.
 *
 * ── Por qué NO es estado de React ──────────────────────────────────
 * El hover es una interacción CONTINUA (dispara en cada mouseenter/leave
 * de cada dato individual, potencialmente muchas veces por segundo al
 * mover el cursor sobre un diagrama con ~4000 elementos). Ya establecido
 * en el resto del paquete (useImperativeZoomPan.ts, el debounce de
 * opacidad en StereonetPlanes.tsx): un `setState` en el contenedor común
 * (AnalisisEstructuralModule.tsx) en cada uno de esos eventos volvería a
 * re-renderizar TODO el árbol (~4000 elementos SVG en cada diagrama, el
 * costo ya medido de ~500ms de un re-render completo) en cada tick —
 * inutilizable. En su lugar, este archivo es un bus de eventos plano
 * (pub/sub, sin React) creado UNA VEZ en AnalisisEstructuralModule.tsx
 * (`useRef(createCrossHighlightBus())`) y pasado como prop estable a
 * ambos diagramas: quien nota el hover PUBLICA el nuevo estado; el otro
 * diagrama SUSCRIBE y aplica el resaltado escribiendo clases CSS
 * DIRECTO en los nodos DOM ya renderizados (vía refs, ver StereonetPlanes.tsx/
 * RoseDiagram.tsx) — cero re-render de React de por medio.
 *
 * ── Por qué separado por `kind` ('planar' | 'linear') ────────────────
 * Los sectores angulares de la roseta son COMPARTIDOS entre 2 capas
 * independientes (planos con binning simétrico vs líneas con binning NO
 * simétrico, ver roseBinning.ts) — el mismo índice de bin puede tener un
 * pétalo de planos Y un pétalo de líneas simultáneamente, sin relación
 * geológica entre ambos. Sin este campo, resaltar un polo (dato de
 * plano) terminaría iluminando también el pétalo de líneas de ese mismo
 * sector por pura coincidencia numérica de índice — confuso e incorrecto.
 * `kind` asegura que polos/planos (azimut, binning simétrico) solo
 * crucen con pétalos de PLANOS, y líneas (trend, binning no simétrico)
 * solo con pétalos de LÍNEAS.
 *
 * ── No-op cuando el valor no cambia ──────────────────────────────────
 * `setHighlight()` compara contra el valor actual y no hace NADA (ni
 * notifica) si es igual — mousemove dentro del MISMO dato ya resaltado
 * (p.ej. el handler de tooltip, que sí se dispara por cada pixel) no
 * debe re-disparar el trabajo de resaltado en el otro diagrama.
 */

export type HighlightKind = 'planar' | 'linear';

export interface HighlightState {
  kind: HighlightKind;
  /** Índices de bin angular (roseBinning.ts) a resaltar — 2 para un dato de plano/polo (bin propio + opuesto, binning simétrico), 1 para una línea. */
  bins: number[];
}

export type HighlightListener = (state: HighlightState | null) => void;

export interface CrossHighlightBus {
  setHighlight: (state: HighlightState | null) => void;
  subscribe: (listener: HighlightListener) => () => void;
}

function sameHighlight(a: HighlightState | null, b: HighlightState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.bins.length !== b.bins.length) return false;
  return a.bins.every((v, i) => v === b.bins[i]);
}

/** Crea un bus NUEVO e independiente — un contenedor (AnalisisEstructuralModule.tsx) crea UNO solo por instancia de módulo montada (`useRef`), nunca un singleton global (2 pestañas/instancias del módulo no deben compartir resaltado). */
export function createCrossHighlightBus(): CrossHighlightBus {
  let current: HighlightState | null = null;
  const listeners = new Set<HighlightListener>();
  return {
    setHighlight(state) {
      if (sameHighlight(current, state)) return;
      current = state;
      listeners.forEach((l) => l(state));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
