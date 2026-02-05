/**
 * @fileoverview Command Pattern implementation for undoable batch operations on shapes.
 *
 * This module defines the abstract Command base class and two concrete command
 * implementations used by Otto's canvas editing system.  Every user-initiated
 * mutation that must be reversible (move, duplicate, etc.) is wrapped in a
 * Command object before it touches the ShapeStore.  The commands themselves are
 * created by user-facing code (keyboard shortcuts, context menus, the
 * CommandRegistry) and pushed onto the CommandRegistry's history stack so that
 * Ctrl+Z / Ctrl+Y can walk backward and forward through the operation log.
 *
 * Design pattern: Command Pattern
 *   - Command          -- abstract interface (execute / undo)
 *   - MoveShapesCommand   -- concrete command for translating one or more shapes
 *   - DuplicateShapesCommand -- concrete command for cloning shapes with an offset
 *
 * Architectural role
 *   Commands sit between the UI layer and the ShapeStore.  They receive a
 *   ShapeStore reference at construction time so they can read and mutate
 *   shapes, but they do not own the store -- they are short-lived objects
 *   whose only lasting effect is the mutation they perform (and the snapshot
 *   they keep for undo).
 *
 * @module core/Command
 */

/**
 * Abstract base class for all undoable commands in Otto.
 *
 * Concrete subclasses MUST override both {@link Command#execute} and
 * {@link Command#undo}.  The contract is:
 *   1. Calling execute() performs the forward mutation and captures whatever
 *      internal state is needed to reverse it later.
 *   2. Calling undo() restores the world to the state it was in immediately
 *      before execute() was called.
 *   3. execute() may be called more than once (e.g. during redo), so
 *      subclasses should treat it as idempotent with respect to their
 *      captured state (re-snapshot on every execute).
 *
 * @abstract
 */
export class Command {
    /**
     * Execute the forward operation.  Subclasses must capture any state
     * required by {@link Command#undo} before applying changes.
     *
     * @abstract
     * @throws {Error} Always, if the subclass has not provided an implementation.
     */
    execute() {
        throw new Error('execute() must be implemented');
    }

    /**
     * Reverse the most recent {@link Command#execute} call, restoring all
     * affected state to its pre-execute values.
     *
     * @abstract
     * @throws {Error} Always, if the subclass has not provided an implementation.
     */
    undo() {
        throw new Error('undo() must be implemented');
    }
}

/**
 * Concrete command that translates one or more shapes by a fixed delta.
 *
 * WHY this command exists
 *   A simple "shape.x += dx" call cannot be undone.  MoveShapesCommand wraps
 *   that mutation so the CommandRegistry can push it onto the history stack
 *   and later call undo() to snap every shape back to where it was.
 *
 * Position-field conventions
 *   Otto uses two different position representations depending on shape type:
 *     - Circles, polygons, and stars are positioned by their geometric centre:
 *       {@code shape.centerX} / {@code shape.centerY}.
 *     - Rectangles are positioned by their top-left origin:
 *       {@code shape.x} / {@code shape.y}.
 *   This command is aware of both conventions.  During execute() it snapshots
 *   whichever pair of fields is relevant for each shape, and during undo() it
 *   writes those exact values back.
 *
 * @extends Command
 */
export class MoveShapesCommand extends Command {
    /**
     * @param {ShapeStore} shapeStore  The central shape repository, used to
     *     look up shapes by ID and to mutate their position fields.
     * @param {Array<string>} shapeIds The IDs of every shape that should be
     *     translated.  Shapes not found in the store are silently skipped.
     * @param {number} dx             Horizontal translation in world units
     *     (positive = right).
     * @param {number} dy             Vertical translation in world units
     *     (positive = down).
     */
    constructor(shapeStore, shapeIds, dx, dy) {
        super();
        this.shapeStore = shapeStore;
        this.shapeIds = shapeIds;
        this.dx = dx;
        this.dy = dy;
        /**
         * Snapshot array populated by execute().  Each entry records the
         * shape ID, its type tag, and the exact position fields that were in
         * place before the translation was applied.  The array is rebuilt on
         * every execute() call so that repeated redo invocations remain
         * correct even if an intermediate undo changed positions.
         *
         * @type {Array<{id: string, type: string, centerX?: number, centerY?: number, x?: number, y?: number}>}
         */
        this.originalPositions = [];
    }

    /**
     * Snapshot current positions, then apply the (dx, dy) translation.
     *
     * The snapshot step runs first because execute() will also be called
     * during a redo (after a prior undo changed the positions back), so the
     * captured state must always reflect the positions immediately before
     * THIS execution, not the original construction-time positions.
     */
    execute() {
        // Store original positions
        this.originalPositions = this.shapeIds.map(id => {
            const shape = this.shapeStore.get(id);
            if (!shape) return null;

            // Centre-based shapes: circle, polygon, star
            if (shape.type === 'circle' || shape.type === 'polygon' || shape.type === 'star') {
                return { id, type: shape.type, centerX: shape.centerX, centerY: shape.centerY };
            } else if (shape.type === 'rectangle') {
                // Origin-based shape: rectangle (top-left corner)
                return { id, type: 'rectangle', x: shape.x, y: shape.y };
            }
            return null;
        }).filter(p => p !== null);

        // Move shapes
        this.shapeIds.forEach(id => {
            const shape = this.shapeStore.get(id);
            if (!shape) return;

            if (shape.type === 'circle' || shape.type === 'polygon' || shape.type === 'star') {
                shape.centerX += this.dx;
                shape.centerY += this.dy;
            } else if (shape.type === 'rectangle') {
                shape.x += this.dx;
                shape.y += this.dy;
            }
        });
    }

