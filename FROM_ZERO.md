# From Zero (FabAcademy-style): Rebuilding Otto v2 / “Nova Otto” from an Empty Folder

This is a **build-from-scratch handbook** for re-implementing Otto v2 end-to-end. It is intentionally written like a FabAcademy documentation page: clear goals, repeatable steps, verification checklists, and “what went wrong / how I fixed it” notes.

If you only want to *use* Otto, start at **Quickstart (run the app)**.  
If you want to *rebuild* Otto, follow the **Milestones** in order.

**Authoritative references in this repo**

- `src/ARCHITECTURE.md`: deep diagrams + module relationships
- `src/main.js`: browser bootstrap and global exports
- `src/core/Application.js`: the “Facade” wiring everything together

---

## What you are building (end result)

Otto is a parametric 2D design system running entirely in the browser:

- **Canvas editor** with a grid, pan/zoom, selection, drag, resize, rotate, and a free-draw Path tool.
- **Shape library** (Circle, Rectangle, Polygon, Gear, Path, etc.) with a Shape registry.
- **Parameters** (sliders) and **Bindings** that connect shape properties to parameters or expressions.
- **Undo/Redo** (memento snapshots) + **autosave** to localStorage.
- **Import/Export** scene data as `.pds` files.
- **Multi-tab scenes** (each tab has its own independent scene state).
- **Edge selection + joinery metadata** (for fabrication workflows): Select individual edges of shapes and attach joinery metadata (finger joints, dovetails, etc.) for CNC/fabrication workflows.
- **Programming language**: Code editor runner + interpreter (and blocks editor sync) for generating parameters and shapes programmatically.
- **3D assembly view**: Extrude 2D parts into 3D meshes (Three.js) with perfect SVG-to-3D transfer, preserving smooth curves and exact geometry.
- **Plugin system**: Load and activate plugins that register new shapes, bindings, and commands to extend the system.

---

## Non-goals (to keep your rebuild sane)

To finish a from-scratch rebuild, avoid these until the end:

- Real-time collaboration
- Production security sandbox for code execution
- Rendering thousands of complex shapes at 60fps
- A fully general CAD kernel (Otto’s geometry is “good enough for parametric drawing”, not a full CAD)

---

## How to use this document

This guide is structured as a ladder:

- **Milestone**: a functional slice of the system
- **Deliverables**: files/modules you must create
- **Verification**: how you confirm it works *before* continuing
- **Troubleshooting**: common failure modes

Keep a “build log” as you go. After each milestone, write:

- What you implemented
- One screenshot (or a note of expected UI)
- One bug you hit and how you fixed it

---

## Quickstart (run the app in this repo)

Otto uses native ES Modules (`<script type="module">`) and dynamic imports in a few places. **You must run it from a local server**, not via `file://`.

### Start a local server

Choose one:

```bash
# Python 3
cd /path/to/Otto-v2
python3 -m http.server 5173
```

```bash
# Node (if you have it)
cd /path/to/Otto-v2
npx --yes serve .
```

Then open:

- Editor: `http://localhost:5173/index.html`
- Assembly view: `http://localhost:5173/assemble.html`
- Geometry tests: `http://localhost:5173/src/geometry/tests/run-tests.html`
- Shape integration tests: `http://localhost:5173/src/models/shapes/tests/run-tests.html`

### What “success” looks like

- DevTools console prints “Nova Otto - Parametric 2D Design System”
- You can drag a shape from the left library onto the canvas
- Autosave works (refresh restores your work)

---

## Core mental model (3 layers + 1 nervous system)

Think in layers:

- **Core layer** (`src/core/`): state + business rules (stores, history, commands, tabs)
- **Model layer** (`src/models/`): shapes, parameters, binding strategies, expression parsing
- **UI layer** (`src/ui/`): DOM components + canvas renderer (interaction + drawing)
- **Infrastructure** (`src/persistence/`, `src/plugins/`, `src/events/`): persistence, plugins, event bus

The glue is a single global **EventBus** (pub/sub). The core emits events; the UI listens and re-renders.

---

## Glossary (you’ll see these words constantly)

- **Scene**: everything inside a tab: parameters + shapes + viewport + edge joinery.
- **Tab**: a named container that owns one SceneState.
- **Store**: a repository class that owns mutable state (ShapeStore, ParameterStore).
- **Binding**: a strategy object that resolves to a number (literal / parameter / expression / processed).
- **Resolver**: a façade that evaluates bindings and resolves shapes each frame (BindingResolver).
- **Resolved shape**: a clone of a shape where bound properties are replaced with current numeric values.
- **Memento**: an immutable snapshot of SceneState for undo/redo.

---

## Milestone roadmap (fastest path to “full Otto”)

Build in this order. Don’t skip verification.

