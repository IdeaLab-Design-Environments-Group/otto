import { BindingHandler } from '../BindingHandler.js';

/**
 * ValidationHandler - Validates value is within acceptable range
 *
 * Rejects values outside the specified range (does not modify value).
 * Use ClampHandler if you want to adjust out-of-range values instead.
 *
 * Usage:
 * const handler = new ValidationHandler(0, 100);
 * handler.handle(50);  // → { value: 50, valid: true }
 * handler.handle(150); // → { value: 150, valid: false, error: '...' }
 */
export class ValidationHandler extends BindingHandler {
    /**
     * @param {number} min - Minimum allowed value (inclusive)
     * @param {number} max - Maximum allowed value (inclusive)
     * @param {Object} options - Additional options
     * @param {boolean} options.allowNull - Allow null/undefined values (default: false)
     * @param {string} options.errorMessage - Custom error message template
     */
    constructor(min = -Infinity, max = Infinity, options = {}) {
        super();
        this.min = min;
        this.max = max;
        this.allowNull = options.allowNull || false;
        this.errorMessage = options.errorMessage || null;
    }

    process(value, context) {
        // Handle null/undefined
        if (value === null || value === undefined) {
            if (this.allowNull) {
                return { value, valid: true };
            }
            return {
                value,
                valid: false,
                error: this.formatError('Value cannot be null or undefined', value)
            };
        }

        // Check type
        if (typeof value !== 'number' || isNaN(value)) {
            return {
                value,
                valid: false,
                error: this.formatError('Value must be a number', value)
            };
        }

        // Check range
        if (value < this.min) {
            return {
                value,
                valid: false,
                error: this.formatError(`Value ${value} is below minimum ${this.min}`, value)
            };
        }

        if (value > this.max) {
            return {
                value,
                valid: false,
                error: this.formatError(`Value ${value} is above maximum ${this.max}`, value)
            };
        }

        return { value, valid: true };
    }

    /**
     * Format error message
     */
    formatError(defaultMsg, value) {
        if (this.errorMessage) {
            return this.errorMessage
                .replace('{value}', value)
                .replace('{min}', this.min)
                .replace('{max}', this.max);
        }
        return defaultMsg;
    }

    getType() {
        return 'validation';
    }

    toJSON() {
        return {
            ...super.toJSON(),
            min: this.min,
            max: this.max,
            allowNull: this.allowNull,
            errorMessage: this.errorMessage
        };
    }

    static fromJSON(json) {
        return new ValidationHandler(json.min, json.max, {
            allowNull: json.allowNull,
            errorMessage: json.errorMessage
        });
    }
}
