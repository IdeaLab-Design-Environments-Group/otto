/**
 * @fileoverview JoineryPass — draws finger-joint / dovetail previews on edges
 * that carry joinery metadata, plus the interactive depth handle shown while
 * the owning shape is selected.
 *
 * Ported from CanvasRenderer.renderEdgeJoinery(), renderFingerJoinery(), and
 * renderJoineryHandles().
 *
 * This pass is the ONE sanctioned exception to "passes don't write": it
 * REBUILDS `frame.interaction.joineryHandles` (the hit-test cache) as it
 * draws — the cache is derived render output, not model state.
 *
 * @module views/canvas/passes/JoineryPass
 */

export class JoineryPass {
    /**
     * Render finger joint previews for edges with joinery metadata
     * @param {Object} frame - See CanvasView frame contract.
     */
    render(frame) {
        const shapeStore = frame.scene.shapeStore;
        if (!shapeStore || !shapeStore.edgeJoinery || shapeStore.edgeJoinery.size === 0) {
            frame.interaction.joineryHandles = [];
            return;
        }

        const edges = shapeStore.getEdgesForAllShapes ? shapeStore.getEdgesForAllShapes() : [];
        if (!edges.length) {
            frame.interaction.joineryHandles = [];
            return;
        }

        // Clear handles before rebuilding
        frame.interaction.joineryHandles = [];

        edges.forEach(edge => {
            const joinery = shapeStore.getEdgeJoinery(edge);
            if (!joinery) return;
            if (!edge.isLinear || !edge.isLinear()) return;

            let bounds = null;
            if (edge.shapeId) {
                const shape = shapeStore.get(edge.shapeId);
                if (shape) {
                    const resolved = frame.bindingResolver.resolveShape(shape);
                    if (resolved && typeof resolved.getBounds === 'function') {
                        bounds = resolved.getBounds();
                    }
                }
            }

            this.renderFingerJoinery(frame, edge, joinery, bounds);
        });
    }

