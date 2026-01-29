# Otto v2 Architecture Explained


## What Otto Does

Otto is a parametric drawing tool. Users create shapes on a canvas. Shapes can have properties bound to parameters. When parameters change, shapes update automatically.

Example:
- Circle with radius = 50
- Bind radius to parameter "size"
- Change "size" from 50 to 100
- Circle updates to radius 100

## Core Architecture

### The Main Parts

```
Application (facade)
├── TabManager (manages tabs)
│   └── Tab[]
│       └── SceneState (scene data)
│           ├── ShapeStore (shapes)
│           ├── ParameterStore (parameters)
│           └── BindingResolver (calculates bound values)
├── UI Components (user interface)
│   ├── TabBar
│   ├── ShapeLibrary
│   ├── CanvasRenderer
│   ├── ParametersMenu
│   └── PropertiesPanel
├── StorageManager (autosave)
├── FileManager (import/export)
└── PluginManager (extensions)
```

### How Data Flows

1. **User creates shape**
   - Drag from ShapeLibrary → drop on canvas
   - DragDropManager creates shape via ShapeRegistry
   - Shape added to ShapeStore
   - EventBus notifies CanvasRenderer
   - Canvas re-renders

2. **User changes parameter**
   - Update value in ParametersMenu
   - ParameterStore updates value
   - EventBus notifies CanvasRenderer
   - BindingResolver resolves all bindings
   - Canvas re-renders with new values

3. **User saves**
   - Application calls StorageManager.save()
   - Serializer converts TabManager to JSON
   - LocalStorageBackend writes to localStorage
   - Autosave happens every 5 seconds

## Key Components Explained

### Application.js

Entry point. Wires everything together. Handles:
- Initialization
- Keyboard shortcuts (Ctrl+S, Ctrl+Z, etc.)
- Undo/redo coordination
- Component lifecycle

**Does NOT** contain business logic. Just coordinates.

### TabManager + Tab + SceneState

**TabManager**: Container for tabs
- `tabs[]` array
- `activeTabId` string
- Methods: createTab(), switchTab(), closeTab()

**Tab**: Wrapper
- `id` string
- `name` string
- `sceneState` SceneState instance

**SceneState**: Actual scene data
- `shapeStore` ShapeStore instance
- `parameterStore` ParameterStore instance
- `bindingResolver` BindingResolver instance
- `viewport` object (zoom, pan)

Each tab = independent scene = separate SceneState.

### ShapeStore

Repository for shapes in current scene.

```javascript
class ShapeStore {
    shapes: Map<id, Shape>
    selectedShapeIds: Set<id>

    add(shape)
    remove(id)
    get(id)
    getAll()
}
```

When shapes change, emits events via EventBus.

### ParameterStore

Repository for parameters in current scene.

```javascript
class ParameterStore {
    parameters: Map<name, value>

    add(name, value)
    set(name, value)
    get(name)
    remove(name)
}
```

When parameters change, emits events via EventBus.

### BindingResolver

Resolves bindings to actual values.

```javascript
class BindingResolver {
    resolve(shape) {
        // For each binding on shape:
        // 1. Get binding type (parameter, expression, etc.)
        // 2. Calculate value from ParameterStore
        // 3. Return resolved shape with actual values
    }
}
```

Example:
```javascript
// Original shape
circle = {
    centerX: 100,
    centerY: 100,
    radius: ParameterBinding('size')  // binding, not value
}

// Resolved shape
resolvedCircle = {
    centerX: 100,
    centerY: 100,
    radius: 50  // actual value from ParameterStore.get('size')
}
```

### ShapeRegistry

Factory for creating shapes.

```javascript
class ShapeRegistry {
    static registry: Map<type, {createFn, fromJSONFn}>

    static register(type, createFn, fromJSONFn)
    static create(type, position, options)
    static fromJSON(json)
}
```

No switch statements. Uses registry pattern.

