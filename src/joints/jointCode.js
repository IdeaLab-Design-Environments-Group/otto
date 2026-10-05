/**
 * @fileoverview AQUI source for joints (canvas → code direction).
 *
 *   join finger base.top wall.bottom { count: n fit: loose }
 *   ground base
 *
 * Only explicitly set parameters are written; enum words and expression
 * text are written as-is, numbers trimmed. Pure, so the round trip
 * code → scene → code is testable without the editor.
 *
 * @module joints/jointCode
 */
import { jointTypes } from './JointRegistry.js';
import { portRefText } from './ports.js';

/**
 * @param {{getAll: Function, ground: ?string}} store - A JointStore.
 * @param {(shapeId: string) => string} nameOf - Shape id → its name in code.
 * @param {import('./JointRegistry.js').JointRegistry} [registry]
 * @returns {string[]} Source lines (empty when there are no joints).
 */
export function emitJoints(store, nameOf, registry = jointTypes) {
    const lines = store.getAll().map(joint => formatJoinLine(joint, nameOf, registry));
    if (store.ground) lines.push(`ground ${nameOf(store.ground)}`);
    return lines;
}

/** One `join` line for a joint record. */
export function formatJoinLine(joint, nameOf, registry = jointTypes) {
    const params = Object.entries(joint.params || {})
        .map(([key, value]) => `${key}: ${formatValue(value, registry.get(joint.type)?.params?.[key])}`);
    const head = `join ${joint.type} ${portRefText(joint.a, nameOf)} ${portRefText(joint.b, nameOf)}`;
    return params.length ? `${head} { ${params.join(' ')} }` : head;
}

function formatValue(value, spec) {
    if (typeof value === 'number') return Number(value.toFixed(4)).toString();
    if (spec?.type === 'enum') return String(value);
    return String(value);   // expression text over parameters
}
