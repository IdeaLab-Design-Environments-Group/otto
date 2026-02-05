/**
 * @fileoverview Donut (annulus / washer) -- a ring-shaped region between two concentric
 * circles.
 *
 * The Donut deviates from the standard shape patterns in three notable ways:
 *
 *   1. getBounds() is computed analytically (centre +/- outerRadius) instead of
 *      delegating to a geometry path.  The bounding box of a circle is trivially known,
 *      so there is no reason to pay the cost of path construction just for bounds.
 *
 *   2. containsPoint() uses a direct Euclidean distance check:
 *          innerRadius <= dist(point, centre) <= outerRadius
 *      This is O(1) and exact, whereas the path-based styleContainsPoint approach would
 *      require constructing the full winding-rule path.  The distance check is both faster
 *      and more accurate for circular annuli.
 *
 *   3. The geometry path (used for rendering, edge extraction, and boolean operations)
 *      encodes the hole via the non-zero winding rule.  The outer circle is traced
 *      counter-clockwise (forward), a zero-length "bridge" segment connects it to the
 *      inner circle's starting point, and the inner circle is traced clockwise (backward,
 *      i.e. the loop index decrements).  When this single closed path is filled with the
 *      non-zero winding rule, the inner region winds to zero and is left unfilled --
 *      producing the hole.
 *
 * The render() method uses the native canvas arc() API with the {@code anticlockwise}
 * flag set to true for the inner circle.  This achieves the same winding-rule hole
 * effect using the browser's built-in arc primitives, which is faster than emitting
 * the sampled polygon path.
 *
 * @module models/shapes/Donut
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
 * Opaque black fill for hit-testing.  Declared here for consistency with other shape
 * modules even though Donut does not use it in containsPoint (which uses a direct
 * distance check instead).  It is available if the path-based hit test is ever needed
 * for edge cases.
 *
 * @type {import('../../geometry/index.js').Fill}
 * @constant
 * @private
 */
const HIT_TEST_FILL = new GeoFill(new GeoColor(0, 0, 0, 1));

/**
 * Annular ring (donut / washer) shape.
 *
 * Bindable properties: {@code centerX}, {@code centerY}, {@code outerRadius},
 * {@code innerRadius}.
 *
 * @extends Shape
 */
export class Donut extends Shape {
    /**
     * @param {string}         id            - Unique shape identifier (e.g. "Donut 1").
     * @param {{x: number, y: number}} [position={x:0,y:0}] - Legacy position (not used
     *        for geometry).
     * @param {number}         [centerX=0]       - X coordinate of the donut centre.
     * @param {number}         [centerY=0]       - Y coordinate of the donut centre.
     * @param {number}         [outerRadius=25]  - Radius of the outer circle.
     * @param {number}         [innerRadius=12.5]- Radius of the inner circle (the hole).
     *        Must be less than outerRadius to produce a visible ring.
     */
    constructor(id, position = { x: 0, y: 0 }, centerX = 0, centerY = 0, outerRadius = 25, innerRadius = 12.5) {
        super(id, 'donut', position);
        /** @type {number} X coordinate of the donut centre. Bindable. */
        this.centerX = centerX;
        /** @type {number} Y coordinate of the donut centre. Bindable. */
        this.centerY = centerY;
        /** @type {number} Outer circle radius. Bindable. */
        this.outerRadius = outerRadius;
        /** @type {number} Inner circle radius (hole boundary). Bindable. */
        this.innerRadius = innerRadius;
    }

    /**
     * Declares which Donut properties can be driven by parameter bindings.
     * @returns {string[]} Always {@code ['centerX', 'centerY', 'outerRadius', 'innerRadius']}.
     */
    getBindableProperties() {
        return ['centerX', 'centerY', 'outerRadius', 'innerRadius'];
    }

    /**
     * Compute the AABB analytically.  For a circle (and therefore for the outer boundary
     * of a donut) the bounding box is simply centre +/- radius on each axis.  No geometry
     * path construction is needed.
     *
     * @returns {{x: number, y: number, width: number, height: number}}
     */
    getBounds() {
        return {
            x: this.centerX - this.outerRadius,
            y: this.centerY - this.outerRadius,
            width: this.outerRadius * 2,
            height: this.outerRadius * 2
        };
    }

    /**
     * Test whether (x, y) falls within the ring using a direct distance check.
     *
     * A point is inside the donut if and only if its Euclidean distance from the
     * centre is between innerRadius and outerRadius (inclusive on both ends).  This
     * O(1) test is both faster and more accurate than the path-based
     * {@link styleContainsPoint} approach for circular geometry.
     *
     * @param {number} x - X coordinate to test.
     * @param {number} y - Y coordinate to test.
     * @returns {boolean} True if the point is in the ring (not in the hole, not outside).
     */
    containsPoint(x, y) {
        const dx = x - this.centerX;
        const dy = y - this.centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist <= this.outerRadius && dist >= this.innerRadius;
    }

