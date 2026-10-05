/**
 * Join tool decisions: clicks become named ports, and two ports offer the
 * joints that fit them with exact port references.
 */
import { test, assert, assertEqual, assertApprox } from '../harness.js';
import { ShapeRegistry } from '../../src/models/shapes/ShapeRegistry.js';
import { edgePort, facePort, jointOptions, edgeNameFor } from '../../src/joints/jointTool.js';

const rect = (id, w, h) => ShapeRegistry.create('rectangle', { x: 0, y: 0 }, { id, x: 0, y: 0, width: w, height: h });

test('an edge click names the edge and measures along it', () => {
    const r = rect('base', 400, 300);
    const p = edgePort(r, 0, { x: 120, y: 0.5 });
    assertEqual(`${p.shape}.${p.edge}`, 'base.top');
    assertApprox(p.u, 120, 1e-9);
    assertEqual(edgeNameFor(r, 2), 'bottom');
});

test('a face click picks the nearest edge and the inset to it', () => {
    const r = rect('side', 280, 600);
    const p = facePort(r, { x: 140, y: 60.04 });   // 60 from top, 140 from the sides
    assertEqual(`${p.edge}:${p.inset}`, 'top:60');
    assertEqual(facePort(r, { x: 200, y: 590 }).edge, 'bottom');
    assertEqual(facePort(r, { x: 0.2, y: 300 }), null, 'right on an edge is not a face line');
});

test('edge + edge offers corner, splice, hinge and cross lap (with positions)', () => {
    const a = edgePort(rect('a', 400, 300), 2, { x: 200, y: 300 });
    const b = edgePort(rect('b', 400, 200), 0, { x: 150, y: 0 });
    const options = jointOptions(a, b);
    assertEqual(options.map(o => o.type).join(','), 'finger,splice,hinge,cross_lap');
    const cross = options.find(o => o.type === 'cross_lap');
    assertEqual(JSON.stringify(cross.a), '{"shape":"a","edge":"bottom","at":200}');
    assertEqual(JSON.stringify(cross.b), '{"shape":"b","edge":"top","at":150}');
});

test('edge + face (either order) offers tab and slot or bolt into the face', () => {
    const shelfEdge = edgePort(rect('shelf', 300, 280), 3, { x: 0, y: 100 });
    const sideFace = facePort(rect('side', 280, 600), { x: 140, y: 100 });
    for (const options of [jointOptions(shelfEdge, sideFace), jointOptions(sideFace, shelfEdge)]) {
        assertEqual(options.map(o => o.type).join(','), 'tab_slot,bolt');
        assertEqual(JSON.stringify(options[0].a), '{"shape":"shelf","edge":"left"}');
        assertEqual(JSON.stringify(options[0].b), '{"shape":"side","edge":"top","inset":100}');
    }
});

test('same shape, or two faces, offers nothing', () => {
    const r = rect('a', 100, 100);
    assertEqual(jointOptions(edgePort(r, 0, { x: 5, y: 0 }), edgePort(r, 1, { x: 100, y: 5 })).length, 0);
    assertEqual(jointOptions(facePort(rect('a', 100, 100), { x: 50, y: 40 }), facePort(rect('b', 100, 100), { x: 50, y: 40 })).length, 0);
});
