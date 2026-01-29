# Nova Otto

---

## Phase 1: Project Foundation

### 1.1 - Project Setup

```
Create a vanilla JavaScript project structure for a parametric 2D design system with no external libraries. Set up the following directory structure:

/src
  /core
  /models
  /ui
  /utils
  /events
  /persistence
/styles
  main.css
index.html

Include a basic HTML template with a canvas element and panel placeholders. Use ES6 modules.
```

---

## Phase 2: Event System

### 2.1 - Event Bus (Singleton + Observer Pattern)

```
Implement an Event Bus using the Singleton Pattern and Observer Pattern.

Create /src/events/EventBus.js with:
- Private static instance
- subscribe(eventType, callback)
- unsubscribe(eventType, callback)
- emit(eventType, payload)
- Event constants: PARAM_CHANGED, PARAM_ADDED, PARAM_REMOVED, SHAPE_ADDED, SHAPE_REMOVED, SHAPE_MOVED, SHAPE_SELECTED, TAB_SWITCHED, TAB_CREATED, TAB_CLOSED, SCENE_LOADED, SCENE_SAVED
```

---

## Phase 3: Data Models

### 3.1 - Parameter Model (Builder Pattern)

```
Create /src/models/Parameter.js:

class Parameter with id, name, value, min, max, step properties.
Methods: getValue(), setValue(newValue), toJSON(), static fromJSON(json)

Implement ParameterBuilder using Builder Pattern:
- withName(name)
- withValue(value)
- withRange(min, max)
- withStep(step)
- build()
```

### 3.2 - Binding System (Strategy Pattern + Factory Method)

```
Create /src/models/Binding.js using Strategy Pattern:

Base class Binding with abstract resolve(parameterStore) method.

Concrete implementations:
- LiteralBinding: returns literal number
- ParameterBinding: looks up parameter value by id
- ExpressionBinding: parses and evaluates expression

Include toJSON() and static fromJSON(json) using Factory Method to create appropriate type.
```

### 3.3 - Expression Parser (Interpreter Pattern + Composite Pattern)

```
Create /src/models/ExpressionParser.js using Interpreter Pattern:

class ExpressionParser with:
- parse(expression): returns AST
- evaluate(ast, context): returns number

Support: +, -, *, /, parentheses, parameter references by name, math functions (sin, cos, sqrt, abs, min, max).

AST Node types using Composite Pattern: NumberNode, ParameterRefNode, BinaryOpNode, FunctionCallNode.
```

### 3.4 - Shape Models (Template Method Pattern + Factory Pattern)

```
Create /src/models/shapes/ directory:

Base class Shape.js using Template Method Pattern:
- constructor(id, type, position)
- abstract getBindableProperties()
- resolve(parameterStore) - template method
- abstract getBounds()
- abstract containsPoint(x, y)
- abstract render(ctx)
- toJSON(), static fromJSON(json)

Implementations:
- Circle.js: bindable centerX, centerY, radius
- Rectangle.js: bindable x, y, width, height

Create ShapeFactory.js using Factory Pattern:
- static create(type, position)
- static fromJSON(json)
- static getAvailableTypes()
```

---

## Phase 4: State Management

### 4.1 - Parameter Store (Repository Pattern)

```
Create /src/core/ParameterStore.js using Repository Pattern:

class ParameterStore with:
- add(parameter)
- remove(id)
- get(id)
- getByName(name)
- getAll()
- setValue(id, value)
- toJSON(), fromJSON(json)

Emit events via EventBus on changes.
```

### 4.2 - Shape Store (Repository Pattern + Mediator Pattern)

```
Create /src/core/ShapeStore.js using Repository Pattern:

class ShapeStore with:
- constructor(parameterStore, bindingResolver)
- add(shape), remove(id), get(id), getAll()
- getResolved(): returns shapes with bindings resolved
- updatePosition(id, x, y)
- updateBinding(shapeId, property, binding)
- getSelected(), setSelected(id)
- toJSON(), fromJSON(json)

Acts as Mediator between shapes and parameter store.
```

### 4.3 - Binding Resolver (Facade Pattern)

