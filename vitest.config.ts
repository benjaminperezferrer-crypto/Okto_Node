import { defineConfig } from 'vitest/config';

// Config mínima. environment: 'node' es el default de Vitest — se deja
// explícito para dejar claro que los tests que necesiten DOM (p.ej.
// projectBridge.ts, que usa window/MessageEvent) deben optar por jsdom
// por archivo vía el pragma `// @vitest-environment jsdom`, no acá.
export default defineConfig({
  test: {
    environment: 'node',
  },
});
