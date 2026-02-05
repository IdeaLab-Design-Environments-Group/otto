/**
 * @fileoverview N-pointed star, constructed by alternating between an outer and an inner
 * radius as the vertices are walked around the centre.
 *
 * A star with P points has 2*P vertices in total: one outer tip and one inner valley per
 * point.  The point count is clamped to a minimum of 3 (a 2-pointed star degenerates into
 * a line).  Like Polygon, the first vertex starts at angle -PI/2 so that the top tip
 * points straight up.
 *
 * The visual appearance of a star is controlled by the ratio outerRadius / innerRadius.
 * A ratio close to 1 produces a nearly-circular shape; a very small innerRadius relative
 * to outerRadius produces thin, spiky points.  Both radii are independently bindable, so
 * users can animate either or both via parameter sliders.
 *
 * @module models/shapes/Star
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
 * Opaque black fill for hit-testing.  See Circle.js for full explanation.
 * @type {import('../../geometry/index.js').Fill}
 * @constant
 * @private
 */
const HIT_TEST_FILL = new GeoFill(new GeoColor(0, 0, 0, 1));

/**
 * N-pointed star shape.
 *
 * Bindable properties: {@code centerX}, {@code centerY}, {@code outerRadius},
 * {@code innerRadius}, {@code points}.
 *
 * @extends Shape
 */
export class Star extends Shape {
    /**
     * @param {string}         id            - Unique shape identifier (e.g. "Star 1").
     * @param {{x: number, y: number}} [position={x:0,y:0}] - Legacy position (not used
     *        for geometry).
     * @param {number}         [centerX=0]       - X coordinate of the star centre.
     * @param {number}         [centerY=0]       - Y coordinate of the star centre.
     * @param {number}         [outerRadius=20]  - Distance from centre to each outer tip.
     * @param {number}         [innerRadius=10]  - Distance from centre to each inner valley.
     * @param {number}         [points=5]        - Number of star points.  Clamped to >= 3.
     */
    constructor(id, position = { x: 0, y: 0 }, centerX = 0, centerY = 0, outerRadius = 20, innerRadius = 10, points = 5) {
        super(id, 'star', position);
        /** @type {number} X coordinate of the star centre. Bindable. */
        this.centerX = centerX;
        /** @type {number} Y coordinate of the star centre. Bindable. */
        this.centerY = centerY;
        /** @type {number} Outer radius (tip distance from centre). Bindable. */
        this.outerRadius = outerRadius;
        /** @type {number} Inner radius (valley distance from centre). Bindable. */
        this.innerRadius = innerRadius;
        /**
         * @type {number} Number of points (tips) on the star. Bindable.
         * Clamped to >= 3.  A star with fewer than 3 points is degenerate.
         */
        this.points = Math.max(3, Math.floor(points)); // Minimum 3 points
    }

    /**
     * Declares which Star properties can be driven by parameter bindings.
     * @returns {string[]} Always {@code ['centerX', 'centerY', 'outerRadius', 'innerRadius', 'points']}.
     */
    getBindableProperties() {
        return ['centerX', 'centerY', 'outerRadius', 'innerRadius', 'points'];
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
     * Test whether (x, y) is inside the star using a fill-based hit test.
     *
     * @param {number} x - X coordinate to test.
     * @param {number} y - Y coordinate to test.
     * @returns {boolean} True if the point is inside or on the star boundary.
     */
    containsPoint(x, y) {
        const path = this.toGeometryPath();
        path.assignFill(HIT_TEST_FILL);
        return styleContainsPoint(path, new GeoVec(x, y));
    }

    /**
     * Render the star outline onto the canvas.
     * @param {CanvasRenderingContext2D} ctx - The Otto canvas 2D context.
     */
    render(ctx) {
        const path = this.toGeometryPath();
        ctx.beginPath();
        path.toCanvasPath(ctx);
        ctx.stroke();
    }

    /**
     * Build the geometry-library Path by generating 2*P vertices that alternate
     * between outerRadius (tips) and innerRadius (valleys).
     *
     * Vertex placement algorithm:
     *   - Total vertices = numPoints * 2.
     *   - The full 2*PI angular range is divided into numPoints equal sectors.
     *     Each sector contains two vertices, so the angular step between consecutive
     *     vertices is (2*PI / numPoints) / 2.
     *   - Vertex 0 (even index) is at outerRadius; vertex 1 (odd index) is at innerRadius.
     *   - The loop index i drives both the angle (startAngle + i * halfStep) and the
     *     radius selection (even = outer, odd = inner).
     *   - startAngle is -PI/2 so the first tip points straight up.
     *
     * The resulting path is closed.
     *
     * @returns {import('../../geometry/Path.js').Path} A closed 2*P-vertex GeoPath.
     */
    toGeometryPath() {
        const points = [];
        const numPoints = Math.max(3, Math.floor(this.points));
        const angleStep = (2 * Math.PI) / numPoints;

        // Start at top (90 degrees offset)
        const startAngle = -Math.PI / 2;

        for (let i = 0; i < numPoints * 2; i++) {
            const angle = startAngle + (i * angleStep) / 2;
            const radius = i % 2 === 0 ? this.outerRadius : this.innerRadius;
            const x = this.centerX + radius * Math.cos(angle);
            const y = this.centerY + radius * Math.sin(angle);
            points.push(new GeoVec(x, y));
        }

        return GeoPath.fromPoints(points, true); // Closed star
    }

    /**
     * Deep-copy this Star, including all active bindings.
     * @returns {Star} A new Star value-equal to this one.
     */
    clone() {
        const star = new Star(
            this.id,
            { ...this.position },
            this.centerX,
            this.centerY,
            this.outerRadius,
            this.innerRadius,
            this.points
        );
        // Copy bindings
        this.getBindableProperties().forEach(property => {
            if (this.bindings[property]) {
                star.setBinding(property, this.bindings[property]);
            }
        });
        return star;
    }

    /**
     * Reconstruct a Star from serialized JSON.  Bindings are restored afterward
     * by {@link ShapeRegistry.fromJSON}.
     *
     * @param {Object} json              - Serialized shape object.
     * @param {string} json.id           - Shape identifier.
     * @param {Object} [json.position]   - Legacy position.
     * @param {number} [json.centerX]    - Serialized centre X.
     * @param {number} [json.centerY]    - Serialized centre Y.
     * @param {number} [json.outerRadius]- Serialized outer radius.
     * @param {number} [json.innerRadius]- Serialized inner radius.
     * @param {number} [json.points]     - Serialized point count.
     * @returns {Star} A new Star with geometry restored.
     */
    static fromJSON(json) {
        const star = new Star(
            json.id,
            json.position || { x: 0, y: 0 },
            json.centerX || 0,
            json.centerY || 0,
            json.outerRadius || 50,
            json.innerRadius || 25,
            json.points || 5
        );

        // Restore bindings
        if (json.bindings) {
            Object.keys(json.bindings).forEach(property => {
                // Binding will be restored by ShapeRegistry
            });
        }

        return star;
    }
}
