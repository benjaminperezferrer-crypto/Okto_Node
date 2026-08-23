/**
 * src/projectManager.test.js
 * Pruebas unitarias de la codificación Uint8Array↔base64 para binarios
 * grandes en ProjectState (Etapa 13 — ver jsonReplacer/jsonReviver en
 * src/projectManager.js). projectManager.js es JS plano sin build step
 * (mismo patrón de testeo que projectMigrations.js — cola de
 * module.exports invisible para el navegador).
 *
 * Foco de estas pruebas: el riesgo real no es "¿el base64 es correcto?"
 * (btoa/atob son estándar) sino "¿la codificación por bloques
 * (BASE64_CHUNK_SIZE) sobrevive un Uint8Array más grande que un solo
 * bloque sin reventar el límite de argumentos de
 * String.fromCharCode.apply?" — un array de unos pocos bytes NUNCA
 * habría detectado ese bug.
 */
import { describe, it, expect } from 'vitest';
import { jsonReplacer, jsonReviver, uint8ArrayToBase64, base64ToUint8Array } from './projectManager.js';

describe('uint8ArrayToBase64 / base64ToUint8Array — round-trip', () => {
  it('array pequeño (menor a un bloque)', () => {
    const original = new Uint8Array([0, 1, 2, 255, 128, 64]);
    const decoded = base64ToUint8Array(uint8ArrayToBase64(original));
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('array vacío', () => {
    const decoded = base64ToUint8Array(uint8ArrayToBase64(new Uint8Array(0)));
    expect(decoded.length).toBe(0);
  });

  it('array MÁS GRANDE que un solo bloque de codificación (0x8000 = 32768 bytes) — ejercita el chunking real', () => {
    // 100,000 bytes > 3 bloques de 32768 — un Uint8Array de este tamaño
    // pasado entero a String.fromCharCode.apply/spread revienta el límite
    // de argumentos del motor; solo la versión con chunking lo soporta.
    const size = 100_000;
    const original = new Uint8Array(size);
    for (let i = 0; i < size; i++) original[i] = i % 256; // patrón determinístico, no aleatorio — reproducible

    const decoded = base64ToUint8Array(uint8ArrayToBase64(original));

    expect(decoded.length).toBe(size);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('array cuyo tamaño es EXACTO múltiplo del tamaño de bloque (caso límite del loop de chunking)', () => {
    const size = 0x8000 * 3; // exactamente 3 bloques, sin resto
    const original = new Uint8Array(size);
    for (let i = 0; i < size; i++) original[i] = (i * 7) % 256;

    const decoded = base64ToUint8Array(uint8ArrayToBase64(original));
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });
});

describe('jsonReplacer / jsonReviver — round-trip vía JSON.stringify/JSON.parse real', () => {
  it('un Uint8Array anidado en un objeto sobrevive exacto el ciclo completo', () => {
    const pixels = new Uint8Array(50_000);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 3) % 256;

    const state = {
      metadata: { name: 'proyecto' },
      gis: {
        extent: null,
        layers: [{ id: 'r1', type: 'raster', data: { pixels, pixelWidth: 200, pixelHeight: 250 } }],
      },
    };

    const json = JSON.stringify(state, jsonReplacer);
    const restored = JSON.parse(json, jsonReviver);

    expect(restored.gis.layers[0].data.pixels).toBeInstanceOf(Uint8Array);
    expect(Array.from(restored.gis.layers[0].data.pixels)).toEqual(Array.from(pixels));
    // El resto del estado (sin binarios) no debe alterarse por el replacer/reviver.
    expect(restored.metadata.name).toBe('proyecto');
    expect(restored.gis.layers[0].data.pixelWidth).toBe(200);
  });

  it('el JSON con base64 pesa muchísimo menos que la serialización JSON por defecto de un Uint8Array grande', () => {
    const pixels = new Uint8Array(200_000);
    const withReplacer = JSON.stringify({ pixels }, jsonReplacer).length;
    const withoutReplacer = JSON.stringify({ pixels }).length; // array-of-numbers por defecto — el problema que jsonReplacer evita

    // base64 infla ~33%; el default de JSON.stringify (un objeto {"0":0,"1":0,...})
    // infla varios cientos por ciento — el ratio real observado es de varias veces.
    expect(withReplacer).toBeLessThan(withoutReplacer / 3);
  });

  it('no altera valores que no son Uint8Array (strings, números, arrays planos, null)', () => {
    const state = { a: 'texto', b: 42, c: [1, 2, 3], d: null, e: { anidado: true } };
    const json = JSON.stringify(state, jsonReplacer);
    const restored = JSON.parse(json, jsonReviver);
    expect(restored).toEqual(state);
  });
});
