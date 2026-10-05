/**
 * @fileoverview JointSolver — folds the flat parts up into 3D from their
 * joints.
 *
 * Every joint is rigid, so placement is exact: walk a spanning tree of the
 * joint graph from the ground part and compose transforms; every joint left
 * out of the tree closes a loop and is CHECKED instead — if the loop does not
 * close (a part is too long, an edge is on the wrong side) the residual says
 * by how much and in which direction.
 *
 * Frames (right-handed, mm):
 *   - Part frame: the shape's own (unrotated) coordinates, outline in z = 0,
 *     material z ∈ [0, t]. The ground part's pose is the identity.
 *   - Port frame P (part-local): origin at the edge start a, x̂ along the
 *     edge, ŷ = x̂ turned +90° (into the material, outlines have positive
 *     winding), ẑ = z.
 *   - Joint J, in A's port frame: where B's port frame sits,
 *       J = Trans(s, dy, dz) · Rx(φ) · Rz(π)
 *     φ = −(π − fold) for side 'up' (B on A's +z face), +(π − fold) for
 *     'down'; {s, dy, dz} come from the joint type's `pose()`.
 *   - Relation: T_B · P_B = T_A · P_A · J.
 *
 * @module joints/JointSolver
 */
import {
    identity, multiply, chain, fromBasis, translate, rotX, rotZ, rigidInverse,
    transformPoint, transformDir, getTranslation, rotationAngleBetween
} from './math/Mat4.js';

const DEG = Math.PI / 180;

/** Port frame (part-local) as a Mat4. */
export function portFrame(port) {
    const ux = (port.b.x - port.a.x) / port.length;
    const uy = (port.b.y - port.a.y) / port.length;
    return fromBasis([ux, uy, 0], [-uy, ux, 0], [0, 0, 1], [port.a.x, port.a.y, 0]);
}

/** Joint transform J (B's port frame in A's port frame). */
export function jointMatrix(joint, partA, partB, registry) {
    const type = registry.get(joint.type);
    const portA = partA.ports[joint.a.port];
    const portB = partB.ports[joint.b.port];
    const { s, dy, dz, fold } = type.pose({
        joint, lenA: portA.length, lenB: portB.length, tA: partA.thickness, tB: partB.thickness
    });
    const phi = (joint.params.side === 'down' ? 1 : -1) * (Math.PI - fold * DEG);
    return chain(translate(s, dy, dz), rotX(phi), rotZ(Math.PI));
}

/**
 * @param {{parts: Array, partsById: Map, joints: Array, ground: ?string}} resolved
 * @param {import('./JointRegistry.js').JointRegistry} registry
 * @param {{tolT?: number, tolR?: number, componentGap?: number}} [options] tolT mm, tolR degrees
 * @returns {{poses: Map<string, number[]>, tree: Array, redundant: Array,
 *   inconsistent: Array, components: string[][]}}
 */
