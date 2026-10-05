/**
 * @fileoverview JointsPass — draws every jointed shape with its real cut
 * outline (finger teeth, notches, slots) in place of its plain outline, so
 * the canvas shows exactly what will be cut.
 *
 * The cut comes from the joint pipeline (joints/JointService), in the shape's
 * unrotated coordinates; it is drawn inside the shape's rotation like
 * ShapesPass. The plain outline painted by ShapesPass is erased first.
 *
 * It also draws each joint as a dashed link between its two ports (with the
 * joint type), and the Join tool's picked / hovered port.
 *
 * @module views/canvas/passes/JointsPass
 */
import { resolveJoints } from '../../../joints/JointService.js';
import { withShapeRotation } from '../canvasGeometry.js';
import { namedEdges, toWorld, outlineArea } from '../../../joints/edges.js';

const LINE_WIDTH = 0.8;   // matches ShapesPass

export class JointsPass {
    /** @param {Object} frame - See CanvasView frame contract. */
    render(frame) {
        const scene = frame.scene;
        const hasJoints = scene?.jointStore && scene.jointStore.getAll().length > 0;
        if (hasJoints) {
            const joints = resolveJoints(scene);
            this.drawCuts(frame, joints);
            this.drawLinks(frame, joints);
        }
        this.drawToolPorts(frame);
    }

    /** @private Jointed shapes with their cut outline. */
    drawCuts(frame, { resolved, cuts }) {
        const { ctx } = frame;
        const zoom = frame.viewport.zoom || 1;
        for (const part of resolved.parts) {
            const cut = cuts.get(part.id);
            const stored = frame.scene.shapeStore.get(part.id);
            if (!cut || !stored) continue;
            const shape = frame.bindingResolver.resolveShape(stored);
            withShapeRotation(ctx, shape.getBounds(), shape.rotation, () => {
                // Erase the plain outline, then stroke the cut outline + holes.
                ctx.save();
                ctx.globalCompositeOperation = 'destination-out';
                ctx.lineWidth = LINE_WIDTH + 2 / zoom;
                ctx.beginPath();
                tracePolygon(ctx, part.outline);
                ctx.stroke();
                ctx.restore();

                ctx.save();
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = LINE_WIDTH;
                ctx.lineJoin = 'miter';
                ctx.beginPath();
                tracePolygon(ctx, cut.outer);
                cut.holes.forEach(h => tracePolygon(ctx, h));
                ctx.stroke();
                ctx.restore();
            });
        }
    }

    /** @private A dashed link between the two ports of every joint, labelled. */
    drawLinks(frame, { resolved }) {
        const { ctx } = frame;
        const zoom = frame.viewport.zoom || 1;
        const worldMid = (end) => {
            const stored = frame.scene.shapeStore.get(end.partId);
            const port = resolved.partsById.get(end.partId)?.ports[end.port];
            if (!stored || !port) return null;
            const shape = frame.bindingResolver.resolveShape(stored);
            return toWorld(shape, { x: (port.a.x + port.b.x) / 2, y: (port.a.y + port.b.y) / 2 });
        };
        ctx.save();
        ctx.strokeStyle = 'rgba(217, 119, 6, 0.85)';
        ctx.fillStyle = 'rgba(180, 83, 9, 0.95)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([6 / zoom, 4 / zoom]);
        ctx.font = `${11 / zoom}px sans-serif`;
        ctx.textAlign = 'center';
        for (const joint of resolved.joints) {
            const p = worldMid(joint.a), q = worldMid(joint.b);
            if (!p || !q) continue;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
            for (const end of [p, q]) {
                ctx.beginPath();
                ctx.arc(end.x, end.y, 3 / zoom, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillText(`${joint.id} ${joint.type}`, (p.x + q.x) / 2, (p.y + q.y) / 2 - 4 / zoom);
        }
        ctx.restore();
    }

    /** @private The Join tool's picked port (orange) and hovered port (blue). */
    drawToolPorts(frame) {
        const ix = frame.interaction;
        if (!ix) return;
        const draw = (port, colour) => {
            const stored = port && frame.scene.shapeStore.get(port.shape);
            if (!stored) return;
            const shape = frame.bindingResolver.resolveShape(stored);
            const e = namedEdges(shape).get(port.edge);
            if (!e) return;
            let a = e.a, b = e.b;
            if (port.kind === 'face') {
                // The face line: the edge shifted inward by the inset.
                const ux = (b.x - a.x) / e.length, uy = (b.y - a.y) / e.length;
                const area = Math.sign(outlineArea(shape)) || 1;
                const nx = -uy * area, ny = ux * area;
                a = { x: a.x + nx * port.inset, y: a.y + ny * port.inset };
                b = { x: b.x + nx * port.inset, y: b.y + ny * port.inset };
            }
            const p = toWorld(shape, a), q = toWorld(shape, b);
            const { ctx } = frame;
            const zoom = frame.viewport.zoom || 1;
            ctx.save();
            ctx.strokeStyle = colour;
            ctx.lineWidth = 4 / zoom;
            ctx.lineCap = 'round';
            if (port.kind === 'face') ctx.setLineDash([8 / zoom, 5 / zoom]);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
            ctx.restore();
        };
        if (ix.jointToolHover) draw(ix.jointToolHover, 'rgba(0, 153, 255, 0.8)');
        if (ix.jointToolFirst) draw(ix.jointToolFirst, '#ff6600');
    }
}

function tracePolygon(ctx, pts) {
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
}
