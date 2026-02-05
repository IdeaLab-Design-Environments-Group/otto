/**
 * @fileoverview Isosceles triangle centred on a point and defined by a base width and
 * a height.
 *
 * The triangle is symmetric about the vertical axis through its centre.  The two base
 * vertices sit at the top of the shape (cy - height/2) and the apex sits at the bottom
 * (cy + height/2).  This orientation -- flat edge on top, point at the bottom -- was
 * chosen as the default because it matches the common "downward arrow" metaphor.  Users
 * can flip it by binding height to a negative value or by simply rotating the shape.
 *
 * All four defining values (centre position, base, height) are bindable, giving full
 * parametric control over the triangle's size and position.
 *
 * @module models/shapes/Triangle
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
 * Isosceles triangle defined by centre, base width, and height.
 *
 * Bindable properties: {@code centerX}, {@code centerY}, {@code base}, {@code height}.
 *
 * @extends Shape
 */
export class Triangle extends Shape {
    /**
     * @param {string}         id       - Unique shape identifier (e.g. "Triangle 1").
     * @param {{x: number, y: number}} [position={x:0,y:0}] - Legacy position (not used
     *        for geometry).
     * @param {number}         [centerX=0]  - X coordinate of the triangle's geometric centre.
     * @param {number}         [centerY=0]  - Y coordinate of the triangle's geometric centre.
     * @param {number}         [base=30]    - Width of the flat (top) edge of the triangle.
     * @param {number}         [height=40]  - Vertical distance from the base edge to the apex.
     */
    constructor(id, position = { x: 0, y: 0 }, centerX = 0, centerY = 0, base = 30, height = 40) {
        super(id, 'triangle', position);
        /** @type {number} X coordinate of the triangle centre. Bindable. */
        this.centerX = centerX;
        /** @type {number} Y coordinate of the triangle centre. Bindable. */
        this.centerY = centerY;
        /** @type {number} Width of the base edge. Bindable. */
        this.base = base;
        /** @type {number} Height from base to apex. Bindable. */
        this.height = height;
    }

    /**
     * Declares which Triangle properties can be driven by parameter bindings.
     * @returns {string[]} Always {@code ['centerX', 'centerY', 'base', 'height']}.
     */
    getBindableProperties() {
        return ['centerX', 'centerY', 'base', 'height'];
    }

    /**
     * Compute the AABB by delegating to the geometry path.
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
     * Test whether (x, y) is inside the triangle using a fill-based hit test.
     *
     * @param {number} x - X coordinate to test.
     * @param {number} y - Y coordinate to test.
     * @returns {boolean} True if the point is inside or on the triangle boundary.
     */
    containsPoint(x, y) {
        const path = this.toGeometryPath();
        path.assignFill(HIT_TEST_FILL);
        return styleContainsPoint(path, new GeoVec(x, y));
    }

    /**
     * Render the triangle outline onto the canvas.
     * @param {CanvasRenderingContext2D} ctx - The Otto canvas 2D context.
     */
    render(ctx) {
        const path = this.toGeometryPath();
        ctx.beginPath();
        path.toCanvasPath(ctx);
        ctx.stroke();
    }

    /**
     * Build the geometry-library Path from three analytically-computed vertices.
     *
     * Vertex layout (centred on (centerX, centerY)):
     *   - Top-left:  (cx - base/2,  cy - height/2)  -- left end of the base edge
     *   - Top-right: (cx + base/2,  cy - height/2)  -- right end of the base edge
     *   - Apex:      (cx,           cy + height/2)  -- bottom point
     *
     * The path is closed so the apex connects back to the top-left vertex.
     *
     * @returns {import('../../geometry/Path.js').Path} A closed 3-vertex GeoPath.
     */
    toGeometryPath() {
        const cx = this.centerX;
        const cy = this.centerY;
        const b = this.base;
        const h = this.height;

        const points = [
            new GeoVec(cx - b / 2, cy - h / 2),
            new GeoVec(cx + b / 2, cy - h / 2),
            new GeoVec(cx, cy + h / 2)
        ];

        return GeoPath.fromPoints(points, true);
    }

    /**
     * Deep-copy this Triangle, including all active bindings.
     * @returns {Triangle} A new Triangle value-equal to this one.
     */
    clone() {
        const tri = new Triangle(this.id, { ...this.position }, this.centerX, this.centerY, this.base, this.height);
        this.getBindableProperties().forEach(property => {
            if (this.bindings[property]) {
                tri.setBinding(property, this.bindings[property]);
            }
        });
        return tri;
    }

    /**
     * Reconstruct a Triangle from serialized JSON.  Bindings are restored afterward
     * by {@link ShapeRegistry.fromJSON}.
     *
     * @param {Object} json            - Serialized shape object.
     * @param {string} json.id         - Shape identifier.
     * @param {Object} [json.position] - Legacy position.
     * @param {number} [json.centerX]  - Serialized centre X.
     * @param {number} [json.centerY]  - Serialized centre Y.
     * @param {number} [json.base]     - Serialized base width.
     * @param {number} [json.height]   - Serialized height.
     * @returns {Triangle} A new Triangle with geometry restored.
     */
    static fromJSON(json) {
        return new Triangle(
            json.id,
            json.position || { x: 0, y: 0 },
            json.centerX || 0,
            json.centerY || 0,
            json.base || 60,
            json.height || 80
        );
    }
}
