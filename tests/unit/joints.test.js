/**
 * Two-sided joints between shapes (J1: finger): the two cuts are exact
 * complements, depths come from the mate's thickness, problems are reported
 * per joint, and every change is an undoable command.
 */
import { test, assert, assertEqual, assertApprox } from '../harness.js';
import { SceneState } from '../../src/core/SceneState.js';
import { HistoryManager } from '../../src/commands/HistoryManager.js';
import { CommandCatalog } from '../../src/commands/CommandCatalog.js';
import { RemoveShapesCommand } from '../../src/commands/shapeCommands.js';
import { ReplaceSceneCommand } from '../../src/commands/sceneCommands.js';
import { ShapeRegistry } from '../../src/models/shapes/ShapeRegistry.js';
import { Parameter } from '../../src/models/Parameter.js';
import { resolveJoints } from '../../src/joints/JointService.js';
import { jointTypes } from '../../src/joints/JointRegistry.js';
import { fingerCount } from '../../src/joints/types/finger.js';
import { signedArea } from '../../src/fabrication/polygon.js';

const catalog = new CommandCatalog();

function scene() {
    ShapeRegistry.resetIdCounters();
    const s = new SceneState();
    return { scene: s, history: new HistoryManager(s) };
}

function rect(s, id, w, h, depth = 6, x = 0, y = 0) {
    const shape = ShapeRegistry.create('rectangle', { x, y }, { id, x, y, width: w, height: h, depth }, s.shapeStore);
    s.shapeStore.add(shape);
    return shape;
}

const run = (history, name, args) => history.execute(catalog.create(name, args));

async function rejects(promise) {
    try { await promise; } catch (e) { return e.message; }
    return null;
}

/** Edge features of one joint, split by part. */
function featuresOf(s, jointId) {
    const { resolved } = resolveJoints(s);
    const joint = resolved.joints.find(j => j.id === jointId);
    const partA = resolved.partsById.get(joint.a.partId), partB = resolved.partsById.get(joint.b.partId);
    const all = jointTypes.get(joint.type).cut({ joint, partA, partB });
    return { joint, partA, partB, a: all.filter(f => f.partId === partA.id), b: all.filter(f => f.partId === partB.id) };
}

test('finger count is odd and at least 3', () => {
    assertEqual(fingerCount(100, 15), 7);
    assertEqual(fingerCount(100, 25), 5);
    assertEqual(fingerCount(10, 25), 3);
    assertEqual(fingerCount(100, 15, 4), 5, 'an even request is rounded up');
});

test('finger: A and B notches tile the shared edge exactly once (snug)', async () => {
    const { scene: s, history } = scene();
    rect(s, 'base', 400, 300);
    rect(s, 'wall', 400, 200);
    await run(history, 'joint.add', { type: 'finger', a: { shape: 'base', edge: 'top' }, b: { shape: 'wall', edge: 'bottom' } });
    const { a, b } = featuresOf(s, 'j1');
    // Map B's intervals into A's coordinates (B runs the other way: u = s − v, s = 400).
    const intervals = [...a.map(f => [f.u0, f.u1]), ...b.map(f => [400 - f.u1, 400 - f.u0])].sort((p, q) => p[0] - q[0]);
    assertApprox(intervals[0][0], 0, 1e-9, 'starts at the corner');
    for (let i = 1; i < intervals.length; i++) assertApprox(intervals[i][0], intervals[i - 1][1], 1e-9, `no gap/overlap at ${i}`);
    assertApprox(intervals[intervals.length - 1][1], 400, 1e-9, 'ends at the corner');
    assertEqual(a.length, b.length + 1, 'A takes the odd one: both end notches');
});

test('finger: notch depth is the MATE thickness', async () => {
    const { scene: s, history } = scene();
    rect(s, 'base', 400, 300, 6);
    rect(s, 'wall', 400, 200, 9);
    await run(history, 'joint.add', { type: 'finger', a: { shape: 'base', edge: 'top' }, b: { shape: 'wall', edge: 'bottom' } });
    const { a, b } = featuresOf(s, 'j1');
    assert(a.every(f => f.depth === 9), 'base notched by the wall thickness');
    assert(b.every(f => f.depth === 6), 'wall notched by the base thickness');
});

test('finger: loose fit widens every interior notch by the clearance', async () => {
    const { scene: s, history } = scene();
    rect(s, 'base', 400, 300);
    rect(s, 'wall', 400, 200);
    await run(history, 'joint.add', { type: 'finger', a: { shape: 'base', edge: 'top' }, b: { shape: 'wall', edge: 'bottom' }, params: { count: 7 } });
    const snug = featuresOf(s, 'j1').b[0];
    await run(history, 'joint.setParams', { id: 'j1', params: { fit: 'loose' } });
    const loose = featuresOf(s, 'j1').b[0];
    assertApprox((loose.u1 - loose.u0) - (snug.u1 - snug.u0), 0.15, 1e-9);
});

