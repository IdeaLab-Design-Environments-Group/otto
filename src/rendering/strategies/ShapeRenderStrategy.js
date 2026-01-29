/**
 * ShapeRenderStrategy - Strategy Pattern Implementation
 *
 * Encapsulates shape rendering algorithm.
 * Supports different rendering modes (normal, wireframe, preview).
 */
export class ShapeRenderStrategy {
    /**
     * @param {Object} options - Rendering configuration
     * @param {string} options.strokeStyle - Default stroke color (default: '#000000')
     * @param {number} options.lineWidth - Default line width (default: 1)
     * @param {boolean} options.antialias - Enable antialiasing (default: true)
     */
    constructor(options = {}) {
        this.strokeStyle = options.strokeStyle || '#000000';
        this.lineWidth = options.lineWidth || 1;
        this.antialias = options.antialias !== false;
    }

    /**
     * Render all shapes
     * @param {RenderingContext} context - Rendering context abstraction
     * @param {Array<Shape>} shapes - Array of shapes to render
     * @param {Object} options - Render options
     * @param {boolean} options.isDragging - Whether currently dragging
     * @param {string} options.dragShapeId - ID of shape being dragged
     */
    render(context, shapes, options = {}) {
        context.save();

        // Set default styles
        context.setStrokeStyle(this.strokeStyle);
        context.setLineWidth(this.lineWidth);

        // Render each shape
        for (const shape of shapes) {
            this.renderShape(context, shape, options);
        }

        context.restore();
    }

    /**
     * Render a single shape
     * @param {RenderingContext} context - Rendering context
     * @param {Shape} shape - Shape to render
     * @param {Object} options - Render options
     */
    renderShape(context, shape, options = {}) {
        context.save();

        // Check if shape has decorators (Decorator Pattern support)
        if (shape.render && typeof shape.render === 'function') {
            // Use shape's own render method (supports decorators)
            shape.render(context.getContext());
        } else {
            // Fallback: render based on type
            this.renderShapeByType(context, shape);
        }

        context.restore();
    }

    /**
     * Render shape by type (fallback for shapes without render method)
     * @param {RenderingContext} context
     * @param {Shape} shape
     */
    renderShapeByType(context, shape) {
        const type = shape.type;

        context.beginPath();

        if (type === 'circle') {
            context.arc(shape.centerX, shape.centerY, shape.radius, 0, Math.PI * 2);
        } else if (type === 'rectangle') {
            context.rect(shape.x, shape.y, shape.width, shape.height);
        }

        context.stroke();
    }

    /**
     * Update render configuration
     * @param {Object} options
     */
    setOptions(options) {
        Object.assign(this, options);
    }
}

/**
 * WireframeRenderStrategy - Renders shapes as wireframes only
 */
export class WireframeRenderStrategy extends ShapeRenderStrategy {
    constructor(options = {}) {
        super({
            strokeStyle: options.strokeStyle || '#666666',
            lineWidth: options.lineWidth || 1,
            ...options
        });
    }

    renderShape(context, shape, options = {}) {
        context.save();
        context.setStrokeStyle(this.strokeStyle);
        context.setLineWidth(this.lineWidth);

        this.renderShapeByType(context, shape);

        context.restore();
    }
}

/**
 * PreviewRenderStrategy - Renders shapes with preview styling (semi-transparent)
 */
export class PreviewRenderStrategy extends ShapeRenderStrategy {
    /**
     * @param {Object} options
     * @param {number} options.opacity - Preview opacity (default: 0.5)
     * @param {string} options.previewColor - Preview stroke color (default: '#007acc')
     */
    constructor(options = {}) {
        super(options);
        this.opacity = options.opacity || 0.5;
        this.previewColor = options.previewColor || '#007acc';
    }

    renderShape(context, shape, options = {}) {
        context.save();

        context.setGlobalAlpha(this.opacity);
        context.setStrokeStyle(this.previewColor);
        context.setLineWidth(2);
        context.setLineDash([5, 5]);

        this.renderShapeByType(context, shape);

        context.setLineDash([]);
        context.setGlobalAlpha(1);

        context.restore();
    }

    /**
     * Render a shape type preview at a position
     * @param {RenderingContext} context
     * @param {string} shapeType - Type of shape ('circle', 'rectangle')
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {Object} dimensions - Optional dimensions
     */
    renderTypePreview(context, shapeType, x, y, dimensions = {}) {
        context.save();

        context.setGlobalAlpha(this.opacity);
        context.setStrokeStyle(this.previewColor);
        context.setLineWidth(2);
        context.setLineDash([5, 5]);

        context.beginPath();

        if (shapeType === 'circle') {
            const radius = dimensions.radius || 50;
            context.arc(x, y, radius, 0, Math.PI * 2);
        } else if (shapeType === 'rectangle') {
            const width = dimensions.width || 100;
            const height = dimensions.height || 100;
            context.rect(x - width / 2, y - height / 2, width, height);
        }

        context.stroke();

        context.setLineDash([]);
        context.setGlobalAlpha(1);

        context.restore();
    }
}

/**
 * HighlightRenderStrategy - Renders shapes with highlight effect
 */
export class HighlightRenderStrategy extends ShapeRenderStrategy {
    /**
     * @param {Object} options
     * @param {string} options.highlightColor - Highlight color (default: '#ff6600')
     * @param {number} options.glowRadius - Glow effect radius (default: 5)
     */
    constructor(options = {}) {
        super(options);
        this.highlightColor = options.highlightColor || '#ff6600';
        this.glowRadius = options.glowRadius || 5;
    }

    renderShape(context, shape, options = {}) {
        context.save();

        // Add glow effect using shadow
        context.setShadow(this.glowRadius, this.highlightColor, 0, 0);
        context.setStrokeStyle(this.highlightColor);
        context.setLineWidth(2);

        this.renderShapeByType(context, shape);

        context.clearShadow();

        context.restore();
    }
}
