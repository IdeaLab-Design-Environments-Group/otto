import { Shape } from './Shape.js';
import {
    Color as GeoColor,
    Fill as GeoFill,
    Path as GeoPath,
    Vec as GeoVec,
    styleContainsPoint
} from '../../geometry/index.js';

const HIT_TEST_FILL = new GeoFill(new GeoColor(0, 0, 0, 1));

/**
 * Arrow shape implementation
 * Bindable properties: x, y, length, headWidth, headLength
 */
export class Arrow extends Shape {
    constructor(id, position = { x: 0, y: 0 }, x = 0, y = 0, length = 50, headWidth = 15, headLength = 12.5) {
        super(id, 'arrow', position);
        this.x = x;
        this.y = y;
        this.length = length;
        this.headWidth = headWidth;
        this.headLength = headLength;
    }
    
    getBindableProperties() {
        return ['x', 'y', 'length', 'headWidth', 'headLength'];
    }
    
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
    
    containsPoint(px, py) {
        const path = this.toGeometryPath();
        path.assignFill(HIT_TEST_FILL);
        return styleContainsPoint(path, new GeoVec(px, py));
    }
    
    render(ctx) {
        const path = this.toGeometryPath();
        ctx.beginPath();
        path.toCanvasPath(ctx);
        ctx.stroke();
    }

    toGeometryPath() {
        return GeoPath.fromPoints(this.getPoints().map(p => new GeoVec(p.x, p.y)), true);
    }

    getPoints() {
        const sx = this.x;
        const sy = this.y;

        const headWidth = Math.max(2, this.headWidth);
        const headLength = Math.max(2, Math.min(this.headLength, this.length));
        const shaftWidth = Math.max(2, Math.min(headWidth * 0.3, headWidth - 2));
        const shaftEndX = sx + this.length - headLength;

        return [
            // Tail cap (thin rectangle end)
            { x: sx, y: sy - shaftWidth / 2 },
            { x: shaftEndX, y: sy - shaftWidth / 2 },
            // Head (triangle)
            { x: shaftEndX, y: sy - headWidth / 2 },
            { x: sx + this.length, y: sy },
            { x: shaftEndX, y: sy + headWidth / 2 },
            // Back to shaft
            { x: shaftEndX, y: sy + shaftWidth / 2 },
            { x: sx, y: sy + shaftWidth / 2 }
        ];
    }
    
    clone() {
        const a = new Arrow(this.id, { ...this.position }, this.x, this.y, this.length, this.headWidth, this.headLength);
        this.getBindableProperties().forEach(property => {
            if (this.bindings[property]) {
                a.setBinding(property, this.bindings[property]);
            }
        });
        return a;
    }
    
    static fromJSON(json) {
        return new Arrow(
            json.id,
            json.position || { x: 0, y: 0 },
            json.x || 0,
            json.y || 0,
            json.length || 100,
            json.headWidth || 30,
            json.headLength || 25
        );
    }
}