To add new shape type:
```javascript
ShapeRegistry.register('triangle',
    (id, pos, opts) => new Triangle(id, pos, opts),
    Triangle.fromJSON
);
```

Now `ShapeRegistry.create('triangle', ...)` works.

### EventBus

Singleton. Pub/sub system.

```javascript
class EventBus {
    subscribers: Map<eventType, Set<callback>>

    subscribe(eventType, callback)
    emit(eventType, payload)
}
```

Components don't reference each other directly. They communicate via events.

Example:
```javascript
// ShapeStore emits
EventBus.emit(EVENTS.SHAPE_ADDED, shape);

// CanvasRenderer listens
EventBus.subscribe(EVENTS.SHAPE_ADDED, () => {
    this.render();
});
```

Decouples components. ShapeStore doesn't know CanvasRenderer exists.

### CanvasRenderer

Draws shapes to HTML canvas.

Rendering loop:
1. Get shapes from ShapeStore
2. Resolve bindings via BindingResolver
3. Draw each shape to canvas
4. Apply viewport transformations (zoom, pan)

Subscribes to all shape/parameter events. Re-renders on changes.

### UI Components

All inherit from Component base class:
- mount(): Attach to DOM, subscribe to events
- render(): Update DOM
- unmount(): Clean up, unsubscribe

**TabBar**: Shows tabs, handles switching
**ShapeLibrary**: Shape palette, drag source
**ParametersMenu**: List of parameters, edit values
**PropertiesPanel**: Shape properties, set bindings
**ZoomControls**: Zoom in/out, reset

### DragDropManager

Handles drag-and-drop from ShapeLibrary to canvas.

State machine:
1. IDLE
2. DRAGGING (mouse down, moving)
3. DROPPED (mouse up)

On drop:
- Convert screen coordinates to world coordinates (accounts for zoom/pan)
- Create shape via ShapeRegistry
- Add to ShapeStore

### Serializer

Converts in-memory objects to/from JSON.

```javascript
class Serializer {
    static serialize(tabManager) {
        // TabManager → tabs → scenes → shapes → JSON
    }

    static deserialize(json) {
        // JSON → restore shapes → scenes → tabs → TabManager
    }
}
```

Handles:
- Shape serialization (different types)
- Binding serialization (different types)
- Circular reference prevention

### StorageManager

Handles persistence to localStorage/IndexedDB.

```javascript
class StorageManager {
    save() {
        json = Serializer.serialize(tabManager)
        backend.save('autosave', json)
    }

    load() {
        json = backend.load('autosave')
        return Serializer.deserialize(json)
    }

    startAutoSave() {
        setInterval(() => this.save(), 5000)
    }
}
```

Uses StorageBackend interface. Can swap localStorage/IndexedDB/cloud.

### FileManager

Import/export JSON files.

```javascript
class FileManager {
    exportToFile(filename) {
        json = Serializer.serialize(tabManager)
        download(json, filename)
    }

    async importFromFile() {
        file = await fileDialog()
        json = await file.text()
        return Serializer.deserialize(json)
    }
}
```

## Shape System

### Shape Base Class

```javascript
class Shape {
    id: string
    type: string
    position: {x, y}
    bindings: Map<property, Binding>

    getBindableProperties()  // ['radius', 'centerX', etc.]
    setBinding(property, binding)
    resolve(paramStore, resolver)  // returns new shape with values
    render(ctx)
    getBounds()
    containsPoint(x, y)
}
```

### Concrete Shapes

**Circle**
- Properties: centerX, centerY, radius
- All properties bindable

**Rectangle**
- Properties: x, y, width, height
- All properties bindable

### Bindings

**ParameterBinding**: Value comes from parameter
```javascript
{
    type: 'parameter',
    parameterName: 'size'
}
// Resolves to: ParameterStore.get('size')
```

**ExpressionBinding**: Value calculated from expression
```javascript
{
    type: 'expression',
    expression: 'width * 2',
    dependencies: ['width']
}
// Resolves to: eval expression with parameter values
```

