/**
 * Jev's offline guide: goals are read into a blueprint and sizes, the build
 * goes block by block through proposals, every recipe ends with no joint
 * problems, blocks built by hand count, and rejecting a block offers skip /
 * another joint / another size.
 */
import { test, assert, assertEqual, assertDeepEqual } from '../harness.js';
import { SceneState } from '../../src/core/SceneState.js';
import { HistoryManager } from '../../src/commands/HistoryManager.js';
import { ShapeRegistry } from '../../src/models/shapes/ShapeRegistry.js';
import { JevSession } from '../../src/jev/JevSession.js';
import { Guide } from '../../src/jev/guide/Guide.js';
import { BLUEPRINTS, resolveDims, boltFor } from '../../src/jev/guide/blueprints.js';
import { parseGoal, parseDims } from '../../src/jev/guide/goal.js';
import { checkDesign } from '../../src/jev/queries.js';
import { AddShapeCommand } from '../../src/commands/shapeCommands.js';
import { AddJointCommand } from '../../src/commands/jointCommands.js';

function setup({ policy = 'conservative' } = {}) {
    ShapeRegistry.resetIdCounters();
    const scene = new SceneState();
    const history = new HistoryManager(scene);
    const guide = new Guide({ getScene: () => scene });
    const session = new JevSession({ context: { scene, history }, guide, policy });
    return { scene, history, guide, session };
}

const shown = (session) => [...session.proposals.values()].filter(p => p.status === 'shown');
const openQuestion = (session) => session.transcript.filter(t => t.kind === 'question' && t.open).at(-1);

/** Accept every proposal until Jev stops proposing. */
async function acceptAll(session, limit = 30) {
    for (let i = 0; i < limit && shown(session).length; i++) await session.accept(shown(session)[0].id);
}

// ---- reading goals ------------------------------------------------------------------

test('goal: blueprint from keywords, sizes with units', () => {
    const g = parseGoal('Build me a bookshelf 80 cm tall with 3 shelves, 9mm plywood');
    assertEqual(g.blueprint.id, 'shelf');
    assertDeepEqual(g.dims, { count: 3, height: 800, thickness: 9 });
    assertEqual(parseGoal('a stool').blueprint.id, 'stool');
    assertEqual(parseGoal('hello there').blueprint, null);
});

test('goal: "A x B x C" follows the blueprint order, the trailing unit applies to all', () => {
    const box = BLUEPRINTS.find(b => b.id === 'box');
    assertDeepEqual(parseDims('box 30 x 20 x 15 cm', box), { width: 300, depth: 200, height: 150 });
    assertDeepEqual(parseDims('box 300×200', box), { width: 300, depth: 200 });
    const stool = BLUEPRINTS.find(b => b.id === 'stool');
    assertDeepEqual(parseDims('400 x 400 x 450', stool), { width: 400, height: 450 });
});

test('goal: labels before or after the number; a lone length is the main size', () => {
    const shelf = BLUEPRINTS.find(b => b.id === 'shelf');
    assertDeepEqual(parseDims('width: 50cm, depth 0.3 m', shelf), { width: 500, depth: 300 });
    assertDeepEqual(parseDims('a 1.2 m shelf', shelf), { height: 1200 });
    assertDeepEqual(parseDims('a shelf with 3 boards', shelf), { count: 3 });
    assertDeepEqual(parseDims('no numbers', shelf), {});
});

test('dims: defaults fill in, limits clamp', () => {
    const shelf = BLUEPRINTS.find(b => b.id === 'shelf');
    const d = resolveDims(shelf, { height: 99999, count: 0 });
    assertEqual(d.height, 3000);
    assertEqual(d.count, 1);
    assertEqual(d.width, 400);
});

test('bolt choice: the nut must fit inside the sheet', () => {
    assertEqual(boltFor(6), 'M3');
    assertEqual(boltFor(9), 'M5');
    assertEqual(boltFor(12), 'M6');
    assertEqual(boltFor(4), null);
});

// ---- building -------------------------------------------------------------------------

for (const bp of BLUEPRINTS) {
    test(`build-up: the ${bp.id} goes block by block and ends with no problems`, async () => {
        const { scene, session, history } = setup();
        await session.send(`build a ${bp.id}`);
        const blocks = bp.blocks(resolveDims(bp));
        assertEqual(session.plan.steps.length, blocks.length, 'one plan step per block');
        assertEqual(shown(session).length, 1, 'one block at a time');
        assertEqual(scene.shapeStore.getAll().length, 0, 'nothing placed before Apply');

        await acceptAll(session);
        const ids = blocks.flatMap(b => b.panels.map(p => p.id)).sort();
        assertDeepEqual(scene.shapeStore.getAll().map(s => s.id).sort(), ids);
        assertEqual(scene.jointStore.getAll().length, blocks.reduce((n, b) => n + b.variants[0].joints.length, 0));
        assert(session.plan.steps.every(s => s.done), 'every plan step ticked');
        assertEqual(checkDesign(scene).problems.length, 0, JSON.stringify(checkDesign(scene).problems));
        assert(/All \d+ blocks are in\. No problems/.test(session.transcript.at(-1).text), session.transcript.at(-1).text);
        assertEqual(history.stack.length, blocks.length, 'one undo step per block');
    });
}

