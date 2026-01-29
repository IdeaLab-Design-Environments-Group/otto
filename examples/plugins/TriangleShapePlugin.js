/**
 * TriangleShapePlugin - Example Plugin
 *
 * Demonstrates how to add a new shape type to Otto-v2.
 *
 * Features:
 * - Adds 'triangle' shape type
 * - Full support for bindings
 * - Proper serialization/deserialization
 */
import { Plugin } from '../../src/plugins/Plugin.js';
import { Shape } from '../../src/models/shapes/Shape.js';

/**
 * Triangle shape implementation
 * An equilateral triangle defined by center position and size
 */
export class Triangle extends Shape {
    /**
     * @param {string} id
     * @param {Object} position
     * @param {number} centerX - Center X coordinate
     * @param {number} centerY - Center Y coordinate
     * @param {number} size - Size (height of the triangle)
     * @param {number} rotation - Rotation angle in degrees
     */
    constructor(id, position = { x: 0, y: 0 }, centerX = 0, centerY = 0, size = 50, rotation = 0) {
        super(id, 'triangle', position);
        this.centerX = centerX;
        this.centerY = centerY;
        this.size = size;
        this.rotation = rotation;
    }

    getBindableProperties() {
        return ['centerX', 'centerY', 'size', 'rotation'];
    }

    getBounds() {
        // Calculate bounding box for equilateral triangle
        const height = this.size;
        const width = (2 * this.size) / Math.sqrt(3);

        return {
            x: this.centerX - width / 2,
            y: this.centerY - height / 2,
            width: width,
            height: height
        };
    }

    /**
     * Get triangle vertices
     * @returns {Array<{x: number, y: number}>}
     */
    getVertices() {
        const height = this.size;
        const halfWidth = this.size / Math.sqrt(3);

        // Base vertices (pointing up)
        const vertices = [
            { x: 0, y: -height / 2 }, // Top
            { x: -halfWidth, y: height / 2 }, // Bottom left
            { x: halfWidth, y: height / 2 } // Bottom right
        ];

        // Apply rotation
        const radians = (this.rotation * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);

        return vertices.map(v => ({
            x: this.centerX + (v.x * cos - v.y * sin),
            y: this.centerY + (v.x * sin + v.y * cos)
        }));
    }

    containsPoint(x, y) {
        const vertices = this.getVertices();

        // Use barycentric technique for point-in-triangle test
        const [v0, v1, v2] = vertices;

        const sign = (p1, p2, p3) => {
            return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
        };

        const point = { x, y };
        const d1 = sign(point, v0, v1);
        const d2 = sign(point, v1, v2);
        const d3 = sign(point, v2, v0);

        const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
        const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);

        return !(hasNeg && hasPos);
    }

    render(ctx) {
        const vertices = this.getVertices();

        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        ctx.lineTo(vertices[1].x, vertices[1].y);
        ctx.lineTo(vertices[2].x, vertices[2].y);
        ctx.closePath();
        ctx.stroke();
    }

    clone() {
        const triangle = new Triangle(
            this.id,
            { ...this.position },
            this.centerX,
            this.centerY,
            this.size,
            this.rotation
        );

        // Copy bindings
        this.getBindableProperties().forEach(property => {
            if (this.bindings[property]) {
                triangle.setBinding(property, this.bindings[property]);
            }
        });

        return triangle;
    }

    toJSON() {
        const json = super.toJSON();
        json.centerX = this.centerX;
        json.centerY = this.centerY;
        json.size = this.size;
        json.rotation = this.rotation;
        return json;
    }

    static fromJSON(json) {
        return new Triangle(
            json.id,
            json.position || { x: 0, y: 0 },
            json.centerX || 0,
            json.centerY || 0,
            json.size || 50,
            json.rotation || 0
        );
    }
}

/**
 * Triangle Shape Plugin
 */
export class TriangleShapePlugin extends Plugin {
    constructor() {
        super({
            id: 'triangle-shape',
            name: 'Triangle Shape',
            version: '1.0.0',
            description: 'Adds triangle shape support to Otto-v2',
            author: 'Otto-v2 Team'
        });
    }

    async onActivate(api) {
        // Register the triangle shape type
        this.registerShape(
            'triangle',
            (id, position, options) => new Triangle(
                id,
                position,
                options.centerX || position.x || 0,
                options.centerY || position.y || 0,
                options.size || 50,
                options.rotation || 0
            ),
            Triangle.fromJSON
        );

        console.log('Triangle shape registered successfully');

        // Subscribe to shape events for logging
        this.subscribe('SHAPE_ADDED', (shape) => {
            if (shape.type === 'triangle') {
                console.log('New triangle created:', shape.id);
            }
        });
    }

    async onDeactivate() {
        console.log('Triangle shape plugin deactivated');
        // Cleanup is automatic via Plugin base class
    }
}

// Default export for easy loading
export default TriangleShapePlugin;
