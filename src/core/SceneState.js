/**
 * @fileoverview Complete scene state container and undo/redo history,
 * implemented via the Memento Pattern.
 *
 * Design pattern: Memento
 *   The Memento Pattern separates the act of capturing and restoring an
 *   object's internal state from the object itself.  In Otto:
 *     - {@link SceneState}   is the Originator -- it owns the live stores
 *       and knows how to serialise them into a snapshot and how to
 *       deserialise a snapshot back into live state.
 *     - {@link SceneMemento} is the Memento   -- it is an opaque,
 *       immutable snapshot.  It does not know what the fields mean; it
 *       simply holds the serialised data and hands it back when asked.
 *     - {@link SceneHistory} is the Caretaker -- it manages an ordered
 *       list of mementos and a pointer that tracks "where we are" in that
 *       list.  It never inspects or mutates a memento's contents.
 *
 * Wiring order inside SceneState
 *   The four internal stores are wired in a strict dependency chain:
 *     ParameterStore  -->  ExpressionParser  -->  BindingResolver  -->  ShapeStore
 *   ParameterStore holds the raw numeric parameters.  ExpressionParser
 *   can evaluate math expressions that reference those parameters.
 *   BindingResolver combines both to turn a Binding object into a number.
 *   ShapeStore receives the resolver so it can produce fully-resolved
 *   shapes on demand.  Constructing them in any other order would result
 *   in null references.
 *
 * Async fromJSON / restoreMemento
 *   Both methods are async because the underlying store fromJSON methods
 *   perform dynamic {@code import()} calls to avoid circular dependencies
 *   at module-load time.  Callers must await them.
 *
 * @module core/SceneState
 */
import { ParameterStore } from './ParameterStore.js';
import { ShapeStore } from './ShapeStore.js';
import { BindingResolver } from './BindingResolver.js';
import { ExpressionParser } from '../models/ExpressionParser.js';

/**
 * Originator in the Memento Pattern.  Owns every piece of mutable state
 * that constitutes a single scene (one tab).
 *
 * The constructor wires the four sub-stores in dependency order.  See the
 * module-level documentation for a diagram of that chain.
 */
export class SceneState {
    /**
     * Construct a brand-new, empty scene.  All stores are initialised to
     * their default empty states and the viewport is centred at the origin
     * at 100% zoom.
     */
    constructor() {
        /**
         * Repository of user-defined numeric parameters (sliders).
         * This is the root of the binding dependency chain.
         * @type {ParameterStore}
         */
        this.parameterStore = new ParameterStore();
        /**
         * Parser that can evaluate mathematical expressions containing
         * references to parameters in {@link #parameterStore}.
         * @type {ExpressionParser}
         */
        this.expressionParser = new ExpressionParser();
        /**
         * Facade that resolves any Binding (literal, parameter-ref, or
         * expression) into a concrete number.  Receives both the parameter
         * store and the expression parser because different binding
         * subclasses need different resolvers.
         * @type {BindingResolver}
         */
        this.bindingResolver = new BindingResolver(this.parameterStore, this.expressionParser);
        /**
         * Central repository for all shapes in this scene.  Receives the
         * binding resolver so that {@link ShapeStore#getResolved} can
         * produce fully-evaluated shape clones.
         * @type {ShapeStore}
         */
        this.shapeStore = new ShapeStore(this.parameterStore, this.bindingResolver);
        /**
         * The current pan and zoom state of the canvas viewport.  {@code x}
         * and {@code y} are the world-space coordinates of the top-left
         * corner of the visible area; {@code zoom} is the scale factor
         * (1.0 = 100%).
         * @type {{x: number, y: number, zoom: number}}
         */
        this.viewport = {
            x: 0,
            y: 0,
            zoom: 1
        };
    }

