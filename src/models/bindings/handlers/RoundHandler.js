import { BindingHandler } from '../BindingHandler.js';

/**
 * RoundHandler - Rounds value to specified precision
 *
 * Supports different rounding modes and decimal precision.
 *
 * Usage:
 * new RoundHandler();                    // Round to integer
 * new RoundHandler(2);                   // Round to 2 decimal places
 * new RoundHandler(0, 'floor');          // Floor to integer
 * new RoundHandler(0, 'ceil');           // Ceiling to integer
 */
export class RoundHandler extends BindingHandler {
    /**
     * @param {number} decimals - Number of decimal places (default: 0 for integer)
     * @param {string} mode - Rounding mode: 'round', 'floor', 'ceil', 'trunc'
     */
    constructor(decimals = 0, mode = 'round') {
        super();
        this.decimals = decimals;
        this.mode = mode;
    }

    process(value, context) {
        // Handle non-numbers
        if (typeof value !== 'number' || isNaN(value)) {
            return { value, valid: true }; // Pass through
        }

        const multiplier = Math.pow(10, this.decimals);
        let roundedValue;

        switch (this.mode) {
            case 'floor':
                roundedValue = Math.floor(value * multiplier) / multiplier;
                break;
            case 'ceil':
                roundedValue = Math.ceil(value * multiplier) / multiplier;
                break;
            case 'trunc':
                roundedValue = Math.trunc(value * multiplier) / multiplier;
                break;
            case 'round':
            default:
                roundedValue = Math.round(value * multiplier) / multiplier;
                break;
        }

        return { value: roundedValue, valid: true };
    }

    getType() {
        return 'round';
    }

    toJSON() {
        return {
            ...super.toJSON(),
            decimals: this.decimals,
            mode: this.mode
        };
    }

    static fromJSON(json) {
        return new RoundHandler(json.decimals, json.mode);
    }
}
