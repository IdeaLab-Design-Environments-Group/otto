/**
 * @fileoverview Merge two cut parts into ONE piece across a living-hinge
 * strip: B is placed flat on the far side of the strip cut on A's edge and
 * the two outlines are spliced there, so the laser cuts them as one sheet.
 *
 * @module fabrication/mergePieces
 */
import { portAxes } from '../joints/types/common.js';

const EPS = 1e-6;

/**
 * @param {Object} params
 * @param {{outer, holes}} params.cutA - A's cut (outline includes the strip).
 * @param {{outer, holes}} params.cutB
 * @param {Object} params.portA - A's joint edge port; @param {Object} params.portB
 * @param {number} params.s - Where B's edge starts along A's (A coordinates).
 * @param {number} params.strip - Strip length (outward from A's edge).
 * @returns {{outer: Array, holes: Array} | {error: string}}
 */
export function mergeHingePiece({ cutA, cutB, portA, portB, s, strip }) {
    const ax = portAxes(portA), bx = portAxes(portB);
    // B point → B port coords (u along, v into B) → A port coords (u' = s − u, v' = −strip − v) → A part coords.
    const toA = (p) => {
        const du = p.x - portB.a.x, dv = p.y - portB.a.y;
        const u = du * bx.x.x + dv * bx.x.y, v = du * bx.y.x + dv * bx.y.y;
        const ua = s - u, va = -strip - v;
        return { x: portA.a.x + ax.x.x * ua + ax.y.x * va, y: portA.a.y + ax.x.y * ua + ax.y.y * va };
    };
    const bOuter = cutB.outer.map(toA);
    const same = (p, q) => Math.abs(p.x - q.x) < 1e-4 && Math.abs(p.y - q.y) < 1e-4;

    // In A, the strip's far side runs X → Y; in B (placed) it runs Y → X.
    const iA = cutA.outer.findIndex((p, i) => bOuter.some(q => same(p, q)) && bOuter.some(q => same(cutA.outer[(i + 1) % cutA.outer.length], q)));
    if (iA < 0) return { error: 'the attached panel does not meet the end of the hinge strip (edges of different length, or other joints on that edge)' };
    const X = cutA.outer[iA], Y = cutA.outer[(iA + 1) % cutA.outer.length];
    const iX = bOuter.findIndex(q => same(q, X));
    const iY = bOuter.findIndex(q => same(q, Y));
    if (iX < 0 || iY < 0 || (iY + 1) % bOuter.length !== iX) {
        return { error: 'the attached panel does not meet the end of the hinge strip' };
    }
    const outer = [];
    for (let k = 0; k <= iA; k++) outer.push(cutA.outer[k]);                      // A up to X
    for (let k = (iX + 1) % bOuter.length; k !== iY; k = (k + 1) % bOuter.length) outer.push(bOuter[k]);   // around B
    for (let k = iA + 1; k < cutA.outer.length; k++) outer.push(cutA.outer[k]);   // Y and the rest of A
    return {
        outer: outer.filter((p, i) => i === 0 || Math.hypot(p.x - outer[i - 1].x, p.y - outer[i - 1].y) > EPS),
        holes: [...cutA.holes, ...cutB.holes.map(h => h.map(toA))]
    };
}
