/**
 * Jev session: proposals are dry-run before they are shown, apply as ONE
 * undo step, invalid steps are reported and never shown, the policy decides
 * what may apply itself, and everything is logged. The guide is a scripted
 * stand-in here (tests/unit/jevGuide.test.js covers the real one).
 */
import { test, assert, assertEqual } from '../harness.js';
import { SceneState } from '../../src/core/SceneState.js';
import { HistoryManager } from '../../src/commands/HistoryManager.js';
import { ShapeRegistry } from '../../src/models/shapes/ShapeRegistry.js';
import { CodeRunner } from '../../src/programming/CodeRunner.js';
import { JevSession } from '../../src/jev/JevSession.js';
import { dryRun } from '../../src/jev/dryRun.js';
import { describeScene, listOpenEdges } from '../../src/jev/queries.js';
import { JOINT_EXAMPLES } from '../../src/examples/jointExamples.js';

/** A guide that answers each event with the next scripted list of effects, recording what it heard. */
function scriptedGuide(script) {
    const queue = [...script];
    const heard = [];
    const next = (event) => { heard.push(event); return queue.shift() ?? []; };
    return {
        heard,
        onText: (text) => next({ text }),
        onApplied: () => next({ applied: true }),
        onRejected: (reason) => next({ rejected: reason })
    };
}

function setup(script, { code = '', policy = 'balanced' } = {}) {
    ShapeRegistry.resetIdCounters();
    const scene = new SceneState();
    if (code) new CodeRunner({ shapeStore: scene.shapeStore, parameterStore: scene.parameterStore, getScene: () => scene }).run(code, { clearExisting: true });
    const history = new HistoryManager(scene);
    const guide = scriptedGuide(script);
    const session = new JevSession({ context: { scene, history }, guide, policy });
    return { scene, history, guide, session };
}

const BASE_AND_FRONT = [
    { action: 'add_panel', args: { id: 'base', width: 300, height: 200 } },
    { action: 'add_panel', args: { id: 'front', width: 300, height: 150 } },
    { action: 'join', args: { type: 'finger', a: { shape: 'base', edge: 'top' }, b: { shape: 'front', edge: 'top' } } }
];
const propose = (title, steps, extra = {}) => ({ propose: { title, why: '', steps, ...extra } });

test('build-up: plan → proposal shown → accept applies it as one undo step → Jev continues', async () => {
    const { scene, history, session, guide } = setup([
        [{ plan: { goal: 'open box', steps: ['base and front', 'sides', 'back'] } },
            { propose: { title: 'Base and front', why: 'A finger joint makes a strong 90° corner.', steps: BASE_AND_FRONT, planStep: 1 } }],
        [{ say: 'Next: the sides.' }]
    ]);
    await session.send('Build me an open box 300 × 200 × 150.');
    assertEqual(session.state, 'waiting');
    assertEqual(session.plan.steps.length, 3);
    const p = session.proposals.get('p1');
    assertEqual(p.status, 'shown');
    assertEqual(scene.shapeStore.getAll().length, 0, 'nothing changed before accept');

    await session.accept('p1');
    assertEqual(p.status, 'applied');
    assertEqual(scene.shapeStore.getAll().map(s => s.id).join(','), 'base,front');
    assertEqual(scene.jointStore.getAll().length, 1);
    assert(session.plan.steps[0].done, 'plan step 1 ticked');
    assertEqual(session.state, 'idle');
    assert(guide.heard.at(-1).applied, 'the guide hears it was applied');
    assertEqual(session.transcript.at(-1).text, 'Next: the sides.');

    assertEqual(history.stack.length, 1, 'one history entry');
    await history.undo();
    assertEqual(scene.shapeStore.getAll().length, 0);
    assertEqual(scene.jointStore.getAll().length, 0);
});

test('an invalid proposal is not shown; the reason is noted', async () => {
    const bad = BASE_AND_FRONT.map(s => s.action === 'join' ? { ...s, args: { ...s.args, a: { shape: 'base', edge: 'middle' } } } : s);
    const { session, scene } = setup([[propose('Try', bad)]]);
    await session.send('go');
    assertEqual(session.proposals.size, 0);
    assert(/no straight edge 'middle'/.test(session.transcript.at(-1).text), session.transcript.at(-1).text);
    assertEqual(session.state, 'idle');
    assertEqual(scene.shapeStore.getAll().length, 0);
});

test('malformed steps are reported by schema, not executed', async () => {
    const { session } = setup([[propose('x', [{ action: 'add_panel', args: { id: 'p' } }, { action: 'paint', args: {} }])]]);
    await session.send('go');
    assertEqual(session.proposals.size, 0);
    const note = session.transcript.at(-1).text;
    assert(/width is required/.test(note) && /unknown action 'paint'/.test(note), note);
});