    /**
     * Render the donut onto the canvas using native arc() calls.
     *
     * The outer circle is drawn counter-clockwise (the default).  The inner circle is
     * drawn with {@code anticlockwise = true}.  When the canvas fills this combined
     * path using the non-zero winding rule (the default), the inner circle's opposite
     * winding direction cancels the outer circle's winding, leaving the centre hole
     * unfilled.  Here only the stroke is emitted, but the winding setup ensures that
     * any future fill call (e.g. by the renderer for selection highlighting) will
     * correctly show the hole.
     *
     * @param {CanvasRenderingContext2D} ctx - The Otto canvas 2D context.
     */
    render(ctx) {
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.outerRadius, 0, Math.PI * 2);
        ctx.arc(this.centerX, this.centerY, this.innerRadius, 0, Math.PI * 2, true);
        ctx.stroke();
    }

    /**
     * Build the geometry-library Path that represents the annular ring as a single
     * closed contour with a winding-rule hole.
     *
     * Construction:
     *   1. Outer circle: 64 segments traced counter-clockwise (i increments from 0 to 64).
     *   2. Bridge: a single point at (centerX + innerRadius, centerY) -- the starting
     *      point of the inner circle.  This connects the end of the outer circle to the
     *      start of the inner circle without lifting the pen.
     *   3. Inner circle: 64 segments traced clockwise (i decrements from 64 to 0).
     *      The reversed winding is what creates the hole when the path is filled.
     *
     * The result is a single closed path.  Any system that fills it with the non-zero
     * winding rule will correctly render the donut shape.
     *
     * @returns {import('../../geometry/Path.js').Path} A closed winding-rule donut GeoPath.
     */
    toGeometryPath() {
        const segments = 64;
        const points = [];

        // Outer circle
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push(new GeoVec(
                this.centerX + Math.cos(angle) * this.outerRadius,
                this.centerY + Math.sin(angle) * this.outerRadius
            ));
        }

        // Bridge to inner
        points.push(new GeoVec(this.centerX + this.innerRadius, this.centerY));

        // Inner circle (reversed)
        for (let i = segments; i >= 0; i--) {
            const angle = (i / segments) * Math.PI * 2;
            points.push(new GeoVec(
                this.centerX + Math.cos(angle) * this.innerRadius,
                this.centerY + Math.sin(angle) * this.innerRadius
            ));
        }

        return GeoPath.fromPoints(points, true);
    }

    /**
     * Return the donut outline as an array of plain {@code {x, y}} objects.
     *
     * This method produces the exact same geometry as {@link toGeometryPath} but in the
     * plain-object format consumed by the boolean-operation subsystem (the programming
     * module).  The outer circle, bridge, inner circle (reversed), and a closing bridge
     * back to the outer circle start are all included.
     *
     * @param {number} [segments=64] - Number of line segments per circle.  Higher values
     *        produce smoother curves at the cost of more vertices in boolean operations.
     * @returns {Array<{x: number, y: number}>} Ordered vertex list for the donut outline.
     */
    getPoints(segments = 64) {
        const points = [];

        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push({
                x: this.centerX + Math.cos(angle) * this.outerRadius,
                y: this.centerY + Math.sin(angle) * this.outerRadius
            });
        }

        points.push({
            x: this.centerX + this.innerRadius,
            y: this.centerY
        });

        for (let i = segments; i >= 0; i--) {
            const angle = (i / segments) * Math.PI * 2;
            points.push({
                x: this.centerX + Math.cos(angle) * this.innerRadius,
                y: this.centerY + Math.sin(angle) * this.innerRadius
            });
        }

        points.push({
            x: this.centerX + this.outerRadius,
            y: this.centerY
        });

        return points;
    }

    /**
     * Deep-copy this Donut, including all active bindings.
     * @returns {Donut} A new Donut value-equal to this one.
     */
    clone() {
        const d = new Donut(this.id, { ...this.position }, this.centerX, this.centerY, this.outerRadius, this.innerRadius);
        this.getBindableProperties().forEach(property => {
            if (this.bindings[property]) {
                d.setBinding(property, this.bindings[property]);
            }
        });
        return d;
    }

    /**
     * Reconstruct a Donut from serialized JSON.  Bindings are restored afterward
     * by {@link ShapeRegistry.fromJSON}.
     *
     * @param {Object} json              - Serialized shape object.
     * @param {string} json.id           - Shape identifier.
     * @param {Object} [json.position]   - Legacy position.
     * @param {number} [json.centerX]    - Serialized centre X.
     * @param {number} [json.centerY]    - Serialized centre Y.
     * @param {number} [json.outerRadius]- Serialized outer radius.
     * @param {number} [json.innerRadius]- Serialized inner radius.
     * @returns {Donut} A new Donut with geometry restored.
     */
    static fromJSON(json) {
        return new Donut(
            json.id,
            json.position || { x: 0, y: 0 },
            json.centerX || 0,
            json.centerY || 0,
            json.outerRadius || 50,
            json.innerRadius || 25
        );
    }
}
