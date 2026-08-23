/**
 * src/estructural/structuralTypes.test.ts
 * Casos verificados A MANO antes de escribirlos (ver derivación completa
 * en el JSDoc de planeRakeToTrendPlunge en structuralTypes.ts).
 */
import { describe, it, expect } from 'vitest';
import {
  strikeDipToDipDirectionDip,
  dipDirectionDipToStrikeDip,
  planeRakeToTrendPlunge,
} from './structuralTypes';

describe('strikeDipToDipDirectionDip / dipDirectionDipToStrikeDip — RHR', () => {
  it('dirección de manteo = rumbo + 90°', () => {
    expect(strikeDipToDipDirectionDip(0, 45)).toEqual({ dipDirection: 90, dip: 45 });
    expect(strikeDipToDipDirectionDip(350, 30)).toEqual({ dipDirection: 80, dip: 30 });
  });

  it('son inversas exactas entre sí', () => {
    const { dipDirection, dip } = strikeDipToDipDirectionDip(123, 47);
    expect(dipDirectionDipToStrikeDip(dipDirection, dip)).toEqual({ strike: 123, dip: 47 });
  });

  it('normaliza a [0,360)', () => {
    expect(strikeDipToDipDirectionDip(300, 10).dipDirection).toBe(30); // 300+90=390 → 30
    expect(dipDirectionDipToStrikeDip(30, 10).strike).toBe(300);       // 30-90=-60 → 300
  });
});

describe('planeRakeToTrendPlunge — casos verificados a mano', () => {
  it('rake=90° SIEMPRE coincide con la dirección de máximo manteo del plano, sin importar rakeDirection (caso pedido explícitamente)', () => {
    const dipDirection = 200, dip = 35;
    // 3 rakeDirection distintas (extremo canónico, extremo opuesto, algo intermedio) — el resultado no debe cambiar.
    for (const rakeDirection of [110 /* dipDirection-90 */, 290 /* dipDirection+90 */, 45]) {
      const { trend, plunge } = planeRakeToTrendPlunge(dipDirection, dip, 90, rakeDirection);
      expect(trend).toBeCloseTo(dipDirection, 6);
      expect(plunge).toBeCloseTo(dip, 6);
    }
  });

  it('rake=0° medido desde el extremo canónico (dipDirection-90) da una línea horizontal a lo largo de ESE extremo del rumbo', () => {
    const dipDirection = 90, dip = 50;
    const canonicalEnd = 0; // dipDirection-90 = 0
    const { trend, plunge } = planeRakeToTrendPlunge(dipDirection, dip, 0, canonicalEnd);
    expect(trend).toBeCloseTo(0, 6);
    expect(plunge).toBeCloseTo(0, 6);
  });

  it('rake=0° medido desde el extremo OPUESTO (dipDirection+90) da la línea horizontal apuntando al otro extremo (180° del anterior)', () => {
    const dipDirection = 90, dip = 50;
    const oppositeEnd = 180; // dipDirection+90 = 180
    const { trend, plunge } = planeRakeToTrendPlunge(dipDirection, dip, 0, oppositeEnd);
    expect(trend).toBeCloseTo(180, 6);
    expect(plunge).toBeCloseTo(0, 6);
  });

  it('rake=180° medido desde el extremo canónico da la horizontal apuntando al extremo opuesto', () => {
    const dipDirection = 90, dip = 50;
    const canonicalEnd = 0;
    const { trend, plunge } = planeRakeToTrendPlunge(dipDirection, dip, 180, canonicalEnd);
    expect(trend).toBeCloseTo(180, 6);
    expect(plunge).toBeCloseTo(0, 6);
  });

  it('plano vertical (dip=90°): rake=90° da plunge=90° sin importar el trend (caso degenerado, no debe tirar NaN)', () => {
    const { plunge } = planeRakeToTrendPlunge(45, 90, 90, 45);
    expect(plunge).toBeCloseTo(90, 6);
  });

  it('rake=45° (caso intermedio) queda a mitad de camino angular entre el rumbo y la línea de máximo manteo — vector unitario válido (sanity check, no un valor "mágico" verificado a mano)', () => {
    const dipDirection = 0, dip = 60;
    const { trend, plunge } = planeRakeToTrendPlunge(dipDirection, dip, 45, 270 /* dipDirection-90 */);
    // El plunge de una línea intermedia siempre queda entre 0 (rumbo) y el dip (línea de máximo manteo).
    expect(plunge).toBeGreaterThan(0);
    expect(plunge).toBeLessThan(dip);
  });
});
