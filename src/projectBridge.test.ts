// @vitest-environment jsdom
/**
 * src/projectBridge.test.ts
 * Pruebas del protocolo de mensajería (src/projectBridge.ts) sin depender
 * de un navegador real ni de un <iframe> genuino.
 *
 * Enfoque: en vez de un iframe real, se usan objetos "stand-in" de ventana
 * (objetos planos con un postMessage espía) y se despachan MessageEvent
 * sintéticos en el `window` real de jsdom, con `source` seteado
 * explícitamente a ese objeto exacto. Esto es fiel al mecanismo real que
 * se está probando: desde el fix de la Etapa "doble clic + file://", toda
 * la autenticación del puente es por identidad de `event.source` (no por
 * string de origin) — comparar `===` contra un objeto stand-in ejercita
 * exactamente esa misma comparación que corre en producción.
 *
 * Se verificó empíricamente (no se asumió) que jsdom preserva un objeto
 * arbitrario como event.source a través de `new MessageEvent(...)` +
 * `window.dispatchEvent(...)`, y que `window.parent === window` a nivel
 * top-level — ambos requisitos para que este enfoque sea válido. Sin esa
 * verificación, este archivo habría reportado la limitación en vez de
 * escribir un mock que no represente el comportamiento real.
 *
 * listenForStateRequests() registra un listener permanente en `window`
 * (por diseño — en producción vive todo el ciclo de vida del iframe). Como
 * jsdom reutiliza un único `window` para todos los tests de este archivo,
 * cada listener se rastrea y se remueve en afterEach para que un test no
 * reciba mensajes dirigidos a otro.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
// Extensión .ts explícita a propósito: src/projectBridge.js (el bundle
// IIFE compilado para <script src>, sin exports ESM/CJS) vive al lado de
// este archivo, y el resolver de Vite prueba .js antes que .ts para un
// import sin extensión — sin esto, './projectBridge' resuelve en
// silencio al bundle compilado y cada import queda `undefined`.
import {
  requestStateFromFrame,
  listenForStateRequests,
  requestCollarsFromParent,
  listenForCollarsRequests,
  requestSurveysFromParent,
  listenForSurveysRequests,
  requestStructuresFromParent,
  listenForStructuresRequests,
  requestModuleStateFromParent,
  listenForModuleStateRelayRequests,
  PROJECT_GET_STATE_REQUEST,
  PROJECT_GET_STATE_RESPONSE,
  PROJECT_GET_STATE_ERROR,
  PROJECT_LOAD_STATE,
  PROJECT_GET_COLLARS_REQUEST,
  PROJECT_GET_COLLARS_RESPONSE,
  PROJECT_GET_COLLARS_ERROR,
  PROJECT_GET_SURVEYS_REQUEST,
  PROJECT_GET_SURVEYS_RESPONSE,
  PROJECT_GET_SURVEYS_ERROR,
  PROJECT_GET_STRUCTURES_REQUEST,
  PROJECT_GET_STRUCTURES_RESPONSE,
  PROJECT_GET_STRUCTURES_ERROR,
  PROJECT_RELAY_STATE_REQUEST,
  PROJECT_RELAY_STATE_RESPONSE,
  PROJECT_RELAY_STATE_ERROR,
  type QaqcCollarPoint,
  type QaqcSurveyStation,
  type QaqcStructurePoint,
  type QaqcStructuralFileRef,
} from './projectBridge.ts';

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

function fakeWindow(label: string) {
  return { postMessage: vi.fn(), label } as unknown as Window & { postMessage: ReturnType<typeof vi.fn> };
}

function fakeFrame(win: Window): HTMLIFrameElement {
  return { contentWindow: win } as unknown as HTMLIFrameElement;
}

function dispatchMessage(source: unknown, data: unknown) {
  window.dispatchEvent(new MessageEvent('message', { data, source: source as any }));
}

/** requestId que el padre generó para la última llamada a postMessage de esa ventana falsa. */
function lastSentRequestId(win: { postMessage: ReturnType<typeof vi.fn> }): string {
  const calls = win.postMessage.mock.calls;
  const call = calls[calls.length - 1];
  return (call?.[0] as { requestId: string }).requestId;
}

// listenForStateRequests no expone forma de desregistrarse (a propósito —
// en producción vive todo el ciclo de vida del iframe). Para tests, se
// captura el handler real vía spy sobre addEventListener y se remueve en
// afterEach, así un test no sigue recibiendo mensajes de otro.
let trackedHandlers: Array<EventListenerOrEventListenerObject> = [];

function listenForStateRequestsTracked(
  getState: () => unknown,
  onLoadState: (state: unknown) => void,
): void {
  const addSpy = vi.spyOn(window, 'addEventListener');
  listenForStateRequests(getState, onLoadState);
  const call = addSpy.mock.calls.find(([type]) => type === 'message');
  addSpy.mockRestore();
  if (call) trackedHandlers.push(call[1] as EventListenerOrEventListenerObject);
}

