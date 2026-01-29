import { RenderingContext } from './RenderingContext.js';

/**
 * Canvas2DContext - Bridge Pattern Concrete Implementation
 *
 * Wraps the HTML5 Canvas 2D rendering context.
 * Provides the standard implementation for on-screen rendering.
 */
export class Canvas2DContext extends RenderingContext {
    /**
     * @param {HTMLCanvasElement} canvas - The canvas element
     */
    constructor(canvas) {
        super();

        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            throw new Error('Canvas2DContext requires a valid HTMLCanvasElement');
        }

        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        if (!this.ctx) {
            throw new Error('Failed to get 2D rendering context');
        }
    }

    getContext() {
        return this.ctx;
    }

    getDimensions() {
        return {
            width: this.canvas.width,
            height: this.canvas.height
        };
    }

    // --- State Management ---

    save() {
        this.ctx.save();
    }

    restore() {
        this.ctx.restore();
    }

    resetTransform() {
        this.ctx.resetTransform();
    }

    // --- Transform Operations ---

    translate(x, y) {
        this.ctx.translate(x, y);
    }

    scale(x, y) {
        this.ctx.scale(x, y);
    }

    rotate(angle) {
        this.ctx.rotate(angle);
    }

    setTransform(a, b, c, d, e, f) {
        this.ctx.setTransform(a, b, c, d, e, f);
    }

    // --- Style Operations ---

    setStrokeStyle(color) {
        this.ctx.strokeStyle = color;
    }

    setFillStyle(color) {
        this.ctx.fillStyle = color;
    }

    setLineWidth(width) {
        this.ctx.lineWidth = width;
    }

    setLineCap(cap) {
        this.ctx.lineCap = cap;
    }

    setLineJoin(join) {
        this.ctx.lineJoin = join;
    }

    setLineDash(segments) {
        this.ctx.setLineDash(segments);
    }

    setGlobalAlpha(alpha) {
        this.ctx.globalAlpha = alpha;
    }

    setShadow(blur, color, offsetX = 0, offsetY = 0) {
        this.ctx.shadowBlur = blur;
        this.ctx.shadowColor = color;
        this.ctx.shadowOffsetX = offsetX;
        this.ctx.shadowOffsetY = offsetY;
    }

    clearShadow() {
        this.ctx.shadowBlur = 0;
        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;
    }

    // --- Path Operations ---

    beginPath() {
        this.ctx.beginPath();
    }

    closePath() {
        this.ctx.closePath();
    }

    moveTo(x, y) {
        this.ctx.moveTo(x, y);
    }

    lineTo(x, y) {
        this.ctx.lineTo(x, y);
    }

    arc(x, y, radius, startAngle, endAngle, counterClockwise = false) {
        this.ctx.arc(x, y, radius, startAngle, endAngle, counterClockwise);
    }

    rect(x, y, width, height) {
        this.ctx.rect(x, y, width, height);
    }

    quadraticCurveTo(cpx, cpy, x, y) {
        this.ctx.quadraticCurveTo(cpx, cpy, x, y);
    }

    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
        this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
    }

    // --- Drawing Operations ---

    stroke() {
        this.ctx.stroke();
    }

    fill() {
        this.ctx.fill();
    }

    clearRect(x, y, width, height) {
        this.ctx.clearRect(x, y, width, height);
    }

    fillRect(x, y, width, height) {
        this.ctx.fillRect(x, y, width, height);
    }

    strokeRect(x, y, width, height) {
        this.ctx.strokeRect(x, y, width, height);
    }

    // --- Text Operations ---

    setFont(font) {
        this.ctx.font = font;
    }

    setTextAlign(align) {
        this.ctx.textAlign = align;
    }

    setTextBaseline(baseline) {
        this.ctx.textBaseline = baseline;
    }

    fillText(text, x, y, maxWidth) {
        if (maxWidth !== undefined) {
            this.ctx.fillText(text, x, y, maxWidth);
        } else {
            this.ctx.fillText(text, x, y);
        }
    }

    strokeText(text, x, y, maxWidth) {
        if (maxWidth !== undefined) {
            this.ctx.strokeText(text, x, y, maxWidth);
        } else {
            this.ctx.strokeText(text, x, y);
        }
    }

    measureText(text) {
        return this.ctx.measureText(text);
    }

    // --- Gradient/Pattern Operations ---

    createLinearGradient(x0, y0, x1, y1) {
        return this.ctx.createLinearGradient(x0, y0, x1, y1);
    }

    createRadialGradient(x0, y0, r0, x1, y1, r1) {
        return this.ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
    }

    // --- Image Operations ---

    drawImage(image, dx, dy, dWidth, dHeight) {
        if (dWidth !== undefined && dHeight !== undefined) {
            this.ctx.drawImage(image, dx, dy, dWidth, dHeight);
        } else {
            this.ctx.drawImage(image, dx, dy);
        }
    }

    // --- Export Operations ---

    async export(format = 'png') {
        return new Promise((resolve, reject) => {
            try {
                if (format === 'png') {
                    this.canvas.toBlob((blob) => {
                        resolve(blob);
                    }, 'image/png');
                } else if (format === 'jpeg' || format === 'jpg') {
                    this.canvas.toBlob((blob) => {
                        resolve(blob);
                    }, 'image/jpeg', 0.95);
                } else if (format === 'dataurl') {
                    resolve(this.canvas.toDataURL('image/png'));
                } else {
                    reject(new Error(`Unsupported export format: ${format}`));
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    // --- Canvas-specific Methods ---

    /**
     * Get pixel data
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     * @returns {ImageData}
     */
    getImageData(x, y, width, height) {
        return this.ctx.getImageData(x, y, width, height);
    }

    /**
     * Put pixel data
     * @param {ImageData} imageData
     * @param {number} dx
     * @param {number} dy
     */
    putImageData(imageData, dx, dy) {
        this.ctx.putImageData(imageData, dx, dy);
    }

    /**
     * Resize the canvas
     * @param {number} width
     * @param {number} height
     */
    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
    }
}
