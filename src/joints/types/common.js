/**
 * @fileoverview Helpers shared by joint types: port frames in 2D, edge-on-face
 * placement, and small geometry builders.
 *
 * @module joints/types/common
 */
import { alongEdge } from '../params.js';

/** Unit vectors of a port: x̂ along it, ŷ = x̂ turned +90° (into the material). */
export function portAxes(port) {
    const ux = (port.b.x - port.a.x) / port.length, uy = (port.b.y - port.a.y) / port.length;
    return { x: { x: ux, y: uy }, y: { x: -uy, y: ux } };
}

/** Map port-local (u, v) to part coordinates. */
export function portPoint(port, u, v) {
    const { x, y } = portAxes(port);
    return { x: port.a.x + x.x * u + y.x * v, y: port.a.y + x.y * u + y.y * v };
}

/**
 * Pose of an edge standing on a face line (tab and slot, bolt): B's
 * mid-plane straddles A's line and B's edge sits on the face it rises from.
 */
export function edgeOnFacePose({ joint, lenA, lenB, tA, tB }) {
    const s = alongEdge(joint.params.align, lenA, lenB);
    return joint.params.side === 'down'
        ? { s, dy: tB / 2, dz: 0, fold: 90 }
        : { s, dy: -tB / 2, dz: tA, fold: 90 };
}

/** Overlap of A's port [0, lenA] and B's port placed at s (A coordinates). */
export function overlap(s, lenA, lenB) {
    return [Math.max(0, s - lenB), Math.min(lenA, s)];
}

/** Axis-aligned rectangle in port coordinates as a part-space polygon. */
export function portRect(port, u0, u1, v0, v1) {
    return [portPoint(port, u0, v0), portPoint(port, u1, v0), portPoint(port, u1, v1), portPoint(port, u0, v1)];
}

/** Circle polygon (positive winding) in part coordinates. */
export function circle(c, r, segments = 24) {
    return Array.from({ length: segments }, (_, i) => {
        const t = (2 * Math.PI * i) / segments;
        return { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) };
    });
}

/** Evenly spaced centres of n features over [o0, o1]. */
export function centres(o0, o1, n) {
    const pitch = (o1 - o0) / n;
    return Array.from({ length: n }, (_, i) => o0 + (i + 0.5) * pitch);
}

/** Edge-profile points mirrored onto the mating edge (u → s − u, n → −n), in its increasing-u order. */
export function mirrorProfile(profile, s) {
    return profile.map(p => ({ u: s - p.u, n: -p.n })).reverse();
}
