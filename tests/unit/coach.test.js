/**
 * Fabrication check tests: scene summarisation and the laser-cutting rules,
 * plus the coach's review (rules only, sorted by severity).
 */
import { test, assert, assertEqual, assertDeepEqual } from '../harness.js';
import { ShapeRegistry } from '../../src/models/shapes/ShapeRegistry.js';
import { Parameter } from '../../src/models/Parameter.js';
import { ParameterBinding, ExpressionBinding } from '../../src/models/Binding.js';
import { buildSceneSummary, sceneSummaryToText } from '../../src/review/SceneSummary.js';
import { SEVERITIES } from '../../src/review/FabricationCoach.js';
import { runFabricationRules, DEFAULT_LASER } from '../../src/review/FabricationRules.js';

/** Minimal summary builder for precise rule-threshold tests. */
function summaryOf(shapes, extent = null) {
    return { unit: 'mm', parameters: [], shapes, extent, code: null,
        counts: { shapes: shapes.length, parameters: 0 } };
}
const titles = (list) => list.map(f => f.title);

// ---- buildSceneSummary ----------------------------------------------------

test('empty scene summarises to zero counts', () => {
    const summary = buildSceneSummary({ shapes: [], parameters: [] });
    assertEqual(summary.counts.shapes, 0);
    assertEqual(summary.counts.parameters, 0);
    assertEqual(summary.unit, 'mm');
    assertEqual(summary.code, null);
});

test('parameters summarise with tidy value and finite range only', () => {
    const p = new Parameter('p1', 'radius', 30.123, 0, Infinity, 0);
    const summary = buildSceneSummary({ shapes: [], parameters: [p] });
    assertDeepEqual(summary.parameters[0], { name: 'radius', value: 30.12, min: 0, max: null });
});

test('shape properties are listed with rounded values', () => {
    const circle = ShapeRegistry.create('circle', { x: 0, y: 0 }, { radius: 20 });
    const summary = buildSceneSummary({ shapes: [circle], parameters: [] });
    const s = summary.shapes[0];
    assertEqual(s.type, 'circle');
    assertEqual(s.props.radius.value, 20);
    // depth is a common bindable property defaulting to 3mm.
    assertEqual(s.props.depth.value, 3);
    assert(!('boundTo' in s.props.radius), 'unbound property has no boundTo');
});

test('summary captures per-shape bounds, depth, and overall extent', () => {
    const circle = ShapeRegistry.create('circle', { x: 0, y: 0 }, { radius: 20 });
    const summary = buildSceneSummary({ shapes: [circle], parameters: [] });
    assertEqual(summary.shapes[0].bounds.w, 40); // radius 20 -> 40mm across
    assertEqual(summary.shapes[0].bounds.h, 40);
    assertEqual(summary.shapes[0].depth, 3);
    assertEqual(summary.extent.w, 40);
    assertEqual(summary.extent.h, 40);
});

test('a parameter binding is annotated by the parameter name', () => {
    const param = new Parameter('p1', 'r', 25, 0, Infinity, 0);
    const circle = ShapeRegistry.create('circle', { x: 0, y: 0 }, { radius: 25 });
    circle.setBinding('radius', new ParameterBinding('p1'));
    const summary = buildSceneSummary({ shapes: [circle], parameters: [param] });
    assertEqual(summary.shapes[0].props.radius.boundTo, '= r');
});

test('an expression binding is annotated by its expression', () => {
    const circle = ShapeRegistry.create('circle', { x: 0, y: 0 }, { radius: 10 });
    circle.setBinding('radius', new ExpressionBinding('w * 2'));
    const summary = buildSceneSummary({ shapes: [circle], parameters: [] });
    assertEqual(summary.shapes[0].props.radius.boundTo, '= w * 2');
});

test('sceneSummaryToText includes params, shapes, and AQUI code', () => {
    const param = new Parameter('p1', 'r', 25, 0, 100, 0);
    const circle = ShapeRegistry.create('circle', { x: 0, y: 0 }, { radius: 25 });
    circle.setBinding('radius', new ParameterBinding('p1'));
    const summary = buildSceneSummary({
        shapes: [circle], parameters: [param], code: 'shape circle c1 { radius: 25 }'
    });
    const text = sceneSummaryToText(summary);
    assert(text.includes('Units: mm'), 'declares units');
    assert(text.includes('r = 25 [0..100]'), 'shows parameter with range');
    assert(text.includes('radius=25 (= r)'), 'shows bound property');
    assert(text.includes('AQUI source:'), 'includes code section');
});

// ---- runFabricationRules (laser-cutting linter) ---------------------------

test('no shapes yields no fabrication findings', () => {
    assertDeepEqual(runFabricationRules(summaryOf([])), []);
});

