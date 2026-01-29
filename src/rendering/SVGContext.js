import { RenderingContext } from './RenderingContext.js';

/**
 * SVGContext - Bridge Pattern Concrete Implementation
 *
 * Generates SVG output instead of rendering to canvas.
 * Useful for exporting vector graphics.
 *
 * Key differences from Canvas:
 * - Builds up an SVG document structure
 * - Paths are accumulated until stroke/fill
 * - Output is resolution-independent vector graphics
 */
export class SVGContext extends RenderingContext {
    /**
     * @param {number} width - SVG width
     * @param {number} height - SVG height
     */
    constructor(width = 800, height = 600) {
        super();

        this.width = width;
        this.height = height;

        // SVG elements accumulator
        this.elements = [];

        // Current path data
        this.currentPath = '';

        // State stack for save/restore
        this.stateStack = [];

        // Current state
        this.state = this.createDefaultState();

        // Transform stack
        this.transformStack = [];
        this.currentTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    }

    /**
     * Create default rendering state
     */
    createDefaultState() {
        return {
            strokeStyle: '#000000',
            fillStyle: '#000000',
            lineWidth: 1,
            lineCap: 'butt',
            lineJoin: 'miter',
            lineDash: [],
            globalAlpha: 1,
            shadowBlur: 0,
            shadowColor: 'transparent',
            shadowOffsetX: 0,
            shadowOffsetY: 0,
            font: '10px sans-serif',
            textAlign: 'start',
            textBaseline: 'alphabetic'
        };
    }

    getContext() {
        return null; // No native context
    }

    getDimensions() {
        return { width: this.width, height: this.height };
    }

    // --- State Management ---

    save() {
        this.stateStack.push({ ...this.state });
        this.transformStack.push({ ...this.currentTransform });
    }

    restore() {
        if (this.stateStack.length > 0) {
            this.state = this.stateStack.pop();
        }
        if (this.transformStack.length > 0) {
            this.currentTransform = this.transformStack.pop();
        }
    }

    resetTransform() {
        this.currentTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    }

    // --- Transform Operations ---

    translate(x, y) {
        this.currentTransform.e += x;
        this.currentTransform.f += y;
    }

    scale(x, y) {
        this.currentTransform.a *= x;
        this.currentTransform.d *= y;
    }

    rotate(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const { a, b, c, d } = this.currentTransform;

        this.currentTransform.a = a * cos - b * sin;
        this.currentTransform.b = a * sin + b * cos;
        this.currentTransform.c = c * cos - d * sin;
        this.currentTransform.d = c * sin + d * cos;
    }

    setTransform(a, b, c, d, e, f) {
        this.currentTransform = { a, b, c, d, e, f };
    }

    /**
     * Get current transform as SVG transform attribute
     */
    getTransformAttribute() {
        const { a, b, c, d, e, f } = this.currentTransform;
        if (a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0) {
            return '';
        }
        return `transform="matrix(${a} ${b} ${c} ${d} ${e} ${f})"`;
    }

    // --- Style Operations ---

    setStrokeStyle(color) {
        this.state.strokeStyle = color;
    }

    setFillStyle(color) {
        this.state.fillStyle = color;
    }

    setLineWidth(width) {
        this.state.lineWidth = width;
    }

    setLineCap(cap) {
        this.state.lineCap = cap;
    }

    setLineJoin(join) {
        this.state.lineJoin = join;
    }

    setLineDash(segments) {
        this.state.lineDash = segments;
    }

    setGlobalAlpha(alpha) {
        this.state.globalAlpha = alpha;
    }

    setShadow(blur, color, offsetX = 0, offsetY = 0) {
        this.state.shadowBlur = blur;
        this.state.shadowColor = color;
        this.state.shadowOffsetX = offsetX;
        this.state.shadowOffsetY = offsetY;
    }

    clearShadow() {
        this.state.shadowBlur = 0;
        this.state.shadowColor = 'transparent';
    }

    // --- Path Operations ---

    beginPath() {
        this.currentPath = '';
    }

    closePath() {
        this.currentPath += 'Z ';
    }

    moveTo(x, y) {
        this.currentPath += `M ${x} ${y} `;
    }

