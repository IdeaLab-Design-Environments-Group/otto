/**
 * @fileoverview Minimal JSON-schema validator for structured command / tool
 * arguments (e.g. arguments an LLM proposes for a command).
 *
 * Supports the subset Otto's schemas use: `type` (object, array, string,
 * number, integer, boolean, null), `required`, `properties`,
 * `additionalProperties: false`, `items`, `enum`, `minimum`, `maximum`,
 * `minLength`. Anything else is ignored. Dependency-free and pure.
 *
 * @module core/jsonSchemaLite
 */

const TYPE_CHECKS = {
    object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
    array: (v) => Array.isArray(v),
    string: (v) => typeof v === 'string',
    number: (v) => typeof v === 'number' && Number.isFinite(v),
    integer: (v) => Number.isInteger(v),
    boolean: (v) => typeof v === 'boolean',
    null: (v) => v === null
};

/**
 * Validate a value against a schema.
 * @param {Object} schema
 * @param {*} value
 * @returns {{ok: boolean, errors: Array<{path: string, message: string}>}}
 */
export function validateSchema(schema, value) {
    const errors = [];
    check(schema || {}, value, '$', errors);
    return { ok: errors.length === 0, errors };
}

function check(schema, value, path, errors) {
    if (schema.type) {
        const types = Array.isArray(schema.type) ? schema.type : [schema.type];
        if (!types.some(t => TYPE_CHECKS[t]?.(value))) {
            errors.push({ path, message: `expected ${types.join(' | ')}` });
            return;
        }
    }
    if (schema.enum && !schema.enum.some(e => e === value)) {
        errors.push({ path, message: `expected one of ${schema.enum.join(', ')}` });
    }
    if (typeof value === 'number') {
        if (schema.minimum !== undefined && value < schema.minimum) {
            errors.push({ path, message: `must be >= ${schema.minimum}` });
        }
        if (schema.maximum !== undefined && value > schema.maximum) {
            errors.push({ path, message: `must be <= ${schema.maximum}` });
        }
    }
    if (typeof value === 'string' && schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push({ path, message: `must have length >= ${schema.minLength}` });
    }
    if (Array.isArray(value) && schema.items) {
        value.forEach((item, i) => check(schema.items, item, `${path}[${i}]`, errors));
    }
    if (TYPE_CHECKS.object(value)) {
        const props = schema.properties || {};
        for (const key of schema.required || []) {
            if (value[key] === undefined) {
                errors.push({ path: `${path}.${key}`, message: 'is required' });
            }
        }
        for (const [key, v] of Object.entries(value)) {
            if (props[key]) {
                check(props[key], v, `${path}.${key}`, errors);
            } else if (schema.additionalProperties === false) {
                errors.push({ path: `${path}.${key}`, message: 'is not allowed' });
            }
        }
    }
}
