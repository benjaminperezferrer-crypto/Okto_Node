/**
 * src/estructural/chartStyleEditorCss.ts
 * Etapa 10 — CSS mínimo para las clases `.hgm-*` que src/shared/
 * ChartStyleEditor.tsx y src/shared/ExportButton.tsx asumen que existen
 * (heredadas de Hidrogeoquímica, donde viven en HGM_CSS dentro de
 * HydrogeochemistryModule.tsx con la paleta HUD cian de ese módulo).
 *
 * Hasta la Etapa 16 esto definía un equivalente NEUTRO (claro, no HUD) —
 * decisión revertida en esa etapa: el módulo entero adopta el tema HUD
 * compartido (pedido explícito). Etapa 17 (cierre de la consolidación):
 * re-exporta directo desde src/shared/hudTheme.css (antes desde
 * hudTheme.ts, retirado — hudTheme.css es ahora la única fuente real del
 * tema en toda la app, mismos valores confirmados byte a byte). Se
 * mantiene este archivo (en vez de apuntar StereonetPlanes.tsx/
 * RoseDiagram.tsx directo al `.css`) para no tocar esos 2 componentes más
 * de lo necesario — mismo nombre de export, mismo import, distinto origen.
 */

import HUD_THEME_CSS from '../shared/hudTheme.css';

export { HUD_THEME_CSS as CHART_STYLE_EDITOR_CSS };
