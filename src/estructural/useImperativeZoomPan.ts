/**
 * src/estructural/useImperativeZoomPan.ts
 * Etapa 2 del paquete de mejoras a Análisis Estructural — zoom (rueda) +
 * arrastre sobre StereonetPlanes/RoseDiagram.
 *
 * ── Por qué imperativo (setAttribute), no estado de React por frame ────
 * El diagnóstico de la etapa anterior midió, con el dataset real (~4000
 * mediciones, Planos+Kamb activos), que UN SOLO re-render de React de
 * estos diagramas cuesta ~500ms. Un wheel/mousemove dispara docenas de
 * eventos por segundo — recalcular posiciones vía estado de React en
 * cada uno sería ~2fps, inutilizable. La solución: el `<g>` que envuelve
 * el contenido del SVG (grilla + datos) recibe su atributo `transform`
 * escrito DIRECTO sobre el nodo DOM (`.setAttribute`), fuera del ciclo de
 * render de React, durante TODA la interacción continua (cada tick de
 * wheel, cada mousemove de un arrastre). React nunca se entera de esos
 * cambios intermedios — es composición GPU pura del navegador,
 * independiente de cuántos nodos SVG haya adentro del `<g>`.
 *
 * React SÍ se sincroniza al final — `setCommittedTransform()` corre en
 * `mouseup` (fin de arrastre) o con un debounce corto tras la última
 * rueda — no para "recalcular geometría" (el transform no cambia ningún
 * dato, solo la vista), sino para que el valor de `transform` que React
 * mantiene en estado (usado como prop `transform` en el JSX, ver
 * StereonetBase.tsx/RoseDiagram.tsx) no quede desincronizado del valor
 * real en el DOM — si el usuario hace zoom y LUEGO activa un toggle de
 * capa (que sí dispara un re-render de React por otro motivo), el `<g>`
 * debe seguir mostrando el zoom actual, no resetearse a identidad porque
 * React "no se enteró".
 *
 * ── Múltiples grupos sincronizados ──────────────────────────────────────
 * `groupRefs` acepta más de un `<g>` (StereonetPlanes.tsx necesita mover
 * JUNTOS el grupo de grilla/borde que dibuja StereonetBase.tsx y el grupo
 * de datos que dibuja el propio StereonetPlanes — dos nodos DOM
 * distintos, mismo transform) — la leyenda y el título NO se pasan acá a
 * propósito, deben quedar fijos (overlay de UI, no parte de "la vista").
 * Los objetos `ref` de React son estables entre renders (no cambian de
 * identidad aunque `.current` sí cambie), así que basta con leerlos
 * dentro del efecto de montaje una sola vez — no hace falta re-suscribir
 * los listeners si el array `groupRefs` se recrea en cada render del
 * llamador.
 */

import { useEffect, useRef, useState } from 'react';

export interface ZoomPanState {
  scale: number;
  tx: number;
  ty: number;
}

const IDENTITY: ZoomPanState = { scale: 1, tx: 0, ty: 0 };

function toTransformString(t: ZoomPanState): string {
  return `translate(${t.tx} ${t.ty}) scale(${t.scale})`;
}

export interface UseImperativeZoomPanOptions {
  minScale?: number;
  maxScale?: number;
  /** Factor de zoom por "muesca" de rueda. Default 1.15 (15% por paso). */
  wheelStep?: number;
  /** Debounce (ms) para sincronizar React tras la ÚLTIMA rueda de una ráfaga — el arrastre sincroniza en `mouseup`, sin esperar este debounce. Default 200. */
  commitDebounceMs?: number;
  /**
   * false desactiva wheel+arrastre por completo (los listeners siguen
   * registrados pero retornan de inmediato) — usado por el modo de
   * selección rectangular de StereonetPlanes.tsx (paquete de mejoras):
   * selección y paneo comparten el mismo gesto mousedown+mousemove+
   * mouseup sobre el mismo `<svg>`, así que no pueden convivir activos
   * simultáneamente sin ambigüedad sobre qué gesto está haciendo el
   * usuario. Default true (comportamiento idéntico a antes de que
   * existiera esta opción).
   */
  enabled?: boolean;
}

export interface UseImperativeZoomPanResult {
  /** Se pasa al `<svg>` — es el elemento que escucha wheel/mousedown (por eso el zoom solo reacciona con el cursor encima, sin tocar el scroll de la página fuera de él). */
  svgRef: React.RefObject<SVGSVGElement | null>;
  /** String `transform` sincronizado — se usa como prop `transform` en el/los `<g>` para que un re-render de React (por otro motivo) no pierda el zoom/pan actual. */
  transformString: string;
  /** true si el zoom/pan no está en la vista original (para habilitar/deshabilitar el botón de reset). */
  isZoomed: boolean;
  /** Vuelve a escala 1, sin desplazamiento — actualiza tanto el DOM (inmediato) como el estado de React. */
  reset: () => void;
}

