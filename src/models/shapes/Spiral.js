import { Shape } from './Shape.js';
import {
    Color as GeoColor,
    Fill as GeoFill,
    Path as GeoPath,
    Stroke as GeoStroke,
    Vec as GeoVec,
    styleContainsPoint
} from '../../geometry/index.js';

const HIT_TEST_STROKE = new GeoStroke(new GeoColor(0, 0, 0, 1), false, 6, 'centered', 'round', 'round', 4);

/**
 * Spiral shape implementation
 * Bindable properties: centerX, centerY, startRadius, endRadius, turns
 */
export class Spiral extends Shape {
    constructor(id, position = { x: 0, y: 0 }, centerX = 0, centerY = 0, startRadius = 5, endRadius = 25, turns = 3) {
        super(id, 'spiral', position);
        this.centerX = centerX;
        this.centerY = centerY;
        this.startRadius = startRadius;
        this.endRadius = endRadius;
        this.turns = turns;
    }
    
    getBindableProperties() {
        return ['centerX', 'centerY', 'startRadius', 'endRadius', 'turns'];
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
        const stroke = HIT_TEST_STROKE.clone();
        stroke.width = 6;
        path.assignStroke(stroke);
        return styleContainsPoint(path, new GeoVec(x, y));
    }
    
    render(ctx) {
        const path = this.toGeometryPath();
        ctx.beginPath();
        path.toCanvasPath(ctx);
        ctx.stroke();
    }

    toGeometryPath() {
        return GeoPath.fromPoints(this.getPoints().map(p => new GeoVec(p.x, p.y)), false);
    }

    getPoints(segments = 100) {
        const points = [];
        const totalAngle = this.turns * Math.PI * 2;
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = t * totalAngle;
            const radius = this.startRadius + (this.endRadius - this.startRadius) * t;
            points.push({
                x: this.centerX + Math.cos(angle) * radius,
                y: this.centerY + Math.sin(angle) * radius
            });
        }

        return points;
    }
    
    clone() {
        const s = new Spiral(this.id, { ...this.position }, this.centerX, this.centerY, this.startRadius, this.endRadius, this.turns);
        this.getBindableProperties().forEach(property => {
            if (this.bindings[property]) {
                s.setBinding(property, this.bindings[property]);
            }
        });
        return s;
    }
    
    static fromJSON(json) {
        return new Spiral(
            json.id,
            json.position || { x: 0, y: 0 },
            json.centerX || 0,
            json.centerY || 0,
            json.startRadius || 10,
            json.endRadius || 50,
            json.turns || 3
        );
    }
}
