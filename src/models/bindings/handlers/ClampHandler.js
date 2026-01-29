import { BindingHandler } from '../BindingHandler.js';

/**
 * ClampHandler - Clamps value to a specified range
 *
 * Modifies out-of-range values to fit within the range.
 * Use ValidationHandler if you want to reject out-of-range values instead.
 *
 * Usage:
 * const handler = new ClampHandler(10, 90);
 * handler.handle(50);  // → { value: 50, valid: true }
 * handler.handle(5);   // → { value: 10, valid: true }
 * handler.handle(150); // → { value: 90, valid: true }
 */
export class ClampHandler extends BindingHandler {
    /**
     * @param {number} min - Minimum value (inclusive)
     * @param {number} max - Maximum value (inclusive)
     */
    constructor(min = -Infinity, max = Infinity) {
        super();
        this.min = min;
        this.max = max;
    }

    process(value, context) {
        // Handle non-numbers
        if (typeof value !== 'number' || isNaN(value)) {
            return { value, valid: true }; // Pass through, let ValidationHandler catch it
        }

        // Clamp the value
        const clampedValue = Math.max(this.min, Math.min(this.max, value));

        return { value: clampedValue, valid: true };
    }

    getType() {
        return 'clamp';
    }

    toJSON() {
        return {
            ...super.toJSON(),
            min: this.min,
            max: this.max
        };
    }

    static fromJSON(json) {
        return new ClampHandler(json.min, json.max);
    }
}
