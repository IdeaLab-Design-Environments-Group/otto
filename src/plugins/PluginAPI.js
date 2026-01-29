/**
 * PluginAPI - Facade Pattern Implementation
 *
 * Provides a simplified, unified API for plugin developers.
 * Wraps internal systems (registries, EventBus, stores) behind
 * a clean, stable interface.
 *
 * Benefits:
 * - Plugin developers use one consistent API
 * - Internal changes don't break plugins
 * - Controlled access to system internals
 * - Documentation in one place
 */
export class PluginAPI {
    /**
     * @param {Object} options - API configuration
     * @param {Object} options.eventBus - EventBus instance
     * @param {Object} options.shapeRegistry - ShapeRegistry class
     * @param {Object} options.bindingRegistry - BindingRegistry module
     * @param {Object} options.commandRegistry - CommandRegistry instance
     * @param {Object} options.sceneState - SceneState instance
     * @param {Object} options.application - Application instance
     */
    constructor(options = {}) {
        this._eventBus = options.eventBus;
        this._shapeRegistry = options.shapeRegistry;
        this._bindingRegistry = options.bindingRegistry;
        this._commandRegistry = options.commandRegistry;
        this._sceneState = options.sceneState;
        this._application = options.application;

        // Hooks registry
        this._hooks = new Map();
    }

    // ===========================================
    // Event System Access
    // ===========================================

    /**
     * Get the EventBus for subscribing to events
     * @returns {EventBus}
     */
    get eventBus() {
        return this._eventBus;
    }

    /**
     * Get event type constants
     * @returns {Object}
     */
    get EVENTS() {
        return this._eventBus.constructor.EVENTS || {};
    }

    /**
     * Subscribe to an event
     * @param {string} eventType
     * @param {Function} callback
     * @returns {Function} Unsubscribe function
     */
    subscribe(eventType, callback) {
        return this._eventBus.subscribe(eventType, callback);
    }

    /**
     * Emit an event
     * @param {string} eventType
     * @param {*} payload
     */
    emit(eventType, payload) {
        this._eventBus.emit(eventType, payload);
    }

    // ===========================================
    // Shape Registration
    // ===========================================

    /**
     * Register a new shape type
     * @param {string} type - Shape type identifier
     * @param {Function} createFn - Factory function (id, position, options) => Shape
     * @param {Function} fromJSONFn - Deserialize function (json) => Shape
     *
     * @example
     * api.registerShape('triangle',
     *     (id, pos, opts) => new Triangle(id, pos, opts.x, opts.y, opts.size),
     *     Triangle.fromJSON
     * );
     */
    registerShape(type, createFn, fromJSONFn) {
        this._shapeRegistry.register(type, createFn, fromJSONFn);
    }

    /**
     * Unregister a shape type
     * @param {string} type
     */
    unregisterShape(type) {
        this._shapeRegistry.unregister(type);
    }

    /**
     * Check if a shape type is registered
     * @param {string} type
     * @returns {boolean}
     */
    isShapeRegistered(type) {
        return this._shapeRegistry.isRegistered(type);
    }

    /**
     * Get all available shape types
     * @returns {Array<string>}
     */
    getAvailableShapeTypes() {
        return this._shapeRegistry.getAvailableTypes();
    }

    /**
     * Create a shape instance
     * @param {string} type
     * @param {Object} position
     * @param {Object} options
     * @returns {Shape}
     */
    createShape(type, position, options) {
        return this._shapeRegistry.create(type, position, options);
    }

    // ===========================================
    // Binding Registration
    // ===========================================

    /**
     * Register a new binding type
     * @param {string} type - Binding type identifier
     * @param {Function} createFn - Factory function (json) => Binding
     *
     * @example
     * api.registerBinding('api',
     *     (json) => new APIBinding(json.url, json.property)
     * );
     */
    registerBinding(type, createFn) {
        if (this._bindingRegistry && this._bindingRegistry.registerBindingType) {
            this._bindingRegistry.registerBindingType(type, createFn);
        }
    }

    /**
     * Unregister a binding type
     * @param {string} type
     */
    unregisterBinding(type) {
        if (this._bindingRegistry && this._bindingRegistry.unregisterBindingType) {
            this._bindingRegistry.unregisterBindingType(type);
        }
    }

    // ===========================================
    // Command Registration
    // ===========================================

    /**
     * Register a named command
     * @param {string} name - Command name
     * @param {Class} CommandClass - Command class (must have execute/undo)
     *
     * @example
     * api.registerCommand('alignShapes', AlignShapesCommand);
     */
    registerCommand(name, CommandClass) {
        if (this._commandRegistry) {
            this._commandRegistry.register(name, CommandClass);
        }
    }

