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
 * Wave shape implementation
 * Bindable properties: centerX, centerY, width, amplitude, frequency
 */
export class Wave extends Shape {
    constructor(id, position = { x: 0, y: 0 }, centerX = 0, centerY = 0, width = 50, amplitude = 10, frequency = 2) {
        super(id, 'wave', position);
        this.centerX = centerX;
        this.centerY = centerY;
        this.width = width;
        this.amplitude = amplitude;
        this.frequency = frequency;
    }
    
    getBindableProperties() {
        return ['centerX', 'centerY', 'width', 'amplitude', 'frequency'];
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

    getPoints(segments = 50) {
        const points = [];
        const startX = this.centerX - this.width / 2;
        
        for (let i = 0; i <= segments; i++) {
            const x = startX + (i / segments) * this.width;
            const relX = x - this.centerX + this.width / 2;
            const y = this.centerY + Math.sin((relX * this.frequency * Math.PI * 2) / this.width) * this.amplitude;
            points.push({ x, y });
        }

        return points;
    }
    
    clone() {
        const w = new Wave(this.id, { ...this.position }, this.centerX, this.centerY, this.width, this.amplitude, this.frequency);
        this.getBindableProperties().forEach(property => {
            if (this.bindings[property]) {
                w.setBinding(property, this.bindings[property]);
            }
        });
        return w;
    }
    
    static fromJSON(json) {
        return new Wave(
            json.id,
            json.position || { x: 0, y: 0 },
            json.centerX || 0,
            json.centerY || 0,
            json.width || 100,
            json.amplitude || 20,
            json.frequency || 2
        );
    }
}
