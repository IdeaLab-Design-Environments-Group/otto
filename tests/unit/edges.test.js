/**
 * Named edges: every name resolves to a straight, non-zero-length edge of the
 * shape's current geometry, names follow parameter changes, curved shapes
 * offer none, and world/local mapping matches the canvas rotation.
 */
import { test, assert, assertEqual, assertApprox } from '../harness.js';
import { ShapeRegistry } from '../../src/models/shapes/ShapeRegistry.js';
import { Triangle } from '../../src/models/shapes/Triangle.js';
import { namedEdges, resolveEdge, inwardNormal, toWorld, toLocal, shapeEdges } from '../../src/joints/edges.js';

const make = (type, options = {}) => ShapeRegistry.create(type, { x: 0, y: 0 }, options);
const names = (shape) => [...namedEdges(shape).keys()].filter(n => !/^e\d+$/.test(n)).sort().join(',');
const mid = (e) => ({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 });

function assertSides(shape, label) {
    const edges = namedEdges(shape);
    for (const side of ['top', 'right', 'bottom', 'left']) assert(edges.has(side), `${label}: ${side}`);
    const top = edges.get('top'), bottom = edges.get('bottom'), left = edges.get('left'), right = edges.get('right');
    assertApprox(top.a.y, top.b.y, 1e-9, `${label} top horizontal`);
    assertApprox(left.a.x, left.b.x, 1e-9, `${label} left vertical`);
    assert(mid(top).y < mid(bottom).y, `${label}: top above bottom (y down)`);
    assert(mid(left).x < mid(right).x, `${label}: left of right`);
}

test('every name is a straight edge with positive length', () => {
    for (const type of ShapeRegistry.getAvailableTypes()) {
        const shape = make(type);
        for (const [name, e] of namedEdges(shape)) {
            assert(e.straight, `${type}.${name} straight`);
            assert(e.length > 1e-6, `${type}.${name} non-zero`);
        }
    }
});

test('rectangle sides are top/right/bottom/left at indices 0..3', () => {
    const r = make('rectangle', { width: 100, height: 40 });
    const e = namedEdges(r);
    assertEqual(['top', 'right', 'bottom', 'left'].map(n => e.get(n).index).join(','), '0,1,2,3');
    assertSides(r, 'rectangle');
    assertEqual(e.get('top').length, 100);
    assertEqual(e.get('left').length, 40);
});

test('rounded rectangle keeps its side names when the radius changes the anchor layout', () => {
    const sharp = make('roundedRectangle', { width: 120, height: 80, cornerRadius: 0 });
    const round = make('roundedRectangle', { width: 120, height: 80, cornerRadius: 10 });
    assertSides(sharp, 'r=0');
    assertSides(round, 'r=10');
    assert(namedEdges(sharp).get('right').index !== namedEdges(round).get('right').index, 'indices differ');
    assertApprox(namedEdges(round).get('top').length, 100, 1e-6, 'straight part of the top side');
});

test('chamfer rectangle, slot and cross get direction-based sides', () => {
    assertSides(make('chamferRectangle', { width: 100, height: 60, chamfer: 8 }), 'chamfer');
    assertSides(make('chamferRectangle', { width: 100, height: 60, chamfer: 0 }), 'chamfer 0');
    assertSides(make('cross'), 'cross');
    const slot = namedEdges(make('slot'));
    assert(slot.has('top') && slot.has('bottom'), 'slot top/bottom');
});

test('triangle base/left/right and arrow tail', () => {
    // Built directly: a plugin test elsewhere unregisters 'triangle'.
    assertEqual(names(new Triangle('t', { position: { x: 0, y: 0 } })), 'base,left,right');
    assertEqual(names(make('arrow')), 'tail');
});

test('polygon names every side and finds the bottom one, for N = 3..12', () => {
    for (let n = 3; n <= 12; n++) {
        const p = make('polygon', { sides: n, radius: 50 });
        const e = namedEdges(p);
        for (let i = 0; i < n; i++) assert(e.has(`side${i}`), `N=${n} side${i}`);
        const lowest = Math.max(...[...e.values()].map(x => mid(x).y));
        assertApprox(mid(e.get('bottom')).y, lowest, 1e-9, `N=${n} bottom`);
    }
});

test('curved and open shapes offer no edges', () => {
    for (const type of ['circle', 'ellipse', 'line', 'arc', 'spiral', 'wave', 'donut', 'gear']) {
        assertEqual(namedEdges(make(type)).size, 0, type);
    }
    assertEqual(shapeEdges(make('line')).length, 0, 'open path has no panel edges');
});

test('unknown names report the available ones', () => {
    const { edge, error } = resolveEdge(make('rectangle'), 'side');
    assertEqual(edge, null);
    assert(/no straight edge 'side'.*top/.test(error), error);
});

test('inward normal points into the material on every rectangle side', () => {
    const r = make('rectangle', { width: 100, height: 40 });
    const centre = { x: 50, y: 20 };
    for (const e of namedEdges(r).values()) {
        const n = inwardNormal(r, e);
        const m = mid(e);
        assert((centre.x - m.x) * n.x + (centre.y - m.y) * n.y > 0, `${e.name} inward`);
    }
});

test('toWorld rotates about the bounds centre like the canvas; toLocal inverts it', () => {
    const r = make('rectangle', { width: 100, height: 40 });
    r.rotation = 90;
    const w = toWorld(r, { x: 0, y: 0 });   // top-left corner, centre (50, 20)
    assertApprox(w.x, 70, 1e-9);
    assertApprox(w.y, -30, 1e-9);
    const back = toLocal(r, w);
    assertApprox(back.x, 0, 1e-9);
    assertApprox(back.y, 0, 1e-9);
});
