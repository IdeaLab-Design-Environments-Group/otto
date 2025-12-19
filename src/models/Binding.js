/**
 * Binding System using Strategy Pattern
 * Base class and concrete implementations for different binding strategies
 * Registry Pattern for creating bindings from JSON (see BindingRegistry.js)
 */

/**
 * Base Binding class (Strategy Pattern)
 */
export class Binding {
    constructor(type) {
        if (this.constructor === Binding) {
            throw new Error('Binding is an abstract class and cannot be instantiated directly');
        }
        this.type = type;
    }
    
    /**
     * Abstract method to resolve binding to a number
     * @param {Object} parameterStore - The parameter store to resolve references
     * @param {Object} expressionParser - Optional expression parser for ExpressionBinding
     * @returns {number}
     */
    resolve(parameterStore, expressionParser = null) {
        throw new Error('resolve() must be implemented by subclass');
    }
    
    /**
     * Serialize to JSON
     * @returns {Object}
     */
    toJSON() {
        throw new Error('toJSON() must be implemented by subclass');
    }
}

/**
 * LiteralBinding - Returns a literal number value
 */
export class LiteralBinding extends Binding {
    constructor(value) {
        super('literal');
        this.value = value;
    }
    
    resolve(parameterStore, expressionParser = null) {
        return this.value;
    }
    
    toJSON() {
        return {
            type: this.type,
            value: this.value
        };
    }
}

/**
 * ParameterBinding - Looks up parameter value by id
 */
export class ParameterBinding extends Binding {
    constructor(parameterId) {
        super('parameter');
        this.parameterId = parameterId;
    }
    
    resolve(parameterStore, expressionParser = null) {
        if (!parameterStore) {
            throw new Error('ParameterStore is required for ParameterBinding');
        }
        const param = parameterStore.get(this.parameterId);
        if (!param) {
            console.warn(`Parameter ${this.parameterId} not found, returning 0`);
            return 0;
        }
        return param.getValue();
    }
    
    toJSON() {
        return {
            type: this.type,
            parameterId: this.parameterId
        };
    }
}

/**
 * ExpressionBinding - Parses and evaluates an expression
 */
export class ExpressionBinding extends Binding {
    constructor(expression) {
        super('expression');
        this.expression = expression;
        this._cachedAST = null;
    }
    
    resolve(parameterStore, expressionParser = null) {
        if (!expressionParser) {
            throw new Error('ExpressionParser is required for ExpressionBinding');
        }
        if (!parameterStore) {
            throw new Error('ParameterStore is required for ExpressionBinding');
        }
        
        // Parse expression if not already parsed
        if (!this._cachedAST) {
            this._cachedAST = expressionParser.parse(this.expression);
        }
        
        // Create context with parameter values
        const context = {};
        const allParams = parameterStore.getAll();
        allParams.forEach(param => {
            context[param.name] = param.getValue();
        });
        
        return expressionParser.evaluate(this._cachedAST, context);
    }
    
    toJSON() {
        return {
            type: this.type,
            expression: this.expression
        };
    }
}

// Note: createBindingFromJSON is now exported from BindingRegistry.js
// Re-export for backward compatibility
export { BindingRegistry, createBindingFromJSON } from './BindingRegistry.js';
