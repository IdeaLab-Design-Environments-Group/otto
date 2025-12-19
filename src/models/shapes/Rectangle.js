import { Shape } from './Shape.js';

/**
 * Rectangle shape implementation
 * Bindable properties: x, y, width, height
 */
export class Rectangle extends Shape {
    constructor(id, position = { x: 0, y: 0 }, x = 0, y = 0, width = 100, height = 100) {
        super(id, 'rectangle', position);
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }
    
    getBindableProperties() {
        return ['x', 'y', 'width', 'height'];
    }
    
    getBounds() {
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };
    }
    
    containsPoint(x, y) {
        return x >= this.x && 
               x <= this.x + this.width &&
               y >= this.y && 
               y <= this.y + this.height;
    }
    
    render(ctx) {
        ctx.beginPath();
        ctx.rect(this.x, this.y, this.width, this.height);
        ctx.stroke();
    }
    
    clone() {
        const rect = new Rectangle(this.id, { ...this.position }, this.x, this.y, this.width, this.height);
        // Copy bindings
        this.getBindableProperties().forEach(property => {
            if (this.bindings[property]) {
                rect.setBinding(property, this.bindings[property]);
            }
        });
        return rect;
    }
    
    static fromJSON(json) {
        const rect = new Rectangle(
            json.id,
            json.position || { x: 0, y: 0 },
            json.x || 0,
            json.y || 0,
            json.width || 100,
            json.height || 100
        );
        
        // Restore bindings
        if (json.bindings) {
            Object.keys(json.bindings).forEach(property => {
                // Binding will be restored by ShapeRegistry
            });
        }
        
        return rect;
    }
}
