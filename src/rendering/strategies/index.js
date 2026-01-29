/**
 * Rendering Strategies - Strategy Pattern Implementations
 *
 * Provides interchangeable rendering algorithms for different aspects:
 * - Grid rendering (lines, dots, none)
 * - Shape rendering (normal, wireframe, preview)
 * - Selection rendering (standard, minimal, highlight)
 *
 * Usage:
 * ```javascript
 * import { GridRenderStrategy, ShapeRenderStrategy, SelectionRenderStrategy } from './strategies';
 *
 * // Configure strategies
 * const gridStrategy = new GridRenderStrategy({ gridSize: 20, showMajorLines: true });
 * const shapeStrategy = new ShapeRenderStrategy({ strokeStyle: '#333' });
 * const selectionStrategy = new SelectionRenderStrategy({ showHandles: true });
 *
 * // Use in renderer
 * renderer.setGridStrategy(gridStrategy);
 * renderer.setShapeStrategy(shapeStrategy);
 * renderer.setSelectionStrategy(selectionStrategy);
 * ```
 */

// Grid strategies
export {
    GridRenderStrategy,
    DotGridRenderStrategy,
    NoGridStrategy
} from './GridRenderStrategy.js';

// Shape rendering strategies
export {
    ShapeRenderStrategy,
    WireframeRenderStrategy,
    PreviewRenderStrategy,
    HighlightRenderStrategy
} from './ShapeRenderStrategy.js';

// Selection rendering strategies
export {
    SelectionRenderStrategy,
    MinimalSelectionStrategy,
    HighlightSelectionStrategy
} from './SelectionRenderStrategy.js';
