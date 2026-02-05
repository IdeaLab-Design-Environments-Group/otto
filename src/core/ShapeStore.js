/**
 * @fileoverview Central repository for all shapes in a single scene, with
 * integrated selection management, edge-selection support, and joinery
 * metadata storage.
 *
 * Design patterns: Repository + Mediator
 *   - Repository -- ShapeStore is the single source of truth for every
 *     shape that exists in the current tab.  All reads and writes to shapes
 *     go through this class; no other module holds a long-lived, mutable
 *     reference to a shape outside of ShapeStore.
 *   - Mediator   -- ShapeStore sits at the intersection of several
 *     subsystems.  It holds a reference to ParameterStore (so it can
 *     resolve bindings) and to BindingResolver (which performs the actual
 *     resolution).  It also owns the edge-selection state and the
 *     joinery map, acting as the single place where edge-related queries
 *     from the UI can be answered without the UI needing to know about
 *     the geometry subsystem.
 *
 * Selection duality
 *   ShapeStore tracks selection in two parallel ways:
 *     - {@link ShapeStore#selectedShapeId}  -- a single ID, kept for
 *       backward compatibility with older UI code that only understands
 *       "the selected shape".
 *     - {@link ShapeStore#selectedShapeIds} -- a Set of IDs, used by
 *       newer code that supports rubber-band multi-selection.
 *   The two are kept in sync by every selection method.  The "primary"
 *   selection (selectedShapeId) is always the most-recently-added member
 *   of the Set, or null when the Set is empty.
 *
 * Edge selection
 *   When the user switches to edge-selection mode (e.g. to assign joinery
 *   to a woodworking joint), the store delegates the actual selected-edge
 *   bookkeeping to an {@link EdgeSelection} helper.  It also owns the
 *   {@link #edgeJoinery} map that persists joinery metadata across
 *   save/load cycles.
 *
 * Serialization
 *   {@link ShapeStore#toJSON} / {@link ShapeStore#fromJSON} round-trip the
 *   full state: shapes, selection IDs, and edge-joinery entries.  fromJSON
 *   is async because shape reconstruction requires a dynamic import of
 *   ShapeRegistry (to avoid circular dependencies at module-load time).
 *
 * @module core/ShapeStore
 */
import EventBus, { EVENTS } from '../events/EventBus.js';
import { EdgeSelection, edgesFromItem } from '../geometry/edge/index.js';

export class ShapeStore {
    /**
     * Construct a new ShapeStore wired to the given parameter and binding
     * subsystems.
     *
     * @param {ParameterStore}  parameterStore   The store that holds all
     *     user-defined numeric parameters for this scene.  Passed through to
     *     the BindingResolver so that parameter-reference bindings can look
     *     up current values.
     * @param {BindingResolver} bindingResolver  The facade that knows how to
     *     turn a Binding object into a concrete number.  Used by
     *     {@link ShapeStore#getResolved} and {@link ShapeStore#getEdgesForShape}.
     */
    constructor(parameterStore, bindingResolver) {
        /**
         * The canonical shape map for this scene.  Keys are shape IDs
         * (opaque strings); values are Shape objects in their raw,
         * possibly-bound form.  Use {@link ShapeStore#getResolved} to obtain
         * shapes with all bindings evaluated.
         * @type {Map<string, Shape>}
         */
        this.shapes = new Map(); // Map<id, Shape>
        this.parameterStore = parameterStore;
        this.bindingResolver = bindingResolver;

        /**
         * The ID of the "primary" selected shape.  Maintained in parallel
         * with {@link #selectedShapeIds} for backward compatibility with UI
         * code that was written before multi-selection was added.  Always
         * equals the most-recently-added ID in the Set, or null.
         * @type {string|null}
         */
        this.selectedShapeId = null; // Single selection (for backward compatibility)

        /**
         * The full set of currently-selected shape IDs.  This is the
         * authoritative selection when multiple shapes are selected at once
         * (e.g. via rubber-band drag or Shift+click).
         * @type {Set<string>}
         */
        this.selectedShapeIds = new Set(); // Multi-selection
        this.eventBus = EventBus;

        // ── Edge selection state ────────────────────────────────────────
        /**
         * Delegate that tracks which edges are selected.  Wraps the
         * selection logic (add, remove, toggle, has) so that ShapeStore
         * does not have to re-implement it.
         * @type {EdgeSelection}
         */
        this.edgeSelection = new EdgeSelection();
        /**
         * The current selection mode.  When {@code 'shape'}, clicks select
         * whole shapes; when {@code 'edge'}, clicks select individual edges
         * for joinery assignment.  Switching back to {@code 'shape'} clears
         * the edge selection automatically.
         * @type {'shape'|'edge'}
         */
        this.selectionMode = 'shape'; // 'shape' | 'edge'
        /**
         * The edge (plus cursor position) that the pointer is hovering over,
         * or null.  Used by the renderer to draw an edge-highlight before the
         * user clicks.
         * @type {{edge: Edge, position: Vec}|null}
         */
        this.hoveredEdge = null;
        /**
         * Persistent map of joinery metadata keyed by a canonical edge key
         * string (produced by {@link EdgeSelection.keyFor}).  Each value
         * records the joinery type (e.g. "fingerJoint"), the material
         * thickness in millimetres, the finger count, and the alignment
         * direction.  Survives save/load via {@link #toJSON} / {@link #fromJSON}.
         * @type {Map<string, {type: string, thicknessMm: number, fingerCount: number, align: string}>}
         */
        this.edgeJoinery = new Map(); // Map<edgeKey, { type, thicknessMm }>

        // ── Shape hover state ───────────────────────────────────────────
        /**
         * The ID of the shape the pointer is currently hovering over, or
         * null.  Emits {@link EVENTS.SHAPE_HOVERED} on change so that the
         * renderer can draw a hover highlight.
         * @type {string|null}
         */
        this.hoveredShapeId = null;
    }
    
