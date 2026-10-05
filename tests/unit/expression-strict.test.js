/**
 * ExpressionParser additions used by the block catalog: identifier
 * collection, strict evaluation (missing names throw instead of silently
 * evaluating to 0), and integer rounding functions.
 */
import { test, assert, assertEqual, assertApprox } from '../harness.js';
import { ExpressionParser } from '../../src/models/ExpressionParser.js';

const parser = new ExpressionParser();

test('collectIdentifiers returns every referenced name, not function names', () => {
    const ast = parser.parse('max(width - 2*t, inner) / (shelves + 1)');
    const names = [...parser.collectIdentifiers(ast)].sort();
    assertEqual(names.join(','), 'inner,shelves,t,width');
});

test('collectIdentifiers on a literal is empty', () => {
    assertEqual(parser.collectIdentifiers(parser.parse('42')).size, 0);
});

test('collectIdentifiers sees through unary minus', () => {
    assertEqual([...parser.collectIdentifiers(parser.parse('-depth'))].join(','), 'depth');
});

test('strict evaluate throws on a missing identifier, naming it', () => {
    const ast = parser.parse('width - 2*t');
    let message = '';
    try {
        parser.evaluate(ast, { width: 100 }, { strict: true });
    } catch (e) {
        message = e.message;
    }
    assert(/'t'/.test(message), `expected error naming 't', got: ${message}`);
});

test('strict evaluate succeeds when all names are present', () => {
    const ast = parser.parse('width - 2*t');
    assertApprox(parser.evaluate(ast, { width: 100, t: 6 }, { strict: true }), 88, 1e-9);
});

test('non-strict evaluate keeps the legacy missing-name fallback of 0', () => {
    const ast = parser.parse('a + 1');
    const original = console.warn;
    console.warn = () => {};
    try {
        assertEqual(parser.evaluate(ast, {}), 1);
    } finally {
        console.warn = original;
    }
});

test('floor/ceil/round are supported', () => {
    assertEqual(parser.evaluate(parser.parse('floor(7.9)')), 7);
    assertEqual(parser.evaluate(parser.parse('ceil(7.1)')), 8);
    assertEqual(parser.evaluate(parser.parse('round(7.5)')), 8);
    assert(parser.supportedFunctions.includes('floor'));
});
