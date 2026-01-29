/**
 * GridRenderStrategy - Strategy Pattern Implementation
 *
 * Encapsulates grid rendering algorithm for Canvas.
 * Can be swapped for different grid styles (dots, lines, etc.)
 */
export class GridRenderStrategy {
    /**
     * @param {Object} options - Grid configuration
     * @param {number} options.gridSize - Size of grid cells (default: 20)
     * @param {string} options.lineColor - Grid line color (default: '#e0e0e0')
     * @param {number} options.lineWidth - Grid line width (default: 0.5)
     * @param {boolean} options.showMajorLines - Show thicker major grid lines (default: false)
     * @param {number} options.majorLineInterval - Interval for major lines (default: 5)
     * @param {string} options.majorLineColor - Major line color (default: '#c0c0c0')
     */
    constructor(options = {}) {
        this.gridSize = options.gridSize || 20;
        this.lineColor = options.lineColor || '#e0e0e0';
        this.lineWidth = options.lineWidth || 0.5;
        this.showMajorLines = options.showMajorLines || false;
        this.majorLineInterval = options.majorLineInterval || 5;
        this.majorLineColor = options.majorLineColor || '#c0c0c0';
    }

    /**
     * Render the grid
     * @param {RenderingContext} context - Rendering context abstraction
     * @param {Object} viewport - Viewport state {x, y, zoom}
     * @param {number} canvasWidth - Canvas width in pixels
     * @param {number} canvasHeight - Canvas height in pixels
     */
    render(context, viewport, canvasWidth, canvasHeight) {
        const scaledGridSize = this.gridSize * viewport.zoom;
        const offsetX = viewport.x % scaledGridSize;
        const offsetY = viewport.y % scaledGridSize;

        context.save();

        // Reset transform for grid (draw in screen space)
        context.resetTransform();

        // Draw minor grid lines
        context.setStrokeStyle(this.lineColor);
        context.setLineWidth(this.lineWidth);

        // Calculate starting grid line index for major line detection
        const startIndexX = Math.floor(-viewport.x / scaledGridSize);
        const startIndexY = Math.floor(-viewport.y / scaledGridSize);

        // Vertical lines
        let gridIndex = startIndexX;
        for (let x = offsetX; x < canvasWidth; x += scaledGridSize) {
            if (!this.showMajorLines || gridIndex % this.majorLineInterval !== 0) {
                context.beginPath();
                context.moveTo(x, 0);
                context.lineTo(x, canvasHeight);
                context.stroke();
            }
            gridIndex++;
        }

        // Horizontal lines
        gridIndex = startIndexY;
        for (let y = offsetY; y < canvasHeight; y += scaledGridSize) {
            if (!this.showMajorLines || gridIndex % this.majorLineInterval !== 0) {
                context.beginPath();
                context.moveTo(0, y);
                context.lineTo(canvasWidth, y);
                context.stroke();
            }
            gridIndex++;
        }

        // Draw major grid lines (if enabled)
        if (this.showMajorLines) {
            context.setStrokeStyle(this.majorLineColor);
            context.setLineWidth(this.lineWidth * 2);

            // Vertical major lines
            gridIndex = startIndexX;
            for (let x = offsetX; x < canvasWidth; x += scaledGridSize) {
                if (gridIndex % this.majorLineInterval === 0) {
                    context.beginPath();
                    context.moveTo(x, 0);
                    context.lineTo(x, canvasHeight);
                    context.stroke();
                }
                gridIndex++;
            }

            // Horizontal major lines
            gridIndex = startIndexY;
            for (let y = offsetY; y < canvasHeight; y += scaledGridSize) {
                if (gridIndex % this.majorLineInterval === 0) {
                    context.beginPath();
                    context.moveTo(0, y);
                    context.lineTo(canvasWidth, y);
                    context.stroke();
                }
                gridIndex++;
            }
        }

        context.restore();
    }

    /**
     * Update grid configuration
     * @param {Object} options - New options to merge
     */
    setOptions(options) {
        Object.assign(this, options);
    }
}

/**
 * DotGridRenderStrategy - Alternative grid style using dots
 */
export class DotGridRenderStrategy extends GridRenderStrategy {
    /**
     * @param {Object} options - Grid configuration
     * @param {number} options.dotRadius - Radius of grid dots (default: 1)
     * @param {string} options.dotColor - Dot color (default: '#c0c0c0')
     */
    constructor(options = {}) {
        super(options);
        this.dotRadius = options.dotRadius || 1;
        this.dotColor = options.dotColor || '#c0c0c0';
    }

    render(context, viewport, canvasWidth, canvasHeight) {
        const scaledGridSize = this.gridSize * viewport.zoom;
        const offsetX = viewport.x % scaledGridSize;
        const offsetY = viewport.y % scaledGridSize;

        context.save();
        context.resetTransform();

        context.setFillStyle(this.dotColor);

        // Draw dots at grid intersections
        for (let x = offsetX; x < canvasWidth; x += scaledGridSize) {
            for (let y = offsetY; y < canvasHeight; y += scaledGridSize) {
                context.beginPath();
                context.arc(x, y, this.dotRadius, 0, Math.PI * 2);
                context.fill();
            }
        }

        context.restore();
    }
}

/**
 * NoGridStrategy - Null object pattern for disabled grid
 */
export class NoGridStrategy {
    render() {
        // No-op
    }

    setOptions() {
        // No-op
    }
}