1. **M0**: Project scaffolding + local dev server
2. **M1**: Event system (EventBus + events catalog)
3. **M2**: Data model (Parameter, Shape base class) + Binding strategies + ExpressionParser
4. **M3**: Core state container (SceneState) + stores (ParameterStore, ShapeStore) + resolver (BindingResolver)
5. **M4**: Shape system MVP (Circle/Rectangle/Line) + ShapeRegistry + serialization hooks
6. **M5**: CanvasRenderer MVP (render loop + hit test + select + drag + pan/zoom)
7. **M6**: UI MVP (ShapeLibrary + ParametersMenu + PropertiesPanel)
8. **M7**: Undo/Redo (mementos) + Command pattern for moves/duplicates
9. **M8**: Persistence (Serializer + StorageManager + FileManager) + import/export `.pds`
10. **M9**: Multi-tab scenes (TabManager + TabBar) and scene switching
11. **M10**: Edge selection + joinery metadata + joinery UI (fabrication workflows)
12. **M11**: Programming language (Lexer/Parser/Interpreter + CodeRunner) + CodeEditor/BlocksEditor sync
13. **M12**: 3D assembly view (Three.js extrude + layout + drag/orbit with universal SVG-to-3D converter)
14. **M13**: Plugins (PluginManager + PluginAPI) + example plugin

---

## M0 — Scaffolding (empty folder → “it loads”)

### Goal

Serve an `index.html` that can import ES modules from `src/`.

### Deliverables

- `index.html`
- `src/main.js` (a bootstrap that prints a console line)
- `styles/main.css` (can be empty at first)

### Minimal `index.html`

Key points:

- Use `<script type="module">`
- Avoid bundlers at first; keep the graph simple

### Verification

- Open `http://localhost:5173/index.html`
- Console shows your log line from `src/main.js`

### Troubleshooting

- If you get `CORS` or `Failed to fetch dynamically imported module`: you are using `file://` or a misconfigured server.

---

## M1 — Event system (Observer + Singleton)

### Goal

Create a global pub/sub bus used by every subsystem.

### Deliverables

- `src/events/EventBus.js` exporting a singleton instance (or default singleton-like export)
- A single catalog of event names (this repo uses `EventBus.EVENTS` as a static field)

### Contract you must support

- `subscribe(eventType, cb) -> unsubscribeFn`
- `emit(eventType, payload)`

### Verification checklist

- Subscribe to an event, emit it, verify callback fires
- Subscribe two callbacks, ensure both fire even if one throws (error isolation)

### Common mistakes

- Using arrays instead of sets → duplicate callbacks
- Letting one callback throw and stopping the rest → always try/catch per subscriber

---

## M2 — Parameters + Bindings + Expressions (the parametric heart)

### Goal

Parameters exist, and a shape property can be “driven” by:

- a literal number
- a parameter by ID
- an expression string referencing parameter **names**

### Deliverables

- `src/models/Parameter.js` (a `Parameter` class + builder is nice)
- `src/models/Binding.js` with strategies:
  - `LiteralBinding`
  - `ParameterBinding`
  - `ExpressionBinding`
- `src/models/ExpressionParser.js` that parses and evaluates expression strings into numbers

### Design notes (match the repo)

- Parameters are stored by **ID** in `ParameterStore`, but expressions reference parameters by **name**.
- `ExpressionBinding` should cache its AST after first parse (performance).
- When a parameter is missing, bindings should degrade gracefully (log + return 0) instead of crashing the app.

### Verification

- Create two parameters: `w=10`, `h=5`
- Expression `w * 2 + h` resolves to 25
- Delete `h` → expression resolves using 0 for missing var (and logs a warning)

---

## M3 — SceneState + Stores + BindingResolver (core state)

### Goal

Build a “scene container” that wires dependencies in the correct order and exposes the canonical stores.

### Deliverables

- `src/core/ParameterStore.js` (Repository Pattern; emits events)
- `src/core/ShapeStore.js` (Repository Pattern; selection; emits events)
- `src/core/BindingResolver.js` (Facade over binding evaluation)
- `src/core/SceneState.js` (Originator in Memento Pattern)

### Critical wiring order (this matters)

Match the real dependency chain:

1. `ParameterStore`
2. `ExpressionParser`
3. `BindingResolver(parameterStore, expressionParser)`
4. `ShapeStore(parameterStore, bindingResolver)`

### Shape resolution model (Template Method)

The key design choice:

- Store holds **raw shapes** (may contain bindings).
- Rendering uses **resolved clones** (bindings replaced with numbers).

In this repo, the Template Method lives on `Shape.resolve()` (in `src/models/shapes/Shape.js`).

### Verification

- Add a shape whose `radius` is bound to a parameter
- Changing the parameter triggers a render (later, after you have CanvasRenderer)

### Troubleshooting

- If you resolve bindings by mutating the live shape in the store, you’ll lose the binding relationship and undo/redo becomes painful. Always resolve into a clone.

---

## M4 — Shapes + Registry + Serialization hooks

### Goal

Create a few shapes, render them, hit-test them, and round-trip them through JSON.

### Deliverables

- `src/models/shapes/Shape.js` (abstract base; Template Method `resolve`)
- Concrete shapes: `Circle`, `Rectangle`, `Line` (start with these)
- `src/models/shapes/ShapeRegistry.js` (Registry Pattern)
- `src/models/BindingRegistry.js` (a factory that can rebuild Binding instances from JSON)

### Minimum shape interface

Every shape must implement:

- `getBindableProperties(): string[]`
- `getBounds(): {x,y,width,height}`
- `containsPoint(x,y): boolean`
- `render(ctx): void`
- `clone(): Shape`
- `toJSON(): object`

### JSON rules (practical)

- Always serialize:
  - `id`, `type`, `position` (even if “legacy”)
  - literal values for bindable properties *unless they’re bound*
  - `bindings` for bound properties (by binding’s own `toJSON()`)
