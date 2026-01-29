import { BindingHandler } from '../BindingHandler.js';

/**
 * ScaleHandler - Scales value by a factor
 *
 * Multiplies the value by a scale factor, optionally with offset.
 * Formula: output = (input * scale) + offset
 *
 * Usage:
 * new ScaleHandler(2);          // Double the value
 * new ScaleHandler(0.5);        // Halve the value
 * new ScaleHandler(2, 10);      // Double then add 10
 * new ScaleHandler(-1, 100);    // Invert around 100: (v * -1) + 100
 */
export class ScaleHandler extends BindingHandler {
    /**
     * @param {number} scale - Scale factor (default: 1)
     * @param {number} offset - Value to add after scaling (default: 0)
     */
    constructor(scale = 1, offset = 0) {
        super();
        this.scale = scale;
        this.offset = offset;
    }

    process(value, context) {
        // Handle non-numbers
        if (typeof value !== 'number' || isNaN(value)) {
            return { value, valid: true }; // Pass through
        }

        const scaledValue = (value * this.scale) + this.offset;

        return { value: scaledValue, valid: true };
    }

    getType() {
        return 'scale';
    }

    toJSON() {
        return {
            ...super.toJSON(),
            scale: this.scale,
            offset: this.offset
        };
    }

    static fromJSON(json) {
        return new ScaleHandler(json.scale, json.offset);
    }
}

/**
 * MapRangeHandler - Maps value from one range to another
 *
 * Useful for normalizing or converting between different scales.
 *
 * Usage:
 * // Map 0-100 to 0-1
 * new MapRangeHandler(0, 100, 0, 1);
 *
 * // Map 0-255 to 0-100
 * new MapRangeHandler(0, 255, 0, 100);
 */
export class MapRangeHandler extends BindingHandler {
    /**
     * @param {number} inMin - Input range minimum
     * @param {number} inMax - Input range maximum
     * @param {number} outMin - Output range minimum
     * @param {number} outMax - Output range maximum
     * @param {boolean} clamp - Clamp output to output range (default: true)
     */
    constructor(inMin = 0, inMax = 100, outMin = 0, outMax = 1, clamp = true) {
        super();
        this.inMin = inMin;
        this.inMax = inMax;
        this.outMin = outMin;
        this.outMax = outMax;
        this.clamp = clamp;
    }

    process(value, context) {
        // Handle non-numbers
        if (typeof value !== 'number' || isNaN(value)) {
            return { value, valid: true }; // Pass through
        }

        // Normalize to 0-1
        const normalized = (value - this.inMin) / (this.inMax - this.inMin);

        // Map to output range
        let mapped = this.outMin + normalized * (this.outMax - this.outMin);

        // Optionally clamp
        if (this.clamp) {
            const min = Math.min(this.outMin, this.outMax);
            const max = Math.max(this.outMin, this.outMax);
            mapped = Math.max(min, Math.min(max, mapped));
        }

        return { value: mapped, valid: true };
    }

    getType() {
        return 'mapRange';
    }

    toJSON() {
        return {
            ...super.toJSON(),
            inMin: this.inMin,
            inMax: this.inMax,
            outMin: this.outMin,
            outMax: this.outMax,
            clamp: this.clamp
        };
    }

    static fromJSON(json) {
        return new MapRangeHandler(
            json.inMin,
            json.inMax,
            json.outMin,
            json.outMax,
            json.clamp
        );
    }
}
