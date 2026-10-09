/**
 * @fileoverview What the canvas draws as the ghost of a shown proposal:
 * the dry-run copy of the design, plus which panels and joints in it are new
 * or changed, and where they are (to pin the proposal card and fit the view).
 *
 * @module jev/ghost
 */
import { portRefText } from '../joints/ports.js';

const jointKey = (j) => `${j.type}|${[portRefText(j.a), portRefText(j.b)].sort().join('|')}`;

/**
 * @param {Object} proposal - A JevSession proposal (status 'shown').
 * @param {Object} scene - The real design.
 * @returns {?{scene: Object, shapeIds: string[], jointIds: string[],
 *   bounds: ?{x: number, y: number, width: number, height: number}}}
 */
export function ghostOf(proposal, scene) {
    const copy = proposal?.preview?.scene;
    if (!copy) return null;
    const existing = new Set(scene.jointStore.getAll().map(jointKey));
    const newJoints = copy.jointStore.getAll().filter(j => !existing.has(jointKey(j)));

    const shapeIds = new Set();
    for (const step of proposal.steps) {
        if (step.action === 'add_panel' || step.action === 'set_panel_size') shapeIds.add(step.args.id);
    }
    for (const j of newJoints) {
        shapeIds.add(j.a.shape);
        shapeIds.add(j.b.shape);
    }

    let bounds = null;
    for (const id of shapeIds) {
        const stored = copy.shapeStore.get(id);
        if (!stored) continue;
        bounds = union(bounds, copy.bindingResolver.resolveShape(stored).getBounds());
    }
    return { scene: copy, shapeIds: [...shapeIds], jointIds: newJoints.map(j => j.id), bounds };
}

/** Union of two {x, y, width, height} boxes (either may be null). */
export function union(a, b) {
    if (!a) return b ? { ...b } : null;
    if (!b) return { ...a };
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return {
        x, y,
        width: Math.max(a.x + a.width, b.x + b.width) - x,
        height: Math.max(a.y + a.height, b.y + b.height) - y
    };
}
