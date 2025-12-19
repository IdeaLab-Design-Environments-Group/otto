/**
 * Parameter Model - Represents a named parameter with value and constraints
 * Builder Pattern implementation for flexible parameter construction
 */

/**
 * Parameter class
 */
export class Parameter {
    constructor(id, name, value = 0, min = -Infinity, max = Infinity, step = 0) {
        this.id = id;
        this.name = name;
        this.value = value;
        this.min = min;
        this.max = max;
        this.step = step; // 0 means no step constraint (allows decimals)
    }
    
    /**
     * Get the current value
     * @returns {number}
     */
    getValue() {
        return this.value;
    }
    
    /**
     * Set a new value (clamped to min/max)
     * @param {number} newValue 
     */
    setValue(newValue) {
        // Clamp value to min/max range
        this.value = Math.max(this.min, Math.min(this.max, newValue));
        // Round to nearest step if step is defined
        if (this.step > 0) {
            this.value = Math.round(this.value / this.step) * this.step;
        }
    }
    
    /**
     * Serialize to JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            value: this.value,
            min: this.min,
            max: this.max,
            step: this.step
        };
    }
    
    /**
     * Create Parameter from JSON
     * @param {Object} json 
     * @returns {Parameter}
     */
    static fromJSON(json) {
        return new Parameter(
            json.id,
            json.name,
            json.value,
            json.min,
            json.max,
            json.step
        );
    }
}

/**
 * ParameterBuilder - Builder Pattern for creating Parameters
 */
export class ParameterBuilder {
    constructor() {
        this.id = null;
        this.name = null;
        this.value = 0;
        this.min = -Infinity;
        this.max = Infinity;
        this.step = 0; // 0 means no step constraint (allows decimals)
    }
    
    /**
     * Set parameter ID
     * @param {string} id 
     * @returns {ParameterBuilder}
     */
    withId(id) {
        this.id = id;
        return this;
    }
    
    /**
     * Set parameter name
     * @param {string} name 
     * @returns {ParameterBuilder}
     */
    withName(name) {
        this.name = name;
        return this;
    }
    
    /**
     * Set parameter value
     * @param {number} value 
     * @returns {ParameterBuilder}
     */
    withValue(value) {
        this.value = value;
        return this;
    }
    
    /**
     * Set parameter range
     * @param {number} min 
     * @param {number} max 
     * @returns {ParameterBuilder}
     */
    withRange(min, max) {
        this.min = min;
        this.max = max;
        return this;
    }
    
    /**
     * Set parameter step
     * @param {number} step 
     * @returns {ParameterBuilder}
     */
    withStep(step) {
        this.step = step;
        return this;
    }
    
    /**
     * Build and return the Parameter
     * @returns {Parameter}
     */
    build() {
        if (!this.id) {
            // Generate ID if not provided
            this.id = `param-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        if (!this.name) {
            throw new Error('Parameter name is required');
        }
        return new Parameter(
            this.id,
            this.name,
            this.value,
            this.min,
            this.max,
            this.step
        );
    }
}