**ProcessedBinding**: Value goes through handlers
```javascript
{
    type: 'processed',
    sourceBinding: ParameterBinding('size'),
    handlers: [
        ClampHandler(0, 100),  // clamp between 0-100
        RoundHandler(0)         // round to integer
    ]
}
// Resolves to: clamp(round(ParameterStore.get('size')), 0, 100)
```

### ShapeBuilder

Fluent API for creating shapes.

```javascript
const circle = new ShapeBuilder('circle')
    .at(100, 100)
    .withProperty('radius', 50)
    .withBinding('radius', new ParameterBinding('size'))
    .build();
```

Validates before building. Throws error if invalid.

### Decorators

Wrap shapes to add visual effects.

```javascript
class ShapeDecorator extends Shape {
    constructor(wrappedShape) {
        this.shape = wrappedShape
    }

    render(ctx) {
        this.shape.render(ctx)
        this.renderDecoration(ctx)
    }
}
```

**FillDecorator**: Adds fill color
**BorderDecorator**: Adds border
**ShadowDecorator**: Adds shadow

Can stack:
```javascript
shape = new ShadowDecorator(
    new FillDecorator(
        new Circle(...)
    )
);
```

## Undo/Redo System

Uses Memento pattern.

### SceneMemento

Snapshot of scene state.

```javascript
class SceneMemento {
    shapesJSON: string      // serialized shapes
    parametersJSON: string  // serialized parameters
    viewportJSON: string    // serialized viewport
}
```

### SceneHistory

Stack of mementos.

```javascript
class SceneHistory {
    history: SceneMemento[]
    index: number

    push(memento) {
        // Add to stack
        // Clear forward history
    }

    undo() {
        // Move index back
        // Return previous memento
    }

    redo() {
        // Move index forward
        // Return next memento
    }
}
```

### How It Works

1. User makes change (add shape, edit parameter)
2. EventBus emits event
3. Application creates snapshot: `SceneState.createMemento()`
4. Push to history: `SceneHistory.push(memento)`
5. User hits Ctrl+Z
6. Application gets memento: `SceneHistory.undo()`
7. Restore state: `SceneState.restoreMemento(memento)`

Snapshots are debounced (300ms) to avoid excessive memory usage.

## Rendering Pipeline

```
User changes parameter
    ↓
ParameterStore.set('size', 100)
    ↓
EventBus.emit(PARAM_CHANGED)
    ↓
CanvasRenderer receives event
    ↓
CanvasRenderer.render()
    ↓
Get shapes: ShapeStore.getAll()
    ↓
Resolve bindings: BindingResolver.resolveAll(shapes)
    ↓
For each resolved shape:
    ↓
    Apply viewport transform (zoom, pan)
    ↓
    shape.render(ctx)
    ↓
Done
```

## Persistence Format

```json
{
    "version": "1.0.0",
    "tabs": [
        {
            "id": "tab-1",
            "name": "Scene 1",
            "sceneState": {
                "shapes": [
                    {
                        "id": "circle-1",
                        "type": "circle",
                        "position": {"x": 100, "y": 100},
                        "centerX": 100,
                        "centerY": 100,
                        "radius": 50,
                        "bindings": {
                            "radius": {
                                "type": "parameter",
                                "parameterName": "size"
                            }
                        }
                    }
                ],
                "parameters": {
                    "size": 50
                },
                "viewport": {
                    "zoom": 1.0,
                    "panX": 0,
                    "panY": 0
                }
            }
        }
    ],
    "activeTabId": "tab-1"
}
```

## Event Flow Examples

### Adding a Shape

