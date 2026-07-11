# Graph Report - .  (2026-07-11)

## Corpus Check
- 216 files · ~249,851 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2622 nodes · 4924 edges · 166 communities (59 shown, 107 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 70 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Edge Detection & Highlighting
- Shape Primitives & Boolean Ops
- Color & Fill Styling
- Bézier Curve Math
- Application Core & Lifecycle
- Anchors & Bounding Boxes
- Command Pattern Core
- PathKit Geometry Backend
- Vector Math (Vec)
- High-Level System Architecture
- Expression Parser & AST
- Assembly Piece Factory & Joinery
- Canvas Input Handling
- Shape Commands
- Otto Language Parser
- Path Geometry
- ShapeStore & Selection
- Code Runner & Interpreter Visitors
- Plugin Load Flow
- Code Editor (CodeMirror)
- Scene Migrations & Test Fixtures
- Boolean Operator (Clipper)
- Blocks Editor (Blockly)
- Plugin API
- Geometry Group
- Core Controllers & Serialization
- Geometry Base Class
- Parameter Builder
- Shape Decorators
- Canvas Painting & CSS Colors
- Focus Trap & Joinery Menu
- Binding Resolution
- SVG Import/Export
- UI Component Architecture
- Selection Model
- Shape Builder
- Canvas Render Passes
- Math Utilities
- Affine Matrix
- Binding & Shape Registries
- Storage Backends
- Plugin Manager
- Parametric Shape Renderers
- Interpreter Environment
- Binding Resolution Flow
- Persistence Data Flow
- Properties Panel
- Binding & Shape Types
- Scene Context
- Edge Selection Collection
- Plugin Lifecycle
- Cloud Storage Backend
- Storage Manager & Autosave
- Seeded Random Generator
- Interpreter Scope Frame
- Event Bus & Command System
- Interaction State & Snapping
- Anchor Geometry
- IndexedDB Backend
- Otto Code Interpreter
- Shape Decorators & Validation
- Custom Binding Plugins
- Storage Strategy
- History Manager (Undo/Redo)
- Axis Geometry
- LocalStorage Backend
- Matrix Transform Constructors
- Basic Shape Geometry
- Validation Handler Chain
- 3D Assembly Data Flow
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Community 128
- Community 129
- Community 130
- Community 131
- Community 132
- Community 133
- Community 134
- Community 135
- Community 136
- Community 137
- Community 138
- Community 139
- Community 140
- Community 141
- Community 142
- Community 144
- Community 146
- Community 147
- Community 148
- Community 149
- Community 150
- Community 151
- Community 152
- Community 153
- Community 154
- Community 155
- Community 156
- Community 157
- Community 158
- Community 159
- Community 160
- Community 161
- Community 162
- Community 163
- Community 164
- Community 165

## God Nodes (most connected - your core abstractions)
1. `Vec` - 96 edges
2. `AffineMatrix` - 52 edges
3. `ShapeStore` - 47 edges
4. `Parser` - 45 edges
5. `Shape` - 41 edges
6. `Color` - 37 edges
7. `Geometry` - 37 edges
8. `Shape` - 36 edges
9. `BooleanOperator` - 36 edges
10. `AssemblyPieceFactory` - 35 edges

## Surprising Connections (you probably didn't know these)
- `SelectionModel` --conceptually_related_to--> `ShapeStore`  [INFERRED]
  src/ARCHITECTURE.md → FROM_ZERO.md
- `assemble.html Redirect Stub` --conceptually_related_to--> `Viewport3D (Live 3D)`  [INFERRED]
  assemble.html → src/ARCHITECTURE.md
- `makeManager()` --indirect_call--> `EventBus`  [INFERRED]
  tests/unit/plugin-lifecycle.test.js → src/events/EventBus.js
- `AQUI Language` --conceptually_related_to--> `AQUI Programming Language (Lexer/Parser/Interpreter)`  [INFERRED]
  README.md → FROM_ZERO.md
- `ShapeStore` --references--> `Shape Base Class`  [INFERRED]
  FROM_ZERO.md → src/ARCHITECTURE.md

## Import Cycles
- 2-file cycle: `src/models/Binding.js -> src/models/BindingRegistry.js -> src/models/Binding.js`
- 3-file cycle: `src/geometry/Group.js -> src/geometry/Path.js -> src/geometry/pathkit.js -> src/geometry/Group.js`
- 3-file cycle: `src/geometry/Path.js -> src/geometry/pathkit.js -> src/geometry/Shape.js -> src/geometry/Path.js`
- 3-file cycle: `src/geometry/Group.js -> src/geometry/Path.js -> src/geometry/svg.js -> src/geometry/Group.js`
- 3-file cycle: `src/geometry/Group.js -> src/geometry/Shape.js -> src/geometry/svg.js -> src/geometry/Group.js`
- 4-file cycle: `src/geometry/Group.js -> src/geometry/Shape.js -> src/geometry/Path.js -> src/geometry/pathkit.js -> src/geometry/Group.js`
- 4-file cycle: `src/geometry/Group.js -> src/geometry/Shape.js -> src/geometry/Path.js -> src/geometry/svg.js -> src/geometry/Group.js`
- 5-file cycle: `src/geometry/Group.js -> src/geometry/Path.js -> src/geometry/pathkit.js -> src/geometry/Shape.js -> src/geometry/svg.js -> src/geometry/Group.js`

## Hyperedges (group relationships)
- **MVC Layer Split (Model/View/Controller)** — src_architecture_mvc_layering, src_architecture_canvasview, src_architecture_canvasinputcontroller, src_architecture_selectionmodel, src_architecture_scenecontext [EXTRACTED 1.00]
- **Command/Undo Flow** — src_architecture_command_base, src_architecture_historymanager, src_architecture_commandcatalog, src_architecture_eventbus [EXTRACTED 1.00]
- **2D-to-3D Extrusion Pipeline** — src_architecture_togeometrypath, src_architecture_assemblypiecefactory, src_architecture_meshbuilder, src_architecture_viewport3d [EXTRACTED 1.00]
- **Core Layer scene state management** — mermaid_charts_01_high_level_system_architecture_scenestate, mermaid_charts_01_high_level_system_architecture_shapestore, mermaid_charts_01_high_level_system_architecture_parameterstore, mermaid_charts_01_high_level_system_architecture_bindingresolver [EXTRACTED 1.00]
- **Rendering Pipeline flow** — mermaid_charts_03_data_flow_architecture_canvasrenderer, mermaid_charts_03_data_flow_architecture_bindingresolver, mermaid_charts_03_data_flow_architecture_parameterstore, mermaid_charts_03_data_flow_architecture_resolved_shapes, mermaid_charts_03_data_flow_architecture_html_canvas [EXTRACTED 0.95]
- **Persistence Flow** — mermaid_charts_03_data_flow_architecture_storage_backend, mermaid_charts_03_data_flow_architecture_shapestore, mermaid_charts_03_data_flow_architecture_storage, mermaid_charts_03_data_flow_architecture_serializer [EXTRACTED 0.95]
- **Serialization Data Hierarchy** — mermaid_charts_05_persistence_layer_json_data, mermaid_charts_05_persistence_layer_tab_data, mermaid_charts_05_persistence_layer_scene_data, mermaid_charts_05_persistence_layer_shape_data, mermaid_charts_05_persistence_layer_parameter_data, mermaid_charts_05_persistence_layer_viewport_data [EXTRACTED 0.95]
- **Save/Load Serialization Flow** — mermaid_charts_06_serialization_flow_app, mermaid_charts_06_serialization_flow_storagemanager, mermaid_charts_06_serialization_flow_serializer, mermaid_charts_06_serialization_flow_storagebackend, mermaid_charts_06_serialization_flow_storage [EXTRACTED 0.95]
- **Component Lifecycle States** — mermaid_charts_08_component_lifecycle_created, mermaid_charts_08_component_lifecycle_mounted, mermaid_charts_08_component_lifecycle_rendered, mermaid_charts_08_component_lifecycle_updated, mermaid_charts_08_component_lifecycle_unmounted [EXTRACTED 0.95]
- **Blocks Editor Shape Creation Flow** — mermaid_charts_09_blocks_editor_bidirectional_flow_blockseditor, mermaid_charts_09_blocks_editor_bidirectional_flow_shaperegistry, mermaid_charts_09_blocks_editor_bidirectional_flow_shapestore, mermaid_charts_09_blocks_editor_bidirectional_flow_eventbus, mermaid_charts_09_blocks_editor_bidirectional_flow_canvasrenderer [EXTRACTED 1.00]
- **Editor Sync Bidirectional Flow** — mermaid_charts_10_editor_sync_connector_codeeditor, mermaid_charts_10_editor_sync_connector_blockseditor, mermaid_charts_10_editor_sync_connector_coderunner, mermaid_charts_10_editor_sync_connector_sync_mediator, mermaid_charts_10_editor_sync_connector_eventbus [EXTRACTED 1.00]
- **Binding Resolution System** — mermaid_charts_12_shape_binding_system_binding, mermaid_charts_12_shape_binding_system_parameterbinding, mermaid_charts_12_shape_binding_system_expressionbinding, mermaid_charts_12_shape_binding_system_processedbinding, mermaid_charts_12_shape_binding_system_bindinghandler [EXTRACTED 1.00]
- **Binding Resolution Flow** — mermaid_charts_13_binding_resolution_flow_bindingresolver, mermaid_charts_13_binding_resolution_flow_binding_type, mermaid_charts_13_binding_resolution_flow_final_value, mermaid_charts_13_binding_resolution_flow_render_to_canvas [EXTRACTED 0.75]
- **Plugin Feature Registration Flow** — mermaid_charts_14_plugin_system_architecture_pluginapi, mermaid_charts_14_plugin_system_architecture_register_shapes, mermaid_charts_14_plugin_system_architecture_shaperegistry, mermaid_charts_14_plugin_system_architecture_commandregistry, mermaid_charts_14_plugin_system_architecture_bindingregistry [EXTRACTED 0.75]
- **Command and Memento Undo System** — mermaid_charts_16_command_history_system_commandregistry, mermaid_charts_16_command_history_system_scenestate, mermaid_charts_16_command_history_system_scenehistory, mermaid_charts_16_command_history_system_scenememento [EXTRACTED 0.75]
- **Undo/Redo History Flow** — mermaid_charts_17_history_system_flow_app, mermaid_charts_17_history_system_flow_scenehistory, mermaid_charts_17_history_system_flow_scenestate, mermaid_charts_17_history_system_flow_shapestore_parameterstore, mermaid_charts_17_history_system_flow_eventbus [INFERRED 0.85]
- **Text Programming Compilation Pipeline** — mermaid_charts_20_text_based_programming_system_lexer, mermaid_charts_20_text_based_programming_system_parser, mermaid_charts_20_text_based_programming_system_ast, mermaid_charts_20_text_based_programming_system_interpreter, mermaid_charts_20_text_based_programming_system_visitors, mermaid_charts_20_text_based_programming_system_environment [EXTRACTED 0.95]
- **Assembly Piece Geometry Generation** — mermaid_charts_21_assembly_data_flow_resolvedshapes, mermaid_charts_21_assembly_data_flow_edgejoinerymetadata, mermaid_charts_21_assembly_data_flow_assemblyjoinerydecorator, mermaid_charts_21_assembly_data_flow_assemblypiecefactory, mermaid_charts_21_assembly_data_flow_piecemeshes [INFERRED 0.85]

## Communities (166 total, 107 thin omitted)

### Community 0 - "Edge Detection & Highlighting"
Cohesion: 0.05
Nodes (31): closestEdgeToPoint(), edgesFromItem(), edgesFromPath(), edgesFromPaths(), DEFAULT_HIGHLIGHT_STYLE, EdgeHighlighter, renderEdge(), renderEdgeEndpoints() (+23 more)

### Community 1 - "Shape Primitives & Boolean Ops"
Cohesion: 0.04
Nodes (24): BezierCurve, Circle, Cross, CrossLapVertical, Donut, DovetailPin, DovetailTail, Ellipse (+16 more)

### Community 2 - "Color & Fill Styling"
Cohesion: 0.06
Nodes (25): Color, Fill, HIT_TEST_FILL, HIT_TEST_FILL, HIT_TEST_FILL, HIT_TEST_FILL, HIT_TEST_FILL, HIT_TEST_FILL (+17 more)

### Community 3 - "Bézier Curve Math"
Cohesion: 0.07
Nodes (39): bernsteinBezierFormForClosestPointOnCubic(), computeXIntercept(), cubicByTrimmingCubic(), cubicsBySplittingCubicAtTime(), FIND_ROOTS_EPSILON, findRoots(), isControlPolygonFlatEnough(), pointOnCubicAtTime() (+31 more)

### Community 4 - "Application Core & Lifecycle"
Cohesion: 0.07
Nodes (5): Application, EventBus, StlImporter, EditorSyncConnector, flatMesh()

### Community 5 - "Anchors & Bounding Boxes"
Cohesion: 0.08
Nodes (12): tempHandleIn, tempHandleOut, defaultDirections, BoundingBox, TAU, tan(), setVec(), arcSegment() (+4 more)

### Community 6 - "Command Pattern Core"
Cohesion: 0.07
Nodes (10): Command, CompositeCommand, AddParameterCommand, RemoveParameterCommand, SetParameterValueCommand, UpdateParameterMetaCommand, SetEdgeJoineryCommand, DuplicateShapesCommand (+2 more)

### Community 7 - "PathKit Geometry Backend"
Cohesion: 0.07
Nodes (16): initCuttleGeometry(), computeTightBoundingBox(), Conic, deletePkPath(), emptyPkPath(), fromPkCommands(), fromPkPath(), getPathKit() (+8 more)

### Community 8 - "Vector Math (Vec)"
Cohesion: 0.05
Nodes (3): approx(), vecApprox(), Vec

### Community 9 - "High-Level System Architecture"
Cohesion: 0.05
Nodes (48): Application Facade, BindingResolver, CanvasRenderer, EventBus Singleton, FileManager, JSON Files, LocalStorage / IndexedDB, ParameterStore (+40 more)

### Community 10 - "Expression Parser & AST"
Cohesion: 0.06
Nodes (8): ASTNode, BinaryOpNode, ExpressionParser, FunctionCallNode, NumberNode, ParameterRefNode, Lexer, TurtleDrawer

### Community 12 - "Canvas Input Handling"
Cohesion: 0.09
Nodes (5): CanvasInputController, PathShape, computeResizedBounds(), getResizeCursor(), PathDrawPass

### Community 13 - "Shape Commands"
Cohesion: 0.08
Nodes (10): AddShapeCommand, MutateShapesCommand, SetBindingCommand, syncLiteralBindingsForTranslate(), Binding, ExpressionBinding, LiteralBinding, ParameterBinding (+2 more)

### Community 17 - "Code Runner & Interpreter Visitors"
Cohesion: 0.11
Nodes (14): createCodeRunner(), COLOR_MAP, resolveColorName(), BaseVisitor, BooleanOperationVisitor, ConstraintsVisitor, ControlFlowVisitor, DrawVisitor (+6 more)

### Community 18 - "Plugin Load Flow"
Cohesion: 0.07
Nodes (36): Active, Add UI Elements, Application, BindingRegistry, CommandRegistry, EventBus, Initialize, Load Plugin (+28 more)

### Community 20 - "Scene Migrations & Test Fixtures"
Cohesion: 0.12
Nodes (19): migrate(), MIGRATIONS, loadFixtureText(), buildFixtureTabManager(), FIXTURE_SHAPES, assert(), assertApprox(), assertDeepEqual() (+11 more)

### Community 25 - "Core Controllers & Serialization"
Cohesion: 0.16
Nodes (4): eventBusInstance, Serializer, LiveRegion, Component

### Community 27 - "Parameter Builder"
Cohesion: 0.11
Nodes (3): ParameterBuilder, CodeRunner, ParametersMenu

### Community 29 - "Canvas Painting & CSS Colors"
Cohesion: 0.10
Nodes (8): paintToCanvas(), styleContainsPoint(), cssColorKeywords, from255String(), fromAlphaString(), fromHex1(), fromHex2(), Stroke

### Community 30 - "Focus Trap & Joinery Menu"
Cohesion: 0.14
Nodes (5): FOCUSABLE, FocusTrap, ALIGN_OPTIONS, EdgeJoineryMenu, JOINT_TYPES

### Community 31 - "Binding Resolution"
Cohesion: 0.09
Nodes (4): BindingResolver, ParameterStore, SceneState, Tab

### Community 32 - "SVG Import/Export"
Cohesion: 0.14
Nodes (18): geometryFromSVGNode(), geometryFromSVGString(), getNumberAndUnitFromString(), getNumberAttribute(), getStringAttribute(), hashString(), makeCircularArc(), parseStyleMap() (+10 more)

### Community 33 - "UI Component Architecture"
Cohesion: 0.10
Nodes (24): Application, BindingResolver, BlocksEditor, CanvasRenderer, Component Base Class, DragDropManager, EdgeJoineryMenu, EventBus (+16 more)

### Community 36 - "Canvas Render Passes"
Cohesion: 0.13
Nodes (6): DragPreviewPass, GridPass, HandleEditPass, JoineryPass, SelectionRectPass, ShapesPass

### Community 37 - "Math Utilities"
Cohesion: 0.17
Nodes (16): acos(), angularDistance(), asin(), atan(), atan2(), clamp(), cos(), equalWithinTolerance() (+8 more)

### Community 39 - "Binding & Shape Registries"
Cohesion: 0.11
Nodes (5): BindingRegistry, ShapeRegistry, freshScene(), makeManager(), NoopCommand

### Community 42 - "Parametric Shape Renderers"
Cohesion: 0.14
Nodes (4): Arc, Cross, Star, Triangle

### Community 44 - "Binding Resolution Flow"
Cohesion: 0.12
Nodes (20): Apply Handlers Chain, Binding Type?, BindingResolver, Calculate Result, ClampHandler, Evaluate Expression, ExpressionBinding, Final Value (+12 more)

### Community 45 - "Persistence Data Flow"
Cohesion: 0.11
Nodes (19): Application, Cloud Storage, CloudStorageBackend, FileManager, IndexedDB, IndexedDBBackend, JSON Data, JSON Files (+11 more)

### Community 47 - "Binding & Shape Types"
Cohesion: 0.12
Nodes (18): Binding, BindingHandler, BorderDecorator, Circle, ClampHandler, ExpressionBinding, FillDecorator, Line (+10 more)

### Community 53 - "Seeded Random Generator"
Cohesion: 0.16
Nodes (7): random(), randomDirection(), RandomGenerator, randomInt(), _seedGlobalRandom(), mash(), seedrandom()

### Community 55 - "Event Bus & Command System"
Cohesion: 0.15
Nodes (15): EventBus (pub/sub singleton), CanvasInputController, Command, Command System, CommandCatalog, EventBus, HistoryManager, InteractionState (+7 more)

### Community 56 - "Interaction State & Snapping"
Cohesion: 0.15
Nodes (5): InteractionState, GridSnap, NoSnap, ShapeSnap, SnapStrategy

### Community 60 - "Shape Decorators & Validation"
Cohesion: 0.14
Nodes (3): HighlightedShapeDecorator, RequiredFieldHandler, ShapeDecorator

### Community 68 - "Validation Handler Chain"
Cohesion: 0.20
Nodes (3): ComponentFactory, RangeValidationHandler, ValidationHandler

### Community 69 - "3D Assembly Data Flow"
Cohesion: 0.24
Nodes (11): AssemblyDataLoader, AssemblyJoineryDecorator, AssemblyPieceFactory, Edge Joinery Metadata, ExtrudeGeometry, LocalStorage autosave, Piece Meshes, Resolved Shapes (+3 more)

### Community 76 - "Community 76"
Cohesion: 0.31
Nodes (10): CanvasRenderer, Edge Class, edgeHelpers, EdgeHighlight, EdgeHitTest, EdgeSelection, EventBus, PropertiesPanel (+2 more)

### Community 77 - "Community 77"
Cohesion: 0.22
Nodes (4): equalWithinRelativeEpsilon(), Transform, approx(), matrixApprox()

### Community 79 - "Community 79"
Cohesion: 0.28
Nodes (9): Plugin Base Class, Plugin Development Guide, TriangleShapePlugin (example), Declarative Shape Schema, Plugin System, PluginAPI, PluginManager, Shape Base Class (+1 more)

### Community 80 - "Community 80"
Cohesion: 0.31
Nodes (9): CanvasView, MVC Architecture, SelectionModel, From Zero Build Guide, CanvasRenderer God Object (deleted), CanvasView, MVC Layering, Otto Architecture Document (+1 more)

### Community 81 - "Community 81"
Cohesion: 0.28
Nodes (9): Binding Strategies, BindingResolver, CodeRunner, ExpressionParser, ParameterStore, AQUI Programming Language (Lexer/Parser/Interpreter), SceneState, ShapeStore (+1 more)

### Community 87 - "Community 87"
Cohesion: 0.32
Nodes (8): Manual Smoke Checklist, 2.5D depth/z/tilt, Accessibility Layer, COMMON_SCHEMA, Edge Joinery, HitTestService, StlImporter, Viewport3D (Live 3D)

### Community 90 - "Community 90"
Cohesion: 0.29
Nodes (8): Geometry Library, Universal SVG-to-3D Converter, AssemblyPieceFactory, Geometry Library (cuttle-geometry port), MeshBuilder, toGeometryPath(), Geometry Library Test Runner, Shape Geometry Integration Test Runner

### Community 91 - "Community 91"
Cohesion: 0.25
Nodes (8): AST, Environment, Interpreter, Lexer, Parser, Result, Source Code, Visitors

### Community 98 - "Community 98"
Cohesion: 0.29
Nodes (7): assemble.html Redirect Stub, Blockly (CDN), ClipperLib (boolean ops), index.html (Editor Page), main.js Bootstrap, Three.js (import map), Application (Facade wiring)

### Community 100 - "Community 100"
Cohesion: 0.38
Nodes (7): BlocksEditor, CanvasRenderer, CodeEditor, CodeRunner, EventBus, ShapeStore / ParameterStore, Sync Mediator (EditorSyncConnector)

### Community 101 - "Community 101"
Cohesion: 0.38
Nodes (7): App, EventBus, SceneHistory, SceneState, ShapeStore/ParameterStore, UI, User

### Community 102 - "Community 102"
Cohesion: 0.29
Nodes (6): name, private, scripts, serve, test, type

### Community 108 - "Community 108"
Cohesion: 0.40
Nodes (6): Blockly Workspace, BlocksEditor, CanvasRenderer, EventBus, ShapeRegistry, ShapeStore

### Community 109 - "Community 109"
Cohesion: 0.40
Nodes (6): Canvas, CanvasRenderer, EdgeJoineryMenu, EventBus, ShapeStore, User

### Community 128 - "Community 128"
Cohesion: 0.40
Nodes (5): App, Serializer, Storage, StorageBackend, StorageManager

### Community 129 - "Community 129"
Cohesion: 0.40
Nodes (5): Created, Mounted, Rendered, Unmounted, Updated

### Community 130 - "Community 130"
Cohesion: 0.40
Nodes (5): CanvasRenderer, Corner Handles, EventBus, Shape Instance, ShapeResizeStrategies (Strategy)

### Community 131 - "Community 131"
Cohesion: 0.40
Nodes (5): 2.5D Parametric Design, AQUI Language, depth (extrusion thickness), Otto (Parametric Design System), z (elevation)

### Community 142 - "Community 142"
Cohesion: 0.67
Nodes (4): Byte-Fixture Guards, Serializer + Migrations, Test Harness (hand-rolled), Otto Unit Test Runner

## Ambiguous Edges - Review These
- `Shapes: Circle, Rectangle, Polygon, Star, Line, Path` → `EventBus Singleton`  [AMBIGUOUS]
  mermaid_charts/01_High-Level_System_Architecture.png · relation: references

## Knowledge Gaps
- **146 isolated node(s):** `name`, `private`, `type`, `test`, `serve` (+141 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **107 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Shapes: Circle, Rectangle, Polygon, Star, Line, Path` and `EventBus Singleton`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `HistoryManager` connect `History Manager (Undo/Redo)` to `Command Pattern Core`, `Binding Resolution`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Why does `IndexedDBBackend` connect `IndexedDB Backend` to `Storage Backends`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Why does `Vec` connect `Vector Math (Vec)` to `Edge Detection & Highlighting`, `SVG Import/Export`, `Color & Fill Styling`, `Bézier Curve Math`, `Community 132`, `Anchors & Bounding Boxes`, `Math Utilities`, `PathKit Geometry Backend`, `Community 77`, `Path Geometry`, `Canvas Painting & CSS Colors`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _151 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Edge Detection & Highlighting` be split into smaller, more focused modules?**
  _Cohesion score 0.05225576111652061 - nodes in this community are weakly interconnected._
- **Should `Shape Primitives & Boolean Ops` be split into smaller, more focused modules?**
  _Cohesion score 0.039627039627039624 - nodes in this community are weakly interconnected._