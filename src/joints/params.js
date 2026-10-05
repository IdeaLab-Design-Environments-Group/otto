/**
 * @fileoverview Joint parameter schemas and their resolution.
 *
 * A joint type declares its parameters once:
 *   { name: {type: 'int'|'number'|'enum', default, min?, max?, values?, unit?, label?} }
 * and that schema validates code, drives the inspector and the generated
 * Blockly block. `default: null` means "chosen automatically".
 *
 * Raw values are numbers, enum words, or expression strings over the scene
 * parameters (evaluated strictly: an unknown name is an error, never 0).
 *
 * @module joints/params
 */
import { ExpressionParser } from '../models/ExpressionParser.js';

const parser = new ExpressionParser();

/**
 * @param {Object} schema - The joint type's params schema.
 * @param {Object} raw - The joint's stored params.
 * @param {Object} globals - Scene parameter values by name.
 * @returns {{values: Object, errors: string[]}}
 */
export function resolveParams(schema, raw = {}, globals = {}) {
    const values = {};
    const errors = [];
    for (const name of Object.keys(raw)) {
        if (!schema[name]) errors.push(`unknown parameter '${name}' (allowed: ${Object.keys(schema).join(', ')})`);
    }
    for (const [name, spec] of Object.entries(schema)) {
        const given = raw[name];
        if (given === undefined || given === null || given === '') {
            values[name] = spec.default;
            continue;
        }
        if (spec.type === 'enum') {
            if (spec.values.includes(given)) values[name] = given;
            else {
                errors.push(`${name} must be one of ${spec.values.join(', ')} (got ${given})`);
                values[name] = spec.default;
            }
            continue;
        }
        let v;
        try {
            v = typeof given === 'number' ? given : parser.evaluate(parser.parse(String(given)), globals, { strict: true });
        } catch (e) {
            errors.push(`${name}: ${e.message}`);
            values[name] = spec.default;
            continue;
        }
        if (spec.type === 'int') v = Math.round(v);
        if (spec.values && !spec.values.includes(v)) {
            errors.push(`${name} must be one of ${spec.values.join(', ')} (got ${v})`);
            v = spec.default;
        } else if ((spec.min !== undefined && v < spec.min) || (spec.max !== undefined && v > spec.max)) {
            errors.push(`${name} = ${v} is outside [${spec.min ?? '-∞'}, ${spec.max ?? '∞'}]`);
            v = Math.min(spec.max ?? Infinity, Math.max(spec.min ?? -Infinity, v));
        }
        values[name] = v;
    }
    return { values, errors };
}

/** Fit clearance added per mating face, in mm. */
export const FIT_CLEARANCE = Object.freeze({ snug: 0, press: -0.05, loose: 0.15 });

/**
 * Where B's port starts along A's port. Mating ports run in opposite
 * directions, so B spans [s − lenB, s] in A's coordinates.
 */
export function alongEdge(align, lenA, lenB) {
    if (align === 'start') return lenB;
    if (align === 'end') return lenA;
    return lenA / 2 + lenB / 2;
}
