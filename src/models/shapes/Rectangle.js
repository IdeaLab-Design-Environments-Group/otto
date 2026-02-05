/**
 * @fileoverview Axis-aligned rectangle -- the other fundamental closed shape in Otto,
 * complementing Circle.
 *
 * A rectangle is defined by its top-left corner (x, y) and its dimensions (width, height).
 * All four values are bindable, so any combination of position and size can be driven by
 * parameter sliders.
 *
 * Like Circle, Rectangle uses a native geometry-library primitive ({@link GeoPath.rect})
 * rather than a hand-rolled polygon, which keeps bounding-box calculations exact and
 * rendering crisp.
 *
 * @module models/shapes/Rectangle
 */

import { Shape } from './Shape.js';
import {
    Color as GeoColor,
    Fill as GeoFill,
    Path as GeoPath,
    Vec as GeoVec,
    styleContainsPoint
} from '../../geometry/index.js';

/**
 * Opaque black fill used exclusively for hit-testing via {@link styleContainsPoint}.
 * See the equivalent constant in Circle.js for a detailed explanation of why this
 * module-level singleton exists.
 *
 * @type {import('../../geometry/index.js').Fill}
 * @constant
 * @private
 */
const HIT_TEST_FILL = new GeoFill(new GeoColor(0, 0, 0, 1));

/**
 * Axis-aligned rectangle shape.  Origin is the top-left corner.
 *
 * Bindable properties: {@code x}, {@code y}, {@code width}, {@code height}.
 *
 * @extends Shape
 */
export class Rectangle extends Shape {
    /**
     * @param {string}         id       - Unique shape identifier (e.g. "Rectangle 2").
     * @param {{x: number, y: number}} [position={x:0,y:0}] - Legacy position (not used
     *        for geometry; see {@link Shape} constructor docs).
     * @param {number}         [x=0]        - X coordinate of the top-left corner.
     * @param {number}         [y=0]        - Y coordinate of the top-left corner.
     * @param {number}         [width=40]   - Width of the rectangle in canvas-space units.
     * @param {number}         [height=40]  - Height of the rectangle in canvas-space units.
     */
    constructor(id, position = { x: 0, y: 0 }, x = 0, y = 0, width = 40, height = 40) {
        super(id, 'rectangle', position);
        /** @type {number} X coordinate of the top-left corner. Bindable. */
        this.x = x;
        /** @type {number} Y coordinate of the top-left corner. Bindable. */
        this.y = y;
        /** @type {number} Width of the rectangle. Bindable. */
        this.width = width;
        /** @type {number} Height of the rectangle. Bindable. */
        this.height = height;
    }

    /**
     * Declares which Rectangle properties can be driven by parameter bindings.
     * @returns {string[]} Always {@code ['x', 'y', 'width', 'height']}.
     */
    getBindableProperties() {
        return ['x', 'y', 'width', 'height'];
    }

    /**
     * Compute the AABB by delegating to the geometry path's bounding-box method.
     * Because the shape IS an axis-aligned rectangle, the bounding box is identical
     * to the shape itself -- but the delegation keeps the code consistent with the
     * rest of the shape hierarchy and avoids duplicating the fallback logic.
     *
     * @returns {{x: number, y: number, width: number, height: number}}
     */
    getBounds() {
        const path = this.toGeometryPath();
        const box = path.tightBoundingBox() || path.looseBoundingBox();
        if (!box) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }
        return {
            x: box.min.x,
            y: box.min.y,
            width: box.width(),
            height: box.height()
        };
    }

    /**
     * Test whether the canvas-space point (x, y) falls inside this rectangle.
     * Assigns {@link HIT_TEST_FILL} to the geometry path and delegates to
     * {@link styleContainsPoint}.
     *
     * @param {number} x - X coordinate to test.
     * @param {number} y - Y coordinate to test.
     * @returns {boolean} True if the point is inside or on the rectangle boundary.
     */
    containsPoint(x, y) {
        const path = this.toGeometryPath();
        path.assignFill(HIT_TEST_FILL);
        return styleContainsPoint(path, new GeoVec(x, y));
    }

    /**
     * Render the rectangle onto the given canvas context using the native rect path.
     *
     * @param {CanvasRenderingContext2D} ctx - The Otto canvas 2D context.
     */
    render(ctx) {
        const path = this.toGeometryPath();
        ctx.beginPath();
        path.toCanvasPath(ctx);
        ctx.stroke();
    }

    /**
     * Build the geometry-library Path for this rectangle.
     *
     * Uses {@link GeoPath.rect} -- a native rectangle primitive with exact bounding-box
     * support.  The top-left origin (this.x, this.y) and dimensions (this.width,
     * this.height) map directly to the primitive's parameters.
     *
     * @returns {import('../../geometry/Path.js').Path} A GeoPath representing the rectangle.
     */
    toGeometryPath() {
        return GeoPath.rect(this.x, this.y, this.width, this.height);
    }

    /**
     * Deep-copy this Rectangle, including all active bindings.
     * @returns {Rectangle} A new Rectangle value-equal to this one.
     */
    clone() {
        const rect = new Rectangle(this.id, { ...this.position }, this.x, this.y, this.width, this.height);
        // Copy bindings
        this.getBindableProperties().forEach(property => {
            if (this.bindings[property]) {
                rect.setBinding(property, this.bindings[property]);
            }
        });
        return rect;
    }

    /**
     * Reconstruct a Rectangle from its serialized JSON.  Geometry properties are restored
     * here; bindings are restored afterward by {@link ShapeRegistry.fromJSON}.
     *
     * @param {Object} json            - Serialized shape object.
     * @param {string} json.id         - Shape identifier.
     * @param {Object} [json.position] - Legacy position.
     * @param {number} [json.x]        - Serialized top-left X.
     * @param {number} [json.y]        - Serialized top-left Y.
     * @param {number} [json.width]    - Serialized width.
     * @param {number} [json.height]   - Serialized height.
     * @returns {Rectangle} A new Rectangle with geometry restored.
     */
    static fromJSON(json) {
        const rect = new Rectangle(
            json.id,
            json.position || { x: 0, y: 0 },
            json.x || 0,
            json.y || 0,
            json.width || 100,
            json.height || 100
        );

        // Restore bindings
        if (json.bindings) {
            Object.keys(json.bindings).forEach(property => {
                // Binding will be restored by ShapeRegistry
            });
        }

        return rect;
    }
}
