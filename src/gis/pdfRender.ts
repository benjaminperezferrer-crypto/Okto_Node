/**
 * src/gis/pdfRender.ts
 * Renderiza la primera página de un PDF a un <canvas> usando pdf.js —
 * para GeoreferencingTool.tsx (Etapa 8), cuando el archivo a
 * georreferenciar es un PDF (mapa escaneado, plano, etc.) en vez de una
 * imagen directa.
 *
 * ── pdfjs-dist: investigación previa a integrar (pedida explícitamente,
 * mismo criterio que shpjs/geotiff.js en las Etapas 6/7) ──────────────
 * Revisado el bundle real (node_modules/pdfjs-dist/build/pdf.mjs), no
 * solo la documentación:
 *   - `PDFPageProxy.render()` (línea ~15573 del bundle) rechaza la
 *     promesa con el error real si algo falla — el callback `complete`
 *     interno llama `internalRenderTask.capability.reject(error)` en la
 *     rama de error. No hay ningún catch que lo trague en silencio.
 *   - No existe NINGÚN manejo automático de metadatos geoespaciales —
 *     se buscó explícitamente en todo el bundle (~28000 líneas) por
 *     GeoPDF/GPTS/LPTS/Measure y no aparece ninguna referencia. pdf.js
 *     no intenta leer ni asumir ningún sistema de coordenadas embebido
 *     en el PDF (la extensión OGC "GeoPDF" no está soportada) — toda la
 *     georreferenciación depende 100% de los puntos de control que
 *     ingresa el usuario acá, nunca de algo leído del archivo.
 *   - PDFs con contraseña lanzan `PasswordException` (clase de error
 *     propia, exportada y documentada) — no fallan en silencio.
 * Conclusión: sin comportamiento silencioso que evitar, a diferencia de
 * shpjs (Etapa 6). No hace falta ningún control adicional más allá de
 * dejar que las excepciones de render()/getDocument() se propaguen tal
 * cual al caller.
 *
 * ── Worker de pdf.js ──────────────────────────────────────────────
 * pdf.js corre el parseo en un Web Worker real — no se puede empaquetar
 * en bundle.js (que ni siquiera es un módulo ES, esbuild lo compila como
 * IIFE). Se vendoriza como archivo aparte, servido junto a viewer.html
 * (src/gis/pdf.worker.min.mjs), mismo patrón que src/pako.min.js.
 * `workerSrc` se setea como ruta relativa de STRING, no vía
 * `import.meta.url` — ese último no es válido en un bundle IIFE.
 */
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';

/**
 * Renderiza la PRIMERA página de `file` (un PDF) a un `<canvas>` nuevo, a
 * la escala pedida (2 = el doble de la resolución nativa de 72 DPI del
 * PDF, razonable para poder marcar puntos de control con precisión).
 */
export async function renderPDFFirstPageToCanvas(file: File, scale = 2): Promise<HTMLCanvasElement> {
  const buffer = await file.arrayBuffer();
  // destroy() vive en el loadingTask (lo que devuelve getDocument()
  // directo), no en el PDFDocumentProxy resuelto — hay que guardar la
  // referencia ANTES de awaitear .promise.
  const loadingTask = getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('renderPDFFirstPageToCanvas: no se pudo obtener un contexto 2D de canvas.');
  }

  await page.render({ canvasContext: ctx, canvas, viewport }).promise;
  await loadingTask.destroy();

  return canvas;
}
