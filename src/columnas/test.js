/**
 * src/columnas/test.js
 * Test de consola para el store de columnas estratigráficas.
 *
 * Ejecutar:  node src/columnas/test.js
 * Salida:    coloreada con ✓/✗ por assertion, resumen al final.
 * Exit code: 0 si todo pasa, 1 si hay fallos.
 */

'use strict';

const {
  createColumnStore, calcAccumulatedHeights, validateColumn,
  migrateUnit, migrateUnits, GRAIN_SIZE_ORDER, GRAIN_SIZE_LABELS,
} = require('./store');

// ─────────────────────────────────────────────────────────────────
// HELPERS DE OUTPUT
// ─────────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  yellow: '\x1b[33m',
  dim:    '\x1b[2m',
};

let passed = 0;
let failed = 0;

function assert(label, condition, extra = '') {
  if (condition) {
    console.log(`  ${C.green}✓${C.reset} ${label}`);
    passed++;
  } else {
    console.log(`  ${C.red}✗${C.reset} ${label}${extra ? `  ${C.dim}← ${extra}${C.reset}` : ''}`);
    failed++;
  }
}

function section(n, title) {
  console.log(`\n${C.bold}${n}. ${title}${C.reset}`);
}

function printHeights(computed, indent = '  ') {
  computed.forEach(u => {
    const bar = '▓'.repeat(Math.max(1, Math.round(u.thickness / 2)));
    console.log(
      `${indent}${C.cyan}·${C.reset} ` +
      `${String(u.code).padEnd(5)} ` +
      `${C.dim}${String(u.heightFromBase.toFixed(2)).padStart(6)} → ` +
      `${String(u.heightToTop.toFixed(2)).padStart(6)} m${C.reset}  ${bar}`
    );
    if (u.subUnits?.length) printHeights(u.subUnits, indent + '    ');
  });
}

function totalThickness(computed) {
  const top = computed[computed.length - 1];
  return top ? top.heightToTop : 0;
}

// ─────────────────────────────────────────────────────────────────
// BLOQUE 1 — Crear columna y agregar unidades al techo
// ─────────────────────────────────────────────────────────────────
section(1, 'Crear columna y agregar unidades (base → techo)');

const store = createColumnStore({
  name:     'Columna Cerro Blanco',
  author:   'J. González',
  scale:    500,
  location: { description: 'Quebrada Honda  7340250N / 424800E  WGS84 19S' },
});

let state = store.addUnit({ code: 'A', thickness: 10, primaryLithology: 'Arenisca media',  upperContactType: 'neto'    });
    state = store.addUnit({ code: 'B', thickness: 15, primaryLithology: 'Lutita',           upperContactType: 'gradual' });
    state = store.addUnit({ code: 'C', thickness:  8, primaryLithology: 'Caliza',           upperContactType: 'erosivo' });

console.log('\n  Alturas tras agregar A(10m) · B(15m) · C(8m):');
printHeights(state.computed);

//  A: 0 → 10   B: 10 → 25   C: 25 → 33
assert('A base = 0 m',   state.computed[0].heightFromBase === 0);
assert('A techo = 10 m', state.computed[0].heightToTop    === 10);
assert('B base = 10 m',  state.computed[1].heightFromBase === 10);
assert('B techo = 25 m', state.computed[1].heightToTop    === 25);
assert('C base = 25 m',  state.computed[2].heightFromBase === 25);
assert('C techo = 33 m', state.computed[2].heightToTop    === 33);
assert('espesor total = 33 m', totalThickness(state.computed) === 33);

// ─────────────────────────────────────────────────────────────────
// BLOQUE 2 — Insertar unidad en posición específica
// ─────────────────────────────────────────────────────────────────
section(2, 'Insertar X(5m) en posición 1 (entre A y B)');

state = store.addUnit(
  { code: 'X', thickness: 5, primaryLithology: 'Conglomerado', upperContactType: 'erosivo' },
  1   // índice 0 = base; 1 = entre A y B
);

console.log('\n  Alturas tras insertar X en idx 1:');
printHeights(state.computed);

