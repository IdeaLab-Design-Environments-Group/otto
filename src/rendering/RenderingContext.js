/**
 * RenderingContext - Bridge Pattern Abstraction
 *
 * Defines the rendering interface that decouples rendering logic from
 * specific implementations (Canvas 2D, SVG, WebGL, etc.)
 *
 * Benefits:
 * - Implementation independence: Swap rendering backends easily
 * - Testability: Mock rendering context for unit tests
 * - Export support: Same code can render to Canvas or generate SVG
 * - Future-proof: Add WebGL without changing shape code
 *
 * Architecture:
 * ```
 * RenderingContext (Abstraction)
 *     ├─ Canvas2DContext (Implementation)
 *     ├─ SVGContext (Implementation)
 *     └─ WebGLContext (Future)
 * ```
 */
export class RenderingContext {
    /**
     * Get the underlying native context (if any)
     * @returns {Object|null}
     */
    getContext() {
        throw new Error('getContext() must be implemented by subclass');
    }

    /**
     * Get canvas/output dimensions
     * @returns {Object} {width, height}
     */
    getDimensions() {
        throw new Error('getDimensions() must be implemented by subclass');
    }

    // --- State Management ---

    /**
     * Save current rendering state
     */
    save() {
        throw new Error('save() must be implemented by subclass');
    }

    /**
     * Restore previous rendering state
     */
    restore() {
        throw new Error('restore() must be implemented by subclass');
    }

    /**
     * Reset transform to identity matrix
     */
    resetTransform() {
        throw new Error('resetTransform() must be implemented by subclass');
    }

    // --- Transform Operations ---

    /**
     * Translate the coordinate system
     * @param {number} x
     * @param {number} y
     */
    translate(x, y) {
        throw new Error('translate() must be implemented by subclass');
    }

    /**
     * Scale the coordinate system
     * @param {number} x
     * @param {number} y
     */
    scale(x, y) {
        throw new Error('scale() must be implemented by subclass');
    }

    /**
     * Rotate the coordinate system
     * @param {number} angle - Angle in radians
     */
    rotate(angle) {
        throw new Error('rotate() must be implemented by subclass');
    }

    /**
     * Set transform matrix
     * @param {number} a - Horizontal scaling
     * @param {number} b - Vertical skewing
     * @param {number} c - Horizontal skewing
     * @param {number} d - Vertical scaling
     * @param {number} e - Horizontal translation
     * @param {number} f - Vertical translation
     */
    setTransform(a, b, c, d, e, f) {
        throw new Error('setTransform() must be implemented by subclass');
    }

    // --- Style Operations ---

    /**
     * Set stroke color
     * @param {string} color
     */
    setStrokeStyle(color) {
        throw new Error('setStrokeStyle() must be implemented by subclass');
    }

    /**
     * Set fill color
     * @param {string} color
     */
    setFillStyle(color) {
        throw new Error('setFillStyle() must be implemented by subclass');
    }

    /**
     * Set line width
     * @param {number} width
     */
    setLineWidth(width) {
        throw new Error('setLineWidth() must be implemented by subclass');
    }

    /**
     * Set line cap style
     * @param {string} cap - 'butt', 'round', 'square'
     */
    setLineCap(cap) {
        throw new Error('setLineCap() must be implemented by subclass');
    }

    /**
     * Set line join style
     * @param {string} join - 'miter', 'round', 'bevel'
     */
    setLineJoin(join) {
        throw new Error('setLineJoin() must be implemented by subclass');
    }

    /**
     * Set line dash pattern
     * @param {Array<number>} segments
     */
    setLineDash(segments) {
        throw new Error('setLineDash() must be implemented by subclass');
    }

    /**
     * Set global alpha (opacity)
     * @param {number} alpha - 0 to 1
     */
    setGlobalAlpha(alpha) {
        throw new Error('setGlobalAlpha() must be implemented by subclass');
    }

    /**
     * Set shadow effect
     * @param {number} blur
     * @param {string} color
     * @param {number} offsetX
     * @param {number} offsetY
     */
    setShadow(blur, color, offsetX = 0, offsetY = 0) {
        throw new Error('setShadow() must be implemented by subclass');
    }

    /**
     * Clear shadow effect
     */
    clearShadow() {
        throw new Error('clearShadow() must be implemented by subclass');
    }

    // --- Path Operations ---

    /**
     * Begin a new path
     */
    beginPath() {
        throw new Error('beginPath() must be implemented by subclass');
    }

    /**
     * Close the current path
     */
    closePath() {
        throw new Error('closePath() must be implemented by subclass');
    }

    /**
     * Move to position
     * @param {number} x
     * @param {number} y
     */
    moveTo(x, y) {
        throw new Error('moveTo() must be implemented by subclass');
    }