    /**
     * Unregister a command
     * @param {string} name
     */
    unregisterCommand(name) {
        if (this._commandRegistry) {
            this._commandRegistry.unregister(name);
        }
    }

    /**
     * Execute a command by name
     * @param {string} name
     * @param {Object} args - Arguments for command constructor
     * @returns {*} Command execution result
     */
    executeCommand(name, args) {
        if (this._commandRegistry) {
            return this._commandRegistry.execute(name, args);
        }
    }

    // ===========================================
    // Scene Access
    // ===========================================

    /**
     * Get the shape store
     * @returns {ShapeStore}
     */
    get shapeStore() {
        return this._sceneState?.shapeStore;
    }

    /**
     * Get the parameter store
     * @returns {ParameterStore}
     */
    get parameterStore() {
        return this._sceneState?.parameterStore;
    }

    /**
     * Get the viewport state
     * @returns {Object}
     */
    get viewport() {
        return this._sceneState?.viewport;
    }

    /**
     * Add a shape to the scene
     * @param {Shape} shape
     */
    addShape(shape) {
        this._sceneState?.shapeStore.add(shape);
    }

    /**
     * Remove a shape from the scene
     * @param {string} shapeId
     */
    removeShape(shapeId) {
        this._sceneState?.shapeStore.remove(shapeId);
    }

    /**
     * Get all shapes
     * @returns {Array<Shape>}
     */
    getAllShapes() {
        return this._sceneState?.shapeStore.getAll() || [];
    }

    /**
     * Get selected shape IDs
     * @returns {Set<string>}
     */
    getSelectedShapeIds() {
        return this._sceneState?.shapeStore.getSelectedIds() || new Set();
    }

    // ===========================================
    // Hook System
    // ===========================================

    /**
     * Add a hook handler
     * @param {string} hookName - Hook name (e.g., 'before-render', 'after-save')
     * @param {Function} handler - Hook handler function
     * @returns {Function} Remove hook function
     *
     * Available hooks:
     * - 'before-render': Called before each render
     * - 'after-render': Called after each render
     * - 'before-save': Called before scene save
     * - 'after-save': Called after scene save
     * - 'before-load': Called before scene load
     * - 'after-load': Called after scene load
     * - 'shape-created': Called when a shape is created
     * - 'shape-deleted': Called when a shape is deleted
     */
    addHook(hookName, handler) {
        if (!this._hooks.has(hookName)) {
            this._hooks.set(hookName, new Set());
        }

        this._hooks.get(hookName).add(handler);

        // Return removal function
        return () => {
            const handlers = this._hooks.get(hookName);
            if (handlers) {
                handlers.delete(handler);
            }
        };
    }

    /**
     * Remove a hook handler
     * @param {string} hookName
     * @param {Function} handler
     */
    removeHook(hookName, handler) {
        const handlers = this._hooks.get(hookName);
        if (handlers) {
            handlers.delete(handler);
        }
    }

    /**
     * Execute all handlers for a hook
     * @param {string} hookName
     * @param {*} data - Data to pass to handlers
     * @returns {Promise<Array>} Results from all handlers
     */
    async executeHook(hookName, data) {
        const handlers = this._hooks.get(hookName);
        if (!handlers || handlers.size === 0) {
            return [];
        }

        const results = [];
        for (const handler of handlers) {
            try {
                const result = await handler(data);
                results.push(result);
            } catch (error) {
                console.error(`Error in hook ${hookName}:`, error);
            }
        }

        return results;
    }

    // ===========================================
    // Utility Methods
    // ===========================================

    /**
     * Log a message with plugin context
     * @param {string} pluginId
     * @param {string} message
     * @param {...*} args
     */
    log(pluginId, message, ...args) {
        console.log(`[${pluginId}] ${message}`, ...args);
    }

    /**
     * Warn with plugin context
     * @param {string} pluginId
     * @param {string} message
     * @param {...*} args
     */
    warn(pluginId, message, ...args) {
        console.warn(`[${pluginId}] ${message}`, ...args);
    }

    /**
     * Error with plugin context
     * @param {string} pluginId
     * @param {string} message
     * @param {...*} args
     */
    error(pluginId, message, ...args) {
        console.error(`[${pluginId}] ${message}`, ...args);
    }

    /**
     * Get application version
     * @returns {string}
     */
    getAppVersion() {
        return this._application?.version || '1.0.0';
    }
}