    /**
     * Render a finger joint preview on a linear edge
     * @param {Object} frame
     * @param {import('../../../geometry/edge/index.js').Edge} edge
     * @param {{type: string, thicknessMm: number, fingerCount: number, align?: string}} joinery
     */
    renderFingerJoinery(frame, edge, joinery, bounds) {
        const { ctx } = frame;
        const p1 = edge.anchor1?.position;
        const p2 = edge.anchor2?.position;
        if (!p1 || !p2) return;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.hypot(dx, dy);
        if (length < 0.001) return;

        const ux = dx / length;
        const uy = dy / length;
        let nx = -uy;
        let ny = ux;

        if (bounds) {
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const cx = bounds.x + bounds.width / 2;
            const cy = bounds.y + bounds.height / 2;
            const vx = midX - cx;
            const vy = midY - cy;
            if (vx * nx + vy * ny < 0) {
                nx = -nx;
                ny = -ny;
            }
        }

        // Support old 'finger_male', 'male', and new 'finger_joint' type
        const joineryType = String(joinery.type || '').toLowerCase();
        const isFingerJoint = joineryType === 'finger_joint' || joineryType === 'male' || joineryType === 'finger_male';
        const isDovetail = joineryType === 'dovetail';
        const direction = 1;

        const thicknessMm = Number(joinery.thicknessMm);
        const baseDepth = Math.min(Math.max(thicknessMm || 0, 0.5), length * 0.45);
        const depth = isDovetail
            ? Math.min(baseDepth * 1.6, length * 0.6)
            : baseDepth;
        const preferredWidth = Math.max(depth * 2, 4);
        const requestedCount = Number(joinery.fingerCount);
        const count = Number.isFinite(requestedCount) && requestedCount >= 2
            ? Math.floor(requestedCount)
            : Math.max(2, Math.floor(length / preferredWidth));
        const toothWidth = length / count;

        const strokeColor = '#f97316';
        const fillColor = 'rgba(249, 115, 22, 0.25)';

        // Alignment: left = first tooth at start, right = first tooth at end
        const align = joinery.align || 'left';
        // For right alignment, we start at index 1 instead of 0
        const startIndex = align === 'right' ? 1 : 0;

        const dovetailTaper = Math.min(depth * 0.2, toothWidth * 0.2);
        const taper = isDovetail ? dovetailTaper : 0;

        for (let i = startIndex; i < count; i += 2) {
            const start = i * toothWidth;
            const end = start + toothWidth;

            const sx = p1.x + ux * start;
            const sy = p1.y + uy * start;
            const ex = p1.x + ux * end;
            const ey = p1.y + uy * end;
            const ox = nx * depth * direction;
            const oy = ny * depth * direction;

            ctx.save();
            ctx.lineWidth = 1 / frame.viewport.zoom;
            ctx.strokeStyle = strokeColor;
            ctx.fillStyle = fillColor;
            ctx.beginPath();
            if (isDovetail) {
                // Trapezoid with tapered sides
                const topStartX = sx + ox - ux * taper;
                const topStartY = sy + oy - uy * taper;
                const topEndX = ex + ox + ux * taper;
                const topEndY = ey + oy + uy * taper;
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.lineTo(topEndX, topEndY);
                ctx.lineTo(topStartX, topStartY);
            } else {
                // Rectangle (finger joint)
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.lineTo(ex + ox, ey + oy);
                ctx.lineTo(sx + ox, sy + oy);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // Render and store interactive handles
        this.renderJoineryHandles(frame, edge, joinery, p1, p2, ux, uy, nx, ny, depth, direction, length, toothWidth, startIndex, count);
    }

    /**
     * Render interactive handles for adjusting joinery on canvas (bounding box style)
     * Only shows when the shape is selected
     */
    renderJoineryHandles(frame, edge, joinery, p1, p2, ux, uy, nx, ny, depth, direction, length, toothWidth, startIndex, count) {
        const { ctx } = frame;
        // Only show handles if the shape is selected
        if (!edge.shapeId || !frame.selection.selectedShapeIds.has(edge.shapeId)) {
            return;
        }

        const handleSize = 8 / frame.viewport.zoom;
        const bracketLen = 12 / frame.viewport.zoom;
        const lineWidth = 2 / frame.viewport.zoom;

        const isHoveredDepth = frame.interaction.hoveredJoineryHandle?.edge === edge && frame.interaction.hoveredJoineryHandle?.type === 'depth';
        const isHoveredAlign = frame.interaction.hoveredJoineryHandle?.edge === edge && frame.interaction.hoveredJoineryHandle?.type === 'align';
        const isDraggingThis = frame.interaction.isDraggingJoineryHandle && frame.interaction.joineryDragStart?.edge === edge;

        // Depth handle: bracket at the middle of the edge, on the outer edge of fingers
        const midPoint = length / 2;
        const depthHandleX = p1.x + ux * midPoint + nx * depth * direction;
        const depthHandleY = p1.y + uy * midPoint + ny * depth * direction;

        // Align toggle: small bracket at edge start
        const alignHandleX = p1.x + ux * (handleSize * 2) + nx * depth * direction * 0.5;
        const alignHandleY = p1.y + uy * (handleSize * 2) + ny * depth * direction * 0.5;

        // Store handles for hit testing
        frame.interaction.joineryHandles.push({
            edge,
            joinery,
            type: 'depth',
            x: depthHandleX,
            y: depthHandleY,
            radius: handleSize * 2,
            nx, ny, direction, p1, p2, ux, uy, length
        });

        // Align handle removed per UX request (avoid "L" bubble)

        // Draw depth handle - bracket style (like bounding box)
        const handleColor = (isHoveredDepth || isDraggingThis) ? '#f97316' : '#3b82f6';
        ctx.save();
        ctx.strokeStyle = handleColor;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'square';

        // Draw a small outward-pointing arrow/bracket
        const arrowLen = bracketLen;
        const arrowX = nx * direction;
        const arrowY = ny * direction;

        ctx.beginPath();
        // Horizontal line
        ctx.moveTo(depthHandleX - ux * arrowLen / 2, depthHandleY - uy * arrowLen / 2);
        ctx.lineTo(depthHandleX + ux * arrowLen / 2, depthHandleY + uy * arrowLen / 2);
        // Arrow head pointing outward
        ctx.moveTo(depthHandleX, depthHandleY);
        ctx.lineTo(depthHandleX + arrowX * handleSize, depthHandleY + arrowY * handleSize);
        ctx.stroke();

        // Small square handle
        ctx.fillStyle = handleColor;
        ctx.fillRect(
            depthHandleX - handleSize / 2,
            depthHandleY - handleSize / 2,
            handleSize,
            handleSize
        );
        ctx.restore();

        // Alignment toggle UI removed
    }
}
