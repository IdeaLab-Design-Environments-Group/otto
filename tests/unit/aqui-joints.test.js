/**
 * `join` / `ground` in AQUI: parsing (incl. keyword edge names), running
 * into the scene's JointStore, parameter binding, loop name resolution,
 * errors, and the code → scene → code round trip.
 */
import { test, assert, assertEqual } from '../harness.js';
import { SceneState } from '../../src/core/SceneState.js';
import { ShapeRegistry } from '../../src/models/shapes/ShapeRegistry.js';
import { CodeRunner } from '../../src/programming/CodeRunner.js';
import { Lexer } from '../../src/programming/Lexer.js';
import { Parser } from '../../src/programming/Parser.js';
import { emitJoints } from '../../src/joints/jointCode.js';
import { resolveJoints } from '../../src/joints/JointService.js';

function runCode(code, scene = new SceneState()) {
    ShapeRegistry.resetIdCounters();
    const runner = new CodeRunner({ shapeStore: scene.shapeStore, parameterStore: scene.parameterStore, getScene: () => scene });
    const result = runner.run(code, { clearExisting: true });
    return { scene, result };
}

const BOX = `param n 5
shape rectangle base { width: 400 height: 300 depth: 6 }
shape rectangle wall { width: 400 height: 200 depth: 6 }
join finger base.top wall.bottom { count: n * 2 + 1 fit: loose }
ground base`;

test('parse: join with keyword edge names and params; ground', () => {
    const ast = new Parser(new Lexer('join finger a.left b.right { count: 5, fit: snug }\nground a')).parse();
    assertEqual(ast[0].type, 'join');
    assertEqual(`${ast[0].a.shape}.${ast[0].a.edge} ${ast[0].b.shape}.${ast[0].b.edge}`, 'a.left b.right');
    assertEqual(Object.keys(ast[0].params).join(','), 'count,fit');
    assertEqual(ast[1].type, 'ground');
});

test('join and ground stay usable as ordinary names', () => {
    const ast = new Parser(new Lexer('param join 3\nparam ground 4\njoin(1)')).parse();
    assertEqual(ast.map(n => n.type).join(','), 'param,param,function_call');
});

test('run: joints land in the JointStore; params stay bound to parameters', () => {
    const { scene, result } = runCode(BOX);
    assert(result.success, result.error);
    assertEqual(result.jointsCreated, 1);
    assertEqual(result.jointErrors.length, 0);
    const j = scene.jointStore.get('j1');
    assertEqual(`${j.a.shape}.${j.a.edge}`, 'base.top');
    assertEqual(j.params.count, 'n * 2 + 1');
    assertEqual(j.params.fit, 'loose');
    assertEqual(scene.jointStore.ground, 'base');
    const { resolved } = resolveJoints(scene);
    assertEqual(resolved.joints[0].params.count, 11);
    scene.parameterStore.setValue(scene.parameterStore.getByName('n').id, 3);
    assertEqual(resolveJoints(scene).resolved.joints[0].params.count, 7, 'follows the parameter');
});

test('run: a bad joint still runs the code and reports why', () => {
    const { scene, result } = runCode('shape rectangle a { width: 100 height: 50 }\nshape rectangle b { width: 100 height: 50 }\njoin finger a.middle b.top');
    assert(result.success);
    assertEqual(scene.jointStore.getAll().length, 1);
    assert(/a has no straight edge 'middle'/.test(result.jointErrors[0]), result.jointErrors[0]);
});

test('run: re-running code replaces the joints (code is the scene)', () => {
    const scene = new SceneState();
    runCode(BOX, scene);
    runCode('shape rectangle base { width: 400 height: 300 }', scene);
    assertEqual(scene.jointStore.getAll().length, 0);
    assertEqual(scene.jointStore.ground, null);
});

test('inside a loop a joint refers to the shapes of the same iteration', () => {
    const { scene, result } = runCode(`shape rectangle spine { width: 600 height: 100 }
for i from 0 to 2 {
    shape rectangle rib { width: 100 height: 80 }
    join finger rib.bottom spine.top { count: 3 }
}`);
    assert(result.success, result.error);
    const refs = scene.jointStore.getAll().map(j => j.a.shape).join(',');
    assertEqual(refs, 'rib_0,rib_1,rib_2');
    assertEqual(scene.jointStore.get('j1').params.count, 3, 'loop params are evaluated');
});