test('cut outlines: both panels get teeth, outlines stay simple and positive', async () => {
    const { scene: s, history } = scene();
    rect(s, 'base', 400, 300);
    rect(s, 'wall', 400, 200);
    await run(history, 'joint.add', { type: 'finger', a: { shape: 'base', edge: 'top' }, b: { shape: 'wall', edge: 'bottom' }, params: { count: 7 } });
    const { cuts } = resolveJoints(s);
    // base: 4 corners; the two end notches merge into its top corners → 2 + 4·2 interior notch points … check counts loosely.
    assert(cuts.get('base').outer.length > 4 && cuts.get('wall').outer.length > 4, 'teeth added');
    for (const [id, cut] of cuts) assert(signedArea(cut.outer) > 0, `${id} positive winding`);
    // Base top corners are notched: the corner vertex moved inward by the wall thickness.
    assert(!cuts.get('base').outer.some(p => p.x === 0 && p.y === 0), 'top-left corner removed');
    assert(cuts.get('base').outer.some(p => p.x === 0 && p.y === 6), 'corner notch reaches depth 6');
});

test('a path drawn in the opposite winding is cut the same way', async () => {
    const { scene: s, history } = scene();
    rect(s, 'base', 400, 300);
    const pts = [{ x: 0, y: 0 }, { x: 0, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 0 }];   // reversed winding
    const path = ShapeRegistry.create('path', { x: 0, y: 0 }, { id: 'p', points: pts, closed: true, depth: 6 }, s.shapeStore);
    s.shapeStore.add(path);
    await run(history, 'joint.add', { type: 'finger', a: { shape: 'base', edge: 'top' }, b: { shape: 'p', edge: 'e3' } });
    const { cuts, findings } = resolveJoints(s);
    assertEqual(findings.filter(f => f.severity === 'error').length, 0, JSON.stringify(findings));
    const area = signedArea(cuts.get('p').outer);
    assert(area > 0 && area < 400 * 200, 'notches removed material, inside the outline');
});

test('params bind to scene parameters', async () => {
    const { scene: s, history } = scene();
    s.parameterStore.add(new Parameter('n', 'n', 5, 3, 21, 1));
    rect(s, 'base', 400, 300);
    rect(s, 'wall', 400, 200);
    await run(history, 'joint.add', { type: 'finger', a: { shape: 'base', edge: 'top' }, b: { shape: 'wall', edge: 'bottom' }, params: { count: 'n' } });
    assertEqual(featuresOf(s, 'j1').a.length, 3, '5 teeth: A has 3');
    s.parameterStore.setValue('n', 9);
    assertEqual(featuresOf(s, 'j1').a.length, 5, '9 teeth: A has 5');
});

test('invalid joints are rejected with a reason and leave no trace', async () => {
    const { scene: s, history } = scene();
    rect(s, 'base', 400, 300);
    rect(s, 'wall', 400, 200);
    const c = ShapeRegistry.create('circle', { x: 0, y: 0 }, { id: 'c' }, s.shapeStore);
    s.shapeStore.add(c);
    const add = (args) => rejects(run(history, 'joint.add', { type: 'finger', ...args }));
    assert(/no straight edge 'side'.*top/.test(await add({ a: { shape: 'base', edge: 'side' }, b: { shape: 'wall', edge: 'bottom' } })));
    assert(/c has no straight edge 'e0'/.test(await add({ a: { shape: 'c', edge: 'e0' }, b: { shape: 'wall', edge: 'bottom' } })), 'a circle has no straight edges');
    assert(/'ghost' does not exist/.test(await add({ a: { shape: 'ghost', edge: 'top' }, b: { shape: 'wall', edge: 'bottom' } })));
    assert(/two different shapes/.test(await add({ a: { shape: 'base', edge: 'top' }, b: { shape: 'base', edge: 'bottom' } })));
    assert(/Unknown name 'm'/.test(await add({ a: { shape: 'base', edge: 'top' }, b: { shape: 'wall', edge: 'bottom' }, params: { count: 'm + 1' } })));
    assert(/unknown parameter 'teeth'/.test(await add({ a: { shape: 'base', edge: 'top' }, b: { shape: 'wall', edge: 'bottom' }, params: { teeth: 5 } })));
    assert(/fold must be one of 90/.test(await add({ a: { shape: 'base', edge: 'top' }, b: { shape: 'wall', edge: 'bottom' }, params: { fold: 45 } })));
    assert(/Unknown joint type 'glue'/.test(await rejects(run(history, 'joint.add', { type: 'glue', a: { shape: 'base', edge: 'top' }, b: { shape: 'wall', edge: 'bottom' } }))));
    assertEqual(s.jointStore.getAll().length, 0);
    assertEqual(history.stack.length, 0);
});