//  A: 0→10   X: 10→15   B: 15→30   C: 30→38
assert('orden A,X,B,C',   state.column.units.map(u => u.code).join(',') === 'A,X,B,C');
assert('X base = 10 m',   state.computed[1].heightFromBase === 10);
assert('X techo = 15 m',  state.computed[1].heightToTop    === 15);
assert('B base = 15 m',   state.computed[2].heightFromBase === 15);
assert('B techo = 30 m',  state.computed[2].heightToTop    === 30);
assert('C base = 30 m',   state.computed[3].heightFromBase === 30);
assert('C techo = 38 m',  state.computed[3].heightToTop    === 38);
assert('espesor total = 38 m', totalThickness(state.computed) === 38);

// ─────────────────────────────────────────────────────────────────
// BLOQUE 3 — Mover unidad
// ─────────────────────────────────────────────────────────────────
section(3, 'Mover B (idx 2) a idx 0 — B pasa a ser la base');

const idB = state.column.units.find(u => u.code === 'B').id;
state = store.moveUnit(idB, 0);

console.log('\n  Alturas tras mover B a la base:');
printHeights(state.computed);

//  B: 0→15   A: 15→25   X: 25→30   C: 30→38
assert('orden B,A,X,C',   state.column.units.map(u => u.code).join(',') === 'B,A,X,C');
assert('B base = 0 m',    state.computed[0].heightFromBase === 0);
assert('B techo = 15 m',  state.computed[0].heightToTop    === 15);
assert('A base = 15 m',   state.computed[1].heightFromBase === 15);
assert('X base = 25 m',   state.computed[2].heightFromBase === 25);
assert('C techo = 38 m',  state.computed[3].heightToTop    === 38);
assert('espesor total invariante = 38 m', totalThickness(state.computed) === 38);

// ─────────────────────────────────────────────────────────────────
// BLOQUE 4 — Eliminar unidad
// ─────────────────────────────────────────────────────────────────
section(4, 'Eliminar X(5m) — las alturas deben recalcularse');

const idX = state.column.units.find(u => u.code === 'X').id;
state = store.removeUnit(idX);

console.log('\n  Alturas tras eliminar X:');
printHeights(state.computed);

//  B: 0→15   A: 15→25   C: 25→33
assert('orden B,A,C',     state.column.units.map(u => u.code).join(',') === 'B,A,C');
assert('A base = 15 m',   state.computed[1].heightFromBase === 15);
assert('C base = 25 m',   state.computed[2].heightFromBase === 25);
assert('C techo = 33 m',  state.computed[2].heightToTop    === 33);
assert('espesor total = 33 m', totalThickness(state.computed) === 33);

// ─────────────────────────────────────────────────────────────────
// BLOQUE 5 — Actualizar espesor y recalcular
// ─────────────────────────────────────────────────────────────────
section(5, 'Cambiar espesor de A: 10 m → 20 m');

const idA = state.column.units.find(u => u.code === 'A').id;
state = store.updateUnit(idA, { thickness: 20 });

console.log('\n  Alturas tras ampliar A a 20m:');
printHeights(state.computed);

//  B: 0→15   A: 15→35   C: 35→43
assert('A techo = 35 m',  state.computed[1].heightToTop    === 35);
assert('C base = 35 m',   state.computed[2].heightFromBase === 35);
assert('C techo = 43 m',  state.computed[2].heightToTop    === 43);
assert('espesor total = 43 m', totalThickness(state.computed) === 43);

// ─────────────────────────────────────────────────────────────────
// BLOQUE 6 — Subunidades
// ─────────────────────────────────────────────────────────────────
section(6, 'Subdividir B en B1(6m) + B2(9m) — espesor padre se recalcula');

// Estado previo: B está en idx 0, thickness = 15
const idBnow = state.column.units.find(u => u.code === 'B').id;
state = store.addSubUnit(idBnow, { code: 'B1', thickness: 6, primaryLithology: 'Lutita',      upperContactType: 'gradual' });
state = store.addSubUnit(idBnow, { code: 'B2', thickness: 9, primaryLithology: 'Calcarenita', upperContactType: 'neto'    });

console.log('\n  Árbol de alturas tras subdividir B:');
printHeights(state.computed);

