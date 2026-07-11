/**
 * AI Fabrication Coach tests: the pure, network-free halves of the review
 * module — scene summarisation and Gemini-response parsing.
 */
import { test, assert, assertEqual, assertDeepEqual } from '../harness.js';
import { ShapeRegistry } from '../../src/models/shapes/ShapeRegistry.js';
import { Parameter } from '../../src/models/Parameter.js';
import { ParameterBinding, ExpressionBinding } from '../../src/models/Binding.js';
import { buildSceneSummary, sceneSummaryToText } from '../../src/review/SceneSummary.js';
import { parseFindings, SEVERITIES } from '../../src/review/FabricationCoach.js';

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

// ---- parseFindings --------------------------------------------------------

test('parseFindings reads the {findings:[...]} envelope', () => {
    const out = parseFindings({ findings: [
        { severity: 'warning', title: 'Thin tab', detail: 'x', suggestion: 'y' }
    ] });
    assertEqual(out.length, 1);
    assertEqual(out[0].severity, 'warning');
    assertEqual(out[0].suggestion, 'y');
});

test('parseFindings tolerates a bare array', () => {
    const out = parseFindings([{ title: 'Note', detail: 'ok' }]);
    assertEqual(out.length, 1);
    assertEqual(out[0].severity, 'info'); // default when omitted
});

test('parseFindings drops empty and non-object entries', () => {
    const out = parseFindings({ findings: [
        null, 'garbage', {}, { title: '', detail: '' }, { title: 'Keep', detail: 'me' }
    ] });
    assertEqual(out.length, 1);
    assertEqual(out[0].title, 'Keep');
});

test('parseFindings coerces an unknown severity to info', () => {
    const out = parseFindings({ findings: [{ severity: 'nonsense', title: 't', detail: 'd' }] });
    assertEqual(out[0].severity, 'info');
});

test('parseFindings sorts most-urgent first', () => {
    const out = parseFindings({ findings: [
        { severity: 'praise', title: 'a', detail: 'd' },
        { severity: 'error', title: 'b', detail: 'd' },
        { severity: 'info', title: 'c', detail: 'd' }
    ] });
    assertDeepEqual(out.map(f => f.severity), ['error', 'info', 'praise']);
    assertEqual(SEVERITIES[0], 'error');
});

test('parseFindings returns [] for junk input', () => {
    assertDeepEqual(parseFindings(null), []);
    assertDeepEqual(parseFindings('nope'), []);
    assertDeepEqual(parseFindings({}), []);
});
