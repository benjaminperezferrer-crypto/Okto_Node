/**
 * src/hidrogeo/logScale.ts
 * Mapeo de escala logarítmica (valor → posición Y en píxeles), usado por
 * SchoellerDiagram.tsx.
 */

/** Evita log(0) / log(negativo): todo valor se acota a este mínimo antes de escalar. */
export const LOG_EPSILON = 0.01;

/**
 * Rango [min, max] auto-escalado para un eje log — mismo criterio que
 * schoeller.py de WQChartPy: 0.5× el mínimo real, 1.5× el máximo real.
 */
export function autoLogRange(values: number[]): { min: number; max: number } {
  const clamped = values.map(v => Math.max(v, LOG_EPSILON));
  return {
    min: Math.min(...clamped) * 0.5,
    max: Math.max(...clamped) * 1.5,
  };
}

/** value → y de pantalla en escala log; yTop = extremo `max`, yBot = extremo `min`. */
export function logY(value: number, min: number, max: number, yTop: number, yBot: number): number {
  const v = Math.max(value, LOG_EPSILON);
  const t = (Math.log10(v) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
  return yBot + (yTop - yBot) * t;
}

/** Potencias de 10 dentro de [min, max] — usadas como ticks del eje. */
export function logDecadeTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  for (let p = lo; p <= hi; p++) {
    const v = Math.pow(10, p);
    if (v >= min && v <= max) ticks.push(v);
  }
  return ticks;
}

/**
 * Marcas menores (2×, 3×, …, 9× de cada década) dentro de [min, max] — sin
 * etiqueta, solo la marquita corta característica del "papel milimetrado
 * logarítmico". Usado por SchoellerBerkaloffDiagram.tsx (Etapa 8) para
 * calzar con el estilo de la figura de referencia.
 */
export function logMinorTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  for (let p = lo; p <= hi; p++) {
    const decade = Math.pow(10, p);
    for (let m = 2; m <= 9; m++) {
      const v = decade * m;
      if (v >= min && v <= max) ticks.push(v);
    }
  }
  return ticks;
}
