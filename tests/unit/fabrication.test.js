/**
 * Fabrication export (J6): sheet packing, kerf compensation, thickness
 * groups, plain shapes, hinge pieces merged, wedges added, bill of
 * materials, parts larger than the bed, settings, and the SVG format.
 */
import { test, assert, assertEqual, assertApprox } from '../harness.js';
import { SceneState } from '../../src/core/SceneState.js';
import { HistoryManager } from '../../src/commands/HistoryManager.js';
import { CommandCatalog } from '../../src/commands/CommandCatalog.js';
import { ShapeRegistry } from '../../src/models/shapes/ShapeRegistry.js';
import { CodeRunner } from '../../src/programming/CodeRunner.js';
import { buildFabrication } from '../../src/fabrication/FabricationPlan.js';
import { layoutSheets, placePoints } from '../../src/fabrication/SheetLayout.js';
import { renderSheetSVG } from '../../src/fabrication/SvgExporter.js';
import { bounds, signedArea } from '../../src/fabrication/polygon.js';
import { resolveJoints } from '../../src/joints/JointService.js';
import { JOINT_EXAMPLES } from '../../src/examples/jointExamples.js';

const example = (id) => JOINT_EXAMPLES.find(e => e.id === id).code;

function sceneOf(code) {
    ShapeRegistry.resetIdCounters();
    const scene = new SceneState();
    new CodeRunner({ shapeStore: scene.shapeStore, parameterStore: scene.parameterStore, getScene: () => scene }).run(code, { clearExisting: true });
    return scene;
}

const rect = (w, h) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
const overlaps = (a, b) => a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;

// ---- packing -------------------------------------------------------------------

test('layout: every part lands once, on the bed, without overlaps', () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ partId: `p${i}`, materialId: 'm', outer: rect(40 + (i * 37) % 180, 30 + (i * 53) % 120) }));
    const { sheets, oversize } = layoutSheets(items, { bed: { w: 600, h: 400 }, margin: 5, gap: 4 });
    assertEqual(oversize.length, 0);
    assertEqual(sheets.reduce((n, s) => n + s.placements.length, 0), 25);
    for (const sheet of sheets) {
        for (const p of sheet.placements) assert(p.x >= 5 - 1e-9 && p.y >= 5 - 1e-9 && p.x + p.w <= 595 + 1e-9 && p.y + p.h <= 395 + 1e-9, p.partId);
        sheet.placements.forEach((a, i) => sheet.placements.slice(i + 1).forEach(b => assert(!overlaps(a, b), `${a.partId}/${b.partId}`)));
    }
});

test('layout: rotates a part that only fits sideways; reports one that never fits', () => {
    const { sheets, oversize } = layoutSheets([{ partId: 'tall', materialId: 'm', outer: rect(100, 500) }, { partId: 'huge', materialId: 'm', outer: rect(900, 900) }], { bed: { w: 600, h: 400 }, margin: 0, gap: 0 });
    assertEqual(sheets[0].placements[0].rot, 90);
    assertEqual(oversize.map(o => o.partId).join(','), 'huge');
});

test('placePoints maps the rotated bounding box onto its placement', () => {
    const b = bounds(placePoints(rect(100, 20), { rot: 90, x: 10, y: 30, w: 20, h: 100 }, bounds(rect(100, 20))));
    assertApprox(b.minX, 10, 1e-9); assertApprox(b.minY, 30, 1e-9); assertApprox(b.w, 20, 1e-9); assertApprox(b.h, 100, 1e-9);
});

// ---- the plan -------------------------------------------------------------------------

test('box example: five 6 mm parts on 6 mm sheets, outlines grown by the kerf', () => {
    const scene = sceneOf(example('box'));
    const plan = buildFabrication(scene);
    assertEqual(plan.parts.length, 5);
    assert(plan.files.length >= 1 && plan.files.every(f => f.thickness === '6 mm'));
    assertEqual(plan.files.reduce((n, f) => n + f.partIds.length, 0), 5);
    const nominal = bounds(resolveJoints(scene).cuts.get('front').outer);
    assertApprox(bounds(plan.parts.find(p => p.partId === 'front').outer).w, nominal.w + 0.15, 1e-9);
    assertEqual(plan.findings.length, 0);
});

test('different thicknesses go on different sheets', () => {
    const plan = buildFabrication(sceneOf('shape rectangle a { width: 100 height: 80 depth: 6 }\nshape rectangle b { width: 100 height: 80 depth: 9 }'));
    assertEqual(plan.files.map(f => f.thickness).sort().join(','), '6 mm,9 mm');
});

test('plain shapes are cut too: a gear keeps its bore as a hole; lines are skipped', () => {
    const plan = buildFabrication(sceneOf('shape circle disc { radius: 40 }\nshape gear g { pitchDiameter: 60 teeth: 12 }\nshape line l { x1: 0 y1: 0 x2: 50 y2: 0 }'));
    assertEqual(plan.parts.map(p => p.partId).sort().join(','), 'disc,g');
    assertEqual(plan.parts.find(p => p.partId === 'g').holes.length, 1, 'bore');
    assertApprox(bounds(plan.parts.find(p => p.partId === 'disc').outer).w, 80 + 0.15, 0.5);
    assertEqual(plan.skipped.join(','), 'l');
});

