# Otto v2 - Architecture Documentation

This document provides detailed architecture diagrams for the Otto v2 system using Mermaid.js.

## Table of Contents
1. [High-Level System Architecture](#1-high-level-system-architecture)
2. [Core Components & Dependencies](#2-core-components--dependencies)
3. [Data Flow Architecture](#3-data-flow-architecture)
4. [Design Patterns Overview](#4-design-patterns-overview)
5. [Event Bus Architecture](#5-event-bus-architecture)
6. [Persistence Layer](#6-persistence-layer)
7. [UI Components Architecture](#7-ui-components-architecture)
8. [Shape & Binding System](#8-shape--binding-system)
9. [Plugin System Architecture](#9-plugin-system-architecture)
10. [Command & History System](#10-command--history-system)

---

## 1. High-Level System Architecture

```mermaid
---
config:
  layout: elk
---
flowchart TB
 subgraph CoreLayer["Core Layer"]
        TM["TabManager"]
        SS["SceneState"]
        SH["ShapeStore"]
        PS["ParameterStore"]
        BR["BindingResolver"]
        CMD["CommandRegistry"]
  end
 subgraph UILayer["UI Layer"]
        TB["TabBar"]
        SL["ShapeLibrary"]
        CR["CanvasRenderer"]
        PM_UI["ParametersMenu"]
        PP["PropertiesPanel"]
        ZC["ZoomControls"]
  end
 subgraph ModelLayer["Model Layer"]
        SR["ShapeRegistry"]
        Shapes["Shapes: Circle, Rectangle"]
        Bindings["Bindings System"]
        Decorators["Shape Decorators"]
  end
 subgraph PersistenceLayer["Persistence Layer"]
        SM["StorageManager"]
        FM["FileManager"]
        SER["Serializer"]
        Backends["Storage Backends"]
  end
 subgraph EventSystem["Event System"]
        EB["EventBus Singleton"]
  end
 subgraph PluginSystem["Plugin System"]
        PM_Plugin["PluginManager"]
        Plugins["Plugins"]
  end
 subgraph OttoV2["Otto v2 Application"]
        App["Application Facade"]
        CoreLayer
        UILayer
        ModelLayer
        PersistenceLayer
        EventSystem
        PluginSystem
  end
    App --> TM & UILayer & SM & FM & PM_Plugin
    TM --> SS
    SS --> SH & PS & BR
    UILayer --> CoreLayer & ModelLayer & EB
    CoreLayer --> ModelLayer & EB
    SM --> SER & Backends
    FM --> SER
    PM_Plugin --> Plugins
    Plugins --> SR
    ModelLayer --> EB
    User["User Interaction"] --> UILayer
    Storage["LocalStorage / IndexedDB"] --> Backends
    Files["JSON Files"] --> FM
```

---

## 2. Core Components & Dependencies

```mermaid
---
config:
  layout: elk
---
classDiagram
    class Application {
        -TabManager tabManager
        -StorageManager storageManager
        -FileManager fileManager
        -SceneHistory sceneHistory
        -SceneState currentSceneState
        -CanvasRenderer canvasRenderer
        -ShapeLibrary shapeLibrary
        -ParametersMenu parametersMenu
        -PropertiesPanel propertiesPanel
        -TabBar tabBar
        -ZoomControls zoomControls
        -DragDropManager dragDropManager
        +init()
        +save()
        +load()
        +undo()
        +redo()
        +newTab()
        +exportFile()
        +importFile()
    }

    class TabManager {
        -Tab[] tabs
        -string activeTabId
        -EventBus eventBus
        +createTab(name)
        +closeTab(id)
        +switchTab(id)
        +getActiveTab()
        +getActiveScene()
        +getAllTabs()
    }

    class Tab {
        +string id
        +string name
        +SceneState sceneState
    }

    class SceneState {
        -ShapeStore shapeStore
        -ParameterStore parameterStore
        -BindingResolver bindingResolver
        -Viewport viewport
        +createMemento()
        +restoreMemento()
        +toJSON()
        +fromJSON()
    }

    class ShapeStore {
        -Map shapes
        -ParameterStore parameterStore
        -BindingResolver bindingResolver
        -Set selectedShapeIds
        -EventBus eventBus
        +add(shape)
        +remove(id)
        +get(id)
        +getAll()
        +getResolved()
        +setSelected(id)
        +selectAll()
    }

    class ParameterStore {
        -Map parameters
        -EventBus eventBus
        +add(name, value)
        +remove(name)
        +get(name)
        +set(name, value)
        +getAll()
        +has(name)
    }

    class BindingResolver {
        -ParameterStore parameterStore
        +resolve(shape)
        +resolveAll(shapes)
        +resolveBinding(binding)
    }

    class CommandRegistry {
        -Map registry
        -Command[] history
        -int historyIndex
        +register(name, CommandClass)
        +execute(name, args)
        +undo()
        +redo()
    }

    Application "1" --> "1" TabManager
    Application "1" --> "1" StorageManager
    Application "1" --> "1" FileManager
    TabManager "1" --> "*" Tab
    Tab "1" --> "1" SceneState
    SceneState "1" --> "1" ShapeStore
    SceneState "1" --> "1" ParameterStore
    SceneState "1" --> "1" BindingResolver
    ShapeStore --> ParameterStore
    ShapeStore --> BindingResolver
    BindingResolver --> ParameterStore
```

---

## 3. Data Flow Architecture

```mermaid
---
config:
  layout: elk
---
flowchart TB
    User[User Action] --> UI[UI Component]

    UI --> |Create Shape| DDM[DragDropManager]
    UI --> |Select Shape| CR[CanvasRenderer]
    UI --> |Edit Parameter| PM[ParametersMenu]
    UI --> |Modify Property| PP[PropertiesPanel]

    DDM --> SR[ShapeRegistry]
    SR --> |Create Instance| Shape[Shape Object]
    Shape --> SH[ShapeStore]

    SH --> |Emit Event| EB[EventBus]
    PM --> PS[ParameterStore]
    PS --> |Emit Event| EB

    PP --> |Update Binding| Shape
    Shape --> |Set Binding| Binding[Binding Object]

    EB --> |Notify| UI
    EB --> |Notify| CR
    EB --> |Create Snapshot| History[SceneHistory]

    subgraph "Rendering Pipeline"
        CR --> BR[BindingResolver]
        BR --> PS
        BR --> |Resolve Values| ResolvedShapes[Resolved Shapes]
        ResolvedShapes --> Canvas[HTML Canvas]
    end

    subgraph "Persistence Flow"
        SH --> Serializer
        PS --> Serializer
        Serializer --> |JSON| StorageBackend[Storage Backend]
        StorageBackend --> |Save| DB[(Storage)]
        DB --> |Load| StorageBackend
        StorageBackend --> |JSON| Serializer
        Serializer --> |Restore| SH
        Serializer --> |Restore| PS
    end

    History --> |Memento| SceneState[SceneState]
    SceneState --> |Undo/Redo| SH
    SceneState --> |Undo/Redo| PS
```

---


### Event Types

```mermaid
classDiagram
    class EVENTS {
        <<enumeration>>
        PARAM_CHANGED
        PARAM_ADDED
        PARAM_REMOVED
        SHAPE_ADDED
        SHAPE_REMOVED
        SHAPE_MOVED
        SHAPE_SELECTED
        TAB_SWITCHED
        TAB_CREATED
        TAB_CLOSED
        SCENE_LOADED
        SCENE_SAVED
        VIEWPORT_CHANGED
        NODE_LINK_CREATED
        NODE_LINK_REMOVED
        NODE_MODULE_EDITED
        NODE_PARAM_CREATED
        NODE_EXPRESSION_CHANGED
    }
```

---

## 6. Persistence Layer

```mermaid
---
config:
  layout: elk
---
graph TB
    subgraph "Application Layer"
        App[Application]
        TM[TabManager]
    end

    subgraph "Persistence Managers"
        SM[StorageManager]
        FM[FileManager]
        SER[Serializer]
    end

    subgraph "Storage Backends"
        SF[StorageFactory]
        LSB[LocalStorageBackend]
        IDB[IndexedDBBackend]
        CSB[CloudStorageBackend]
    end

    subgraph "Storage"
        LS[(LocalStorage)]
        IDB_DB[(IndexedDB)]
        Cloud[(Cloud Storage)]
        File[JSON Files]
    end

    App --> SM
    App --> FM
    SM --> TM
    FM --> TM

    SM --> SER
    FM --> SER

    SM --> SF
    SF --> LSB
    SF --> IDB
    SF --> CSB

    LSB --> LS
    IDB --> IDB_DB
    CSB --> Cloud
    FM --> File

    SER -->|Serialize| JSON[JSON Data]
    JSON -->|Deserialize| SER

    subgraph "Serialization Format"
        JSON --> TabData[Tab Data]
        TabData --> SceneData[Scene Data]
        SceneData --> ShapeData[Shape Data]
        SceneData --> ParamData[Parameter Data]
        SceneData --> ViewportData[Viewport Data]
    end
```

### Serialization Flow

```mermaid
sequenceDiagram
    participant App
    participant SM as StorageManager
    participant SER as Serializer
    participant Backend as StorageBackend
    participant Storage as Storage

    App->>SM: save()
    SM->>SER: serialize(tabManager)
    SER->>SER: toJSON(tabs, scenes, shapes, params)
    SER-->>SM: JSON data
    SM->>Backend: save(key, data)
    Backend->>Storage: write
    Storage-->>Backend: success
    Backend-->>SM: success
    SM-->>App: true

    App->>SM: load()
    SM->>Backend: load(key)
    Backend->>Storage: read
    Storage-->>Backend: JSON data
    Backend-->>SM: JSON data
    SM->>SER: deserialize(data)
    SER->>SER: fromJSON(data)
    SER-->>SM: TabManager instance
    SM-->>App: TabManager
```

---

## 7. UI Components Architecture

```mermaid

---
config:
  layout: elk
---

graph TB
    subgraph "Base Component"
        Component[Component Base Class]
        Component -->|Abstract Methods| mount
        Component -->|Abstract Methods| unmount
        Component -->|Abstract Methods| render
    end

    subgraph "UI Components"
        TB[TabBar]
        SL[ShapeLibrary]
        CR[CanvasRenderer]
        PM[ParametersMenu]
        PP[PropertiesPanel]
        ZC[ZoomControls]
    end

    subgraph "Core State"
        TM[TabManager]
        SS[SceneState]
        SR[ShapeRegistry]
    end

    Component -.->|Extends| TB
    Component -.->|Extends| SL
    Component -.->|Extends| PM
    Component -.->|Extends| PP
    Component -.->|Extends| ZC

    TB --> TM
    TB -->|Subscribe| EB[EventBus]

    SL --> SR
    SL -->|Drag & Drop| DDM[DragDropManager]

    CR --> SS
    CR --> BR[BindingResolver]
    CR -->|Subscribe| EB

    PM --> PS[ParameterStore]
    PM -->|Subscribe| EB

    PP --> SH[ShapeStore]
    PP --> PS
    PP -->|Subscribe| EB

    ZC --> Viewport
    ZC -->|Subscribe| EB

    subgraph "Interaction Layer"
        DDM --> SH
        DDM --> SR
        Mouse[Mouse Events]
        Keyboard[Keyboard Events]
    end

    CR -->|Canvas Events| Mouse
    App[Application] -->|Shortcuts| Keyboard
```

### Component Lifecycle

```mermaid
---
config:
  layout: elk
---
stateDiagram-v2
    [*] --> Created: new Component()
    Created --> Mounted: mount()
    Mounted --> Rendered: render()
    Rendered --> Updated: state change
    Updated --> Rendered: render()
    Rendered --> Unmounted: unmount()
    Unmounted --> [*]

    note right of Mounted
        - Attach to DOM
        - Subscribe to events
        - Initialize state
    end note

    note right of Rendered
        - Update DOM
        - Reflect current state
    end note

    note right of Unmounted
        - Clean up listeners
        - Remove from DOM
        - Release resources
    end note
```

---

## 8. Shape & Binding System

```mermaid
---
config:
  layout: elk
---
classDiagram
    class Shape {
        <<abstract>>
        +string id
        +string type
        +Position position
        +Map bindings
        +getBindableProperties()
        +setBinding(property, binding)
        +getBinding(property)
        +resolve(paramStore, resolver)
        +render(ctx)
        +getBounds()
        +containsPoint(x, y)
        +clone()
        +toJSON()
    }

    class Circle {
        +number centerX
        +number centerY
        +number radius
        +getBindableProperties()
        +render(ctx)
        +getBounds()
        +containsPoint(x, y)
    }

    class Rectangle {
        +number x
        +number y
        +number width
        +number height
        +getBindableProperties()
        +render(ctx)
        +getBounds()
        +containsPoint(x, y)
    }

    class ShapeRegistry {
        <<static>>
        -Map registry
        +register(type, createFn, fromJSONFn)
        +create(type, position, options)
        +fromJSON(json)
        +isRegistered(type)
        +getAvailableTypes()
    }

    class ShapeBuilder {
        -string type
        -string id
        -Position position
        -Map properties
        -Map bindings
        -Decorator[] decorators
        +withId(id)
        +at(x, y)
        +withProperty(name, value)
        +withBinding(property, binding)
        +withDecorator(type, options)
        +validate()
        +build()
    }

    class Binding {
        <<interface>>
        +resolve(paramStore, bindingResolver)
    }

    class ParameterBinding {
        -string parameterName
        +resolve(paramStore, bindingResolver)
    }

    class ExpressionBinding {
        -string expression
        -string[] dependencies
        +resolve(paramStore, bindingResolver)
    }

    class ProcessedBinding {
        -Binding sourceBinding
        -BindingHandler[] handlers
        +resolve(paramStore, bindingResolver)
    }

    class BindingHandler {
        <<interface>>
        +process(value)
    }

    class ClampHandler {
        -number min
        -number max
        +process(value)
    }

    class RoundHandler {
        -number decimals
        +process(value)
    }

    class ShapeDecorator {
        <<abstract>>
        -Shape wrappedShape
        +render(ctx)
    }

    class FillDecorator {
        -string color
        +render(ctx)
    }

    class BorderDecorator {
        -string color
        -number width
        +render(ctx)
    }

    class ShadowDecorator {
        -number blur
        -string color
        +render(ctx)
    }

    Shape <|-- Circle
    Shape <|-- Rectangle
    Shape --> Binding

    Binding <|.. ParameterBinding
    Binding <|.. ExpressionBinding
    Binding <|.. ProcessedBinding

    ProcessedBinding --> Binding
    ProcessedBinding --> BindingHandler

    BindingHandler <|.. ClampHandler
    BindingHandler <|.. RoundHandler

    ShapeRegistry ..> Shape : creates
    ShapeBuilder ..> Shape : builds
    ShapeBuilder --> ShapeRegistry

    ShapeDecorator <|-- FillDecorator
    ShapeDecorator <|-- BorderDecorator
    ShapeDecorator <|-- ShadowDecorator
    ShapeDecorator --> Shape : wraps
```

### Binding Resolution Flow

```mermaid
flowchart TB
    Start[Shape with Bindings] --> BR[BindingResolver]
    BR --> Check{Has Binding?}

    Check -->|Yes| GetBinding[Get Binding]
    Check -->|No| UseDefault[Use Default Value]

    GetBinding --> Type{Binding Type?}

    Type -->|Parameter| PB[ParameterBinding]
    Type -->|Expression| EB[ExpressionBinding]
    Type -->|Processed| PRB[ProcessedBinding]

    PB --> PS[Get from ParameterStore]
    EB --> Eval[Evaluate Expression]
    PRB --> SB[Resolve Source Binding]

    Eval --> Deps[Get Dependencies from ParameterStore]
    Deps --> Calc[Calculate Result]

    SB --> Handlers[Apply Handlers Chain]
    Handlers --> Clamp[ClampHandler]
    Clamp --> Round[RoundHandler]
    Round --> Final

    PS --> Final[Final Value]
    Calc --> Final
    UseDefault --> Final

    Final --> ResolvedShape[Resolved Shape]
    ResolvedShape --> Render[Render to Canvas]
```

---

## 9. Plugin System Architecture

```mermaid
graph TB
    subgraph "Plugin System"
        PM[PluginManager]
        PA[PluginAPI]

        subgraph "Plugin Lifecycle"
            Load[Load Plugin]
            Init[Initialize]
            Register[Register Features]
            Active[Active]
            Unload[Unload]
        end

        subgraph "Plugin Capabilities"
            RS[Register Shapes]
            RC[Register Commands]
            RB[Register Bindings]
            UI[Add UI Elements]
            Hooks[Register Hooks]
        end
    end

    subgraph "Core System"
        SR[ShapeRegistry]
        CR_Core[CommandRegistry]
        BR_Core[BindingRegistry]
        EB[EventBus]
        App[Application]
    end

    PM --> PA
    PA --> SR
    PA --> CR_Core
    PA --> BR_Core
    PA --> EB
    PA --> App

    Load --> Init
    Init --> Register
    Register --> Active
    Active --> Unload

    Register --> RS
    Register --> RC
    Register --> RB
    Register --> UI
    Register --> Hooks

    RS --> SR
    RC --> CR_Core
    RB --> BR_Core
    UI --> App
    Hooks --> EB
```

### Plugin Example

```mermaid
classDiagram
    class Plugin {
        <<abstract>>
        +string name
        +string version
        +string[] dependencies
        +init(api)
        +destroy()
    }

    class PluginAPI {
        -Application app
        -ShapeRegistry shapeRegistry
        -CommandRegistry commandRegistry
        -BindingRegistry bindingRegistry
        -EventBus eventBus
        +registerShape(type, createFn, fromJSONFn)
        +registerCommand(name, CommandClass)
        +registerBinding(type, BindingClass)
        +subscribeEvent(event, callback)
        +addMenuItem(config)
        +addToolbarButton(config)
    }

    class PluginManager {
        -Plugin[] plugins
        -PluginAPI api
        +register(plugin)
        +load(pluginId)
        +unload(pluginId)
        +getPlugin(pluginId)
        +getAllPlugins()
    }

    class CustomShapePlugin {
        +string name
        +init(api)
        +destroy()
        -registerTriangle()
        -registerPentagon()
    }

    PluginManager --> PluginAPI
    PluginManager --> Plugin
    Plugin <|-- CustomShapePlugin
    PluginAPI --> ShapeRegistry
    PluginAPI --> CommandRegistry
```

---

## 10. Command & History System

```mermaid
graph TB
    subgraph "Command Pattern"
        CMD[Command Interface]

        subgraph "Concrete Commands"
            CreateShape[CreateShapeCommand]
            DeleteShape[DeleteShapeCommand]
            MoveShape[MoveShapeCommand]
            UpdateParam[UpdateParameterCommand]
        end

        CMD -.->|Implements| CreateShape
        CMD -.->|Implements| DeleteShape
        CMD -.->|Implements| MoveShape
        CMD -.->|Implements| UpdateParam
    end

    subgraph "Command Registry"
        CR[CommandRegistry]
        History[Command History]
        Index[History Index]

        CR --> History
        CR --> Index
    end

    subgraph "Memento Pattern"
        Originator[SceneState]
        Memento[SceneMemento]
        Caretaker[SceneHistory]

        Originator -->|createMemento| Memento
        Memento -->|restoreMemento| Originator
        Caretaker --> Memento
    end

    CreateShape --> CR
    DeleteShape --> CR
    MoveShape --> CR
    UpdateParam --> CR

    CR -->|Execute| Originator
    Originator -->|Save State| Caretaker

    subgraph "User Actions"
        Undo[Undo Ctrl+Z]
        Redo[Redo Ctrl+Y]
    end

    Undo --> Caretaker
    Redo --> Caretaker
    Caretaker --> Originator
```

### History System Flow

```mermaid
sequenceDiagram
    participant User
    participant App
    participant History as SceneHistory
    participant Scene as SceneState
    participant Store as ShapeStore/ParameterStore

    User->>App: Perform Action (Add Shape)
    App->>Store: add(shape)
    Store->>EventBus: emit(SHAPE_ADDED)
    EventBus->>App: notify
    App->>Scene: createMemento()
    Scene->>Scene: serialize state
    Scene-->>App: SceneMemento
    App->>History: push(memento)

    Note over History: Stack: [M1, M2, M3]<br/>Index: 2

    User->>App: Undo (Ctrl+Z)
    App->>History: undo()
    History-->>App: previous memento (M2)
    App->>Scene: restoreMemento(M2)
    Scene->>Store: restore shapes
    Scene->>Store: restore parameters
    Store->>EventBus: emit events
    EventBus->>UI: update components

    Note over History: Stack: [M1, M2, M3]<br/>Index: 1

    User->>App: Redo (Ctrl+Y)
    App->>History: redo()
    History-->>App: next memento (M3)
    App->>Scene: restoreMemento(M3)
    Scene->>Store: restore shapes
    Scene->>Store: restore parameters
    Store->>EventBus: emit events

    Note over History: Stack: [M1, M2, M3]<br/>Index: 2
```

---