    /**
     * Insert a shape into the store and notify listeners.
     *
     * This is the ONLY way a shape should enter the store.  All creation
     * paths (drag-drop, duplicate, paste, deserialization) funnel through
     * here so that the {@link EVENTS.SHAPE_ADDED} event fires exactly once
     * per shape.
     *
     * @param {Shape} shape  A fully-constructed Shape object.  Must have a
     *     unique {@code id} property; if a shape with the same ID already
     *     exists the method throws rather than silently overwriting.
     * @throws {Error} If {@code shape.id} is already present in the store.
     */
    add(shape) {
        if (this.shapes.has(shape.id)) {
            throw new Error(`Shape with id ${shape.id} already exists`);
        }
        this.shapes.set(shape.id, shape);
        this.eventBus.emit(EVENTS.SHAPE_ADDED, shape);
    }

    /**
     * Remove a shape and cascade-clean all state that references it.
     *
     * Cleanup responsibilities beyond the shapes Map itself:
     *   - If the removed shape was the single-selection target, clear it.
     *   - Remove the ID from the multi-selection Set.
     *   - Delete every joinery entry whose key begins with {@code "<id>:"}
     *     (the canonical key format used by {@link EdgeSelection.keyFor}).
     *
     * If no shape with the given ID exists, this method is a safe no-op.
     *
     * @param {string} id  The ID of the shape to remove.
     */
    remove(id) {
        const shape = this.shapes.get(id);
        if (shape) {
            this.shapes.delete(id);
            if (this.selectedShapeId === id) {
                this.selectedShapeId = null;
            }
            this.selectedShapeIds.delete(id);
            // Purge any joinery metadata that was attached to edges of this
            // shape.  Edge keys are prefixed with the owning shape's ID.
            const prefix = `${id}:`;
            for (const key of this.edgeJoinery.keys()) {
                if (key.startsWith(prefix)) {
                    this.edgeJoinery.delete(key);
                }
            }
            this.eventBus.emit(EVENTS.SHAPE_REMOVED, { id });
        }
    }

    /**
     * Look up a single shape by its ID.
     *
     * Returns the raw (possibly-bound) shape object.  If you need concrete
     * numeric values for rendering or hit-testing, use {@link #getResolved}
     * instead.
     *
     * @param {string} id  The shape ID to look up.
     * @returns {Shape|null} The shape, or null if not found.
     */
    get(id) {
        return this.shapes.get(id) || null;
    }

