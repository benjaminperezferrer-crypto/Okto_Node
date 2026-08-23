/**
 * src/hidrogeo/stiffStyle.ts
 * Config de estilo editable por el usuario para la grilla de diagramas de
 * Stiff: color del polígono por GRUPO (mismo agrupamiento que ya usa
 * colorBy/colorMap) y una escala manual opcional que reemplaza el
 * autocálculo compartido entre todas las tarjetas.
 *
 * Etapa 4.5b: `numbersColor`/`numbersFont`/`numbersFontSize` se RETIRARON
 * de acá — `numbersFont`/`numbersFontSize` eran el mismo concepto que
 * `ChartStyleSettings.fontFamily`/`fontSize` (chartStyle.ts), ya
 * identificado como duplicado en la Etapa 4.5a; ahora StiffDiagram.tsx
 * recibe `fontFamily`/`fontSize` directo desde ahí (vía el
 * ChartStyleSettings del diagrama 'stiff' en HydrogeochemistryModule.tsx).
 * `numbersColor` no tiene equivalente en ChartStyleSettings (ese sistema
 * es de "carrocería" — tipografía/grosor/tamaño/grilla/leyenda — no de
 * color; el color queda fuera de su alcance por diseño, ver chartStyle.ts)
 * así que se retira sin reemplazo: el color de "los números" queda fijo en
 * DEFAULT_NUMBERS_COLOR, hardcodeado en StiffDiagram.tsx, dejando de ser
 * editable por el usuario. NUMBERS_FONTS también se retira — la lista de
 * fuentes equivalente y generalizada es FONT_OPTIONS en chartStyle.ts.
 *
 * Persistida en localStorage, mismo mecanismo que diagramStyle.ts.
 */

export interface StiffStyleSettings {
  /** Overrides de color de polígono por grupo (clave = misma etiqueta que produce colorBy/groupOf). */
  polygonColors: Record<string, string>;
  /** Escala manual (± meq/L) que reemplaza el autocálculo; null = autocalcular como hasta ahora. */
  scaleManual: number | null;
}

/** Color fijo de "los números" (etiquetas de eje, valores de escala, leyenda de escala) — ya no editable, ver nota de Etapa 4.5b arriba. */
export const DEFAULT_NUMBERS_COLOR = '#0f172a';

const STORAGE_KEY = 'hgm.stiffStyle.v1';

export function loadStiffStyle(): StiffStyleSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const polygonColors: Record<string, string> = {};
      if (parsed.polygonColors && typeof parsed.polygonColors === 'object') {
        for (const [k, v] of Object.entries(parsed.polygonColors as Record<string, unknown>)) {
          if (typeof v === 'string') polygonColors[k] = v;
        }
      }
      const scaleManual = typeof parsed.scaleManual === 'number' && parsed.scaleManual > 0 ? parsed.scaleManual : null;
      return { polygonColors, scaleManual };
    }
  } catch {
    // localStorage no disponible o JSON corrupto: usar defaults.
  }
  return { polygonColors: {}, scaleManual: null };
}

export function saveStiffStyle(settings: StiffStyleSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // No persiste, pero no debe romper la UI por esto.
  }
}
