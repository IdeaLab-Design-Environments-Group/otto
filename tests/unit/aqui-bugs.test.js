/**
 * Regression tests for AQUI interpreter bugs fixed ahead of the assembly
 * (build-up) work: loop shape naming, function calls inside expressions,
 * top-level statements the parser accepts, and loop iterator leakage.
 */
import { test, assert, assertEqual } from '../harness.js';
import { ShapeRegistry } from '../../src/models/shapes/ShapeRegistry.js';
import { SceneState } from '../../src/core/SceneState.js';
import { CodeRunner } from '../../src/programming/CodeRunner.js';
import { Lexer } from '../../src/programming/Lexer.js';
import { Parser } from '../../src/programming/Parser.js';
import { Interpreter } from '../../src/programming/Interpreter.js';

function interpret(code) {
    const ast = new Parser(new Lexer(code)).parse();
    return new Interpreter().interpret(ast);
}

function runScene(code) {
    ShapeRegistry.resetIdCounters();
    const scene = new SceneState();
    const runner = new CodeRunner({ shapeStore: scene.shapeStore, parameterStore: scene.parameterStore });
    const result = runner.run(code, { clearExisting: true });
    return { scene, result };
}

test('AQUI loop: shapes are suffixed once with the iterator value', () => {
    const out = interpret('for i from 0 to 2 { shape circle c { radius: 5 } }');
    const names = [...out.shapes.keys()].sort();
    assertEqual(names.join(','), 'c_0,c_1,c_2');
});

test('AQUI nested loops: names chain outer and inner counters uniquely', () => {
    const out = interpret('for i from 0 to 1 { for j from 0 to 1 { shape circle c { radius: 5 } } }');
    const names = [...out.shapes.keys()].sort();
    assertEqual(names.join(','), 'c_0_0,c_0_1,c_1_0,c_1_1');
});

test('AQUI: user function call inside an expression evaluates', () => {
    const out = interpret('def twice(x) { return x * 2 }\nshape circle c { radius: twice(5) }');
    assertEqual(out.shapes.get('c').params.radius, 10);
});

test('AQUI: loop iterator does not leak into the parameter store', () => {
    const { scene, result } = runScene('param n 2\nfor i from 0 to n { shape circle c { radius: 3 } }');
    assert(result.success, result.error);
    const names = scene.parameterStore.getAll().map(p => p.name);
    assertEqual(names.join(','), 'n');
    assertEqual(scene.shapeStore.getAll().length, 3);
});

test('AQUI: top-level add/rotate give a clear error instead of a crash', () => {
    let message = '';
    try {
        interpret('shape circle c { radius: 5 }\nadd c');
    } catch (e) {
        message = e.message;
    }
    assert(!/Unknown node type/.test(message), `got internal error: ${message}`);
    assert(/only valid inside/i.test(message), `expected a scoped-usage error, got: ${message}`);
});
