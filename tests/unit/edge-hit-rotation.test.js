/**
 * Edge hit-testing must use the shape's rotation the way the canvas draws
 * it (about the bounds centre); before the fix it tested unrotated edges.
 */
import { test, assert, assertEqual, assertApprox } from '../harness.js';
import { SceneState } from '../../src/core/SceneState.js';
import { ShapeRegistry } from '../../src/models/shapes/ShapeRegistry.js';
import { HitTestService } from '../../src/services/HitTestService.js';

function setup(rotation) {
    ShapeRegistry.resetIdCounters();
    const scene = new SceneState();
    const rect = ShapeRegistry.create('rectangle', { x: 0, y: 0 }, { x: 0, y: 0, width: 100, height: 40 }, scene.shapeStore);
    rect.rotation = rotation;
    scene.shapeStore.add(rect);
    const context = { shapeStore: scene.shapeStore, selection: scene.shapeStore.selection, bindingResolver: scene.bindingResolver };
    const vc = { screenToWorld: (x, y) => ({ x, y }), viewport: { zoom: 1 } };
    return { hits: new HitTestService({ context, viewportController: vc, interaction: {} }), rect };
}

test('unrotated: a point on the top edge hits edge 0', () => {
    const { hits } = setup(0);
    const hit = hits.hitTestEdge(50, 1);
    assertEqual(hit?.edge.index, 0);
});

test('rotated 90°: the top edge is found where it is drawn, not where it was', () => {
    const { hits } = setup(90);
    // Centre (50, 20); local top edge (0,0)→(100,0) is drawn at x = 70, y from −30 to 70.
    const hit = hits.hitTestEdge(71, 20);
    assert(hit, 'hit expected on the drawn edge');
    assertEqual(hit.edge.index, 0);
    assertApprox(hit.position.x, 70, 1e-6, 'hover point is in world coordinates');
    assertApprox(hit.position.y, 20, 1e-6);
    assertEqual(hits.hitTestEdge(50, 1), null, 'the unrotated location is empty');
});
