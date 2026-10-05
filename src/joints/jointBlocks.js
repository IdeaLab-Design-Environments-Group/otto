/**
 * @fileoverview Blockly blocks for joints, generated from the joint
 * registry: one `join <type>` block per joint type (shape/edge fields for
 * both ends, one input per parameter) plus a `ground` block. Pure builders
 * (JSON definitions, toolbox XML, AQUI text) so they are testable in Node;
 * BlocksEditor registers them with Blockly.
 *
 * @module joints/jointBlocks
 */
import { jointTypes } from './JointRegistry.js';

export const JOINT_COLOUR = '#8C6D3F';
/** Dropdown value meaning "parameter not set" (use the joint's default). */
export const UNSET = '__default';

export const jointBlockType = (id) => `aqui_join_${id}`;
export const GROUND_BLOCK = 'aqui_ground';

/** Blockly JSON definition of one joint type's block. */
export function jointBlockJson(type) {
    const def = {
        type: jointBlockType(type.id),
        message0: `join ${type.id} %1 . %2 to %3 . %4`,
        args0: [
            { type: 'field_input', name: 'A_SHAPE', text: 'a' },
            { type: 'field_input', name: 'A_EDGE', text: 'top' },
            { type: 'field_input', name: 'B_SHAPE', text: 'b' },
            { type: 'field_input', name: 'B_EDGE', text: 'bottom' }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: JOINT_COLOUR,
        tooltip: type.description,
        helpUrl: ''
    };
    Object.entries(type.params).forEach(([name, spec], i) => {
        const label = spec.label || name;
        if (spec.type === 'enum') {
            def[`message${i + 1}`] = `${label} %1`;
            def[`args${i + 1}`] = [{
                type: 'field_dropdown', name: `P_${name}`,
                options: [[`default (${spec.default})`, UNSET], ...spec.values.map(v => [String(v), String(v)])]
            }];
        } else {
            def[`message${i + 1}`] = `${label} %1`;
            def[`args${i + 1}`] = [{ type: 'input_value', name: `P_${name}`, check: 'Number' }];
        }
    });
    return def;
}

export function groundBlockJson() {
    return {
        type: GROUND_BLOCK,
        message0: 'ground %1',
        args0: [{ type: 'field_input', name: 'SHAPE', text: 'base' }],
        previousStatement: null,
        nextStatement: null,
        colour: JOINT_COLOUR,
        tooltip: 'The panel that lies on the floor when the joints are folded up in 3D.',
        helpUrl: ''
    };
}

/**
 * AQUI text for a joint block.
 * @param {{type: string, aShape, aEdge, bShape, bEdge, params: Object<string, ?string>}} b
 *   params: value text per parameter; null/'' or UNSET = not set.
 */
export function jointBlockCode({ type, aShape, aEdge, bShape, bEdge, params }) {
    const set = Object.fromEntries(Object.entries(params || {})
        .filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== UNSET));
    // The edge fields may hold a plain edge or `edge.inset(d)` / `edge.at(d)` / `line(...)`.
    return `join ${type} ${aShape}.${aEdge} ${bShape}.${bEdge}` +
        (Object.keys(set).length ? ` { ${Object.entries(set).map(([k, v]) => `${k}: ${v}`).join(' ')} }` : '') + '\n';
}

/** Toolbox category with every joint block and the ground block. */
export function jointsToolboxXml(registry = jointTypes) {
    const blocks = registry.list().map(type => `    <block type="${jointBlockType(type.id)}"/>`).join('\n');
    return `  <category name="Joints" colour="${JOINT_COLOUR}">\n${blocks}\n    <block type="${GROUND_BLOCK}"/>\n  </category>\n`;
}

const OPS = { plus: '+', minus: '-', multiply: '*', divide: '/' };

/**
 * AQUI source text of a parsed expression node (for edge fields such as
 * `left.inset(n * 2)` when code is turned into blocks). Falls back to the
 * node's plain value for anything unusual.
 */
export function exprSourceText(node) {
    switch (node?.type) {
        case 'number': return String(node.value);
        case 'identifier': return node.name;
        case 'binary_op': return `(${exprSourceText(node.left)} ${OPS[node.operator] ?? '?'} ${exprSourceText(node.right)})`;
        case 'unary_op': return `-${exprSourceText(node.operand)}`;
        case 'function_call': return `${node.name}(${node.arguments.map(exprSourceText).join(', ')})`;
        default: return String(node?.value ?? node?.name ?? '');
    }
}
