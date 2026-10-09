/**
 * @fileoverview What Jev can look at (read-only, pure): a compact summary of
 * the design, the "open studs" (free edges a panel could join to), the joint
 * vocabulary, and the problems Otto's checks report.
 *
 * @module jev/queries
 */
import { namedEdges } from '../joints/edges.js';
import { resolveJoints } from '../joints/JointService.js';
import { jointTypes } from '../joints/JointRegistry.js';
import { buildFabrication } from '../fabrication/FabricationPlan.js';

const r1 = (v) => Math.round(v * 10) / 10;

/** Panels, joints, parameters and the ground, as compact JSON. */
export function describeScene(scene) {
    const shapes = scene.shapeStore.getAll().map(stored => {
        const s = scene.bindingResolver.resolveShape(stored);
        const b = s.getBounds();
        const out = { id: s.id, type: s.type, size: [r1(b.width), r1(b.height)], thickness: Number(s.depth) || 3 };
        if (s.type === 'rectangle') Object.assign(out, { width: s.width, height: s.height });
        return out;
    });
    const joints = scene.jointStore.getAll().map(j => ({
        id: j.id, type: j.type, a: portText(j.a), b: portText(j.b), params: j.params
    }));
    return {
        units: 'mm',
        shapes,
        joints,
        ground: scene.jointStore.ground,
        parameters: scene.parameterStore.getAll().map(p => ({ name: p.name, value: p.value })),
        bed: scene.jointStore.getFabrication().bed
    };
}

/** Straight edges not used by any joint yet — where the next panel can attach. */
export function listOpenEdges(scene, onlyShape = null) {
    const used = new Set();
    for (const j of scene.jointStore.getAll()) {
        for (const p of [j.a, j.b]) if (p.edge && p.inset === undefined && p.at === undefined) used.add(`${p.shape}.${p.edge}`);
    }
    const out = [];
    for (const stored of scene.shapeStore.getAll()) {
        if (onlyShape && stored.id !== onlyShape) continue;
        const shape = scene.bindingResolver.resolveShape(stored);
        for (const [name, e] of namedEdges(shape)) {
            if (/^e\d+$/.test(name) && [...namedEdges(shape).keys()].some(n => !/^e\d+$/.test(n))) continue;
            if (!used.has(`${shape.id}.${name}`)) out.push({ port: `${shape.id}.${name}`, length: r1(e.length) });
        }
    }
    return out;
}

/** The joint vocabulary with what each joins and its parameters. */
export function listJointTypes() {
    return jointTypes.list().map(t => ({
        type: t.id, label: t.label, description: t.description,
        joins: t.ports.join(' + '),
        params: Object.fromEntries(Object.entries(t.params).map(([k, p]) => [k, p.type === 'enum' ? p.values : `${p.type}${p.unit ? ' ' + p.unit : ''}`]))
    }));
}

/** Problems to fix: joint errors/warnings, loops that do not close, parts too big for the bed. */
export function checkDesign(scene) {
    const problems = [];
    if (scene.jointStore.getAll().length) {
        for (const f of resolveJoints(scene).findings) {
            if (f.severity !== 'info') problems.push({ severity: f.severity, code: f.code, target: f.target, message: f.message });
        }
    }
    const plan = buildFabrication(scene);
    for (const f of plan.findings.filter(f => f.code === 'part_too_big')) {
        problems.push({ severity: f.severity, code: f.code, target: f.target, message: f.message });
    }
    return {
        problems,
        sheets: plan.files.length,
        parts: plan.parts.length,
        hardware: plan.bom
    };
}

function portText(p) {
    if (p.line) return `${p.shape}.line(${p.line.join(', ')})`;
    if (p.inset !== undefined) return `${p.shape}.${p.edge}.inset(${p.inset})`;
    if (p.at !== undefined) return `${p.shape}.${p.edge}.at(${p.at})`;
    return `${p.shape}.${p.edge}`;
}