test('a normal small part gets only the standing kerf reminder', () => {
    const s = summaryOf(
        [{ id: 'r1', type: 'rectangle', props: {}, bounds: { w: 80, h: 40 }, depth: 3 }],
        { w: 80, h: 40 }
    );
    const out = runFabricationRules(s);
    assertDeepEqual(titles(out), ['Remember kerf compensation']);
});

test('a layout larger than the bed warns; far larger errors', () => {
    const over = runFabricationRules(summaryOf(
        [{ id: 'p', type: 'rectangle', props: {}, bounds: { w: 700, h: 500 }, depth: 3 }],
        { w: 700, h: 500 }
    ));
    const bedFit = over.find(f => f.title === 'Design may not fit the laser bed');
    assert(bedFit && bedFit.severity === 'warning', 'over-bed -> warning');

    const wayOver = runFabricationRules(summaryOf(
        [{ id: 'p', type: 'rectangle', props: {}, bounds: { w: 1300, h: 900 }, depth: 3 }],
        { w: 1300, h: 900 }
    ));
    const bedFit2 = wayOver.find(f => f.title === 'Design may not fit the laser bed');
    assertEqual(bedFit2.severity, 'error');
});

test('a design that fits when rotated onto the bed is not flagged', () => {
    // 380 x 590: too tall upright (590 > 400) but fits rotated (590 <= 600).
    const out = runFabricationRules(summaryOf(
        [{ id: 'p', type: 'rectangle', props: {}, bounds: { w: 380, h: 590 }, depth: 3 }],
        { w: 380, h: 590 }
    ));
    assert(!titles(out).includes('Design may not fit the laser bed'), 'rotated fit ok');
});

test('parts smaller than the minimum feature size are flagged', () => {
    const out = runFabricationRules(summaryOf(
        [{ id: 'tiny', type: 'circle', props: {}, bounds: { w: 2, h: 2 }, depth: 3 }],
        { w: 2, h: 2 }
    ));
    assert(out.some(f => f.title.includes('very small')), 'tiny part warned');
});

test('too-thin and too-thick material are both reported', () => {
    const thin = runFabricationRules(summaryOf(
        [{ id: 'a', type: 'rectangle', props: {}, bounds: { w: 50, h: 50 }, depth: 0.5 }],
        { w: 50, h: 50 }
    ));
    assert(thin.some(f => f.title === 'Material looks too thin'), 'thin flagged');

    const thick = runFabricationRules(summaryOf(
        [{ id: 'b', type: 'rectangle', props: {}, bounds: { w: 50, h: 50 }, depth: 12 }],
        { w: 50, h: 50 }
    ));
    assert(thick.some(f => f.title === 'Thick material for a laser'), 'thick flagged');
});

test('mixed material thicknesses produce a joint-consistency note', () => {
    const out = runFabricationRules(summaryOf([
        { id: 'a', type: 'rectangle', props: {}, bounds: { w: 50, h: 50 }, depth: 3 },
        { id: 'b', type: 'rectangle', props: {}, bounds: { w: 50, h: 50 }, depth: 6 }
    ], { w: 110, h: 50 }));
    assert(out.some(f => f.title === 'Pieces use different material thicknesses'), 'mixed depth noted');
});

test('rule thresholds are overridable (custom bed size)', () => {
    const shapes = [{ id: 'p', type: 'rectangle', props: {}, bounds: { w: 500, h: 350 }, depth: 3 }];
    const ext = { w: 500, h: 350 };
    // Fits the default 600x400 bed...
    assert(!titles(runFabricationRules(summaryOf(shapes, ext)))
        .includes('Design may not fit the laser bed'), 'fits default bed');
    // ...but not a small 300x200 bed.
    assert(titles(runFabricationRules(summaryOf(shapes, ext), { bedWidth: 300, bedHeight: 200 }))
        .includes('Design may not fit the laser bed'), 'over small bed');
    assertEqual(DEFAULT_LASER.bedWidth, 600);
});

test('the coach reviews with rules only, most urgent first', async () => {
    const { FabricationCoach } = await import('../../src/review/FabricationCoach.js');
    const coach = new FabricationCoach({ laser: { bedWidth: 100, bedHeight: 100 } });
    const shape = ShapeRegistry.create('rectangle', { x: 0, y: 0 }, { width: 400, height: 300 });
    const { findings } = await coach.review({ shapes: [shape], parameters: [], code: '' });
    assert(findings.length > 0);
    const order = findings.map(f => SEVERITIES.indexOf(f.severity));
    assertDeepEqual(order, [...order].sort((x, y) => x - y));
    const empty = await coach.review({ shapes: [], parameters: [], code: '' });
    assertEqual(empty.findings[0].title, 'Nothing to review yet');
});