    /**
     * Return every shape in the store as a flat array.
     *
     * The array is a snapshot; mutating it does not affect the store.  The
     * shapes themselves ARE the live objects, so mutations to their
     * properties will be reflected in subsequent reads.
     *
     * @returns {Array<Shape>} All shapes, in insertion order.
     */
    getAll() {
        return Array.from(this.shapes.values());
    }

    /**
     * Return all shapes with every parameter binding resolved to its
     * current concrete value.
     *
     * This is the method the CanvasRenderer calls before each paint pass.
     * The returned shapes are clones produced by {@link BindingResolver#resolveAll};
     * mutating them does NOT affect the store.
     *
     * @returns {Array<Shape>} Resolved (cloned) copies of every shape.
     */
    getResolved() {
        return this.bindingResolver.resolveAll(this.getAll());
    }

    /**
     * Overwrite a shape's position and notify listeners.
     *
     * Unlike the Command-based move path (which mutates centerX/centerY
     * directly), this method writes to a generic {@code position} property.
     * It is used by code paths that do not need undo support (e.g. live
     * drag feedback during a mouse-move sequence).
     *
     * @param {string} id  The ID of the shape to reposition.
     * @param {number} x   New X coordinate (world units).
     * @param {number} y   New Y coordinate (world units).
     * @throws {Error} If no shape with the given ID exists.
     */
    updatePosition(id, x, y) {
        const shape = this.shapes.get(id);
        if (!shape) {
            throw new Error(`Shape with id ${id} not found`);
        }

        const oldPosition = { ...shape.position };
        shape.position = { x, y };

        this.eventBus.emit(EVENTS.SHAPE_MOVED, {
            id,
            shape,
            oldPosition,
            newPosition: { x, y }
        });
    }

