/**
 * 3D folding of jointed shapes: exact placement from finger joints (the
 * frame convention pinned by hand-derived world coordinates), loops that
 * close vs. do not, separate groups, determinism, and the occupancy proof
 * that the cut teeth interlock with no overlap and no gaps.
 */
import { test, assert, assertEqual, assertApprox } from '../harness.js';
import { SceneState } from '../../src/core/SceneState.js';
import { ShapeRegistry } from '../../src/models/shapes/ShapeRegistry.js';
import { CodeRunner } from '../../src/programming/CodeRunner.js';
import { resolveJoints } from '../../src/joints/JointService.js';
import { worldBounds } from '../../src/joints/JointSolver.js';
import { identity, maxAbsDiff } from '../../src/joints/math/Mat4.js';
import { sampleJoint } from '../../src/fabrication/occupancy.js';

function build(code) {
    ShapeRegistry.resetIdCounters();
    const scene = new SceneState();
    const runner = new CodeRunner({ shapeStore: scene.shapeStore, parameterStore: scene.parameterStore, getScene: () => scene });
    const result = runner.run(code, { clearExisting: true });
    assert(result.success, result.error);
    assertEqual(result.jointErrors.length, 0, result.jointErrors.join('; '));
    return { scene, ...resolveJoints(scene) };
}

const bounds = (r, id) => worldBounds([id], r.solved.poses, r.resolved.partsById);

function near(box, expected, tol = 1e-6) {
    for (const [k, v] of Object.entries(expected)) assertApprox(box[k], v, tol, k);
}

const box = (w, d, h, backW = w) => `
shape rectangle base { width: ${w} height: ${d} depth: 6 }
shape rectangle front { width: ${w} height: ${h} depth: 6 }
shape rectangle back { width: ${backW} height: ${h} depth: 6 }
shape rectangle west { width: ${d} height: ${h} depth: 6 }
shape rectangle east { width: ${d} height: ${h} depth: 6 }
join finger base.top front.top
join finger base.right east.top
join finger base.bottom back.top
join finger base.left west.top
join finger front.left east.right
join finger east.left back.right
join finger back.left west.right
join finger west.left front.right
ground base`;

test('the ground part lies flat at the identity pose', () => {
    const r = build('shape rectangle a { width: 100 height: 50 }\nshape rectangle b { width: 100 height: 50 }\njoin finger a.top b.top\nground a');
    assert(maxAbsDiff(r.solved.poses.get('a'), identity()) < 1e-12);
});

test('side up: the wall stands on the edge, its thickness inside the base outline', () => {
    const r = build('shape rectangle base { width: 400 height: 300 depth: 6 }\nshape rectangle wall { width: 400 height: 200 depth: 6 }\njoin finger base.bottom wall.top\nground base');
    near(bounds(r, 'wall'), { minX: 0, maxX: 400, minY: 294, maxY: 300, minZ: 0, maxZ: 200 });
});

test('side down: the wall hangs below, still inside the base outline', () => {
    const r = build('shape rectangle base { width: 400 height: 300 depth: 6 }\nshape rectangle wall { width: 400 height: 200 depth: 6 }\njoin finger base.bottom wall.top { side: down }\nground base');
    near(bounds(r, 'wall'), { minX: 0, maxX: 400, minY: 294, maxY: 300, minZ: -194, maxZ: 6 });
});

test('open box: every loop closes and the walls land on the outer faces', () => {
    const r = build(box(300, 200, 150));
    assertEqual(r.solved.inconsistent.length, 0, JSON.stringify(r.solved.inconsistent));
    assertEqual(r.solved.tree.length, 4);
    assertEqual(r.solved.redundant.length, 4);
    near(bounds(r, 'front'), { minX: 0, maxX: 300, minY: 0, maxY: 6, minZ: 0, maxZ: 150 });
    near(bounds(r, 'back'), { minX: 0, maxX: 300, minY: 194, maxY: 200, minZ: 0, maxZ: 150 });
    near(bounds(r, 'west'), { minX: 0, maxX: 6, minY: 0, maxY: 200, minZ: 0, maxZ: 150 });
    near(bounds(r, 'east'), { minX: 294, maxX: 300, minY: 0, maxY: 200, minZ: 0, maxZ: 150 });
    assert(!r.findings.some(f => f.code === 'loop_not_closed'));
});

