/**
 * The J4 joint types: tab and slot (+ wedge), cross lap, splice (dovetail /
 * knob), bolt (T-slot) and living hinge. Rigid joints are proven by 3D
 * occupancy (no point inside two parts, no unintended gaps); hardware and
 * the hinge are checked analytically.
 */
import { test, assert, assertEqual, assertApprox } from '../harness.js';
import { SceneState } from '../../src/core/SceneState.js';
import { ShapeRegistry } from '../../src/models/shapes/ShapeRegistry.js';
import { CodeRunner } from '../../src/programming/CodeRunner.js';
import { resolveJoints } from '../../src/joints/JointService.js';
import { worldBounds } from '../../src/joints/JointSolver.js';
import { sampleJoint } from '../../src/fabrication/occupancy.js';
import { signedArea, bounds } from '../../src/fabrication/polygon.js';
import { mergeHingePiece } from '../../src/fabrication/mergePieces.js';
import { hingeLayout } from '../../src/joints/types/hinge.js';
import { BOLTS } from '../../src/joints/types/bolt.js';

function build(code, { allowErrors = false } = {}) {
    ShapeRegistry.resetIdCounters();
    const scene = new SceneState();
    const runner = new CodeRunner({ shapeStore: scene.shapeStore, parameterStore: scene.parameterStore, getScene: () => scene });
    const result = runner.run(code, { clearExisting: true });
    assert(result.success, result.error);
    if (!allowErrors) assertEqual(result.jointErrors.length, 0, result.jointErrors.join('; '));
    return { scene, result, ...resolveJoints(scene) };
}

function assertSound(r, { allowEmpty = 0 } = {}) {
    assertEqual(r.solved.inconsistent.length, 0, JSON.stringify(r.solved.inconsistent));
    for (const joint of r.resolved.joints) {
        const s = sampleJoint(joint, r.resolved, r.solved.poses, r.cuts);
        if (s.samples === 0) continue;
        assertEqual(s.double, 0, `${joint.id}: ${s.double}/${s.samples} points inside two parts`);
        assert(s.empty / s.samples <= allowEmpty + 1e-12, `${joint.id}: ${s.empty}/${s.samples} points in no part`);
    }
}

const SHELF = (lock = '') => `
shape rectangle sl { width: 280 height: 600 depth: 6 }
shape rectangle sr { width: 280 height: 600 depth: 6 }
shape rectangle b1 { width: 588 height: 280 depth: 6 }
shape rectangle b2 { width: 588 height: 280 depth: 6 }
join tab_slot b1.left sl.top.inset(150) { tabs: 2 ${lock} }
join tab_slot b1.right sr.top.inset(150) { tabs: 2 ${lock} }
join tab_slot b2.left sl.top.inset(450) { tabs: 2 ${lock} }
join tab_slot b2.right sr.top.inset(450) { tabs: 2 ${lock} }
ground sl`;

// ---- tab and slot ---------------------------------------------------------------

test('tab_slot: either port order is accepted; the face side becomes A', () => {
    const r = build(SHELF());
    for (const j of r.resolved.joints) assert(/^s[lr]$/.test(j.a.partId), `${j.id}: A is the side panel`);
});

test('tab_slot: a two-shelf unit closes, and tabs fill their slots exactly', () => {
    const r = build(SHELF());
    assertSound(r);
    assertEqual(r.cuts.get('sl').holes.length, 4, '2 shelves × 2 tabs');
    // The two sides are parallel sheets; along their thin axis the inner faces are one board apart.
    const sl = worldBounds(['sl'], r.solved.poses, r.resolved.partsById);
    const sr = worldBounds(['sr'], r.solved.poses, r.resolved.partsById);
    const axis = ['X', 'Y', 'Z'].find(a => Math.abs(sl[`max${a}`] - sl[`min${a}`] - 6) < 1e-6);
    assert(axis, 'side is a 6 mm sheet along one axis');
    const gap = Math.max(sr[`min${axis}`] - sl[`max${axis}`], sl[`min${axis}`] - sr[`max${axis}`]);
    assertApprox(gap, 588, 1e-6, 'inner width between the sides');
});