afterEach(() => {
  for (const h of trackedHandlers) window.removeEventListener('message', h);
  trackedHandlers = [];
  vi.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────
// requestStateFromFrame
// ─────────────────────────────────────────────────────────────────

describe('requestStateFromFrame', () => {
  it('resuelve con el estado cuando llega PROJECT_GET_STATE_RESPONSE con el requestId correcto', async () => {
    const child = fakeWindow('child-ok');
    const promise = requestStateFromFrame(fakeFrame(child), 1000);
    const requestId = lastSentRequestId(child);

    dispatchMessage(child, { type: PROJECT_GET_STATE_RESPONSE, requestId, state: { hello: 'mundo' } });

    await expect(promise).resolves.toEqual({ hello: 'mundo' });
  });

  it('rechaza con el mensaje real cuando llega PROJECT_GET_STATE_ERROR', async () => {
    const child = fakeWindow('child-error');
    const promise = requestStateFromFrame(fakeFrame(child), 1000);
    const requestId = lastSentRequestId(child);

    dispatchMessage(child, { type: PROJECT_GET_STATE_ERROR, requestId, message: 'boom real del módulo' });

    await expect(promise).rejects.toThrow(/el módulo no pudo generar su estado: boom real del módulo/);
  });

  it('rechaza por timeout cuando no llega ninguna respuesta dentro del plazo', async () => {
    vi.useFakeTimers();
    const child = fakeWindow('child-timeout');
    const promise = requestStateFromFrame(fakeFrame(child), 50);

    const assertion = expect(promise).rejects.toThrow(/timeout \(50ms\)/);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
  });
});

// ─────────────────────────────────────────────────────────────────
// Aislamiento por correlación de requestId
// ─────────────────────────────────────────────────────────────────

describe('requestStateFromFrame — aislamiento entre solicitudes concurrentes', () => {
  it('dos solicitudes a ventanas distintas no mezclan sus respuestas, ni con un cruce deliberado', async () => {
    const childA = fakeWindow('child-A');
    const childB = fakeWindow('child-B');

    const promiseA = requestStateFromFrame(fakeFrame(childA), 1000);
    const promiseB = requestStateFromFrame(fakeFrame(childB), 1000);

    const requestIdA = lastSentRequestId(childA);
    const requestIdB = lastSentRequestId(childB);
    expect(requestIdA).not.toBe(requestIdB);

    // Intento de cruce: source de B pero requestId de A — no debe resolver
    // ninguna de las dos promesas (ni por source, ni por id).
    dispatchMessage(childB, { type: PROJECT_GET_STATE_RESPONSE, requestId: requestIdA, state: 'nunca-deberia-llegar' });

    // Respuestas correctas, cada una a su propia ventana/id.
    dispatchMessage(childA, { type: PROJECT_GET_STATE_RESPONSE, requestId: requestIdA, state: 'estado-A' });
    dispatchMessage(childB, { type: PROJECT_GET_STATE_RESPONSE, requestId: requestIdB, state: 'estado-B' });

    await expect(promiseA).resolves.toBe('estado-A');
    await expect(promiseB).resolves.toBe('estado-B');
  });
});

// ─────────────────────────────────────────────────────────────────
// listenForStateRequests
// ─────────────────────────────────────────────────────────────────

describe('listenForStateRequests', () => {
  it('responde PROJECT_GET_STATE_RESPONSE llamando a getState()', () => {
    const getState = vi.fn(() => ({ foo: 'bar' }));
    const onLoadState = vi.fn();
    listenForStateRequestsTracked(getState, onLoadState);

    // Desde la perspectiva de listenForStateRequests() (lado iframe), el
    // único source legítimo es window.parent — que en jsdom top-level es
    // window mismo (ver nota al tope del archivo). Un objeto stand-in
    // aparte, aunque bien formado, sería correctamente ignorado por el
    // chequeo de autenticación (ver describe "Autenticación por event.source").
    const postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    dispatchMessage(window, { type: PROJECT_GET_STATE_REQUEST, requestId: 'req-1' });

    expect(getState).toHaveBeenCalledTimes(1);
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: PROJECT_GET_STATE_RESPONSE, requestId: 'req-1', state: { foo: 'bar' } },
      '*',
    );
    postMessageSpy.mockRestore();
  });

  it('si getState() lanza, responde PROJECT_GET_STATE_ERROR en vez de dejar la excepción sin capturar', () => {
    const getState = vi.fn(() => {
      throw new Error('fallo real de getState');
    });
    const onLoadState = vi.fn();
    listenForStateRequestsTracked(getState, onLoadState);

    const postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    // Sin el try/catch de listenForStateRequests(), esta llamada nunca
    // enviaría ninguna respuesta — el padre solo vería un timeout
    // genérico. Verificar que SÍ llega una respuesta ERROR con el mensaje
    // real prueba directamente que la excepción quedó contenida.
    dispatchMessage(window, { type: PROJECT_GET_STATE_REQUEST, requestId: 'req-2' });

    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: PROJECT_GET_STATE_ERROR, requestId: 'req-2', message: 'fallo real de getState' },
      '*',
    );
    postMessageSpy.mockRestore();
  });

  it('llama a onLoadState() al recibir PROJECT_LOAD_STATE', () => {
    const getState = vi.fn();
    const onLoadState = vi.fn();
    listenForStateRequestsTracked(getState, onLoadState);

    dispatchMessage(window, { type: PROJECT_LOAD_STATE, state: { restaurado: true } });

    expect(onLoadState).toHaveBeenCalledWith({ restaurado: true });
  });

  it('contiene una excepción de onLoadState() sin propagarla, y el listener sigue funcionando después', () => {
    const getState = vi.fn(() => ({ still: 'alive' }));
    const onLoadState = vi.fn(() => {
      throw new Error('fallo real de onLoadState');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    listenForStateRequestsTracked(getState, onLoadState);

    expect(() => {
      dispatchMessage(window, { type: PROJECT_LOAD_STATE, state: { x: 1 } });
    }).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('onLoadState() lanzó una excepción'),
      expect.any(Error),
    );

    // El listener no debe haber quedado roto por la excepción contenida —
    // sigue respondiendo normalmente a un mensaje distinto después.
    const postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    dispatchMessage(window, { type: PROJECT_GET_STATE_REQUEST, requestId: 'req-3' });
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: PROJECT_GET_STATE_RESPONSE, requestId: 'req-3', state: { still: 'alive' } },
      '*',
    );

    postMessageSpy.mockRestore();
    consoleError.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────
// Autenticación por event.source (no por string de origin)
// ─────────────────────────────────────────────────────────────────

describe('Autenticación por event.source', () => {
  it('requestStateFromFrame ignora una respuesta con requestId correcto pero source distinto al esperado', async () => {
    const child = fakeWindow('child-real');
    const impostor = fakeWindow('child-impostor');
    const promise = requestStateFromFrame(fakeFrame(child), 1000);
    const requestId = lastSentRequestId(child);

    // Mismo type, mismo requestId — pero source equivocado.
    dispatchMessage(impostor, { type: PROJECT_GET_STATE_RESPONSE, requestId, state: 'no-deberia-resolver' });

    // La respuesta legítima, con el source correcto, sí debe resolver —
    // prueba que el mensaje impostor fue ignorado, no que quedó "primero en la cola".
    dispatchMessage(child, { type: PROJECT_GET_STATE_RESPONSE, requestId, state: 'estado-legitimo' });

    await expect(promise).resolves.toBe('estado-legitimo');
  });

  it('listenForStateRequests ignora un PROJECT_GET_STATE_REQUEST con type correcto pero source distinto de window.parent', () => {
    const getState = vi.fn(() => ({ foo: 'bar' }));
    const onLoadState = vi.fn();
    listenForStateRequestsTracked(getState, onLoadState);

    const impostor = fakeWindow('not-the-parent');
    dispatchMessage(impostor, { type: PROJECT_GET_STATE_REQUEST, requestId: 'req-impostor' });

    expect(getState).not.toHaveBeenCalled();
    expect(impostor.postMessage).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────
// requestCollarsFromParent / listenForCollarsRequests (Etapa 9, GIS) —
// mismo mecanismo que requestStateFromFrame/listenForStateRequests, pero
// en el sentido inverso (iframe → raíz). requestCollarsFromParent apunta
// siempre a window.parent, así que estos tests redefinen esa propiedad
// (verificado empíricamente que jsdom la deja reconfigurar) en vez de
// depender de un window.parent real distinto de window, que no existe a
// nivel top-level (ver nota general al tope del archivo).
// ─────────────────────────────────────────────────────────────────

const ORIGINAL_WINDOW_PARENT_DESCRIPTOR = Object.getOwnPropertyDescriptor(window, 'parent');

function setWindowParent(win: unknown): void {
  Object.defineProperty(window, 'parent', { value: win, configurable: true });
}

function restoreWindowParent(): void {
  if (ORIGINAL_WINDOW_PARENT_DESCRIPTOR) {
    Object.defineProperty(window, 'parent', ORIGINAL_WINDOW_PARENT_DESCRIPTOR);
  }
}

function listenForCollarsRequestsTracked(
  frame: HTMLIFrameElement,
  getCollars: () => QaqcCollarPoint[],
): void {
  const addSpy = vi.spyOn(window, 'addEventListener');
  listenForCollarsRequests(frame, getCollars);
  const call = addSpy.mock.calls.find(([type]) => type === 'message');
  addSpy.mockRestore();
  if (call) trackedHandlers.push(call[1] as EventListenerOrEventListenerObject);
}

const SAMPLE_COLLARS: QaqcCollarPoint[] = [
  { dhid: 'DDH-01', este: 500010, norte: 7500020, cota: 1005, sourceFileId: 1, sourceFileName: 'collars.xlsx' },
];

describe('requestCollarsFromParent', () => {
  afterEach(() => {
    restoreWindowParent();
  });

  it('rechaza de inmediato si window.parent === window (no corre dentro de un iframe)', async () => {
    // Sin setWindowParent: en jsdom top-level, window.parent === window por defecto.
    await expect(requestCollarsFromParent(1000)).rejects.toThrow(/no corre dentro de un iframe/);
  });

  it('resuelve con los collars cuando llega PROJECT_GET_COLLARS_RESPONSE con el requestId correcto', async () => {
    const parent = fakeWindow('root-ok');
    setWindowParent(parent);

    const promise = requestCollarsFromParent(1000);
    const requestId = lastSentRequestId(parent);

    dispatchMessage(parent, { type: PROJECT_GET_COLLARS_RESPONSE, requestId, collars: SAMPLE_COLLARS });

    await expect(promise).resolves.toEqual(SAMPLE_COLLARS);
  });

  it('rechaza con el mensaje real cuando llega PROJECT_GET_COLLARS_ERROR', async () => {
    const parent = fakeWindow('root-error');
    setWindowParent(parent);

    const promise = requestCollarsFromParent(1000);
    const requestId = lastSentRequestId(parent);

    dispatchMessage(parent, { type: PROJECT_GET_COLLARS_ERROR, requestId, message: 'boom real de getQaqcCollars' });

    await expect(promise).rejects.toThrow(/la ventana raíz no pudo generar los collars: boom real de getQaqcCollars/);
  });

  it('rechaza por timeout cuando no llega ninguna respuesta dentro del plazo', async () => {
    vi.useFakeTimers();
    const parent = fakeWindow('root-timeout');
    setWindowParent(parent);

    const promise = requestCollarsFromParent(50);
    const assertion = expect(promise).rejects.toThrow(/timeout \(50ms\)/);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
  });

  it('ignora una respuesta con requestId correcto pero source distinto de window.parent', async () => {
    const parent = fakeWindow('root-real');
    const impostor = fakeWindow('root-impostor');
    setWindowParent(parent);

    const promise = requestCollarsFromParent(1000);
    const requestId = lastSentRequestId(parent);

    dispatchMessage(impostor, { type: PROJECT_GET_COLLARS_RESPONSE, requestId, collars: [] });
    dispatchMessage(parent, { type: PROJECT_GET_COLLARS_RESPONSE, requestId, collars: SAMPLE_COLLARS });

    await expect(promise).resolves.toEqual(SAMPLE_COLLARS);
  });
});

describe('listenForCollarsRequests', () => {
  it('responde PROJECT_GET_COLLARS_RESPONSE llamando a getCollars() cuando el mensaje viene del frame registrado', () => {
    const gisWindow = fakeWindow('gis-frame-window');
    const getCollars = vi.fn(() => SAMPLE_COLLARS);
    listenForCollarsRequestsTracked(fakeFrame(gisWindow), getCollars);

    dispatchMessage(gisWindow, { type: PROJECT_GET_COLLARS_REQUEST, requestId: 'req-collars-1' });

    expect(getCollars).toHaveBeenCalledTimes(1);
    expect(gisWindow.postMessage).toHaveBeenCalledWith(
      { type: PROJECT_GET_COLLARS_RESPONSE, requestId: 'req-collars-1', collars: SAMPLE_COLLARS },
      '*',
    );
  });

  it('ignora un PROJECT_GET_COLLARS_REQUEST proveniente de un iframe distinto al registrado', () => {
    const gisWindow = fakeWindow('gis-frame-window-2');
    const otherWindow = fakeWindow('columnas-frame-window');
    const getCollars = vi.fn(() => SAMPLE_COLLARS);
    listenForCollarsRequestsTracked(fakeFrame(gisWindow), getCollars);

    dispatchMessage(otherWindow, { type: PROJECT_GET_COLLARS_REQUEST, requestId: 'req-collars-2' });

    expect(getCollars).not.toHaveBeenCalled();
    expect(otherWindow.postMessage).not.toHaveBeenCalled();
  });

  it('si getCollars() lanza, responde PROJECT_GET_COLLARS_ERROR en vez de dejar la excepción sin capturar', () => {
    const gisWindow = fakeWindow('gis-frame-window-3');
    const getCollars = vi.fn(() => {
      throw new Error('fallo real de getQaqcCollars');
    });
    listenForCollarsRequestsTracked(fakeFrame(gisWindow), getCollars);

    dispatchMessage(gisWindow, { type: PROJECT_GET_COLLARS_REQUEST, requestId: 'req-collars-3' });

    expect(gisWindow.postMessage).toHaveBeenCalledWith(
      { type: PROJECT_GET_COLLARS_ERROR, requestId: 'req-collars-3', message: 'fallo real de getQaqcCollars' },
      '*',
    );
  });
});

// ─────────────────────────────────────────────────────────────────
// requestSurveysFromParent / listenForSurveysRequests (Etapa 10, GIS) —
// mismo mecanismo que el par de collars de arriba, mismos helpers.
// ─────────────────────────────────────────────────────────────────

function listenForSurveysRequestsTracked(
  frame: HTMLIFrameElement,
  getSurveys: () => QaqcSurveyStation[],
): void {
  const addSpy = vi.spyOn(window, 'addEventListener');
  listenForSurveysRequests(frame, getSurveys);
  const call = addSpy.mock.calls.find(([type]) => type === 'message');
  addSpy.mockRestore();
  if (call) trackedHandlers.push(call[1] as EventListenerOrEventListenerObject);
}

const SAMPLE_SURVEYS: QaqcSurveyStation[] = [
  { dhid: 'DDH-01', depth: 0, azimuthDeg: 10, dipDeg: -88, sourceFileId: 2, sourceFileName: 'surveys.xlsx' },
  { dhid: 'DDH-01', depth: 100, azimuthDeg: 45, dipDeg: -60, sourceFileId: 2, sourceFileName: 'surveys.xlsx' },
];

describe('requestSurveysFromParent', () => {
  afterEach(() => {
    restoreWindowParent();
  });

  it('rechaza de inmediato si window.parent === window (no corre dentro de un iframe)', async () => {
    await expect(requestSurveysFromParent(1000)).rejects.toThrow(/no corre dentro de un iframe/);
  });

  it('resuelve con las estaciones cuando llega PROJECT_GET_SURVEYS_RESPONSE con el requestId correcto', async () => {
    const parent = fakeWindow('root-surveys-ok');
    setWindowParent(parent);

    const promise = requestSurveysFromParent(1000);
    const requestId = lastSentRequestId(parent);

    dispatchMessage(parent, { type: PROJECT_GET_SURVEYS_RESPONSE, requestId, surveys: SAMPLE_SURVEYS });

    await expect(promise).resolves.toEqual(SAMPLE_SURVEYS);
  });

  it('rechaza con el mensaje real cuando llega PROJECT_GET_SURVEYS_ERROR', async () => {
    const parent = fakeWindow('root-surveys-error');
    setWindowParent(parent);

    const promise = requestSurveysFromParent(1000);
    const requestId = lastSentRequestId(parent);

    dispatchMessage(parent, { type: PROJECT_GET_SURVEYS_ERROR, requestId, message: 'boom real de getQaqcSurveys' });

    await expect(promise).rejects.toThrow(/la ventana raíz no pudo generar las estaciones: boom real de getQaqcSurveys/);
  });

  it('rechaza por timeout cuando no llega ninguna respuesta dentro del plazo', async () => {
    vi.useFakeTimers();
    const parent = fakeWindow('root-surveys-timeout');
    setWindowParent(parent);

    const promise = requestSurveysFromParent(50);
    const assertion = expect(promise).rejects.toThrow(/timeout \(50ms\)/);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
  });
});

describe('listenForSurveysRequests', () => {
  it('responde PROJECT_GET_SURVEYS_RESPONSE llamando a getSurveys() cuando el mensaje viene del frame registrado', () => {
    const gisWindow = fakeWindow('gis-frame-window-surveys');
    const getSurveys = vi.fn(() => SAMPLE_SURVEYS);
    listenForSurveysRequestsTracked(fakeFrame(gisWindow), getSurveys);

    dispatchMessage(gisWindow, { type: PROJECT_GET_SURVEYS_REQUEST, requestId: 'req-surveys-1' });

    expect(getSurveys).toHaveBeenCalledTimes(1);
    expect(gisWindow.postMessage).toHaveBeenCalledWith(
      { type: PROJECT_GET_SURVEYS_RESPONSE, requestId: 'req-surveys-1', surveys: SAMPLE_SURVEYS },
      '*',
    );
  });

  it('ignora un PROJECT_GET_SURVEYS_REQUEST proveniente de un iframe distinto al registrado', () => {
    const gisWindow = fakeWindow('gis-frame-window-surveys-2');
    const otherWindow = fakeWindow('columnas-frame-window-2');
    const getSurveys = vi.fn(() => SAMPLE_SURVEYS);
    listenForSurveysRequestsTracked(fakeFrame(gisWindow), getSurveys);

    dispatchMessage(otherWindow, { type: PROJECT_GET_SURVEYS_REQUEST, requestId: 'req-surveys-2' });

    expect(getSurveys).not.toHaveBeenCalled();
    expect(otherWindow.postMessage).not.toHaveBeenCalled();
  });

  it('si getSurveys() lanza, responde PROJECT_GET_SURVEYS_ERROR en vez de dejar la excepción sin capturar', () => {
    const gisWindow = fakeWindow('gis-frame-window-surveys-3');
    const getSurveys = vi.fn(() => {
      throw new Error('fallo real de getQaqcSurveys');
    });
    listenForSurveysRequestsTracked(fakeFrame(gisWindow), getSurveys);

    dispatchMessage(gisWindow, { type: PROJECT_GET_SURVEYS_REQUEST, requestId: 'req-surveys-3' });

    expect(gisWindow.postMessage).toHaveBeenCalledWith(
      { type: PROJECT_GET_SURVEYS_ERROR, requestId: 'req-surveys-3', message: 'fallo real de getQaqcSurveys' },
      '*',
    );
  });
});

// ─────────────────────────────────────────────────────────────────
// requestStructuresFromParent / listenForStructuresRequests (Etapa 12,
// Análisis Estructural) — mismo mecanismo que collars/surveys de arriba,
// mismos helpers.
// ─────────────────────────────────────────────────────────────────

function listenForStructuresRequestsTracked(
  frame: HTMLIFrameElement,
  getStructuresData: () => { structures: QaqcStructurePoint[]; structuralFileIds: QaqcStructuralFileRef[] },
): void {
  const addSpy = vi.spyOn(window, 'addEventListener');
  listenForStructuresRequests(frame, getStructuresData);
  const call = addSpy.mock.calls.find(([type]) => type === 'message');
  addSpy.mockRestore();
  if (call) trackedHandlers.push(call[1] as EventListenerOrEventListenerObject);
}

const SAMPLE_STRUCTURES: QaqcStructurePoint[] = [
  {
    id: 'E1', este: 500100, norte: 7200100, cota: 350, tipo: 'Falla', azimut: 40, dip: 60,
    rake: 90, direccionRake: 'NE', cinemática: 'normal', observaciones: 'Falla principal',
    otros: {}, sourceFileId: 3, sourceFileName: 'estructuras.csv',
  },
];

const SAMPLE_STRUCTURAL_FILE_IDS: QaqcStructuralFileRef[] = [{ id: 3, name: 'estructuras.csv' }];

describe('requestStructuresFromParent', () => {
  afterEach(() => {
    restoreWindowParent();
  });

  it('rechaza de inmediato si window.parent === window (no corre dentro de un iframe)', async () => {
    await expect(requestStructuresFromParent(1000)).rejects.toThrow(/no corre dentro de un iframe/);
  });

  it('resuelve con las estructuras y la lista completa de archivos cuando llega PROJECT_GET_STRUCTURES_RESPONSE con el requestId correcto', async () => {
    const parent = fakeWindow('root-structures-ok');
    setWindowParent(parent);

    const promise = requestStructuresFromParent(1000);
    const requestId = lastSentRequestId(parent);

    dispatchMessage(parent, {
      type: PROJECT_GET_STRUCTURES_RESPONSE, requestId,
      structures: SAMPLE_STRUCTURES, structuralFileIds: SAMPLE_STRUCTURAL_FILE_IDS,
    });

    await expect(promise).resolves.toEqual({ structures: SAMPLE_STRUCTURES, structuralFileIds: SAMPLE_STRUCTURAL_FILE_IDS });
  });

  it('rechaza con el mensaje real cuando llega PROJECT_GET_STRUCTURES_ERROR', async () => {
    const parent = fakeWindow('root-structures-error');
    setWindowParent(parent);

    const promise = requestStructuresFromParent(1000);
    const requestId = lastSentRequestId(parent);

    dispatchMessage(parent, { type: PROJECT_GET_STRUCTURES_ERROR, requestId, message: 'boom real de getQaqcStructures' });

    await expect(promise).rejects.toThrow(/la ventana raíz no pudo generar las estructuras: boom real de getQaqcStructures/);
  });

  it('rechaza por timeout cuando no llega ninguna respuesta dentro del plazo', async () => {
    vi.useFakeTimers();
    const parent = fakeWindow('root-structures-timeout');
    setWindowParent(parent);

    const promise = requestStructuresFromParent(50);
    const assertion = expect(promise).rejects.toThrow(/timeout \(50ms\)/);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
  });
});

describe('listenForStructuresRequests', () => {
  it('responde PROJECT_GET_STRUCTURES_RESPONSE llamando a getStructuresData() cuando el mensaje viene del frame registrado', () => {
    const estructuralWindow = fakeWindow('estructural-frame-window');
    const getStructuresData = vi.fn(() => ({ structures: SAMPLE_STRUCTURES, structuralFileIds: SAMPLE_STRUCTURAL_FILE_IDS }));
    listenForStructuresRequestsTracked(fakeFrame(estructuralWindow), getStructuresData);

    dispatchMessage(estructuralWindow, { type: PROJECT_GET_STRUCTURES_REQUEST, requestId: 'req-structures-1' });

    expect(getStructuresData).toHaveBeenCalledTimes(1);
    expect(estructuralWindow.postMessage).toHaveBeenCalledWith(
      {
        type: PROJECT_GET_STRUCTURES_RESPONSE, requestId: 'req-structures-1',
        structures: SAMPLE_STRUCTURES, structuralFileIds: SAMPLE_STRUCTURAL_FILE_IDS,
      },
      '*',
    );
  });

  it('ignora un PROJECT_GET_STRUCTURES_REQUEST proveniente de un iframe distinto al registrado', () => {
    const estructuralWindow = fakeWindow('estructural-frame-window-2');
    const otherWindow = fakeWindow('gis-frame-window-other');
    const getStructuresData = vi.fn(() => ({ structures: SAMPLE_STRUCTURES, structuralFileIds: SAMPLE_STRUCTURAL_FILE_IDS }));
    listenForStructuresRequestsTracked(fakeFrame(estructuralWindow), getStructuresData);

    dispatchMessage(otherWindow, { type: PROJECT_GET_STRUCTURES_REQUEST, requestId: 'req-structures-2' });

    expect(getStructuresData).not.toHaveBeenCalled();
    expect(otherWindow.postMessage).not.toHaveBeenCalled();
  });

  it('si getStructuresData() lanza, responde PROJECT_GET_STRUCTURES_ERROR en vez de dejar la excepción sin capturar', () => {
    const estructuralWindow = fakeWindow('estructural-frame-window-3');
    const getStructuresData = vi.fn(() => {
      throw new Error('fallo real de getQaqcStructures');
    });
    listenForStructuresRequestsTracked(fakeFrame(estructuralWindow), getStructuresData);

    dispatchMessage(estructuralWindow, { type: PROJECT_GET_STRUCTURES_REQUEST, requestId: 'req-structures-3' });

    expect(estructuralWindow.postMessage).toHaveBeenCalledWith(
      { type: PROJECT_GET_STRUCTURES_ERROR, requestId: 'req-structures-3', message: 'fallo real de getQaqcStructures' },
      '*',
    );
  });
});

// ─────────────────────────────────────────────────────────────────
// requestModuleStateFromParent / listenForModuleStateRelayRequests
// (Etapa 11, GIS → Columnas/Hidrogeoquímica vía relevo de la raíz) —
// a diferencia de collars/surveys, acá listenForModuleStateRelayRequests
// llama INTERNAMENTE a requestStateFromFrame() contra un segundo frame
// "objetivo" — los tests de relevo de punta a punta simulan también ese
// segundo salto (ver targetWindow más abajo).
// ─────────────────────────────────────────────────────────────────

function listenForModuleStateRelayRequestsTracked(
  frame: HTMLIFrameElement,
  resolveTargetFrame: (moduleFrameId: string) => HTMLIFrameElement | null,
): void {
  const addSpy = vi.spyOn(window, 'addEventListener');
  listenForModuleStateRelayRequests(frame, resolveTargetFrame);
  const call = addSpy.mock.calls.find(([type]) => type === 'message');
  addSpy.mockRestore();
  if (call) trackedHandlers.push(call[1] as EventListenerOrEventListenerObject);
}

describe('requestModuleStateFromParent', () => {
  afterEach(() => {
    restoreWindowParent();
  });

  it('rechaza de inmediato si window.parent === window (no corre dentro de un iframe)', async () => {
    await expect(requestModuleStateFromParent('columnas-frame', 1000)).rejects.toThrow(/no corre dentro de un iframe/);
  });

  it('resuelve con el estado relevado cuando llega PROJECT_RELAY_STATE_RESPONSE con el requestId correcto', async () => {
    const parent = fakeWindow('root-relay-ok');
    setWindowParent(parent);

    const promise = requestModuleStateFromParent('columnas-frame', 1000);
    const requestId = lastSentRequestId(parent);

    dispatchMessage(parent, { type: PROJECT_RELAY_STATE_RESPONSE, requestId, state: { hello: 'columnas' } });

    await expect(promise).resolves.toEqual({ hello: 'columnas' });
  });

  it('resuelve con null cuando el módulo objetivo nunca se lanzó en la sesión', async () => {
    const parent = fakeWindow('root-relay-null');
    setWindowParent(parent);

    const promise = requestModuleStateFromParent('hidro-frame', 1000);
    const requestId = lastSentRequestId(parent);

    dispatchMessage(parent, { type: PROJECT_RELAY_STATE_RESPONSE, requestId, state: null });

    await expect(promise).resolves.toBeNull();
  });

  it('rechaza con el mensaje real cuando llega PROJECT_RELAY_STATE_ERROR', async () => {
    const parent = fakeWindow('root-relay-error');
    setWindowParent(parent);

    const promise = requestModuleStateFromParent('columnas-frame', 1000);
    const requestId = lastSentRequestId(parent);

    dispatchMessage(parent, { type: PROJECT_RELAY_STATE_ERROR, requestId, message: 'boom real del relevo' });

    await expect(promise).rejects.toThrow(/la ventana raíz no pudo relevar el estado de "columnas-frame": boom real del relevo/);
  });

  it('rechaza por timeout cuando no llega ninguna respuesta dentro del plazo', async () => {
    vi.useFakeTimers();
    const parent = fakeWindow('root-relay-timeout');
    setWindowParent(parent);

    const promise = requestModuleStateFromParent('columnas-frame', 50);
    const assertion = expect(promise).rejects.toThrow(/timeout \(50ms\).*columnas-frame/);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
  });
});

describe('listenForModuleStateRelayRequests', () => {
  it('responde state:null de inmediato si resolveTargetFrame devuelve null (módulo no lanzado o id desconocido), sin invocar requestStateFromFrame', () => {
    const gisWindow = fakeWindow('gis-relay-null');
    const resolveTargetFrame = vi.fn(() => null as HTMLIFrameElement | null);
    listenForModuleStateRelayRequestsTracked(fakeFrame(gisWindow), resolveTargetFrame);

    dispatchMessage(gisWindow, { type: PROJECT_RELAY_STATE_REQUEST, requestId: 'req-relay-1', moduleFrameId: 'columnas-frame' });

    expect(resolveTargetFrame).toHaveBeenCalledWith('columnas-frame');
    expect(gisWindow.postMessage).toHaveBeenCalledWith(
      { type: PROJECT_RELAY_STATE_RESPONSE, requestId: 'req-relay-1', state: null },
      '*',
    );
  });

  it('reenvía el estado real cuando el módulo objetivo responde (relevo de punta a punta: GIS → raíz → módulo → raíz → GIS)', async () => {
    const gisWindow = fakeWindow('gis-relay-2');
    const targetWindow = fakeWindow('columnas-target-2');
    const resolveTargetFrame = (id: string) => (id === 'columnas-frame' ? fakeFrame(targetWindow) : null);
    listenForModuleStateRelayRequestsTracked(fakeFrame(gisWindow), resolveTargetFrame);

    dispatchMessage(gisWindow, { type: PROJECT_RELAY_STATE_REQUEST, requestId: 'req-relay-2', moduleFrameId: 'columnas-frame' });

    // requestStateFromFrame() interno ya despachó su PROJECT_GET_STATE_REQUEST
    // hacia targetWindow — el Promise executor corre síncrono al construirse.
    const innerRequestId = lastSentRequestId(targetWindow);
    dispatchMessage(targetWindow, { type: PROJECT_GET_STATE_RESPONSE, requestId: innerRequestId, state: { columns: 3 } });

    await new Promise((resolve) => setTimeout(resolve, 0)); // deja correr los microtasks del .then() encadenado

    expect(gisWindow.postMessage).toHaveBeenCalledWith(
      { type: PROJECT_RELAY_STATE_RESPONSE, requestId: 'req-relay-2', state: { columns: 3 } },
      '*',
    );
  });

  it('reenvía un error como PROJECT_RELAY_STATE_ERROR cuando el módulo objetivo no responde a tiempo', async () => {
    vi.useFakeTimers();
    const gisWindow = fakeWindow('gis-relay-3');
    const targetWindow = fakeWindow('columnas-target-3');
    const resolveTargetFrame = () => fakeFrame(targetWindow);
    listenForModuleStateRelayRequestsTracked(fakeFrame(gisWindow), resolveTargetFrame);

    dispatchMessage(gisWindow, { type: PROJECT_RELAY_STATE_REQUEST, requestId: 'req-relay-3', moduleFrameId: 'columnas-frame' });

    await vi.advanceTimersByTimeAsync(3100); // supera el timeout default (3000ms) de requestStateFromFrame()

    expect(gisWindow.postMessage).toHaveBeenCalledWith(
      { type: PROJECT_RELAY_STATE_ERROR, requestId: 'req-relay-3', message: expect.stringContaining('timeout') },
      '*',
    );
  });

  it('ignora un PROJECT_RELAY_STATE_REQUEST proveniente de un iframe distinto al registrado', () => {
    const gisWindow = fakeWindow('gis-relay-4');
    const otherWindow = fakeWindow('not-gis-frame-window');
    const resolveTargetFrame = vi.fn(() => null as HTMLIFrameElement | null);
    listenForModuleStateRelayRequestsTracked(fakeFrame(gisWindow), resolveTargetFrame);

    dispatchMessage(otherWindow, { type: PROJECT_RELAY_STATE_REQUEST, requestId: 'req-relay-5', moduleFrameId: 'columnas-frame' });

    expect(resolveTargetFrame).not.toHaveBeenCalled();
    expect(otherWindow.postMessage).not.toHaveBeenCalled();
  });
});