test('a back panel 6 mm too wide: its corner loops do not close, by 3 mm on each side', () => {
    const r = build(box(300, 200, 150, 306));
    assertEqual(r.solved.inconsistent.length, 2, JSON.stringify(r.solved.inconsistent));
    for (const bad of r.solved.inconsistent) {
        assertApprox(bad.eT, 3, 1e-6, `${bad.jointId} residual`);
        assert(bad.cycle.includes('back'), bad.cycle.join(','));
    }
    const msgs = r.findings.filter(f => f.code === 'loop_not_closed').map(f => f.message);
    assertEqual(msgs.length, 2);
    assert(/does not close: off by 3\.0 mm/.test(msgs[0]), msgs[0]);
});

test('box finger cuts interlock in 3D: no point owned twice, no gaps', () => {
    const r = build(box(300, 200, 150));
    for (const joint of r.resolved.joints) {
        const s = sampleJoint(joint, r.resolved, r.solved.poses, r.cuts);
        assertEqual(s.double, 0, `${joint.id}: ${s.double}/${s.samples} points in two parts`);
        assertEqual(s.empty, 0, `${joint.id}: ${s.empty}/${s.samples} points in no part`);
    }
});

test('unequal box (410 × 170 × 95) still interlocks', () => {
    const r = build(box(410, 170, 95));
    assertEqual(r.solved.inconsistent.length, 0);
    for (const joint of r.resolved.joints) {
        const s = sampleJoint(joint, r.resolved, r.solved.poses, r.cuts);
        assertEqual(s.double + s.empty, 0, `${joint.id}`);
    }
});

test('two unconnected pairs are separate groups laid side by side', () => {
    const r = build(`shape rectangle a { width: 100 height: 50 }
shape rectangle b { width: 100 height: 50 }
shape rectangle c { width: 100 height: 50 }
shape rectangle d { width: 100 height: 50 }
join finger a.bottom b.top
join finger c.bottom d.top`);
    assertEqual(r.solved.components.length, 2);
    assert(r.findings.some(f => f.code === 'separate_groups'));
    const left = worldBounds(['a', 'b'], r.solved.poses, r.resolved.partsById);
    const right = worldBounds(['c', 'd'], r.solved.poses, r.resolved.partsById);
    assert(right.minX >= left.maxX, 'no overlap');
});

test('canvas position and rotation do not change the 3D result', () => {
    const a = build('shape rectangle base { width: 400 height: 300 }\nshape rectangle wall { width: 400 height: 200 }\njoin finger base.bottom wall.top\nground base');
    const b = build('shape rectangle base { width: 400 height: 300 }\nshape rectangle wall { x: 900 y: 40 width: 400 height: 200 }\ntransform wall { rotate: 35 }\njoin finger base.bottom wall.top\nground base');
    const wa = bounds(a, 'wall'), wb = bounds(b, 'wall');
    for (const k of Object.keys(wa)) assertApprox(wb[k], wa[k], 1e-6, k);
});

test('solving is deterministic', () => {
    const r1 = build(box(300, 200, 150)), r2 = build(box(300, 200, 150));
    for (const [id, pose] of r1.solved.poses) assertEqual(maxAbsDiff(pose, r2.solved.poses.get(id)), 0, id);
});

test('the code run reports a loop that does not close as a warning', () => {
    ShapeRegistry.resetIdCounters();
    const scene = new SceneState();
    const runner = new CodeRunner({ shapeStore: scene.shapeStore, parameterStore: scene.parameterStore, getScene: () => scene });
    const result = runner.run(box(300, 200, 150, 306), { clearExisting: true });
    assertEqual(result.jointErrors.length, 0);
    assertEqual(result.jointWarnings.length, 2);
    assert(/back/.test(result.jointWarnings.join(' ')));
});