    /**
     * Draw line to position
     * @param {number} x
     * @param {number} y
     */
    lineTo(x, y) {
        throw new Error('lineTo() must be implemented by subclass');
    }

    /**
     * Draw arc
     * @param {number} x - Center X
     * @param {number} y - Center Y
     * @param {number} radius
     * @param {number} startAngle
     * @param {number} endAngle
     * @param {boolean} counterClockwise
     */
    arc(x, y, radius, startAngle, endAngle, counterClockwise = false) {
        throw new Error('arc() must be implemented by subclass');
    }

    /**
     * Draw rectangle path
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    rect(x, y, width, height) {
        throw new Error('rect() must be implemented by subclass');
    }

    /**
     * Draw quadratic curve
     * @param {number} cpx - Control point X
     * @param {number} cpy - Control point Y
     * @param {number} x - End X
     * @param {number} y - End Y
     */
    quadraticCurveTo(cpx, cpy, x, y) {
        throw new Error('quadraticCurveTo() must be implemented by subclass');
    }

    /**
     * Draw bezier curve
     * @param {number} cp1x
     * @param {number} cp1y
     * @param {number} cp2x
     * @param {number} cp2y
     * @param {number} x
     * @param {number} y
     */
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
        throw new Error('bezierCurveTo() must be implemented by subclass');
    }

    // --- Drawing Operations ---

    /**
     * Stroke the current path
     */
    stroke() {
        throw new Error('stroke() must be implemented by subclass');
    }

    /**
     * Fill the current path
     */
    fill() {
        throw new Error('fill() must be implemented by subclass');
    }

    /**
     * Clear rectangle area
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    clearRect(x, y, width, height) {
        throw new Error('clearRect() must be implemented by subclass');
    }

    /**
     * Fill rectangle
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    fillRect(x, y, width, height) {
        throw new Error('fillRect() must be implemented by subclass');
    }

    /**
     * Stroke rectangle
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    strokeRect(x, y, width, height) {
        throw new Error('strokeRect() must be implemented by subclass');
    }

    // --- Text Operations ---

    /**
     * Set font
     * @param {string} font - CSS font string
     */
    setFont(font) {
        throw new Error('setFont() must be implemented by subclass');
    }

    /**
     * Set text alignment
     * @param {string} align - 'left', 'center', 'right'
     */
    setTextAlign(align) {
        throw new Error('setTextAlign() must be implemented by subclass');
    }

    /**
     * Set text baseline
     * @param {string} baseline - 'top', 'middle', 'bottom', etc.
     */
    setTextBaseline(baseline) {
        throw new Error('setTextBaseline() must be implemented by subclass');
    }

    /**
     * Fill text
     * @param {string} text
     * @param {number} x
     * @param {number} y
     * @param {number} maxWidth - Optional max width
     */
    fillText(text, x, y, maxWidth) {
        throw new Error('fillText() must be implemented by subclass');
    }

    /**
     * Stroke text
     * @param {string} text
     * @param {number} x
     * @param {number} y
     * @param {number} maxWidth - Optional max width
     */
    strokeText(text, x, y, maxWidth) {
        throw new Error('strokeText() must be implemented by subclass');
    }

    /**
     * Measure text width
     * @param {string} text
     * @returns {Object} {width}
     */
    measureText(text) {
        throw new Error('measureText() must be implemented by subclass');
    }

    // --- Gradient/Pattern Operations ---

    /**
     * Create linear gradient
     * @param {number} x0 - Start X
     * @param {number} y0 - Start Y
     * @param {number} x1 - End X
     * @param {number} y1 - End Y
     * @returns {Object} Gradient object
     */
    createLinearGradient(x0, y0, x1, y1) {
        throw new Error('createLinearGradient() must be implemented by subclass');
    }

    /**
     * Create radial gradient
     * @param {number} x0 - Start circle center X
     * @param {number} y0 - Start circle center Y
     * @param {number} r0 - Start circle radius
     * @param {number} x1 - End circle center X
     * @param {number} y1 - End circle center Y
     * @param {number} r1 - End circle radius
     * @returns {Object} Gradient object
     */
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
        throw new Error('createRadialGradient() must be implemented by subclass');
    }

    // --- Image Operations ---

    /**
     * Draw image
     * @param {Object} image - Image source
     * @param {number} dx - Destination X
     * @param {number} dy - Destination Y
     * @param {number} dWidth - Destination width (optional)
     * @param {number} dHeight - Destination height (optional)
     */
    drawImage(image, dx, dy, dWidth, dHeight) {
        throw new Error('drawImage() must be implemented by subclass');
    }

    // --- Export Operations ---

    /**
     * Export the rendered content
     * @param {string} format - 'png', 'svg', 'pdf', etc.
     * @returns {Promise<Blob|string>}
     */
    async export(format) {
        throw new Error('export() must be implemented by subclass');
    }
}
