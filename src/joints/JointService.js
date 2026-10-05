/**
 * @fileoverview JointService — the cached joint pipeline of a scene:
 *
 *   shapes + joints ─resolveParts→ parts, joints ─cut()→ features ─buildAllCuts→ cut outlines
 *                                                ├─check()→ findings
 *                                                └─solve()→ 3D poses, loops that don't close
 *
 * Canvas, export and (later) the 3D view all read the same result, recomputed
 * only when the joints, the jointed shapes or the parameters change.
 *
 * @module joints/JointService
 */
import { resolveParts } from './resolveParts.js';
import { jointTypes } from './JointRegistry.js';
import { buildAllCuts } from '../fabrication/CutGeometry.js';
import { solve } from './JointSolver.js';

const cache = new WeakMap();

/** Scene parameter values by name. */
export function sceneParameterValues(scene) {
    const values = {};
    for (const p of scene.parameterStore.getAll()) values[p.name] = p.value;
    return values;
}

/**
 * @param {import('../core/SceneState.js').SceneState} scene
 * @param {import('./JointRegistry.js').JointRegistry} [registry]
 * @returns {{resolved: Object, cuts: Map, cuts3d: Map, solved: Object, findings: Array,
 *   extras: Array, bom: Array, merges: Array}}
 *   extras: extra cut pieces (wedges); bom: hardware lines; merges: pieces cut as one (hinges).
 */
export function resolveJoints(scene, registry = jointTypes) {
    const store = scene.jointStore;
    const globals = sceneParameterValues(scene);
    const shapeIds = new Set();
    for (const j of store.getAll()) { shapeIds.add(j.a.shape); shapeIds.add(j.b.shape); }
    const shapesSig = [...shapeIds].map(id => JSON.stringify(scene.shapeStore.get(id)?.toJSON() ?? null)).join('|');
    const key = `${store.revision}|${JSON.stringify(globals)}|${shapesSig}`;
    const hit = cache.get(scene);
    if (hit && hit.key === key && hit.registry === registry) return hit.value;

    const getShape = (id) => {
        const shape = scene.shapeStore.get(id);
        return shape ? scene.bindingResolver.resolveShape(shape) : null;
    };
    const resolved = resolveParts({ joints: store.getAll(), getShape, globals, registry });
    resolved.ground = store.ground;
    const features = [];
    const findings = [...resolved.diagnostics];
    const extras = [], bom = [], merges = [];
    for (const joint of resolved.joints) {
        const ctx = { joint, partA: resolved.partsById.get(joint.a.partId), partB: resolved.partsById.get(joint.b.partId) };
        const type = registry.get(joint.type);
        for (const f of type.cut(ctx)) features.push({ ...f, jointId: joint.id });
        for (const f of type.check?.(ctx) || []) findings.push({ ...f, target: joint.id, message: `${joint.id}: ${f.message}` });
        extras.push(...(type.extraParts?.(ctx) || []));
        bom.push(...(type.bom?.(ctx) || []).map(line => ({ ...line, jointId: joint.id })));
        merges.push(...(type.merges?.(ctx) || []));
    }
    const { cuts, diagnostics } = buildAllCuts(resolved, features);
    findings.push(...diagnostics);
    // The 3D view leaves out flat-only features (a hinge strip bends instead).
    const flatOnly = features.some(f => f.only2d);
    const cuts3d = flatOnly ? buildAllCuts(resolved, features.filter(f => !f.only2d)).cuts : cuts;
    const solved = solve(resolved, registry);
    findings.push(...loopFindings(solved, resolved));
    const value = { resolved, cuts, cuts3d, solved, findings, extras, bom, merges };
    cache.set(scene, { key, registry, value });
    return value;
}

/**
 * Findings for loops that do not close, phrased in terms of the joint's
 * first edge: along it, into that panel, or through its thickness.
 */
function loopFindings(solved, resolved) {
    const findings = [];
    for (const r of solved.inconsistent) {
        const joint = resolved.joints.find(j => j.id === r.jointId);
        const ref = `${joint.a.partId}.${joint.a.port}`;
        const [x, y, z] = r.axis.map(Math.abs);
        const where = x >= y && x >= z ? `along ${ref}`
            : y >= z ? `across ${ref} (into ${joint.a.partId})`
                : `through ${joint.a.partId}'s thickness`;
        const turn = r.eR > 0.5 ? ` and turned ${r.eR.toFixed(1)}°` : '';
        findings.push({
            severity: 'warning', code: 'loop_not_closed', target: r.jointId,
            message: `${r.jointId} does not close: off by ${r.eT.toFixed(1)} mm ${where}${turn} (loop: ${r.cycle.join(' → ')}). The parts will not assemble.`,
            data: { eT: r.eT, eR: r.eR, axis: r.axis, cycle: r.cycle }
        });
    }
    if (solved.components.length > 1) {
        findings.push({
            severity: 'info', code: 'separate_groups', target: null,
            message: `${solved.components.length} separate groups of joined parts: ${solved.components.map(c => c.join(' + ')).join(' | ')}`
        });
    }
    return findings;
}
