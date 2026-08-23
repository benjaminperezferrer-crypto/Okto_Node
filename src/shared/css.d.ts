/**
 * src/shared/css.d.ts
 * Declaración ambiente para imports de `.css` como texto — necesaria
 * desde la Etapa 17 (consolidación del tema HUD), donde src/shared/
 * hudTheme.css se importa directo en módulos con build (Hidrogeoquímica,
 * GIS) vía el loader `text` de esbuild (`--loader:.css=text` en el
 * script `build:*` correspondiente, ver package.json). Ese loader
 * exporta el contenido del archivo como default export de tipo string —
 * sin esta declaración, TypeScript no sabe qué tipo darle a
 * `import HUD_THEME_CSS from '../shared/hudTheme.css'` y falla el
 * type-check (aunque esbuild sí lo resuelve en runtime).
 */
declare module '*.css' {
  const content: string;
  export default content;
}
