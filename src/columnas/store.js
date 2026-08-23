/**
 * src/columnas/store.js
 * Lógica de estado para el módulo de Columnas Estratigráficas.
 *
 * Sin dependencias de UI — ejecutable en Node.js y en el navegador.
 * Patrón: factory function que devuelve un store con estado encapsulado.
 * Las operaciones son inmutables: cada mutación produce un nuevo estado
 * sin tocar el anterior; los suscriptores reciben la snapshot resultante.
 *
 * @ts-check
 */

'use strict';

// ─────────────────────────────────────────────────────────────────
// GRANULOMETRÍA — constantes de escala Udden-Wentworth simplificada
// ─────────────────────────────────────────────────────────────────

/**
 * Categorías de tamaño de grano ordenadas de FINO (índice 0) a GRUESO (índice 10).
 * El índice de un valor en este array determina su posición en el eje x del log.
 */
const GRAIN_SIZE_ORDER = [
  'arcilla',
  'limo',
  'arena_muy_fina',
  'arena_fina',
  'arena_media',
  'arena_gruesa',
  'arena_muy_gruesa',
  'granulo',
  'guijarro',
  'grava',
  'bloque',
];

/** Etiquetas cortas para el encabezado del perfil granulométrico. */
const GRAIN_SIZE_LABELS = {
  arcilla:          'Ar',
  limo:             'Li',
  arena_muy_fina:   'Amf',
  arena_fina:       'Af',
  arena_media:      'Am',
  arena_gruesa:     'Ag',
  arena_muy_gruesa: 'Amg',
  granulo:          'Gr',
  guijarro:         'Gu',
  grava:            'Gv',
  bloque:           'Bl',
};

// ─────────────────────────────────────────────────────────────────
// MIGRACIÓN DE DATOS — v1 → v2 (perfil granulométrico posicional)
// ─────────────────────────────────────────────────────────────────

/**
 * Convierte una unidad del formato legado (v1) al nuevo formato (v2)
 * con campos posicionales. Preserva todos los campos originales.
 *
 * Conversiones:
 *  - `grainSize`            → `perfilGranulometrico` (un punto en alturaRelativa 0.5)
 *  - `sedimentaryStructures`→ `estructurasSedimentarias` (distribuidas equiespaciadas)
 *  - `fieldObservations`    → `observaciones` (un punto en alturaRelativa 0.5)
 *
 * Idempotente: si los campos nuevos ya existen, no los sobreescribe.
 *
 * @param {object} unit  - StratigraphicUnit (cualquier versión)
 * @returns {object}     - unidad con campos v2 garantizados
 */
function migrateUnit(unit) {
  const out = { ...unit };

  // grainSize → perfilGranulometrico
  if (!out.perfilGranulometrico || out.perfilGranulometrico.length === 0) {
    if (out.grainSize) {
      out.perfilGranulometrico = [{ alturaRelativa: 0.5, tamanoGrano: out.grainSize }];
    }
  }

  // sedimentaryStructures → estructurasSedimentarias
  if (!out.estructurasSedimentarias || out.estructurasSedimentarias.length === 0) {
    if (out.sedimentaryStructures && out.sedimentaryStructures.length > 0) {
      const n = out.sedimentaryStructures.length;
      out.estructurasSedimentarias = out.sedimentaryStructures.map((tipo, i) => ({
        alturaRelativa: n === 1 ? 0.5 : i / (n - 1),
        tipoEstructura: tipo,
      }));
    }
  }

  // fieldObservations → observaciones
  if (!out.observaciones || out.observaciones.length === 0) {
    if (out.fieldObservations && out.fieldObservations.trim()) {
      out.observaciones = [{ alturaRelativa: 0.5, texto: out.fieldObservations.trim() }];
    }
  }

  return out;
}

/**
 * Migra recursivamente un array de unidades (incluye subUnits).
 * @param {object[]} units
 * @returns {object[]}
 */
function migrateUnits(units) {
  return units.map(unit => {
    const migrated = migrateUnit(unit);
    if (migrated.subUnits && migrated.subUnits.length > 0) {
      migrated.subUnits = migrateUnits(migrated.subUnits);
    }
    return migrated;
  });
}

