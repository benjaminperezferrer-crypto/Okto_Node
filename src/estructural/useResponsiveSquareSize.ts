/**
 * src/estructural/useResponsiveSquareSize.ts
 * Etapa de layout responsivo (paquete de mejoras a Análisis Estructural,
 * punto 1) — StereonetPlanes.tsx/RoseDiagram.tsx recibían `size` como un
 * número de píxeles LITERAL, fijo, pasado por AnalisisEstructuralModule.tsx
 * (`size={400}`) — no se adaptaba al ancho real de su columna. Este hook
 * mide el ancho real del elemento referenciado vía `ResizeObserver` y lo
 * devuelve como lado del SVG cuadrado, para que el diagrama ocupe el
 * ancho disponible de su columna (la mitad del contenedor principal,
 * repartido por AnalisisEstructuralModule.tsx) en vez de un tamaño fijo.
 *
 * `fixedSize`: si el llamador pasa un `size` explícito (comportamiento
 * histórico, por si algún consumidor futuro lo necesita fuera de este
 * layout de 2 columnas), el hook NO observa nada y lo devuelve tal cual —
 * mismo comportamiento que antes de esta etapa, sin regresión para ese
 * caso.
 *
 * `useLayoutEffect` (no `useEffect`) para que la primera medición real
 * ocurra ANTES del primer paint visible — evita un parpadeo de "primero
 * se ve al tamaño de fallback, después salta al tamaño real" en el
 * primer render. `ResizeObserver` además garantiza al menos una
 * notificación inicial apenas se llama `.observe()` (spec), así que no
 * hace falta una medición manual por separado.
 *
 * `minSize`: piso de usabilidad — sin esto, en una ventana muy angosta
 * (antes de que el `flexWrap` del contenedor padre haga que las 2
 * columnas se apilen) el diagrama podría reducirse a un tamaño
 * ilegible. AnalisisEstructuralModule.tsx complementa esto con un
 * `minWidth` en CSS en cada columna para que el `flexWrap` entre en
 * juego antes de llegar a este piso en la mayoría de los casos.
 */

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

export function useResponsiveSquareSize(
  fixedSize: number | undefined,
  minSize = 260,
  fallback = 480,
): { ref: RefObject<HTMLDivElement | null>; size: number } {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (fixedSize !== undefined) return; // tamaño explícito — no observar nada.
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setMeasured(Math.max(minSize, Math.floor(w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixedSize, minSize]);

  const size = fixedSize !== undefined ? fixedSize : (measured ?? fallback);
  return { ref, size };
}
