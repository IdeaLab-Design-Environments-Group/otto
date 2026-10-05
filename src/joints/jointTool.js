/**
 * @fileoverview The Join tool's decisions, as pure functions (the canvas
 * controller only feeds it hits and shows its choices):
 *
 *   1. a click on an EDGE becomes {kind: 'edge', shape, edge (name), u};
 *      a click inside a FACE becomes {kind: 'face', shape, edge, inset} —
 *      a line parallel to the nearest edge through the click;
 *   2. two such ports on different shapes give the joints that fit them,
 *      each with the exact `a` / `b` port references for `joint.add`.
 *
 * @module joints/jointTool
 */
import { namedEdges } from './edges.js';

const round1 = (v) => Math.round(v * 10) / 10;

/** Preferred name of an edge index (readable names before e<i>). */
export function edgeNameFor(shape, index) {
    for (const [name, e] of namedEdges(shape)) if (e.index === index) return name;
    return null;
}

/**
 * Port for a click on an edge.
 * @param {Object} shape - Resolved shape.
 * @param {number} index - Edge index (pathIndex 0).
 * @param {{x, y}} local - Click point in the shape's own (unrotated) coordinates.
 * @returns {?{kind: 'edge', shape, edge, u, length}}
 */
export function edgePort(shape, index, local) {
    const name = edgeNameFor(shape, index);
    if (!name) return null;
    const e = namedEdges(shape).get(name);
    const ux = (e.b.x - e.a.x) / e.length, uy = (e.b.y - e.a.y) / e.length;
    const u = Math.min(e.length, Math.max(0, (local.x - e.a.x) * ux + (local.y - e.a.y) * uy));
    return { kind: 'edge', shape: shape.id, edge: name, u, length: e.length };
}

/**
 * Port for a click inside a face: the nearest straight edge and the distance
 * to it (a face line parallel to that edge through the click).
 * @returns {?{kind: 'face', shape, edge, inset}}
 */
export function facePort(shape, local) {
    let best = null;
    for (const [name, e] of namedEdges(shape)) {
        const ux = (e.b.x - e.a.x) / e.length, uy = (e.b.y - e.a.y) / e.length;
        const t = (local.x - e.a.x) * ux + (local.y - e.a.y) * uy;
        if (t < 0 || t > e.length) continue;
        const d = Math.abs((local.x - e.a.x) * -uy + (local.y - e.a.y) * ux);
        const readable = !/^e\d+$/.test(name);
        if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) <= 1e-9 && readable && !best.readable)) {
            best = { name, d, readable };
        }
    }
    if (!best || best.d < 1) return null;
    return { kind: 'face', shape: shape.id, edge: best.name, inset: round1(best.d) };
}

/**
 * Joints that fit two clicked ports.
 * @returns {Array<{type: string, label: string, a: Object, b: Object}>}
 */
export function jointOptions(first, second) {
    if (!first || !second || first.shape === second.shape) return [];
    const edgeRef = (p) => ({ shape: p.shape, edge: p.edge });
    if (first.kind === 'edge' && second.kind === 'edge') {
        return [
            { type: 'finger', label: 'Finger joint (90° corner)', a: edgeRef(first), b: edgeRef(second) },
            { type: 'splice', label: 'Splice (same plane)', a: edgeRef(first), b: edgeRef(second) },
            { type: 'hinge', label: 'Living hinge (one piece)', a: edgeRef(first), b: edgeRef(second) },
            {
                type: 'cross_lap', label: 'Cross lap at these points',
                a: { ...edgeRef(first), at: round1(first.u) }, b: { ...edgeRef(second), at: round1(second.u) }
            }
        ];
    }
    const [edge, face] = first.kind === 'edge' ? [first, second] : [second, first];
    if (edge.kind !== 'edge' || face.kind !== 'face') return [];
    const line = { shape: face.shape, edge: face.edge, inset: face.inset };
    return [
        { type: 'tab_slot', label: `Tab and slot into ${face.shape}`, a: edgeRef(edge), b: line },
        { type: 'bolt', label: `Bolt into ${face.shape}`, a: edgeRef(edge), b: line }
    ];
}
