/**
 * @fileoverview Joint commands — the single write path to a scene's
 * JointStore (code, canvas, blocks and later Jev all go through these).
 *
 * Each command takes ONE JSON-friendly argument object, so agent tools and
 * the inspector can build it from validated data. Undo restores the joint
 * store captured around the first execution. A change that leaves its joint
 * with an error (unknown edge, bad parameter…) is rejected and rolled back.
 *
 * @module commands/jointCommands
 */
import { Command } from './Command.js';
import { resolveJoints } from '../joints/JointService.js';
import { jointTypes } from '../joints/JointRegistry.js';

/** Base: subclasses implement mutate(store, scene) and may override check(). */
export class JointCommand extends Command {
    constructor(label, args = {}) {
        super(label);
        this.args = structuredClone(args);
        this.before = null;
        this.after = null;
    }

    execute(scene) {
        if (this.after) {
            scene.jointStore.fromJSON(this.after);
            return;
        }
        this.before = scene.jointStore.toJSON();
        try {
            this.mutate(scene.jointStore, scene);
            this.check(scene);
        } catch (error) {
            scene.jointStore.fromJSON(this.before);
            throw error;
        }
        this.after = scene.jointStore.toJSON();
    }

    undo(scene) {
        scene.jointStore.fromJSON(this.before);
    }

    mutate() {
        throw new Error('mutate() must be implemented');
    }

    check() {}
}

/** A port reference with only its known fields (edge / inset / at / line). */
function portRef(ref) {
    const out = { shape: ref.shape };
    if (ref.line) out.line = [...ref.line];
    else out.edge = ref.edge;
    if (ref.inset !== undefined) out.inset = ref.inset;
    if (ref.at !== undefined) out.at = ref.at;
    return out;
}

/** Reject if the joint ends up with an error finding. */
function rejectErrors(scene, jointId) {
    const errors = resolveJoints(scene).findings.filter(f => f.target === jointId && f.severity === 'error');
    if (errors.length > 0) throw new Error(errors.map(f => f.message).join('; '));
}

export class AddJointCommand extends JointCommand {
    /** @param {{type: string, a: {shape, edge}, b: {shape, edge}, params?: Object, id?: string}} args */
    constructor(args) {
        super(`Join ${args.a?.shape}.${args.a?.edge} – ${args.b?.shape}.${args.b?.edge}`, args);
    }

    mutate(store) {
        if (!jointTypes.has(this.args.type)) {
            throw new Error(`Unknown joint type '${this.args.type}' (known: ${jointTypes.ids().join(', ')})`);
        }
        this.args.id = this.args.id || store.nextId();   // fixed for redo
        store.add({
            id: this.args.id,
            type: this.args.type,
            a: portRef(this.args.a),
            b: portRef(this.args.b),
            params: { ...(this.args.params || {}) }
        });
    }

    check(scene) {
        rejectErrors(scene, this.args.id);
    }
}

export class RemoveJointCommand extends JointCommand {
    /** @param {{id: string}} args */
    constructor(args) {
        super(`Remove joint ${args.id}`, args);
    }

    mutate(store) {
        if (!store.remove(this.args.id)) throw new Error(`Unknown joint '${this.args.id}'`);
    }
}

export class SetJointParamsCommand extends JointCommand {
    /** @param {{id: string, params: Object}} args - undefined values reset to default. */
    constructor(args) {
        super(`Edit joint ${args.id}`, args);
    }

    mutate(store) {
        store.setParams(this.args.id, this.args.params || {});
    }

    check(scene) {
        rejectErrors(scene, this.args.id);
    }

    /** Merge rapid edits of the same joint (slider drags) into one undo step. */
    coalesceWith(next) {
        if (!(next instanceof SetJointParamsCommand) || next.args.id !== this.args.id) return false;
        if (next.timestamp - this.timestamp > 1000) return false;
        this.after = next.after;
        this.timestamp = next.timestamp;
        return true;
    }
}

export class SetGroundCommand extends JointCommand {
    /** @param {{shape: ?string}} args */
    constructor(args) {
        super('Set ground', args);
    }

    mutate(store, scene) {
        if (this.args.shape && !scene.shapeStore.get(this.args.shape)) {
            throw new Error(`Unknown shape '${this.args.shape}'`);
        }
        store.setGround(this.args.shape || null);
    }
}

export class SetFabricationCommand extends JointCommand {
    /** @param {{bed?: {w, h}, kerf?: number, margin?: number, gap?: number, labels?: boolean}} args - a patch */
    constructor(args) {
        super('Laser settings', args);
    }

    mutate(store) {
        const next = { ...store.getFabrication(), ...this.args, bed: { ...store.getFabrication().bed, ...(this.args.bed || {}) } };
        if (!(next.bed.w > 0 && next.bed.h > 0)) throw new Error('The bed width and height must be positive');
        if (!(next.kerf >= 0 && next.kerf < 2)) throw new Error('Kerf must be between 0 and 2 mm');
        if (!(next.margin >= 0) || !(next.gap >= 0)) throw new Error('Margin and gap cannot be negative');
        store.setFabrication(next);
    }
}

const portRefSchema = {
    type: 'object', required: ['shape'], additionalProperties: false,
    properties: {
        shape: { type: 'string' },
        edge: { type: 'string' },
        inset: { type: ['number', 'string'] },
        at: { type: ['number', 'string'] },
        line: { type: 'array', items: { type: ['number', 'string'] } }
    }
};

/** CommandCatalog registrations: [name, factory, meta]. */
export const JOINT_COMMANDS = [
    ['joint.add', (a) => new AddJointCommand(a), {
        summary: 'Join two shapes at named edges.', risk: 'structural',
        schema: {
            type: 'object', required: ['type', 'a', 'b'], additionalProperties: false,
            properties: {
                type: { type: 'string', enum: jointTypes.ids() },
                a: portRefSchema, b: portRefSchema,
                params: { type: 'object' },
                id: { type: 'string' }
            }
        }
    }],
    ['joint.remove', (a) => new RemoveJointCommand(a), {
        summary: 'Remove a joint.', risk: 'structural',
        schema: { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string' } } }
    }],
    ['joint.setParams', (a) => new SetJointParamsCommand(a), {
        summary: 'Change joint parameters (numbers, enum words, or expressions over parameters).', risk: 'low',
        schema: {
            type: 'object', required: ['id', 'params'], additionalProperties: false,
            properties: { id: { type: 'string' }, params: { type: 'object' } }
        }
    }],
    ['joint.setFabrication', (a) => new SetFabricationCommand(a), {
        summary: 'Laser bed size, kerf, margin between parts, part labels.', risk: 'low',
        schema: {
            type: 'object', additionalProperties: false,
            properties: {
                bed: { type: 'object', additionalProperties: false, properties: { w: { type: 'number', minimum: 1 }, h: { type: 'number', minimum: 1 } } },
                kerf: { type: 'number', minimum: 0, maximum: 2 },
                margin: { type: 'number', minimum: 0 },
                gap: { type: 'number', minimum: 0 },
                labels: { type: 'boolean' }
            }
        }
    }],
    ['joint.setGround', (a) => new SetGroundCommand(a), {
        summary: 'Choose the shape that lies on the floor in 3D.', risk: 'low',
        schema: {
            type: 'object', required: ['shape'], additionalProperties: false,
            properties: { shape: { type: ['string', 'null'] } }
        }
    }]
];
