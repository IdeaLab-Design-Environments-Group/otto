/**
 * @fileoverview Line -- a two-endpoint open path segment in the Otto design system.
 *
 * A Line has no enclosed area; it is purely a stroke.  This has an important
 * consequence for hit-testing: because there is nothing to fill, containsPoint()
 * must use a thick stroke (width 6) as the hit region rather than a fill.  That is
 * why this module defines {@link HIT_TEST_STROKE} instead of the HIT_TEST_FILL used
 * by closed shapes like Circle and Rectangle.
 *
 * Line also overrides {@link Shape#toJSON} to explicitly write x1/y1/x2/y2 into the
 * serialized object.  The base-class toJSON() already iterates bindable properties, but
 * the explicit write ensures the four endpoint coordinates are always present even when
 * the base class's conditional logic (skip if bound) might otherwise omit one.
 *
 * @module models/shapes/Line
 */

import { Shape } from './Shape.js';
import {
    Color as GeoColor,
    Path as GeoPath,
    Stroke as GeoStroke,
    Vec as GeoVec,
    styleContainsPoint
} from '../../geometry/index.js';

/**
 * Thick opaque black stroke used exclusively for hit-testing open paths.
 *
 * WHY stroke instead of fill: a line segment has zero area, so assigning a fill and
 * calling styleContainsPoint would always return false.  Instead, a stroke of width 6
 * is assigned.  This creates a rectangular "slab" around the line that the user can
 * click/tap on.  Width 6 is large enough to be comfortably clickable on both desktop
 * and touch surfaces without making the hit region visually misleading.
 *
 * The stroke is cloned before assignment (see containsPoint) so the module-level
 * constant is never mutated.
 *
 * @type {import('../../geometry/index.js').Stroke}
 * @constant
 * @private
 */
const HIT_TEST_STROKE = new GeoStroke(new GeoColor(0, 0, 0, 1), false, 6, 'centered', 'round', 'round', 4);

/**
 * Two-endpoint open line segment.
 *
 * Bindable properties: {@code x1}, {@code y1}, {@code x2}, {@code y2}.
 *
 * @extends Shape
 */
export class Line extends Shape {
    /**
     * @param {string}         id       - Unique shape identifier (e.g. "Line 1").
     * @param {{x: number, y: number}} [position={x:0,y:0}] - Legacy position (not used
     *        for geometry).
     * @param {number}         [x1=0]   - X coordinate of the first endpoint.
     * @param {number}         [y1=0]   - Y coordinate of the first endpoint.
     * @param {number}         [x2=40]  - X coordinate of the second endpoint.
     * @param {number}         [y2=0]   - Y coordinate of the second endpoint.
     */
    constructor(id, position = { x: 0, y: 0 }, x1 = 0, y1 = 0, x2 = 40, y2 = 0) {
        super(id, 'line', position);
        /** @type {number} X coordinate of endpoint 1. Bindable. */
        this.x1 = x1;
        /** @type {number} Y coordinate of endpoint 1. Bindable. */
        this.y1 = y1;
        /** @type {number} X coordinate of endpoint 2. Bindable. */
        this.x2 = x2;
        /** @type {number} Y coordinate of endpoint 2. Bindable. */
        this.y2 = y2;
    }

    /**
     * Declares which Line properties can be driven by parameter bindings.
     * @returns {string[]} Always {@code ['x1', 'y1', 'x2', 'y2']}.
     */
    getBindableProperties() {
        return ['x1', 'y1', 'x2', 'y2'];
    }

    /**
     * Compute the AABB that encloses the line segment.  For a horizontal or vertical
     * line the bounding box will have zero width or zero height respectively.
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
     * Test whether the point (x, y) is close enough to the line to count as a hit.
     *
     * Because a line has no filled area, this method assigns a cloned copy of
     * {@link HIT_TEST_STROKE} (width 6, round caps) to the path.  The thick stroke
     * creates a clickable "slab" around the segment.  The clone is necessary because
     * assignStroke may mutate the stroke object internally.
     *
     * @param {number} x - X coordinate to test.
     * @param {number} y - Y coordinate to test.
     * @returns {boolean} True if the point falls within the hit stroke around the line.
     */
    containsPoint(x, y) {
        const path = this.toGeometryPath();
        const stroke = HIT_TEST_STROKE.clone();
        path.assignStroke(stroke);
        return styleContainsPoint(path, new GeoVec(x, y));
    }

    /**
     * Render the line segment onto the canvas.  Sets an explicit black stroke style
     * and width 1 before stroking.
     *
     * @param {CanvasRenderingContext2D} ctx - The Otto canvas 2D context.
     */
    render(ctx) {
        const path = this.toGeometryPath();
        ctx.beginPath();
        path.toCanvasPath(ctx);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    /**
     * Build the geometry-library Path for this line segment.
     *
     * Creates an open (non-closed) path from two points using {@link GeoPath.fromPoints}.
     * The {@code false} argument explicitly marks the path as open, which is critical:
     * an open path will not connect the last point back to the first, and the geometry
     * library will not attempt to fill it.
     *
     * @returns {import('../../geometry/Path.js').Path} An open two-point GeoPath.
     */
    toGeometryPath() {
        return GeoPath.fromPoints([
            new GeoVec(this.x1, this.y1),
            new GeoVec(this.x2, this.y2)
        ], false);
    }

    /**
     * Deep-copy this Line, including all active bindings.
     * @returns {Line} A new Line value-equal to this one.
     */
    clone() {
        const line = new Line(
            this.id,
            { ...this.position },
            this.x1,
            this.y1,
            this.x2,
            this.y2
        );
        // Copy bindings
        this.getBindableProperties().forEach(property => {
            if (this.bindings[property]) {
                line.setBinding(property, this.bindings[property]);
            }
        });
        return line;
    }

    /**
     * Serialize this Line to JSON.  Extends the base-class serialization with an
     * explicit write of all four endpoint coordinates.
     *
     * WHY the override: the base {@link Shape#toJSON} only writes a bindable property
     * when it has no active binding (the assumption being that bound properties are
     * reconstructed from the binding at load time).  For Line the four endpoint coords
     * are also the shape's sole geometry, so they must always be present to allow
     * correct reconstruction even if some are bound.  The explicit writes here guarantee
     * that.
     *
     * @returns {Object} Serialized Line object.
     */
    toJSON() {
        const json = super.toJSON();
        json.x1 = this.x1;
        json.y1 = this.y1;
        json.x2 = this.x2;
        json.y2 = this.y2;
        return json;
    }

    /**
     * Reconstruct a Line from its serialized JSON.  Bindings are restored afterward
     * by {@link ShapeRegistry.fromJSON}.
     *
     * @param {Object} json          - Serialized shape object.
     * @param {string} json.id       - Shape identifier.
     * @param {Object} [json.position] - Legacy position.
     * @param {number} [json.x1]     - Serialized endpoint 1 X.
     * @param {number} [json.y1]     - Serialized endpoint 1 Y.
     * @param {number} [json.x2]     - Serialized endpoint 2 X.
     * @param {number} [json.y2]     - Serialized endpoint 2 Y.
     * @returns {Line} A new Line with geometry restored.
     */
    static fromJSON(json) {
        const line = new Line(
            json.id,
            json.position || { x: 0, y: 0 },
            json.x1 || 0,
            json.y1 || 0,
            json.x2 || 40,
            json.y2 || 0
        );

        // Restore bindings
        if (json.bindings) {
            Object.keys(json.bindings).forEach(property => {
                // Binding will be restored by ShapeRegistry
            });
        }

        return line;
    }
}
