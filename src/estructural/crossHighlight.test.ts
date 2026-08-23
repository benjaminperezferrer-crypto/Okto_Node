/**
 * src/estructural/crossHighlight.test.ts
 * Casos verificados a mano — ver JSDoc de crossHighlight.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { createCrossHighlightBus } from './crossHighlight';

describe('createCrossHighlightBus', () => {
  it('notifica a los suscriptores con el nuevo estado', () => {
    const bus = createCrossHighlightBus();
    const listener = vi.fn();
    bus.subscribe(listener);
    bus.setHighlight({ kind: 'planar', bins: [3, 21] });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ kind: 'planar', bins: [3, 21] });
  });

  it('setHighlight(null) notifica null (limpia el resaltado)', () => {
    const bus = createCrossHighlightBus();
    const listener = vi.fn();
    bus.setHighlight({ kind: 'linear', bins: [5] });
    bus.subscribe(listener);
    bus.setHighlight(null);
    expect(listener).toHaveBeenCalledWith(null);
  });

  it('NO notifica si el nuevo estado es idéntico al actual (mismo kind, mismos bins en el mismo orden) — evita trabajo repetido en cada tick de mousemove sobre el mismo dato', () => {
    const bus = createCrossHighlightBus();
    const listener = vi.fn();
    bus.setHighlight({ kind: 'planar', bins: [3, 21] });
    bus.subscribe(listener);
    bus.setHighlight({ kind: 'planar', bins: [3, 21] }); // mismo valor, objeto NUEVO (no la misma referencia)
    expect(listener).not.toHaveBeenCalled();
  });

  it('SÍ notifica si cambia el kind aunque los bins sean iguales, o si cambia el orden/contenido de bins', () => {
    const bus = createCrossHighlightBus();
    const listener = vi.fn();
    bus.setHighlight({ kind: 'planar', bins: [3] });
    bus.subscribe(listener);
    bus.setHighlight({ kind: 'linear', bins: [3] });
    expect(listener).toHaveBeenCalledTimes(1);
    bus.setHighlight({ kind: 'linear', bins: [3, 4] });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe detiene las notificaciones a ese listener sin afectar a otros', () => {
    const bus = createCrossHighlightBus();
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = bus.subscribe(a);
    bus.subscribe(b);
    unsubA();
    bus.setHighlight({ kind: 'planar', bins: [1] });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('2 buses creados por separado son independientes (no hay estado global compartido)', () => {
    const busA = createCrossHighlightBus();
    const busB = createCrossHighlightBus();
    const listenerB = vi.fn();
    busB.subscribe(listenerB);
    busA.setHighlight({ kind: 'planar', bins: [0] });
    expect(listenerB).not.toHaveBeenCalled();
  });
});