    /**
     * Restore every shape to the position it held immediately before the
     * last execute() call.  Shapes that have since been deleted from the
     * store are silently skipped -- the undo is best-effort in the face of
     * concurrent removals.
     */
    undo() {
        // Restore original positions
        this.originalPositions.forEach(pos => {
            if (!pos) return;

            const shape = this.shapeStore.get(pos.id);
            if (!shape) return;

            if (pos.type === 'circle' || pos.type === 'polygon' || pos.type === 'star') {
                shape.centerX = pos.centerX;
                shape.centerY = pos.centerY;
            } else if (pos.type === 'rectangle') {
                shape.x = pos.x;
                shape.y = pos.y;
            }
        });
    }
}

/**
 * Concrete command that clones one or more shapes and places the clones at a
 * fixed pixel offset from their originals.
 *
 * WHY this command exists
 *   Duplication is a two-step operation: (1) create a new shape with a fresh
 *   ID and (2) register it in the ShapeStore.  Wrapping both steps in a
 *   command lets undo() cleanly remove every clone that was added, and lets
 *   redo() recreate them deterministically.
 *
 * Binding propagation
 *   If an original shape has parameter bindings on its properties (e.g. its
 *   radius is driven by a slider called "size"), those same bindings are
 *   copied onto the duplicate.  This means the clone will react to the same
 *   parameter changes as the original -- they share bindings, not values.
 *
 * Resolved vs raw positions
 *   The placement of each clone is calculated from the RESOLVED position of
 *   the original (i.e. after all bindings have been evaluated to concrete
 *   numbers).  This is important because the original's stored position field
 *   may itself be a binding reference rather than a literal number.
 *
 * @extends Command
 */
export class DuplicateShapesCommand extends Command {
    /**
     * @param {ShapeStore}   shapeStore    The central shape repository where
     *     originals live and clones will be inserted.
     * @param {ShapeRegistry} shapeRegistry The factory that knows how to
     *     instantiate new shape objects by type string.
     * @param {Array<string>} shapeIds     IDs of the shapes to duplicate.
     *     Shapes missing from the store are silently skipped.
     * @param {number} [offsetX=20]        Horizontal offset (world units) from
     *     the original to the clone.  Defaults to 20 so that Ctrl+D produces a
     *     visible displacement even without explicit coordinates.
     * @param {number} [offsetY=20]        Vertical offset (world units) from
     *     the original to the clone.
     */
    constructor(shapeStore, shapeRegistry, shapeIds, offsetX = 20, offsetY = 20) {
        super();
        this.shapeStore = shapeStore;
        this.shapeRegistry = shapeRegistry;
        this.shapeIds = shapeIds;
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        /**
         * IDs of every shape that was created during the most recent
         * execute().  Populated fresh on each execute() and cleared by
         * undo().  The undo handler uses this list to know exactly which
         * shapes to remove from the store.
         *
         * @type {Array<string>}
         */
        this.createdShapeIds = [];
    }

    /**
     * Create a clone of each original shape, place it at the configured
     * offset, copy all parameter bindings from the original onto the clone,
     * and register the clone in the ShapeStore.
     *
     * The method resolves each original through the BindingResolver before
     * reading its position so that the offset is applied to the real on-screen
     * location rather than to a potentially-bound symbolic value.
     */
    execute() {
        this.createdShapeIds = [];

        this.shapeIds.forEach(id => {
            const originalShape = this.shapeStore.get(id);
            if (!originalShape) return;

            // Get resolved shape to get actual position
            // Resolving is necessary because position fields may be parameter
            // bindings (e.g. "centerX = param:mySlider") rather than literals.
            const resolved = this.shapeStore.bindingResolver.resolveShape(originalShape);

            // Compute the target position for the clone.  Uses the same
            // centre-based vs origin-based split as MoveShapesCommand.
            let newPosition;
            if (originalShape.type === 'circle' || originalShape.type === 'polygon' || originalShape.type === 'star') {
                newPosition = {
                    x: resolved.centerX + this.offsetX,
                    y: resolved.centerY + this.offsetY
                };
            } else if (originalShape.type === 'rectangle') {
                newPosition = {
                    x: resolved.x + this.offsetX,
                    y: resolved.y + this.offsetY
                };
            } else {
                return;
            }

            // Create duplicate
            // ShapeRegistry.create() allocates a new unique ID and builds a
            // fully-initialised shape object of the requested type.
            const duplicate = this.shapeRegistry.create(originalShape.type, newPosition, {}, this.shapeStore);

            // Copy bindings
            // Walk every property the original has declared as bindable and
            // transfer its current binding (if any) to the duplicate.  This
            // makes the clone respond to the same parameter sliders as the
            // original without sharing mutable state.
            const bindableProps = originalShape.getBindableProperties();
            bindableProps.forEach(prop => {
                const binding = originalShape.getBinding(prop);
                if (binding) {
                    duplicate.setBinding(prop, binding);
                }
            });

            // Add to store
            // ShapeStore.add() will emit SHAPE_ADDED, which triggers a
            // canvas re-render.
            this.shapeStore.add(duplicate);
            this.createdShapeIds.push(duplicate.id);
        });
    }

    /**
     * Remove every shape that was created during the last execute().  After
     * removal the store is exactly as it was before that execute() was called.
     * ShapeStore.remove() handles cascading cleanup of selection state and
     * edge-joinery metadata keyed to the deleted shape.
     */
    undo() {
        // Remove duplicated shapes
        this.createdShapeIds.forEach(id => {
            this.shapeStore.remove(id);
        });
        this.createdShapeIds = [];
    }
}