/**
 * `groupRefs`: los `<g>` cuyo `transform` se actualiza en vivo durante el
 * zoom/arrastre. Deben existir en el DOM cuando el usuario interactúa
 * (no hace falta que existan al montar el hook).
 */
export function useImperativeZoomPan(
  groupRefs: React.RefObject<SVGGElement | null>[],
  options: UseImperativeZoomPanOptions = {},
): UseImperativeZoomPanResult {
  const { minScale = 0.5, maxScale = 10, wheelStep = 1.15, commitDebounceMs = 200, enabled = true } = options;

  const svgRef = useRef<SVGSVGElement>(null);
  const liveRef = useRef<ZoomPanState>(IDENTITY);
  const [committed, setCommitted] = useState<ZoomPanState>(IDENTITY);

  function applyLive(t: ZoomPanState) {
    liveRef.current = t;
    const str = toTransformString(t);
    groupRefs.forEach((r) => r.current?.setAttribute('transform', str));
  }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;

    let commitTimer: number | null = null;
    function scheduleCommit() {
      if (commitTimer !== null) window.clearTimeout(commitTimer);
      commitTimer = window.setTimeout(() => {
        setCommitted(liveRef.current);
        commitTimer = null;
      }, commitDebounceMs);
    }

    function clientToSvgPoint(clientX: number, clientY: number): { x: number; y: number } {
      const svgEl = svg as SVGSVGElement & { createSVGPoint: () => DOMPoint };
      const pt = svgEl.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svgEl.getScreenCTM();
      if (!ctm) return { x: 0, y: 0 };
      const p = pt.matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    }

    function onWheel(e: WheelEvent) {
      if (!enabled) return;
      e.preventDefault(); // el listener vive en el <svg>, así que esto NUNCA bloquea el scroll de la página fuera del diagrama.
      const { x, y } = clientToSvgPoint(e.clientX, e.clientY);
      const t = liveRef.current;
      const factor = e.deltaY < 0 ? wheelStep : 1 / wheelStep;
      const newScale = Math.min(maxScale, Math.max(minScale, t.scale * factor));
      const effectiveFactor = newScale / t.scale; // puede ser 1 si ya se tocó un límite — evita desplazar el centro sin escalar de verdad.
      const newTx = x - (x - t.tx) * effectiveFactor;
      const newTy = y - (y - t.ty) * effectiveFactor;
      applyLive({ scale: newScale, tx: newTx, ty: newTy });
      scheduleCommit();
    }

    let dragging = false;
    let lastClientX = 0;
    let lastClientY = 0;

    function onMouseDown(e: MouseEvent) {
      if (!enabled) return;
      if (e.button !== 0) return; // solo click izquierdo — click derecho/medio quedan libres para lo que el navegador quiera hacer con ellos.
      dragging = true;
      lastClientX = e.clientX;
      lastClientY = e.clientY;
    }
    function onMouseMove(e: MouseEvent) {
      if (!dragging) return;
      const dx = e.clientX - lastClientX;
      const dy = e.clientY - lastClientY;
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      const t = liveRef.current;
      applyLive({ scale: t.scale, tx: t.tx + dx, ty: t.ty + dy });
    }
    function onMouseUp() {
      if (!dragging) return;
      dragging = false;
      if (commitTimer !== null) { window.clearTimeout(commitTimer); commitTimer = null; }
      setCommitted(liveRef.current); // commit inmediato al soltar — sin esperar el debounce de la rueda.
    }

    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('mousedown', onMouseDown);
    // mousemove/mouseup en window (no en el <svg>): un arrastre ya iniciado debe seguir
    // funcionando aunque el cursor salga momentáneamente del diagrama — patrón estándar de drag.
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (commitTimer !== null) window.clearTimeout(commitTimer);
    };
    // groupRefs deliberadamente fuera de deps: son objetos `ref` estables
    // (useRef nunca cambia de identidad), así que un array nuevo en cada
    // render del llamador no invalida esta suscripción — ver JSDoc de archivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minScale, maxScale, wheelStep, commitDebounceMs, enabled]);

  function reset() {
    applyLive(IDENTITY);
    setCommitted(IDENTITY);
  }

  const isZoomed = committed.scale !== 1 || committed.tx !== 0 || committed.ty !== 0;

  return { svgRef, transformString: toTransformString(committed), isZoomed, reset };
}
