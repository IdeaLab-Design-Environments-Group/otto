/**
 * @fileoverview JevPreviewPass — the ghost of Jev's current proposal.
 *
 * A proposal is dry-run on a copy of the design (jev/dryRun); that copy is
 * exactly what Apply will produce. This pass draws the difference on top of
 * the real design, dashed and blue:
 *   - new panels, with their real cut outline (teeth, slots), tinted;
 *   - panels that gain a joint, with their new cut outline;
 *   - the new joints as dashed links between their ports.
 *
 * Input: `interaction.jevPreview = {scene, shapeIds: string[], jointIds: string[]}`
 * (set by the Jev overlay), or null.
 *
 * @module views/canvas/passes/JevPreviewPass
 */
import { resolveJoints } from '../../../joints/JointService.js';
import { withShapeRotation } from '../canvasGeometry.js';
import { toWorld } from '../../../joints/edges.js';

const BLUE = 'rgba(37, 99, 235, 0.95)';
const TINT = 'rgba(37, 99, 235, 0.08)';

export class JevPreviewPass {
    /** @param {Object} frame - See CanvasView frame contract. */
    render(frame) {
        const preview = frame.interaction?.jevPreview;
        if (!preview?.scene) return;
        const { ctx } = frame;
        const zoom = frame.viewport.zoom || 1;
        const copy = preview.scene;
        const joints = copy.jointStore.getAll().length ? resolveJoints(copy) : null;
        const isNew = (id) => !frame.scene.shapeStore.get(id);

        ctx.save();
        ctx.strokeStyle = BLUE;
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([7 / zoom, 4 / zoom]);
        for (const id of preview.shapeIds) {
            const stored = copy.shapeStore.get(id);
            if (!stored) continue;
            const shape = copy.bindingResolver.resolveShape(stored);
            const bounds = shape.getBounds();
            const cut = joints?.cuts.get(id);
            withShapeRotation(ctx, bounds, shape.rotation, () => {
                ctx.beginPath();
                if (cut) {
                    tracePolygon(ctx, cut.outer);
                    cut.holes.forEach(h => tracePolygon(ctx, h));
                } else {
                    ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
                }
                if (isNew(id)) {
                    ctx.fillStyle = TINT;
                    ctx.fill('evenodd');
                }
                ctx.stroke();
            });
            if (isNew(id)) {
                ctx.save();
                ctx.setLineDash([]);
                ctx.fillStyle = BLUE;
                ctx.font = `600 ${13 / zoom}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(id, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
                ctx.restore();
            }
        }
        if (joints) this.drawLinks(frame, copy, joints.resolved, new Set(preview.jointIds));
        ctx.restore();
    }

    /** @private Dashed links between the ports of the new joints. */
    drawLinks(frame, copy, resolved, ids) {
        const { ctx } = frame;
        const zoom = frame.viewport.zoom || 1;
        const mid = (end) => {
            const stored = copy.shapeStore.get(end.partId);
            const port = resolved.partsById.get(end.partId)?.ports[end.port];
            if (!stored || !port) return null;
            const shape = copy.bindingResolver.resolveShape(stored);
            return toWorld(shape, { x: (port.a.x + port.b.x) / 2, y: (port.a.y + port.b.y) / 2 });
        };
        ctx.fillStyle = BLUE;
        for (const joint of resolved.joints) {
            if (!ids.has(joint.id)) continue;
            const p = mid(joint.a), q = mid(joint.b);
            if (!p || !q) continue;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
            for (const end of [p, q]) {
                ctx.beginPath();
                ctx.arc(end.x, end.y, 4 / zoom, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

function tracePolygon(ctx, pts) {
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
}
