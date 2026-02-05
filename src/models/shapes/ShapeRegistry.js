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
import { Line } from './Line.js';
import { Rectangle } from './Rectangle.js';
import { PathShape } from './PathShape.js';
import { Polygon } from './Polygon.js';
import { Star } from './Star.js';
import { Triangle } from './Triangle.js';
import { Ellipse } from './Ellipse.js';
import { Arc } from './Arc.js';
import { RoundedRectangle } from './RoundedRectangle.js';
import { Donut } from './Donut.js';
import { Cross } from './Cross.js';
import { Gear } from './Gear.js';
import { Spiral } from './Spiral.js';
import { Wave } from './Wave.js';
import { Slot } from './Slot.js';
import { Arrow } from './Arrow.js';
import { ChamferRectangle } from './ChamferRectangle.js';
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
    
    // Counter for generating readable IDs per shape type
    static #idCounters = new Map();
    
    // Initialize registry with default shapes
    static {
        // Register Circle
        this.register('circle',
            (id, position, options) => new Circle(
                id,
                position,
                options.centerX || position.x || 0,
                options.centerY || position.y || 0,
                options.radius || 20
            ),
            Circle.fromJSON
        );

        // Register Line
        this.register('line',
            (id, position, options) => new Line(
                id,
                position,
                options.x1 ?? position.x ?? 0,
                options.y1 ?? position.y ?? 0,
                options.x2 ?? (position.x ?? 0) + 40,
                options.y2 ?? position.y ?? 0
            ),
            Line.fromJSON
        );

        // Register Rectangle
        this.register('rectangle',
            (id, position, options) => new Rectangle(
                id,
                position,
                options.x || position.x || 0,
                options.y || position.y || 0,
                options.width || 40,
                options.height || 40
            ),
            Rectangle.fromJSON
        );

        // Register Path (freeform)
        this.register('path',
            (id, position, options) => new PathShape(
                id,
                position,
                options.points || [],
                options.strokeWidth || 2,
                options.closed || false
            ),
            PathShape.fromJSON
        );

        // Register Polygon
        this.register('polygon',
            (id, position, options) => new Polygon(
                id,
                position,
                options.centerX || position.x || 0,
                options.centerY || position.y || 0,
                options.radius || 20,
                options.sides || 5
            ),
            Polygon.fromJSON
        );

        // Register Star
        this.register('star',
            (id, position, options) => new Star(
                id,
                position,
                options.centerX || position.x || 0,
                options.centerY || position.y || 0,
                options.outerRadius || 20,
                options.innerRadius || 10,
                options.points || 5
            ),
            Star.fromJSON
        );

        // Register Triangle
        this.register('triangle',
            (id, position, options) => new Triangle(
                id,
                position,
                options.centerX || position.x || 0,
                options.centerY || position.y || 0,
                options.base || 30,
                options.height || 40
            ),
            Triangle.fromJSON
        );

        // Register Ellipse
        this.register('ellipse',
            (id, position, options) => new Ellipse(
                id,
                position,
                options.centerX || position.x || 0,
                options.centerY || position.y || 0,
                options.radiusX || 30,
                options.radiusY || 20
            ),
            Ellipse.fromJSON
        );

        // Register Arc
        this.register('arc',
            (id, position, options) => new Arc(
                id,
                position,
                options.centerX || position.x || 0,
                options.centerY || position.y || 0,
                options.radius || 25,
                options.startAngle || 0,
                options.endAngle || 90
            ),
            Arc.fromJSON
        );

        // Register RoundedRectangle
        this.register('roundedrectangle',
            (id, position, options) => new RoundedRectangle(
                id,
                position,
                options.x || position.x || 0,
                options.y || position.y || 0,
                options.width || 50,
                options.height || 50,
                options.cornerRadius || options.radius || 5
            ),
            RoundedRectangle.fromJSON
        );

        // Register Donut
        this.register('donut',
            (id, position, options) => new Donut(
                id,
                position,
                options.centerX || position.x || 0,
                options.centerY || position.y || 0,
                options.outerRadius || 25,
                options.innerRadius || 12.5
            ),
            Donut.fromJSON
        );

        // Register Cross
        this.register('cross',
            (id, position, options) => new Cross(
                id,
                position,
                options.centerX || position.x || 0,
                options.centerY || position.y || 0,
                options.width || 50,
                options.thickness || 10
            ),
            Cross.fromJSON
        );

        // Register Gear
        this.register('gear',
            (id, position, options) => new Gear(
                id,
                position,
                options.centerX || position.x || 0,
                options.centerY || position.y || 0,
                options.pitchDiameter || options.pitch_diameter || 25,
                options.teeth || 10,
                options.pressureAngle || options.pressure_angle || 20
            ),
            Gear.fromJSON
        );

        // Register Spiral
        this.register('spiral',
            (id, position, options) => new Spiral(
                id,
                position,
                options.centerX || position.x || 0,
                options.centerY || position.y || 0,
                options.startRadius || 5,
                options.endRadius || 25,
                options.turns || 3
            ),
            Spiral.fromJSON
        );

        // Register Wave
        this.register('wave',
            (id, position, options) => new Wave(
                id,
                position,
                options.centerX || position.x || 0,
                options.centerY || position.y || 0,
                options.width || 50,
                options.amplitude || 10,
                options.frequency || 2
            ),
            Wave.fromJSON
        );

        // Register Slot
        this.register('slot',
            (id, position, options) => new Slot(
                id,
                position,
                options.centerX || position.x || 0,
                options.centerY || position.y || 0,
                options.length || 50,
                options.width || options.slotWidth || 15
            ),
            Slot.fromJSON
        );

        // Register Arrow
        this.register('arrow',
            (id, position, options) => new Arrow(
                id,
                position,
                options.x || position.x || 0,
                options.y || position.y || 0,
                options.length || 50,
                options.headWidth || 15,
                options.headLength || 12.5
            ),
            Arrow.fromJSON
        );

        // Register ChamferRectangle
        this.register('chamferrectangle',
            (id, position, options) => new ChamferRectangle(
                id,
                position,
                options.x || position.x || 0,
                options.y || position.y || 0,
                options.width || 50,
                options.height || 50,
                options.chamfer || 5
            ),
            ChamferRectangle.fromJSON
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
     * @param {ShapeStore} shapeStore - Optional shape store to check existing IDs
     * @returns {Shape}
     */
    static create(type, position = { x: 0, y: 0 }, options = {}, shapeStore = null) {
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
        
        const id = options.id || this.generateId(normalizedType, shapeStore);
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
     * Generate a readable ID for a shape (e.g., "Circle 1", "Rectangle 2")
     * @param {string} type 
     * @param {ShapeStore} shapeStore - Optional shape store to check existing IDs
     * @returns {string}
     */
    static generateId(type, shapeStore = null) {
        // Capitalize first letter of type
        const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
        
        // Get current counter for this type
        let counter = this.#idCounters.get(type) || 0;
        
        // If shapeStore is provided, find the highest number for this type
        if (shapeStore && typeof shapeStore.getAll === 'function') {
            const allShapes = shapeStore.getAll();
            const existingNumbers = [];
            
            allShapes.forEach(shape => {
                if (shape.type === type) {
                    // Try to extract number from existing ID
                    const match = shape.id.match(new RegExp(`^${capitalizedType}\\s+(\\d+)$`, 'i'));
                    if (match) {
                        existingNumbers.push(parseInt(match[1], 10));
                    }
                }
            });
            
            if (existingNumbers.length > 0) {
                counter = Math.max(...existingNumbers);
            }
        }
        
        // Increment counter
        counter++;
        this.#idCounters.set(type, counter);
        
        return `${capitalizedType} ${counter}`;
    }
    
    /**
     * Reset ID counters (useful for testing or when clearing all shapes)
     */
    static resetIdCounters() {
        this.#idCounters.clear();
    }
}
