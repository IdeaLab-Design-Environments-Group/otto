/**
 * BindingHandler - Chain of Responsibility Pattern Base Class
 *
 * Provides a pipeline for processing binding values through
 * a chain of handlers (validate → clamp → round → scale, etc.)
 *
 * Benefits:
 * - Composable: Chain multiple handlers in any order
 * - Single Responsibility: Each handler does one thing
 * - Open/Closed: Add new handlers without modifying existing code
 * - Flexible: Configure chains per-binding
 *
 * Usage:
 * ```javascript
 * const handler = new ValidationHandler(0, 100)
 *     .setNext(new ClampHandler(10, 90))
 *     .setNext(new RoundHandler());
 *
 * const result = handler.handle(75.7); // → 76
 * ```
 */
export class BindingHandler {
    constructor() {
        this._next = null;
    }

    /**
     * Set the next handler in the chain
     * @param {BindingHandler} handler
     * @returns {BindingHandler} The next handler (for chaining)
     */
    setNext(handler) {
        this._next = handler;
        return handler;
    }

    /**
     * Get the next handler
     * @returns {BindingHandler|null}
     */
    getNext() {
        return this._next;
    }

    /**
     * Process the value through this handler and the chain
     * @param {*} value - Input value
     * @param {Object} context - Optional context (binding info, shape, etc.)
     * @returns {Object} { value, valid, error? }
     */
    handle(value, context = {}) {
        // Process with this handler
        const result = this.process(value, context);

        // If invalid, stop the chain
        if (!result.valid) {
            return result;
        }

        // Pass to next handler if exists
        if (this._next) {
            return this._next.handle(result.value, context);
        }

        return result;
    }

    /**
     * Process the value (override in subclasses)
     * @param {*} value
     * @param {Object} context
     * @returns {Object} { value, valid, error? }
     */
    process(value, context) {
        // Default: pass through unchanged
        return { value, valid: true };
    }

    /**
     * Get handler type/name for serialization
     * @returns {string}
     */
    getType() {
        return 'base';
    }

    /**
     * Serialize handler to JSON
     * @returns {Object}
     */
    toJSON() {
        const json = { type: this.getType() };
        if (this._next) {
            json.next = this._next.toJSON();
        }
        return json;
    }

    /**
     * Create handler chain from JSON array
     * @param {Array<Object>} jsonArray - Array of handler configs
     * @param {Object} registry - Handler type registry
     * @returns {BindingHandler|null}
     */
    static fromJSONArray(jsonArray, registry) {
        if (!jsonArray || jsonArray.length === 0) {
            return null;
        }

        let first = null;
        let current = null;

        for (const json of jsonArray) {
            const handler = registry.create(json);
            if (!first) {
                first = handler;
                current = handler;
            } else {
                current.setNext(handler);
                current = handler;
            }
        }

        return first;
    }
}

/**
 * PassThroughHandler - Does nothing (null object pattern)
 */
export class PassThroughHandler extends BindingHandler {
    process(value, context) {
        return { value, valid: true };
    }

    getType() {
        return 'passthrough';
    }
}