    /**
     * Capture a deep snapshot of the current scene and wrap it in a
     * {@link SceneMemento}.  The snapshot includes the serialised
     * ParameterStore, the serialised ShapeStore (which includes shapes,
     * selection, and joinery), and a copy of the viewport state.
     *
     * The returned memento can be stored by {@link SceneHistory} and later
     * passed back to {@link #restoreMemento} to revert the scene.
     *
     * @returns {SceneMemento} An immutable snapshot of the current state.
     */
    createMemento() {
        return new SceneMemento({
            parameterStore: this.parameterStore.toJSON(),
            shapeStore: this.shapeStore.toJSON(),
            viewport: { ...this.viewport }
        });
    }

    /**
     * Overwrite the current scene state with the contents of a previously-
     * captured memento.  This is the "undo" or "redo" operation at the
     * scene level.
     *
     * The method is async because {@link ParameterStore#fromJSON} and
     * {@link ShapeStore#fromJSON} both perform dynamic imports internally.
     * Each store is restored independently; if one section of the memento
     * is missing (e.g. an older snapshot that did not include viewport
     * data), that section is simply skipped.
     *
     * @param {SceneMemento} memento  The snapshot to restore.
     */
    async restoreMemento(memento) {
        const state = memento.getState();

        if (state.parameterStore) {
            await this.parameterStore.fromJSON(state.parameterStore);
        }

        if (state.shapeStore) {
            await this.shapeStore.fromJSON(state.shapeStore);
        }

        if (state.viewport) {
            this.viewport = { ...state.viewport };
        }
    }

    /**
     * Serialise the scene to a plain object for long-term persistence
     * (e.g. saving to a .otto file or localStorage).  The output structure
     * is identical to what {@link #createMemento} captures internally, so
     * the same JSON can serve both as a persistence payload and as a
     * memento state.
     *
     * @returns {{parameterStore: Object, shapeStore: Object, viewport: {x: number, y: number, zoom: number}}}
     *     The serialised scene.
     */
    toJSON() {
        return {
            parameterStore: this.parameterStore.toJSON(),
            shapeStore: this.shapeStore.toJSON(),
            viewport: { ...this.viewport }
        };
    }

    /**
     * Restore the scene from a previously-serialised JSON object (e.g.
     * loading a .otto file).  Functionally equivalent to
     * {@link #restoreMemento}, but accepts a raw object instead of a
     * SceneMemento wrapper.
     *
     * Async for the same reasons as {@link #restoreMemento}.
     *
     * @param {Object} json  The object previously returned by {@link #toJSON}.
     * @throws {Error} If json is null or undefined.
     */
    async fromJSON(json) {
        if (!json) {
            throw new Error('Invalid SceneState JSON');
        }

        if (json.parameterStore) {
            await this.parameterStore.fromJSON(json.parameterStore);
        }

        if (json.shapeStore) {
            await this.shapeStore.fromJSON(json.shapeStore);
        }

        if (json.viewport) {
            this.viewport = { ...json.viewport };
        }
    }
}

/**
 * Memento in the Memento Pattern.  An opaque, effectively immutable
 * snapshot of a scene at a single point in time.
 *
 * The constructor performs a shallow copy of the incoming state object.
 * Because the values inside that object (parameterStore, shapeStore, etc.)
 * are themselves plain serialised objects (not live class instances),
 * shallow-copying the top level is sufficient to isolate the snapshot from
 * later mutations.
 *
 * {@link #getState} returns another shallow copy so that the caller cannot
 * accidentally mutate the memento's internal state.
 */
export class SceneMemento {
    /**
     * @param {Object} state  A plain object containing the serialised
     *     parameterStore, shapeStore, and viewport.  Typically produced by
     *     {@link SceneState#createMemento}.
     */
    constructor(state) {
        this.state = { ...state };
    }

    /**
     * Return a shallow copy of the stored state.  The copy prevents
     * external code from accidentally mutating the memento by writing to
     * the returned object's properties.
     *
     * @returns {Object} A shallow copy of the internal state object.
     */
    getState() {
        return { ...this.state };
    }
}

