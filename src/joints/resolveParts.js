/**
 * @fileoverview resolveParts — turns shapes + joints into the plain data the
 * cut and 3D pipelines work on (pure).
 *
 *   Part  {id (= shape id), outline: [{x,y}] (positive winding), thickness,
 *          ports: {edgeName: {kind: 'edge', a, b, length}}}
 *   Joint {id, type, params (resolved), a: {partId, port}, b: {partId, port}}
 *
 * The outline is the shape's outer path in its own unrotated coordinates,
 * with curved segments flattened; it is normalised to positive signed area
 * so "left of an edge" is always inside the material, and edge ports are
 * oriented to match. Problems become diagnostics (never exceptions), each
 * targeted at the joint id it concerns.
 *
 * @module joints/resolveParts
 */
import { namedEdges } from './edges.js';
import { resolveParams } from './params.js';
import { resolvePortRef } from './ports.js';
import { signedArea } from '../fabrication/polygon.js';

const CURVE_SAMPLES = 8;

/**
 * @param {Object} input
 * @param {Array} input.joints - JointStore joints.
 * @param {(id: string) => ?Object} input.getShape - Resolved shape by id.
 * @param {Object} input.globals - Scene parameter values by name.
 * @param {import('./JointRegistry.js').JointRegistry} input.registry
 * @returns {{parts: Array, partsById: Map, joints: Array, diagnostics: Array}}
 */
export function resolveParts({ joints, getShape, globals = {}, registry }) {
    const partsById = new Map();
    const out = { parts: [], partsById, joints: [], diagnostics: [] };
    const error = (target, code, message) => out.diagnostics.push({ severity: 'error', code, message, target });

    const partFor = (shapeId) => {
        if (partsById.has(shapeId)) return partsById.get(shapeId);
        const shape = getShape(shapeId);
        const part = shape ? buildPart(shape) : null;
        partsById.set(shapeId, part);
        if (part) out.parts.push(part);
        return part;
    };

    for (const joint of joints) {
        const type = registry.get(joint.type);
        if (!type) {
            error(joint.id, 'unknown_joint_type', `${joint.id}: unknown joint type '${joint.type}' (known: ${registry.ids().join(', ')})`);
            continue;
        }
        if (joint.a.shape === joint.b.shape) {
            error(joint.id, 'self_joint', `${joint.id}: a joint needs two different shapes`);
            continue;
        }
        const ends = [];
        for (const side of ['a', 'b']) {
            const ref = joint[side];
            const part = partFor(ref.shape);
            if (!part) {
                error(joint.id, 'shape_missing', `${joint.id}: shape '${ref.shape}' does not exist or is not a closed panel`);
                continue;
            }
            const r = resolvePortRef(part, ref, globals);
            if (r.error) {
                error(joint.id, 'edge_missing', `${joint.id}: ${r.error}`);
                continue;
            }
            ends.push({ partId: part.id, port: r.key, kind: r.port.kind });
        }
        if (ends.length !== 2) continue;
        // Orient the ends the way the joint type expects (either order may be written).
        const [ka, kb] = type.ports;
        if (!(ends[0].kind === ka && ends[1].kind === kb)) {
            if (ends[1].kind === ka && ends[0].kind === kb) ends.reverse();
            else {
                error(joint.id, 'port_kind', `${joint.id}: ${type.id} joins ${describeKinds(type.ports)}, got ${describeKinds([ends[0].kind, ends[1].kind])}`);
                continue;
            }
        }
        const { values, errors } = resolveParams(type.params, joint.params, globals);
        for (const e of errors) error(joint.id, 'bad_param', `${joint.id}: ${e}`);
        const resolvedJoint = {
            id: joint.id, type: type.id, params: values,
            a: { partId: ends[0].partId, port: ends[0].port },
            b: { partId: ends[1].partId, port: ends[1].port }
        };
        type.preparePorts?.({ joint: resolvedJoint, partA: partsById.get(resolvedJoint.a.partId), partB: partsById.get(resolvedJoint.b.partId) });
        out.joints.push(resolvedJoint);
    }
    return out;
}

/**
 * A part from a (resolved) shape, or null if it is not a closed panel.
 * @param {Object} shape
 */
export function buildPart(shape) {
    if (shape?.constructor?.curvedOutline) return null;
    const geometry = shape?.toGeometryPath?.();
    const path = geometry && typeof geometry.allPaths === 'function' ? geometry.allPaths()[0] : geometry;
    if (!path?.closed || !Array.isArray(path.anchors) || path.anchors.length < 3) return null;

    let outline = flatten(path.anchors);
    const reversed = signedArea(outline) < 0;
    if (reversed) outline = outline.reverse();

    const ports = {};
    for (const [name, e] of namedEdges(shape)) {
        const [a, b] = reversed ? [e.b, e.a] : [e.a, e.b];
        ports[name] = { kind: 'edge', a: { ...a }, b: { ...b }, length: e.length };
    }
    return { id: shape.id, outline, thickness: Number(shape.depth) || 3, ports };
}

/**
 * Cut outline of any closed shape (jointed or not): the outer path and every
 * further closed path as a hole (a gear's bore), curves flattened, all in
 * positive winding. Null for open shapes (lines, arcs, spirals).
 * @param {Object} shape - Resolved shape.
 * @returns {?{outer: Array<{x,y}>, holes: Array<Array<{x,y}>>}}
 */
export function shapeOutlines(shape) {
    const geometry = shape?.toGeometryPath?.();
    if (!geometry) return null;
    const paths = typeof geometry.allPaths === 'function' ? geometry.allPaths() : [geometry];
    const closed = paths.filter(p => p?.closed && Array.isArray(p.anchors) && p.anchors.length >= 3);
    if (closed.length === 0 || closed[0] !== paths[0]) return null;
    const positive = (pts) => (signedArea(pts) < 0 ? pts.slice().reverse() : pts);
    const [outer, ...holes] = closed.map(p => positive(flatten(p.anchors)));
    return { outer, holes };
}

/** Anchor positions, with each curved segment sampled into short chords. */
function flatten(anchors) {
    const pts = [];
    const n = anchors.length;
    for (let i = 0; i < n; i++) {
        const p = anchors[i], q = anchors[(i + 1) % n];
        pts.push({ x: p.position.x, y: p.position.y });
        const curved = !isZero(p.handleOut) || !isZero(q.handleIn);
        if (!curved) continue;
        const c1 = { x: p.position.x + p.handleOut.x, y: p.position.y + p.handleOut.y };
        const c2 = { x: q.position.x + q.handleIn.x, y: q.position.y + q.handleIn.y };
        for (let k = 1; k < CURVE_SAMPLES; k++) {
            const t = k / CURVE_SAMPLES, u = 1 - t;
            pts.push({
                x: u * u * u * p.position.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * q.position.x,
                y: u * u * u * p.position.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * q.position.y
            });
        }
    }
    // Drop zero-length steps (duplicate anchors).
    return pts.filter((p, i) => {
        const prev = pts[(i - 1 + pts.length) % pts.length];
        return i === 0 || Math.hypot(p.x - prev.x, p.y - prev.y) > 1e-9;
    });
}

const KIND_TEXT = { edge: 'an edge', line: 'a face line (edge.inset(d) or line(...))', slot: 'a slot start (edge.at(d))' };

function describeKinds(kinds) {
    return kinds.map(k => KIND_TEXT[k] || k).join(' + ');
}

function isZero(v) {
    return !v || (Math.abs(v.x) < 1e-9 && Math.abs(v.y) < 1e-9);
}
