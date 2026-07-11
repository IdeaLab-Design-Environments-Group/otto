# Otto — Architecture (overview)

Otto is a **2.5D parametric design** environment for digital-fabrication
education, built as vanilla ES modules (no build step; third-party libs via
CDN). It follows an explicit **MVC** structure:

- **Model** — schema-driven shape classes, the parameter/shape/binding
  stores, and a single `SelectionModel`.
- **View** — a `CanvasView` that runs pure render *passes* and the panel
  components.
- **Controllers** — mouse/keyboard/viewport controllers that translate input
  into undoable **commands**; a per-tab command history owns undo/redo.

Every shape carries bindable `depth` (material thickness) and `z` (elevation)
properties for fabrication data and 2.5D canvas ordering.

## Where to read next

- **`src/ARCHITECTURE.md`** — the authoritative, current architecture doc
  (layer diagram, subsystems, command/undo flow, plugins,
  accessibility, and documented deferred debts).
- **`FROM_ZERO.md`** — the original milestone-by-milestone build guide. NOTE:
  it predates the MVC + 2.5D refactor; treat `src/ARCHITECTURE.md` as the
  source of truth where they disagree.
- **`docs/SMOKE_CHECKLIST.md`** — the manual QA pass.
- **`tests/`** — headless unit tests (`node tests/run-node.js`) and a browser
  runner (`tests/run-tests.html`).