// ─────────────────────────────────────────────────────────────────
// UTILIDADES INTERNAS
// ─────────────────────────────────────────────────────────────────

/** @returns {string} */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/**
 * Clon profundo vía JSON: suficiente para nuestro modelo de datos
 * (sin Date objects ni Functions en las unidades).
 * @template T
 * @param {T} obj
 * @returns {T}
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ─────────────────────────────────────────────────────────────────
// CÁLCULO DE ALTURAS ACUMULADAS
// ─────────────────────────────────────────────────────────────────

/**
 * Añade `heightFromBase` y `heightToTop` a cada unidad del array.
 * Las alturas son ABSOLUTAS desde la base de la columna completa.
 * Se aplica recursivamente a `subUnits`.
 *
 * No modifica el array original — devuelve objetos nuevos.
 *
 * @param {any[]} units  - array de StratigraphicUnit, ordenado base→techo
 * @param {number} [startHeight=0]  - altura acumulada al entrar (para subUnits)
 * @returns {any[]}
 */
function calcAccumulatedHeights(units, startHeight = 0) {
  let cursor = startHeight;
  return units.map(unit => {
    const heightFromBase = cursor;
    cursor += unit.thickness;
    const heightToTop = cursor;

    const result = { ...unit, heightFromBase, heightToTop };

    if (unit.subUnits && unit.subUnits.length > 0) {
      result.subUnits = calcAccumulatedHeights(unit.subUnits, heightFromBase);
    }

    return result;
  });
}

// ─────────────────────────────────────────────────────────────────
// APLANAR JERARQUÍA
// ─────────────────────────────────────────────────────────────────

/**
 * Recorre el árbol de unidades en DFS (base→techo) y devuelve
 * una lista plana de todas las unidades (incluyendo subUnits).
 * Útil para validaciones y para calcular totales.
 *
 * @param {any[]} units
 * @returns {any[]}
 */