```
User drags circle from library
    ↓
DragDropManager.onMouseDown()
    ↓
User drops on canvas
    ↓
DragDropManager.onMouseUp()
    ↓
Create shape: ShapeRegistry.create('circle', position)
    ↓
Add to store: ShapeStore.add(circle)
    ↓
EventBus.emit(SHAPE_ADDED, circle)
    ↓
CanvasRenderer receives event → render()
PropertiesPanel receives event → update()
Application receives event → createSnapshot()
```

### Editing a Parameter

```
User types "100" in parameter input
    ↓
ParametersMenu.onInputChange()
    ↓
ParameterStore.set('size', 100)
    ↓
EventBus.emit(PARAM_CHANGED, {name: 'size', value: 100})
    ↓
CanvasRenderer receives event
    ↓
BindingResolver.resolveAll(shapes)
    ↓
Finds circle with radius bound to 'size'
    ↓
Resolves: radius = ParameterStore.get('size') = 100
    ↓
Render circle with radius 100
```

### Switching Tabs

```
User clicks tab 2
    ↓
TabBar.onTabClick(tab2)
    ↓
TabManager.switchTab(tab2.id)
    ↓
EventBus.emit(TAB_SWITCHED, {tab: tab2})
    ↓
Application receives event
    ↓
Application.updateComponentsForNewScene(tab2.sceneState)
    ↓
Update CanvasRenderer.sceneState
Update ParametersMenu.parameterStore
Update PropertiesPanel.shapeStore
    ↓
All components re-render with new scene data
```

## Design Patterns Used

### Singleton
- EventBus: One instance for entire app
- ShapeRegistry: Static class, one registry

### Factory
- ShapeRegistry.create(): Creates shapes by type
- StorageFactory: Creates storage backends

### Builder
- ShapeBuilder: Fluent API for complex construction

### Facade
- Application: Simplifies complex subsystem
- PluginAPI: Simplifies plugin development

### Repository
- ShapeStore: Collection + query interface
- ParameterStore: Collection + query interface

### Observer (Pub/Sub)
- EventBus: Components observe events

### Strategy
- StorageBackend: Swap storage implementation
- RenderStrategy: Different rendering modes

### Memento
- SceneMemento: State snapshots
- SceneHistory: Manages snapshots

### Decorator
- ShapeDecorator: Adds visual features

### Registry
- ShapeRegistry: Register types dynamically
- BindingRegistry: Register binding types
- CommandRegistry: Register commands

### Template Method
- Plugin: Defines lifecycle, subclasses override

### Adapter
- StorageBackend: Adapts different storage APIs

### Dependency Injection
- Components receive dependencies in constructor
- No global state access

## File Organization

```
src/
├── main.js                    Entry point
├── core/                      Business logic
│   ├── Application.js         Main coordinator
│   ├── TabManager.js          Tab management
│   ├── SceneState.js          Scene data + memento
│   ├── ShapeStore.js          Shape repository
│   ├── ParameterStore.js      Parameter repository
│   ├── BindingResolver.js     Binding resolution
│   ├── CommandRegistry.js     Command pattern
│   └── DragDropManager.js     Drag/drop handling
├── models/                    Data models
│   ├── shapes/                Shape classes
│   │   ├── Shape.js           Base class
│   │   ├── Circle.js          Circle implementation
│   │   ├── Rectangle.js       Rectangle implementation
│   │   ├── ShapeRegistry.js   Factory
│   │   ├── ShapeBuilder.js    Builder
│   │   └── decorators/        Decorator classes
│   └── bindings/              Binding classes
│       ├── ParameterBinding.js
│       ├── ExpressionBinding.js
│       └── ProcessedBinding.js
├── ui/                        UI components
│   ├── Component.js           Base component
│   ├── TabBar.js              Tab UI
│   ├── ShapeLibrary.js        Shape palette
│   ├── CanvasRenderer.js      Canvas rendering
│   ├── ParametersMenu.js      Parameter list
│   ├── PropertiesPanel.js     Shape properties
│   └── ZoomControls.js        Zoom controls
├── persistence/               Save/load
│   ├── StorageManager.js      Storage facade
│   ├── FileManager.js         File operations
│   ├── Serializer.js          JSON conversion
│   └── backends/              Storage implementations
├── events/                    Event system
│   └── EventBus.js            Pub/sub singleton
├── plugins/                   Plugin system
│   ├── PluginManager.js       Plugin lifecycle
│   ├── PluginAPI.js           Plugin facade
│   └── Plugin.js              Plugin base class
└── rendering/                 Rendering
    └── strategies/            Render strategies
```