test('tab_slot lock: wedge — longer tabs, a wedge hole each, wedge pieces and BOM', () => {
    const plain = build(SHELF());
    const wedged = build(SHELF('lock: wedge'));
    // The wedge hole starts 0.5 mm inside the face panel so the wedge pulls
    // the joint tight: a small designed void in the slot region.
    assertSound(wedged, { allowEmpty: 0.05 });
    const h = (r, id) => bounds(r.cuts.get(id).outer).w;
    assert(h(wedged, 'b1') > h(plain, 'b1') + 6, 'tabs reach past the far face');
    assertEqual(wedged.cuts.get('b1').holes.length, 4, 'a wedge hole in each of b1’s 4 tabs');
    assertEqual(wedged.extras.length, 8, 'one wedge per tab');
    assertEqual(wedged.bom.reduce((n, l) => n + l.qty, 0), 8);
});

test('tab_slot: a slot too close to the edge is a warning; outside the panel an error', () => {
    const near = build(SHELF().replace('sl.top.inset(150)', 'sl.top.inset(5)'));
    assert(near.findings.some(f => f.code === 'slot_near_edge'));
    const out = build(SHELF().replace('sl.top.inset(150)', 'sl.top.inset(599)'), { allowErrors: true });
    assert(out.findings.some(f => f.code === 'slot_outside'));
});

// ---- cross lap -----------------------------------------------------------------

test('cross_lap: an X frame — slots meet halfway, panels perpendicular, no overlap', () => {
    const r = build(`shape rectangle a { width: 400 height: 420 depth: 6 }
shape rectangle b { width: 400 height: 420 depth: 6 }
join cross_lap a.top.at(200) b.bottom.at(200)
ground a`);
    assertSound(r);
    const bb = worldBounds(['b'], r.solved.poses, r.resolved.partsById);
    assertApprox(bb.maxX - bb.minX, 6, 1e-6, 'b is edge-on in x');
    assertApprox((bb.minX + bb.maxX) / 2, 200, 1e-6, 'centred on the slot');
    assertApprox(bb.maxY - bb.minY, 420, 1e-6, 'b spans a’s height');
    const slotBottom = Math.max(...r.cuts.get('a').outer.filter(p => Math.abs(p.x - 200) < 4).map(p => p.y));
    assertApprox(slotBottom, 210, 1e-6, 'a is slotted halfway down');
});

test('cross_lap: a custom depth splits the height between the two slots', () => {
    const r = build(`shape rectangle a { width: 400 height: 420 depth: 6 }
shape rectangle b { width: 400 height: 420 depth: 6 }
join cross_lap a.top.at(200) b.bottom.at(200) { depth: 300 }
ground a`);
    assertSound(r);
    const j = r.resolved.joints[0];
    assertApprox(r.resolved.partsById.get('a').ports[j.a.port].length, 300, 1e-9);
    assertApprox(r.resolved.partsById.get('b').ports[j.b.port].length, 120, 1e-9);
});

// ---- splice ------------------------------------------------------------------------

for (const style of ['dovetail', 'knob']) {
    test(`splice (${style}): coplanar teeth lock with no overlap and no gaps`, () => {
        const r = build(`shape rectangle p1 { width: 400 height: 300 depth: 6 }
shape rectangle p2 { width: 400 height: 300 depth: 6 }
join splice p1.bottom p2.top { style: ${style} count: 3 }
ground p1`);
        assertSound(r);
        const b2 = worldBounds(['p2'], r.solved.poses, r.resolved.partsById);
        assertApprox(b2.maxZ - b2.minZ, 6, 1e-6, 'p2 lies in the same plane');
        for (const id of ['p1', 'p2']) assert(signedArea(r.cuts.get(id).outer) > 0, `${id} simple, positive`);
    });
}

test('splice: thin necks warn', () => {
    const r = build(`shape rectangle p1 { width: 400 height: 300 depth: 12 }
shape rectangle p2 { width: 400 height: 300 depth: 12 }
join splice p1.bottom p2.top { count: 12 }`);
    assert(r.findings.some(f => f.code === 'splice_neck_thin'));
});

// ---- bolt ------------------------------------------------------------------------------

const BOLTED = (t, size = 'M4') => `
shape rectangle seat { width: 400 height: 300 depth: ${t} }
shape rectangle leg { width: 300 height: 400 depth: ${t} }
join bolt leg.top seat.top.inset(150) { size: ${size} count: 2 }
ground seat`;

test('bolt: holes in the face, T-slots in the edge, nothing interpenetrates', () => {
    const r = build(BOLTED(9));
    assertSound(r, { allowEmpty: 0.2 });
    assertEqual(r.cuts.get('seat').holes.length, 2);
    // Each T-slot adds 12 profile points to the leg's top edge.
    assertEqual(r.cuts.get('leg').outer.length, 4 + 2 * 12);
    const nut = BOLTS.M4;
    const xs = r.cuts.get('leg').outer.filter(p => p.y > 0.1).map(p => p.x);
    assert(xs.length > 0, 'slots cut into the leg');
    const widths = new Set(xs.map(x => Math.round(x * 100) / 100));
    assert([...widths].some(x => [...widths].some(y => Math.abs(Math.abs(x - y) - (nut.af + 0.3)) < 1e-6)), 'nut pocket width = AF + clearance');
});

