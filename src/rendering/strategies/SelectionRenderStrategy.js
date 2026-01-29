/**
 * SelectionRenderStrategy - Strategy Pattern Implementation
 *
 * Encapsulates selection indicator rendering.
 * Supports single selection, multi-selection, and selection rectangle.
 */
export class SelectionRenderStrategy {
    /**
     * @param {Object} options - Selection rendering configuration
     * @param {string} options.selectionColor - Selection indicator color (default: '#0066b2')
     * @param {string} options.fillColor - Selection rectangle fill color (default: 'rgba(0, 102, 178, 0.1)')
     * @param {number} options.lineWidth - Selection line width (default: 2)
     * @param {number} options.padding - Padding around selected shapes (default: 5)
     * @param {Array<number>} options.dashPattern - Dash pattern for selection (default: [5, 5])
     * @param {boolean} options.showHandles - Show resize handles (default: false)
     * @param {number} options.handleSize - Size of resize handles (default: 8)
     */
    constructor(options = {}) {
        this.selectionColor = options.selectionColor || '#0066b2';
        this.fillColor = options.fillColor || 'rgba(0, 102, 178, 0.1)';
        this.lineWidth = options.lineWidth || 2;
        this.padding = options.padding || 5;
        this.dashPattern = options.dashPattern || [5, 5];
        this.showHandles = options.showHandles || false;
        this.handleSize = options.handleSize || 8;
    }

    /**
     * Render selection indicators for selected shapes
     * @param {RenderingContext} context - Rendering context
     * @param {Array<Shape>} selectedShapes - Array of selected shapes
     * @param {Object} options - Additional options
     * @param {boolean} options.isDragging - Whether currently dragging
     */
    render(context, selectedShapes, options = {}) {
        if (!selectedShapes || selectedShapes.length === 0) {
            return;
        }

        context.save();

        context.setStrokeStyle(this.selectionColor);
        context.setLineWidth(this.lineWidth);
        context.setLineDash(this.dashPattern);

        // Render selection indicator for each shape
        for (const shape of selectedShapes) {
            this.renderShapeSelection(context, shape, options);
        }

        context.setLineDash([]);
        context.restore();
    }

    /**
     * Render selection indicator for a single shape
     * @param {RenderingContext} context
     * @param {Shape} shape
     * @param {Object} options
     */
    renderShapeSelection(context, shape, options = {}) {
        const bounds = shape.getBounds();

        // Draw selection rectangle around shape
        const x = bounds.x - this.padding;
        const y = bounds.y - this.padding;
        const width = bounds.width + this.padding * 2;
        const height = bounds.height + this.padding * 2;

        context.beginPath();
        context.rect(x, y, width, height);
        context.stroke();

        // Draw resize handles if enabled
        if (this.showHandles && !options.isDragging) {
            this.renderHandles(context, x, y, width, height);
        }
    }

    /**
     * Render resize handles at corners and edges
     * @param {RenderingContext} context
     * @param {number} x - Selection box x
     * @param {number} y - Selection box y
     * @param {number} width - Selection box width
     * @param {number} height - Selection box height
     */
    renderHandles(context, x, y, width, height) {
        context.setLineDash([]);
        context.setFillStyle(this.selectionColor);

        const halfHandle = this.handleSize / 2;

        // Corner handles
        const corners = [
            { x: x, y: y }, // Top-left
            { x: x + width, y: y }, // Top-right
            { x: x, y: y + height }, // Bottom-left
            { x: x + width, y: y + height } // Bottom-right
        ];

        for (const corner of corners) {
            context.beginPath();
            context.rect(
                corner.x - halfHandle,
                corner.y - halfHandle,
                this.handleSize,
                this.handleSize
            );
            context.fill();
            context.stroke();
        }

        // Edge handles (middle of each edge)
        const edges = [
            { x: x + width / 2, y: y }, // Top
            { x: x + width / 2, y: y + height }, // Bottom
            { x: x, y: y + height / 2 }, // Left
            { x: x + width, y: y + height / 2 } // Right
        ];

        for (const edge of edges) {
            context.beginPath();
            context.rect(
                edge.x - halfHandle,
                edge.y - halfHandle,
                this.handleSize,
                this.handleSize
            );
            context.fill();
            context.stroke();
        }
    }

    /**
     * Render selection rectangle (for marquee selection)
     * @param {RenderingContext} context
     * @param {Object} rect - Selection rectangle {x, y, width, height}
     */
    renderSelectionRect(context, rect) {
        if (!rect) return;

        context.save();

        // Fill
        context.setFillStyle(this.fillColor);
        context.fillRect(rect.x, rect.y, rect.width, rect.height);

        // Stroke
        context.setStrokeStyle(this.selectionColor);
        context.setLineWidth(this.lineWidth);
        context.setLineDash(this.dashPattern);
        context.strokeRect(rect.x, rect.y, rect.width, rect.height);

        context.setLineDash([]);
        context.restore();
    }

    /**
     * Render bounding box for multiple selected shapes
     * @param {RenderingContext} context
     * @param {Array<Shape>} shapes
     */
    renderGroupBounds(context, shapes) {
        if (!shapes || shapes.length < 2) return;

        // Calculate combined bounding box
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const shape of shapes) {
            const bounds = shape.getBounds();
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.x + bounds.width);
            maxY = Math.max(maxY, bounds.y + bounds.height);
        }

        context.save();

        // Draw combined selection box with different styling
        context.setStrokeStyle(this.selectionColor);
        context.setLineWidth(1);
        context.setLineDash([2, 2]);

        const x = minX - this.padding * 2;
        const y = minY - this.padding * 2;
        const width = maxX - minX + this.padding * 4;
        const height = maxY - minY + this.padding * 4;

        context.beginPath();
        context.rect(x, y, width, height);
        context.stroke();

        context.setLineDash([]);
        context.restore();
    }

    /**
     * Update selection rendering configuration
     * @param {Object} options
     */
    setOptions(options) {
        Object.assign(this, options);
    }
}

/**
 * MinimalSelectionStrategy - Simple selection indicator
 */
export class MinimalSelectionStrategy extends SelectionRenderStrategy {
    constructor(options = {}) {
        super({
            padding: 3,
            lineWidth: 1,
            dashPattern: [],
            showHandles: false,
            ...options
        });
    }
}

/**
 * HighlightSelectionStrategy - Selection with glow effect
 */
export class HighlightSelectionStrategy extends SelectionRenderStrategy {
    /**
     * @param {Object} options
     * @param {number} options.glowRadius - Glow radius (default: 10)
     */
    constructor(options = {}) {
        super(options);
        this.glowRadius = options.glowRadius || 10;
    }

    renderShapeSelection(context, shape, options = {}) {
        const bounds = shape.getBounds();

        context.save();

        // Add glow effect
        context.setShadow(this.glowRadius, this.selectionColor, 0, 0);

        // Draw selection outline on the shape itself
        context.setStrokeStyle(this.selectionColor);
        context.setLineWidth(this.lineWidth + 1);
        context.setLineDash([]);

        context.beginPath();

        if (shape.type === 'circle') {
            context.arc(shape.centerX, shape.centerY, shape.radius, 0, Math.PI * 2);
        } else if (shape.type === 'rectangle') {
            context.rect(shape.x, shape.y, shape.width, shape.height);
        } else {
            // Fallback to bounding box
            context.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        }

        context.stroke();

        context.clearShadow();
        context.restore();
    }
}