- During load:
  - create the shape via ShapeRegistry (type → factory)
  - rebuild bindings via BindingRegistry

### Verification

- Create a circle, serialize, deserialize, ensure it renders identically.

---

## Interlude — Rebuilding the Geometry library (required for “full Otto”)

If you want a full rebuild (not just a toy editor), you need a geometry layer. In this repo that layer lives in `src/geometry/` and is a small geometry toolkit (inspired by/ported from “cuttle-geometry”).

You *can* build an MVP without it by rendering primitives directly with Canvas APIs, but you will eventually want:

- consistent bounds + hit testing
- path operations for complex shapes
- SVG import/export helpers
- edge enumeration and hit testing (for joinery)

### Geometry build order (matches the in-browser test harness)

The test runner `src/geometry/tests/run-tests.html` executes modules in “phases”. Rebuilding in this order keeps dependencies simple:

#### Phase 1: Foundation

- `src/geometry/constants.js`
  - numeric epsilons, tolerances, default values
- `src/geometry/math.js`
  - clamp/lerp/trig helpers; stable float comparisons
- `src/geometry/util.js`
  - small list/iterator helpers (`pairs`, `rotateArray`, etc.)

**Verify**: open `src/geometry/tests/run-tests.html` and confirm these pass.

#### Phase 2: Core primitives

- `src/geometry/Vec.js`
  - immutable-ish vector object with add/sub/scale/dot/len/normalize
- `src/geometry/Matrix.js`
  - affine matrix utilities (translate/scale/rotate/multiply/apply)

**Why now**: everything else (paths, bounds, hit testing) builds on Vec + Matrix.

#### Phase 3: Support types

- `src/geometry/BoundingBox.js`
  - AABB operations: union/intersect/containsPoint/expand
- `src/geometry/Color.js`
  - RGBA representation + CSS output
- `src/geometry/Style.js`
  - Stroke/Fill definitions; alignment, caps/joins, hairline rules

#### Phase 4: Geometry base

- `src/geometry/Geometry.js`
  - shared base: affine transforms, export helpers, cloning hooks
- `src/geometry/Anchor.js`
  - path anchor + handle-in/handle-out, transformable

#### Phase 5: Curve mathematics

- `src/geometry/bezier.js`
  - cubic math: point at t, split at t, approximate length
- `src/geometry/Segment.js`
  - segment-level operations, intersections, closest point computations

#### Phase 6: Path system

- `src/geometry/Path.js`
  - list of Anchors + closed flag + segment iteration
  - conversion to Canvas path (`toCanvasPath`)
  - bounds, length, closest point queries

**Important dependency**: `Path` optionally uses `pathkit.js` for tight bounding boxes.

#### Phase 7: Complex geometry

- `src/geometry/Shape.js`
  - geometry-shape representation (distinct from `src/models/shapes/Shape.js`)
- `src/geometry/Group.js`
  - collections of geometry shapes/paths
- `src/geometry/Axis.js`
  - helper for axis-aligned geometry / guides

#### Phase 8: I/O & rendering helpers

- `src/geometry/canvas.js`
  - `styleContainsPoint(geom, point)` for robust hit testing using Canvas rasterization
  - `paintToCanvas(item, ctx)` to draw with style rules
- `src/geometry/svg.js`
  - path/shape → SVG string output; (optionally) SVG parsing helpers
- `src/geometry/units.js`
  - unit conversion factors for SVG import/export
- `src/geometry/random.js` (+ `seedrandom.js` if needed)
  - deterministic random utilities (for demos / tests)

#### Phase 9: PathKit stub

- `src/geometry/pathkit.js`
  - optional integration point for PathKit (high-performance path ops)
  - in this repo it’s structured so geometry works even without PathKit loaded

#### Phase 10: Entry point

- `src/geometry/index.js`
  - exports everything and provides `initCuttleGeometry()` to wire PathKit if present

### Geometry verification checklist

- [ ] `run-tests.html` shows “All tests passed!”
- [ ] `styleContainsPoint()` returns true for a point inside a filled shape
- [ ] `Path.tightBoundingBox()` works with and without PathKit available

### Common geometry pitfalls

- **NaNs spread fast**: clamp inputs and validate early; tests should include degenerate cases.
- **Hit testing depends on style**: a path with no visible stroke/fill should not “hit”.
- **Units**: SVG `px` is not the same as your world “mm-like” units; treat conversions explicitly.

---

## M5 — CanvasRenderer MVP (render + interact)

### Goal

Render shapes, select them, drag them, and pan/zoom the world.

### Deliverables

- `src/ui/Component.js` (optional base class)
- `src/ui/CanvasRenderer.js`
- Viewport math utilities (world ↔ screen transforms)

### Coordinate system (do this early)

Define:

- **World coordinates**: the “design space” (mm-like units)
- **Screen coordinates**: pixels relative to canvas in CSS pixels
- **Viewport**: `{ x, y, zoom }` meaning “top-left world coordinate” + zoom factor

HiDPI rule:

- `canvas.width/height = cssSize * devicePixelRatio`
- then scale context by `devicePixelRatio`

### Render loop

Use `requestAnimationFrame` and coalesce events:

- stores emit events → renderer sets a `needsRender` flag → schedules one frame

### Hit testing strategy (start simple)