test('round trip: code → scene → code → scene gives the same joints', () => {
    const first = runCode(BOX).scene;
    const nameOf = (id) => id;
    const lines = emitJoints(first.jointStore, nameOf);
    assertEqual(lines.join('\n'), 'join finger base.top wall.bottom { count: n * 2 + 1 fit: loose }\nground base');
    const code = `param n 5
shape rectangle base { width: 400 height: 300 depth: 6 }
shape rectangle wall { width: 400 height: 200 depth: 6 }
${lines.join('\n')}`;
    const second = runCode(code).scene;
    assertEqual(JSON.stringify(second.jointStore.toJSON()), JSON.stringify(first.jointStore.toJSON()));
});

test('emit: a joint without params has no braces; no joints emits nothing', () => {
    const scene = new SceneState();
    scene.jointStore.fromJSON({ joints: [{ id: 'j1', type: 'finger', a: { shape: 'a', edge: 'top' }, b: { shape: 'b', edge: 'left' }, params: {} }] });
    assertEqual(emitJoints(scene.jointStore, id => id).join('\n'), 'join finger a.top b.left');
    assertEqual(emitJoints(new SceneState().jointStore, id => id).length, 0);
});

// ---- Blockly builders (pure) ------------------------------------------------

import { jointBlockJson, jointBlockCode, jointsToolboxXml, groundBlockJson, UNSET } from '../../src/joints/jointBlocks.js';
import { jointTypes } from '../../src/joints/JointRegistry.js';

test('one block per joint type, with an input or dropdown for every parameter', () => {
    for (const type of jointTypes.list()) {
        const json = jointBlockJson(type);
        assertEqual(json.type, `aqui_join_${type.id}`);
        const inputs = Object.keys(json).filter(k => /^args\d+$/.test(k) && k !== 'args0').map(k => json[k][0].name).sort();
        assertEqual(inputs.join(','), Object.keys(type.params).map(n => `P_${n}`).sort().join(','));
        const fit = Object.values(json).find(v => Array.isArray(v) && v[0]?.name === 'P_fit');
        if (fit) assertEqual(fit[0].options[0][1], UNSET, 'first option keeps the default');
    }
    assertEqual(groundBlockJson().type, 'aqui_ground');
});

test('block code matches the language and skips unset parameters', () => {
    const code = jointBlockCode({ type: 'finger', aShape: 'base', aEdge: 'top', bShape: 'wall', bEdge: 'bottom', params: { count: 'n * 2 + 1', fit: 'loose', side: UNSET, align: '' } });
    assertEqual(code, 'join finger base.top wall.bottom { count: n * 2 + 1 fit: loose }\n');
    const ast = new Parser(new Lexer(code)).parse();
    assertEqual(ast[0].type, 'join');
});

test('toolbox category lists every joint block and ground', () => {
    const xml = jointsToolboxXml();
    for (const type of jointTypes.list()) assert(xml.includes(`aqui_join_${type.id}`));
    assert(xml.includes('aqui_ground') && xml.includes('name="Joints"'));
});

// ---- port references: .inset(d), .at(d), .line(...) ---------------------------

import { exprSourceText } from '../../src/joints/jointBlocks.js';

test('parse: inset, at and line port references', () => {
    const ast = new Parser(new Lexer('join tab_slot shelf.left wall.left.inset(120)\njoin cross_lap a.top.at(w / 2) b.bottom.at(50)\njoin tab_slot s.bottom p.line(0, 10, 100, 10)')).parse();
    assertEqual(ast[0].b.edge, 'left');
    assertEqual(ast[0].b.inset.value, 120);
    assertEqual(exprSourceText(ast[1].a.at), '(w / 2)');
    assertEqual(ast[2].b.line.length, 4);
});

test('parse: a wrong suffix explains the options', () => {
    let msg = '';
    try { new Parser(new Lexer('join finger a.top.middle(3) b.top')).parse(); } catch (e) { msg = e.message; }
    assert(/Expected \.at\(d\) or \.inset\(d\)/.test(msg), msg);
});

test('run + emit: port offsets stay bound to parameters and round-trip', () => {
    const { scene, result } = runCode(`param gap 120
shape rectangle wall { width: 300 height: 400 }
shape rectangle shelf { width: 300 height: 200 }
join finger shelf.top wall.top
join finger shelf.bottom wall.bottom`);
    assert(result.success);
    scene.jointStore.fromJSON({ joints: [{ id: 'j1', type: 'finger', a: { shape: 'shelf', edge: 'left', inset: 'gap + 5' }, b: { shape: 'wall', line: [0, 'gap', 100, 'gap'] }, params: {} }] });
    assertEqual(emitJoints(scene.jointStore, id => id)[0], 'join finger shelf.left.inset(gap + 5) wall.line(0, gap, 100, gap)');
});
