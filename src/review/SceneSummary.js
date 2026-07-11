/**
 * @fileoverview Turns an Otto scene into a compact, LLM-friendly description.
 *
 * The Fabrication Coach needs to reason about a design, but a raw serialized
 * scene (nested JSON, ids, viewport data) is noisy and burns tokens. This
 * module distills the scene into a short structured summary and a plain-text
 * rendering suitable for a prompt.
 *
 * It is deliberately **pure and DOM-free**: it takes plain data (resolved
 * shapes, parameters, optional AQUI code) and returns plain data, so it can be
 * unit-tested under Node without a canvas or a network. Prompt framing and the
 * Gemini call live in {@link module:review/FabricationCoach}.
 */

/**
 * Otto works in millimetres throughout (see ARCHITECTURE.md §4). The coach is
 * told this so its advice ("a 4 mm tab is too thin") is dimensionally grounded.
 */
export const SCENE_UNIT = 'mm';

/** Round to at most 2 decimals, dropping trailing zeros (12.300 -> 12.3). */
function tidy(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return value;
    return Math.round(value * 100) / 100;
}

/**
 * Describe a single property's binding, if any, as a short human string.
 * @param {import('../models/Binding.js').Binding} binding
 * @param {Map<string,string>} paramNames  parameterId -> parameter name
 * @returns {?string} e.g. "= radius", "= width * 2", or null for a literal.
 */
function describeBinding(binding, paramNames) {
    if (!binding) return null;
    switch (binding.type) {
        case 'parameter': {
            const name = paramNames.get(binding.parameterId);
            return name ? `= ${name}` : '= (missing parameter)';
        }
        case 'expression':
            return `= ${binding.expression}`;
        // A literal binding carries the same value already shown numerically,
        // so it adds no information to the summary.
        case 'literal':
        default:
            return null;
    }
}

/**
 * Build a structured summary of the scene.
 *
 * @param {Object} input
 * @param {Array<Object>} input.shapes  Resolved shape instances (numeric
 *   property values, still carrying their `bindings` map). Typically
 *   `shapeStore.getResolved()`.
 * @param {Array<Object>} [input.parameters]  Parameter instances / plain
 *   `{ id, name, value, min, max }` objects. Typically `parameterStore.getAll()`.
 * @param {string} [input.code]  Current AQUI source, if the user authored any.
 * @returns {{unit: string, parameters: Array, shapes: Array, code: ?string,
 *   counts: {shapes: number, parameters: number}}}
 */
export function buildSceneSummary({ shapes = [], parameters = [], code = '' } = {}) {
    const paramNames = new Map();
    const paramSummary = parameters.map((p) => {
        if (p.id != null && p.name != null) paramNames.set(p.id, p.name);
        const min = p.min === -Infinity || p.min == null ? null : tidy(p.min);
        const max = p.max === Infinity || p.max == null ? null : tidy(p.max);
        return { name: p.name, value: tidy(p.getValue ? p.getValue() : p.value), min, max };
    });

    const shapeSummary = shapes.map((shape) => {
        const bindable = typeof shape.getBindableProperties === 'function'
            ? shape.getBindableProperties()
            : [];
        const props = {};
        for (const key of bindable) {
            const entry = { value: tidy(shape[key]) };
            const bindingDesc = describeBinding(shape.bindings?.[key], paramNames);
            if (bindingDesc) entry.boundTo = bindingDesc;
            props[key] = entry;
        }
        return { id: shape.id, type: shape.type, props };
    });

    const trimmedCode = typeof code === 'string' ? code.trim() : '';

    return {
        unit: SCENE_UNIT,
        parameters: paramSummary,
        shapes: shapeSummary,
        code: trimmedCode || null,
        counts: { shapes: shapeSummary.length, parameters: paramSummary.length }
    };
}

/**
 * Render a summary to compact plain text for a prompt. One shape per line,
 * bound properties annotated with their driver.
 * @param {ReturnType<typeof buildSceneSummary>} summary
 * @returns {string}
 */
export function sceneSummaryToText(summary) {
    const lines = [`Units: ${summary.unit}. Otto is a 2.5D parametric design tool`
        + ` (flat pieces with a material "depth" thickness and "z" elevation).`];

    lines.push('', `Parameters (${summary.counts.parameters}):`);
    if (summary.parameters.length === 0) {
        lines.push('  (none)');
    } else {
        for (const p of summary.parameters) {
            const range = (p.min != null || p.max != null)
                ? ` [${p.min ?? '-∞'}..${p.max ?? '∞'}]`
                : '';
            lines.push(`  ${p.name} = ${p.value}${range}`);
        }
    }

    lines.push('', `Shapes (${summary.counts.shapes}):`);
    if (summary.shapes.length === 0) {
        lines.push('  (none)');
    } else {
        for (const s of summary.shapes) {
            const parts = Object.entries(s.props).map(([key, entry]) => {
                const bound = entry.boundTo ? ` (${entry.boundTo})` : '';
                return `${key}=${entry.value}${bound}`;
            });
            lines.push(`  ${s.type} "${s.id}": ${parts.join(', ')}`);
        }
    }

    if (summary.code) {
        lines.push('', 'AQUI source:', summary.code);
    }

    return lines.join('\n');
}