Start with:

- AABB bounds hit test (fast reject)
- Then `shape.containsPoint(x,y)` (exact)

### Verification

- Drag a rectangle smoothly
- Zoom with wheel around cursor
- Pan with right-drag (or spacebar-drag, your choice)

### Troubleshooting

- If everything is blurry: you forgot devicePixelRatio scaling.
- If drag direction feels reversed: you mixed world and screen coords.

---

## M6 — UI MVP (library + properties + parameters)

### Goal

Make a usable editor:

- drag shapes from palette
- select on canvas
- edit properties in a panel
- add parameters and bind properties to parameters

### Deliverables

- `src/ui/ShapeLibrary.js` (drag sources)
- `src/core/DragDropManager.js` (drop handling + shape creation)
- `src/ui/ParametersMenu.js` (CRUD parameters)
- `src/ui/PropertiesPanel.js` (show selected shape properties; bind/unbind)

### Binding UX (a practical minimum)

For each numeric property show:

- numeric input (literal)
- “bind” dropdown listing parameters
- “expression” field (optional)

### Verification

- Create parameter `size`
- Bind circle radius to `size`
- Move slider → circle updates

---

## M7 — Undo/Redo (Memento + Command)

### Goal

Undo/redo across:

- adding/removing shapes
- moving/resizing/rotating
- parameter changes

### Two complementary approaches

Otto uses both patterns:

- **Memento** snapshots of SceneState (robust, simple)
- **Command** objects for specific interactions (good UX for drags, duplicates)

Minimum viable undo/redo: **mementos only**.

### Snapshot strategy

- On “committed” events (mouseup, edit confirm), push a snapshot
- Debounce snapshot creation during drags (avoid 1000 snapshots)

### Verification

- Add shape → move it → change parameter
- Undo step-by-step, redo step-by-step

---

## M8 — Persistence (Serializer + Autosave + Import/Export)

### Goal

Persist everything important:

- all tabs
- all shapes + bindings
- parameters
- edge joinery (if you add it)
- viewport
- selected shape

### Deliverables

- `src/persistence/Serializer.js` (static utility, versioned)
- `src/persistence/StorageManager.js` (autosave localStorage; observer of events)
- `src/persistence/FileManager.js` (export `.pds`, import `.pds`)

### Practical notes (match the repo)

- Serializer payload shape:
  - `{ version, activeTab, tabs: [...] }`
- Use dynamic imports during deserialize to avoid circular deps.
- Autosave key: a stable string (repo uses `nova_otto_autosave`)

### Verification

- Create a scene, refresh, verify it restores
- Export `.pds`, clear storage, import `.pds`, verify it restores

---

## M9 — Tabs (multi-scene state)

### Goal

Multiple independent scenes; switching tabs swaps scene state everywhere.

### Deliverables

- `src/core/TabManager.js` (Factory Method + emits events)
- `src/ui/TabBar.js` (UI)
- Update `Application` wiring so all UI components are updated on tab switch

### Rules (match repo behavior)

- Never allow closing the last tab
- Creating a new tab does not necessarily switch to it (repo keeps current active tab)
- Closing an active tab auto-switches to adjacent tab

### Verification

- Tab A: add circle
- Tab B: add rectangle
- Switch tabs: canvas + parameters swap correctly

---

## M10 — Edge selection + joinery (fabrication workflows)

### Goal

Enable fabrication workflows by allowing users to select individual edges of shapes and attach joinery metadata (finger joints, dovetails, etc.). This is essential for CNC routing, laser cutting, and other fabrication processes where parts need to connect together.

### Why This Is Required

Without edge joinery, Otto is just a drawing tool. With joinery, it becomes a fabrication design system where:
- Users can design parts that physically connect
- The 3D assembly view can show how parts fit together
- Export formats can include joinery information for CAM software
- The system supports real-world manufacturing workflows

### Deliverables

- `src/geometry/edge/` helpers:
  - `EdgeHitTester.js`: Hit testing for individual edges of shapes
    - Enumerates edges from geometry paths
    - Tests point-in-edge proximity
    - Returns edge identifiers (shapeId + edgeIndex)
  - `EdgeSelection.js`: Selection bookkeeping
    - Tracks selected edges per shape
    - Manages selection mode (`'shape' | 'edge'`)
    - Emits selection change events
  - `EdgeRenderer.js`: Overlay rendering for hover/selected visuals
    - Draws edge highlights on canvas
    - Shows joinery indicators
- Extend `ShapeStore` to:
  - maintain selection mode: `'shape' | 'edge'`
  - persist `edgeJoinery` map: `Map<edgeId, JoineryMetadata>` across save/load
  - emit events when joinery is added/removed
- `src/ui/EdgeJoineryMenu.js`: Context menu for edge joinery
  - Shows when an edge is selected
  - Allows selecting joinery type (finger joint, dovetail, etc.)
  - Configures joinery parameters (finger count, thickness, etc.)
- `src/core/JoineryMetadata.js`: Data structure for joinery
  - Type: `'finger_male' | 'finger_female' | 'dovetail_male' | 'dovetail_female' | ...`
  - Parameters: `fingerCount`, `thicknessMm`, `depthMm`, etc.

### Implementation Details

