import { BindingHandler } from './BindingHandler.js';

/**
 * ProcessedBinding - Binding with Chain of Responsibility Handler Pipeline
 *
 * Wraps any binding and processes its value through a handler chain.
 * Handlers can validate, transform, clamp, round, or scale values.
 *
 * Usage:
 * ```javascript
 * const binding = new ProcessedBinding(new ParameterBinding('size'))
 *     .addHandler(new ValidationHandler(0, 1000))
 *     .addHandler(new ClampHandler(10, 500))
 *     .addHandler(new RoundHandler());
 *
 * const result = binding.getValue(parameterStore);
 * // Value flows: parameter → validate → clamp → round → result
 * ```
 */
export class ProcessedBinding {
    /**
     * @param {Object} binding - The underlying binding
     */
    constructor(binding) {
        if (!binding) {
            throw new Error('ProcessedBinding requires a binding to wrap');
        }

        this.type = 'processed';
        this.wrappedBinding = binding;
        this._handlers = [];
        this._handlerChain = null;
        this._lastError = null;
    }

    /**
     * Add a handler to the chain (fluent API)
     * @param {BindingHandler} handler
     * @returns {ProcessedBinding} this (for chaining)
     */
    addHandler(handler) {
        if (!(handler instanceof BindingHandler)) {
            throw new Error('Handler must be instance of BindingHandler');
        }

        this._handlers.push(handler);
        this._buildChain();
        return this;
    }

    /**
     * Remove a handler by type
     * @param {string} type
     * @returns {ProcessedBinding} this
     */
    removeHandler(type) {
        this._handlers = this._handlers.filter(h => h.getType() !== type);
        this._buildChain();
        return this;
    }

    /**
     * Clear all handlers
     * @returns {ProcessedBinding} this
     */
    clearHandlers() {
        this._handlers = [];
        this._handlerChain = null;
        return this;
    }

    /**
     * Get all handlers
     * @returns {Array<BindingHandler>}
     */
    getHandlers() {
        return [...this._handlers];
    }

    /**
     * Build the handler chain from array
     */
    _buildChain() {
        if (this._handlers.length === 0) {
            this._handlerChain = null;
            return;
        }

        // Link handlers
        for (let i = 0; i < this._handlers.length - 1; i++) {
            this._handlers[i].setNext(this._handlers[i + 1]);
        }

        // Clear last handler's next
        this._handlers[this._handlers.length - 1].setNext(null);

        this._handlerChain = this._handlers[0];
    }

    /**
     * Get the wrapped binding
     * @returns {Object}
     */
    getWrappedBinding() {
        return this.wrappedBinding;
    }

    /**
     * Get processed value
     * @param {Object} parameterStore - Optional parameter store for ParameterBindings
     * @returns {*}
     */
    getValue(parameterStore) {
        // Get raw value from wrapped binding
        let rawValue;
        if (typeof this.wrappedBinding.getValue === 'function') {
            rawValue = this.wrappedBinding.getValue(parameterStore);
        } else if (this.wrappedBinding.value !== undefined) {
            rawValue = this.wrappedBinding.value;
        } else {
            rawValue = this.wrappedBinding;
        }

        // If no handlers, return raw value
        if (!this._handlerChain) {
            this._lastError = null;
            return rawValue;
        }

        // Process through handler chain
        const result = this._handlerChain.handle(rawValue, {
            binding: this.wrappedBinding,
            parameterStore
        });

        if (!result.valid) {
            this._lastError = result.error;
            console.warn(`Binding validation failed: ${result.error}`);
            // Return the last valid value or raw value
            return rawValue;
        }

        this._lastError = null;
        return result.value;
    }

    /**
     * Check if last getValue had an error
     * @returns {boolean}
     */
    hasError() {
        return this._lastError !== null;
    }

    /**
     * Get the last error message
     * @returns {string|null}
     */
    getLastError() {
        return this._lastError;
    }

    /**
     * Validate a value without applying (dry run)
     * @param {*} value
     * @returns {Object} { valid, error?, processedValue }
     */
    validate(value) {
        if (!this._handlerChain) {
            return { valid: true, processedValue: value };
        }

        const result = this._handlerChain.handle(value, {});
        return {
            valid: result.valid,
            error: result.error,
            processedValue: result.value
        };
    }

    /**
     * Serialize to JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            type: this.type,
            wrappedBinding: this.wrappedBinding.toJSON(),
            handlers: this._handlers.map(h => h.toJSON())
        };
    }

    /**
     * Create from JSON
     * @param {Object} json
     * @param {Function} createBindingFn - Function to create wrapped binding from JSON
     * @param {Object} handlerRegistry - Handler type registry
     * @returns {ProcessedBinding}
     */
    static fromJSON(json, createBindingFn, handlerRegistry) {
        const wrappedBinding = createBindingFn(json.wrappedBinding);
        const processed = new ProcessedBinding(wrappedBinding);

        if (json.handlers && Array.isArray(json.handlers)) {
            for (const handlerJson of json.handlers) {
                const handler = handlerRegistry.create(handlerJson);
                processed.addHandler(handler);
            }
        }

        return processed;
    }
}

/**
 * HandlerRegistry - Registry for handler types
 * Enables deserializing handler chains from JSON
 */
export class HandlerRegistry {
    constructor() {
        this._registry = new Map();
    }

    /**
     * Register a handler type
     * @param {string} type
     * @param {Class} HandlerClass
     */
    register(type, HandlerClass) {
        this._registry.set(type, HandlerClass);
    }

    /**
     * Create handler from JSON
     * @param {Object} json
     * @returns {BindingHandler}
     */
    create(json) {
        const HandlerClass = this._registry.get(json.type);
        if (!HandlerClass) {
            throw new Error(`Unknown handler type: ${json.type}`);
        }
        return HandlerClass.fromJSON(json);
    }

    /**
     * Check if type is registered
     * @param {string} type
     * @returns {boolean}
     */
    isRegistered(type) {
        return this._registry.has(type);
    }
}

// Create and populate default registry
export const defaultHandlerRegistry = new HandlerRegistry();

// Register built-in handlers (lazy import to avoid circular deps)
export async function initializeHandlerRegistry() {
    const { ValidationHandler } = await import('./handlers/ValidationHandler.js');
    const { ClampHandler } = await import('./handlers/ClampHandler.js');
    const { RoundHandler } = await import('./handlers/RoundHandler.js');
    const { ScaleHandler, MapRangeHandler } = await import('./handlers/ScaleHandler.js');

    defaultHandlerRegistry.register('validation', ValidationHandler);
    defaultHandlerRegistry.register('clamp', ClampHandler);
    defaultHandlerRegistry.register('round', RoundHandler);
    defaultHandlerRegistry.register('scale', ScaleHandler);
    defaultHandlerRegistry.register('mapRange', MapRangeHandler);
}
