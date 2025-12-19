/**
 * Base Shape class using Template Method Pattern
 * Defines the structure for all shape types
 */
export class Shape {
    constructor(id, type, position = { x: 0, y: 0 }) {
        if (this.constructor === Shape) {
            throw new Error('Shape is an abstract class and cannot be instantiated directly');
        }
        this.id = id;
        this.type = type;
        this.position = { ...position };
        this.bindings = {}; // Map of property name to Binding object
    }
    
    /**
     * Get list of bindable property names (must be implemented by subclass)
     * @returns {Array<string>}
     */
    getBindableProperties() {
        throw new Error('getBindableProperties() must be implemented by subclass');
    }
    
    /**
     * Template method - resolves all bindings and returns resolved shape
     * @param {Object} parameterStore 
     * @param {Object} bindingResolver 
     * @returns {Shape} - New instance with resolved values
     */
    resolve(parameterStore, bindingResolver) {
        // Create a copy of this shape
        const resolved = this.clone();
        
        // Resolve each binding
        this.getBindableProperties().forEach(property => {
            const binding = this.bindings[property];
            if (binding && bindingResolver) {
                const value = bindingResolver.resolveValue(binding);
                resolved[property] = value;
            } else if (this[property] !== undefined) {
                // Use existing value if no binding
                resolved[property] = this[property];
            }
        });
        
        return resolved;
    }
    
    /**
     * Get bounding box (must be implemented by subclass)
     * @returns {Object} {x, y, width, height}
     */
    getBounds() {
        throw new Error('getBounds() must be implemented by subclass');
    }
    
    /**
     * Check if point is contained in shape (must be implemented by subclass)
     * @param {number} x 
     * @param {number} y 
     * @returns {boolean}
     */
    containsPoint(x, y) {
        throw new Error('containsPoint() must be implemented by subclass');
    }
    
    /**
     * Render shape to canvas (must be implemented by subclass)
     * @param {CanvasRenderingContext2D} ctx 
     */
    render(ctx) {
        throw new Error('render() must be implemented by subclass');
    }
    
    /**
     * Clone the shape (must be implemented by subclass)
     * @returns {Shape}
     */
    clone() {
        throw new Error('clone() must be implemented by subclass');
    }
    
    /**
     * Set binding for a property
     * @param {string} property 
     * @param {Binding} binding 
     */
    setBinding(property, binding) {
        if (!this.getBindableProperties().includes(property)) {
            throw new Error(`Property ${property} is not bindable for ${this.type}`);
        }
        this.bindings[property] = binding;
    }
    
    /**
     * Get binding for a property
     * @param {string} property 
     * @returns {Binding|null}
     */
    getBinding(property) {
        return this.bindings[property] || null;
    }
    
    /**
     * Serialize to JSON
     * @returns {Object}
     */
    toJSON() {
        const json = {
            id: this.id,
            type: this.type,
            position: { ...this.position },
            bindings: {}
        };
        
        // Serialize bindings
        Object.keys(this.bindings).forEach(property => {
            json.bindings[property] = this.bindings[property].toJSON();
        });
        
        // Add shape-specific properties (to be extended by subclasses)
        this.getBindableProperties().forEach(property => {
            if (this[property] !== undefined && !this.bindings[property]) {
                json[property] = this[property];
            }
        });
        
        return json;
    }
    
    /**
     * Create Shape from JSON (to be handled by ShapeRegistry)
     * @param {Object} json 
     * @returns {Shape}
     */
    static fromJSON(json) {
        throw new Error('Use ShapeRegistry.fromJSON() instead');
    }
}