**Edge Enumeration:**
1. For each shape, get its geometry path via `toGeometryPath()`
2. Iterate path anchors to create edge segments
3. Each edge is identified by `(shapeId, anchorIndex1, anchorIndex2)`
4. Store edges in a spatial index for fast hit testing

**Hit Testing:**
- Convert mouse position to world coordinates
- Test proximity to each edge segment (within threshold, e.g., 10px)
- Return closest edge if within threshold

**Joinery Metadata:**
- Stored per edge in `ShapeStore.edgeJoinery` map
- Key format: `${shapeId}_${edgeIndex}`
- Value: `{ type, fingerCount, thicknessMm, depthMm, ... }`
- Serialized in scene JSON for persistence

**Visual Feedback:**
- Hover: Highlight edge in blue
- Selected: Highlight edge in yellow
- With joinery: Show joinery icon/indicator on edge

### Verification

- Toggle to edge mode (button in toolbar or keyboard shortcut)
- Hover an edge and see highlight
- Click to select an edge
- Right-click or use menu to assign joinery type
- Configure joinery parameters (finger count, thickness)
- Save scene and reload: joinery data persists
- Switch to assembly view: joinery appears in 3D (male tabs, female holes)

### Troubleshooting

- **Edges not detecting**: Check edge hit test threshold (may be too small)
- **Joinery not showing in 3D**: Verify `AssemblyPieceFactory` reads joinery metadata
- **Selection mode not switching**: Check `ShapeStore.selectionMode` is being updated

---

## M11 — Programming language + editors (programmatic design)

### Goal

Enable programmatic design by supporting a text-based programming language that can generate parameters and shapes from code. This allows users to create parametric designs algorithmically, generate patterns, iterate on designs, and create reusable design templates.

### Why This Is Required

The programming language is essential for:
- **Parametric design**: Create designs that respond to variables and calculations
- **Pattern generation**: Generate arrays, grids, and complex patterns programmatically
- **Design iteration**: Quickly test variations by changing code
- **Reusability**: Share design code as templates
- **Educational value**: Teach programming through design
- **Advanced workflows**: Complex designs that would be tedious to create manually

### Deliverables

