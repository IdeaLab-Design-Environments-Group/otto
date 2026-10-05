/**
 * @fileoverview JointInspector — the Properties-panel section for a
 * selected shape's joints: each joint's parameters (inputs generated from
 * its type's params schema), its findings, and remove; plus "Stand on
 * floor" to make the shape the 3D ground. Edits go through the undoable
 * joint commands.
 *
 * @module ui/JointInspector
 */
import { jointTypes } from '../joints/JointRegistry.js';
import { resolveJoints } from '../joints/JointService.js';
import { portRefText } from '../joints/ports.js';
import { RemoveJointCommand, SetJointParamsCommand, SetGroundCommand } from '../commands/jointCommands.js';

export class JointInspector {
    /** @param {import('../core/SceneContext.js').SceneContext} context */
    constructor(context) {
        this.context = context;
    }

    /**
     * Append the section for `shapeId` to `container` (nothing if it has no joints).
     * @param {HTMLElement} container
     * @param {string} shapeId
     */
    render(container, shapeId) {
        const scene = this.context.scene;
        const store = scene?.jointStore;
        if (!store) return;
        const mine = store.jointsOfShape(shapeId).map(({ joint }) => joint);
        if (mine.length === 0) return;
        const findings = resolveJoints(scene).findings;

        const root = el('section', 'joint-inspector');
        root.setAttribute('aria-label', 'Joints');
        root.appendChild(el('h4', 'joint-inspector__title', `Joints (${mine.length})`));
        for (const joint of mine) root.appendChild(this.renderJoint(joint, findings.filter(f => f.target === joint.id)));

        const ground = el('button', 'joint-inspector__btn', store.ground === shapeId ? 'On the floor in 3D ✓' : 'Stand this shape on the floor in 3D');
        ground.type = 'button';
        ground.disabled = store.ground === shapeId;
        ground.addEventListener('click', () => this.run(new SetGroundCommand({ shape: shapeId }), root));
        root.appendChild(ground);
        container.appendChild(root);
    }

    /** @private */
    renderJoint(joint, findings) {
        const type = jointTypes.get(joint.type);
        const box = el('div', 'joint-inspector__joint');
        const head = el('div', 'joint-inspector__head');
        head.appendChild(el('span', 'joint-inspector__name', `${joint.id} · ${type?.label || joint.type}`));
        const remove = el('button', 'joint-inspector__btn', '×');
        remove.type = 'button';
        remove.setAttribute('aria-label', `Remove joint ${joint.id}`);
        remove.addEventListener('click', () => this.run(new RemoveJointCommand({ id: joint.id }), box));
        head.appendChild(remove);
        box.appendChild(head);
        box.appendChild(el('div', 'assembly-note', `${portRefText(joint.a)} ↔ ${portRefText(joint.b)}`));

        if (type) {
            const grid = el('div', 'joint-inspector__grid');
            for (const [name, spec] of Object.entries(type.params)) {
                const id = `joint-${joint.id}-${name}`;
                const label = el('label', null, spec.label || name);
                label.setAttribute('for', id);
                let input;
                const current = joint.params?.[name];
                if (spec.type === 'enum') {
                    input = el('select', 'joint-inspector__input');
                    input.appendChild(option('', `default (${spec.default})`));
                    for (const v of spec.values) input.appendChild(option(String(v), String(v)));
                    input.value = current === undefined ? '' : String(current);
                } else {
                    input = el('input', 'joint-inspector__input');
                    input.type = 'text';
                    input.value = current === undefined ? '' : String(current);
                    input.placeholder = spec.default === null ? 'auto' : String(spec.default);
                }
                input.id = id;
                if (spec.help) input.title = spec.help;
                input.addEventListener('change', () => {
                    const raw = input.value.trim();
                    const value = raw === '' ? undefined : (spec.type !== 'enum' && Number.isFinite(Number(raw)) ? Number(raw) : raw);
                    this.run(new SetJointParamsCommand({ id: joint.id, params: { [name]: value } }), box);
                });
                grid.append(label, input);
            }
            box.appendChild(grid);
        }
        for (const f of findings) {
            box.appendChild(el('p', `joint-inspector__issue${f.severity === 'error' ? ' is-error' : ''}`, f.message));
        }
        return box;
    }

    /** Execute a command on the active tab; a rejection is shown, not thrown. */
    async run(command, where) {
        try {
            await this.context.history.execute(command);
        } catch (error) {
            const note = el('p', 'joint-inspector__issue is-error', error.message);
            note.setAttribute('role', 'alert');
            where.appendChild(note);
        }
    }
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function option(value, label) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    return o;
}
