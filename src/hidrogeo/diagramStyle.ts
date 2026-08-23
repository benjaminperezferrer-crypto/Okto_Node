/**
 * src/hidrogeo/diagramStyle.ts
 * Config de estilo editable por el usuario para el diagrama de Piper
 * triangular: color/grosor de contornos (triángulos + rombo) y de las
 * líneas segmentadas internas (compartido entre las 3 figuras — ver
 * decisión de alcance), más forma/tamaño/color de los puntos por GRUPO
 * (mismo agrupamiento que ya usa colorBy en HydrogeochemistryModule).
 *
 * Persistida en localStorage (el módulo de hidrogeoquímica no tiene aún
 * un concepto de "proyecto" propio como columnas/ — localStorage es el
 * mecanismo de persistencia disponible más cercano a eso).
 */

export type PointShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'star';

export const POINT_SHAPES: { value: PointShape; label: string }[] = [
  { value: 'circle',   label: 'Círculo' },
  { value: 'square',   label: 'Cuadrado' },
  { value: 'triangle', label: 'Triángulo' },
  { value: 'diamond',  label: 'Rombo' },
  { value: 'star',     label: 'Estrella' },
];

export interface LineStyle {
  color: string;
  width: number;
}

export interface GroupPointStyle {
  shape: PointShape;
  size: number;
  color: string;
}

export interface PiperStyleSettings {
  outline: LineStyle;
  dashed: LineStyle;
  /** Overrides por grupo (clave = misma etiqueta que produce colorBy/groupOf). Los grupos sin entrada usan los defaults (auto-color de la paleta, círculo, DEFAULT_POINT_SIZE). */
  points: Record<string, GroupPointStyle>;
}

export const DEFAULT_OUTLINE: LineStyle = { color: '#1e293b', width: 1.5 };
export const DEFAULT_DASHED:  LineStyle = { color: '#94a3b8', width: 1 };
export const DEFAULT_POINT_SIZE  = 3.2;
export const DEFAULT_POINT_SHAPE: PointShape = 'circle';

const STORAGE_KEY = 'hgm.piperStyle.v1';

function isPointShape(v: unknown): v is PointShape {
  return typeof v === 'string' && POINT_SHAPES.some(s => s.value === v);
}

/** Lee la config guardada; si no hay nada o está corrupta, devuelve los defaults (nunca lanza). */
export function loadPiperStyle(): PiperStyleSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const points: Record<string, GroupPointStyle> = {};
      if (parsed.points && typeof parsed.points === 'object') {
        for (const [k, v] of Object.entries(parsed.points as Record<string, Partial<GroupPointStyle>>)) {
          if (v && typeof v.color === 'string' && typeof v.size === 'number' && isPointShape(v.shape)) {
            points[k] = { shape: v.shape, size: v.size, color: v.color };
          }
        }
      }
      return {
        outline: { ...DEFAULT_OUTLINE, ...(parsed.outline ?? {}) },
        dashed:  { ...DEFAULT_DASHED,  ...(parsed.dashed  ?? {}) },
        points,
      };
    }
  } catch {
    // localStorage no disponible (SSR/privacidad) o JSON corrupto: usar defaults.
  }
  return { outline: { ...DEFAULT_OUTLINE }, dashed: { ...DEFAULT_DASHED }, points: {} };
}

/** Persiste la config; falla en silencio si localStorage no está disponible o está lleno. */
export function savePiperStyle(settings: PiperStyleSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // No persiste, pero no debe romper la UI por esto.
  }
}