export function solve(resolved, registry, { tolT = 0.5, tolR = 0.5, componentGap = 100 } = {}) {
    const { parts, partsById } = resolved;
    const joints = resolved.joints.filter(j => typeof registry.get(j.type)?.pose === 'function');
    const adjacency = new Map(parts.map(p => [p.id, []]));
    for (const j of joints) {
        adjacency.get(j.a.partId).push(j);
        adjacency.get(j.b.partId).push(j);
    }

    const poses = new Map();
    const parent = new Map();
    const treeJoints = new Set();
    const tree = [];
    const components = [];
    const roots = resolved.ground && partsById.get(resolved.ground)
        ? [partsById.get(resolved.ground), ...parts.filter(p => p.id !== resolved.ground)]
        : parts;

    for (const root of roots) {
        if (poses.has(root.id)) continue;
        const component = [root.id];
        poses.set(root.id, identity());
        const queue = [root.id];
        while (queue.length > 0) {
            const u = queue.shift();
            for (const j of adjacency.get(u)) {
                const v = j.a.partId === u ? j.b.partId : j.a.partId;
                if (poses.has(v)) continue;
                poses.set(v, placeAcross(j, u, poses.get(u), partsById, registry));
                parent.set(v, { via: j, from: u });
                treeJoints.add(j);
                tree.push({ jointId: j.id, parent: u, child: v });
                component.push(v);
                queue.push(v);
            }
        }
        components.push(component);
    }

    // Lay disconnected groups side by side along +x so they never overlap.
    let cursor = null;
    for (const component of components) {
        const box = worldBounds(component, poses, partsById);
        if (cursor !== null) {
            const shift = translate(cursor - box.minX, 0, 0);
            for (const id of component) poses.set(id, multiply(shift, poses.get(id)));
            cursor += box.maxX - box.minX + componentGap;
        } else {
            cursor = box.maxX + componentGap;
        }
    }

    const redundant = [];
    const inconsistent = [];
    for (const j of joints) {
        if (treeJoints.has(j)) continue;
        const partA = partsById.get(j.a.partId);
        const partB = partsById.get(j.b.partId);
        const aPortWorld = multiply(poses.get(j.a.partId), portFrame(partA.ports[j.a.port]));
        const implied = multiply(aPortWorld, jointMatrix(j, partA, partB, registry));
        const actual = multiply(poses.get(j.b.partId), portFrame(partB.ports[j.b.port]));
        const d = getTranslation(actual).map((v, i) => v - getTranslation(implied)[i]);
        const eT = Math.hypot(...d);
        const eR = rotationAngleBetween(actual, implied) / DEG;
        const record = { jointId: j.id, eT, eR };
        if (eT <= tolT && eR <= tolR) redundant.push(record);
        else inconsistent.push({
            ...record,
            // Residual in A's port frame: x along the edge, y into A, z through A.
            axis: transformDir(rigidInverse(aPortWorld), d),
            cycle: cyclePath(j.a.partId, j.b.partId, parent)
        });
    }
    return { poses, tree, redundant, inconsistent, components };
}

function placeAcross(j, u, Tu, partsById, registry) {
    const partA = partsById.get(j.a.partId);
    const partB = partsById.get(j.b.partId);
    const Pa = portFrame(partA.ports[j.a.port]);
    const Pb = portFrame(partB.ports[j.b.port]);
    const J = jointMatrix(j, partA, partB, registry);
    if (u === j.a.partId) return chain(Tu, Pa, J, rigidInverse(Pb));      // T_B = T_A·P_A·J·P_B⁻¹
    return chain(Tu, Pb, rigidInverse(J), rigidInverse(Pa));              // T_A = T_B·P_B·J⁻¹·P_A⁻¹
}

/** Parts on the tree path a → … → b (the loop a non-tree joint closes). */
function cyclePath(a, b, parent) {
    const up = (id) => {
        const path = [id];
        while (parent.has(id)) {
            id = parent.get(id).from;
            path.push(id);
        }
        return path;
    };
    const pa = up(a), pb = up(b);
    const inB = new Set(pb);
    const lca = pa.find(id => inB.has(id));
    return [...pa.slice(0, pa.indexOf(lca) + 1), ...pb.slice(0, pb.indexOf(lca)).reverse()];
}

/** Axis-aligned world bounds of parts (outline at both faces). */
export function worldBounds(ids, poses, partsById) {
    const box = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
    for (const id of ids) {
        const part = partsById.get(id);
        for (const p of part.outline) {
            for (const z of [0, part.thickness]) {
                const [x, y, zz] = transformPoint(poses.get(id), [p.x, p.y, z]);
                box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x);
                box.minY = Math.min(box.minY, y); box.maxY = Math.max(box.maxY, y);
                box.minZ = Math.min(box.minZ, zz); box.maxZ = Math.max(box.maxZ, zz);
            }
        }
    }
    return box;
}
