/**
 * @fileoverview Circle -- the simplest closed shape in the Otto parametric design system.
 *
 * A circle is fully defined by three values: its centre coordinates (centerX, centerY)
 * and its radius.  All three are bindable, meaning any of them can be wired to a
 * user-created parameter slider so the circle updates in real time as the slider moves.
 *
 * Unlike Ellipse (which approximates with 64 sampled points), Circle uses the geometry
 * library's native circle primitive ({@link GeoPath.circle}), which gives it exact
 * bounding-box computation and crisp rendering at any zoom level.
 *
 * @module models/shapes/Circle
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
 * Opaque black fill used exclusively for hit-testing.
 *
 * WHY it exists: {@link styleContainsPoint} determines whether a point is inside a path
 * by rasterising the path with a known style and sampling the resulting pixel.  The fill
 * must be fully opaque so that any pixel covered by the shape reads as "hit".  This
 * constant is allocated once at module load and reused for every containsPoint call on
 * every Circle instance -- it is never mutated and carries zero per-frame allocation cost.
 *
 * @type {import('../../geometry/index.js').Fill}
 * @constant
 * @private
 */
const HIT_TEST_FILL = new GeoFill(new GeoColor(0, 0, 0, 1));

/**
 * Circle shape.  Defined by a centre point and a radius.
 *
 * Bindable properties: {@code centerX}, {@code centerY}, {@code radius}.
 *
 * @extends Shape
 */
export class Circle extends Shape {
    /**
     * @param {string}         id       - Unique shape identifier (e.g. "Circle 1").
     * @param {{x: number, y: number}} [position={x:0,y:0}] - Legacy position (not used
     *        for geometry; see {@link Shape} constructor docs).
     * @param {number}         [centerX=0]  - X coordinate of the circle centre in canvas space.
     * @param {number}         [centerY=0]  - Y coordinate of the circle centre in canvas space.
     * @param {number}         [radius=20]  - Radius in canvas-space units.
     */
    constructor(id, position = { x: 0, y: 0 }, centerX = 0, centerY = 0, radius = 20) {
        super(id, 'circle', position);
        /** @type {number} X coordinate of the circle centre. Bindable. */
        this.centerX = centerX;
        /** @type {number} Y coordinate of the circle centre. Bindable. */
        this.centerY = centerY;
        /** @type {number} Radius of the circle. Bindable. */
        this.radius = radius;
    }

    /**
     * Declares which Circle properties can be driven by parameter bindings.
     * @returns {string[]} Always {@code ['centerX', 'centerY', 'radius']}.
     */
    getBindableProperties() {
        return ['centerX', 'centerY', 'radius'];
    }

    /**
     * Compute the axis-aligned bounding box by delegating to the geometry path.
     * Prefers the tight (analytic) bounding box; falls back to the loose (sampled)
     * box if tight is unavailable.  Returns a zero-size box at the origin only if
     * the path is degenerate (radius 0, for example).
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
     * Test whether the canvas-space point (x, y) falls inside this circle.
     *
     * Assigns {@link HIT_TEST_FILL} to the geometry path so that
     * {@link styleContainsPoint} has an opaque style to rasterise, then delegates
     * the actual point-in-shape test to the geometry library.
     *
     * @param {number} x - X coordinate to test.
     * @param {number} y - Y coordinate to test.
     * @returns {boolean} True if the point is inside or on the circle boundary.
     */
    containsPoint(x, y) {
        const path = this.toGeometryPath();
        path.assignFill(HIT_TEST_FILL);
        return styleContainsPoint(path, new GeoVec(x, y));
    }

    /**
     * Render the circle onto the given canvas context.
     *
     * Builds the native geometry-library circle path, emits it onto the context via
     * {@link GeoPath#toCanvasPath}, and strokes it.  Fill and stroke-style setup is
     * handled by the CanvasRenderer layer above this call.
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
     * Build the geometry-library Path representation of this circle.
     *
     * Uses {@link GeoPath.circle} -- a native circle primitive, NOT a polygon
     * approximation.  This gives exact bounding boxes and smooth rendering.  The same
     * path object is used by getBounds(), containsPoint(), and render(), so this method
     * is the single source of truth for the circle's geometry.
     *
     * @returns {import('../../geometry/Path.js').Path} A GeoPath representing the circle.
     */
    toGeometryPath() {
        return GeoPath.circle(new GeoVec(this.centerX, this.centerY), this.radius);
    }

    /**
     * Deep-copy this Circle.  The returned instance has identical geometry properties
     * and a copy of every active binding, making it safe to use as the base for
     * {@link Shape#resolve}.
     *
     * @returns {Circle} A new Circle value-equal to this one.
     */
    clone() {
        const circle = new Circle(this.id, { ...this.position }, this.centerX, this.centerY, this.radius);
        // Copy bindings
        this.getBindableProperties().forEach(property => {
            if (this.bindings[property]) {
                circle.setBinding(property, this.bindings[property]);
            }
        });
        return circle;
    }

    /**
     * Reconstruct a Circle from its serialized JSON representation.
     *
     * This is a shape-data-only factory: it sets id, position, and geometry properties
     * but does NOT restore bindings.  Bindings are restored afterward by
     * {@link ShapeRegistry.fromJSON}, which calls {@link createBindingFromJSON} for each
     * entry in the {@code json.bindings} map.  The empty iteration over json.bindings
     * below is intentional -- it documents the handoff point and keeps the structure
     * consistent with other shape fromJSON methods.
     *
     * @param {Object} json          - The serialized shape object (as produced by toJSON()).
     * @param {string} json.id       - Shape identifier.
     * @param {Object} [json.position] - Legacy position object.
     * @param {number} [json.centerX]  - Serialized centre X.
     * @param {number} [json.centerY]  - Serialized centre Y.
     * @param {number} [json.radius]   - Serialized radius.
     * @returns {Circle} A new Circle instance with geometry restored.
     */
    static fromJSON(json) {
        const circle = new Circle(
            json.id,
            json.position || { x: 0, y: 0 },
            json.centerX || 0,
            json.centerY || 0,
            json.radius || 50
        );

        // Restore bindings
        if (json.bindings) {
            Object.keys(json.bindings).forEach(property => {
                // Binding will be restored by ShapeRegistry
            });
        }

        return circle;
    }
}
