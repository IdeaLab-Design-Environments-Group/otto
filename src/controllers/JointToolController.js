/**
 * @fileoverview JointToolController — the canvas Join tool.
 *
 * Click an edge (or a face) of one shape, then an edge or face of another:
 * a popover lists the joints that fit (joints/jointTool) and the chosen one
 * is added with the undoable `joint.add` command. Escape or a click on
 * empty canvas cancels. The first port and the hovered port are drawn by
 * JointsPass from `interaction.jointToolFirst` / `jointToolHover`.
 *
 * @module controllers/JointToolController
 */
import { edgePort, facePort, jointOptions } from '../joints/jointTool.js';
import { toLocal } from '../joints/edges.js';
import { AddJointCommand } from '../commands/jointCommands.js';

export class JointToolController {
    /**
     * @param {Object} deps
     * @param {import('../core/SceneContext.js').SceneContext} deps.context
     * @param {import('../services/HitTestService.js').HitTestService} deps.hits
     * @param {Object} deps.vc - ViewportController (screen → world).
     * @param {Object} deps.view - CanvasView (requestRender, canvas).
     * @param {Object} deps.interaction - InteractionState.
     */
    constructor({ context, hits, vc, view, interaction }) {
        Object.assign(this, { context, hits, vc, view, interaction });
        this.popover = null;
    }

    /** The port under a canvas point (edge first, then face), or null. */
    portAt(x, y) {
        const store = this.context.shapeStore;
        const resolve = (s) => this.context.bindingResolver.resolveShape(s);
        const edgeHit = this.hits.hitTestEdge(x, y, { allShapes: true });
        if (edgeHit?.edge?.shapeId != null && (edgeHit.edge.pathIndex ?? 0) === 0) {
            const shape = resolve(store.get(edgeHit.edge.shapeId));
            const port = edgePort(shape, edgeHit.edge.index, toLocal(shape, edgeHit.position));
            if (port) return port;
        }
        const stored = this.hits.hitTest(x, y);
        if (!stored) return null;
        const shape = resolve(stored);
        return facePort(shape, toLocal(shape, this.vc.screenToWorld(x, y)));
    }

    onHover(x, y) {
        this.interaction.jointToolHover = this.popover ? null : this.portAt(x, y);
        this.view.requestRender();
    }

    onClick(x, y, clientX, clientY) {
        if (this.popover) {
            this.closePopover();
            return;
        }
        const port = this.portAt(x, y);
        const first = this.interaction.jointToolFirst;
        if (!port) {
            this.cancel();
            return;
        }
        if (!first || first.shape === port.shape) {
            this.interaction.jointToolFirst = port;
            this.view.requestRender();
            return;
        }
        const options = jointOptions(first, port);
        if (options.length === 0) {
            this.interaction.jointToolFirst = port;
            this.view.requestRender();
            return;
        }
        this.showPopover(options, clientX, clientY);
    }

    cancel() {
        this.closePopover();
        this.interaction.jointToolFirst = null;
        this.interaction.jointToolHover = null;
        this.view.requestRender();
    }

    /** @private */
    showPopover(options, clientX, clientY) {
        const pop = document.createElement('div');
        pop.className = 'joint-popover';
        pop.setAttribute('role', 'dialog');
        pop.setAttribute('aria-label', 'Choose a joint');
        pop.style.left = `${clientX + 8}px`;
        pop.style.top = `${clientY + 8}px`;
        const title = document.createElement('div');
        title.className = 'joint-popover__title';
        title.textContent = 'Join with…';
        pop.appendChild(title);
        const message = document.createElement('div');
        message.className = 'joint-popover__error';
        for (const option of options) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'joint-popover__option';
            button.textContent = option.label;
            button.addEventListener('click', async () => {
                try {
                    await this.context.history.execute(new AddJointCommand({ type: option.type, a: option.a, b: option.b }));
                    this.cancel();
                } catch (error) {
                    message.textContent = error.message;
                }
            });
            pop.appendChild(button);
        }
        pop.appendChild(message);
        pop.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); this.cancel(); }
        });
        document.body.appendChild(pop);
        this.popover = pop;
        pop.querySelector('button')?.focus();
    }

    /** @private */
    closePopover() {
        this.popover?.remove();
        this.popover = null;
    }
}