test('build-up: every block variant fits without problems', async () => {
    for (const bp of BLUEPRINTS) {
        const blocks = bp.blocks(resolveDims(bp));
        for (let bi = 0; bi < blocks.length; bi++) {
            for (let vi = 1; vi < blocks[bi].variants.length; vi++) {
                const { scene, session, guide } = setup();
                await session.send(`build a ${bp.id}`);
                guide.variantOf.set(bi, vi);
                await acceptAll(session);
                assertEqual(checkDesign(scene).problems.length, 0, `${bp.id} block ${bi + 1} variant ${vi}: ${JSON.stringify(checkDesign(scene).problems)}`);
            }
        }
    }
});

test('build-up: sizes from the goal reach the panels', async () => {
    const { scene, session } = setup();
    await session.send('a box 40 x 25 x 12 cm');
    await acceptAll(session);
    const front = scene.shapeStore.get('front');
    assertEqual(front.width, 400);
    assertEqual(front.height, 120);
    assertEqual(scene.shapeStore.get('east').width, 250);
});

test('unclear goal: Jev asks what to build, the answer starts the plan', async () => {
    const { session } = setup();
    await session.send('hi');
    assertEqual(session.state, 'waiting');
    const q = openQuestion(session);
    assertDeepEqual(q.options, ['A box', 'A shelf', 'A stool']);
    await session.send('A shelf');
    assert(/^Shelf/.test(session.plan.goal), session.plan.goal);
    assertEqual(shown(session).length, 1);
});

test('blocks built by hand count: Jev proposes only what is missing', async () => {
    const { scene, history, session } = setup();
    await session.send('box');
    await session.accept(shown(session)[0].id);          // base
    // The user adds the front wall themselves, without the joint.
    const front = ShapeRegistry.create('rectangle', { x: 0, y: 300 }, { id: 'front', width: 300, height: 150, depth: 6 }, scene.shapeStore);
    await history.execute(new AddShapeCommand(front, { select: false }));
    const stale = shown(session)[0];
    await session.send('next');
    assertEqual(stale.status, 'superseded', 'the older proposal is withdrawn');
    assertEqual(shown(session).length, 1);
    const p = shown(session)[0];
    assert(/Front wall/.test(p.title), p.title);
    assertDeepEqual(p.steps.map(s => s.action), ['join'], 'only the joint is missing');
    assert(/already there/.test(p.why));
});

test('the plan ticks blocks the user builds or undoes by hand', async () => {
    const { scene, history, session } = setup();
    await session.send('box');
    assertEqual(session.plan.steps[0].done, false);
    const base = ShapeRegistry.create('rectangle', { x: 0, y: 0 }, { id: 'base', width: 300, height: 200, depth: 6 }, scene.shapeStore);
    await history.execute(new AddShapeCommand(base, { select: false }));
    session.syncPlan();
    assertEqual(session.plan.steps[0].done, false, 'not done: the ground is not set yet');
    scene.jointStore.ground = 'base';
    session.syncPlan();
    assertEqual(session.plan.steps[0].done, true);
    await history.undo();
    scene.jointStore.ground = null;
    session.syncPlan();
    assertEqual(session.plan.steps[0].done, false, 'undo un-ticks');
});

test('reject → choices; "Other joint" re-proposes the block with its next variant', async () => {
    const { session } = setup();
    await session.send('shelf');
    await session.accept(shown(session)[0].id);   // side_a
    await session.accept(shown(session)[0].id);   // side_b
    const wedge = shown(session)[0];
    assert(/wedges/i.test(wedge.title), wedge.title);
    await session.reject(wedge.id, 'no wedges please');
    assertDeepEqual(openQuestion(session).options, ['Skip', 'Other joint', 'Change size', 'Stop']);
    await session.send('Other joint');
    const plain = shown(session)[0];
    assert(/Plain tabs/.test(plain.title), plain.title);
    assert(plain.steps.every(s => s.action !== 'join' || s.args.params?.lock !== 'wedge'));
});

test('reject → "Skip" moves on and the wrap-up names the skipped block', async () => {
    const { session } = setup();
    await session.send('stool');
    await session.accept(shown(session)[0].id);
    await session.accept(shown(session)[0].id);
    await session.reject(shown(session)[0].id);
    await session.send('Skip');
    assertEqual(shown(session).length, 0);
    assert(/skipped: Seat/.test(session.transcript.at(-1).text), session.transcript.at(-1).text);
});

test('a new size resizes the placed panels in one proposal, then the build goes on', async () => {
    const { scene, session } = setup();
    await session.send('box');
    await session.accept(shown(session)[0].id);    // base 300 × 200
    await session.reject(shown(session)[0].id);
    await session.send('Change size');
    await session.send('400 x 250 x 200');
    const resize = shown(session)[0];
    assertEqual(resize.title, 'Resize the placed panels');
    await session.accept(resize.id);
    assertEqual(scene.shapeStore.get('base').width, 400);
    assertEqual(scene.shapeStore.get('base').height, 250);
    const next = shown(session)[0];
    assert(/Front wall/.test(next.title));
    assertEqual(next.steps[0].args.width, 400);
    assertEqual(next.steps[0].args.height, 200);
});