// B.thickness debe ser 6+9=15 (recalculado automáticamente)
const bUnit     = state.column.units.find(u => u.code === 'B');
const b1Computed = state.computed[0].subUnits[0];
const b2Computed = state.computed[0].subUnits[1];

// Alturas de subUnits son absolutas desde la base de la columna.
// B empieza en 0, así que B1 base = 0 (coincide con base absoluta).
assert('B.thickness = 15 (Σ subunidades)',   bUnit.thickness === 15);
assert('B1 base absoluta = 0 m',             b1Computed.heightFromBase === 0);
assert('B1 techo = 6 m',                     b1Computed.heightToTop    === 6);
assert('B2 base absoluta = 6 m',             b2Computed.heightFromBase === 6);
assert('B2 techo = 15 m',                    b2Computed.heightToTop    === 15);
assert('espesor total invariante = 43 m',    totalThickness(state.computed) === 43);

// Actualizar espesor de subunidad → padre se ajusta automáticamente
state = store.updateSubUnit(idBnow, b1Computed.id, { thickness: 10 });
const bAfter = state.column.units.find(u => u.code === 'B');
assert('B.thickness = 19 tras ampliar B1 a 10m', bAfter.thickness === 19);
assert('espesor total = 47 m (19+20+8)',          totalThickness(state.computed) === 47);

// Devolver B1 a 6m para que los bloques siguientes sean predecibles
state = store.updateSubUnit(idBnow, b1Computed.id, { thickness: 6 });

// ─────────────────────────────────────────────────────────────────
// BLOQUE 7 — Eliminar subunidad
// ─────────────────────────────────────────────────────────────────
section(7, 'Eliminar B2 de B — padre se recalcula a 6m');

state = store.removeSubUnit(idBnow, b2Computed.id);

console.log('\n  Alturas tras eliminar B2:');
printHeights(state.computed);

const bSolo = state.column.units.find(u => u.code === 'B');
assert('B.thickness = 6 (solo B1)',     bSolo.thickness === 6);
assert('B subUnits.length = 1',         bSolo.subUnits.length === 1);
assert('A base = 6 m (B se encogió)',   state.computed[1].heightFromBase === 6);
assert('espesor total = 34 m (6+20+8)', totalThickness(state.computed) === 34);

// ─────────────────────────────────────────────────────────────────
// BLOQUE 8 — Validaciones
// ─────────────────────────────────────────────────────────────────
section(8, 'Validaciones — errores y avisos');

// 8a: columna bien formada no debe tener errores
// (la columna actual tiene B con subUnits — espesor coincide con B1)
const v = validateColumn(state.column);
assert('columna válida: 0 errores',  v.errors.length   === 0, JSON.stringify(v.errors));
// B y A tienen litología; C también → sin avisos de litología
const lithWarns = v.warnings.filter(w => w.code === 'MISSING_LITHOLOGY');
assert('sin avisos de litología faltante', lithWarns.length === 0);

// 8b: espesor ≤ 0
const s2 = createColumnStore({ name: 'Test-validaciones', scale: 100, location: { description: 'x' }, author: 'Test' });
s2.addUnit({ code: 'Z', thickness: -5, upperContactType: 'neto' });
const v2 = s2.getState().validation;
assert('thickness negativo → INVALID_THICKNESS',
  v2.errors.some(e => e.code === 'INVALID_THICKNESS'));

// 8c: litología faltante → aviso, no error
assert('sin litología → warning MISSING_LITHOLOGY',
  v2.warnings.some(w => w.code === 'MISSING_LITHOLOGY'));

// 8d: escala inválida
const s3 = createColumnStore({ name: 'Test', scale: 0 });
assert('escala 0 → META_INVALID_SCALE',
  s3.getState().validation.errors.some(e => e.code === 'META_INVALID_SCALE'));

// 8e: nombre vacío
const s4 = createColumnStore({ scale: 200 });
assert('nombre vacío → META_NO_NAME',
  s4.getState().validation.errors.some(e => e.code === 'META_NO_NAME'));