- `src/programming/`:
  - `Lexer.js`: Tokenizes source code into tokens
    - Keywords: `let`, `const`, `function`, `if`, `for`, `return`, etc.
    - Operators: `+`, `-`, `*`, `/`, `==`, `!=`, `<`, `>`, etc.
    - Literals: numbers, strings
    - Identifiers: variable/function names
  - `Parser.js`: Parses tokens into Abstract Syntax Tree (AST)
    - Expression parsing (arithmetic, function calls, member access)
    - Statement parsing (variable declarations, assignments, conditionals, loops)
    - Function definition parsing
    - Error reporting with line numbers
  - `Interpreter.js`: Executes AST (Visitor pattern)
    - Variable scope management (global + function scopes)
    - Expression evaluation
    - Statement execution
    - Built-in functions: `circle()`, `rectangle()`, `parameter()`, `sin()`, `cos()`, etc.
  - `CodeRunner.js`: Bridges interpreter output → ShapeStore/ParameterStore
    - Executes code in isolated context
    - Creates/updates parameters from `parameter()` calls
    - Creates/updates shapes from shape constructor calls
    - Handles errors gracefully (logs, doesn't crash app)
- `src/ui/CodeEditor.js`: Code editor UI (CodeMirror integration)
  - Syntax highlighting
  - Line numbers
  - Error markers
  - Run button
  - Auto-format (optional)
- `src/ui/BlocksEditor.js`: Visual blocks editor (Blockly integration)
  - Drag-and-drop blocks for visual programming
  - Generates code from blocks
  - Syncs with code editor (bidirectional)
- `src/ui/EditorSyncConnector.js`: Mediator to prevent sync loops
  - Tracks which editor last changed
  - Prevents infinite sync between code and blocks editors
  - Debounces sync operations

### Language Features

**Basic Syntax:**
```javascript
// Variables
let width = 50;
let height = width * 2;

// Parameters
parameter("size", 10, 100, 50);

// Shapes
circle(0, 0, size);
rectangle(-width/2, -height/2, width, height);

// Functions
function makeGrid(count) {
  for (let i = 0; i < count; i++) {
    circle(i * 20, 0, 5);
  }
}
```

**Built-in Functions:**
- Shape constructors: `circle(x, y, r)`, `rectangle(x, y, w, h)`, `polygon(x, y, r, sides)`, etc.
- Parameter creation: `parameter(name, min, max, value)`
- Math: `sin()`, `cos()`, `tan()`, `sqrt()`, `abs()`, `min()`, `max()`, `random()`
- Utility: `map(value, inMin, inMax, outMin, outMax)`

### Implementation Details

**Lexer:**
- Reads source code character by character
- Identifies tokens using regex patterns
- Handles whitespace, comments, string literals
- Returns array of tokens with type and value

**Parser:**
- Recursive descent parser
- Builds AST nodes (Expression, Statement, etc.)
- Handles operator precedence
- Reports syntax errors with position

**Interpreter:**
- Visitor pattern: each AST node type has a visit method
- Maintains execution context (variables, functions)
- Evaluates expressions bottom-up
- Executes statements sequentially
- Returns last expression value (if any)

**CodeRunner Integration:**
- Creates a new interpreter instance per run
- Registers built-in functions that interact with ShapeStore/ParameterStore
- On `parameter()` call: creates/updates parameter in ParameterStore
- On shape constructor call: creates/updates shape in ShapeStore
- Clears previous run's shapes (or merges, depending on strategy)

### Verification

- Write code that defines a parameter: `parameter("radius", 5, 50, 20)`
- Run code → parameter appears in ParametersMenu
- Write code that creates a circle: `circle(0, 0, radius)`
- Run code → circle appears on canvas
- Change parameter value in UI → circle updates (binding works)
- Re-run code with different value: `parameter("radius", 5, 50, 30)`
- Parameter updates, circle updates
- Write a loop to create multiple shapes
- Run code → multiple shapes appear
- Switch between code editor and blocks editor
- Changes sync correctly (no infinite loops)

### Safety note

This is **not** a hardened sandbox. The interpreter runs in the same context as the app. Treat it as a learning/prototyping feature. For production use, consider:
- Sandboxing with Web Workers
- Whitelisting allowed functions
- Timeout mechanisms
- Resource limits

---

## M12 — 3D Assembly view (fabrication visualization)

### Goal

Extrude 2D shapes into 3D meshes and lay them out on a plane for visualization and fabrication planning. **Perfect transfer** from 2D SVG definitions to 3D extrusions, preserving exact geometry including smooth curves.

### Why This Is Required

The 3D assembly view is essential for:
- **Visualization**: See how 2D parts will look as 3D objects
- **Fabrication planning**: Understand part relationships before cutting
- **Joinery verification**: See how parts with joinery fit together
- **Layout optimization**: Arrange parts efficiently on material sheets
- **Export preparation**: Verify geometry before sending to CAM software
- **Design validation**: Catch design issues before fabrication

### Deliverables

- `assemble.html`: Standalone page with Three.js importmap
  - Imports Three.js via ES modules
  - Initializes AssemblyApp
  - Provides canvas for 3D rendering
- `src/assembly/`:
  - `AssemblyDataLoader.js`: Loads autosave JSON from localStorage
    - Reads `nova_otto_autosave` key
    - Extracts active tab's scene data
    - Normalizes shape data (adds defaults for missing properties)
    - Returns scene state for assembly
  - `AssemblyPieceFactory.js`: Core factory for 3D mesh creation
    - **Universal converter** (`shapeToThreeShape()`):
      - Uses each shape's `toGeometryPath()` to get exact SVG path definition
      - Extracts geometry path anchors with Bezier handles (handleIn/handleOut as Vec objects)
      - Converts anchors to THREE.js Shape commands:
        - If handles are non-zero → `bezierCurveTo(cp1, cp2, end)` for smooth curves
        - Otherwise → `lineTo(end)` for straight segments
      - Automatically centers shapes based on bounding box for proper 3D positioning
      - Closes open paths for extrusion (required for 3D)
      - Returns THREE.js Shape ready for extrusion
    - `buildGeometry()`: Extrudes shapes with thickness
      - Creates THREE.ExtrudeGeometry from THREE.js Shape
      - Applies thickness (default 3mm)
      - Rotates geometry for proper orientation (X-axis rotation)
      - Handles special cases (rectangles with joinery, donut holes)
    - `createPiece()`: Creates complete 3D mesh
      - Builds geometry
      - Creates material (wood-like color, roughness, metalness)
      - Adds outline edges for visual clarity
      - Sets up shadow casting/receiving
  - `AssemblyScene.js` / `AssemblySceneBuilder.js`: Builds Three.js scene
    - Creates scene, camera, lights (ambient + directional)
    - Creates desktop plane with wood texture
    - Sets up shadows
    - Returns configured scene for rendering
  - `AssemblyLayout.js`: Positions pieces on plane
    - `GridLayoutStrategy`: Lays out pieces in grid with spacing
    - Centers layout around origin
    - Prevents overlaps
    - Returns positioned meshes
  - `AssemblyInteraction.js`: User interaction
    - `OrbitControls`: Camera orbit/pan/zoom
    - `DragControls`: Drag pieces on plane
    - Constrains dragging to plane surface
  - `AssemblyJoinery.js`: Joinery visualization
    - Reads joinery metadata from shapes
    - Creates male tabs as separate meshes
    - Creates female holes in extruded geometry
    - Visualizes joinery relationships
  - `main.js`: Entry point for assembly app
    - Initializes AssemblyApp
    - Sets up render loop
    - Handles window resize

### Key Implementation Details

**Universal SVG-to-3D Conversion Process:**
1. **Get geometry path**: `const geoPath = shape.toGeometryPath()`
   - Every shape implements this method
   - Returns geometry library Path object with anchors
2. **Extract anchors**: `geoPath.anchors` array
   - Each anchor has `position` (Vec), `handleIn` (Vec), `handleOut` (Vec)
   - Handles are relative to position (Vec objects with .x and .y)
3. **Calculate bounding box**: Get bounds to center shape
   - `geoPath.tightBoundingBox()` or `geoPath.looseBoundingBox()`
   - Calculate center: `(min + max) / 2`
4. **Convert to THREE.js Shape**:
   - Start: `shape2d.moveTo(firstAnchor.position - center)`
   - For each segment:
     - Check if handles are non-zero
     - If yes: `bezierCurveTo(cp1, cp2, end)` where:
       - `cp1 = anchor1.position + anchor1.handleOut - center`
       - `cp2 = anchor2.position + anchor2.handleIn - center`
       - `end = anchor2.position - center`
     - If no: `lineTo(anchor2.position - center)`
5. **Close path**: If closed or needs closing for extrusion
   - Add final segment back to first anchor
   - Call `shape2d.closePath()`
6. **Extrude**: `new THREE.ExtrudeGeometry(shape2d, { depth: thickness })`
   - Rotate: `geometry.rotateX(-Math.PI / 2)` for proper orientation

**Special Cases:**
- **Rectangles with joinery**: Custom edge notches (bypasses universal converter)
  - Uses `rectShapeWithJoinery()` to create notched edges
  - Handles finger joints, dovetails, etc.
- **Donut shapes**: Explicit holes (THREE.js doesn't support winding-rule holes)
  - Uses `donutShape()` to create outer circle with inner hole
  - THREE.js requires explicit Path holes, not winding-rule

**Joinery Integration:**
- Female holes: Created in extruded geometry via `addFemaleJoineryHoles()`
- Male tabs: Created as separate meshes via `AssemblyJoineryDecorator`
- Edge metadata: Read from `ShapeStore.edgeJoinery` map

### Verification

- Create shapes in editor (including paths with Bezier curves)
- Add joinery to edges (finger joints, etc.)
- Open assembly page (`assemble.html`)
- See extruded pieces with **smooth curves preserved**
- Verify joinery appears correctly (male tabs, female holes)
- Drag pieces around on the plane
- Orbit camera to view from different angles
- Verify complex paths (gears, spirals, custom paths) extrude correctly
- Check that all shape types work (circle, rectangle, polygon, path, etc.)
- Verify thickness is applied correctly (default 3mm)
- Test with multiple pieces: layout should be organized

---

## M13 — Plugins (extensibility system)

### Goal

Enable extensibility by allowing external modules (plugins) to register new shapes, bindings, commands, and UI components. This makes Otto a platform that can be extended without modifying core code.

### Why This Is Required

The plugin system is essential for:
- **Extensibility**: Add new features without modifying core code
- **Custom shapes**: Users can create domain-specific shapes
- **Custom bindings**: Support new binding strategies
- **Workflow integration**: Connect Otto to external tools
- **Community contributions**: Allow others to extend the system
- **Modularity**: Keep core system lean, add features via plugins
- **Experimental features**: Test new ideas without cluttering core

### Deliverables

- `src/plugins/Plugin.js`: Base class for all plugins
  - Properties: `id` (unique identifier), `name`, `version`, `dependencies`
  - Methods: `activate(api)`, `deactivate()`
  - Lifecycle hooks: `onActivate()`, `onDeactivate()`
  - Error handling: Graceful activation/deactivation
- `src/plugins/PluginAPI.js`: Facade exposing stable API
  - **Shape registration**: `registerShape(type, createFn, fromJSONFn)`
  - **Binding registration**: `registerBinding(type, createFn, resolveFn)`
  - **Command registration**: `registerCommand(name, executeFn, undoFn)`
  - **UI component registration**: `registerUIComponent(name, componentClass)`
  - **Event subscription**: `subscribe(eventType, callback)`
  - **Event emission**: `emit(eventType, payload)`
  - **Store access**: `getShapeStore()`, `getParameterStore()`, etc.
  - **Version checking**: Ensure plugin compatibility
- `src/plugins/PluginManager.js`: Manages plugin lifecycle
  - `loadPlugin(url)`: Dynamic import of plugin module
  - `activatePlugin(pluginId)`: Activates plugin (calls `activate(api)`)
  - `deactivatePlugin(pluginId)`: Deactivates plugin (calls `deactivate()`)
  - `getPlugin(pluginId)`: Retrieves loaded plugin
  - `listPlugins()`: Returns all loaded plugins
  - Dependency resolution: Ensures dependencies are loaded first
  - Error handling: Logs errors, prevents one plugin from breaking others
- `src/plugins/PluginLoader.js`: Handles plugin discovery and loading
  - Scans `examples/plugins/` directory (or configured path)
  - Loads plugin manifests
  - Validates plugin structure
  - Handles version conflicts
- `examples/plugins/`: Example plugins
  - `TriangleShapePlugin.js`: Example shape plugin
    - Registers Triangle shape type
    - Implements create/fromJSON methods
    - Shows plugin structure
  - `CustomBindingPlugin.js`: Example binding plugin (optional)
  - `ExampleCommandPlugin.js`: Example command plugin (optional)

### Plugin Structure

**Basic Plugin Example:**
```javascript
import { Plugin } from '../../src/plugins/Plugin.js';

export class TriangleShapePlugin extends Plugin {
  constructor() {
    super('triangle-shape', 'Triangle Shape', '1.0.0', []);
  }

  activate(api) {
    // Register shape
    api.registerShape('triangle', 
      (id, position, base, height) => new Triangle(id, position, base, height),
      (json) => Triangle.fromJSON(json)
    );
    
    // Subscribe to events
    api.subscribe('shape:created', (shape) => {
      if (shape.type === 'triangle') {
        console.log('Triangle created!');
      }
    });
  }

  deactivate() {
    // Cleanup if needed
  }
}
```

**Plugin Manifest (optional):**
```json
{
  "id": "triangle-shape",
  "name": "Triangle Shape",
  "version": "1.0.0",
  "main": "TriangleShapePlugin.js",
  "dependencies": []
}
```

### Implementation Details

**Plugin Loading:**
1. User triggers plugin load (UI button, config file, etc.)
2. `PluginLoader` performs dynamic import: `import(pluginUrl)`
3. Plugin module exports a class extending `Plugin`
4. `PluginManager` instantiates plugin
5. Checks dependencies are loaded
6. Calls `plugin.activate(api)`

**Plugin Activation:**
1. Create `PluginAPI` instance with current system state
2. Pass API to `plugin.activate(api)`
3. Plugin registers shapes/bindings/commands via API
4. Plugin subscribes to events if needed
5. Plugin is marked as active

**Plugin Deactivation:**
1. Call `plugin.deactivate()`
2. Plugin unregisters its contributions
3. Clean up event subscriptions
4. Plugin is marked as inactive

**Error Handling:**
- Plugin load failures don't crash the app
- Activation failures are logged
- One plugin's errors don't affect others
- Graceful degradation if plugin is incompatible

**API Stability:**
- `PluginAPI` provides stable interface
- Internal changes don't break plugins
- Version checking ensures compatibility
- Deprecated methods are marked but still work

### Verification

- Create example plugin in `examples/plugins/TriangleShapePlugin.js`
- Load plugin via `PluginManager.loadPlugin()`
- Activate plugin via `PluginManager.activatePlugin()`
- Verify new shape type appears in ShapeLibrary
- Create shape using new type
- Verify shape serializes/deserializes correctly
- Deactivate plugin
- Verify shape type is removed (or marked unavailable)
- Test dependency resolution (plugin A depends on plugin B)
- Test error handling (plugin with syntax error doesn't crash app)
- Test multiple plugins loading simultaneously

---

## Application wiring (how everything connects)

This is the “wiring diagram” you should replicate:

- `src/main.js`
  - waits for `DOMContentLoaded`
  - constructs `new Application()` and calls `init()`
  - optionally exposes globals for debugging (`window.OttoGeometry`, `window.OttoCodeRunner`)
- `src/core/Application.js`
  - constructs TabManager
  - gets the active SceneState
  - constructs UI components:
    - TabBar (multi-tab support)
    - ShapeLibrary (shape palette)
    - CanvasRenderer (rendering + interaction)
    - ParametersMenu (parameter CRUD)
    - PropertiesPanel (shape property editing + binding)
    - ZoomControls (viewport controls)
    - EdgeJoineryMenu (joinery assignment, M10)
    - CodeEditor (programming language, M11)
    - BlocksEditor (visual programming, M11)
    - EditorSyncConnector (syncs code/blocks editors, M11)
  - constructs persistence:
    - StorageManager (autosave)
    - FileManager (import/export)
  - subscribes to EventBus for:
    - tab switches (swap SceneState everywhere)
    - changes that should create history snapshots

---

## Testing strategy (in this repo)

There is no Jest/Vitest runner. Tests are written as ES module files and executed in the browser via HTML harness pages:

- Geometry unit tests: `src/geometry/tests/run-tests.html`
- Shape integration tests: `src/models/shapes/tests/run-tests.html`

**How to use them**

- Open the HTML file through your local server
- Open browser console
- Confirm modules report pass/fail

---

## Troubleshooting cheat sheet

### “Failed to load module script / MIME type”

- You are serving files with the wrong content type or using `file://`.
- Fix: use `python3 -m http.server` or a real static server.

### “Cannot use import statement outside a module”

- You forgot `type="module"` on the script tag.

### “Dynamic import fails on deserialize/fromJSON”

- Your server blocks module imports (rare) or paths are wrong.
- Fix: check the URL in the error, ensure the file exists and is served.

### “Dragging is offset / zoom feels wrong”

- Mixing CSS pixels vs device pixels.
- Fix: implement the DPR pattern and keep all math in CSS pixels, scaling the context once.

### “Bindings don’t update visually”

- You are rendering raw shapes instead of resolved clones.
- Fix: CanvasRenderer should render `shapeStore.getResolved()` for final frames; if you add a “fast path” during drag, switch back on mouseup.

---

## Final “definition of done” checklist (full Otto)

- [ ] Start server, open `index.html`, no runtime errors
- [ ] Shape library drag-drop creates shapes
- [ ] Selection, multi-selection, drag, resize, rotate work
- [ ] Parameters can be added/edited/removed
- [ ] Bindings: literal/parameter/expression work
- [ ] Undo/redo works for shape and parameter operations
- [ ] Autosave restores after refresh
- [ ] Export/import `.pds` round-trips state
- [ ] Tabs create/switch/close correctly (last tab cannot close)
- [ ] Edge selection + joinery persists across save/load
- [ ] Code runner creates shapes/params programmatically
- [ ] Assembly view extrudes shapes with smooth curves preserved (universal SVG-to-3D converter)
- [ ] Plugins can register new shapes/bindings/commands
- [ ] All shape types work in assembly view (circle, rectangle, polygon, path with curves, etc.)
- [ ] Joinery appears correctly in 3D (male tabs, female holes)
- [ ] Programming language supports loops, conditionals, and functions
- [ ] Code editor and blocks editor sync bidirectionally
- [ ] Plugin system loads and activates plugins without errors

