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
- Optional advanced systems:
  - **Edge selection + joinery metadata** (for fabrication workflows).
  - **Programming language**: code editor runner + interpreter (and blocks editor sync).
  - **3D assembly view**: extrude 2D parts into meshes (Three.js).
  - **Plugin system**: load and activate plugins that register shapes/bindings/commands.

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
11. **M10** (optional): Edge selection + joinery metadata + joinery UI
12. **M11** (optional): Programming language (Lexer/Parser/Interpreter + CodeRunner) + CodeEditor/BlocksEditor sync
13. **M12** (optional): 3D assembly view (Three.js extrude + layout + drag/orbit)
14. **M13** (optional): Plugins (PluginManager + PluginAPI) + example plugin

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

## M10 — Edge selection + joinery (optional fabrication feature)

### Goal

Select individual edges of shapes and attach joinery metadata (finger joints etc).

### Deliverables

- `src/geometry/edge/` helpers:
  - hit testing (`EdgeHitTester`)
  - selection bookkeeping (`EdgeSelection`)
  - overlay rendering (hover/selected visuals)
- Extend `ShapeStore` to:
  - maintain selection mode: `'shape' | 'edge'`
  - persist `edgeJoinery` map across save/load
- `src/ui/EdgeJoineryMenu.js` + renderer overlays

### Verification

- Toggle to edge mode
- Hover an edge and see highlight
- Select an edge and assign joinery
- Save/load preserves joinery data

---

## M11 — Programming language + editors (optional)

### Goal

Support generating parameters and shapes from code (and optionally blocks).

### Deliverables

- `src/programming/`:
  - `Lexer.js`, `Parser.js`, `Interpreter.js` (Visitor-based)
  - `CodeRunner.js` bridges interpreter output → ShapeStore/ParameterStore
- `src/ui/CodeEditor.js` (CodeMirror) that calls CodeRunner
- `src/ui/BlocksEditor.js` (Blockly) that can also produce shapes/params
- `src/ui/EditorSyncConnector.js` (Mediator to prevent loops)

### Verification

- Write code that defines a parameter and a circle using it
- Run code → parameter appears + shape appears
- Re-run code with a different value → parameter updates

### Safety note

This is **not** a hardened sandbox. Treat it as a learning/prototyping feature.

---

## M12 — 3D Assembly view (optional)

### Goal

Extrude 2D shapes into 3D meshes and lay them out on a plane.

### Deliverables

- `assemble.html` with a Three.js importmap
- `src/assembly/`:
  - `AssemblyDataLoader.js` loads autosave JSON
  - `AssemblyPieceFactory.js` converts 2D shape paths → `THREE.Shape` → extrude
  - `AssemblyLayout.js` positions pieces
  - `AssemblyInteraction.js` orbit + drag

### Verification

- Create shapes in editor (so autosave exists)
- Open assembly page
- See extruded pieces, drag them around

---

## M13 — Plugins (optional)

### Goal

Load external modules that can register new shapes/bindings/commands.

### Deliverables

- `src/plugins/Plugin.js` base class (id, dependencies, activate/deactivate)
- `src/plugins/PluginAPI.js` (Facade) exposing stable methods
- `src/plugins/PluginManager.js` for lifecycle (load/activate/deactivate)
- At least one example plugin in `examples/plugins/`

### Verification

- Load plugin via dynamic import
- Plugin registers a new shape type and it appears in the library

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
    - TabBar
    - ShapeLibrary
    - CanvasRenderer
    - ParametersMenu
    - PropertiesPanel
    - ZoomControls
    - BlocksEditor / CodeEditor (optional)
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
- [ ] (Optional) edge selection + joinery persists
- [ ] (Optional) code runner creates shapes/params
- [ ] (Optional) assembly view extrudes shapes
- [ ] (Optional) plugins can register new shapes/bindings