function flattenUnits(units) {
  const result = [];
  for (const unit of units) {
    result.push(unit);
    if (unit.subUnits && unit.subUnits.length > 0) {
      result.push(...flattenUnits(unit.subUnits));
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────
// VALIDACIÓN
// ─────────────────────────────────────────────────────────────────

/**
 * @typedef {{ code: string; message: string; unitId?: string }} ValidationIssue
 * @typedef {{ errors: ValidationIssue[]; warnings: ValidationIssue[] }} ValidationResult
 */

/**
 * Valida una columna estratigráfica.
 *
 * - `errors`   bloquean el guardado o la exportación.
 * - `warnings` son informativos; no bloquean.
 *
 * @param {any} column - StratigraphicColumn
 * @returns {ValidationResult}
 */
function validateColumn(column) {
  /** @type {ValidationIssue[]} */ const errors   = [];
  /** @type {ValidationIssue[]} */ const warnings = [];

  // ── Metadata ──────────────────────────────────────────────────

  if (!column.metadata?.name?.trim()) {
    errors.push({ code: 'META_NO_NAME', message: 'La columna debe tener un nombre.' });
  }
  if (!column.metadata?.author?.trim()) {
    warnings.push({ code: 'META_NO_AUTHOR', message: 'No se especificó autor.' });
  }
  if (!column.metadata?.location?.description?.trim()) {
    warnings.push({ code: 'META_NO_LOCATION', message: 'No se especificó ubicación.' });
  }
  if (!column.metadata?.scale || column.metadata.scale <= 0) {
    errors.push({ code: 'META_INVALID_SCALE', message: 'La escala debe ser un número positivo.' });
  }

  // ── Unidades ──────────────────────────────────────────────────

  if (!column.units || column.units.length === 0) {
    warnings.push({ code: 'NO_UNITS', message: 'La columna no tiene unidades registradas.' });
    return { errors, warnings };
  }

  const allUnits = flattenUnits(column.units);

  // IDs únicos
  const seenIds = new Set();
  for (const unit of allUnits) {
    if (seenIds.has(unit.id)) {
      errors.push({
        code: 'DUPLICATE_ID',
        unitId: unit.id,
        message: `ID duplicado "${unit.id}" — cada unidad necesita un ID único.`,
      });
    }
    seenIds.add(unit.id);
  }

  // Validación por unidad
  for (const unit of allUnits) {
    const loc = unit.code?.trim() ? `"${unit.code}"` : `id:${unit.id}`;
    const isLeaf = !unit.subUnits || unit.subUnits.length === 0;

    // Espesor > 0
    if (typeof unit.thickness !== 'number' || isNaN(unit.thickness) || unit.thickness <= 0) {
      errors.push({
        code: 'INVALID_THICKNESS',
        unitId: unit.id,
        message: `Unidad ${loc}: espesor inválido (${unit.thickness}). Debe ser > 0.`,
      });
    }

    // En nodos compuestos: espesor padre == Σ hijos
    if (!isLeaf) {
      const subSum = unit.subUnits.reduce((acc, s) => acc + (s.thickness || 0), 0);
      if (Math.abs(unit.thickness - subSum) > 0.001) {
        errors.push({
          code: 'THICKNESS_MISMATCH',
          unitId: unit.id,
          message: `Unidad ${loc}: espesor declarado (${unit.thickness} m) ≠ suma de subunidades (${subSum.toFixed(3)} m).`,
        });
      }
    }

    // En hojas: campos obligatorios para completitud del log
    if (isLeaf) {
      if (!unit.primaryLithology) {
        warnings.push({
          code: 'MISSING_LITHOLOGY',
          unitId: unit.id,
          message: `Unidad ${loc}: no tiene litología principal asignada.`,
        });
      }
      if (!unit.upperContactType) {
        warnings.push({
          code: 'MISSING_CONTACT',
          unitId: unit.id,
          message: `Unidad ${loc}: no tiene tipo de contacto superior asignado.`,
        });
      }
    }
  }

  return { errors, warnings };
}

// ─────────────────────────────────────────────────────────────────
// STORE FACTORY
// ─────────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   column:     any;
 *   computed:   any[];
 *   validation: ValidationResult;
 * }} ColumnState
 */

/**
 * Crea un store encapsulado para una columna estratigráfica.
 *
 * Patrón:
 *   - El estado interno (`_column`) nunca se expone directamente.
 *   - Cada operación calcula un nuevo estado y llama a `_commit`.
 *   - `_commit` actualiza el estado interno y notifica suscriptores.
 *   - Todos los métodos devuelven la nueva `ColumnState` (snapshot inmutable).
 *
 * @param {object} [initialMetadata]
 * @param {string} [initialMetadata.name]
 * @param {string} [initialMetadata.author]
 * @param {string} [initialMetadata.date]
 * @param {number} [initialMetadata.scale]
 * @param {object} [initialMetadata.location]
 * @param {string} [initialMetadata.notes]
 * @returns {object} store
 */
function createColumnStore(initialMetadata = {}) {

  // ── Estado interno ─────────────────────────────────────────────

  /** @type {any} StratigraphicColumn */
  let _column = {
    id: generateId(),
    metadata: {
      name:     initialMetadata.name     ?? '',
      author:   initialMetadata.author   ?? '',
      date:     initialMetadata.date     ?? new Date().toISOString().slice(0, 10),
      scale:    initialMetadata.scale    ?? 200,
      location: initialMetadata.location ?? { description: '' },
      // Cota (msnm) del tope de la columna — opcional (undefined = sin
      // configurar). Ver ColumnMetadata.topElevation en types.ts.
      topElevation: initialMetadata.topElevation,
      notes:    initialMetadata.notes,
    },
    units: [],
    /**
     * Overrides de texto para la leyenda autogenerada (ver
     * renderer-gslog.js), por grupo — litho/contact/struct — y dentro de
     * cada uno por la clave canónica de la entrada (nombre de litología,
     * código de ContactType, o nombre de estructura/fósil). Ausente o
     * vacío = usa el nombre por defecto. Se edita in-situ haciendo clic
     * sobre el texto de la leyenda en viewer.html.
     */
    legendOverrides: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  /** @type {Set<function(ColumnState): void>} */
  const _subs = new Set();

  // ── Helpers privados ───────────────────────────────────────────

  /** Produce una snapshot inmutable del estado actual. */
  function _snapshot() {
    return {
      column:     deepClone(_column),
      computed:   calcAccumulatedHeights(_column.units),
      validation: validateColumn(_column),
    };
  }

  /**
   * Aplica un nuevo estado, notifica suscriptores y devuelve snapshot.
   * @param {any} newColumn
   * @returns {ColumnState}
   */
  function _commit(newColumn) {
    _column = { ...newColumn, updatedAt: new Date().toISOString() };
    const state = _snapshot();
    _subs.forEach(fn => fn(state));
    return state;
  }

  // ── API pública ────────────────────────────────────────────────

  return {

    // ── Lectura ─────────────────────────────────────────────────

    /** @returns {ColumnState} */
    getState() { return _snapshot(); },

    /**
     * Suscribirse a cambios de estado.
     * @param {function(ColumnState): void} fn
     * @returns {function(): void} unsubscribe
     */
    subscribe(fn) {
      _subs.add(fn);
      return () => _subs.delete(fn);
    },

    // ── Metadata ────────────────────────────────────────────────

    /**
     * Actualiza campos de metadata (merge parcial).
     * @param {object} patch
     * @returns {ColumnState}
     */
    updateMetadata(patch) {
      return _commit({ ..._column, metadata: { ..._column.metadata, ...patch } });
    },

    /**
     * Reemplaza la columna COMPLETA (metadata, units, legendOverrides —
     * todo), a diferencia de updateMetadata() que solo mergea campos de
     * metadata sin tocar units. Pensado para cargar un StratigraphicColumn
     * guardado (ver ColumnasProjectState en src/projectTypes.ts) dentro de
     * un store recién creado — el sistema de Proyectos es el único caller
     * esperado hoy.
     * @param {any} column - StratigraphicColumn completo
     * @returns {ColumnState}
     */
    loadColumn(column) {
      return _commit({ ...column });
    },

    // ── Leyenda ─────────────────────────────────────────────────

    /**
     * Fija (o limpia, con texto vacío) el texto custom de una entrada de
     * la leyenda autogenerada.
     * @param {'litho'|'contact'|'struct'} kind
     * @param {string} key   - nombre canónico de la entrada (litología,
     *                         ContactType, o nombre de estructura/fósil)
     * @param {string} text  - texto nuevo; '' o solo espacios = vuelve al
     *                         nombre por defecto (elimina el override)
     * @returns {ColumnState}
     */
    setLegendLabel(kind, key, text) {
      const overrides = { ..._column.legendOverrides };
      const group = { ...(overrides[kind] || {}) };
      const trimmed = (text ?? '').trim();
      if (trimmed) group[key] = trimmed; else delete group[key];
      overrides[kind] = group;
      return _commit({ ..._column, legendOverrides: overrides });
    },

    // ── Unidades top-level ──────────────────────────────────────

    /**
     * Agrega una unidad al final de la columna o en `atIndex`.
     * Genera ID automáticamente si no se provee.
     *
     * @param {object} unitData  - Partial<StratigraphicUnit>
     * @param {number} [atIndex] - 0 = base; omitir para añadir al techo
     * @returns {ColumnState}
     */
    addUnit(unitData, atIndex) {
      const unit = {
        id:               generateId(),
        rank:             'estrato',
        code:             '',
        thickness:        1,
        upperContactType: 'neto',
        ...unitData,
      };
      const units = [..._column.units];
      const idx = atIndex !== undefined
        ? Math.max(0, Math.min(atIndex, units.length))
        : units.length;
      units.splice(idx, 0, unit);
      return _commit({ ..._column, units });
    },

    /**
     * Elimina una unidad top-level por ID (junto con sus subUnits).
     * @param {string} id
     * @returns {ColumnState}
     */
    removeUnit(id) {
      const units = _column.units.filter(u => u.id !== id);
      if (units.length === _column.units.length) {
        console.warn(`[columnas] removeUnit: id "${id}" no encontrado.`);
        return _snapshot();
      }
      return _commit({ ..._column, units });
    },

    /**
     * Mueve una unidad top-level a `toIndex` (0 = base, n-1 = techo).
     * El resto de las unidades se desplaza automáticamente.
     *
     * @param {string} id
     * @param {number} toIndex
     * @returns {ColumnState}
     */
    moveUnit(id, toIndex) {
      const units     = [..._column.units];
      const fromIndex = units.findIndex(u => u.id === id);
      if (fromIndex === -1) {
        console.warn(`[columnas] moveUnit: id "${id}" no encontrado.`);
        return _snapshot();
      }
      const [unit]    = units.splice(fromIndex, 1);
      const dest      = Math.max(0, Math.min(toIndex, units.length));
      units.splice(dest, 0, unit);
      return _commit({ ..._column, units });
    },

    /**
     * Actualiza campos de una unidad top-level (merge parcial).
     * El ID no puede modificarse vía patch.
     *
     * @param {string} id
     * @param {object} patch  - Partial<StratigraphicUnit>
     * @returns {ColumnState}
     */
    updateUnit(id, patch) {
      if (!_column.units.some(u => u.id === id)) {
        console.warn(`[columnas] updateUnit: id "${id}" no encontrado.`);
        return _snapshot();
      }
      const units = _column.units.map(u =>
        u.id === id ? { ...u, ...patch, id: u.id } : u
      );
      return _commit({ ..._column, units });
    },

    // ── Subunidades ─────────────────────────────────────────────

    /**
     * Agrega una subunidad dentro de una unidad padre (por ID de padre).
     * Actualiza automáticamente el espesor del padre = Σ espesores hijos.
     *
     * @param {string} parentId
     * @param {object} subUnitData
     * @param {number} [atIndex]
     * @returns {ColumnState}
     */
    addSubUnit(parentId, subUnitData, atIndex) {
      const newSub = {
        id:               generateId(),
        rank:             'estrato',
        code:             '',
        thickness:        1,
        upperContactType: 'neto',
        ...subUnitData,
      };
      const units = _column.units.map(u => {
        if (u.id !== parentId) return u;
        const subs = [...(u.subUnits ?? [])];
        const idx  = atIndex !== undefined
          ? Math.max(0, Math.min(atIndex, subs.length))
          : subs.length;
        subs.splice(idx, 0, newSub);
        return { ...u, subUnits: subs, thickness: subs.reduce((a, s) => a + s.thickness, 0) };
      });
      return _commit({ ..._column, units });
    },

    /**
     * Elimina una subunidad de su padre y recalcula el espesor del padre.
     * @param {string} parentId
     * @param {string} subId
     * @returns {ColumnState}
     */
    removeSubUnit(parentId, subId) {
      const units = _column.units.map(u => {
        if (u.id !== parentId) return u;
        const subs = (u.subUnits ?? []).filter(s => s.id !== subId);
        return { ...u, subUnits: subs, thickness: subs.reduce((a, s) => a + s.thickness, 0) };
      });
      return _commit({ ..._column, units });
    },

    /**
     * Actualiza una subunidad y recalcula el espesor del padre.
     * @param {string} parentId
     * @param {string} subId
     * @param {object} patch
     * @returns {ColumnState}
     */
    updateSubUnit(parentId, subId, patch) {
      const units = _column.units.map(u => {
        if (u.id !== parentId) return u;
        const subs = (u.subUnits ?? []).map(s =>
          s.id === subId ? { ...s, ...patch, id: s.id } : s
        );
        return { ...u, subUnits: subs, thickness: subs.reduce((a, s) => a + s.thickness, 0) };
      });
      return _commit({ ..._column, units });
    },

    // ── Utilidades expuestas ────────────────────────────────────

    /** Recalcula alturas sin mutar la columna. @param {any[]} units @returns {any[]} */
    calcAccumulatedHeights,
    /** Aplana la jerarquía de unidades. @param {any[]} units @returns {any[]} */
    flattenUnits,
    /** Valida una columna. @param {any} column @returns {ValidationResult} */
    validateColumn,
  };
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// Compatible con Node.js (CJS) y con bundlers (ESM vía tree-shaking).
// Para integrar en index.html: copiar las funciones al bloque <script>.
// ─────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createColumnStore,
    calcAccumulatedHeights,
    flattenUnits,
    validateColumn,
    generateId,
    migrateUnit,
    migrateUnits,
    GRAIN_SIZE_ORDER,
    GRAIN_SIZE_LABELS,
  };
}