```
Create /src/core/BindingResolver.js using Facade Pattern:

class BindingResolver with:
- constructor(parameterStore, expressionParser)
- resolveValue(binding): returns number
- resolveShape(shape): returns resolved shape
- resolveAll(shapes): batch resolve
```

### 4.4 - Scene State (Memento Pattern)

```
Create /src/core/SceneState.js using Memento Pattern:

class SceneState with:
- parameterStore, shapeStore, viewport
- createMemento()
- restoreMemento(memento)
- toJSON(), fromJSON(json)

class SceneMemento with constructor(state) and getState()

class SceneHistory with:
- constructor(maxSize)
- push(memento)
- undo(), redo()
- canUndo(), canRedo()
```

---

## Phase 5: UI Components

### 5.1 - Component Base Class (Template Method Pattern)

```
Create /src/ui/Component.js:

class Component with:
- constructor(container)
- abstract render()
- mount(), unmount()
- subscribe(eventType, callback)
- emit(eventType, payload)
```

### 5.2 - Canvas Renderer (Observer Pattern)

```
Create /src/ui/CanvasRenderer.js extending Component:

class CanvasRenderer with:
- constructor(canvasElement, sceneState, bindingResolver)
- render(), renderGrid(), renderShapes(), renderSelection(), renderDragPreview(shape, x, y)
- pan(dx, dy), zoom(factor, centerX, centerY)
- screenToWorld(x, y), worldToScreen(x, y)
- hitTest(x, y)
- onMouseDown(e), onMouseMove(e), onMouseUp(e), onWheel(e)

Subscribe to SHAPE_ADDED, SHAPE_REMOVED, SHAPE_MOVED, PARAM_CHANGED for re-render.
```

### 5.3 - Shape Library Panel (Factory Pattern)

```
Create /src/ui/ShapeLibrary.js extending Component:

class ShapeLibrary with:
- constructor(container, shapeFactory)
- render(): creates draggable shape items
- createShapeItem(type)
- onDragStart(e, shapeType), onDragEnd(e)

Use native HTML5 drag/drop API. Set dataTransfer with shape type.
```

### 5.4 - Parameters Menu (Observer Pattern)

```
Create /src/ui/ParametersMenu.js extending Component:

class ParametersMenu with:
- constructor(container, parameterStore)
- render(), renderParameter(parameter)
- addParameter(), editParameter(id), deleteParameter(id)
- onValueChange(id, value), onNameChange(id, name)

Display: name input, value input, min/max fields, delete button.
Subscribe to PARAM_ADDED, PARAM_REMOVED, PARAM_CHANGED.
```

### 5.5 - Properties Panel (Observer Pattern + Strategy Pattern)

```
Create /src/ui/PropertiesPanel.js extending Component:

class PropertiesPanel with:
- constructor(container, shapeStore, parameterStore)
- render(), renderEmpty(), renderProperties(shape)
- renderBindingEditor(property, currentBinding)
- setBinding(shapeId, property, binding)
- renderLiteralInput(property, value)
- renderParameterDropdown(property, selectedParamId)
- renderExpressionInput(property, expression)

Allow binding type selection: literal, parameter reference, expression.
Subscribe to SHAPE_SELECTED.
```

---

## Phase 6: Drag and Drop

### 6.1 - Drag Drop Manager (Mediator Pattern)

```
Create /src/core/DragDropManager.js using Mediator Pattern:

class DragDropManager with:
- constructor(canvas, shapeStore, shapeFactory)
- isDragging, draggedShapeType, dragPreviewPosition
- setupDropTarget()
- onDragOver(e), onDragEnter(e), onDragLeave(e), onDrop(e)
- updatePreview(x, y), clearPreview()

On drop, create new shape at position using ShapeFactory.
```

---

## Phase 7: Tab System

### 7.1 - Tab Manager (Observer Pattern + Factory Method)

```
Create /src/core/TabManager.js:

class Tab with id, name, sceneState properties.

class TabManager with:
- tabs array, activeTabId
- createTab(name), closeTab(id), switchTab(id), renameTab(id, name)
- getActiveTab(), getActiveScene()
- toJSON(), fromJSON(json)

Emit TAB_CREATED, TAB_CLOSED, TAB_SWITCHED events.
```