// 8f: mismatch espesor padre vs Σ hijos (inyectamos estado inconsistente)
const colMismatch = {
  id: 'x', metadata: { name: 'x', author: 'x', scale: 100, location: { description: 'x' } },
  units: [{
    id: 'p1', code: 'P', rank: 'formacion', thickness: 20, upperContactType: 'neto',
    subUnits: [
      { id: 's1', code: 'P1', rank: 'estrato', thickness: 7,  upperContactType: 'neto',    primaryLithology: 'Limolita' },
      { id: 's2', code: 'P2', rank: 'estrato', thickness: 8,  upperContactType: 'gradual', primaryLithology: 'Arenisca media' },
    ],
  }],
  createdAt: '', updatedAt: '',
};
const vMismatch = validateColumn(colMismatch);
assert('Σhijos(15) ≠ padre(20) → THICKNESS_MISMATCH',
  vMismatch.errors.some(e => e.code === 'THICKNESS_MISMATCH'));

// 8g: IDs duplicados
const colDupId = {
  id: 'x', metadata: { name: 'x', author: 'x', scale: 100, location: { description: 'x' } },
  units: [
    { id: 'SAME', code: 'U1', rank: 'estrato', thickness: 5, upperContactType: 'neto', primaryLithology: 'Caliza' },
    { id: 'SAME', code: 'U2', rank: 'estrato', thickness: 5, upperContactType: 'neto', primaryLithology: 'Caliza' },
  ],
  createdAt: '', updatedAt: '',
};
assert('IDs duplicados → DUPLICATE_ID',
  validateColumn(colDupId).errors.some(e => e.code === 'DUPLICATE_ID'));

// ─────────────────────────────────────────────────────────────────
// BLOQUE 9 — Suscriptor reactivo
// ─────────────────────────────────────────────────────────────────
section(9, 'Suscriptor — notificaciones reactivas');

const storeR = createColumnStore({ name: 'Reactivo', scale: 100, location: { description: 'x' }, author: 'y' });
let notifs = 0;
const unsub = storeR.subscribe(() => { notifs++; });

storeR.addUnit({ code: 'R1', thickness: 5,  primaryLithology: 'Limolita',     upperContactType: 'neto'    });
storeR.addUnit({ code: 'R2', thickness: 3,  primaryLithology: 'Lutita',       upperContactType: 'gradual' });
storeR.updateMetadata({ notes: 'Afloramiento excelente' });
unsub();  // cancelar suscripción
storeR.addUnit({ code: 'R3', thickness: 2,  primaryLithology: 'Caliza',       upperContactType: 'erosivo' });

assert('3 notificaciones (4ta operación ignorada tras unsub())', notifs === 3);

// getState() siempre refleja el estado actual, con o sin suscriptores
const stateR = storeR.getState();
assert('getState() incluye R3 aunque no hubo notificación',
  stateR.column.units.length === 3 && stateR.column.units[2].code === 'R3');

// ─────────────────────────────────────────────────────────────────
// BLOQUE 10 — calcAccumulatedHeights como función pura
// ─────────────────────────────────────────────────────────────────
section(10, 'calcAccumulatedHeights como función pura independiente');

const rawUnits = [
  { id: 'u1', code: 'Alpha', thickness: 12 },
  { id: 'u2', code: 'Beta',  thickness: 8  },
  { id: 'u3', code: 'Gamma', thickness: 5  },
];
const h = calcAccumulatedHeights(rawUnits);

assert('no muta el array original',          rawUnits[0].heightFromBase === undefined);
assert('Alpha base = 0, techo = 12',         h[0].heightFromBase === 0  && h[0].heightToTop === 12);
assert('Beta  base = 12, techo = 20',        h[1].heightFromBase === 12 && h[1].heightToTop === 20);
assert('Gamma base = 20, techo = 25',        h[2].heightFromBase === 20 && h[2].heightToTop === 25);

// Función pura: segunda llamada con mismo input → mismo resultado
const h2 = calcAccumulatedHeights(rawUnits);
assert('llamadas repetidas producen el mismo resultado',
  h2[2].heightToTop === 25);

// ─────────────────────────────────────────────────────────────────
// BLOQUE 11 — Migración v1 → v2 (perfilGranulometrico posicional)
// ─────────────────────────────────────────────────────────────────
section(11, 'migrateUnit — conversión legado → perfil posicional');

