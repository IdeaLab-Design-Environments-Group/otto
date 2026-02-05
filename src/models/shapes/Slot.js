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
 * Slot (stadium/obround) shape implementation
 * Bindable properties: centerX, centerY, length, width
 */
export class Slot extends Shape {
    constructor(id, position = { x: 0, y: 0 }, centerX = 0, centerY = 0, length = 50, width = 15) {
        super(id, 'slot', position);
        this.centerX = centerX;
        this.centerY = centerY;
        this.length = length;
        this.slotWidth = width;
    }
    
    getBindableProperties() {
        return ['centerX', 'centerY', 'length', 'slotWidth'];
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
    
    containsPoint(x, y) {
        const path = this.toGeometryPath();
        path.assignFill(HIT_TEST_FILL);
        return styleContainsPoint(path, new GeoVec(x, y));
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

    getPoints(segments = 32) {
        const points = [];
        const radius = this.slotWidth / 2;
        const centerDist = (this.length - this.slotWidth) / 2;

        // Right semicircle
        for (let i = 0; i <= segments / 2; i++) {
            const angle = -Math.PI / 2 + (i / (segments / 2)) * Math.PI;
            points.push({
                x: this.centerX + centerDist + Math.cos(angle) * radius,
                y: this.centerY + Math.sin(angle) * radius
            });
        }

        // Left semicircle
        for (let i = 0; i <= segments / 2; i++) {
            const angle = Math.PI / 2 + (i / (segments / 2)) * Math.PI;
            points.push({
                x: this.centerX - centerDist + Math.cos(angle) * radius,
                y: this.centerY + Math.sin(angle) * radius
            });
        }

        return points;
    }
    
    clone() {
        const s = new Slot(this.id, { ...this.position }, this.centerX, this.centerY, this.length, this.slotWidth);
        this.getBindableProperties().forEach(property => {
            if (this.bindings[property]) {
                s.setBinding(property, this.bindings[property]);
            }
        });
        return s;
    }
    
    static fromJSON(json) {
        return new Slot(
            json.id,
            json.position || { x: 0, y: 0 },
            json.centerX || 0,
            json.centerY || 0,
            json.length || 100,
            json.slotWidth || 30
        );
    }
}