    /**
     * Attach or replace a Binding on a single property of a shape, then
     * signal that a re-render is needed.
     *
     * A Binding is an object that, when resolved, produces a number.  It
     * may be a literal value, a reference to a named parameter in
     * ParameterStore, or an expression that references one or more
     * parameters.  This method does not resolve the binding -- it simply
     * stores it on the shape so that the next {@link #getResolved} call
     * will evaluate it.
     *
     * The {@link EVENTS.PARAM_CHANGED} event is emitted (rather than a
     * hypothetical BINDING_CHANGED) because the downstream effect is
     * identical: any UI panel or renderer subscribed to parameter changes
     * needs to refresh.
     *
     * @param {string}  shapeId   The ID of the target shape.
     * @param {string}  property  The name of the bindable property (e.g.
     *     "radius", "width").
     * @param {Binding} binding   The new Binding object to attach.
     * @throws {Error} If no shape with the given ID exists.
     */
    updateBinding(shapeId, property, binding) {
        const shape = this.shapes.get(shapeId);
        if (!shape) {
            throw new Error(`Shape with id ${shapeId} not found`);
        }

        shape.setBinding(property, binding);

        // Emit param changed event to trigger re-render
        this.eventBus.emit(EVENTS.PARAM_CHANGED, {
            shapeId,
            property
        });
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // Shape Selection
    //
    // Otto supports both single and multi-selection of shapes.  To avoid
    // breaking older UI code that was written before multi-selection existed,
    // the store maintains TWO parallel representations:
    //   selectedShapeId  -- the "primary" shape (single-selection API)
    //   selectedShapeIds -- the full Set (multi-selection API)
    // Every method in this section keeps both in sync.  The primary ID is
    // always the most-recently-added member of the Set, or null when empty.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Return the single "primary" selected shape.
     *
     * Legacy accessor.  Code that only cares about one selected shape uses
     * this; code that needs to iterate the full selection uses
     * {@link #getSelectedIds}.
     *
     * @returns {Shape|null} The primary selected shape, or null.
     */
    getSelected() {
        return this.selectedShapeId ? this.shapes.get(this.selectedShapeId) : null;
    }

    /**
     * Replace the entire selection with a single shape.
     *
     * This is the legacy single-selection setter.  It clears the
     * multi-selection Set and repopulates it with just {@code id}.  Passing
     * null clears the selection entirely.  A {@link EVENTS.SHAPE_SELECTED}
     * event is emitted only when the primary ID actually changes, preventing
     * redundant re-renders on repeated clicks on the same shape.
     *
     * @param {string|null} id  The shape to select, or null to deselect all.
     */
    setSelected(id) {
        const oldSelectedId = this.selectedShapeId;
        this.selectedShapeId = id;
        this.selectedShapeIds.clear();
        if (id) {
            this.selectedShapeIds.add(id);
        }

        if (oldSelectedId !== id) {
            this.eventBus.emit(EVENTS.SHAPE_SELECTED, {
                id,
                shape: id ? this.shapes.get(id) : null
            });
        }
    }

    /**
     * Return a snapshot of the currently-selected shape IDs.
     *
     * The returned Set is a copy; mutating it has no effect on the store's
     * internal state.
     *
     * @returns {Set<string>} A new Set containing every selected shape ID.
     */
    getSelectedIds() {
        return new Set(this.selectedShapeIds);
    }

    /**
     * Add a single shape to the existing selection (Shift+click behaviour).
     *
     * The shape also becomes the new primary selection so that the
     * PropertiesPanel shows its properties.  If the shape does not exist in
     * the store, the call is a no-op.
     *
     * @param {string} id  The ID of the shape to add to the selection.
     */
    addToSelection(id) {
        if (this.shapes.has(id)) {
            this.selectedShapeIds.add(id);
            this.selectedShapeId = id; // Set as primary selection
            this.eventBus.emit(EVENTS.SHAPE_SELECTED, {
                id,
                shape: this.shapes.get(id),
                selectedIds: Array.from(this.selectedShapeIds)
            });
        }
    }

    /**
     * Remove a single shape from the selection (Shift+click on an already-
     * selected shape).
     *
     * If the removed shape was the primary selection, the primary is
     * reassigned to the first remaining ID in the Set (arbitrary but
     * deterministic), or null if the Set is now empty.
     *
     * @param {string} id  The ID of the shape to deselect.
     */
    removeFromSelection(id) {
        this.selectedShapeIds.delete(id);
        if (this.selectedShapeId === id) {
            // Set another selected shape as primary, or null
            this.selectedShapeId = this.selectedShapeIds.size > 0
                ? Array.from(this.selectedShapeIds)[0]
                : null;
        }

        // Emit selection event when removing from selection
        this.eventBus.emit(EVENTS.SHAPE_SELECTED, {
            id: this.selectedShapeId,
            shape: this.selectedShapeId ? this.shapes.get(this.selectedShapeId) : null,
            selectedIds: Array.from(this.selectedShapeIds)
        });
    }

    /**
     * Replace the entire selection with the given list of IDs (rubber-band
     * select or programmatic batch select).
     *
     * IDs that do not correspond to shapes currently in the store are
     * silently ignored.  The first ID in the array becomes the primary
     * selection.
     *
     * @param {Array<string>} ids  The IDs to select.  Pass an empty array to
     *     clear the selection.
     */
    setSelectedIds(ids) {
        this.selectedShapeIds.clear();
        ids.forEach(id => {
            if (this.shapes.has(id)) {
                this.selectedShapeIds.add(id);
            }
        });
        this.selectedShapeId = ids.length > 0 ? ids[0] : null;

        this.eventBus.emit(EVENTS.SHAPE_SELECTED, {
            id: this.selectedShapeId,
            shape: this.selectedShapeId ? this.shapes.get(this.selectedShapeId) : null,
            selectedIds: Array.from(this.selectedShapeIds)
        });
    }

    /**
     * Deselect everything.  Resets both the single and multi-selection
     * state and emits {@link EVENTS.SHAPE_SELECTED} with nulls so that
     * the PropertiesPanel knows to hide itself.
     */
    clearSelection() {
        this.selectedShapeId = null;
        this.selectedShapeIds.clear();
        this.eventBus.emit(EVENTS.SHAPE_SELECTED, {
            id: null,
            shape: null,
            selectedIds: []
        });
    }

    /**
     * Select every shape in the store (Ctrl+A).  Delegates to
     * {@link #setSelectedIds} so that both selection representations and
     * the event emission are handled in one place.
     */
    selectAll() {
        const allIds = Array.from(this.shapes.keys());
        this.setSelectedIds(allIds);
    }

    // =========================================================================
    // Edge Selection Methods
    //
    // Otto has two selection modes that the user can toggle:
    //   'shape' -- clicking selects whole shapes (the default).
    //   'edge'  -- clicking selects individual edges of shapes so that the
    //             user can assign joinery (e.g. finger joints) to them.
    //
    // When the mode switches back to 'shape', edge selection state is
    // discarded to prevent stale selections from confusing the UI.
    //
    // Edge objects are ephemeral -- they are regenerated from the resolved
    // geometry every time they are needed.  They are NOT stored in the
    // shapes Map.  The only edge-related state that persists is the
    // joinery metadata in {@link #edgeJoinery}, keyed by a canonical string
    // produced by EdgeSelection.keyFor().
    // =========================================================================

    /**
     * Switch the global selection mode.
     *
     * When switching TO {@code 'shape'} mode, all edge selection state is
     * cleared and the hovered-edge tracker is reset.  This prevents the UI
     * from showing stale edge highlights after the user has returned to
     * normal shape-selection behaviour.
     *
     * Emits {@link EVENTS.SELECTION_MODE_CHANGED} so that toolbar buttons
     * and renderers can update their visual state.
     *
     * @param {'shape'|'edge'} mode  The new selection mode.
     */
    setSelectionMode(mode) {
        if (this.selectionMode !== mode) {
            this.selectionMode = mode;
            // Clear edge selection when switching to shape mode
            if (mode === 'shape') {
                this.edgeSelection.clear();
                this.hoveredEdge = null;
            }
            this.eventBus.emit(EVENTS.SELECTION_MODE_CHANGED, { mode });
        }
    }

    /**
     * Return the current selection mode string.
     *
     * @returns {'shape'|'edge'} The active selection mode.
     */
    getSelectionMode() {
        return this.selectionMode;
    }

    /**
     * Extract the geometric edges of a single shape.
     *
     * The shape is first resolved (bindings evaluated) and then converted
     * to a geometry path via {@code toGeometryPath()}.  The path is fed to
     * {@link edgesFromItem}, which splits it into discrete Edge objects.
     * Each returned Edge has its {@code shapeId} field stamped so that
     * downstream code (hit-testing, joinery lookup) knows which shape it
     * belongs to.
     *
     * Shapes that do not implement {@code toGeometryPath} (or whose path
     * is null) produce an empty array.
     *
     * @param {string} shapeId  The ID of the shape whose edges are wanted.
     * @returns {import('../geometry/edge/index.js').Edge[]} The edges, or
     *     an empty array if the shape is not found or has no geometry path.
     */
    getEdgesForShape(shapeId) {
        const shape = this.shapes.get(shapeId);
        if (!shape) return [];

        const resolved = this.bindingResolver.resolveShape(shape);
        const path = resolved.toGeometryPath ? resolved.toGeometryPath() : null;
        if (!path) return [];

        const edges = edgesFromItem(path);
        edges.forEach(edge => {
            edge.shapeId = shapeId;
        });
        return edges;
    }

    /**
     * Extract the geometric edges of every shape currently in the store.
     *
     * Uses the already-resolved shape array from {@link #getResolved} to
     * avoid resolving each shape twice.  Useful when the renderer needs to
     * draw edge highlights over the entire canvas in edge-selection mode.
     *
     * @returns {import('../geometry/edge/index.js').Edge[]} All edges across
     *     all shapes, each stamped with its owning {@code shapeId}.
     */
    getEdgesForAllShapes() {
        const edges = [];
        const resolvedShapes = this.getResolved();
        resolvedShapes.forEach(shape => {
            if (!shape.toGeometryPath) return;
            const path = shape.toGeometryPath();
            const shapeEdges = edgesFromItem(path);
            shapeEdges.forEach(edge => {
                edge.shapeId = shape.id;
            });
            edges.push(...shapeEdges);
        });
        return edges;
    }

    /**
     * Extract edges only for the shapes that are currently selected.
     *
     * Narrows the edge set to the selection so that, for example, the
     * joinery panel only shows edges that belong to shapes the user has
     * explicitly picked.
     *
     * @returns {import('../geometry/edge/index.js').Edge[]} Edges from the
     *     selected shapes only.
     */
    getEdgesForSelectedShapes() {
        const edges = [];
        this.selectedShapeIds.forEach(id => {
            edges.push(...this.getEdgesForShape(id));
        });
        return edges;
    }

    /**
     * Replace the current edge selection with exactly one edge (plain
     * click in edge mode -- no modifier keys).
     *
     * Delegates the bookkeeping to the internal {@link EdgeSelection}
     * helper, then emits {@link EVENTS.EDGE_SELECTED} so the joinery
     * panel and renderer can update.
     *
     * @param {import('../geometry/edge/index.js').Edge} edge  The edge to
     *     make the sole selection.
     */
    selectEdge(edge) {
        this.edgeSelection.set(edge);
        this.eventBus.emit(EVENTS.EDGE_SELECTED, {
            edge,
            edges: this.edgeSelection.all()
        });
    }

    /**
     * Add an edge to the current selection without clearing the others
     * (Shift+click in edge mode).
     *
     * @param {import('../geometry/edge/index.js').Edge} edge  The edge to
     *     add.
     */
    addEdgeToSelection(edge) {
        this.edgeSelection.add(edge);
        this.eventBus.emit(EVENTS.EDGE_SELECTED, {
            edge,
            edges: this.edgeSelection.all()
        });
    }

    /**
     * Remove a specific edge from the selection without touching the rest.
     *
     * The {@code edge} field in the emitted payload is set to null to
     * indicate that no single edge was the "cause" of the change (contrast
     * with {@link #selectEdge} where the payload edge IS the new selection).
     *
     * @param {import('../geometry/edge/index.js').Edge} edge  The edge to
     *     deselect.
     */
    removeEdgeFromSelection(edge) {
        this.edgeSelection.remove(edge);
        this.eventBus.emit(EVENTS.EDGE_SELECTED, {
            edge: null,
            edges: this.edgeSelection.all()
        });
    }

    /**
     * Toggle an edge's presence in the selection.  If it was selected it
     * is removed; if it was not selected it is added.  This is the
     * behaviour produced by Shift+click (or Ctrl+click on some platforms)
     * when the edge is already highlighted.
     *
     * @param {import('../geometry/edge/index.js').Edge} edge  The edge to
     *     toggle.
     */
    toggleEdgeSelection(edge) {
        const isNowSelected = this.edgeSelection.toggle(edge);
        this.eventBus.emit(EVENTS.EDGE_SELECTED, {
            edge: isNowSelected ? edge : null,
            edges: this.edgeSelection.all()
        });
    }

    /**
     * Deselect every edge and clear the hovered-edge state.  Called when
     * the user clicks on empty canvas in edge mode, or when switching back
     * to shape-selection mode.
     */
    clearEdgeSelection() {
        this.edgeSelection.clear();
        this.hoveredEdge = null;
        this.eventBus.emit(EVENTS.EDGE_SELECTED, {
            edge: null,
            edges: []
        });
    }

    /**
     * Return the array of all currently-selected edges.
     *
     * The returned array is a snapshot produced by the internal
     * {@link EdgeSelection} helper; mutating it does not affect state.
     *
     * @returns {import('../geometry/edge/index.js').Edge[]} Currently
     *     selected edges, or an empty array.
     */
    getSelectedEdges() {
        return this.edgeSelection.all();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Edge Joinery
    //
    // Joinery metadata describes how two edges that will be physically joined
    // (e.g. in a CNC-cut wooden box) should be cut.  The metadata is stored
    // in a flat Map keyed by the canonical edge-key string so that it
    // survives serialization and deserialization without depending on live
    // Edge object identity.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Persist joinery metadata for an edge.
     *
     * The metadata object is shallow-copied before storage so that the
     * caller cannot mutate it after the fact.  The {@code align} field
     * defaults to {@code 'left'} when not supplied.
     *
     * Emits {@link EVENTS.EDGE_JOINERY_CHANGED} so that the joinery
     * preview in the CanvasRenderer re-draws with the new settings.
     *
     * @param {import('../geometry/edge/index.js').Edge} edge  The target
     *     edge.  Must not be null.
     * @param {{type: string, thicknessMm: number, fingerCount: number, align?: string}} joinery
     *     The joinery descriptor.  {@code type} identifies the joint kind
     *     (e.g. "fingerJoint").  {@code thicknessMm} is the material
     *     thickness in millimetres.  {@code fingerCount} is the number of
     *     interlocking fingers.  {@code align} controls which side the
     *     first finger starts on.
     */
    setEdgeJoinery(edge, joinery) {
        if (!edge || !joinery) return;
        const key = EdgeSelection.keyFor(edge);
        this.edgeJoinery.set(key, {
            type: joinery.type,
            thicknessMm: joinery.thicknessMm,
            fingerCount: joinery.fingerCount,
            align: joinery.align || 'left'
        });
        this.eventBus.emit(EVENTS.EDGE_JOINERY_CHANGED, {
            edge,
            joinery: { ...joinery }
        });
    }

    /**
     * Retrieve the joinery metadata previously stored for an edge.
     *
     * Key-format fallback
     *   The canonical key is produced by {@link EdgeSelection.keyFor}, which
     *   incorporates the owning shape's ID.  Older saved files may have been
     *   written with a legacy key format of {@code "<pathIndex>:<index>"}
     *   that does not include the shape ID.  If the canonical lookup misses,
     *   this method falls back to the legacy format so that files saved
     *   before the key scheme was updated can still be loaded correctly.
     *
     * @param {import('../geometry/edge/index.js').Edge} edge  The edge to
     *     look up.
     * @returns {{type: string, thicknessMm: number, fingerCount: number, align: string}|null}
     *     The stored joinery object, or null if none has been assigned.
     */
    getEdgeJoinery(edge) {
        if (!edge) return null;
        const key = EdgeSelection.keyFor(edge);
        if (this.edgeJoinery.has(key)) {
            return this.edgeJoinery.get(key) || null;
        }
        // Legacy key fallback for files saved before shapeId was part of the key
        if (edge?.shapeId) {
            const legacyKey = `${edge.pathIndex}:${edge.index}`;
            return this.edgeJoinery.get(legacyKey) || null;
        }
        return null;
    }

    /**
     * Query whether a given edge is in the current edge selection.
     *
     * @param {import('../geometry/edge/index.js').Edge} edge  The edge to
     *     test.
     * @returns {boolean} True if the edge is selected; false otherwise.
     */
    isEdgeSelected(edge) {
        return this.edgeSelection.has(edge);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Hover State
    //
    // Hover state is ephemeral -- it is never serialised or persisted.  It
    // exists solely to give the renderer information it needs to draw
    // highlight effects under the cursor.  Each setter emits an event only
    // when the hovered target actually changes, to avoid flooding the
    // renderer with redundant paint requests during fast mouse movement.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Record which edge the pointer is currently over.
     *
     * Pass null for {@code edge} to indicate that the pointer is no longer
     * over any edge (e.g. it moved to empty canvas).  The {@code position}
     * parameter carries the exact world-space cursor location so that the
     * renderer can draw a tooltip or highlight at the right spot.
     *
     * Emits {@link EVENTS.EDGE_HOVERED}.
     *
     * @param {import('../geometry/edge/index.js').Edge|null} edge  The edge
     *     under the pointer, or null.
     * @param {import('../geometry/Vec.js').Vec|null} [position=null]  The
     *     world-space position of the pointer at the time of the hover.
     */
    setHoveredEdge(edge, position = null) {
        this.hoveredEdge = edge ? { edge, position } : null;
        this.eventBus.emit(EVENTS.EDGE_HOVERED, {
            edge,
            position
        });
    }

    /**
     * Return the currently-hovered edge descriptor, or null.
     *
     * @returns {{edge: import('../geometry/edge/index.js').Edge, position: import('../geometry/Vec.js').Vec}|null}
     *     An object containing the hovered edge and the pointer position at
     *     the time it was set, or null if no edge is hovered.
     */
    getHoveredEdge() {
        return this.hoveredEdge;
    }

    /**
     * Record which shape the pointer is currently over.
     *
     * Emits {@link EVENTS.SHAPE_HOVERED} only when the hovered shape ID
     * actually changes, preventing redundant events during fast mouse
     * movement across the same shape.
     *
     * @param {string|null} shapeId  The ID of the shape under the pointer,
     *     or null if the pointer is over empty canvas.
     */
    setHoveredShape(shapeId) {
        if (this.hoveredShapeId !== shapeId) {
            this.hoveredShapeId = shapeId;
            this.eventBus.emit(EVENTS.SHAPE_HOVERED, {
                shapeId
            });
        }
    }

    /**
     * Return the ID of the shape the pointer is currently hovering over.
     *
     * @returns {string|null} The hovered shape ID, or null.
     */
    getHoveredShapeId() {
        return this.hoveredShapeId;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Serialization
    //
    // toJSON / fromJSON round-trip the full observable state of the store:
    //   - All shapes (via each Shape's own toJSON)
    //   - The current selection (both single and multi IDs)
    //   - All edge-joinery metadata
    //
    // Ephemeral state (hover, live edge selection) is intentionally NOT
    // serialised; it will be reset to a clean default when the scene is
    // loaded.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Produce a plain-object snapshot of the store suitable for
     * {@code JSON.stringify}.
     *
     * The shapes array preserves insertion order.  The edgeJoinery array
     * flattens the Map into an array of {@code {key, ...metadata}} objects
     * because JSON has no native Map type.
     *
     * @returns {{shapes: Array<Object>, selectedShapeId: string|null, selectedShapeIds: Array<string>, edgeJoinery: Array<Object>}}
     *     The serialised store.
     */
    toJSON() {
        return {
            shapes: Array.from(this.shapes.values()).map(shape => shape.toJSON()),
            selectedShapeId: this.selectedShapeId,
            selectedShapeIds: Array.from(this.selectedShapeIds),
            edgeJoinery: Array.from(this.edgeJoinery.entries()).map(([key, value]) => ({
                key,
                type: value.type,
                thicknessMm: value.thicknessMm,
                fingerCount: value.fingerCount,
                align: value.align || 'center'
            }))
        };
    }

    /**
     * Reconstruct the store's state from a previously-serialised snapshot.
     *
     * This method is {@code async} because it performs a dynamic
     * {@code import()} of ShapeRegistry.  The dynamic import is necessary to
     * break a circular dependency: ShapeStore is imported by SceneState,
     * which is imported by TabManager, and ShapeRegistry imports shape
     * classes that in turn reference SceneState-level types.  Deferring the
     * import to runtime (inside this method) avoids the cycle at
     * module-load time.
     *
     * After reconstruction, selection IDs are validated: any ID present in
     * the serialised selection that does not correspond to a shape in the
     * newly-loaded set is silently dropped.
     *
     * @param {Object} json  The object previously returned by {@link #toJSON}.
     * @throws {Error} If json is null/undefined or lacks a {@code shapes}
     *     array.
     */
    async fromJSON(json) {
        if (!json || !json.shapes) {
            throw new Error('Invalid ShapeStore JSON');
        }

        this.shapes.clear();
        // Dynamic import avoids circular dependency at module-load time.
        // ShapeRegistry.fromJSON dispatches to the correct Shape subclass
        // based on the 'type' field in each serialised shape object.
        const { ShapeRegistry } = await import('../models/shapes/ShapeRegistry.js');

        json.shapes.forEach(shapeJson => {
            const shape = ShapeRegistry.fromJSON(shapeJson);
            this.shapes.set(shape.id, shape);
        });

        // Restore selection state, but only keep IDs that actually exist in
        // the freshly-loaded shape set (guards against corrupted or
        // hand-edited save files).
        this.selectedShapeId = json.selectedShapeId || null;
        this.selectedShapeIds.clear();
        if (json.selectedShapeIds && Array.isArray(json.selectedShapeIds)) {
            json.selectedShapeIds.forEach(id => {
                if (this.shapes.has(id)) {
                    this.selectedShapeIds.add(id);
                }
            });
        }

        // Restore edge-joinery metadata.  Each entry is keyed by its
        // canonical edge-key string and carries the full joinery descriptor.
        this.edgeJoinery.clear();
        if (json.edgeJoinery && Array.isArray(json.edgeJoinery)) {
            json.edgeJoinery.forEach(entry => {
                if (entry && entry.key && entry.type) {
                    this.edgeJoinery.set(entry.key, {
                        type: entry.type,
                        thicknessMm: entry.thicknessMm,
                        fingerCount: entry.fingerCount,
                        align: entry.align || 'center'
                    });
                }
            });
        }
    }
}