const legacyUnit = {
  id: 'l1', code: 'L1', rank: 'estrato', thickness: 10,
  upperContactType: 'gradual',
  grainSize: 'arena_media',
  sedimentaryStructures: ['Laminación paralela', 'Gradación normal'],
  fieldObservations: 'Muestra M-14, cemento calcáreo',
};

const migrated = migrateUnit(legacyUnit);

assert('perfilGranulometrico creado desde grainSize',
  Array.isArray(migrated.perfilGranulometrico) && migrated.perfilGranulometrico.length === 1);
assert('tamanoGrano correcto',
  migrated.perfilGranulometrico[0].tamanoGrano === 'arena_media');
assert('alturaRelativa = 0.5 para grano uniforme',
  migrated.perfilGranulometrico[0].alturaRelativa === 0.5);

assert('estructurasSedimentarias creada desde sedimentaryStructures',
  Array.isArray(migrated.estructurasSedimentarias) && migrated.estructurasSedimentarias.length === 2);
assert('primera estructura: alturaRelativa = 0',
  migrated.estructurasSedimentarias[0].alturaRelativa === 0);
assert('segunda estructura: alturaRelativa = 1',
  migrated.estructurasSedimentarias[1].alturaRelativa === 1);
assert('tipoEstructura preservado',
  migrated.estructurasSedimentarias[0].tipoEstructura === 'Laminación paralela');

assert('observaciones creada desde fieldObservations',
  Array.isArray(migrated.observaciones) && migrated.observaciones.length === 1);
assert('texto preservado',
  migrated.observaciones[0].texto === 'Muestra M-14, cemento calcáreo');
assert('alturaRelativa = 0.5 para observación única',
  migrated.observaciones[0].alturaRelativa === 0.5);

// Idempotencia: migrar de nuevo no debe duplicar
const migrated2 = migrateUnit(migrated);
assert('idempotente: perfilGranulometrico no se duplica',
  migrated2.perfilGranulometrico.length === 1);
assert('idempotente: estructurasSedimentarias no se duplican',
  migrated2.estructurasSedimentarias.length === 2);

// Unidad sin campos legado → no genera campos vacíos
const freshUnit = { id: 'f1', code: 'F1', rank: 'estrato', thickness: 5, upperContactType: 'neto' };
const freshMig  = migrateUnit(freshUnit);
assert('sin grainSize → perfilGranulometrico no se crea',
  freshMig.perfilGranulometrico === undefined);
assert('sin fieldObservations → observaciones no se crea',
  freshMig.observaciones === undefined);

// GRAIN_SIZE_ORDER
assert('GRAIN_SIZE_ORDER tiene 11 entradas (Arcilla → Bloque)',
  GRAIN_SIZE_ORDER.length === 11);
assert('GRAIN_SIZE_ORDER[0] = arcilla',
  GRAIN_SIZE_ORDER[0] === 'arcilla');
assert('GRAIN_SIZE_ORDER[10] = bloque',
  GRAIN_SIZE_ORDER[10] === 'bloque');
assert('grava incluida en el orden',
  GRAIN_SIZE_ORDER.includes('grava'));
assert('guija ELIMINADO del orden (reemplazado por grava)',
  !GRAIN_SIZE_ORDER.includes('guija'));

// GRAIN_SIZE_LABELS
assert('etiqueta de arena_muy_fina = "Amf"',
  GRAIN_SIZE_LABELS['arena_muy_fina'] === 'Amf');
assert('todas las 11 categorías tienen etiqueta',
  GRAIN_SIZE_ORDER.every(gs => GRAIN_SIZE_LABELS[gs] !== undefined));

// ─────────────────────────────────────────────────────────────────
// RESUMEN
// ─────────────────────────────────────────────────────────────────

const divider = '─'.repeat(52);
console.log(`\n${divider}`);
if (failed === 0) {
  console.log(`${C.green}${C.bold}  ✓ ${passed} assertions pasaron — todo correcto${C.reset}`);
} else {
  console.log(`  ${C.green}✓ ${passed} pasaron${C.reset}   ${C.red}✗ ${failed} fallaron${C.reset}`);
}
console.log(`${divider}\n`);

process.exit(failed > 0 ? 1 : 0);
