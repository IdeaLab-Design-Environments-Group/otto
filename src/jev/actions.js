/**
 * @fileoverview Jev's actions — the only ways Jev can change a design.
 *
 * Each action is a small, schema-checked step that becomes one of Otto's
 * existing undoable commands, so Jev edits through exactly the same path as
 * the code editor, the canvas and the blocks. Jev never calls these
 * directly: it bundles steps into a proposal (see JevSession), which is
 * checked on a copy of the scene before anyone sees it.
 *
 * Risk classes drive the Policy: 'low' (sizes, joint settings),
 * 'structural' (new panels and joints), 'destructive' (removals).
 *
 * @module jev/actions
 */
import { ShapeRegistry } from '../models/shapes/ShapeRegistry.js';
import { AddShapeCommand, RemoveShapesCommand, SetShapePropertyCommand } from '../commands/shapeCommands.js';
import { CompositeCommand } from '../commands/Command.js';
import { AddJointCommand, RemoveJointCommand, SetJointParamsCommand, SetGroundCommand } from '../commands/jointCommands.js';
import { jointTypes } from '../joints/JointRegistry.js';

const portRef = {
    type: 'object', required: ['shape'], additionalProperties: false,
    properties: {
        shape: { type: 'string' },
        edge: { type: 'string' },
        inset: { type: 'number' },
        at: { type: 'number' },
        line: { type: 'array', items: { type: 'number' } }
    }
};

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PLACEMENT_GAP = 40;

/** Where a new panel goes on the canvas when Jev does not say: right of everything. */
function nextFreeX(scene) {
    let right = 0;
    for (const s of scene.shapeStore.getAll()) {
        const b = scene.bindingResolver.resolveShape(s).getBounds?.();
        if (b && Number.isFinite(b.x + b.width)) right = Math.max(right, b.x + b.width);
    }
    return scene.shapeStore.getAll().length ? right + PLACEMENT_GAP : 0;
}

export const JEV_ACTIONS = {
    add_panel: {
        description: 'Add a rectangular panel (a sheet part). width/height in mm on the canvas; thickness is the sheet thickness.',
        risk: 'structural',
        schema: {
            type: 'object', required: ['id', 'width', 'height'], additionalProperties: false,
            properties: {
                id: { type: 'string', minLength: 1 },
                width: { type: 'number', minimum: 1, maximum: 5000 },
                height: { type: 'number', minimum: 1, maximum: 5000 },
                thickness: { type: 'number', minimum: 0.5, maximum: 50 },
                x: { type: 'number' },
                y: { type: 'number' }
            }
        },
        toCommand(args, scene) {
            if (!NAME.test(args.id)) throw new Error(`'${args.id}' is not a valid name (letters, digits, _)`);
            if (scene.shapeStore.get(args.id)) throw new Error(`a shape named '${args.id}' already exists`);
            const x = args.x ?? nextFreeX(scene), y = args.y ?? 0;
            const shape = ShapeRegistry.create('rectangle', { x, y },
                { id: args.id, x, y, width: args.width, height: args.height, depth: args.thickness ?? 6 }, scene.shapeStore);
            return new AddShapeCommand(shape, { select: false });
        }
    },

    set_panel_size: {
        description: 'Change a panel\'s width, height and/or thickness (mm).',
        risk: 'low',
        schema: {
            type: 'object', required: ['id'], additionalProperties: false,
            properties: {
                id: { type: 'string' },
                width: { type: 'number', minimum: 1, maximum: 5000 },
                height: { type: 'number', minimum: 1, maximum: 5000 },
                thickness: { type: 'number', minimum: 0.5, maximum: 50 }
            }
        },
        toCommand(args, scene) {
            const shape = scene.shapeStore.get(args.id);
            if (!shape) throw new Error(`no shape named '${args.id}'`);
            const changes = [['width', args.width], ['height', args.height], ['depth', args.thickness]]
                .filter(([prop, v]) => v !== undefined && prop in shape);
            if (changes.length === 0) throw new Error('give width, height or thickness');
            return new CompositeCommand(`Resize ${args.id}`, changes.map(([prop, v]) => new SetShapePropertyCommand(args.id, prop, v)));
        }
    },

    remove_panel: {
        description: 'Remove a shape and every joint attached to it.',
        risk: 'destructive',
        schema: { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string' } } },
        toCommand(args, scene) {
            if (!scene.shapeStore.get(args.id)) throw new Error(`no shape named '${args.id}'`);
            return new RemoveShapesCommand([args.id]);
        }
    },

    join: {
        description: 'Join two ports with a joint (finger, tab_slot, cross_lap, splice, bolt, hinge).',
        risk: 'structural',
        schema: {
            type: 'object', required: ['type', 'a', 'b'], additionalProperties: false,
            properties: {
                type: { type: 'string', enum: jointTypes.ids() },
                a: portRef, b: portRef,
                params: { type: 'object' }
            }
        },
        toCommand(args) {
            return new AddJointCommand({ type: args.type, a: args.a, b: args.b, params: args.params || {} });
        }
    },

    set_joint: {
        description: 'Change a joint\'s parameters (e.g. count, fit, side, tabs, lock).',
        risk: 'low',
        schema: {
            type: 'object', required: ['id', 'params'], additionalProperties: false,
            properties: { id: { type: 'string' }, params: { type: 'object' } }
        },
        toCommand(args) {
            return new SetJointParamsCommand({ id: args.id, params: args.params });
        }
    },

    remove_joint: {
        description: 'Remove a joint.',
        risk: 'destructive',
        schema: { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string' } } },
        toCommand(args) {
            return new RemoveJointCommand({ id: args.id });
        }
    },

    set_ground: {
        description: 'Choose the panel that lies on the floor in 3D.',
        risk: 'low',
        schema: { type: 'object', required: ['shape'], additionalProperties: false, properties: { shape: { type: 'string' } } },
        toCommand(args) {
            return new SetGroundCommand({ shape: args.shape });
        }
    }
};

export const RISK_ORDER = ['low', 'structural', 'destructive'];

/** The highest risk among a proposal's steps. */
export function proposalRisk(steps) {
    return steps.reduce((worst, s) => {
        const r = JEV_ACTIONS[s.action]?.risk ?? 'destructive';
        return RISK_ORDER.indexOf(r) > RISK_ORDER.indexOf(worst) ? r : worst;
    }, 'low');
}
