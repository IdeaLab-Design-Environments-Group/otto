/**
 * ShapeRegistry using Registry Pattern
 * Creates shape instances based on type with dynamic registration support
 * 
 * Benefits:
 * - Open/Closed Principle: Add new shapes without modifying registry code
 * - Runtime registration: Register shapes dynamically
 * - Plugin support: Third-party shapes can register themselves
 */
import { Circle } from './Circle.js';
import { Rectangle } from './Rectangle.js';
import { createBindingFromJSON } from '../BindingRegistry.js';

/**
 * Shape registry entry
 */
class ShapeRegistryEntry {
    constructor(createFunction, fromJSONFunction) {
        this.create = createFunction;
        this.fromJSON = fromJSONFunction;
    }
}

export class ShapeRegistry {
    // Private registry: Map<type, ShapeRegistryEntry>
    static #registry = new Map();
    
    // Initialize registry with default shapes
    static {
        // Register Circle
        this.register('circle', 
            (id, position, options) => new Circle(
                id,
                position,
                options.centerX || position.x || 0,
                options.centerY || position.y || 0,
                options.radius || 50
            ),
            Circle.fromJSON
        );
        
        // Register Rectangle
        this.register('rectangle',
            (id, position, options) => new Rectangle(
                id,
                position,
                options.x || position.x || 0,
                options.y || position.y || 0,
                options.width || 100,
                options.height || 100
            ),
            Rectangle.fromJSON
        );
    }
    
    /**
     * Register a new shape type (Registry Pattern)
     * @param {string} type - Shape type identifier
     * @param {Function} createFunction - Function(id, position, options) => Shape
     * @param {Function} fromJSONFunction - Static fromJSON method
     * 
     * Example:
     * ShapeRegistry.register('triangle', 
     *     (id, pos, opts) => new Triangle(id, pos, opts.x, opts.y, opts.size),
     *     Triangle.fromJSON
     * );
     */
    static register(type, createFunction, fromJSONFunction) {
        if (!type || typeof type !== 'string') {
            throw new Error('Type must be a non-empty string');
        }
        if (typeof createFunction !== 'function') {
            throw new Error('createFunction must be a function');
        }
        if (typeof fromJSONFunction !== 'function') {
            throw new Error('fromJSONFunction must be a function');
        }
        
        const normalizedType = type.toLowerCase();
        this.#registry.set(normalizedType, new ShapeRegistryEntry(
            createFunction,
            fromJSONFunction
        ));
    }
    
    /**
     * Unregister a shape type (useful for testing)
     * @param {string} type 
     */
    static unregister(type) {
        const normalizedType = type.toLowerCase();
        this.#registry.delete(normalizedType);
    }
    
    /**
     * Check if a shape type is registered
     * @param {string} type 
     * @returns {boolean}
     */
    static isRegistered(type) {
        return this.#registry.has(type.toLowerCase());
    }
    
    /**
     * Get available shape types
     * @returns {Array<string>}
     */
    static getAvailableTypes() {
        return Array.from(this.#registry.keys());
    }
    
    /**
     * Create a shape by type (Registry Pattern - no switch statement!)
     * @param {string} type 
     * @param {Object} position 
     * @param {Object} options - Additional options for shape creation
     * @returns {Shape}
     */
    static create(type, position = { x: 0, y: 0 }, options = {}) {
        const normalizedType = type.toLowerCase();
        const entry = this.#registry.get(normalizedType);
        
        if (!entry) {
            const available = Array.from(this.#registry.keys()).join(', ');
            throw new Error(
                `Unknown shape type: "${type}". ` +
                `Available types: ${available}. ` +
                `Use ShapeRegistry.register() to add new types.`
            );
        }
        
        const id = options.id || this.generateId(normalizedType);
        return entry.create(id, position, options);
    }
    
    /**
     * Create shape from JSON (Registry Pattern - no switch statement!)
     * @param {Object} json 
     * @returns {Shape}
     */
    static fromJSON(json) {
        if (!json || !json.type) {
            throw new Error('Invalid shape JSON: type is required');
        }
        
        const normalizedType = json.type.toLowerCase();
        const entry = this.#registry.get(normalizedType);
        
        if (!entry) {
            const available = Array.from(this.#registry.keys()).join(', ');
            throw new Error(
                `Unknown shape type: "${json.type}". ` +
                `Available types: ${available}.`
            );
        }
        
        // Use registered fromJSON method
        const shape = entry.fromJSON(json);
        
        // Restore bindings (common for all shapes)
        if (json.bindings) {
            Object.keys(json.bindings).forEach(property => {
                try {
                    const binding = createBindingFromJSON(json.bindings[property]);
                    shape.setBinding(property, binding);
                } catch (error) {
                    console.warn(`Failed to restore binding for ${property}:`, error);
                }
            });
        }
        
        return shape;
    }
    
    /**
     * Generate a unique ID for a shape
     * @param {string} type 
     * @returns {string}
     */
    static generateId(type) {
        return `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}