### 7.2 - Tab Bar UI (Observer Pattern)

```
Create /src/ui/TabBar.js extending Component:

class TabBar with:
- constructor(container, tabManager)
- render(), renderTab(tab, isActive), renderNewTabButton()
- onTabClick(id), onTabClose(id), onNewTab(), onTabDoubleClick(id)

Features: active indicator, close button, new tab button, double-click rename.
Subscribe to TAB_CREATED, TAB_CLOSED, TAB_SWITCHED.
```

---

## Phase 8: Persistence

### 8.1 - Serializer (Serializer Pattern)

```
Create /src/persistence/Serializer.js:

class Serializer with static methods:
- serialize(tabManager): returns JSON string
- deserialize(json): returns TabManager
- serializeTab(tab), deserializeTab(json)
- serializeSceneState(sceneState), deserializeSceneState(json)

File format .pds: { version, activeTab, tabs: [{ id, name, parameters, shapes, viewport }] }
```

### 8.2 - Storage Manager (Observer Pattern)

```
Create /src/persistence/StorageManager.js:

class StorageManager with:
- static AUTOSAVE_KEY, AUTOSAVE_INTERVAL
- constructor(tabManager, serializer)
- startAutoSave(), stopAutoSave(), autoSave()
- save(), load(), clear(), hasAutoSave()
```

### 8.3 - File Manager (Adapter Pattern)

```
Create /src/persistence/FileManager.js:

class FileManager with:
- constructor(tabManager, serializer)
- exportToFile(filename): triggers .pds download
- importFromFile(file): returns Promise
- showImportDialog()
- createDownload(content, filename)
- readFile(file): returns Promise<string>
```

---

## Phase 9: Application Bootstrap

### 9.1 - Application Class (Facade Pattern + Dependency Injection)

```
Create /src/core/Application.js using Facade Pattern:

class Application with:
- eventBus, tabManager, storageManager, fileManager
- canvasRenderer, shapeLibrary, parametersMenu, propertiesPanel, tabBar
- init(), setupEventListeners(), setupKeyboardShortcuts(), loadInitialState()
- newTab(), save(), load(), exportFile(), importFile(), undo(), redo()

Keyboard shortcuts: Ctrl+S save, Ctrl+O open, Ctrl+Z undo, Ctrl+Y redo, Ctrl+T new tab, Delete remove shape.
```

### 9.2 - Main Entry Point

```
Create /src/main.js:

Import Application, instantiate on DOMContentLoaded, call init().

Update index.html with proper structure: tab bar container, left panel, canvas container, right panel. Import main.js as module.
```

---

## Phase 10: Styling

### 10.1 - CSS Styles

```
Create /styles/main.css:

Layout: full viewport, 40px tab bar top, three columns below (200px left, flexible center, 280px right).

Style: tab bar with active state, panel headers, draggable shape items, parameter inputs, property editors, buttons.

Use CSS custom properties: --bg-primary, --bg-secondary, --text-primary, --border-color, --accent-color.

Canvas: fill space, cursor changes for tools.
```

---

## Phase 11: Enhancements

### 11.1 - Multi-Selection (Command Pattern)

```
Enhance CanvasRenderer:

Add selection rectangle for multi-select. Track selectedShapeIds array.
Implement shift-click to add to selection.
Implement Command Pattern for batch operations on selected shapes.
```

### 11.2 - Keyboard Navigation

```
Add keyboard support:

Arrow keys: move selected shape(s)
Ctrl+A: select all
Escape: deselect all
Ctrl+D: duplicate selected
Ctrl+G: group selected (optional)
```

### 11.3 - Snap to Grid (Strategy Pattern)

```
Implement grid snapping using Strategy Pattern:

class SnapStrategy with snap(x, y) method.
Implementations: NoSnap, GridSnap, ShapeSnap.
Toggle via UI or keyboard shortcut.
```

### 11.4 - Zoom Controls

```
Add zoom UI controls:

Zoom in/out buttons, zoom percentage display, fit to content button, reset zoom button.
Mouse wheel zoom centered on cursor position.
```
