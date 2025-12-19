/**
 * Binding Registry - Registry Pattern for dynamic binding type registration
 */
import { LiteralBinding } from './Binding.js';
import { ParameterBinding } from './Binding.js';
import { ExpressionBinding } from './Binding.js';

export class BindingRegistry {
    // Private registry: Map<type, factoryFunction>
    static #registry = new Map();
    
    // Initialize registry with default bindings
    static {
        // Register LiteralBinding
        this.register('literal', (json) => {
            return new LiteralBinding(json.value);
        });
        
        // Register ParameterBinding
        this.register('parameter', (json) => {
            if (!json.parameterId) {
                throw new Error('ParameterBinding requires parameterId');
            }
            return new ParameterBinding(json.parameterId);
        });
        
        // Register ExpressionBinding
        this.register('expression', (json) => {
            if (!json.expression) {
                throw new Error('ExpressionBinding requires expression');
            }
            return new ExpressionBinding(json.expression);
        });
    }
    
    /**
     * Register a new binding type (Registry Pattern)
     * @param {string} type - Binding type identifier
     * @param {Function} factoryFunction - Function(json) => Binding instance
     * 
     * Example:
     * BindingRegistry.register('function', (json) => 
     *     new FunctionBinding(json.functionName, json.args)
     * );
     */
    static register(type, factoryFunction) {
        if (!type || typeof type !== 'string') {
            throw new Error('Type must be a non-empty string');
        }
        if (typeof factoryFunction !== 'function') {
            throw new Error('factoryFunction must be a function');
        }
        
        this.#registry.set(type, factoryFunction);
    }
    
    /**
     * Unregister a binding type (useful for testing)
     * @param {string} type 
     */
    static unregister(type) {
        this.#registry.delete(type);
    }
    
    /**
     * Check if a binding type is registered
     * @param {string} type 
     * @returns {boolean}
     */
    static isRegistered(type) {
        return this.#registry.has(type);
    }
    
    /**
     * Get available binding types
     * @returns {Array<string>}
     */
    static getAvailableTypes() {
        return Array.from(this.#registry.keys());
    }
    
    /**
     * Create binding from JSON using registry (Registry Pattern - no switch statement!)
     * @param {Object} json 
     * @returns {Binding}
     */
    static createFromJSON(json) {
        if (!json || !json.type) {
            throw new Error('Invalid binding JSON: type is required');
        }
        
        const factoryFunction = this.#registry.get(json.type);
        
        if (!factoryFunction) {
            const available = Array.from(this.#registry.keys()).join(', ');
            throw new Error(
                `Unknown binding type: "${json.type}". ` +
                `Available types: ${available}. ` +
                `Use BindingRegistry.register() to add new types.`
            );
        }
        
        return factoryFunction(json);
    }
}

/**
 * Factory Method to create Binding from JSON (public API)
 * Uses BindingRegistry internally
 * @param {Object} json 
 * @returns {Binding}
 */
export function createBindingFromJSON(json) {
    return BindingRegistry.createFromJSON(json);
}