test('kerf: slot holes shrink by the kerf; outlines stay positive', () => {
    const scene = sceneOf(example('shelf'));
    const plan = buildFabrication(scene);
    const side = plan.parts.find(p => p.partId === 'side_a');
    const nominalSlot = bounds(resolveJoints(scene).cuts.get('side_a').holes[0]);
    assertApprox(bounds(side.holes[0]).h, nominalSlot.h - 0.15, 1e-9);
    for (const p of plan.parts) assert(signedArea(p.outer) > 0, p.partId);
});

test('wedges are extra pieces on the sheets', () => {
    const plan = buildFabrication(sceneOf(example('shelf')));
    const wedges = plan.parts.filter(p => p.kind === 'extra');
    assertEqual(wedges.length, 4, '2 wedged joints × 2 tabs');
    assert(plan.files.some(f => f.partIds.some(id => /wedge/.test(id))));
});

test('a living hinge pair is cut as one piece', () => {
    const plan = buildFabrication(sceneOf(example('splice_hinge')));
    const ids = plan.parts.map(p => p.partId).sort();
    assert(ids.includes('wrap_a+wrap_b'), ids.join(','));
    assert(!ids.includes('wrap_b') && !ids.includes('wrap_a'));
    const piece = plan.parts.find(p => p.partId === 'wrap_a+wrap_b');
    assertApprox(bounds(piece.outer).w, 200 + 20 * Math.PI / 2 + 200 + 0.15, 1e-6);
    assert(piece.holes.length > 10, 'hinge slits');
});

test('bill of materials adds up the hardware', () => {
    const plan = buildFabrication(sceneOf(example('stool')));
    // 9 mm seat + 3 + 4 (M5 nut) + 3 = 19 mm → M5×20.
    assertEqual(plan.bom.map(l => `${l.qty}× ${l.item}`).join(', '), '2× M5 hex nut, 2× M5×20 bolt');
});

test('a part larger than the bed is reported with the splice suggestion', () => {
    const plan = buildFabrication(sceneOf('shape rectangle top { width: 1000 height: 300 depth: 6 }'));
    assertEqual(plan.oversize.length, 1);
    assertEqual(plan.files.length, 0);
    assert(/1000\.2 × 300\.2 mm with kerf\) does not fit the 600 × 400 mm bed \(590 × 390 mm inside the 5 mm margin\) .*splice/.test(plan.findings[0].message), plan.findings[0].message);
});

test('settings: a bigger bed fits it; changes are undoable', async () => {
    const scene = sceneOf('shape rectangle top { width: 1000 height: 300 depth: 6 }');
    const history = new HistoryManager(scene);
    await history.execute(new CommandCatalog().create('joint.setFabrication', { bed: { w: 1200, h: 800 }, kerf: 0.2 }));
    const plan = buildFabrication(scene);
    assertEqual(plan.oversize.length, 0);
    assert(plan.files[0].svg.includes('width="1200mm" height="800mm"'));
    await history.undo();
    assertEqual(buildFabrication(scene).oversize.length, 1);
});

test('settings: invalid values are rejected', async () => {
    const scene = new SceneState();
    const history = new HistoryManager(scene);
    let msg = '';
    try { await history.execute(new CommandCatalog().create('joint.setFabrication', { kerf: 5 })); } catch (e) { msg = e.message; }
    assert(/Kerf must be between/.test(msg), msg);
});

test('loops that do not close are listed as problems before cutting', () => {
    const plan = buildFabrication(sceneOf(example('mistakes')));
    assertEqual(plan.findings.filter(f => f.code === 'loop_not_closed').length, 2);
    assert(plan.findings.some(f => f.code === 'edge_missing'));
});

// ---- SVG -----------------------------------------------------------------------------------

test('SVG golden: one rectangle, labels off', () => {
    const svg = renderSheetSVG(
        { materialId: 'm', index: 0, placements: [{ partId: 'p 1', rot: 0, x: 5, y: 5, w: 10, h: 4 }] },
        new Map([['p 1', { outer: rect(10, 4), holes: [] }]]), { w: 100, h: 50 }, { labels: false });
    assertEqual(svg, [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">',
        '  <g id="cut" fill="none" stroke="#FF0000" stroke-width="0.01">',
        '    <path data-part="p 1" d="M 5 5 L 15 5 L 15 9 L 5 9 Z"/>',
        '  </g>',
        '</svg>'
    ].join('\n'));
});

test('SVG labels are escaped', () => {
    const svg = renderSheetSVG({ placements: [{ partId: 'a<b', rot: 0, x: 0, y: 0, w: 1, h: 1 }] },
        new Map([['a<b', { outer: rect(1, 1), holes: [] }]]), { w: 10, h: 10 });
    assert(!svg.includes('a<b') && svg.includes('a&lt;b'));
});

test('every example except "mistakes" fits the default bed and is ready to cut', () => {
    for (const e of JOINT_EXAMPLES.filter(x => x.id !== 'mistakes')) {
        const plan = buildFabrication(sceneOf(e.code));
        assertEqual(plan.findings.length, 0, `${e.id}: ${plan.findings.map(f => f.message).join('; ')}`);
        assert(plan.files.length > 0, `${e.id} has sheets`);
    }
});