test('reject: nothing changes and the guide hears why', async () => {
    const { session, scene, guide } = setup([[propose('Base and front', BASE_AND_FRONT, { alternatives: ['Other joint'] })], [{ say: 'A tab and slot then.' }]]);
    await session.send('go');
    assertEqual(session.proposals.get('p1').alternatives.join(), 'Other joint');
    await session.reject('p1', 'Other joint');
    assertEqual(session.proposals.get('p1').status, 'rejected');
    assertEqual(scene.shapeStore.getAll().length, 0);
    assertEqual(guide.heard.at(-1).rejected, 'Other joint');
});

const MISTAKES = JOINT_EXAMPLES.find(e => e.id === 'mistakes').code.replace(/^join finger front\.middle.*$/m, '');
const FIX_BACK = [{ action: 'set_panel_size', args: { id: 'back', width: 300 } }];

test('balanced policy: a small fix that removes problems applies itself', async () => {
    const { session, scene, guide } = setup([
        [{ propose: { title: 'Make the back 300 wide', why: 'It is 6 mm too wide.', steps: FIX_BACK } }],
        [{ say: 'Fixed.' }]
    ], { code: MISTAKES });
    await session.send('Why does it not close?');
    assertEqual(session.proposals.get('p1').status, 'auto-applied');
    assertEqual(scene.shapeStore.get('back').width, 300);
    assert(guide.heard.at(-1).applied, 'the guide carries on after an auto-applied fix');
    assertEqual(session.state, 'idle');
});

test('balanced policy: new panels and joints wait for the user', async () => {
    const { session } = setup([[propose('Base and front', BASE_AND_FRONT)]]);
    await session.send('go');
    assertEqual(session.proposals.get('p1').decision, 'confirm');
});

test('conservative asks even for fixes; autopilot applies structure but never removals', async () => {
    const c = setup([[propose('fix', FIX_BACK)]], { code: MISTAKES, policy: 'conservative' });
    await c.session.send('fix');
    assertEqual(c.session.proposals.get('p1').decision, 'confirm');

    const a = setup([[propose('Base and front', BASE_AND_FRONT)], [{ say: 'done' }]], { policy: 'autopilot' });
    await a.session.send('go');
    assertEqual(a.session.proposals.get('p1').status, 'auto-applied');

    const r = setup([[propose('remove', [{ action: 'remove_panel', args: { id: 'base' } }])]], { code: MISTAKES, policy: 'autopilot' });
    await r.session.send('remove');
    assertEqual(r.session.proposals.get('p1').decision, 'confirm');
});

test('a question waits; the answer goes to the guide and closes it', async () => {
    const { session, guide } = setup([
        [{ ask: { question: 'How tall?', options: ['450', '750'] } }],
        [{ say: '750 it is.' }]
    ]);
    await session.send('a table');
    assertEqual(session.state, 'waiting');
    assert(session.transcript.some(t => t.kind === 'question' && t.open));
    await session.send('750');
    assertEqual(guide.heard.at(-1).text, '750');
    assertEqual(session.state, 'idle');
    assert(!session.transcript.some(t => t.kind === 'question' && t.open), 'question closed');
});

test('a guide failure is shown, not thrown', async () => {
    const { session } = setup([]);
    session.guide = { onText: () => { throw new Error('no recipe'); } };
    await session.send('go');
    assertEqual(session.state, 'error');
    assert(/no recipe/.test(session.transcript.at(-1).text));
});

test('dry run reports new and fixed problems and leaves the real scene alone', async () => {
    const { scene } = setup([], { code: MISTAKES });
    const before = JSON.stringify(scene.shapeStore.toJSON());
    const r = await dryRun(scene, FIX_BACK);
    assert(r.ok);
    assertEqual(r.fixedProblems.filter(p => p.code === 'loop_not_closed').length, 2);
    assertEqual(r.newProblems.length, 0);
    assertEqual(JSON.stringify(scene.shapeStore.toJSON()), before);
});

test('queries: scene summary and open edges (the free Lego studs)', () => {
    const { scene } = setup([], { code: 'shape rectangle a { width: 100 height: 50 }\nshape rectangle b { width: 100 height: 50 }\njoin finger a.top b.bottom' });
    const d = describeScene(scene);
    assertEqual(d.shapes.map(s => `${s.id}:${s.width}x${s.height}`).join(','), 'a:100x50,b:100x50');
    const open = listOpenEdges(scene).map(e => e.port);
    assert(!open.includes('a.top') && !open.includes('b.bottom'), 'used edges are not open');
    assert(open.includes('a.bottom') && open.includes('b.left'));
});

test('session log: one event per step, exportable, redactable', async () => {
    const { session } = setup([[propose('Base and front', BASE_AND_FRONT)], [{ say: 'next' }]]);
    await session.send('secret goal');
    await session.accept('p1');
    const types = session.log.events.map(e => e.type);
    for (const t of ['session_start', 'user_msg', 'state', 'proposal_created', 'proposal_accepted']) assert(types.includes(t), t);
    assert(session.log.toJSONL().includes('secret goal'));
    assert(!session.log.toJSONL({ redact: true }).includes('secret goal'));
    assertEqual(session.log.events.find(e => e.type === 'proposal_created').policy, 'balanced');
});