test('bolt: default length is the shortest standard bolt reaching past the nut; BOM lists bolts and nuts', () => {
    const r = build(BOLTED(9));
    const items = r.bom.map(l => `${l.qty}× ${l.item}`).sort().join(', ');
    // Needs 9 (seat) + 3 + 3.2 (nut) + 3 = 18.2 mm → M4×20.
    assertEqual(items, '2× M4 hex nut, 2× M4×20 bolt');
});

test('bolt: a nut wider than thin sheet warns; a too-short bolt is an error', () => {
    assert(build(BOLTED(3)).findings.some(f => f.code === 'nut_wider_than_sheet'));
    const short = build(BOLTED(9).replace('count: 2', 'count: 2 length: 10'), { allowErrors: true });
    assert(short.findings.some(f => f.code === 'bolt_too_short'));
});

// ---- living hinge ----------------------------------------------------------------------

const HINGE = (extra = '') => `
shape rectangle a { width: 300 height: 200 depth: 3 }
shape rectangle b { width: 250 height: 200 depth: 3 }
join hinge a.right b.left { fold: 90 radius: 20 ${extra} }
ground a`;

test('hinge: A grows a strip as long as the bend, filled with slits inside it', () => {
    const r = build(HINGE());
    const strip = 20 * Math.PI / 2;
    assertApprox(bounds(r.cuts.get('a').outer).w, 300 + strip, 1e-6);
    const holes = r.cuts.get('a').holes;
    assert(holes.length > 10, `${holes.length} slits`);
    for (const h of holes) {
        const hb = bounds(h);
        assert(hb.minX > 300 - 1e-9 && hb.maxX < 300 + strip + 1e-9, 'slit inside the strip');
        assert(hb.minY >= 3 - 1e-9 && hb.maxY <= 197 + 1e-9, 'bridges kept at both ends');
    }
});

test('hinge: 3D places B at the end of a 90° arc of the bend radius', () => {
    const r = build(HINGE());
    const bb = worldBounds(['b'], r.solved.poses, r.resolved.partsById);
    // A's right edge is x = 300; the arc ends 20 mm further out and 20 mm up,
    // then B rises with its 3 mm thickness on the side facing A.
    assertApprox(bb.maxX, 320, 1e-6);
    assertApprox(bb.minX, 317, 1e-6);
    assertApprox(bb.minZ, 20, 1e-6);
    assertApprox(bb.maxZ, 20 + 250, 1e-6);
});

test('hinge: merging gives one simple piece with both panels and the strip', () => {
    const r = build(HINGE());
    const j = r.resolved.joints[0];
    const partA = r.resolved.partsById.get('a'), partB = r.resolved.partsById.get('b');
    const h = hingeLayout(j.params, 200, 200, 3);
    const merged = mergeHingePiece({ cutA: r.cuts.get('a'), cutB: r.cuts.get('b'), portA: partA.ports[j.a.port], portB: partB.ports[j.b.port], s: h.s, strip: h.strip });
    assert(!merged.error, merged.error);
    assertApprox(signedArea(merged.outer), signedArea(r.cuts.get('a').outer) + signedArea(r.cuts.get('b').outer), 1e-6);
    assertApprox(bounds(merged.outer).w, 300 + h.strip + 250, 1e-6);
    assertEqual(r.merges.length, 1);
});

test('hinge: edges of different length are an error', () => {
    const r = build(HINGE().replace('height: 200 depth: 3 }\njoin', 'height: 180 depth: 3 }\njoin'), { allowErrors: true });
    assert(r.findings.some(f => f.code === 'hinge_unequal'));
});

// ---- port kinds ----------------------------------------------------------------------------

test('wrong port kinds explain what each joint needs', () => {
    const r = build(`shape rectangle a { width: 100 height: 100 }
shape rectangle b { width: 100 height: 100 }
join tab_slot a.top b.top`, { allowErrors: true });
    const msg = r.findings.find(f => f.code === 'port_kind')?.message || '';
    assert(/tab_slot joins a face line \(edge\.inset\(d\) or line\(\.\.\.\)\) \+ an edge/.test(msg), msg);
});
