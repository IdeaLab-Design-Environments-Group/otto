/**
 * meshSpecs: what the 3D preview draws — one extrusion per jointed part at
 * its solved pose, parts in a loop that does not close flagged 'bad', and a
 * hinge strip left out of the 3D outline (it bends there).
 */
import { test, assert, assertEqual, assertApprox } from '../harness.js';
import { SceneState } from '../../src/core/SceneState.js';
import { ShapeRegistry } from '../../src/models/shapes/ShapeRegistry.js';
import { CodeRunner } from '../../src/programming/CodeRunner.js';
import { resolveJoints } from '../../src/joints/JointService.js';
import { meshSpecs } from '../../src/views/three/meshSpecs.js';
import { bounds } from '../../src/fabrication/polygon.js';

function specsOf(code) {
    ShapeRegistry.resetIdCounters();
    const scene = new SceneState();
    new CodeRunner({ shapeStore: scene.shapeStore, parameterStore: scene.parameterStore, getScene: () => scene }).run(code, { clearExisting: true });
    const joints = resolveJoints(scene);
    return { joints, specs: meshSpecs(joints) };
}

test('one spec per jointed part with its pose, thickness and cut outline', () => {
    const { joints, specs } = specsOf(`shape rectangle base { width: 300 height: 200 depth: 6 }
shape rectangle wall { width: 300 height: 120 depth: 9 }
shape rectangle loose { width: 50 height: 50 }
join finger base.bottom wall.top
ground base`);
    assertEqual(specs.parts.map(p => p.partId).join(','), 'base,wall', 'unjointed shapes are not drawn');
    const wall = specs.parts.find(p => p.partId === 'wall');
    assertEqual(wall.depth, 9);
    assertEqual(wall.matrix.length, 16);
    assertEqual(JSON.stringify(wall.matrix), JSON.stringify(joints.solved.poses.get('wall')));
    assert(wall.outer.length > 4, 'teeth included');
    assertEqual(specs.problems.length, 0);
});

test('parts in a loop that does not close are flagged, with the reason', () => {
    const { specs } = specsOf(`shape rectangle base { width: 300 height: 200 depth: 6 }
shape rectangle front { width: 300 height: 150 depth: 6 }
shape rectangle back { width: 306 height: 150 depth: 6 }
shape rectangle west { width: 200 height: 150 depth: 6 }
shape rectangle east { width: 200 height: 150 depth: 6 }
join finger base.top front.top
join finger base.right east.top
join finger base.bottom back.top
join finger base.left west.top
join finger front.left east.right
join finger east.left back.right
join finger back.left west.right
join finger west.left front.right
ground base`);
    assertEqual(specs.parts.find(p => p.partId === 'back').status, 'bad');
    assertEqual(specs.parts.find(p => p.partId === 'front').status, 'ok');
    assertEqual(specs.problems.length, 2);
});

test('a hinge strip is flat-cut only: the 3D outline is the plain panel', () => {
    const { joints, specs } = specsOf(`shape rectangle a { width: 300 height: 200 depth: 3 }
shape rectangle b { width: 250 height: 200 depth: 3 }
join hinge a.right b.left { fold: 90 radius: 20 }
ground a`);
    assert(bounds(joints.cuts.get('a').outer).w > 300, '2D cut has the strip');
    assertApprox(bounds(specs.parts.find(p => p.partId === 'a').outer).w, 300, 1e-9);
    assertEqual(specs.parts.find(p => p.partId === 'a').holes.length, 0, 'no slits in 3D');
});
