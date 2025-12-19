/**
 * ShapeStore using Repository Pattern and Mediator Pattern
 * Manages shapes and acts as mediator between shapes and parameter store
 */
import EventBus, { EVENTS } from '../events/EventBus.js';

export class ShapeStore {
    constructor(parameterStore, bindingResolver) {
        this.shapes = new Map(); // Map<id, Shape>
        this.parameterStore = parameterStore;
        this.bindingResolver = bindingResolver;
        this.selectedShapeId = null; // Single selection (for backward compatibility)
        this.selectedShapeIds = new Set(); // Multi-selection
        this.eventBus = EventBus;
    }
    
    /**
     * Add a shape
     * @param {Shape} shape 
     */
    add(shape) {
        if (this.shapes.has(shape.id)) {
            throw new Error(`Shape with id ${shape.id} already exists`);
        }
        this.shapes.set(shape.id, shape);
        this.eventBus.emit(EVENTS.SHAPE_ADDED, shape);
    }
    
    /**
     * Remove a shape by id
     * @param {string} id 
     */
    remove(id) {
        const shape = this.shapes.get(id);
        if (shape) {
            this.shapes.delete(id);
            if (this.selectedShapeId === id) {
                this.selectedShapeId = null;
            }
            this.selectedShapeIds.delete(id);
            this.eventBus.emit(EVENTS.SHAPE_REMOVED, { id });
        }
    }
    
    /**
     * Get a shape by id
     * @param {string} id 
     * @returns {Shape|null}
     */
    get(id) {
        return this.shapes.get(id) || null;
    }
    
    /**
     * Get all shapes
     * @returns {Array<Shape>}
     */
    getAll() {
        return Array.from(this.shapes.values());
    }
    
    /**
     * Get all shapes with bindings resolved
     * @returns {Array<Shape>}
     */
    getResolved() {
        return this.bindingResolver.resolveAll(this.getAll());
    }
    
    /**
     * Update position of a shape
     * @param {string} id 
     * @param {number} x 
     * @param {number} y 
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
     * Update binding for a shape property
     * @param {string} shapeId 
     * @param {string} property 
     * @param {Binding} binding 
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
    
    /**
     * Get selected shape (single selection - for backward compatibility)
     * @returns {Shape|null}
     */
    getSelected() {
        return this.selectedShapeId ? this.shapes.get(this.selectedShapeId) : null;
    }
    
    /**
     * Set selected shape (single selection - for backward compatibility)
     * @param {string|null} id 
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
     * Get selected shape IDs (multi-selection)
     * @returns {Set<string>}
     */
    getSelectedIds() {
        return new Set(this.selectedShapeIds);
    }
    
    /**
     * Add shape to selection
     * @param {string} id 
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
     * Remove shape from selection
     * @param {string} id 
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
     * Set multiple selected shapes
     * @param {Array<string>} ids 
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
     * Clear all selections
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
     * Select all shapes
     */
    selectAll() {
        const allIds = Array.from(this.shapes.keys());
        this.setSelectedIds(allIds);
    }
    
    /**
     * Serialize to JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            shapes: Array.from(this.shapes.values()).map(shape => shape.toJSON()),
            selectedShapeId: this.selectedShapeId,
            selectedShapeIds: Array.from(this.selectedShapeIds)
        };
    }
    
    /**
     * Deserialize from JSON
     * @param {Object} json 
     */
    async fromJSON(json) {
        if (!json || !json.shapes) {
            throw new Error('Invalid ShapeStore JSON');
        }
        
        this.shapes.clear();
        const { ShapeRegistry } = await import('../models/shapes/ShapeRegistry.js');
        
        json.shapes.forEach(shapeJson => {
            const shape = ShapeRegistry.fromJSON(shapeJson);
            this.shapes.set(shape.id, shape);
        });
        
        this.selectedShapeId = json.selectedShapeId || null;
        this.selectedShapeIds.clear();
        if (json.selectedShapeIds && Array.isArray(json.selectedShapeIds)) {
            json.selectedShapeIds.forEach(id => {
                if (this.shapes.has(id)) {
                    this.selectedShapeIds.add(id);
                }
            });
        }
    }
}
