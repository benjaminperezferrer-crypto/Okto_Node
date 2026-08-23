/**
 * src/estructural/chartStyleIds.ts
 * Etapa 10 — identidad de diagrama para src/shared/chartStyle.ts
 * (getDefaultChartStyleMap/loadChartStyleMap/saveChartStyleMap son
 * genéricas sobre esto — ver JSDoc de ese archivo).
 *
 * DISTINTO del criterio de HydrogeochemistryModule.tsx: ahí un solo
 * componente contenedor gestiona los 6 diagramas (una pestaña a la vez),
 * así que tiene sentido que TODOS compartan una sola clave de
 * localStorage con un mapa {id -> settings}. Acá StereonetPlanes.tsx y
 * RoseDiagram.tsx son componentes STANDALONE, cada uno con su propio
 * estado — si ambos compartieran una clave y cada uno guardara el mapa
 * COMPLETO (incluyendo la entrada del otro, que no controla), uno podría
 * pisar los cambios del otro con una copia desactualizada. Por eso cada
 * diagrama usa su PROPIA clave de storage, con un mapa de un solo id —
 * mismas funciones genéricas de chartStyle.ts, sin el riesgo de carrera
 * entre 2 componentes independientes.
 *
 * `tabId` (Etapa 3 del rediseño — sistema de pestañas múltiples): cada
 * pestaña de EstructuralWorkspace.tsx tiene su PROPIA instancia de
 * StereonetPlanes/RoseDiagram con su propio estilo — sin este segundo
 * namespace, dos pestañas compartirían la MISMA clave de localStorage
 * (una sola por diagrama, global a todo el módulo) y una pisaría el
 * estilo de la otra con solo cambiar de pestaña. `tabId` va PRIMERO en
 * la clave (no al final) para que las claves de una pestaña eliminada
 * queden agrupadas y sean fáciles de identificar si alguna vez se
 * decide limpiarlas.
 */

export type StructuralDiagramId = 'stereonet' | 'rose';

/** Clave de localStorage exclusiva de ESE diagrama, EN ESA pestaña — ver nota de archivo. */
export function structuralChartStyleStorageKey(id: StructuralDiagramId, tabId: string): string {
  return `estructural.chartStyle.${tabId}.${id}.v1`;
}
