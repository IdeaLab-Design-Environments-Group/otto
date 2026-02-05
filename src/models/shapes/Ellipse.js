/**
 * @fileoverview Ellipse -- an oval defined by independent horizontal and vertical radii.
 *
 * Unlike {@link Circle}, which uses the geometry library's native circle primitive, Ellipse
 * does NOT have a corresponding native primitive in the current geometry library.  It is
 * therefore approximated as a closed polygon of 64 sampled points.  64 segments produce a
 * visually indistinguishable curve at normal zoom levels while keeping the vertex count
 * low enough that bounding-box and hit-test calculations remain fast.
 *
 * Each sample point is computed by walking the unit circle at uniform angular intervals
 * and scaling the X and Y coordinates independently by radiusX and radiusY respectively.
 * This is the standard parametric form of an ellipse:
 *     x(t) = centerX + radiusX * cos(t)
 *     y(t) = centerY + radiusY * sin(t)
 * where t ranges from 0 to 2*PI.
 *
 * When radiusX equals radiusY the ellipse is a perfect circle, but Circle should be
 * preferred in that case for its exact primitive support.
 *
 * @module models/shapes/Ellipse
 */

import { Shape } from './Shape.js';
import {
    Anchor as GeoAnchor,
    Color as GeoColor,
    Fill as GeoFill,
    Path as GeoPath,
    Vec as GeoVec,
    styleContainsPoint
} from '../../geometry/index.js';

/**
 * Opaque black fill for hit-testing.  See Circle.js for full explanation.
 * @type {import('../../geometry/index.js').Fill}
 * @constant
 * @private
 */
const HIT_TEST_FILL = new GeoFill(new GeoColor(0, 0, 0, 1));

/**
 * Ellipse shape -- an oval with independently controllable horizontal and vertical radii.
 *
 * Bindable properties: {@code centerX}, {@code centerY}, {@code radiusX}, {@code radiusY}.
 *
 * @extends Shape
 */
export class Ellipse extends Shape {
    /**
     * @param {string}         id       - Unique shape identifier (e.g. "Ellipse 1").
     * @param {{x: number, y: number}} [position={x:0,y:0}] - Legacy position (not used
     *        for geometry).
     * @param {number}         [centerX=0]   - X coordinate of the ellipse centre.
     * @param {number}         [centerY=0]   - Y coordinate of the ellipse centre.
     * @param {number}         [radiusX=30]  - Horizontal semi-axis (half-width).
     * @param {number}         [radiusY=20]  - Vertical semi-axis (half-height).
     */
    constructor(id, position = { x: 0, y: 0 }, centerX = 0, centerY = 0, radiusX = 30, radiusY = 20) {
        super(id, 'ellipse', position);
        /** @type {number} X coordinate of the ellipse centre. Bindable. */
        this.centerX = centerX;
        /** @type {number} Y coordinate of the ellipse centre. Bindable. */
        this.centerY = centerY;
        /** @type {number} Horizontal semi-axis length. Bindable. */
        this.radiusX = radiusX;
        /** @type {number} Vertical semi-axis length. Bindable. */
        this.radiusY = radiusY;
    }

    /**
     * Declares which Ellipse properties can be driven by parameter bindings.
     * @returns {string[]} Always {@code ['centerX', 'centerY', 'radiusX', 'radiusY']}.
     */
    getBindableProperties() {
        return ['centerX', 'centerY', 'radiusX', 'radiusY'];
    }

    /**
     * Compute the AABB by delegating to the geometry path.
     * Because the ellipse is sampled as a 64-gon, the bounding box is slightly larger
     * than the true analytic AABB of a perfect ellipse -- the difference is sub-pixel
     * at 64 segments and imperceptible in practice.
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
     * Test whether (x, y) is inside the ellipse using a fill-based hit test on the
     * 64-segment polygon approximation.
     *
     * @param {number} x - X coordinate to test.
     * @param {number} y - Y coordinate to test.
     * @returns {boolean} True if the point is inside or on the ellipse boundary.
     */
    containsPoint(x, y) {
        const path = this.toGeometryPath();
        path.assignFill(HIT_TEST_FILL);
        return styleContainsPoint(path, new GeoVec(x, y));
    }

    /**
     * Render the ellipse outline onto the canvas.
     * @param {CanvasRenderingContext2D} ctx - The Otto canvas 2D context.
     */
    render(ctx) {
        const path = this.toGeometryPath();
        ctx.beginPath();
        path.toCanvasPath(ctx);
        ctx.stroke();
    }

    /**
     * Build the geometry-library Path by sampling the ellipse parametric equation at
     * 64 evenly-spaced angles around [0, 2*PI).
     *
     * Each sample computes:
     *     x = centerX + cos(angle) * radiusX
     *     y = centerY + sin(angle) * radiusY
     *
     * 64 segments is the chosen resolution because it provides a visually smooth curve
     * across the range of radii likely to appear in an Otto design while keeping vertex
     * count well below the threshold where polygon-based operations become expensive.
     *
     * The resulting path is closed.
     *
     * @returns {import('../../geometry/Path.js').Path} A closed 64-vertex GeoPath.
     */
    toGeometryPath() {
        // Create ellipse by sampling points
        const segments = 64;
        const points = [];
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push(new GeoVec(
                this.centerX + Math.cos(angle) * this.radiusX,
                this.centerY + Math.sin(angle) * this.radiusY
            ));
        }
        return GeoPath.fromPoints(points, true);
    }

    /**
     * Deep-copy this Ellipse, including all active bindings.
     * @returns {Ellipse} A new Ellipse value-equal to this one.
     */
    clone() {
        const el = new Ellipse(this.id, { ...this.position }, this.centerX, this.centerY, this.radiusX, this.radiusY);
        this.getBindableProperties().forEach(property => {
            if (this.bindings[property]) {
                el.setBinding(property, this.bindings[property]);
            }
        });
        return el;
    }

    /**
     * Reconstruct an Ellipse from serialized JSON.  Bindings are restored afterward
     * by {@link ShapeRegistry.fromJSON}.
     *
     * @param {Object} json            - Serialized shape object.
     * @param {string} json.id         - Shape identifier.
     * @param {Object} [json.position] - Legacy position.
     * @param {number} [json.centerX]  - Serialized centre X.
     * @param {number} [json.centerY]  - Serialized centre Y.
     * @param {number} [json.radiusX]  - Serialized horizontal semi-axis.
     * @param {number} [json.radiusY]  - Serialized vertical semi-axis.
     * @returns {Ellipse} A new Ellipse with geometry restored.
     */
    static fromJSON(json) {
        return new Ellipse(
            json.id,
            json.position || { x: 0, y: 0 },
            json.centerX || 0,
            json.centerY || 0,
            json.radiusX || 60,
            json.radiusY || 40
        );
    }
}