/**
 * Caretaker in the Memento Pattern.  Manages a linear array of
 * {@link SceneMemento} objects and a {@link #currentIndex} pointer that
 * tracks "where we are" in the undo history.
 *
 * Stack semantics
 *   - {@link #push} always truncates any mementos that are ahead of the
 *     current pointer before appending.  This means that once you undo
 *     and then perform a new action, the old redo branch is gone forever
 *     (standard undo-tree behaviour with a linear spine).
 *   - If the array exceeds {@link #maxSize} after a push, the oldest
 *     memento (index 0) is discarded.  The currentIndex is NOT incremented
 *     in that case because the array shrank by one from the front, so the
 *     pointer already points to the newly-pushed entry.
 *
 * Undo boundary
 *   {@link #canUndo} returns true only when {@link #currentIndex} is
 *   greater than 0 (not at the initial state).  This means the very first
 *   memento in the array (the "baseline" state) can never be undone past;
 *   it is the floor of the history.
 */
export class SceneHistory {
    /**
     * @param {number} [maxSize=50]  The maximum number of mementos to keep.
     *     Older entries are discarded when this limit is exceeded.
     */
    constructor(maxSize = 50) {
        /**
         * Maximum number of mementos the history will hold before
         * discarding the oldest.
         * @type {number}
         */
        this.maxSize = maxSize;
        /**
         * The ordered list of mementos.  Index 0 is the oldest; the last
         * index is the most recent.
         * @type {SceneMemento[]}
         */
        this.history = []; // Array of SceneMemento
        /**
         * The index into {@link #history} that represents the "current"
         * state.  Starts at -1 (empty history).  After the first push it
         * becomes 0.  Undo decrements it; redo increments it.
         * @type {number}
         */
        this.currentIndex = -1;
    }

    /**
     * Record a new snapshot.  Any mementos ahead of the current pointer
     * (the redo branch) are discarded first, then the new memento is
     * appended.  If the resulting array exceeds {@link #maxSize}, the
     * oldest entry is removed from the front.
     *
     * @param {SceneMemento} memento  The snapshot to record.
     */
    push(memento) {
        // Remove any forward history if we're not at the end
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }

        // Add new memento
        this.history.push(memento);

        // Limit history size
        // When the oldest entry is shifted off, currentIndex stays the
        // same numerically because the new entry is now at that same
        // position after the shift.  When no shift occurs, we simply
        // advance the pointer to the new last element.
        if (this.history.length > this.maxSize) {
            this.history.shift();
        } else {
            this.currentIndex++;
        }
    }

    /**
     * Move one step backward in history and return the memento at the new
     * position.  The caller is expected to pass the returned memento to
     * {@link SceneState#restoreMemento} to actually apply the undo.
     *
     * @returns {SceneMemento|null} The previous memento, or null if undo is
     *     not possible (already at the initial state).
     */
    undo() {
        if (!this.canUndo()) {
            return null;
        }
        this.currentIndex--;
        return this.history[this.currentIndex];
    }

    /**
     * Move one step forward in history and return the memento at the new
     * position.  Only valid after a prior undo; if the pointer is already
     * at the end, returns null.
     *
     * @returns {SceneMemento|null} The next memento, or null if redo is
     *     not possible.
     */
    redo() {
        if (!this.canRedo()) {
            return null;
        }
        this.currentIndex++;
        return this.history[this.currentIndex];
    }

    /**
     * Return whether there is a previous state to undo to.  False when
     * the pointer is at index 0 (the initial/baseline state) or when the
     * history is empty.
     *
     * @returns {boolean} True if {@link #undo} would return a memento.
     */
    canUndo() {
        return this.currentIndex > 0;
    }

    /**
     * Return whether there is a subsequent state to redo to.  False when
     * the pointer is at the end of the history array (no redo branch).
     *
     * @returns {boolean} True if {@link #redo} would return a memento.
     */
    canRedo() {
        return this.currentIndex < this.history.length - 1;
    }

    /**
     * Discard the entire history, resetting to the empty state.  Useful
     * when loading a new scene (the old undo stack is no longer relevant).
     */
    clear() {
        this.history = [];
        this.currentIndex = -1;
    }
}
