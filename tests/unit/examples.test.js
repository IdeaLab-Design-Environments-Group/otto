/**
 * The Code tab's example programs must keep working: each runs, the
 * well-formed ones produce no joint errors or warnings and all their loops
 * close, and "Mistakes on purpose" produces exactly its intended problems.
 */
import { test, assert, assertEqual } from '../harness.js';
import { SceneState } from '../../src/core/SceneState.js';
import { ShapeRegistry } from '../../src/models/shapes/ShapeRegistry.js';
import { CodeRunner } from '../../src/programming/CodeRunner.js';
import { resolveJoints } from '../../src/joints/JointService.js';
import { JOINT_EXAMPLES } from '../../src/examples/jointExamples.js';

function run(code) {
    ShapeRegistry.resetIdCounters();
    const scene = new SceneState();
    const result = new CodeRunner({ shapeStore: scene.shapeStore, parameterStore: scene.parameterStore, getScene: () => scene })
        .run(code, { clearExisting: true });
    return { scene, result };
}

test('examples have unique ids, a title, a description and code', () => {
    const ids = JOINT_EXAMPLES.map(e => e.id);
    assertEqual(new Set(ids).size, ids.length);
    for (const e of JOINT_EXAMPLES) assert(e.title && e.description && e.code.includes('join'), e.id);
});

for (const example of JOINT_EXAMPLES.filter(e => e.id !== 'mistakes')) {
    test(`example "${example.title}" runs cleanly and every loop closes`, () => {
        const { scene, result } = run(example.code);
        assert(result.success, result.error);
        assert(result.jointsCreated > 0, 'has joints');
        assertEqual(result.jointErrors.length, 0, result.jointErrors.join('; '));
        assertEqual(result.jointWarnings.length, 0, result.jointWarnings.join('; '));
        assertEqual(resolveJoints(scene).solved.inconsistent.length, 0);
    });
}

test('example "Mistakes on purpose" shows a bad edge name and two loops that do not close', () => {
    const { result } = run(JOINT_EXAMPLES.find(e => e.id === 'mistakes').code);
    assert(result.success);
    assertEqual(result.jointErrors.length, 1);
    assert(/no straight edge 'middle'/.test(result.jointErrors[0]));
    assertEqual(result.jointWarnings.length, 2);
    assert(result.jointWarnings.every(w => /does not close: off by 3\.0 mm/.test(w)));
});