test('parts bigger than the laser bed are flagged up front', async () => {
    const { session } = setup();
    await session.send('a shelf 1.5 m tall');
    assert(/bigger than your 600 × 400 mm laser bed/.test(session.transcript.find(t => t.kind === 'jev').text));
});

test('autopilot builds the whole recipe without asking', async () => {
    const { scene, session } = setup({ policy: 'autopilot' });
    await session.send('stool');
    assertEqual(shown(session).length, 0);
    assertEqual(scene.shapeStore.getAll().length, 3);
    assertEqual([...session.proposals.values()].every(p => p.status === 'auto-applied'), true);
});

test('a joint the user added by hand is not proposed twice', async () => {
    const { scene, history, session } = setup();
    await session.send('stool');
    await session.accept(shown(session)[0].id);   // leg_a
    const legB = ShapeRegistry.create('rectangle', { x: 400, y: 0 }, { id: 'leg_b', width: 360, height: 380, depth: 9 }, scene.shapeStore);
    await history.execute(new AddShapeCommand(legB, { select: false }));
    await history.execute(new AddJointCommand({ type: 'cross_lap', a: { shape: 'leg_b', edge: 'bottom', at: 180 }, b: { shape: 'leg_a', edge: 'top', at: 180 }, params: {} }));
    await session.send('next');
    assert(/Seat/.test(shown(session)[0].title), 'the second leg counts as done (ports in either order)');
});

test('proposal steps read as plain language', async () => {
    const { describeStep } = await import('../../src/jev/format.js');
    assertEqual(describeStep({ action: 'add_panel', args: { id: 'front', width: 300, height: 150, thickness: 6 } }), 'Add panel front — 300 × 150 mm, 6 mm sheet');
    assertEqual(describeStep({ action: 'join', args: { type: 'tab_slot', a: { shape: 'board_1', edge: 'left' }, b: { shape: 'side_a', edge: 'top', inset: 140 }, params: { tabs: 2, lock: 'wedge' } } }),
        'Tab and slot: board_1.left ↔ side_a.top.inset(140) (tabs 2, lock wedge)');
    assertEqual(describeStep({ action: 'set_panel_size', args: { id: 'base', thickness: 9 } }), 'Resize base → 9 mm sheet');
    assertEqual(describeStep({ action: 'set_ground', args: { shape: 'seat' } }), 'seat lies on the floor in 3D');
});

test('one click: rejecting with an offered alternative acts on it without asking', async () => {
    const { session } = setup();
    await session.send('shelf');
    await session.accept(shown(session)[0].id);
    await session.accept(shown(session)[0].id);
    const wedge = shown(session)[0];
    assertDeepEqual(wedge.alternatives, ['Other joint', 'Skip']);
    await session.reject(wedge.id, 'Other joint');
    assertEqual(openQuestion(session), undefined, 'no question asked');
    assert(/Plain tabs/.test(shown(session)[0].title), shown(session)[0].title);
    await session.reject(shown(session)[0].id, 'Skip');
    assert(/Board 2/.test(shown(session)[0].title), shown(session)[0].title);
});

test('a block with one joint offers only Skip; the preview copy is kept while shown, dropped after', async () => {
    const { scene, session } = setup();
    await session.send('box');
    const p = shown(session)[0];
    assertDeepEqual(p.alternatives, ['Skip']);
    assert(p.preview.scene.shapeStore.get('base'), 'the copy holds the ghost panel');
    assert(!scene.shapeStore.get('base'), 'the real design does not');
    await session.accept(p.id);
    assertEqual(p.preview.scene, undefined);
});

test('ghost: the new panel and the panel that gains teeth, the new joint, and where they are', async () => {
    const { ghostOf, union } = await import('../../src/jev/ghost.js');
    const { scene, session } = setup();
    await session.send('box');
    const base = ghostOf(shown(session)[0], scene);
    assertDeepEqual(base.shapeIds, ['base']);
    assertDeepEqual(base.jointIds, []);
    assertDeepEqual([base.bounds.width, base.bounds.height], [300, 200]);
    await session.accept(shown(session)[0].id);

    const front = ghostOf(shown(session)[0], scene);
    assertDeepEqual(front.shapeIds.sort(), ['base', 'front']);
    assertEqual(front.jointIds.length, 1);
    assert(front.bounds.width > 300, 'spans base and the new wall');
    assertEqual(ghostOf({ steps: [] }, scene), null, 'no copy, no ghost');
    assertDeepEqual(union(null, { x: 1, y: 2, width: 3, height: 4 }), { x: 1, y: 2, width: 3, height: 4 });
    assertDeepEqual(union({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: -5, width: 10, height: 10 }), { x: 0, y: -5, width: 15, height: 15 });
});
