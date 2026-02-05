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
 * ChamferRectangle shape implementation
 * Bindable properties: x, y, width, height, chamfer
 */
export class ChamferRectangle extends Shape {
    constructor(id, position = { x: 0, y: 0 }, x = 0, y = 0, width = 50, height = 50, chamfer = 5) {
        super(id, 'chamferRectangle', position);
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.chamfer = Math.min(chamfer, width / 2, height / 2);
    }
    
    getBindableProperties() {
        return ['x', 'y', 'width', 'height', 'chamfer'];
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
        const w = this.width / 2;
        const h = this.height / 2;
        const c = this.chamfer;
        const cx = this.x + w;
        const cy = this.y + h;

        return [
            { x: cx - w + c, y: cy - h },
            { x: cx + w - c, y: cy - h },
            { x: cx + w, y: cy - h + c },
            { x: cx + w, y: cy + h - c },
            { x: cx + w - c, y: cy + h },
            { x: cx - w + c, y: cy + h },
            { x: cx - w, y: cy + h - c },
            { x: cx - w, y: cy - h + c }
        ];
    }
    
    clone() {
        const cr = new ChamferRectangle(this.id, { ...this.position }, this.x, this.y, this.width, this.height, this.chamfer);
        this.getBindableProperties().forEach(property => {
            if (this.bindings[property]) {
                cr.setBinding(property, this.bindings[property]);
            }
        });
        return cr;
    }
    
    static fromJSON(json) {
        return new ChamferRectangle(
            json.id,
            json.position || { x: 0, y: 0 },
            json.x || 0,
            json.y || 0,
            json.width || 100,
            json.height || 100,
            json.chamfer || 10
        );
    }
}