## Dependencies

### External
None. Vanilla JavaScript + HTML5 Canvas API.

### Internal
```
Application depends on:
├── TabManager
├── StorageManager
├── FileManager
├── PluginManager
└── All UI components

TabManager depends on:
└── SceneState

SceneState depends on:
├── ShapeStore
├── ParameterStore
└── BindingResolver

UI components depend on:
├── EventBus
└── Core components (ShapeStore, ParameterStore, etc.)

ShapeStore depends on:
├── EventBus
├── ParameterStore
└── BindingResolver

BindingResolver depends on:
└── ParameterStore
```

Circular dependencies: None. Resolved via EventBus.

## Startup Sequence

```
1. main.js loads
2. Create Application instance
3. Application.init()
    ├── Get DOM elements
    ├── Create TabManager (creates initial tab)
    ├── Create StorageManager
    ├── Create FileManager
    ├── Create UI components
    │   ├── TabBar
    │   ├── ShapeLibrary
    │   ├── CanvasRenderer
    │   ├── ParametersMenu
    │   ├── PropertiesPanel
    │   └── ZoomControls
    ├── Create DragDropManager
    ├── Mount all components
    ├── Subscribe to events
    ├── Setup keyboard shortcuts
    ├── Load autosave (if exists)
    └── Start autosave timer
4. Render initial state
5. Ready for user interaction
```

## Performance Characteristics

### Memory
- Each tab = full SceneState copy
- Undo history = snapshots (JSON strings)
- Max history size = 50 snapshots
- Debounced snapshots (300ms) = max ~3 snapshots/second

### Rendering
- Canvas clears and redraws on every change
- No optimization (dirty rectangles, etc.)
- OK for <100 shapes, slow beyond that

### Storage
- localStorage: Max ~5-10MB (browser limit)
- IndexedDB: Much larger, but slower
- Autosave: Every 5 seconds

### Scalability Limits
- Shapes per scene: ~100 (rendering bottleneck)
- Parameters: No limit
- Tabs: No limit (memory constraint)
- Undo history: 50 snapshots

## Extension Points

Want to add features? These are the hooks:

1. **New shape type**: ShapeRegistry.register()
2. **New binding type**: BindingRegistry.register()
3. **New command**: CommandRegistry.register()
4. **New storage backend**: Implement StorageBackend interface
5. **New render strategy**: Extend RenderStrategy
6. **React to events**: EventBus.subscribe()
7. **Plugin**: Extend Plugin class

## Known Issues / Limitations

1. **No collaboration**: Single user only
2. **No shape layers**: Z-order = creation order
3. **No text shapes**: Only circles/rectangles
4. **No undo for tab operations**: Only scene changes
5. **No export to SVG/PNG**: Only JSON
6. **No animation**: Static shapes only
7. **Canvas-only rendering**: No WebGL, no DOM shapes
8. **Expression eval**: Uses Function() constructor (security concern)
9. **No shape rotation**: Axis-aligned only
10. **No multi-select editing**: Select multiple, but can't edit together

## Summary

Otto = parametric drawing tool with:
- Multi-tab interface
- Shapes with bindable properties
- Parameter-driven values
- Undo/redo
- Autosave
- Plugin system

Architecture = event-driven, pattern-heavy, vanilla JS.

Data flows through EventBus. Components don't reference each other.

Storage = JSON serialization to localStorage/IndexedDB.

Extensible via plugins and registries.

That's it.
