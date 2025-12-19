/**
 * SceneState using Memento Pattern
 * Represents the complete state of a scene
 */
import { ParameterStore } from './ParameterStore.js';
import { ShapeStore } from './ShapeStore.js';
import { BindingResolver } from './BindingResolver.js';
import { ExpressionParser } from '../models/ExpressionParser.js';

/**
 * SceneState - Represents the complete state
 */
export class SceneState {
    constructor() {
        this.parameterStore = new ParameterStore();
        this.expressionParser = new ExpressionParser();
        this.bindingResolver = new BindingResolver(this.parameterStore, this.expressionParser);
        this.shapeStore = new ShapeStore(this.parameterStore, this.bindingResolver);
        this.viewport = {
            x: 0,
            y: 0,
            zoom: 1
        };
    }
    
    /**
     * Create a memento (snapshot) of current state
     * @returns {SceneMemento}
     */
    createMemento() {
        return new SceneMemento({
            parameterStore: this.parameterStore.toJSON(),
            shapeStore: this.shapeStore.toJSON(),
            viewport: { ...this.viewport }
        });
    }
    
    /**
     * Restore state from a memento
     * @param {SceneMemento} memento 
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
     * Serialize to JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            parameterStore: this.parameterStore.toJSON(),
            shapeStore: this.shapeStore.toJSON(),
            viewport: { ...this.viewport }
        };
    }
    
    /**
     * Deserialize from JSON
     * @param {Object} json 
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
 * SceneMemento - Stores a snapshot of scene state
 */
export class SceneMemento {
    constructor(state) {
        this.state = { ...state };
    }
    
    /**
     * Get the stored state
     * @returns {Object}
     */
    getState() {
        return { ...this.state };
    }
}

/**
 * SceneHistory - Manages undo/redo history using Memento Pattern
 */
export class SceneHistory {
    constructor(maxSize = 50) {
        this.maxSize = maxSize;
        this.history = []; // Array of SceneMemento
        this.currentIndex = -1;
    }
    
    /**
     * Push a new memento to history
     * @param {SceneMemento} memento 
     */
    push(memento) {
        // Remove any forward history if we're not at the end
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }
        
        // Add new memento
        this.history.push(memento);
        
        // Limit history size
        if (this.history.length > this.maxSize) {
            this.history.shift();
        } else {
            this.currentIndex++;
        }
    }
    
    /**
     * Undo - move back in history
     * @returns {SceneMemento|null}
     */
    undo() {
        if (!this.canUndo()) {
            return null;
        }
        this.currentIndex--;
        return this.history[this.currentIndex];
    }
    
    /**
     * Redo - move forward in history
     * @returns {SceneMemento|null}
     */
    redo() {
        if (!this.canRedo()) {
            return null;
        }
        this.currentIndex++;
        return this.history[this.currentIndex];
    }
    
    /**
     * Check if undo is possible
     * @returns {boolean}
     */
    canUndo() {
        return this.currentIndex > 0;
    }
    
    /**
     * Check if redo is possible
     * @returns {boolean}
     */
    canRedo() {
        return this.currentIndex < this.history.length - 1;
    }
    
    /**
     * Clear history
     */
    clear() {
        this.history = [];
        this.currentIndex = -1;
    }
}
