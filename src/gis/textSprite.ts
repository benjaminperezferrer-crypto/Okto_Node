/**
 * src/gis/textSprite.ts
 * Etapa 1 del paquete de armazón de referencia ("fish tank") — primer
 * texto DENTRO de la escena Three.js de GIS. No existe ninguna alternativa
 * ya integrada (CSS2DRenderer exigiría un segundo renderer + contenedor
 * DOM propio; TextGeometry exigiría cargar una fuente y billboardear a
 * mano) — ver diagnóstico acordado. Técnica: dibujar el texto en un
 * `<canvas>` 2D fuera de pantalla, usarlo como `CanvasTexture` de un
 * `THREE.SpriteMaterial`. Un `THREE.Sprite` mira a cámara SIEMPRE, sin
 * código adicional — billboard nativo de Three.js.
 *
 * Sin estado React, sin conexión a ningún caso de uso todavía (armazón de
 * profundidad, etiquetas de la grilla 2D — quedan para etapas
 * posteriores) — función pura, mismo criterio que gisGrid.ts/
 * gisLayerRender.ts.
 */
import * as THREE from 'three';

/** Paleta HUD de la app (src/shared/hudTheme.css: --hud-cyan) — mismo color que usa la grilla del techo (GRID_COLOR_TOP en gisGrid.ts). */
const DEFAULT_COLOR = '#00F4FF';
/** Misma familia monoespaciada que el resto de la app. */
const DEFAULT_FONT_FAMILY = "'Courier New', Courier, monospace";
/** Tamaño de fuente en el CANVAS FUENTE (px) — resolución de la textura, no el tamaño final en pantalla (ver `worldHeight`). Más alto = texto más nítido al acercar la cámara, a costa de más memoria de textura. */
const DEFAULT_FONT_SIZE_PX = 48;
/** Padding alrededor del texto dentro del canvas, en px de canvas — evita que el glyph quede pegado al borde de la textura. */
const CANVAS_PADDING_PX = 12;
/**
 * Alto del sprite en UNIDADES DE MUNDO (no píxeles de pantalla) — un
 * Sprite de Three.js escala con la distancia de cámara como cualquier
 * geometría 3D real (a diferencia de CSS2DRenderer, que mantiene tamaño
 * de pantalla constante). 24 unidades es comparable al tamaño de los
 * marcadores ya existentes del módulo (HIDROGEO_MARKER_RADIUS=9 → 18 de
 * diámetro, COLUMNAS_MARKER_HEIGHT=18 — ver gisLayerRender.ts) y legible
 * a la distancia de cámara inicial típica (ver perspCamera en
 * GisViewport.tsx, posicionada a ~0.6× la diagonal de la caja exterior).
 */
const DEFAULT_WORLD_HEIGHT = 24;

export interface TextSpriteOptions {
  /** Color CSS del texto — default cian HUD. */
  color?: string;
  /** Familia tipográfica CSS — default Courier New (monoespaciada, igual que el resto de la app). */
  fontFamily?: string;
  /** Tamaño de fuente en el canvas fuente (resolución de textura), no en pantalla. */
  fontSizePx?: number;
  /** Alto final del sprite en unidades de mundo — el ancho se deriva del aspect ratio real del texto para no deformarlo. */
  worldHeight?: number;
}

/**
 * Arma un `THREE.Sprite` con `text` renderizado como textura de canvas —
 * billboard nativo (siempre mira a cámara), sin geometría 3D real del
 * glyph. `options` cubre color/fuente/tamaño con defaults consistentes
 * con la paleta HUD del resto de la app.
 *
 * El `Sprite` resultante comparte su `geometry` con TODOS los sprites de
 * la sesión (ver `disposeObject3D` en gisGrid.ts — geometría interna de
 * Three.js, `let _geometry` a nivel de módulo en Sprite.js, creada una
 * sola vez y reusada para siempre) — nunca se debe llamar
 * `sprite.geometry.dispose()` a mano; usar siempre `disposeObject3D()`
 * para limpiar un sprite (ya sabe saltar su geometría compartida).
 */
export function createTextSprite(text: string, options: TextSpriteOptions = {}): THREE.Sprite {
  const color = options.color ?? DEFAULT_COLOR;
  const fontFamily = options.fontFamily ?? DEFAULT_FONT_FAMILY;
  const fontSizePx = options.fontSizePx ?? DEFAULT_FONT_SIZE_PX;
  const worldHeight = options.worldHeight ?? DEFAULT_WORLD_HEIGHT;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('createTextSprite: no se pudo obtener un contexto 2D de canvas.');
  }

  const font = `${fontSizePx}px ${fontFamily}`;
  // Primera pasada solo para medir — canvas.width/height todavía en su
  // tamaño por defecto (300×150), ctx.font se vuelve a fijar después de
  // redimensionar (cambiar width/height limpia TODO el estado del
  // contexto, incluido font).
  ctx.font = font;
  const textWidthPx = Math.max(1, Math.ceil(ctx.measureText(text).width));
  // measureText().actualBoundingBoxAscent/Descent da un alto más fiel,
  // pero no está soportado de forma consistente en todos los navegadores
  // — 1.2× fontSize (line-height habitual) es una aproximación estándar
  // suficiente para una etiqueta corta de una sola línea.
  const textHeightPx = Math.ceil(fontSizePx * 1.2);

  canvas.width = textWidthPx + CANVAS_PADDING_PX * 2;
  canvas.height = textHeightPx + CANVAS_PADDING_PX * 2;

  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; // mismo criterio que buildRasterMesh (gisLayerRender.ts)

  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);

  const aspect = canvas.width / canvas.height;
  sprite.scale.set(worldHeight * aspect, worldHeight, 1);

  return sprite;
}