    lineTo(x, y) {
        this.currentPath += `L ${x} ${y} `;
    }

    arc(x, y, radius, startAngle, endAngle, counterClockwise = false) {
        // Convert arc to SVG path
        const startX = x + radius * Math.cos(startAngle);
        const startY = y + radius * Math.sin(startAngle);
        const endX = x + radius * Math.cos(endAngle);
        const endY = y + radius * Math.sin(endAngle);

        // Determine if arc is greater than 180 degrees
        let angleDiff = endAngle - startAngle;
        if (counterClockwise) {
            angleDiff = -angleDiff;
        }
        const largeArcFlag = Math.abs(angleDiff) > Math.PI ? 1 : 0;
        const sweepFlag = counterClockwise ? 0 : 1;

        // Full circle case
        if (Math.abs(angleDiff) >= Math.PI * 2) {
            // Draw as two half circles
            const midX = x + radius * Math.cos(startAngle + Math.PI);
            const midY = y + radius * Math.sin(startAngle + Math.PI);

            this.currentPath += `M ${startX} ${startY} `;
            this.currentPath += `A ${radius} ${radius} 0 0 ${sweepFlag} ${midX} ${midY} `;
            this.currentPath += `A ${radius} ${radius} 0 0 ${sweepFlag} ${startX} ${startY} `;
        } else {
            this.currentPath += `M ${startX} ${startY} `;
            this.currentPath += `A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY} `;
        }
    }

    rect(x, y, width, height) {
        this.currentPath += `M ${x} ${y} `;
        this.currentPath += `L ${x + width} ${y} `;
        this.currentPath += `L ${x + width} ${y + height} `;
        this.currentPath += `L ${x} ${y + height} `;
        this.currentPath += 'Z ';
    }

