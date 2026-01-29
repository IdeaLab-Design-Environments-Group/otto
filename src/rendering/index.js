/**
 * Rendering Module - Bridge + Strategy Pattern Implementations
 *
 * Provides a flexible rendering architecture:
 * - RenderingContext: Abstract interface for rendering backends
 * - Canvas2DContext: Standard HTML5 Canvas implementation
 * - SVGContext: SVG generation for vector export
 * - Strategies: Interchangeable rendering algorithms
 *
 * Usage:
 * ```javascript
 * import { Canvas2DContext, SVGContext, GridRenderStrategy } from './rendering';
 *
 * // On-screen rendering
 * const canvasContext = new Canvas2DContext(canvasElement);
 *
 * // SVG export
 * const svgContext = new SVGContext(800, 600);
 * // ... render shapes ...
 * const svg = await svgContext.export('svg');
 * ```
 */

// Bridge Pattern - Rendering context abstraction and implementations
export { RenderingContext } from './RenderingContext.js';
export { Canvas2DContext } from './Canvas2DContext.js';
export { SVGContext } from './SVGContext.js';

// Strategy Pattern - Rendering strategies
export * from './strategies/index.js';
