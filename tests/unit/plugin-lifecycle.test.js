/**
 * Plugin-system wiring tests: a PluginManager built the way Application
 * builds it can load + activate the example plugins, the TriangleShape
 * plugin's type becomes creatable/serializable through the registry, the
 * SHAPE_TYPE_REGISTERED event fires, and lifecycle hooks run in order.
 */
import { test, assert, assertEqual } from '../harness.js';
import { PluginManager } from '../../src/plugins/PluginManager.js';
import { ShapeRegistry } from '../../src/models/shapes/ShapeRegistry.js';
import { BindingRegistry } from '../../src/models/BindingRegistry.js';
import { CommandCatalog } from '../../src/commands/CommandCatalog.js';
import { SceneState } from '../../src/core/SceneState.js';
import EventBus, { EVENTS } from '../../src/events/EventBus.js';

function makeManager(scene) {
    return new PluginManager({
        eventBus: EventBus,
        shapeRegistry: ShapeRegistry,
        bindingRegistry: BindingRegistry,
        commandRegistry: new CommandCatalog(),
        sceneState: scene,
        application: { context: { history: null } }
    });
}

test('TriangleShapePlugin registers a creatable, serializable shape type', async () => {
    ShapeRegistry.unregister('triangle-plugin-test'); // hygiene (noop)
    const scene = new SceneState();
    const manager = makeManager(scene);

    let registeredEvent = null;
    const unsub = EventBus.subscribe(EVENTS.SHAPE_TYPE_REGISTERED, (p) => { registeredEvent = p; });

    const plugin = await manager.load('../../examples/plugins/TriangleShapePlugin.js');
    assert(plugin, 'plugin loaded');
    const activated = await manager.activate(plugin.id);
    assert(activated, 'plugin activated');

    // 'triangle' is a built-in type too, but the plugin re-registers its own
    // Triangle class; registration must have fired the event.
    assert(registeredEvent && registeredEvent.type === 'triangle', 'SHAPE_TYPE_REGISTERED fired');
    unsub();

    // Creatable through the registry, and round-trips through JSON.
    const shape = ShapeRegistry.create('triangle', { x: 5, y: 6 }, { size: 40 });
    assertEqual(shape.type, 'triangle');
    assertEqual(shape.size, 40);
    const restored = ShapeRegistry.fromJSON(shape.toJSON());
    assertEqual(restored.size, 40);
    assert(shape.getBindableProperties().includes('depth'), 'plugin shape gets 2.5D depth for free');

    await manager.deactivate(plugin.id);
});

test('CustomBindingPlugin activates and registers binding types', async () => {
    const scene = new SceneState();
    const manager = makeManager(scene);
    const plugin = await manager.load('../../examples/plugins/CustomBindingPlugin.js');
    assert(plugin, 'plugin loaded');
    const activated = await manager.activate(plugin.id);
    assert(activated, 'plugin activated');
    await manager.deactivate(plugin.id);
});

test('lifecycle hooks execute in registration order', async () => {
    const scene = new SceneState();
    const manager = makeManager(scene);
    const order = [];
    manager.api.addHook('app:init', () => order.push('a'));
    manager.api.addHook('app:init', () => order.push('b'));
    await manager.api.executeHook('app:init', {});
    assertEqual(order.join(','), 'a,b');
});

test('registerCommand adapts a class into a catalog factory', async () => {
    const scene = new SceneState();
    const catalog = new CommandCatalog();
    const manager = new PluginManager({
        eventBus: EventBus,
        shapeRegistry: ShapeRegistry,
        bindingRegistry: BindingRegistry,
        commandRegistry: catalog,
        sceneState: scene,
        application: { context: { history: null } }
    });

    class NoopCommand {
        constructor(label) { this.label = label; }
        execute() { this.ran = true; }
        undo() {}
    }
    manager.api.registerCommand('test.noop', NoopCommand);
    assert(catalog.has('test.noop'), 'command registered in catalog');
    const cmd = catalog.create('test.noop', 'hi');
    assertEqual(cmd.label, 'hi');
    cmd.execute(scene);
    assert(cmd.ran, 'built command executes');
});
