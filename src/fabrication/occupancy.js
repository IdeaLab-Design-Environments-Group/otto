/**
 * @fileoverview 3D occupancy checks — the geometric ground truth for joint
 * cuts. A world point is inside a part if, in the part's frame, it lies
 * within the material slab (0 < z < t), inside the cut outline and outside
 * every hole. Sampling a joint's contact region then tells whether the two
 * cut panels interpenetrate (a point owned twice) or leave voids (owned by
 * nobody) — which catches tooth parity, depth, kerf-sign and corner errors.
 *
 * @module fabrication/occupancy
 */
import { multiply, rigidInverse, transformPoint } from '../joints/math/Mat4.js';
import { portFrame } from '../joints/JointSolver.js';
import { pointInPolygon } from './polygon.js';

const EPS = 1e-7;

/**
 * Is the world point inside the part's material?
 * @param {number[]} world
 * @param {Object} part
 * @param {number[]} inversePose - rigidInverse of the part's world pose.
 * @param {{outer: Array, holes: Array}} cut
 */
export function pointInPart(world, part, inversePose, cut) {
    const [x, y, z] = transformPoint(inversePose, world);
    if (z <= EPS || z >= part.thickness - EPS) return false;
    const p = { x, y };
    if (!pointInPolygon(p, cut.outer)) return false;
    return !cut.holes.some(h => pointInPolygon(p, h));
}

/**
 * The region around a joint where its two panels meet, as a box in the
 * parent port frame: {frame (world Mat4), u: [min,max], v: [min,max], w: [min,max]}.
 */
export function jointRegion(joint, resolved, poses) {
    const partA = resolved.partsById.get(joint.a.partId);
    const partB = resolved.partsById.get(joint.b.partId);
    const portA = partA.ports[joint.a.port];
    const portB = partB.ports[joint.b.port];
    const frame = multiply(poses.get(partA.id), portFrame(portA));
    const tA = partA.thickness, tB = partB.thickness;
    const along = [0, portA.length];
    switch (joint.type) {
        case 'tab_slot':
        case 'bolt':
            // A's thickness around the face line: A, or B's tab (bolt: a void at each hole).
            return { frame, u: along, v: [-tB / 2, tB / 2], w: [0, tA] };
        case 'cross_lap':
            return { frame, u: [0, portA.length + portB.length], v: [-tB / 2, tB / 2], w: [0, tA] };
        case 'splice':
            return { frame, u: along, v: [-50, 50], w: [0, tA] };
        case 'hinge':
            return null;   // a flexing strip, not a rigid contact
        default:   // finger corners
            return { frame, u: along, v: [0, tB], w: [0, tA] };
    }
}

/**
 * Sample a joint region on a grid of cell centres and count owners per point.
 * @returns {{samples: number, empty: number, double: number}}
 */
export function sampleJoint(joint, resolved, poses, cuts, { nu = 40, nv = 6, nw = 6 } = {}) {
    const region = jointRegion(joint, resolved, poses);
    if (!region) return { samples: 0, empty: 0, double: 0 };
    const parts = resolved.parts.map(part => ({ part, inverse: rigidInverse(poses.get(part.id)), cut: cuts.get(part.id) }));
    let empty = 0, double = 0, samples = 0;
    for (let i = 0; i < nu; i++) {
        const u = region.u[0] + (i + 0.5) * (region.u[1] - region.u[0]) / nu;
        for (let j = 0; j < nv; j++) {
            const v = region.v[0] + (j + 0.5) * (region.v[1] - region.v[0]) / nv;
            for (let k = 0; k < nw; k++) {
                const w = region.w[0] + (k + 0.5) * (region.w[1] - region.w[0]) / nw;
                const world = transformPoint(region.frame, [u, v, w]);
                let owners = 0;
                for (const { part, inverse, cut } of parts) {
                    if (pointInPart(world, part, inverse, cut)) owners++;
                }
                samples++;
                if (owners === 0) empty++;
                else if (owners > 1) double++;
            }
        }
    }
    return { samples, empty, double };
}
