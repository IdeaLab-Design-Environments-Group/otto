# Nova Otto - Architecture Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture Patterns](#architecture-patterns)
3. [Project Structure](#project-structure)
4. [Core Components](#core-components)
5. [Model Layer](#model-layer)
6. [UI Layer](#ui-layer)
7. [Persistence Layer](#persistence-layer)
8. [Event System](#event-system)
9. [Data Flow](#data-flow)
10. [Extending the Codebase](#extending-the-codebase)
11. [Key Workflows](#key-workflows)

---

## Overview

Nova Otto is a parametric 2D design system built with vanilla JavaScript (ES6 modules). The application allows users to create geometric shapes, bind their properties to parameters or formulas, and manage multiple design scenes through a tabbed interface.

### Key Features
- **Parametric Design**: Shape properties can be bound to parameters, formulas, or literal values
- **Multi-Selection**: Select and manipulate multiple shapes simultaneously
- **Multi-Scene Support**: Manage multiple design scenes through tabs
- **Undo/Redo**: Full history management for each scene
- **File I/O**: Export and import designs as `.pds` files
- **Local Persistence**: Auto-save and manual save to browser storage

---

## Architecture Patterns

The codebase follows a layered architecture with clear separation of concerns:

### Design Patterns Used

1. **Registry Pattern** - For dynamic type registration (Shapes, Bindings)
2. **Singleton Pattern** - EventBus for global event management
3. **Observer Pattern** - Event-driven communication between components
4. **Strategy Pattern** - Bindings (Literal, Parameter, Expression) and Snap behaviors
5. **Factory Method Pattern** - Shape creation via Registry
6. **Template Method Pattern** - Component base class, Shape base class
7. **Builder Pattern** - Parameter construction
8. **Facade Pattern** - Application class and BindingResolver
9. **Mediator Pattern** - ShapeStore mediates between shapes and parameters
10. **Repository Pattern** - ParameterStore and ShapeStore
11. **Memento Pattern** - Undo/Redo system via SceneHistory
12. **Command Pattern** - Batch operations (Move, Duplicate)
13. **Composite Pattern** - Expression AST nodes
14. **Interpreter Pattern** - Expression parsing and evaluation
15. **Adapter Pattern** - FileManager adapts to browser File API

---

## Project Structure

```
Otto-v2/
├── index.html                 # Main HTML entry point
├── styles/
│   └── main.css              # Global styles and theme
├── planning/                 # Project planning documents
└── src/
    ├── main.js               # Application entry point
    ├── core/                 # Core business logic
    │   ├── Application.js    # Facade - main application orchestrator
    │   ├── TabManager.js     # Multi-scene management
    │   ├── SceneState.js     # Scene state + Memento pattern
    │   ├── ShapeStore.js     # Repository + Mediator for shapes
    │   ├── ParameterStore.js # Repository for parameters
    │   ├── BindingResolver.js# Facade for binding resolution
    │   ├── DragDropManager.js# Mediator for drag-and-drop
    │   ├── SnapStrategy.js   # Strategy pattern for snapping
    │   └── Command.js        # Command pattern for batch ops
    ├── models/               # Domain models
    │   ├── Parameter.js      # Parameter model + Builder
    │   ├── Binding.js        # Binding classes (Strategy)
    │   ├── BindingRegistry.js# Registry for binding types
    │   ├── ExpressionParser.js # Expression interpreter
    │   └── shapes/           # Shape models
    │       ├── Shape.js      # Abstract base class
    │       ├── Circle.js     # Circle implementation
    │       ├── Rectangle.js  # Rectangle implementation
    │       └── ShapeRegistry.js # Registry for shape types
    ├── ui/                   # UI components
    │   ├── Component.js      # Base UI component class
    │   ├── CanvasRenderer.js # Canvas rendering + interactions
    │   ├── ShapeLibrary.js   # Shape palette UI
    │   ├── ParametersMenu.js # Parameter management UI
    │   ├── PropertiesPanel.js# Property editing UI
    │   ├── TabBar.js         # Tab navigation UI
    │   └── ZoomControls.js   # Zoom controls UI
    ├── events/               # Event system
    │   └── EventBus.js       # Singleton event bus
    └── persistence/          # Data persistence
        ├── Serializer.js     # JSON serialization
        ├── StorageManager.js # LocalStorage manager
        └── FileManager.js    # File I/O manager
```

---

## Core Components

### Application (`core/Application.js`)
**Pattern**: Facade + Dependency Injection

The main application facade that orchestrates all components.

**Responsibilities**:
- Initializes all UI components and managers
- Manages scene switching
- Coordinates undo/redo history
- Provides high-level operations (save, load, export, import)

**Key Methods**:
- `init()` - Initialize application and all components
- `save()` / `load()` - LocalStorage persistence
- `exportFile()` / `importFile()` - File-based persistence
- `undo()` / `redo()` - History management
- `deleteSelectedShape()` - Delete selected shapes

### TabManager (`core/TabManager.js`)
**Pattern**: Observer + Factory Method

Manages multiple design scenes (tabs).

**Key Features**:
- Create, close, and switch between tabs
- Each tab has its own SceneState
- Emits events for tab lifecycle

**Key Methods**:
- `createTab(name)` - Create new tab (doesn't auto-switch)
- `switchTab(id)` - Switch to a tab
- `closeTab(id)` - Close a tab (prevents closing last tab)
- `renameTab(id, newName)` - Rename tab (double-click in UI)

### SceneState (`core/SceneState.js`)
**Pattern**: Memento Pattern

Encapsulates complete state of a design scene.

**Contains**:
- `parameterStore` - All parameters
- `shapeStore` - All shapes
- `bindingResolver` - Resolves bindings to values
- `viewport` - Camera position and zoom

**Key Methods**:
- `createMemento()` - Snapshot current state for undo/redo
- `restoreMemento(memento)` - Restore from snapshot

### ShapeStore (`core/ShapeStore.js`)
**Pattern**: Repository + Mediator

Manages shapes and mediates between shapes and parameters.

**Features**:
- Multi-selection support (`selectedShapeIds`)
- Single selection for backward compatibility (`selectedShapeId`)
- Emits events for shape lifecycle

**Key Methods**:
- `add(shape)` / `remove(id)` - Shape CRUD
- `setSelected(id)` - Single selection
- `setSelectedIds(ids)` - Multi-selection
- `addToSelection(id)` / `removeFromSelection(id)` - Modify selection
- `selectAll()` - Select all shapes

### ParameterStore (`core/ParameterStore.js`)
**Pattern**: Repository Pattern

Manages global parameters that can be referenced by shapes.

**Key Methods**:
- `add(parameter)` / `remove(id)` - Parameter CRUD
- `get(id)` / `getAll()` - Query parameters
- `updateValue(id, value)` - Update parameter value

### BindingResolver (`core/BindingResolver.js`)
**Pattern**: Facade Pattern

Simplifies binding resolution logic.

**Key Methods**:
- `resolveValue(binding)` - Resolve a single binding
- `resolveShape(shape)` - Resolve all bindings for a shape
- `resolveAll(shapes)` - Resolve bindings for multiple shapes

### EventBus (`events/EventBus.js`)
**Pattern**: Singleton + Observer

Central event system for decoupled communication.

**Available Events** (see `EVENTS` constant):
- `SHAPE_ADDED`, `SHAPE_REMOVED`, `SHAPE_MOVED`, `SHAPE_SELECTED`
- `PARAM_ADDED`, `PARAM_REMOVED`, `PARAM_CHANGED`
- `TAB_CREATED`, `TAB_CLOSED`, `TAB_SWITCHED`
- `VIEWPORT_CHANGED`

**Usage**:
```javascript
// Subscribe
EventBus.subscribe(EVENTS.SHAPE_ADDED, (shape) => {
    console.log('Shape added:', shape);
});

// Emit
EventBus.emit(EVENTS.SHAPE_ADDED, myShape);
```

---

## Model Layer

### Shapes

#### Shape (`models/shapes/Shape.js`)
**Pattern**: Template Method Pattern

Abstract base class for all geometric shapes.

**Abstract Methods** (must be implemented):
- `getBindableProperties()` - Return array of property names that can be bound
- `getBounds()` - Return bounding box `{x, y, width, height}`
- `containsPoint(x, y)` - Check if point is inside shape
- `render(ctx)` - Render shape to canvas context
- `clone()` - Create a copy of the shape

**Built-in Methods**:
- `setBinding(property, binding)` - Bind a property to a value source
- `getBinding(property)` - Get binding for a property
- `resolve(parameterStore, bindingResolver)` - Get resolved shape with all bindings evaluated

#### ShapeRegistry (`models/shapes/ShapeRegistry.js`)
**Pattern**: Registry Pattern

Dynamic registry for shape types. No switch statements!

**Current Shapes**:
- `Circle` - `centerX`, `centerY`, `radius`
- `Rectangle` - `x`, `y`, `width`, `height`

**Adding New Shapes**:
```javascript
import { Triangle } from './Triangle.js';

ShapeRegistry.register('triangle',
    (id, position, options) => new Triangle(
        id, position,
        options.x, options.y,
        options.size
    ),
    Triangle.fromJSON
);
```

**Key Methods**:
- `register(type, createFunction, fromJSONFunction)` - Register new shape type
- `create(type, position, options)` - Create shape instance
- `fromJSON(json)` - Deserialize shape from JSON
- `getAvailableTypes()` - List all registered types

### Bindings

#### Binding System (`models/Binding.js` + `BindingRegistry.js`)
**Pattern**: Strategy Pattern + Registry Pattern

Bindings determine how shape properties get their values.

**Binding Types**:

1. **LiteralBinding** - Fixed numeric value
   ```javascript
   new LiteralBinding(100) // Always 100
   ```

2. **ParameterBinding** - References a parameter
   ```javascript
   new ParameterBinding('param-id') // Value from parameter
   ```

3. **ExpressionBinding** - Mathematical formula
   ```javascript
   new ExpressionBinding('radius * 2 + 10') // Computed value
   ```

**Adding New Binding Types**:
```javascript
import { FunctionBinding } from './FunctionBinding.js';

BindingRegistry.register('function', (json) => {
    return new FunctionBinding(json.functionName, json.args);
});
```

### Parameters

#### Parameter (`models/Parameter.js`)
**Pattern**: Builder Pattern

Represents a named numeric parameter with optional min/max constraints.

**Usage**:
```javascript
const param = new Parameter('id', 'radius', 50, { min: 0, max: 200 });
// Or using builder
const param = Parameter.builder()
    .id('id')
    .name('radius')
    .value(50)
    .min(0)
    .max(200)
    .build();
```

### Expression Parser (`models/ExpressionParser.js`)
**Pattern**: Interpreter + Composite Pattern

Parses and evaluates mathematical expressions.

**Supported Operations**:
- Arithmetic: `+`, `-`, `*`, `/`
- Functions: `sin()`, `cos()`, `sqrt()`, `abs()`, `min()`, `max()`

**Example**:
```javascript
const parser = new ExpressionParser();
const ast = parser.parse('radius * 2 + sin(angle)');
const result = parser.evaluate(ast, { radius: 10, angle: 45 });
```

---

## UI Layer

### Component Base Class (`ui/Component.js`)
**Pattern**: Template Method Pattern

All UI components extend this base class.

**Built-in Features**:
- Event subscription/unsubscription management
- DOM element creation helpers
- Mount/unmount lifecycle

**Key Methods**:
- `mount()` - Mount component to DOM
- `unmount()` - Clean up component
- `render()` - Abstract method, must be implemented
- `subscribe(event, callback)` - Subscribe to EventBus events
- `createElement(tag, attrs, content)` - DOM creation helper

### CanvasRenderer (`ui/CanvasRenderer.js`)
**Pattern**: Observer Pattern

Handles all canvas rendering and user interactions.

**Features**:
- Shape rendering with selection highlights
- Multi-selection (Shift+click, drag rectangle)
- Shape dragging (single and multi-select)
- Panning (middle mouse / space+drag)
- Zooming (mouse wheel, zoom controls)
- Grid rendering and snap-to-grid
- Keyboard shortcuts (arrow keys, Delete, Ctrl+A, Ctrl+D, Escape)

**Key Methods**:
- `render()` - Render all shapes
- `hitTest(x, y)` - Find shape at coordinates
- `zoom(factor, centerX, centerY)` - Zoom canvas
- `setSnapStrategy(strategy)` - Change snapping behavior

**Keyboard Shortcuts**:
- `Arrow Keys` - Move selected shapes
- `Delete/Backspace` - Delete selected shapes
- `Ctrl+A` - Select all
- `Ctrl+D` - Duplicate selected
- `Escape` - Deselect all

### PropertiesPanel (`ui/PropertiesPanel.js`)
**Pattern**: Observer Pattern

Displays and edits shape properties.

**Features**:
- Single selection: Shows all properties of selected shape
- Multi-selection: Shows properties for each selected shape vertically
- Binding type switching (Value, Link to Parameter, Formula)
- Inline editing of property values

### ShapeLibrary (`ui/ShapeLibrary.js`)
**Pattern**: Factory Pattern

Displays draggable shape palette.

**Features**:
- Automatically lists all registered shape types from ShapeRegistry
- Drag-and-drop support for adding shapes to canvas

### TabBar (`ui/TabBar.js`)
**Pattern**: Observer Pattern

Tab navigation UI.

**Features**:
- Display all tabs
- Switch tabs on click
- Close tabs (X button)
- Create new tabs (+ button)
- Rename tabs (double-click)

### ZoomControls (`ui/ZoomControls.js`)
**Pattern**: Observer Pattern

Zoom control UI (bottom-right overlay).

**Features**:
- Zoom in/out buttons
- Fit to content
- Reset zoom
- Display current zoom percentage

---

## Persistence Layer

### Serializer (`persistence/Serializer.js`)
**Pattern**: Serializer Pattern

Converts application state to/from JSON.

**Features**:
- Serializes entire TabManager (all tabs + active tab)
- Includes scene names in serialized data
- Version-aware deserialization

**Key Methods**:
- `serialize(tabManager)` - Convert to JSON string
- `deserialize(json)` - Convert from JSON string to TabManager

### StorageManager (`persistence/StorageManager.js`)
**Pattern**: Observer Pattern

Manages LocalStorage persistence.

**Features**:
- Auto-save on shape/parameter changes
- Manual save/load operations
- Debounced auto-save to prevent excessive writes

### FileManager (`persistence/FileManager.js`)
**Pattern**: Adapter Pattern

Handles file import/export.

**Features**:
- Export to `.pds` file (JSON with application metadata)
- Import from `.pds` file
- Preserves all scene names and states

---

## Event System

### Event Bus Architecture

The EventBus uses a **Singleton Pattern** with **Observer Pattern** for decoupled communication.

**Event Flow Example**:
```
User clicks shape
  ↓
CanvasRenderer detects click
  ↓
ShapeStore.setSelected(id) called
  ↓
ShapeStore emits SHAPE_SELECTED event
  ↓
EventBus broadcasts to all subscribers
  ↓
PropertiesPanel receives event → Updates UI
CanvasRenderer receives event → Re-renders selection
```

**Common Event Flow Patterns**:

1. **Shape Addition**:
   ```
   DragDropManager → ShapeStore.add() 
   → SHAPE_ADDED event 
   → CanvasRenderer, PropertiesPanel update
   ```

2. **Parameter Change**:
   ```
   ParametersMenu → ParameterStore.updateValue()
   → PARAM_CHANGED event
   → All shapes with ParameterBindings re-evaluate
   → CanvasRenderer re-renders
   ```

3. **Tab Switch**:
   ```
   TabBar → TabManager.switchTab()
   → TAB_SWITCHED event
   → Application updates all UI components
   ```

---

## Data Flow

### Shape Creation Flow
```
User drags shape from library
  ↓
DragDropManager.onDrop()
  ↓
ShapeRegistry.create(type, position)
  ↓
ShapeStore.add(shape)
  ↓
SHAPE_ADDED event emitted
  ↓
CanvasRenderer re-renders
PropertiesPanel updates (if shape selected)
```

### Property Binding Flow
```
User edits property in PropertiesPanel
  ↓
PropertiesPanel.setBinding(shapeId, property, binding)
  ↓
ShapeStore.updateBinding(shapeId, property, binding)
  ↓
Shape.setBinding(property, binding)
  ↓
PARAM_CHANGED event emitted
  ↓
CanvasRenderer re-renders with new values
```

### Multi-Selection Flow
```
User Shift+clicks or drags rectangle
  ↓
CanvasRenderer updates selectedShapeIds
  ↓
ShapeStore.setSelectedIds(ids) or addToSelection(id)
  ↓
SHAPE_SELECTED event with selectedIds array
  ↓
PropertiesPanel shows multi-select UI
CanvasRenderer highlights all selected shapes
```

### Undo/Redo Flow
```
User performs action (add shape, move, etc.)
  ↓
Application.createHistorySnapshot()
  ↓
SceneState.createMemento() captures current state
  ↓
SceneHistory.push(memento)
  ↓
User presses Undo
  ↓
SceneHistory.undo() returns previous memento
  ↓
SceneState.restoreMemento(memento)
  ↓
All stores restored, UI components re-render
```

---

## Extending the Codebase

### Adding a New Shape Type

1. **Create Shape Class** (`src/models/shapes/Triangle.js`):
```javascript
import { Shape } from './Shape.js';

export class Triangle extends Shape {
    constructor(id, position, x, y, size) {
        super(id, 'triangle', position);
        this.x = x;
        this.y = y;
        this.size = size;
    }
    
    getBindableProperties() {
        return ['x', 'y', 'size'];
    }
    
    getBounds() {
        return {
            x: this.x,
            y: this.y,
            width: this.size,
            height: this.size * Math.sqrt(3) / 2
        };
    }
    
    containsPoint(x, y) {
        // Implement triangle point-in-shape logic
        return false;
    }
    
    render(ctx) {
        // Draw triangle using canvas API
        ctx.beginPath();
        ctx.moveTo(this.x + this.size / 2, this.y);
        ctx.lineTo(this.x, this.y + this.size);
        ctx.lineTo(this.x + this.size, this.y + this.size);
        ctx.closePath();
        ctx.stroke();
    }
    
    clone() {
        const tri = new Triangle(this.id, {...this.position}, this.x, this.y, this.size);
        // Copy bindings
        this.getBindableProperties().forEach(prop => {
            if (this.bindings[prop]) {
                tri.setBinding(prop, this.bindings[prop]);
            }
        });
        return tri;
    }
    
    static fromJSON(json) {
        return new Triangle(
            json.id,
            json.position || {x: 0, y: 0},
            json.x || 0,
            json.y || 0,
            json.size || 50
        );
    }
}
```

2. **Register in ShapeRegistry** (`src/models/shapes/ShapeRegistry.js`):
```javascript
import { Triangle } from './Triangle.js';

// In static initializer block:
static {
    // ... existing registrations ...
    
    this.register('triangle',
        (id, position, options) => new Triangle(
            id, position,
            options.x || position.x || 0,
            options.y || position.y || 0,
            options.size || 50
        ),
        Triangle.fromJSON
    );
}
```

That's it! The shape will automatically appear in the ShapeLibrary and be available for drag-and-drop.

### Adding a New Binding Type

1. **Create Binding Class** (`src/models/Binding.js` or new file):
```javascript
export class FunctionBinding extends Binding {
    constructor(functionName, args) {
        super('function');
        this.functionName = functionName;
        this.args = args;
    }
    
    resolve(parameterStore, expressionParser) {
        // Implement function resolution logic
        const argValues = this.args.map(arg => 
            // Resolve each argument
        );
        return this.callFunction(this.functionName, argValues);
    }
    
    toJSON() {
        return {
            type: this.type,
            functionName: this.functionName,
            args: this.args
        };
    }
}
```

2. **Register in BindingRegistry** (`src/models/BindingRegistry.js`):
```javascript
import { FunctionBinding } from './Binding.js';

// In static initializer:
static {
    // ... existing registrations ...
    
    this.register('function', (json) => {
        return new FunctionBinding(json.functionName, json.args);
    });
}
```

3. **Update PropertiesPanel** (`src/ui/PropertiesPanel.js`):
Add option to binding type selector:
```javascript
const functionOption = this.createElement('option', {
    value: 'function'
}, 'Function');
typeSelect.appendChild(functionOption);
```

### Adding a New Snap Strategy

1. **Create Strategy Class** (`src/core/SnapStrategy.js`):
```javascript
export class AngleSnap extends SnapStrategy {
    constructor(angleStep = 15) {
        super();
        this.angleStep = angleStep; // Snap to 15-degree increments
    }
    
    snap(x, y, options = {}) {
        // Implement angle-based snapping
        // ...
        return { x: snappedX, y: snappedY };
    }
}
```

2. **Use in CanvasRenderer**:
```javascript
this.setSnapStrategy(new AngleSnap(15));
```

### Adding a New Command

1. **Create Command Class** (`src/core/Command.js`):
```javascript
export class ScaleShapesCommand extends Command {
    constructor(shapeStore, shapeIds, scaleFactor) {
        super();
        this.shapeStore = shapeStore;
        this.shapeIds = shapeIds;
        this.scaleFactor = scaleFactor;
        this.originalSizes = [];
    }
    
    execute() {
        // Store original sizes
        this.originalSizes = this.shapeIds.map(id => {
            const shape = this.shapeStore.get(id);
            return { id, width: shape.width, height: shape.height };
        });
        
        // Scale shapes
        this.shapeIds.forEach(id => {
            const shape = this.shapeStore.get(id);
            shape.width *= this.scaleFactor;
            shape.height *= this.scaleFactor;
        });
    }
    
    undo() {
        // Restore original sizes
        this.originalSizes.forEach(original => {
            const shape = this.shapeStore.get(original.id);
            shape.width = original.width;
            shape.height = original.height;
        });
    }
}
```

2. **Use in CanvasRenderer**:
```javascript
const command = new ScaleShapesCommand(
    this.sceneState.shapeStore,
    Array.from(this.selectedShapeIds),
    1.5
);
command.execute();
```

---

## Key Workflows

### Application Initialization

```
main.js
  ↓
Application constructor
  ↓
Application.init()
  ↓
Get DOM elements
  ↓
Initialize TabManager (creates first tab)
  ↓
Initialize UI components:
  - TabBar
  - ShapeLibrary
  - CanvasRenderer
  - ParametersMenu
  - PropertiesPanel
  - ZoomControls
  - DragDropManager
  ↓
Create initial history snapshot
  ↓
Setup keyboard shortcuts
```

### Shape Editing Workflow

```
User selects shape
  ↓
SHAPE_SELECTED event
  ↓
PropertiesPanel displays shape properties
  ↓
User changes property binding
  ↓
Shape.setBinding(property, binding)
  ↓
PARAM_CHANGED event
  ↓
CanvasRenderer resolves bindings and re-renders
```

### Multi-Select Workflow

```
User drags selection rectangle
  ↓
CanvasRenderer.onMouseDown() starts selection
  ↓
CanvasRenderer.onMouseMove() updates rectangle
  ↓
Shapes within rectangle added to selectedShapeIds
  ↓
CanvasRenderer.onMouseUp() finalizes selection
  ↓
ShapeStore.setSelectedIds(ids)
  ↓
SHAPE_SELECTED event with selectedIds
  ↓
PropertiesPanel shows multi-select UI (all shapes listed vertically)
```

### Undo/Redo Workflow

```
User action occurs (shape added, moved, etc.)
  ↓
Application.createHistorySnapshot() (debounced)
  ↓
SceneState.createMemento()
  ↓
SceneHistory.push(memento)
  ↓
User presses Ctrl+Z
  ↓
Application.undo()
  ↓
SceneHistory.undo() returns previous memento
  ↓
SceneState.restoreMemento(memento)
  ↓
All stores reload from memento
  ↓
UI components re-render
```

### File Export/Import Workflow

**Export**:
```
User clicks Export button
  ↓
Application.exportFile()
  ↓
FileManager.exportToFile()
  ↓
Serializer.serialize(tabManager)
  ↓
Create .pds file with JSON data
  ↓
Trigger browser download
```

**Import**:
```
User clicks Import button
  ↓
File input dialog opens
  ↓
User selects .pds file
  ↓
FileManager.importFromFile()
  ↓
Read file contents
  ↓
Serializer.deserialize(json)
  ↓
TabManager.fromJSON() creates tabs
  ↓
Application switches to imported tab
  ↓
All UI components update
```

---

## Common Patterns and Conventions

### Naming Conventions

- **Classes**: PascalCase (`CanvasRenderer`, `ShapeRegistry`)
- **Methods**: camelCase (`getSelected()`, `createMemento()`)
- **Constants**: UPPER_SNAKE_CASE (`EVENTS.SHAPE_ADDED`)
- **Private fields**: `#privateField` (private class fields)
- **Files**: PascalCase for classes (`Application.js`), camelCase for utilities

### Event Naming

Events follow the pattern: `NOUN_VERB` (e.g., `SHAPE_ADDED`, `PARAM_CHANGED`)

### Error Handling

- Use descriptive error messages
- Include context (e.g., "Unknown shape type: 'triangle'. Available types: circle, rectangle")
- Log errors to console for debugging

### Extension Points

The codebase is designed for extension through:

1. **Registry Pattern**: Add new types without modifying existing code
   - `ShapeRegistry.register()`
   - `BindingRegistry.register()`

2. **Strategy Pattern**: Swap behaviors dynamically
   - `CanvasRenderer.setSnapStrategy()`
   - Binding types (Literal, Parameter, Expression)

3. **Template Method Pattern**: Override behavior in subclasses
   - `Component.render()` - Override in UI components
   - `Shape.getBindableProperties()` - Override in shape types

---

## Testing Considerations

### Key Areas to Test

1. **Registry Extensions**: Verify new types can be registered
2. **Event Flow**: Ensure events propagate correctly
3. **State Management**: Verify undo/redo restores state correctly
4. **Binding Resolution**: Test all binding types resolve correctly
5. **Multi-Selection**: Test selection and manipulation of multiple shapes

### Mocking Strategies

- **EventBus**: Can be mocked by replacing the singleton instance
- **ShapeStore**: Create isolated instances for testing
- **Canvas Context**: Mock `canvas.getContext('2d')` for rendering tests

---

## Performance Considerations

### Optimizations Implemented

1. **Render Throttling**: Uses `requestAnimationFrame` to batch renders
2. **Debounced History**: Prevents excessive undo/redo snapshots
3. **Conditional Rendering**: Skips re-renders during drag operations
4. **Direct Property Updates**: During drag, updates shape properties directly without events

### Known Performance Characteristics

- **Large Shape Counts**: Rendering performance degrades with 100+ shapes
- **Complex Expressions**: Expression evaluation can be slow with deeply nested formulas
- **History Size**: Limited to 50 snapshots to prevent memory issues

---

## Troubleshooting Guide

### Common Issues

1. **Shapes not rendering**
   - Check if `CanvasRenderer.render()` is being called
   - Verify shapes are added to `ShapeStore`
   - Check console for rendering errors

2. **Properties not updating**
   - Verify event subscription in PropertiesPanel constructor
   - Check if binding resolution is working
   - Ensure `PARAM_CHANGED` events are being emitted

3. **Multi-selection not working**
   - Verify `selectedShapeIds` is synced between CanvasRenderer and ShapeStore
   - Check `SHAPE_SELECTED` event includes `selectedIds` array

4. **Undo/Redo not working**
   - Verify `createHistorySnapshot()` is being called
   - Check if memento restoration is complete
   - Ensure UI components re-render after state restore

---

## Future Extension Ideas

### Potential Enhancements

1. **New Shape Types**: Polygon, Ellipse, Bezier curves
2. **New Binding Types**: Animation bindings, conditional bindings
3. **Snap Strategies**: Snap to guides, snap to angles
4. **Command Types**: Rotate, scale, group/ungroup
5. **UI Enhancements**: Context menus, toolbars, keyboard shortcut customization

### Extension Hooks

The architecture provides clear extension points:

- **ShapeRegistry**: Add any new shape type
- **BindingRegistry**: Add new binding strategies
- **SnapStrategy**: Add new snapping behaviors
- **Command Pattern**: Add new undoable operations
- **Component Base**: Add new UI components easily

---

## Quick Reference

### Essential Imports

```javascript
// Event system
import EventBus, { EVENTS } from '../events/EventBus.js';

// Shape operations
import { ShapeRegistry } from '../models/shapes/ShapeRegistry.js';

// Binding operations
import { BindingRegistry, createBindingFromJSON } from '../models/BindingRegistry.js';
import { LiteralBinding, ParameterBinding, ExpressionBinding } from '../models/Binding.js';

// Core services
import { TabManager } from '../core/TabManager.js';
import { SceneState } from '../core/SceneState.js';
```

### Common Event Subscriptions

```javascript
// Listen for shape selection
EventBus.subscribe(EVENTS.SHAPE_SELECTED, (payload) => {
    const { id, shape, selectedIds } = payload;
    // Handle selection
});

// Listen for parameter changes
EventBus.subscribe(EVENTS.PARAM_CHANGED, () => {
    // Re-render or update dependent UI
});

// Listen for tab switches
EventBus.subscribe(EVENTS.TAB_SWITCHED, ({ tabId, tab }) => {
    // Update UI for new tab
});
```

### Common Operations

```javascript
// Create a shape
const shape = ShapeRegistry.create('circle', { x: 100, y: 100 }, { radius: 50 });

// Create a binding
const binding = new LiteralBinding(100);
shape.setBinding('radius', binding);

// Resolve bindings
const resolvedShape = bindingResolver.resolveShape(shape);

// Register new shape type
ShapeRegistry.register('triangle', createFn, fromJSONFn);
```

---

## Conclusion

This codebase follows a clean, extensible architecture with clear separation of concerns. The Registry Pattern allows for easy extension without modifying core code, and the event-driven architecture ensures loose coupling between components.

When adding new features:
1. Identify the appropriate layer (Model, UI, Core)
2. Follow existing patterns (Registry for types, Observer for communication)
3. Ensure proper event emission for UI updates
4. Test thoroughly with multi-selection scenarios

For questions or clarifications, refer to the inline code documentation or examine existing implementations as reference examples.