    quadraticCurveTo(cpx, cpy, x, y) {
        this.currentPath += `Q ${cpx} ${cpy} ${x} ${y} `;
    }

    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
        this.currentPath += `C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${x} ${y} `;
    }

    // --- Drawing Operations ---

    /**
     * Get common style attributes
     */
    getStyleAttributes(mode) {
        const attrs = [];

        if (mode === 'stroke' || mode === 'both') {
            attrs.push(`stroke="${this.state.strokeStyle}"`);
            attrs.push(`stroke-width="${this.state.lineWidth}"`);
            attrs.push(`stroke-linecap="${this.state.lineCap}"`);
            attrs.push(`stroke-linejoin="${this.state.lineJoin}"`);

            if (this.state.lineDash.length > 0) {
                attrs.push(`stroke-dasharray="${this.state.lineDash.join(' ')}"`);
            }
        } else {
            attrs.push('stroke="none"');
        }

        if (mode === 'fill' || mode === 'both') {
            attrs.push(`fill="${this.state.fillStyle}"`);
        } else {
            attrs.push('fill="none"');
        }

        if (this.state.globalAlpha < 1) {
            attrs.push(`opacity="${this.state.globalAlpha}"`);
        }

        const transform = this.getTransformAttribute();
        if (transform) {
            attrs.push(transform);
        }

        return attrs.join(' ');
    }

    stroke() {
        if (this.currentPath) {
            this.elements.push(`<path d="${this.currentPath.trim()}" ${this.getStyleAttributes('stroke')}/>`);
        }
    }

    fill() {
        if (this.currentPath) {
            this.elements.push(`<path d="${this.currentPath.trim()}" ${this.getStyleAttributes('fill')}/>`);
        }
    }

    clearRect(x, y, width, height) {
        // In SVG, we can't really "clear" - but we can add a white rectangle
        this.elements.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="white" ${this.getTransformAttribute()}/>`);
    }

    fillRect(x, y, width, height) {
        this.elements.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" ${this.getStyleAttributes('fill')}/>`);
    }

    strokeRect(x, y, width, height) {
        this.elements.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" ${this.getStyleAttributes('stroke')}/>`);
    }

    // --- Text Operations ---

    setFont(font) {
        this.state.font = font;
    }

    setTextAlign(align) {
        this.state.textAlign = align;
    }

    setTextBaseline(baseline) {
        this.state.textBaseline = baseline;
    }

    /**
     * Convert CSS font to SVG font attributes
     */
    getFontAttributes() {
        // Simple parsing - this could be more robust
        const font = this.state.font;
        const parts = font.split(' ');
        const size = parts.find(p => p.includes('px')) || '10px';
        const family = parts[parts.length - 1] || 'sans-serif';

        return `font-size="${size}" font-family="${family}"`;
    }

    /**
     * Convert text-align to SVG text-anchor
     */
    getTextAnchor() {
        switch (this.state.textAlign) {
            case 'center': return 'middle';
            case 'right':
            case 'end': return 'end';
            default: return 'start';
        }
    }

    /**
     * Convert textBaseline to SVG dominant-baseline
     */
    getDominantBaseline() {
        switch (this.state.textBaseline) {
            case 'top': return 'text-before-edge';
            case 'middle': return 'central';
            case 'bottom': return 'text-after-edge';
            default: return 'alphabetic';
        }
    }

    fillText(text, x, y, maxWidth) {
        const escaped = this.escapeXml(text);
        this.elements.push(
            `<text x="${x}" y="${y}" ${this.getFontAttributes()} ` +
            `text-anchor="${this.getTextAnchor()}" dominant-baseline="${this.getDominantBaseline()}" ` +
            `fill="${this.state.fillStyle}" ${this.getTransformAttribute()}>${escaped}</text>`
        );
    }

    strokeText(text, x, y, maxWidth) {
        const escaped = this.escapeXml(text);
        this.elements.push(
            `<text x="${x}" y="${y}" ${this.getFontAttributes()} ` +
            `text-anchor="${this.getTextAnchor()}" dominant-baseline="${this.getDominantBaseline()}" ` +
            `stroke="${this.state.strokeStyle}" fill="none" ${this.getTransformAttribute()}>${escaped}</text>`
        );
    }

    measureText(text) {
        // Approximate - SVG doesn't have direct text measurement
        // This is a rough estimate based on font size
        const fontSize = parseInt(this.state.font) || 10;
        return { width: text.length * fontSize * 0.6 };
    }

    // --- Gradient/Pattern Operations ---

    createLinearGradient(x0, y0, x1, y1) {
        const id = `gradient-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return {
            type: 'linearGradient',
            id,
            x1: x0,
            y1: y0,
            x2: x1,
            y2: y1,
            stops: [],
            addColorStop(offset, color) {
                this.stops.push({ offset, color });
            }
        };
    }

    createRadialGradient(x0, y0, r0, x1, y1, r1) {
        const id = `gradient-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return {
            type: 'radialGradient',
            id,
            cx: x1,
            cy: y1,
            r: r1,
            fx: x0,
            fy: y0,
            stops: [],
            addColorStop(offset, color) {
                this.stops.push({ offset, color });
            }
        };
    }

    // --- Image Operations ---

    drawImage(image, dx, dy, dWidth, dHeight) {
        // SVG can embed images as base64
        // This is a simplified implementation
        console.warn('SVGContext.drawImage is not fully implemented');
    }

    // --- Export Operations ---

    /**
     * Generate the complete SVG document
     * @returns {string}
     */
    toSVGString() {
        const svg = [
            `<?xml version="1.0" encoding="UTF-8"?>`,
            `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}">`,
            ...this.elements,
            `</svg>`
        ];

        return svg.join('\n');
    }

    async export(format = 'svg') {
        const svgString = this.toSVGString();

        if (format === 'svg' || format === 'string') {
            return svgString;
        } else if (format === 'blob') {
            return new Blob([svgString], { type: 'image/svg+xml' });
        } else if (format === 'dataurl') {
            return 'data:image/svg+xml;base64,' + btoa(svgString);
        } else {
            throw new Error(`Unsupported export format: ${format}`);
        }
    }

    /**
     * Clear all elements and reset state
     */
    clear() {
        this.elements = [];
        this.currentPath = '';
        this.stateStack = [];
        this.state = this.createDefaultState();
        this.transformStack = [];
        this.currentTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    }

    /**
     * Escape XML special characters
     * @param {string} str
     * @returns {string}
     */
    escapeXml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}