test('add / edit / remove are undoable; param edits coalesce', async () => {
    const { scene: s, history } = scene();
    rect(s, 'base', 400, 300);
    rect(s, 'wall', 400, 200);
    await run(history, 'joint.add', { type: 'finger', a: { shape: 'base', edge: 'top' }, b: { shape: 'wall', edge: 'bottom' } });
    for (const n of [5, 7, 9]) await run(history, 'joint.setParams', { id: 'j1', params: { count: n } });
    assertEqual(history.stack.length, 2, 'add + one coalesced edit');
    await history.undo();
    assertEqual(s.jointStore.get('j1').params.count, undefined);
    await history.redo();
    assertEqual(s.jointStore.get('j1').params.count, 9);
    await run(history, 'joint.remove', { id: 'j1' });
    assertEqual(s.jointStore.getAll().length, 0);
    await history.undo();
    assertEqual(s.jointStore.get('j1').type, 'finger');
});

test('deleting a shape removes its joints and ground; undo brings them back', async () => {
    const { scene: s, history } = scene();
    rect(s, 'base', 400, 300);
    rect(s, 'wall', 400, 200);
    await run(history, 'joint.add', { type: 'finger', a: { shape: 'base', edge: 'top' }, b: { shape: 'wall', edge: 'bottom' } });
    await run(history, 'joint.setGround', { shape: 'wall' });
    await history.execute(new RemoveShapesCommand(['wall']));
    assertEqual(s.jointStore.getAll().length, 0);
    assertEqual(s.jointStore.ground, null);
    await history.undo();
    assertEqual(s.jointStore.getAll().length, 1);
    assertEqual(s.jointStore.ground, 'wall');
    assert(s.shapeStore.get('wall'), 'shape restored');
});

test('ReplaceSceneCommand (code run undo) restores joints', async () => {
    const { scene: s, history } = scene();
    rect(s, 'base', 400, 300);
    rect(s, 'wall', 400, 200);
    await run(history, 'joint.add', { type: 'finger', a: { shape: 'base', edge: 'top' }, b: { shape: 'wall', edge: 'bottom' } });
    const replace = new ReplaceSceneCommand('Run code', s);
    s.jointStore.fromJSON(null);
    replace.captureAfter(s);
    history.record(replace);
    await history.undo();
    assertEqual(s.jointStore.getAll().length, 1);
    await history.redo();
    assertEqual(s.jointStore.getAll().length, 0);
});

test('a joint follows its shape: resizing the wall re-cuts both panels', async () => {
    const { scene: s, history } = scene();
    rect(s, 'base', 400, 300);
    const wall = rect(s, 'wall', 400, 200);
    await run(history, 'joint.add', { type: 'finger', a: { shape: 'base', edge: 'top' }, b: { shape: 'wall', edge: 'bottom' } });
    const before = resolveJoints(s).cuts.get('base').outer.length;
    wall.width = 300;
    const after = resolveJoints(s);
    assert(after.findings.some(f => f.code === 'finger_unequal'), 'unequal edges reported');
    assert(after.cuts.get('base').outer.length !== before, 're-cut');
});

test('JointsPass strokes the cut outlines of both jointed shapes', async () => {
    const { JointsPass } = await import('../../src/views/canvas/passes/JointsPass.js');
    const { scene: s, history } = scene();
    rect(s, 'base', 400, 300);
    rect(s, 'wall', 400, 200);
    rect(s, 'loose', 50, 50);
    await run(history, 'joint.add', { type: 'finger', a: { shape: 'base', edge: 'top' }, b: { shape: 'wall', edge: 'bottom' }, params: { count: 7 } });
    const calls = { lineTo: 0, stroke: 0 };
    const ctx = new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : (k === 'lineTo' || k === 'stroke' ? () => { calls[k]++; } : () => {})),
        set: (t, k, v) => { t[k] = v; return true; }
    });
    new JointsPass().render({ ctx, scene: s, viewport: { zoom: 1 }, bindingResolver: s.bindingResolver, interaction: {} });
    const { cuts } = resolveJoints(s);
    assertEqual(calls.stroke, 4 + 1, 'erase + draw for each of the two jointed shapes, plus the joint link');
    const expected = ['base', 'wall'].reduce((n, id) => n + (cuts.get(id).outer.length - 1) + 3, 0) + 1;
    assertEqual(calls.lineTo, expected, 'one lineTo per outline vertex (erased rectangle has 4 points), plus the link');
});

test('joint.add keeps inset / at / line port references', async () => {
    const { scene: s, history } = scene();
    rect(s, 'side', 280, 600);
    rect(s, 'shelf', 300, 280);
    await run(history, 'joint.add', { type: 'tab_slot', a: { shape: 'shelf', edge: 'left' }, b: { shape: 'side', edge: 'top', inset: 150 } });
    assertEqual(JSON.stringify(s.jointStore.get('j1').b), '{"shape":"side","edge":"top","inset":150}');
    rect(s, 'xa', 200, 160);
    rect(s, 'xb', 200, 160);
    await run(history, 'joint.add', { type: 'cross_lap', a: { shape: 'xa', edge: 'top', at: 100 }, b: { shape: 'xb', edge: 'bottom', at: 100 } });
    assertEqual(s.jointStore.get('j2').a.at, 100);
});
