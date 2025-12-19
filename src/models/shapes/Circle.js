import { Shape } from './Shape.js';

/**
 * Circle shape implementation
 * Bindable properties: centerX, centerY, radius
 */
export class Circle extends Shape {
    constructor(id, position = { x: 0, y: 0 }, centerX = 0, centerY = 0, radius = 50) {
        super(id, 'circle', position);
        this.centerX = centerX;
        this.centerY = centerY;
        this.radius = radius;
    }
    
    getBindableProperties() {
        return ['centerX', 'centerY', 'radius'];
    }
    
    getBounds() {
        return {
            x: this.centerX - this.radius,
            y: this.centerY - this.radius,
            width: this.radius * 2,
            height: this.radius * 2
        };
    }
    
    containsPoint(x, y) {
        const dx = x - this.centerX;
        const dy = y - this.centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance <= this.radius;
    }
    
    render(ctx) {
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.radius, 0, Math.PI * 2);
        ctx.stroke();
    }
    
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
