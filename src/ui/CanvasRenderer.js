/**
 * @fileoverview The central rendering and interaction engine for the Otto canvas.
 *
 * This single class is responsible for:
 * - Drawing all shapes, the grid, rulers, selection indicators, resize handles,
 *   edge-joinery previews, path-drawing previews, and drag ghosts onto an
 *   HTML5 `<canvas>`.
 * - Processing every mouse and keyboard event that originates on the canvas:
 *   selection (single + rubber-band multi), dragging, resizing, path drawing,
 *   Bezier-handle editing, edge hovering/selection, joinery-handle dragging,
 *   panning (right-drag), and scroll-wheel zooming.
 *
 * Design patterns in use:
 * - **Observer** -- subscribes to EventBus for SHAPE_ADDED / REMOVED / MOVED /
 *   SELECTED / PARAM_CHANGED / VIEWPORT_CHANGED and others; any of these
 *   triggers a throttled re-render via requestAnimationFrame.
 * - **Strategy** -- the snap behaviour (NoSnap, GridSnap, ShapeSnap) is
 *   injected at runtime via setSnapStrategy().
 * - **Command** -- drag-and-drop shape moves produce MoveShapesCommand objects;
 *   duplication produces DuplicateShapesCommand.  Both are undoable.
 * - **Template Method** (inherited) -- extends Component, so render() is the
 *   hook called by mount().
 *
 * @module ui/CanvasRenderer
 */
import { Component } from './Component.js';
import EventBus, { EVENTS } from '../events/EventBus.js';
import { LiteralBinding } from '../models/Binding.js';
import { NoSnap, GridSnap, ShapeSnap } from '../core/SnapStrategy.js';
import { MoveShapesCommand, DuplicateShapesCommand } from '../core/Command.js';
import { PathShape } from '../models/shapes/PathShape.js';
import { Path as GeoPath, Vec as GeoVec } from '../geometry/index.js';
import { EdgeJoineryMenu } from './EdgeJoineryMenu.js';
import { getResizeStrategy } from './ShapeResizeStrategies.js';
import {
    EdgeHitTester,
    edgesFromItem,
    renderEdgeHover,
    renderEdgeSelected,
    renderPointOnEdge,
    DEFAULT_HIT_DISTANCE
} from '../geometry/edge/index.js';

/**
 * Canvas rendering and interaction engine.  Extends {@link Component}.
 *
 * See the file-level documentation for a high-level overview.  The constructor
 * JSDoc below groups every field by its logical purpose.
 *
 * @class CanvasRenderer
 * @extends Component
 */
export class CanvasRenderer extends Component {
    /**
     * Construct the CanvasRenderer and initialise all internal state.
     *
     * Fields are grouped into logical clusters; each cluster is also marked
     * with a section comment in the constructor body for quick scanning.
     *
     * **Canvas / context / scene references** --
     * `canvas`, `ctx`, `sceneState`, `bindingResolver`, `viewport`.
     *
     * **CSS dimension tracking** --
     * `cssWidth` / `cssHeight`.  Separate from canvas.width/height because the
     * latter are inflated by devicePixelRatio for HiDPI rendering.
     *
     * **Interaction -- dragging** --
     * `isDragging`, `dragStart`, `dragShape`.  dragStart carries either a
     * viewport snapshot (pan) or shapeId + initial positions (shape move).
     *
     * **Selection** --
     * `selectedShapeId` (single, backward-compat), `selectedShapeIds` (Set,
     * multi-select).
     *
     * **Selection rectangle (rubber-band)** --
     * `isSelecting`, `selectionStart`, `selectionRect`.
     *
     * **Tool mode** --
     * `toolMode`: `'select'` (default) or `'path'` (free-draw).
     *
     * **Resize handles** --
     * `isResizing`, `resizeState` (captures corner, start bounds, Strategy),
     * `hoveredResizeHandle`.
     *
     * **Path drawing** --
     * `isPathDrawing`, `pathDrawPoints`, `pathPreviewPos`,
     * `pathDrawCurveSegments`, `pathDrawHandles`, and auxiliary flags for
     * anchor/handle dragging, double-click detection, and the "next segment
     * is curved" toggle.
     *
     * **Handle editing (post-creation Bezier adjustment)** --
     * `handleEditState`, `isDraggingHandle`, `handleDragStart`.
     *
     * **Drag preview (palette ghost)** --
     * `dragPreviewType`, `dragPreviewPos`, `baseZoom`, `hasInitializedZoom`.
     *
     * **Render throttling** --
     * `animationFrameId`, `needsRender`.  requestAnimationFrame coalescing.
     *
     * **Grid** -- `gridSize` (20), `showGrid` (true).
     *
     * **Snap strategy** -- `snapStrategy`, defaults to NoSnap.
     *
     * **Edge selection** --
     * `edgeHitTester`, `hoveredEdge`, `hoveredEdgePosition`.
     *
     * **Edge joinery** --
     * `edgeJoineryMenu`, `joineryHandles` (hit-test cache rebuilt every frame),
     * `hoveredJoineryHandle`, `isDraggingJoineryHandle`, `joineryDragStart`.
     *
     * **Keyboard** -- `pressedKeys` Set for modifier detection.
     *
     * **Command history** -- `commandHistory` for batch undo.
     *
     * @param {HTMLCanvasElement} canvasElement - The `<canvas>` to draw on.
     *   Its parentElement becomes the Component container.
     * @param {object} sceneState - Top-level scene state; must expose
     *   `{ shapeStore, viewport: {x, y, zoom} }`.
     * @param {object} bindingResolver - Must expose
     *   `resolveShape(shape) -> resolvedShape`.
     */
    constructor(canvasElement, sceneState, bindingResolver) {
        super(canvasElement.parentElement);

        // ---------------------------------------------------------------------------
        // Canvas / context / scene references
        // ---------------------------------------------------------------------------
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.sceneState = sceneState;
        this.bindingResolver = bindingResolver;
        this.viewport = sceneState.viewport;

        // ---------------------------------------------------------------------------
        // CSS dimension tracking -- needed for HiDPI coordinate math
        // ---------------------------------------------------------------------------
        // Store CSS dimensions for proper rendering
        this.cssWidth = 0;
        this.cssHeight = 0;

        // ---------------------------------------------------------------------------
        // Interaction state -- dragging (pan or shape move)
        // ---------------------------------------------------------------------------
        // Interaction state
        this.isDragging = false;
        this.dragStart = null;
        this.dragShape = null;
        this.selectedShapeId = null;
        this.selectedShapeIds = new Set(); // Multi-selection

        // ---------------------------------------------------------------------------
        // Selection rectangle (rubber-band multi-select)
        // ---------------------------------------------------------------------------
        // Selection rectangle state
        this.isSelecting = false;
        this.selectionStart = null;
        this.selectionRect = null;

        // ---------------------------------------------------------------------------
        // Tool mode -- 'select' (default pointer) or 'path' (free-draw)
        // ---------------------------------------------------------------------------
        // Tool mode
        this.toolMode = 'select';

        // ---------------------------------------------------------------------------
        // Resize handles -- corner drag to resize a selected shape
        // ---------------------------------------------------------------------------
        // Resize handle interaction state
        this.isResizing = false;
        this.resizeState = null; // { shapeId, handle, startBounds, startState, strategy, changedProps }
        this.hoveredResizeHandle = null;

        // Rotation handle interaction state
        this.isRotating = false;
        this.rotationState = null; // { shapeId, center, startAngle, startRotation }

        // ---------------------------------------------------------------------------
        // Path drawing -- click-to-place anchors, optional cubic Bezier curves
        // ---------------------------------------------------------------------------
        // Path drawing state (open path)
        this.isPathDrawing = false;
        this.pathDrawPoints = [];
        this.pathPreviewPos = null;
        this.pathDrawCurveSegments = [];
        this.pathDrawHandles = [];
        this.isDrawingHandleDrag = false;
        this.pathDrawHandleState = null; // { pointIndex, handleType }
        this.isDrawingAnchorDrag = false;
        this.pathDrawAnchorIndex = null;
        this.pathDrawEditSegmentIndex = null;
        this.pathDrawCurvedEndIndex = null;
        this.lastPathClickTime = 0;
        this.lastPathClickPos = null;
        this.nextSegmentCurved = false; // Flag: next segment should be curved
        this.skipNextPathClick = false; // Skip the second mousedown of a double-click

        // ---------------------------------------------------------------------------
        // Handle editing -- post-creation Bezier control-point adjustment
        // ---------------------------------------------------------------------------
        // Handle editing state (for bezier curve handles)
        this.handleEditState = null; // { shapeId, pointIndex, activeHandle: 'handleIn'|'handleOut'|null }
        this.isDraggingHandle = false;
        this.handleDragStart = null;

        // ---------------------------------------------------------------------------
        // Drag preview -- ghost shape while dragging from the ShapeLibrary palette
        // ---------------------------------------------------------------------------
        // Drag preview state
        this.dragPreviewType = null;
        this.dragPreviewPos = null;
        this.baseZoom = 1;
        this.hasInitializedZoom = false;

        // ---------------------------------------------------------------------------
        // Render throttling -- coalesce rapid state changes into one paint
        // ---------------------------------------------------------------------------
        // Render throttling
        this.animationFrameId = null;
        this.needsRender = false;

        // ---------------------------------------------------------------------------
        // Grid -- visual guide lines drawn in screen space
        // ---------------------------------------------------------------------------
        // Grid settings
        this.gridSize = 20;
        this.showGrid = true;

        // ---------------------------------------------------------------------------
        // Snap strategy (Strategy Pattern) -- pluggable coordinate snapping
        // ---------------------------------------------------------------------------
        // Snap strategy (Strategy Pattern)
        this.snapStrategy = new NoSnap(); // Default: no snapping

        // ---------------------------------------------------------------------------
        // Edge selection -- hit testing and hover highlighting
        // ---------------------------------------------------------------------------
        // Edge selection state
        this.edgeHitTester = new EdgeHitTester({ tolerance: DEFAULT_HIT_DISTANCE });
        this.hoveredEdge = null;
        this.hoveredEdgePosition = null;

        // ---------------------------------------------------------------------------
        // Edge joinery -- context menu and interactive depth/alignment handles
        // ---------------------------------------------------------------------------
        // Edge joinery context menu
        this.edgeJoineryMenu = new EdgeJoineryMenu({
            getShapeStore: () => this.sceneState.shapeStore
        });

        // Joinery handle interaction state
        this.joineryHandles = []; // Cached handle positions for hit testing
        this.hoveredJoineryHandle = null; // { edge, type: 'depth' | 'align' }
        this.isDraggingJoineryHandle = false;
        this.joineryDragStart = null;

        // ---------------------------------------------------------------------------
        // Keyboard -- modifier and shortcut detection
        // ---------------------------------------------------------------------------
        // Keyboard navigation
        this.pressedKeys = new Set();
        this.setupKeyboardListeners();

        // ---------------------------------------------------------------------------
        // Command history -- batch undo of drag / duplicate operations
        // ---------------------------------------------------------------------------
        // Command history for undo/redo (for batch operations)
        this.commandHistory = [];

        // ---------------------------------------------------------------------------
        // Wire up DOM events, EventBus subscriptions, and initial render
        // ---------------------------------------------------------------------------
        // Setup event listeners
        this.setupEventListeners();

        // Subscribe to events for re-rendering
        this.subscribeToEvents();

        // Subscribe to drag preview events from DragDropManager.
        // DRAG_PREVIEW_UPDATE fires on every dragover; convert the screen
        // position to world coordinates and store for the next paint frame.
        // DRAG_PREVIEW_CLEAR fires on dragleave / dragend; remove the ghost.
        this.subscribe('DRAG_PREVIEW_UPDATE', (payload) => {
            if (payload && payload.shapeType && payload.position) {
                this.dragPreviewType = payload.shapeType;
                const worldPos = this.screenToWorld(payload.position.x, payload.position.y);
                this.dragPreviewPos = worldPos;
                this.requestRender();
            }
        });

        this.subscribe('DRAG_PREVIEW_CLEAR', () => {
            this.dragPreviewType = null;
            this.dragPreviewPos = null;
            this.requestRender();
        });

        // Initial render
        this.resizeCanvas();
        this.render();
    }
    
    /**
     * Subscribe to relevant events
     */
    subscribeToEvents() {
        this.subscribe(EVENTS.SHAPE_ADDED, () => this.requestRender());
        this.subscribe(EVENTS.SHAPE_REMOVED, (payload) => {
            // Remove from local selection if the removed shape was selected
            if (payload && payload.id) {
                this.selectedShapeIds.delete(payload.id);
                if (this.selectedShapeId === payload.id) {
                    this.selectedShapeId = null;
                }
            }
            this.requestRender();
        });
        this.subscribe(EVENTS.SHAPE_MOVED, () => this.requestRender());
        this.subscribe(EVENTS.SHAPE_SELECTED, (payload) => {
            this.selectedShapeId = payload ? payload.id : null;
            if (payload && payload.selectedIds) {
                this.selectedShapeIds = new Set(payload.selectedIds);
            } else if (payload && payload.id) {
                this.selectedShapeIds = new Set([payload.id]);
            } else {
                this.selectedShapeIds.clear();
            }
            this.requestRender();
        });
        this.subscribe(EVENTS.PARAM_CHANGED, () => {
            // Only render if not currently dragging (to avoid lag)
            if (!this.isDragging) {
                this.requestRender();
            }
        });

        // Edge selection events
        this.subscribe(EVENTS.EDGE_SELECTED, () => this.requestRender());
        this.subscribe(EVENTS.EDGE_HOVERED, (payload) => {
            this.hoveredEdge = payload?.edge || null;
            this.hoveredEdgePosition = payload?.position || null;
            this.requestRender();
        });
        this.subscribe(EVENTS.EDGE_JOINERY_CHANGED, () => this.requestRender());
        this.subscribe(EVENTS.SELECTION_MODE_CHANGED, (payload) => {
            // Update cursor based on mode
            if (payload?.mode === 'edge') {
                this.canvas.style.cursor = 'crosshair';
            } else {
                this.canvas.style.cursor = 'default';
            }
            this.requestRender();
        });
        // Shape hover events
        this.subscribe(EVENTS.SHAPE_HOVERED, () => this.requestRender());
    }
    
    /**
     * Setup mouse and wheel event listeners
     */
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
        this.canvas.addEventListener('mouseleave', () => {
            if (this.isDragging) {
                this.onMouseUp(new MouseEvent('mouseup'));
            }
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });
        
        // Use ResizeObserver to watch for container size changes (including panel resizes)
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => {
                this.resizeCanvas();
            });
            this.resizeObserver.observe(this.canvas.parentElement);
        }
        
        this.resizeCanvas();
    }
    
    /**
     * Resize canvas to fill container
     * Maintains proper aspect ratio and device pixel ratio
     */
    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        // Store CSS dimensions for use in rendering
        this.cssWidth = rect.width;
        this.cssHeight = rect.height;
        this.baseZoom = Math.max(0.01, Math.min(this.cssWidth, this.cssHeight) / 300);
        if (!this.hasInitializedZoom) {
            this.viewport.zoom = this.baseZoom;
            this.hasInitializedZoom = true;
        }
        
        // Set display size (CSS pixels)
        this.canvas.style.width = `${this.cssWidth}px`;
        this.canvas.style.height = `${this.cssHeight}px`;
        
        // Set internal size (actual pixels) accounting for device pixel ratio
        const newWidth = this.cssWidth * dpr;
        const newHeight = this.cssHeight * dpr;
        
        // Only resize if dimensions actually changed
        if (this.canvas.width !== newWidth || this.canvas.height !== newHeight) {
            this.canvas.width = newWidth;
            this.canvas.height = newHeight;
            
            // Setting canvas width/height resets the context, so we need to reapply DPR scaling
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        
        this.render();
    }
    
    /**
     * Main render method
     */
    render() {
        if (!this.ctx) return;
        
        // Clear canvas using CSS pixel dimensions (DPR is already applied to context)
        const width = this.cssWidth || this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.cssHeight || this.canvas.height / (window.devicePixelRatio || 1);
        this.ctx.clearRect(0, 0, width, height);
        
        // Render grid in screen space (before viewport transform)
        if (this.showGrid) {
            this.renderGrid();
        }
        
        // Apply viewport transformation (device pixel ratio already applied in resizeCanvas)
        this.ctx.save();
        this.ctx.translate(this.viewport.x, this.viewport.y);
        this.ctx.scale(this.viewport.zoom, this.viewport.zoom);
        
        // Render shapes
        this.renderShapes();

        // Render edge joinery previews
        this.renderEdgeJoinery();
        
        // Render selection
        this.renderSelection();
        
        // Render selection rectangle
        if (this.selectionRect) {
            this.renderSelectionRect();
        }
        
        // Render drag preview if dragging shape on canvas
        if (this.isDragging && this.dragShape) {
            const worldPos = this.screenToWorld(this.dragStart.x, this.dragStart.y);
            this.renderDragPreview(this.dragShape, worldPos.x, worldPos.y);
        }
        
        // Render drag preview from DragDropManager (when dragging from library)
        if (this.dragPreviewType && this.dragPreviewPos) {
            this.renderDragPreview(this.dragPreviewType, this.dragPreviewPos.x, this.dragPreviewPos.y);
        }

        // Render path drawing preview
        if (this.isPathDrawing && this.pathDrawPoints.length > 0) {
            if (this.isDrawingHandleDrag) {
                this.renderPathDrawPreviewCommitted();
            } else {
                this.renderPathDrawPreview();
            }
            this.renderPathDrawPreviewHandles();
        }
        
        // Render handle editing UI
        if (this.handleEditState) {
            this.renderHandleEditor();
        }
        
        this.ctx.restore();
        
        this.needsRender = false;
    }
    
    /**
     * Render bezier handle editor for the selected point
     */
    renderHandleEditor() {
        const shape = this.sceneState.shapeStore.get(this.handleEditState.shapeId);
        if (!shape || shape.type !== 'path') return;
        
        const pointIndex = this.handleEditState.pointIndex;
        const point = shape.points[pointIndex];
        if (!point) return;
        
        // Get handles directly from shape.handles array
        let handles = { handleIn: null, handleOut: null };
        
        // First, check if handles exist in the shape's handles array
        if (shape.handles && shape.handles[pointIndex]) {
            const h = shape.handles[pointIndex];
            handles.handleIn = h.handleIn ? { ...h.handleIn } : null;
            handles.handleOut = h.handleOut ? { ...h.handleOut } : null;
        }
        
        // If no handles exist, create default ones based on neighboring points
        const prevPoint = shape.points[pointIndex - 1];
        const nextPoint = shape.points[pointIndex + 1];
        
        if (!handles.handleOut && nextPoint) {
            const dx = nextPoint.x - point.x;
            const dy = nextPoint.y - point.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0.001) {
                const handleLen = len / 3;
                handles.handleOut = {
                    x: dx / len * handleLen,
                    y: dy / len * handleLen
                };
            }
        }
        
        if (!handles.handleIn && prevPoint) {
            const dx = prevPoint.x - point.x;
            const dy = prevPoint.y - point.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0.001) {
                const handleLen = len / 3;
                handles.handleIn = {
                    x: dx / len * handleLen,
                    y: dy / len * handleLen
                };
            }
        }
        
        // If still no handles, don't render anything
        if (!handles.handleIn && !handles.handleOut) {
            return;
        }
        
        this.ctx.save();
        
        // Style settings - make handles more visible
        const handleLineColor = '#2196F3';
        const handleFillColor = '#fff';
        const handleStrokeColor = '#2196F3';
        const pointColor = '#000';
        const handleRadius = 6 / this.viewport.zoom; // Scale with zoom for visibility
        const pointRadius = 5 / this.viewport.zoom;
        
        // Draw handle lines and circles
        this.ctx.lineWidth = 2 / this.viewport.zoom; // Scale line width with zoom
        this.ctx.strokeStyle = handleLineColor;
        this.ctx.setLineDash([]);
        
        // Draw handleOut
        if (handles.handleOut) {
            const hx = point.x + handles.handleOut.x;
            const hy = point.y + handles.handleOut.y;
            
            // Line from point to handle
            this.ctx.beginPath();
            this.ctx.moveTo(point.x, point.y);
            this.ctx.lineTo(hx, hy);
            this.ctx.stroke();
            
            // Handle circle
            this.ctx.beginPath();
            this.ctx.arc(hx, hy, handleRadius, 0, Math.PI * 2);
            this.ctx.fillStyle = handleFillColor;
            this.ctx.fill();
            this.ctx.strokeStyle = handleStrokeColor;
            this.ctx.lineWidth = 2 / this.viewport.zoom;
            this.ctx.stroke();
        }
        
        // Draw handleIn
        if (handles.handleIn) {
            const hx = point.x + handles.handleIn.x;
            const hy = point.y + handles.handleIn.y;
            
            // Line from point to handle
            this.ctx.beginPath();
            this.ctx.moveTo(point.x, point.y);
            this.ctx.lineTo(hx, hy);
            this.ctx.stroke();
            
            // Handle circle
            this.ctx.beginPath();
            this.ctx.arc(hx, hy, handleRadius, 0, Math.PI * 2);
            this.ctx.fillStyle = handleFillColor;
            this.ctx.fill();
            this.ctx.strokeStyle = handleStrokeColor;
            this.ctx.lineWidth = 2 / this.viewport.zoom;
            this.ctx.stroke();
        }
        
        // Draw the anchor point (larger and more visible)
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, pointRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = pointColor;
        this.ctx.fill();
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 1 / this.viewport.zoom;
        this.ctx.stroke();
        
        this.ctx.restore();
    }
    
    /**
     * Request a render using requestAnimationFrame (throttled)
     * Optimized for smooth dragging - only one render per frame
     */
    requestRender() {
        if (this.animationFrameId === null) {
            this.animationFrameId = requestAnimationFrame(() => {
                this.animationFrameId = null;
                this.render();
            });
        }
    }
    
    /**
     * Render grid in screen space (constant visual size regardless of zoom)
     * Always covers the full canvas area from (0,0) to (width, height)
     */
    renderGrid() {
        // Use base grid size (no zoom multiplication) for constant visual size
        const gridSize = this.gridSize;
        const dpr = window.devicePixelRatio || 1;

        // Use CSS dimensions for grid rendering
        const width = this.cssWidth || this.canvas.width / dpr;
        const height = this.cssHeight || this.canvas.height / dpr;

        this.ctx.save();
        // Reset transform but apply DPR scaling for crisp rendering
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.ctx.strokeStyle = '#e0e0e0';
        this.ctx.lineWidth = 0.5;

        // Calculate grid offset based on viewport pan (for visual alignment)
        const offsetX = this.viewport.x % gridSize;
        const offsetY = this.viewport.y % gridSize;

        // Normalize offsets to be within [0, gridSize) range
        const normalizedOffsetX = offsetX < 0 ? offsetX + gridSize : offsetX;
        const normalizedOffsetY = offsetY < 0 ? offsetY + gridSize : offsetY;

        // Start from the first grid line that's at or before the canvas edge
        const startX = normalizedOffsetX - gridSize;
        const startY = normalizedOffsetY - gridSize;

        // Draw vertical lines - always cover full canvas height (0 to height)
        for (let x = startX; x <= width + gridSize; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
            this.ctx.stroke();
        }

        // Draw horizontal lines - always cover full canvas width (0 to width)
        for (let y = startY; y <= height + gridSize; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
        }

        this.ctx.restore();

        if (this.showGrid) {
            this.renderRulers();
        }
    }

    /**
     * Render rulers (top and left) in mm.
     */
    renderRulers() {
        const dpr = window.devicePixelRatio || 1;
        const width = this.cssWidth || this.canvas.width / dpr;
        const height = this.cssHeight || this.canvas.height / dpr;
        const rulerSize = 24;
        const majorStep = 10;
        const minorStep = 1;

        this.ctx.save();
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.ctx.fillStyle = 'rgba(255,255,255,0.9)';
        this.ctx.fillRect(0, 0, width, rulerSize);
        this.ctx.fillRect(0, 0, rulerSize, height);

        this.ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        this.ctx.lineWidth = 1;

        const worldLeft = this.screenToWorld(0, 0).x;
        const worldRight = this.screenToWorld(width, 0).x;
        const worldTop = this.screenToWorld(0, 0).y;
        const worldBottom = this.screenToWorld(0, height).y;

        const startX = Math.floor(worldLeft / minorStep) * minorStep;
        for (let x = startX; x <= worldRight; x += minorStep) {
            const screenX = this.worldToScreen(x, 0).x;
            const isMajor = Math.abs(x % majorStep) < 0.0001;
            const tick = isMajor ? 10 : 5;
            this.ctx.beginPath();
            this.ctx.moveTo(screenX, rulerSize);
            this.ctx.lineTo(screenX, rulerSize - tick);
            this.ctx.stroke();
            if (isMajor) {
                this.ctx.fillStyle = '#444';
                this.ctx.font = '10px sans-serif';
                this.ctx.textAlign = 'left';
                this.ctx.textBaseline = 'top';
                this.ctx.fillText(x.toFixed(0), screenX + 2, 2);
            }
        }

        const startY = Math.floor(worldTop / minorStep) * minorStep;
        for (let y = startY; y <= worldBottom; y += minorStep) {
            const screenY = this.worldToScreen(0, y).y;
            const isMajor = Math.abs(y % majorStep) < 0.0001;
            const tick = isMajor ? 10 : 5;
            this.ctx.beginPath();
            this.ctx.moveTo(rulerSize, screenY);
            this.ctx.lineTo(rulerSize - tick, screenY);
            this.ctx.stroke();
            if (isMajor) {
                this.ctx.save();
                this.ctx.translate(2, screenY + 2);
                this.ctx.rotate(-Math.PI / 2);
                this.ctx.fillStyle = '#444';
                this.ctx.font = '10px sans-serif';
                this.ctx.textAlign = 'left';
                this.ctx.textBaseline = 'top';
                this.ctx.fillText(y.toFixed(0), 0, 0);
                this.ctx.restore();
            }
        }

        this.ctx.restore();
    }
    
    /**
     * Render all shapes
     * Optimized: during drag, render shapes directly without binding resolution
     */
    renderShapes() {
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 0.8;

        // During interactive drags, render shapes directly for maximum performance
        // This avoids expensive binding resolution and cloning on every frame.
        const isInteractiveDrag = (
            (this.isDragging && this.dragStart && this.dragStart.shapeId) ||
            this.isResizing ||
            this.isRotating ||
            this.isDraggingHandle ||
            this.isDraggingJoineryHandle ||
            this.isDrawingHandleDrag ||
            this.isDrawingAnchorDrag
        );

        const drawShape = (shape) => {
            const rotation = Number(shape.rotation || 0);
            if (rotation && typeof shape.getBounds === 'function') {
                const bounds = shape.getBounds();
                if (bounds) {
                    const cx = bounds.x + bounds.width / 2;
                    const cy = bounds.y + bounds.height / 2;
                    this.ctx.save();
                    this.ctx.translate(cx, cy);
                    this.ctx.rotate((rotation * Math.PI) / 180);
                    this.ctx.translate(-cx, -cy);
                    shape.render(this.ctx);
                    this.ctx.restore();
                    return;
                }
            }
            this.ctx.save();
            shape.render(this.ctx);
            this.ctx.restore();
        };

        if (isInteractiveDrag) {
            const shapes = this.sceneState.shapeStore.getAll();
            shapes.forEach(drawShape);
        } else {
            // Normal rendering with binding resolution
            const resolvedShapes = this.sceneState.shapeStore.getResolved();
            resolvedShapes.forEach(drawShape);
        }
    }

    /**
     * Execute drawing logic with a rotation applied around bounds center.
     * Always restores the context to avoid leaking transforms or styles.
     * @param {{x:number,y:number,width:number,height:number}} bounds
     * @param {number} rotation
     * @param {Function} drawFn
     */
    withShapeRotation(bounds, rotation, drawFn) {
        const rotationDeg = Number(rotation || 0);
        this.ctx.save();
        if (rotationDeg && bounds) {
            const cx = bounds.x + bounds.width / 2;
            const cy = bounds.y + bounds.height / 2;
            this.ctx.translate(cx, cy);
            this.ctx.rotate((rotationDeg * Math.PI) / 180);
            this.ctx.translate(-cx, -cy);
        }
        drawFn();
        this.ctx.restore();
    }

    /**
     * Render finger joint previews for edges with joinery metadata
     */
    renderEdgeJoinery() {
        const shapeStore = this.sceneState.shapeStore;
        if (!shapeStore || !shapeStore.edgeJoinery || shapeStore.edgeJoinery.size === 0) {
            this.joineryHandles = [];
            return;
        }

        const edges = shapeStore.getEdgesForAllShapes ? shapeStore.getEdgesForAllShapes() : [];
        if (!edges.length) {
            this.joineryHandles = [];
            return;
        }

        // Clear handles before rebuilding
        this.joineryHandles = [];

        edges.forEach(edge => {
            const joinery = shapeStore.getEdgeJoinery(edge);
            if (!joinery) return;
            if (!edge.isLinear || !edge.isLinear()) return;

            let bounds = null;
            if (edge.shapeId) {
                const shape = shapeStore.get(edge.shapeId);
                if (shape) {
                    const resolved = this.bindingResolver.resolveShape(shape);
                    if (resolved && typeof resolved.getBounds === 'function') {
                        bounds = resolved.getBounds();
                    }
                }
            }

            this.renderFingerJoinery(edge, joinery, bounds);
        });
    }

    /**
     * Render a finger joint preview on a linear edge
     * @param {import('../geometry/edge/index.js').Edge} edge
     * @param {{type: string, thicknessMm: number, fingerCount: number, align?: string}} joinery
     */
    renderFingerJoinery(edge, joinery, bounds) {
        const p1 = edge.anchor1?.position;
        const p2 = edge.anchor2?.position;
        if (!p1 || !p2) return;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.hypot(dx, dy);
        if (length < 0.001) return;

        const ux = dx / length;
        const uy = dy / length;
        let nx = -uy;
        let ny = ux;

        if (bounds) {
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const cx = bounds.x + bounds.width / 2;
            const cy = bounds.y + bounds.height / 2;
            const vx = midX - cx;
            const vy = midY - cy;
            if (vx * nx + vy * ny < 0) {
                nx = -nx;
                ny = -ny;
            }
        }

        // Support old 'finger_male', 'male', and new 'finger_joint' type
        const joineryType = String(joinery.type || '').toLowerCase();
        const isFingerJoint = joineryType === 'finger_joint' || joineryType === 'male' || joineryType === 'finger_male';
        const isDovetail = joineryType === 'dovetail';
        const direction = 1;

        const thicknessMm = Number(joinery.thicknessMm);
        const baseDepth = Math.min(Math.max(thicknessMm || 0, 0.5), length * 0.45);
        const depth = isDovetail
            ? Math.min(baseDepth * 1.6, length * 0.6)
            : baseDepth;
        const preferredWidth = Math.max(depth * 2, 4);
        const requestedCount = Number(joinery.fingerCount);
        const count = Number.isFinite(requestedCount) && requestedCount >= 2
            ? Math.floor(requestedCount)
            : Math.max(2, Math.floor(length / preferredWidth));
        const toothWidth = length / count;

        const strokeColor = '#f97316';
        const fillColor = 'rgba(249, 115, 22, 0.25)';

        // Alignment: left = first tooth at start, right = first tooth at end
        const align = joinery.align || 'left';
        // For right alignment, we start at index 1 instead of 0
        const startIndex = align === 'right' ? 1 : 0;

        const dovetailTaper = Math.min(depth * 0.2, toothWidth * 0.2);
        const taper = isDovetail ? dovetailTaper : 0;

        for (let i = startIndex; i < count; i += 2) {
            const start = i * toothWidth;
            const end = start + toothWidth;

            const sx = p1.x + ux * start;
            const sy = p1.y + uy * start;
            const ex = p1.x + ux * end;
            const ey = p1.y + uy * end;
            const ox = nx * depth * direction;
            const oy = ny * depth * direction;

            this.ctx.save();
            this.ctx.lineWidth = 1 / this.viewport.zoom;
            this.ctx.strokeStyle = strokeColor;
            this.ctx.fillStyle = fillColor;
            this.ctx.beginPath();
            if (isDovetail) {
                // Trapezoid with tapered sides
                const topStartX = sx + ox - ux * taper;
                const topStartY = sy + oy - uy * taper;
                const topEndX = ex + ox + ux * taper;
                const topEndY = ey + oy + uy * taper;
                this.ctx.moveTo(sx, sy);
                this.ctx.lineTo(ex, ey);
                this.ctx.lineTo(topEndX, topEndY);
                this.ctx.lineTo(topStartX, topStartY);
            } else {
                // Rectangle (finger joint)
                this.ctx.moveTo(sx, sy);
                this.ctx.lineTo(ex, ey);
                this.ctx.lineTo(ex + ox, ey + oy);
                this.ctx.lineTo(sx + ox, sy + oy);
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.restore();
        }

        // Render and store interactive handles
        this.renderJoineryHandles(edge, joinery, p1, p2, ux, uy, nx, ny, depth, direction, length, toothWidth, startIndex, count);
    }

    /**
     * Render interactive handles for adjusting joinery on canvas (bounding box style)
     * Only shows when the shape is selected
     */
    renderJoineryHandles(edge, joinery, p1, p2, ux, uy, nx, ny, depth, direction, length, toothWidth, startIndex, count) {
        // Only show handles if the shape is selected
        if (!edge.shapeId || !this.selectedShapeIds.has(edge.shapeId)) {
            return;
        }

        const handleSize = 8 / this.viewport.zoom;
        const bracketLen = 12 / this.viewport.zoom;
        const lineWidth = 2 / this.viewport.zoom;
        
        const isHoveredDepth = this.hoveredJoineryHandle?.edge === edge && this.hoveredJoineryHandle?.type === 'depth';
        const isHoveredAlign = this.hoveredJoineryHandle?.edge === edge && this.hoveredJoineryHandle?.type === 'align';
        const isDraggingThis = this.isDraggingJoineryHandle && this.joineryDragStart?.edge === edge;

        // Depth handle: bracket at the middle of the edge, on the outer edge of fingers
        const midPoint = length / 2;
        const depthHandleX = p1.x + ux * midPoint + nx * depth * direction;
        const depthHandleY = p1.y + uy * midPoint + ny * depth * direction;

        // Align toggle: small bracket at edge start
        const alignHandleX = p1.x + ux * (handleSize * 2) + nx * depth * direction * 0.5;
        const alignHandleY = p1.y + uy * (handleSize * 2) + ny * depth * direction * 0.5;

        // Store handles for hit testing
        this.joineryHandles.push({
            edge,
            joinery,
            type: 'depth',
            x: depthHandleX,
            y: depthHandleY,
            radius: handleSize * 2,
            nx, ny, direction, p1, p2, ux, uy, length
        });

        // Align handle removed per UX request (avoid "L" bubble)

        // Draw depth handle - bracket style (like bounding box)
        const handleColor = (isHoveredDepth || isDraggingThis) ? '#f97316' : '#3b82f6';
        this.ctx.save();
        this.ctx.strokeStyle = handleColor;
        this.ctx.lineWidth = lineWidth;
        this.ctx.lineCap = 'square';
        
        // Draw a small outward-pointing arrow/bracket
        const arrowLen = bracketLen;
        const arrowX = nx * direction;
        const arrowY = ny * direction;
        
        this.ctx.beginPath();
        // Horizontal line
        this.ctx.moveTo(depthHandleX - ux * arrowLen/2, depthHandleY - uy * arrowLen/2);
        this.ctx.lineTo(depthHandleX + ux * arrowLen/2, depthHandleY + uy * arrowLen/2);
        // Arrow head pointing outward
        this.ctx.moveTo(depthHandleX, depthHandleY);
        this.ctx.lineTo(depthHandleX + arrowX * handleSize, depthHandleY + arrowY * handleSize);
        this.ctx.stroke();
        
        // Small square handle
        this.ctx.fillStyle = handleColor;
        this.ctx.fillRect(
            depthHandleX - handleSize/2, 
            depthHandleY - handleSize/2, 
            handleSize, 
            handleSize
        );
        this.ctx.restore();

        // Alignment toggle UI removed
    }
    
    /**
     * Render selection indicator (multi-selection support)
     * Optimized: during drag, use shape directly without binding resolution
     */
    renderSelection() {
        const selectedIds = this.selectedShapeIds.size > 0 
            ? Array.from(this.selectedShapeIds) 
            : (this.selectedShapeId ? [this.selectedShapeId] : []);
        
        selectedIds.forEach(shapeId => {
            const shape = this.sceneState.shapeStore.get(shapeId);
            if (!shape) return;

            // During drag, use shape directly for smooth rendering
            const isActiveDrag = this.isDragging && this.dragStart && this.dragStart.shapeId === shapeId;
            const isActiveResize = this.isResizing && this.resizeState && this.resizeState.shapeId === shapeId;
            const shapeForBounds = (isActiveDrag || isActiveResize)
                ? shape
                : this.bindingResolver.resolveShape(shape);
            const bounds = shapeForBounds.getBounds();

            if (shapeForBounds.type === 'line' && typeof shapeForBounds.toGeometryPath === 'function') {
                const path = shapeForBounds.toGeometryPath();
                this.ctx.save();
                this.ctx.beginPath();
                path.toCanvasPath(this.ctx);
                this.ctx.strokeStyle = '#2aa3ff';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();

                const r = 5 / this.viewport.zoom;
                const midX = (shapeForBounds.x1 + shapeForBounds.x2) / 2;
                const midY = (shapeForBounds.y1 + shapeForBounds.y2) / 2;
                this.ctx.fillStyle = '#fff';
                this.ctx.strokeStyle = '#2aa3ff';
                this.ctx.lineWidth = 2 / this.viewport.zoom;

                this.ctx.beginPath();
                this.ctx.arc(shapeForBounds.x1, shapeForBounds.y1, r, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();

                this.ctx.beginPath();
                this.ctx.arc(shapeForBounds.x2, shapeForBounds.y2, r, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();

                this.ctx.beginPath();
                this.ctx.arc(midX, midY, r * 0.8, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
                this.ctx.restore();
                return;
            }

            // Draw selection fill for closed shapes (no fill for open shapes)
            if (this.isClosedShape(shapeForBounds) && typeof shapeForBounds.toGeometryPath === 'function') {
                const path = shapeForBounds.toGeometryPath();
                const rotation = Number(shape.rotation || shapeForBounds.rotation || 0);
                this.withShapeRotation(bounds, rotation, () => {
                    this.ctx.beginPath();
                    path.toCanvasPath(this.ctx);
                    this.ctx.fillStyle = 'rgba(0, 153, 255, 0.08)';
                    this.ctx.fill('evenodd');
                });
            }

            const rotation = Number(shape.rotation || 0);
            // Draw selection brackets + dimensions
            this.renderSelectionBrackets(bounds);
            this.renderSelectionDimensions(bounds);
            // Rotation handle
            this.renderRotationHandle(bounds, rotation);

            // Render path handles for selected path shapes
            if (shape.type === 'path') {
                this.renderPathHandles(shape);
            }
        });

        // Render edge selection highlights
        this.renderEdgeSelection();
        
        // Render shape hover highlight
        this.renderShapeHover();
    }

    /**
     * Render hover highlight for shapes when hovering over their edges in shape mode
     */
    renderShapeHover() {
        const shapeStore = this.sceneState.shapeStore;
        if (shapeStore.getSelectionMode() !== 'shape') return;
        
        const hoveredShapeId = shapeStore.getHoveredShapeId();
        if (!hoveredShapeId) return;
        
        const shape = shapeStore.get(hoveredShapeId);
        if (!shape) return;
        
        // Don't highlight if already selected
        if (this.selectedShapeIds.has(hoveredShapeId) || this.selectedShapeId === hoveredShapeId) {
            return;
        }
        
        const resolved = this.bindingResolver.resolveShape(shape);
        const bounds = resolved.getBounds();
        
        const rotation = Number(shape.rotation || resolved.rotation || 0);
        this.withShapeRotation(bounds, rotation, () => {
            // Draw hover fill for closed shapes
            if (this.isClosedShape(resolved) && typeof resolved.toGeometryPath === 'function') {
                const path = resolved.toGeometryPath();
                this.ctx.beginPath();
                path.toCanvasPath(this.ctx);
                this.ctx.fillStyle = 'rgba(0, 153, 255, 0.12)';
                this.ctx.fill('evenodd');
            }

            // Draw hover outline
            this.ctx.strokeStyle = '#0099ff';
            this.ctx.lineWidth = 2 / this.viewport.zoom;
            this.ctx.setLineDash([]);

            if (resolved.type === 'circle' && typeof resolved.toGeometryPath === 'function') {
                const path = resolved.toGeometryPath();
                this.ctx.beginPath();
                path.toCanvasPath(this.ctx);
                this.ctx.stroke();
            } else if (resolved.type === 'rectangle') {
                this.ctx.strokeRect(resolved.x, resolved.y, resolved.width, resolved.height);
            } else if (typeof resolved.toGeometryPath === 'function') {
                const path = resolved.toGeometryPath();
                this.ctx.beginPath();
                path.toCanvasPath(this.ctx);
                this.ctx.stroke();
            } else {
                // Fallback to bounding box
                this.ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
            }
        });
    }

    /**
     * Render edge selection and hover highlights
     */
    renderEdgeSelection() {
        const shapeStore = this.sceneState.shapeStore;
        const selectionMode = shapeStore.getSelectionMode();

        // Only render edge highlights in edge selection mode
        if (selectionMode !== 'edge') return;

        // Render selected edges
        const selectedEdges = shapeStore.getSelectedEdges();
        selectedEdges.forEach(edge => {
            renderEdgeSelected(this.ctx, edge, {
                selectColor: '#ff6600',
                selectWidth: 3 / this.viewport.zoom
            });
        });

        // Render hovered edge
        if (this.hoveredEdge) {
            renderEdgeHover(this.ctx, this.hoveredEdge, {
                hoverColor: '#0099ff',
                hoverWidth: 4 / this.viewport.zoom
            });

            // Render the hover point
            if (this.hoveredEdgePosition) {
                renderPointOnEdge(this.ctx, this.hoveredEdgePosition, {
                    radius: 6 / this.viewport.zoom,
                    fillColor: '#0099ff',
                    strokeColor: '#ffffff',
                    strokeWidth: 2 / this.viewport.zoom
                });
            }
        }
    }

    /**
     * Draw corner brackets for selection outline.
     */
    renderSelectionBrackets(bounds) {
        const padding = 4;
        const x = bounds.x - padding;
        const y = bounds.y - padding;
        const w = bounds.width + padding * 2;
        const h = bounds.height + padding * 2;
        const len = Math.min(16, Math.max(8, Math.min(w, h) * 0.12));

        this.ctx.save();
        this.ctx.strokeStyle = '#2aa3ff';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([]);

        // Top-left
        this.ctx.beginPath();
        this.ctx.moveTo(x, y + len);
        this.ctx.lineTo(x, y);
        this.ctx.lineTo(x + len, y);
        this.ctx.stroke();

        // Top-right
        this.ctx.beginPath();
        this.ctx.moveTo(x + w - len, y);
        this.ctx.lineTo(x + w, y);
        this.ctx.lineTo(x + w, y + len);
        this.ctx.stroke();

        // Bottom-right
        this.ctx.beginPath();
        this.ctx.moveTo(x + w, y + h - len);
        this.ctx.lineTo(x + w, y + h);
        this.ctx.lineTo(x + w - len, y + h);
        this.ctx.stroke();

        // Bottom-left
        this.ctx.beginPath();
        this.ctx.moveTo(x + len, y + h);
        this.ctx.lineTo(x, y + h);
        this.ctx.lineTo(x, y + h - len);
        this.ctx.stroke();

        this.ctx.restore();
    }

    getRotationHandlePosition(bounds, rotation = 0) {
        const padding = 4;
        const x = bounds.x - padding;
        const y = bounds.y - padding;
        const w = bounds.width + padding * 2;
        const cx = x + w / 2;
        const cy = y + (bounds.height + padding * 2) / 2;
        const handleOffset = 24 / this.viewport.zoom;
        const baseX = cx;
        const baseY = y - handleOffset;

        if (!rotation) {
            return { x: baseX, y: baseY, cx, cy };
        }

        const rad = (rotation * Math.PI) / 180;
        const dx = baseX - cx;
        const dy = baseY - cy;
        const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
        return { x: cx + rx, y: cy + ry, cx, cy };
    }

    renderRotationHandle(bounds, rotation = 0) {
        const { x, y, cx, cy } = this.getRotationHandlePosition(bounds, rotation);
        const radius = 6 / this.viewport.zoom;

        this.ctx.save();
        this.ctx.strokeStyle = '#2aa3ff';
        this.ctx.fillStyle = '#ffffff';
        this.ctx.lineWidth = 2 / this.viewport.zoom;

        // Line from center to handle
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy);
        this.ctx.lineTo(x, y);
        this.ctx.stroke();

        // Handle circle
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.restore();
    }

    hitTestRotationHandle(worldX, worldY) {
        if (this.selectedShapeIds.size !== 1) return null;
        const shapeId = Array.from(this.selectedShapeIds)[0];
        const shape = this.sceneState.shapeStore.get(shapeId);
        if (!shape) return null;
        const resolved = this.bindingResolver.resolveShape(shape);
        if (!resolved || typeof resolved.getBounds !== 'function') return null;

        const bounds = resolved.getBounds();
        const rotation = Number(shape.rotation || 0);
        const handlePos = this.getRotationHandlePosition(bounds, rotation);
        const radius = 8 / this.viewport.zoom;
        const dx = worldX - handlePos.x;
        const dy = worldY - handlePos.y;
        if (dx * dx + dy * dy <= radius * radius) {
            return { shapeId, center: { x: handlePos.cx, y: handlePos.cy } };
        }
        return null;
    }

    getResizeHandlePositions(bounds) {
        const padding = 4;
        const x = bounds.x - padding;
        const y = bounds.y - padding;
        const w = bounds.width + padding * 2;
        const h = bounds.height + padding * 2;
        return [
            { name: 'nw', x, y },
            { name: 'ne', x: x + w, y },
            { name: 'se', x: x + w, y: y + h },
            { name: 'sw', x, y: y + h }
        ];
    }

    getResizeCursor(handleName) {
        if (handleName === 'nw' || handleName === 'se') return 'nwse-resize';
        return 'nesw-resize';
    }

    hitTestResizeHandle(worldX, worldY) {
        if (this.selectedShapeIds.size !== 1) return null;
        const shapeId = Array.from(this.selectedShapeIds)[0];
        const shape = this.sceneState.shapeStore.get(shapeId);
        if (!shape || shape.type === 'line') return null;

        const strategy = getResizeStrategy(shape);
        if (!strategy) return null;

        const resolved = this.bindingResolver.resolveShape(shape);
        if (!resolved || typeof resolved.getBounds !== 'function') return null;

        const bounds = resolved.getBounds();
        if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return null;

        const handles = this.getResizeHandlePositions(bounds);
        const hitSize = 10 / this.viewport.zoom;
        for (const handle of handles) {
            if (Math.abs(worldX - handle.x) <= hitSize && Math.abs(worldY - handle.y) <= hitSize) {
                return { shapeId, handle: handle.name, bounds, strategy };
            }
        }
        return null;
    }

    computeResizedBounds(startBounds, handle, worldPos) {
        const minSize = 1;
        const left = startBounds.x;
        const top = startBounds.y;
        const right = startBounds.x + startBounds.width;
        const bottom = startBounds.y + startBounds.height;

        let newLeft = left;
        let newTop = top;
        let newRight = right;
        let newBottom = bottom;

        switch (handle) {
            case 'nw':
                newLeft = Math.min(worldPos.x, right - minSize);
                newTop = Math.min(worldPos.y, bottom - minSize);
                break;
            case 'ne':
                newRight = Math.max(worldPos.x, left + minSize);
                newTop = Math.min(worldPos.y, bottom - minSize);
                break;
            case 'se':
                newRight = Math.max(worldPos.x, left + minSize);
                newBottom = Math.max(worldPos.y, top + minSize);
                break;
            case 'sw':
                newLeft = Math.min(worldPos.x, right - minSize);
                newBottom = Math.max(worldPos.y, top + minSize);
                break;
            default:
                break;
        }

        return {
            x: newLeft,
            y: newTop,
            width: newRight - newLeft,
            height: newBottom - newTop
        };
    }

    updateBindingsForProperties(shape, properties) {
        if (!shape || !Array.isArray(properties)) return;
        properties.forEach((property) => {
            if (shape[property] === undefined) return;
            const binding = shape.getBinding(property);
            if (!binding) {
                shape.setBinding(property, new LiteralBinding(shape[property]));
            } else if (binding.type === 'literal') {
                binding.value = shape[property];
            }
        });
    }

    /**
     * Check if a shape is closed for selection fill.
     */
    isClosedShape(shape) {
        if (!shape) return false;
        const t = String(shape.type || '').toLowerCase();
        // Closed primitives
        if ([
            'circle',
            'rectangle',
            'polygon',
            'star',
            'triangle',
            'ellipse',
            'roundedrectangle',
            'donut',
            'cross',
            'gear',
            'slot',
            'arrow',
            'chamferrectangle'
        ].includes(t)) return true;
        if (t === 'path') return Boolean(shape.closed);
        return false;
    }

    /**
     * Render width/height dimension labels for selection.
     */
    renderSelectionDimensions(bounds) {
        const padding = 8;
        const x = bounds.x - padding;
        const y = bounds.y - padding;
        const w = bounds.width + padding * 2;
        const h = bounds.height + padding * 2;

        const fontSize = 12 / this.viewport.zoom;
        const textColor = '#2aa3ff';
        const lineColor = '#2aa3ff';
        const textPadding = 4 / this.viewport.zoom;
        const fmt = (v) => `${v.toFixed(2)} mm`;

        const widthText = fmt(bounds.width);
        const heightText = fmt(bounds.height);

        this.ctx.save();
        this.ctx.strokeStyle = lineColor;
        this.ctx.fillStyle = textColor;
        this.ctx.lineWidth = 1.5 / this.viewport.zoom;
        this.ctx.font = `${fontSize}px sans-serif`;
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = 'center';

        // Horizontal dimension (bottom)
        const bottomY = y + h + 10 / this.viewport.zoom;
        this.ctx.beginPath();
        this.ctx.moveTo(x, bottomY);
        this.ctx.lineTo(x + w, bottomY);
        this.ctx.stroke();

        // End ticks
        this.ctx.beginPath();
        this.ctx.moveTo(x, bottomY - 4 / this.viewport.zoom);
        this.ctx.lineTo(x, bottomY + 4 / this.viewport.zoom);
        this.ctx.moveTo(x + w, bottomY - 4 / this.viewport.zoom);
        this.ctx.lineTo(x + w, bottomY + 4 / this.viewport.zoom);
        this.ctx.stroke();

        // Width label with background
        const textX = x + w / 2;
        const textY = bottomY + 12 / this.viewport.zoom;
        const textWidth = this.ctx.measureText(widthText).width + textPadding * 2;
        const textHeight = fontSize + textPadding * 2;
        this.ctx.fillStyle = 'rgba(255,255,255,0.9)';
        this.ctx.fillRect(textX - textWidth / 2, textY - textHeight / 2, textWidth, textHeight);
        this.ctx.fillStyle = textColor;
        this.ctx.fillText(widthText, textX, textY);

        // Vertical dimension (right)
        const rightX = x + w + 10 / this.viewport.zoom;
        this.ctx.beginPath();
        this.ctx.moveTo(rightX, y);
        this.ctx.lineTo(rightX, y + h);
        this.ctx.stroke();

        // End ticks
        this.ctx.beginPath();
        this.ctx.moveTo(rightX - 4 / this.viewport.zoom, y);
        this.ctx.lineTo(rightX + 4 / this.viewport.zoom, y);
        this.ctx.moveTo(rightX - 4 / this.viewport.zoom, y + h);
        this.ctx.lineTo(rightX + 4 / this.viewport.zoom, y + h);
        this.ctx.stroke();

        // Height label (rotated)
        const hTextX = rightX + 12 / this.viewport.zoom;
        const hTextY = y + h / 2;
        const hTextWidth = this.ctx.measureText(heightText).width + textPadding * 2;
        const hTextHeight = fontSize + textPadding * 2;
        this.ctx.save();
        this.ctx.translate(hTextX, hTextY);
        this.ctx.rotate(Math.PI / 2);
        this.ctx.fillStyle = 'rgba(255,255,255,0.9)';
        this.ctx.fillRect(-hTextWidth / 2, -hTextHeight / 2, hTextWidth, hTextHeight);
        this.ctx.fillStyle = textColor;
        this.ctx.fillText(heightText, 0, 0);
        this.ctx.restore();

        this.ctx.restore();
    }

    /**
     * Render bezier handles for a path shape (for curved segments).
     */
    renderPathHandles(shape) {
        if (!shape.points || shape.points.length < 2) return;
        const handleRadius = 5 / this.viewport.zoom;
        this.ctx.save();
        this.ctx.lineWidth = 1.5 / this.viewport.zoom;
        this.ctx.strokeStyle = '#2196F3';
        this.ctx.fillStyle = '#fff';

        for (let i = 0; i < shape.points.length; i += 1) {
            const handles = shape.getHandles(i);
            if (!handles.handleIn && !handles.handleOut) continue;
            const point = shape.points[i];

            if (handles.handleOut) {
                const hx = point.x + handles.handleOut.x;
                const hy = point.y + handles.handleOut.y;
                this.ctx.beginPath();
                this.ctx.moveTo(point.x, point.y);
                this.ctx.lineTo(hx, hy);
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.arc(hx, hy, handleRadius, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
            }

            if (handles.handleIn) {
                const hx = point.x + handles.handleIn.x;
                const hy = point.y + handles.handleIn.y;
                this.ctx.beginPath();
                this.ctx.moveTo(point.x, point.y);
                this.ctx.lineTo(hx, hy);
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.arc(hx, hy, handleRadius, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
            }
        }

        this.ctx.restore();
    }
    
    /**
     * Render selection rectangle (for multi-select)
     */
    renderSelectionRect() {
        if (!this.selectionRect) return;
        
        this.ctx.strokeStyle = '#0066b2';
        this.ctx.fillStyle = 'rgba(0, 102, 178, 0.1)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.fillRect(this.selectionRect.x, this.selectionRect.y, this.selectionRect.width, this.selectionRect.height);
        this.ctx.strokeRect(this.selectionRect.x, this.selectionRect.y, this.selectionRect.width, this.selectionRect.height);
        this.ctx.setLineDash([]);
    }
    
    /**
     * Render drag preview
     * @param {Object} shapeType
     * @param {number} x
     * @param {number} y
     */
    renderDragPreview(shapeType, x, y) {
        this.ctx.strokeStyle = '#007acc';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.globalAlpha = 0.5;
        
        // Draw preview based on shape type
        if (shapeType === 'circle') {
            const path = GeoPath.circle(new GeoVec(x, y), 50);
            this.ctx.beginPath();
            path.toCanvasPath(this.ctx);
            this.ctx.stroke();
        } else if (shapeType === 'line') {
            this.ctx.strokeStyle = '#2aa3ff';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(x - 40, y);
            this.ctx.lineTo(x + 40, y);
            this.ctx.stroke();
        } else if (shapeType === 'rectangle') {
            const path = GeoPath.rect(x - 50, y - 50, 100, 100);
            this.ctx.beginPath();
            path.toCanvasPath(this.ctx);
            this.ctx.stroke();
        } else if (shapeType === 'polygon') {
            // Create polygon preview (5 sides, radius 50)
            const points = [];
            const sides = 5;
            const radius = 50;
            const angleStep = (2 * Math.PI) / sides;
            const startAngle = -Math.PI / 2;
            for (let i = 0; i < sides; i++) {
                const angle = startAngle + i * angleStep;
                points.push(new GeoVec(x + radius * Math.cos(angle), y + radius * Math.sin(angle)));
            }
            const path = GeoPath.fromPoints(points, true);
            this.ctx.beginPath();
            path.toCanvasPath(this.ctx);
            this.ctx.stroke();
        } else if (shapeType === 'star') {
            // Create star preview (5 points, outer radius 50, inner radius 25)
            const points = [];
            const numPoints = 5;
            const outerRadius = 50;
            const innerRadius = 25;
            const angleStep = (2 * Math.PI) / numPoints;
            const startAngle = -Math.PI / 2;
            for (let i = 0; i < numPoints * 2; i++) {
                const angle = startAngle + (i * angleStep) / 2;
                const radius = i % 2 === 0 ? outerRadius : innerRadius;
                points.push(new GeoVec(x + radius * Math.cos(angle), y + radius * Math.sin(angle)));
            }
            const path = GeoPath.fromPoints(points, true);
            this.ctx.beginPath();
            path.toCanvasPath(this.ctx);
            this.ctx.stroke();
        }
        
        this.ctx.globalAlpha = 1.0;
        this.ctx.setLineDash([]);
    }

    /**
     * Render path drawing preview (open path).
     */
    renderPathDrawPreview() {
        const points = [...this.pathDrawPoints];
        const curveSegments = [...this.pathDrawCurveSegments];
        if (this.pathPreviewPos) {
            points.push({ x: this.pathPreviewPos.x, y: this.pathPreviewPos.y });
            // Pending segment can be curved via nextSegmentCurved
            curveSegments.push(this.nextSegmentCurved);
        }
        const path = PathShape.buildGeometryPath(
            points,
            false,
            curveSegments,
            false,
            this.pathDrawHandles
        );
        this.ctx.save();
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';
        this.ctx.setLineDash([]);
        this.ctx.beginPath();
        path.toCanvasPath(this.ctx);
        this.ctx.stroke();

        // Draw anchor points
        this.ctx.fillStyle = '#000';
        points.forEach((p, i) => {
            // Highlight first point when there are 3+ points (can close path)
            if (i === 0 && this.pathDrawPoints.length >= 3) {
                // Draw a larger square with green color to indicate it can be clicked to close
                this.ctx.fillStyle = '#4CAF50'; // Green for "close path" indicator
                this.ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
                this.ctx.strokeStyle = '#2E7D32';
                this.ctx.lineWidth = 1.5;
                this.ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
                this.ctx.fillStyle = '#000'; // Reset for other points
            } else {
                this.ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
            }
        });
        
        // Visual indicator when next segment will be curved
        if (this.nextSegmentCurved && points.length > 1) {
            const lastPoint = points[points.length - 2] || points[0];
            this.ctx.strokeStyle = '#ff6600';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(lastPoint.x, lastPoint.y, 6, 0, Math.PI * 2);
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    /**
     * Render only the committed path (no pending segment).
     */
    renderPathDrawPreviewCommitted() {
        const points = [...this.pathDrawPoints];
        const curveSegments = [...this.pathDrawCurveSegments];
        if (points.length < 2) return;
        const path = PathShape.buildGeometryPath(
            points,
            false,
            curveSegments,
            false,
            this.pathDrawHandles
        );
        this.ctx.save();
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';
        this.ctx.setLineDash([]);
        this.ctx.beginPath();
        path.toCanvasPath(this.ctx);
        this.ctx.stroke();
        this.ctx.fillStyle = '#000';
        points.forEach((p, i) => {
            // Highlight first point when there are 3+ points (can close path)
            if (i === 0 && this.pathDrawPoints.length >= 3) {
                // Draw a larger square with green color to indicate it can be clicked to close
                this.ctx.fillStyle = '#4CAF50'; // Green for "close path" indicator
                this.ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
                this.ctx.strokeStyle = '#2E7D32';
                this.ctx.lineWidth = 1.5;
                this.ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
                this.ctx.fillStyle = '#000'; // Reset for other points
            } else {
                this.ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
            }
        });
        this.ctx.restore();
    }

    /**
     * Render bezier handles while drawing a path (only for curved segments).
     */
    renderPathDrawPreviewHandles() {
        const points = [...this.pathDrawPoints];
        const curveSegments = [...this.pathDrawCurveSegments];
        if (this.pathPreviewPos) {
            points.push({ x: this.pathPreviewPos.x, y: this.pathPreviewPos.y });
            curveSegments.push(this.nextSegmentCurved);
        }
        if (points.length < 2) return;

        const previewShape = new PathShape(
            'preview',
            { x: 0, y: 0 },
            points,
            2,
            false,
            curveSegments,
            false,
            this.pathDrawHandles
        );

        const handleRadius = 5 / this.viewport.zoom;
        this.ctx.save();
        this.ctx.lineWidth = 1.5 / this.viewport.zoom;
        this.ctx.strokeStyle = '#2196F3';
        this.ctx.fillStyle = '#fff';

        const showBothAtLast = (this.pathDrawCurvedEndIndex !== null || this.nextSegmentCurved) && points.length >= 2;
        const lastFixedIndex = this.pathDrawCurvedEndIndex !== null
            ? this.pathDrawCurvedEndIndex
            : Math.max(0, points.length - 2);
        const fixedHandleLength = 35 / this.viewport.zoom;
        for (let i = 0; i < points.length; i += 1) {
            if (showBothAtLast && i !== lastFixedIndex) {
                continue;
            }
            let handles = previewShape.getHandles(i);
            if (showBothAtLast && i === lastFixedIndex) {
                const point = points[i];
                let outDir = handles.handleOut;
                if (!outDir || (outDir.x === 0 && outDir.y === 0)) {
                    const prevPoint = points[i - 1] || points[i];
                    outDir = { x: point.x - prevPoint.x, y: point.y - prevPoint.y };
                }
                const outLen = Math.sqrt(outDir.x * outDir.x + outDir.y * outDir.y) || 1;
                const outNorm = { x: outDir.x / outLen, y: outDir.y / outLen };
                handles = {
                    handleOut: { x: outNorm.x * fixedHandleLength, y: outNorm.y * fixedHandleLength },
                    handleIn: { x: -outNorm.x * fixedHandleLength, y: -outNorm.y * fixedHandleLength }
                };
            }
            if (!handles.handleIn && !handles.handleOut) continue;
            const point = points[i];

            if (handles.handleOut) {
                const hx = point.x + handles.handleOut.x;
                const hy = point.y + handles.handleOut.y;
                this.ctx.beginPath();
                this.ctx.moveTo(point.x, point.y);
                this.ctx.lineTo(hx, hy);
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.arc(hx, hy, handleRadius, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
            }

            if (handles.handleIn) {
                const hx = point.x + handles.handleIn.x;
                const hy = point.y + handles.handleIn.y;
                this.ctx.beginPath();
                this.ctx.moveTo(point.x, point.y);
                this.ctx.lineTo(hx, hy);
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.arc(hx, hy, handleRadius, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
            }
        }

        this.ctx.restore();
    }
    
    /**
     * Pan the viewport
     * @param {number} dx 
     * @param {number} dy 
     */
    pan(dx, dy) {
        this.viewport.x += dx;
        this.viewport.y += dy;
        this.render();
    }
    
    /**
     * Zoom the viewport
     * @param {number} factor - Zoom factor (e.g., 1.1 for zoom in, 0.9 for zoom out)
     * @param {number} centerX - Screen X coordinate for zoom center
     * @param {number} centerY - Screen Y coordinate for zoom center
     */
    zoom(factor, centerX, centerY) {
        const worldPos = this.screenToWorld(centerX, centerY);
        const newZoom = Math.max(0.1, Math.min(5, this.viewport.zoom * factor));
        
        // Adjust viewport to keep world position at screen position
        this.viewport.x = centerX - worldPos.x * newZoom;
        this.viewport.y = centerY - worldPos.y * newZoom;
        this.viewport.zoom = newZoom;
        
        EventBus.emit(EVENTS.VIEWPORT_CHANGED, { viewport: this.viewport });
        this.render();
    }
    
    /**
     * Set snap strategy (Strategy Pattern)
     * @param {SnapStrategy} strategy 
     */
    setSnapStrategy(strategy) {
        this.snapStrategy = strategy;
    }
    
    /**
     * Toggle grid snap
     */
    toggleGridSnap() {
        if (this.snapStrategy instanceof GridSnap) {
            this.snapStrategy = new NoSnap();
        } else {
            this.snapStrategy = new GridSnap(this.gridSize);
        }
    }
    
    /**
     * Convert screen coordinates to world coordinates
     * @param {number} x 
     * @param {number} y 
     * @returns {Object} {x, y}
     */
    screenToWorld(x, y) {
        return {
            x: (x - this.viewport.x) / this.viewport.zoom,
            y: (y - this.viewport.y) / this.viewport.zoom
        };
    }
    
    /**
     * Convert world coordinates to screen coordinates
     * @param {number} x 
     * @param {number} y 
     * @returns {Object} {x, y}
     */
    worldToScreen(x, y) {
        return {
            x: x * this.viewport.zoom + this.viewport.x,
            y: y * this.viewport.zoom + this.viewport.y
        };
    }

    rotatePoint(x, y, cx, cy, degrees) {
        const rad = (degrees * Math.PI) / 180;
        const dx = x - cx;
        const dy = y - cy;
        const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
        return { x: cx + rx, y: cy + ry };
    }
    
    /**
     * Hit test - find shape at screen coordinates
     * @param {number} x 
     * @param {number} y 
     * @returns {Shape|null}
     */
    hitTest(x, y) {
        const worldPos = this.screenToWorld(x, y);
        const resolvedShapes = this.sceneState.shapeStore.getResolved();

        // Check shapes in reverse order (last drawn = top)
        for (let i = resolvedShapes.length - 1; i >= 0; i--) {
            const shape = resolvedShapes[i];
            const rotation = Number(shape.rotation || 0);
            let testX = worldPos.x;
            let testY = worldPos.y;
            if (rotation) {
                const bounds = shape.getBounds?.();
                if (bounds) {
                    const cx = bounds.x + bounds.width / 2;
                    const cy = bounds.y + bounds.height / 2;
                    const rotated = this.rotatePoint(testX, testY, cx, cy, -rotation);
                    testX = rotated.x;
                    testY = rotated.y;
                }
            }
            if (shape.containsPoint(testX, testY)) {
                return this.sceneState.shapeStore.get(shape.id);
            }
        }

        return null;
    }

    /**
     * Hit test for edges - find edge at screen coordinates
     * @param {number} x - Screen X coordinate
     * @param {number} y - Screen Y coordinate
     * @returns {{edge: import('../geometry/edge/index.js').Edge, position: import('../geometry/Vec.js').Vec, distance: number}|null}
     */
    hitTestEdge(x, y) {
        const worldPos = this.screenToWorld(x, y);
        const shapeStore = this.sceneState.shapeStore;

        // Get edges from selected shapes (or all shapes if none selected)
        let edges = [];
        if (this.selectedShapeIds.size > 0) {
            edges = shapeStore.getEdgesForSelectedShapes();
        } else if (shapeStore.getEdgesForAllShapes) {
            edges = shapeStore.getEdgesForAllShapes();
        } else {
            // Fallback: edges from all shapes
            const resolvedShapes = shapeStore.getResolved();
            resolvedShapes.forEach(shape => {
                if (shape.toGeometryPath) {
                    const path = shape.toGeometryPath();
                    edges.push(...edgesFromItem(path));
                }
            });
        }

        // Adjust tolerance based on zoom
        const tolerance = DEFAULT_HIT_DISTANCE / this.viewport.zoom;
        this.edgeHitTester.setEdges(edges);
        this.edgeHitTester.tolerance = tolerance;

        return this.edgeHitTester.test(worldPos);
    }

    /**
     * Update edge hover state based on mouse position
     * @param {number} x - Screen X coordinate
     * @param {number} y - Screen Y coordinate
     */
    updateEdgeHover(x, y) {
        const shapeStore = this.sceneState.shapeStore;
        const selectionMode = shapeStore.getSelectionMode();
        
        const hit = this.hitTestEdge(x, y);
        
        if (selectionMode === 'edge') {
            // In edge mode, set edge hover
            if (hit) {
                shapeStore.setHoveredEdge(hit.edge, hit.position);
            } else {
                shapeStore.setHoveredEdge(null);
            }
        } else if (selectionMode === 'shape') {
            if (hit) {
                // In shape mode, when hovering over an edge, find the shape and highlight it
                const worldPos = this.screenToWorld(x, y);
                const resolvedShapes = shapeStore.getResolved();
                let hoveredShapeId = null;
                
                // Find which shape this edge belongs to by checking all shapes
                // and seeing which one has an edge near the hit point
                const tolerance = DEFAULT_HIT_DISTANCE / this.viewport.zoom;
                for (const shape of resolvedShapes) {
                    if (shape.toGeometryPath) {
                        const path = shape.toGeometryPath();
                        const shapeEdges = edgesFromItem(path);
                        // Check if any edge from this shape is near the hit point
                        for (const edge of shapeEdges) {
                            const edgeResult = edge.closestPoint(worldPos);
                            if (edgeResult.distance <= tolerance) {
                                hoveredShapeId = shape.id;
                                break;
                            }
                        }
                        if (hoveredShapeId) break;
                    }
                }
                
                shapeStore.setHoveredShape(hoveredShapeId);
            } else {
                // Clear hover when not over an edge
                shapeStore.setHoveredShape(null);
            }
        }
    }


    /**
     * Handle edge click in edge selection mode
     * @param {number} x - Screen X coordinate
     * @param {number} y - Screen Y coordinate
     * @param {boolean} shiftKey - Whether shift key is pressed
     */
    handleEdgeClick(x, y, shiftKey) {
        const shapeStore = this.sceneState.shapeStore;
        const hit = this.hitTestEdge(x, y);

        if (hit) {
            if (shiftKey) {
                shapeStore.toggleEdgeSelection(hit.edge);
            } else {
                shapeStore.selectEdge(hit.edge);
            }
        } else if (!shiftKey) {
            shapeStore.clearEdgeSelection();
        }
    }

    /**
     * Handle mouse down event
     * @param {MouseEvent} e 
     */
    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Path drawing tool (open path)
        if (e.button === 0 && this.toolMode === 'path') {
            const worldPos = this.screenToWorld(x, y);
            const anchorHit = this.hitTestPathDrawAnchor(worldPos.x, worldPos.y);
            if (anchorHit) {
                this.isDrawingAnchorDrag = true;
                this.pathDrawAnchorIndex = anchorHit.pointIndex;
                this.canvas.style.cursor = 'move';
                this.requestRender();
                e.preventDefault();
                return;
            }
            const handleHit = this.hitTestPathDrawHandle(worldPos.x, worldPos.y);
            if (handleHit) {
                this.isDrawingHandleDrag = true;
                this.pathDrawHandleState = handleHit;
                this.canvas.style.cursor = 'move';
                this.requestRender();
                e.preventDefault();
                return;
            }
            // Skip if this is the second click of a double-click
            if (this.skipNextPathClick) {
                this.skipNextPathClick = false;
                e.preventDefault();
                return;
            }

            const now = Date.now();
            const isDoubleClick = this.lastPathClickPos && 
                (now - this.lastPathClickTime) < 400 &&
                Math.abs(worldPos.x - this.lastPathClickPos.x) < 10 &&
                Math.abs(worldPos.y - this.lastPathClickPos.y) < 10;
            
            if (isDoubleClick && this.isPathDrawing) {
                // Check if double-clicking on the first point to close the path
                if (this.pathDrawPoints.length >= 3) {
                    const firstPoint = this.pathDrawPoints[0];
                    const distanceToFirst = Math.sqrt(
                        Math.pow(worldPos.x - firstPoint.x, 2) + 
                        Math.pow(worldPos.y - firstPoint.y, 2)
                    );
                    const closeThreshold = 15 / this.viewport.zoom; // 15 pixels in world space
                    
                    if (distanceToFirst < closeThreshold) {
                        // Double-click on first point: close the path
                        this.finishPathDrawing(true);
                        this.skipNextPathClick = true; // Skip the second mousedown of this double-click
                        this.lastPathClickTime = 0;
                        this.lastPathClickPos = null;
                        e.preventDefault();
                        return;
                    }
                }
                
                // Double-click elsewhere: set flag so NEXT segment will be curved
                this.nextSegmentCurved = true;
                this.pathDrawEditSegmentIndex = null;
                this.skipNextPathClick = true; // Skip the second mousedown of this double-click
                this.lastPathClickTime = 0;
                this.lastPathClickPos = null;
            } else if (!this.isPathDrawing) {
                // First click: start path drawing
                this.isPathDrawing = true;
                this.pathDrawPoints = [{ x: worldPos.x, y: worldPos.y }];
                this.pathDrawCurveSegments = [];
                this.pathDrawHandles = [{ handleIn: null, handleOut: null }];
                this.pathDrawEditSegmentIndex = null;
                this.pathDrawCurvedEndIndex = null;
                this.nextSegmentCurved = false;
                this.lastPathClickTime = now;
                this.lastPathClickPos = { x: worldPos.x, y: worldPos.y };
            } else {
                // Check if clicking near the first point to close the path
                const firstPoint = this.pathDrawPoints[0];
                const distanceToFirst = Math.sqrt(
                    Math.pow(worldPos.x - firstPoint.x, 2) + 
                    Math.pow(worldPos.y - firstPoint.y, 2)
                );
                const closeThreshold = 15 / this.viewport.zoom; // 15 pixels in world space
                
                if (this.pathDrawPoints.length >= 3 && distanceToFirst < closeThreshold) {
                    // Close the path by finishing with closed=true
                    this.finishPathDrawing(true);
                    e.preventDefault();
                    return;
                }
                
                // Regular click: add point, check if this segment should be curved
                this.pathDrawPoints.push({ x: worldPos.x, y: worldPos.y });
                this.pathDrawCurveSegments.push(this.nextSegmentCurved);
                this.pathDrawHandles.push({ handleIn: null, handleOut: null });
                if (this.nextSegmentCurved) {
                    this.pathDrawCurvedEndIndex = this.pathDrawPoints.length - 1;
                }
                this.nextSegmentCurved = false; // Reset flag after using it
                this.pathDrawEditSegmentIndex = null;
                this.lastPathClickTime = now;
                this.lastPathClickPos = { x: worldPos.x, y: worldPos.y };
            }
            this.pathPreviewPos = { x: worldPos.x, y: worldPos.y };
            this.canvas.style.cursor = 'crosshair';
            this.requestRender();
            e.preventDefault();
            return;
        }
        
        // Right click: edge joinery menu or pan
        if (e.button === 2) {
            const hit = this.hitTestEdge(x, y);
            if (hit && hit.edge) {
                this.edgeJoineryMenu.show({
                    x: e.clientX,
                    y: e.clientY,
                    edge: hit.edge
                });
                e.preventDefault();
                return;
            }

            this.isDragging = true;
            this.dragStart = { x, y, viewportX: this.viewport.x, viewportY: this.viewport.y };
            this.canvas.style.cursor = 'grabbing';
            e.preventDefault();
            return;
        }
        
        // Left click for selection/shape drag
        if (e.button === 0) {
            const worldPos = this.screenToWorld(x, y);

            // Check if clicking on a joinery handle first
            const joineryHit = this.hitTestJoineryHandle(worldPos.x, worldPos.y);
            if (joineryHit) {
                if (joineryHit.type === 'align') {
                    // Toggle alignment
                    const shapeStore = this.sceneState.shapeStore;
                    const currentJoinery = shapeStore.getEdgeJoinery(joineryHit.edge);
                    if (currentJoinery) {
                        const newAlign = currentJoinery.align === 'left' ? 'right' : 'left';
                        shapeStore.setEdgeJoinery(joineryHit.edge, {
                            ...currentJoinery,
                            align: newAlign
                        });
                    }
                    e.preventDefault();
                    return;
                } else if (joineryHit.type === 'depth') {
                    // Start dragging depth
                    this.isDraggingJoineryHandle = true;
                    this.joineryDragStart = {
                        edge: joineryHit.edge,
                        handle: joineryHit.handle,
                        startX: worldPos.x,
                        startY: worldPos.y,
                        originalThickness: joineryHit.handle.joinery.thicknessMm
                    };
                    this.canvas.style.cursor = 'ns-resize';
                    e.preventDefault();
                    return;
                }
            }

            // Handle edge selection mode
            const shapeStore = this.sceneState.shapeStore;
            if (shapeStore.getSelectionMode() === 'edge') {
                this.handleEdgeClick(x, y, e.shiftKey);
                e.preventDefault();
                return;
            }

            // Check if clicking on a bezier handle (when in handle edit mode)
            if (this.handleEditState) {
                const handleHit = this.hitTestHandle(worldPos.x, worldPos.y);
                if (handleHit) {
                    this.isDraggingHandle = true;
                    this.handleEditState.activeHandle = handleHit.handleType;
                    this.handleDragStart = { x: worldPos.x, y: worldPos.y };
                    this.canvas.style.cursor = 'move';
                    e.preventDefault();
                    return;
                }
            }

            const rotationHit = this.hitTestRotationHandle(worldPos.x, worldPos.y);
            if (rotationHit) {
                const shape = this.sceneState.shapeStore.get(rotationHit.shapeId);
                if (shape) {
                    const startRotation = Number(shape.rotation || 0);
                    const startAngle = Math.atan2(worldPos.y - rotationHit.center.y, worldPos.x - rotationHit.center.x);
                    this.isRotating = true;
                    this.rotationState = {
                        shapeId: rotationHit.shapeId,
                        center: rotationHit.center,
                        startAngle,
                        startRotation
                    };
                    this.canvas.style.cursor = 'grabbing';
                    e.preventDefault();
                    return;
                }
            }

            const resizeHit = this.hitTestResizeHandle(worldPos.x, worldPos.y);
            if (resizeHit) {
                const shape = this.sceneState.shapeStore.get(resizeHit.shapeId);
                const resolvedShape = shape ? this.bindingResolver.resolveShape(shape) : null;
                const startBounds = resizeHit.bounds;
                const strategy = resizeHit.strategy;
                const startState = strategy && typeof strategy.init === 'function'
                    ? strategy.init(shape, resolvedShape || shape, startBounds)
                    : {};

                this.isResizing = true;
                this.resizeState = {
                    shapeId: resizeHit.shapeId,
                    handle: resizeHit.handle,
                    startBounds,
                    startState,
                    strategy,
                    changedProps: []
                };
                this.canvas.style.cursor = this.getResizeCursor(resizeHit.handle);
                e.preventDefault();
                return;
            }

            const shape = this.hitTest(x, y);
            
            // Shift+click for multi-selection
            if (e.shiftKey && shape) {
                if (this.selectedShapeIds.has(shape.id)) {
                    this.sceneState.shapeStore.removeFromSelection(shape.id);
                    this.selectedShapeIds.delete(shape.id);
                } else {
                    this.sceneState.shapeStore.addToSelection(shape.id);
                    this.selectedShapeIds.add(shape.id);
                }
                // Update local selection state
                this.selectedShapeIds = this.sceneState.shapeStore.getSelectedIds();
                this.selectedShapeId = Array.from(this.selectedShapeIds)[0] || null;
                this.requestRender();
                return;
            }
            
            if (shape) {
                // Check if we're clicking on an already selected shape
                const isAlreadySelected = this.selectedShapeIds.has(shape.id);
                
                // Clear handle editing if clicking on a different shape
                if (this.handleEditState && this.handleEditState.shapeId !== shape.id) {
                    this.handleEditState = null;
                }
                
                if (!e.shiftKey && !isAlreadySelected) {
                    // Single selection - clear multi-select
                    this.selectedShapeId = shape.id;
                    this.selectedShapeIds.clear();
                    this.selectedShapeIds.add(shape.id);
                    this.sceneState.shapeStore.setSelected(shape.id);
                } else if (!isAlreadySelected) {
                    // Add to selection
                    this.selectedShapeIds.add(shape.id);
                    this.sceneState.shapeStore.addToSelection(shape.id);
                }
                // Sync local state
                this.selectedShapeIds = this.sceneState.shapeStore.getSelectedIds();
                this.selectedShapeId = shape.id; // Set clicked shape as primary
                
                // Get all selected shapes and store their initial positions for multi-drag
                const selectedIdsArray = Array.from(this.selectedShapeIds);
                const initialPositions = {};
                
                selectedIdsArray.forEach(id => {
                    const selShape = this.sceneState.shapeStore.get(id);
                    if (!selShape) return;
                    const resolvedSelShape = this.bindingResolver.resolveShape(selShape);
                    const moveState = this.getShapeMoveState(selShape, resolvedSelShape);
                    if (moveState) {
                        initialPositions[id] = moveState;
                    }
                });
                
                // Get the resolved shape to know its current position
                const resolvedShape = this.bindingResolver.resolveShape(shape);
                
                // Store initial drag position and shape center/position
                const worldPos = this.screenToWorld(x, y);
                const snappedPos = this.snapStrategy.snap(worldPos.x, worldPos.y, { gridSize: this.gridSize });
                
                this.isDragging = true;
                
                // Store all selected shapes' initial positions for multi-drag
                this.dragStart = { 
                    x, 
                    y, 
                    shapeId: shape.id,
                    selectedIds: selectedIdsArray,
                    initialPositions: initialPositions
                };
                
                this.canvas.style.cursor = 'grabbing';
            } else {
                // Start selection rectangle
                if (!e.shiftKey) {
                    this.selectedShapeId = null;
                    this.selectedShapeIds.clear();
                    this.sceneState.shapeStore.clearSelection();
                    // Clear handle editing when clicking on empty space
                    this.handleEditState = null;
                }
                this.isSelecting = true;
                const worldPos = this.screenToWorld(x, y);
                this.selectionStart = { x: worldPos.x, y: worldPos.y, screenX: x, screenY: y };
                this.canvas.style.cursor = 'crosshair';
            }
        }
    }
    
    /**
     * Handle mouse move event
     * @param {MouseEvent} e 
     */
    onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Update edge hover in edge selection mode
        this.updateEdgeHover(x, y);

        if (this.isDrawingAnchorDrag && this.pathDrawAnchorIndex !== null) {
            const worldPos = this.screenToWorld(x, y);
            const index = this.pathDrawAnchorIndex;
            if (this.pathDrawPoints[index]) {
                this.pathDrawPoints[index] = { x: worldPos.x, y: worldPos.y };
                this.requestRender();
            }
            return;
        }

        if (this.isDrawingHandleDrag && this.pathDrawHandleState) {
            const worldPos = this.screenToWorld(x, y);
            const point = this.pathDrawPoints[this.pathDrawHandleState.pointIndex];
            if (point) {
                const handleVec = {
                    x: worldPos.x - point.x,
                    y: worldPos.y - point.y
                };
                const showBothAtLast = this.pathDrawCurvedEndIndex !== null && this.pathDrawPoints.length >= 2;
                const lastFixedIndex = this.pathDrawCurvedEndIndex !== null
                    ? this.pathDrawCurvedEndIndex
                    : Math.max(0, this.pathDrawPoints.length - 2);
                if (!this.pathDrawHandles[this.pathDrawHandleState.pointIndex]) {
                    this.pathDrawHandles[this.pathDrawHandleState.pointIndex] = { handleIn: null, handleOut: null };
                }
                if (showBothAtLast && this.pathDrawHandleState.pointIndex === lastFixedIndex) {
                    const fixedHandleLength = 35 / this.viewport.zoom;
                    const len = Math.sqrt(handleVec.x * handleVec.x + handleVec.y * handleVec.y) || 1;
                    const nx = handleVec.x / len;
                    const ny = handleVec.y / len;
                    this.pathDrawHandles[lastFixedIndex].handleOut = {
                        x: nx * fixedHandleLength,
                        y: ny * fixedHandleLength
                    };
                    this.pathDrawHandles[lastFixedIndex].handleIn = {
                        x: -nx * fixedHandleLength,
                        y: -ny * fixedHandleLength
                    };
                } else {
                    this.pathDrawHandles[this.pathDrawHandleState.pointIndex][this.pathDrawHandleState.handleType] = handleVec;
                }
                this.requestRender();
            }
            return;
        }

        if (this.isPathDrawing) {
            const worldPos = this.screenToWorld(x, y);
            this.pathPreviewPos = { x: worldPos.x, y: worldPos.y };
            this.requestRender();
            return;
        }

        if (this.isRotating && this.rotationState) {
            const worldPos = this.screenToWorld(x, y);
            const angle = Math.atan2(worldPos.y - this.rotationState.center.y, worldPos.x - this.rotationState.center.x);
            const delta = (angle - this.rotationState.startAngle) * 180 / Math.PI;
            let nextRotation = this.rotationState.startRotation + delta;
            if (e.shiftKey) {
                const snap = 15;
                nextRotation = Math.round(nextRotation / snap) * snap;
            }
            const shape = this.sceneState.shapeStore.get(this.rotationState.shapeId);
            if (shape) {
                shape.rotation = nextRotation;
                this.requestRender();
            }
            return;
        }
        
        // Handle dragging bezier handles
        if (this.isDraggingHandle && this.handleEditState) {
            const worldPos = this.screenToWorld(x, y);
            const shape = this.sceneState.shapeStore.get(this.handleEditState.shapeId);
            if (shape && shape.type === 'path') {
                const point = shape.points[this.handleEditState.pointIndex];
                if (point) {
                    // Calculate new handle position (relative to the point)
                    const handleValue = {
                        x: worldPos.x - point.x,
                        y: worldPos.y - point.y
                    };
                    shape.setHandle(this.handleEditState.pointIndex, this.handleEditState.activeHandle, handleValue);
                    this.requestRender();
                }
            }
            return;
        }
        
        // Handle joinery depth dragging
        if (this.isDraggingJoineryHandle && this.joineryDragStart) {
            const worldPos = this.screenToWorld(x, y);
            const handle = this.joineryDragStart.handle;
            
            // Calculate new depth based on mouse position projected onto normal
            const dx = worldPos.x - handle.p1.x - handle.ux * (handle.length / 2);
            const dy = worldPos.y - handle.p1.y - handle.uy * (handle.length / 2);
            const projectedDist = (dx * handle.nx + dy * handle.ny) * handle.direction;
            
            // Clamp to reasonable values
            const newThickness = Math.max(1, Math.min(50, projectedDist));
            
            // Update joinery
            const shapeStore = this.sceneState.shapeStore;
            const currentJoinery = shapeStore.getEdgeJoinery(this.joineryDragStart.edge);
            if (currentJoinery) {
                shapeStore.setEdgeJoinery(this.joineryDragStart.edge, {
                    ...currentJoinery,
                    thicknessMm: Math.round(newThickness * 10) / 10
                });
            }
            return;
        }

        if (this.isResizing && this.resizeState) {
            const worldPos = this.screenToWorld(x, y);
            const snappedPos = this.snapStrategy.snap(worldPos.x, worldPos.y, { gridSize: this.gridSize });
            const shape = this.sceneState.shapeStore.get(this.resizeState.shapeId);
            if (shape) {
                const newBounds = this.computeResizedBounds(this.resizeState.startBounds, this.resizeState.handle, snappedPos);
                const strategy = this.resizeState.strategy;
                if (strategy && typeof strategy.apply === 'function') {
                    const changedProps = strategy.apply(shape, this.resizeState.startState, newBounds) || [];
                    this.resizeState.changedProps = changedProps;
                }
                this.requestRender();
            }
            return;
        }

        // Update cursor and hover state for joinery handles
        if (!this.isDragging && !this.isSelecting) {
            const worldPos = this.screenToWorld(x, y);
            const joineryHit = this.hitTestJoineryHandle(worldPos.x, worldPos.y);
            
            if (joineryHit) {
                this.hoveredJoineryHandle = { edge: joineryHit.edge, type: joineryHit.type };
                this.canvas.style.cursor = joineryHit.type === 'depth' ? 'ns-resize' : 'pointer';
                this.requestRender();
                return;
            } else if (this.hoveredJoineryHandle) {
                this.hoveredJoineryHandle = null;
                this.requestRender();
            }
        }

        if (!this.isDragging && !this.isSelecting && !this.isResizing && !this.isRotating && !this.isPathDrawing && !this.handleEditState) {
            const worldPos = this.screenToWorld(x, y);
            const rotationHit = this.hitTestRotationHandle(worldPos.x, worldPos.y);
            if (rotationHit) {
                this.canvas.style.cursor = 'grab';
                return;
            }
            const resizeHit = this.hitTestResizeHandle(worldPos.x, worldPos.y);
            if (resizeHit) {
                this.hoveredResizeHandle = resizeHit.handle;
                this.canvas.style.cursor = this.getResizeCursor(resizeHit.handle);
            } else if (this.hoveredResizeHandle) {
                this.hoveredResizeHandle = null;
                this.canvas.style.cursor = 'crosshair';
            }
        }

        // Update cursor when hovering over handles
        if (this.isPathDrawing && !this.isDragging) {
            const worldPos = this.screenToWorld(x, y);
            const handleHit = this.hitTestPathDrawHandle(worldPos.x, worldPos.y);
            if (handleHit) {
                this.canvas.style.cursor = 'move';
            } else {
                this.canvas.style.cursor = 'crosshair';
            }
        } else if (this.handleEditState && !this.isDragging) {
            const worldPos = this.screenToWorld(x, y);
            const handleHit = this.hitTestHandle(worldPos.x, worldPos.y);
            if (handleHit) {
                this.canvas.style.cursor = 'move';
            } else {
                this.canvas.style.cursor = 'crosshair';
            }
        }
        
        if (this.isDragging) {
            if (this.dragStart.viewportX !== undefined) {
                // Panning
                const dx = x - this.dragStart.x;
                const dy = y - this.dragStart.y;
                this.viewport.x = this.dragStart.viewportX + dx;
                this.viewport.y = this.dragStart.viewportY + dy;
                this.requestRender();
            } else if (this.dragStart.shapeId) {
                // Moving shape(s) - update directly without events during drag (for performance)
                const selectedIds = this.dragStart.selectedIds || [this.dragStart.shapeId];
                const initialWorldPos = this.screenToWorld(this.dragStart.x, this.dragStart.y);
                let currentWorldPos = this.screenToWorld(x, y);
                currentWorldPos = this.snapStrategy.snap(currentWorldPos.x, currentWorldPos.y, {
                    gridSize: this.gridSize,
                    shapes: this.sceneState.shapeStore.getResolved()
                });
                
                const dx = currentWorldPos.x - initialWorldPos.x;
                const dy = currentWorldPos.y - initialWorldPos.y;
                
                // Update all selected shapes using stored initial positions
                selectedIds.forEach(shapeId => {
                    const shape = this.sceneState.shapeStore.get(shapeId);
                    if (!shape) return;
                    
                    // Use stored initial positions for accurate multi-drag
                    const initialPos = this.dragStart.initialPositions?.[shapeId];
                    if (initialPos) {
                        this.applyShapeMoveState(shape, initialPos, dx, dy);
                    }
                });
                
                this.requestRender();
            }
        } else if (this.isSelecting && this.selectionStart) {
            // Update selection rectangle
            const currentWorldPos = this.screenToWorld(x, y);
            this.selectionRect = {
                x: Math.min(this.selectionStart.x, currentWorldPos.x),
                y: Math.min(this.selectionStart.y, currentWorldPos.y),
                width: Math.abs(currentWorldPos.x - this.selectionStart.x),
                height: Math.abs(currentWorldPos.y - this.selectionStart.y)
            };
            
            // Select shapes within rectangle
            const shapes = this.sceneState.shapeStore.getResolved();
            const selectedIds = new Set();
            shapes.forEach(shape => {
                const bounds = shape.getBounds();
                if (this.isRectOverlapping(this.selectionRect, bounds)) {
                    selectedIds.add(shape.id);
                }
            });
            
            if (!e.shiftKey) {
                this.selectedShapeIds = selectedIds;
            } else {
                selectedIds.forEach(id => this.selectedShapeIds.add(id));
            }
            
            this.requestRender();
        }
    }
    
    /**
     * Get offset between two shapes (for multi-drag)
     */
    getShapeOffset(shape1Id, shape2Id) {
        const shape1 = this.bindingResolver.resolveShape(this.sceneState.shapeStore.get(shape1Id));
        const shape2 = this.bindingResolver.resolveShape(this.sceneState.shapeStore.get(shape2Id));
        if (!shape1 || !shape2) return null;
        
        const bounds1 = shape1.getBounds();
        const bounds2 = shape2.getBounds();
        
        if (shape1.type === 'circle' && shape2.type === 'circle') {
            return {
                x: shape2.centerX - shape1.centerX,
                y: shape2.centerY - shape1.centerY
            };
        } else {
            return {
                x: bounds2.x - bounds1.x,
                y: bounds2.y - bounds1.y
            };
        }
    }

    getShapeMoveState(shape, resolvedShape) {
        const ref = resolvedShape || shape;
        if (!ref) return null;

        if (shape.type === 'path' && Array.isArray(shape.points)) {
            return {
                kind: 'points',
                points: shape.points.map((p) => ({ x: p.x, y: p.y }))
            };
        }

        if (Number.isFinite(ref.centerX) && Number.isFinite(ref.centerY)) {
            return {
                kind: 'center',
                centerX: ref.centerX,
                centerY: ref.centerY
            };
        }

        if (Number.isFinite(ref.x) && Number.isFinite(ref.y)) {
            return {
                kind: 'xy',
                x: ref.x,
                y: ref.y
            };
        }

        if (Number.isFinite(ref.x1) && Number.isFinite(ref.y1) && Number.isFinite(ref.x2) && Number.isFinite(ref.y2)) {
            return {
                kind: 'line',
                x1: ref.x1,
                y1: ref.y1,
                x2: ref.x2,
                y2: ref.y2
            };
        }

        if (shape.position && Number.isFinite(shape.position.x) && Number.isFinite(shape.position.y)) {
            return {
                kind: 'position',
                x: shape.position.x,
                y: shape.position.y
            };
        }

        return null;
    }

    applyShapeMoveState(shape, state, dx, dy) {
        if (!shape || !state) return;
        switch (state.kind) {
            case 'points':
                shape.points = state.points.map((p) => ({
                    x: p.x + dx,
                    y: p.y + dy
                }));
                break;
            case 'center':
                shape.centerX = state.centerX + dx;
                shape.centerY = state.centerY + dy;
                break;
            case 'xy':
                shape.x = state.x + dx;
                shape.y = state.y + dy;
                break;
            case 'line':
                shape.x1 = state.x1 + dx;
                shape.y1 = state.y1 + dy;
                shape.x2 = state.x2 + dx;
                shape.y2 = state.y2 + dy;
                break;
            case 'position':
                shape.position.x = state.x + dx;
                shape.position.y = state.y + dy;
                break;
            default:
                break;
        }
    }
    
    /**
     * Check if two rectangles overlap
     */
    isRectOverlapping(rect1, rect2) {
        return !(rect1.x + rect1.width < rect2.x || 
                 rect2.x + rect2.width < rect1.x ||
                 rect1.y + rect1.height < rect2.y || 
                 rect2.y + rect2.height < rect1.y);
    }
    
    /**
     * Handle mouse up event
     * @param {MouseEvent} e 
     */
    onMouseUp(e) {
        // Finish joinery handle dragging
        if (this.isDraggingJoineryHandle) {
            this.isDraggingJoineryHandle = false;
            this.joineryDragStart = null;
            this.canvas.style.cursor = 'default';
            this.requestRender();
            return;
        }

        if (this.isRotating && this.rotationState) {
            const shape = this.sceneState.shapeStore.get(this.rotationState.shapeId);
            if (shape) {
                EventBus.emit(EVENTS.PARAM_CHANGED, { shapeId: shape.id });
            }
            this.isRotating = false;
            this.rotationState = null;
            this.canvas.style.cursor = 'crosshair';
            this.requestRender();
            return;
        }

        if (this.isResizing && this.resizeState) {
            const shape = this.sceneState.shapeStore.get(this.resizeState.shapeId);
            if (shape) {
                this.updateBindingsForProperties(shape, this.resizeState.changedProps || []);
                EventBus.emit(EVENTS.PARAM_CHANGED, { shapeId: shape.id });
            }
            this.isResizing = false;
            this.resizeState = null;
            this.canvas.style.cursor = 'crosshair';
            this.requestRender();
            return;
        }

        if (this.isPathDrawing) {
            if (this.isDrawingAnchorDrag) {
                this.isDrawingAnchorDrag = false;
                this.pathDrawAnchorIndex = null;
                this.canvas.style.cursor = 'crosshair';
                this.requestRender();
                return;
            }
            if (this.isDrawingHandleDrag) {
                this.isDrawingHandleDrag = false;
                this.pathDrawHandleState = null;
                this.canvas.style.cursor = 'crosshair';
                this.requestRender();
            }
            return;
        }
        
        // Finish handle dragging
        if (this.isDraggingHandle) {
            this.isDraggingHandle = false;
            this.handleDragStart = null;
            if (this.handleEditState) {
                this.handleEditState.activeHandle = null;
            }
            this.canvas.style.cursor = 'crosshair';
            this.requestRender();
            return;
        }
        
        if (this.isDragging) {
            // If we were dragging shape(s), update bindings and emit events now
            if (this.dragStart && this.dragStart.shapeId) {
                const selectedIds = this.dragStart.selectedIds || [this.dragStart.shapeId];
                
                selectedIds.forEach(shapeId => {
                    const shape = this.sceneState.shapeStore.get(shapeId);
                    if (!shape) return;
                    
                    // Update bindings with final values (only on drag end)
                    if (shape.type === 'circle' || shape.type === 'polygon' || shape.type === 'star') {
                        const centerXBinding = shape.getBinding('centerX');
                        if (!centerXBinding) {
                            shape.setBinding('centerX', new LiteralBinding(shape.centerX));
                        } else if (centerXBinding.type === 'literal') {
                            centerXBinding.value = shape.centerX;
                        }
                        
                        const centerYBinding = shape.getBinding('centerY');
                        if (!centerYBinding) {
                            shape.setBinding('centerY', new LiteralBinding(shape.centerY));
                        } else if (centerYBinding.type === 'literal') {
                            centerYBinding.value = shape.centerY;
                        }
                    } else if (shape.type === 'rectangle') {
                        const xBinding = shape.getBinding('x');
                        if (!xBinding) {
                            shape.setBinding('x', new LiteralBinding(shape.x));
                        } else if (xBinding.type === 'literal') {
                            xBinding.value = shape.x;
                        }
                        
                        const yBinding = shape.getBinding('y');
                        if (!yBinding) {
                            shape.setBinding('y', new LiteralBinding(shape.y));
                        } else if (yBinding.type === 'literal') {
                            yBinding.value = shape.y;
                        }
                    }
                    
                    EventBus.emit(EVENTS.PARAM_CHANGED, { shapeId });
                });
            }
            
            this.isDragging = false;
            this.dragStart = null;
            this.canvas.style.cursor = 'crosshair';
        } else if (this.isSelecting) {
            // Finalize selection
            if (this.selectedShapeIds.size > 0) {
                this.sceneState.shapeStore.setSelectedIds(Array.from(this.selectedShapeIds));
                this.selectedShapeId = Array.from(this.selectedShapeIds)[0] || null;
            } else {
                this.sceneState.shapeStore.clearSelection();
                this.selectedShapeId = null;
            }
            this.selectionRect = null;
            this.isSelecting = false;
            this.selectionStart = null;
        }
        
        this.canvas.style.cursor = 'crosshair';
        this.render(); // Final render
    }

    /**
     * Handle double click (set next segment to be curved OR edit handles)
     * @param {MouseEvent} e
     */
    onDoubleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const worldPos = this.screenToWorld(x, y);
        
        // If in path drawing mode, check if double-clicking on first point to close
        if (this.toolMode === 'path' && this.isPathDrawing) {
            // Check if double-clicking on the first point to close the path
            if (this.pathDrawPoints.length >= 3) {
                const firstPoint = this.pathDrawPoints[0];
                const distanceToFirst = Math.sqrt(
                    Math.pow(worldPos.x - firstPoint.x, 2) + 
                    Math.pow(worldPos.y - firstPoint.y, 2)
                );
                const closeThreshold = 15 / this.viewport.zoom; // 15 pixels in world space
                
                if (distanceToFirst < closeThreshold) {
                    // Double-click on first point: close the path
                    this.finishPathDrawing(true);
                    e.preventDefault();
                    return;
                }
            }
            
            // Double-click elsewhere: set curve flag for next segment
            this.nextSegmentCurved = true;
            this.requestRender();
            e.preventDefault();
            return;
        }
        
        // Check if double-clicked on a path point to edit handles
        if (this.toolMode === 'select') {
            const hitResult = this.hitTestPathPoint(worldPos.x, worldPos.y);
            if (hitResult) {
                this.startHandleEditing(hitResult.shapeId, hitResult.pointIndex);
                e.preventDefault();
                return;
            }
            
            // Double-click elsewhere clears handle editing
            if (this.handleEditState) {
                this.handleEditState = null;
                this.requestRender();
            }
        }
    }
    
    /**
     * Hit test for path anchor points
     * @returns {{shapeId: string, pointIndex: number}|null}
     */
    hitTestPathPoint(worldX, worldY, hitRadius = 12) {
        const shapes = this.sceneState.shapeStore.getAll();
        for (const shape of shapes) {
            if (shape.type !== 'path') continue;
            
            for (let i = 0; i < shape.points.length; i++) {
                const p = shape.points[i];
                const dx = worldX - p.x;
                const dy = worldY - p.y;
                if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                    return { shapeId: shape.id, pointIndex: i };
                }
            }
        }
        return null;
    }
    
    /**
     * Hit test for bezier handles
     * @returns {{shapeId: string, pointIndex: number, handleType: 'handleIn'|'handleOut'}|null}
     */
    hitTestHandle(worldX, worldY, hitRadius = 6) {
        if (!this.handleEditState) return null;
        
        const shape = this.sceneState.shapeStore.get(this.handleEditState.shapeId);
        if (!shape || shape.type !== 'path') return null;
        
        const pointIndex = this.handleEditState.pointIndex;
        const point = shape.points[pointIndex];
        if (!point) return null;
        
        const handles = shape.getHandles(pointIndex);
        
        // Check handleOut
        if (handles.handleOut) {
            const hx = point.x + handles.handleOut.x;
            const hy = point.y + handles.handleOut.y;
            const dx = worldX - hx;
            const dy = worldY - hy;
            if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                return { shapeId: shape.id, pointIndex, handleType: 'handleOut' };
            }
        }
        
        // Check handleIn
        if (handles.handleIn) {
            const hx = point.x + handles.handleIn.x;
            const hy = point.y + handles.handleIn.y;
            const dx = worldX - hx;
            const dy = worldY - hy;
            if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                return { shapeId: shape.id, pointIndex, handleType: 'handleIn' };
            }
        }
        
        return null;
    }

    /**
     * Hit test for joinery handles (depth adjustment, alignment toggle)
     * @param {number} worldX
     * @param {number} worldY
     * @returns {{edge: object, type: 'depth'|'align', handle: object}|null}
     */
    hitTestJoineryHandle(worldX, worldY) {
        if (!this.joineryHandles || this.joineryHandles.length === 0) return null;

        for (const handle of this.joineryHandles) {
            const dx = worldX - handle.x;
            const dy = worldY - handle.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            // Use a scaled hit radius for better interaction
            const scaledRadius = handle.radius / this.viewport.zoom * this.viewport.zoom; // Accounts for world coords
            if (dist <= handle.radius * 1.5) {
                return { edge: handle.edge, type: handle.type, handle };
            }
        }
        return null;
    }

    /**
     * Hit test for preview handles while drawing a path.
     * @returns {{pointIndex: number, handleType: 'handleIn'|'handleOut'}|null}
     */
    hitTestPathDrawHandle(worldX, worldY, hitRadius = 12) {
        if (!this.isPathDrawing) return null;
        const points = [...this.pathDrawPoints];
        const curveSegments = [...this.pathDrawCurveSegments];
        if (this.pathPreviewPos) {
            points.push({ x: this.pathPreviewPos.x, y: this.pathPreviewPos.y });
            curveSegments.push(this.nextSegmentCurved);
        }
        if (points.length < 2) return null;

        const previewShape = new PathShape(
            'preview',
            { x: 0, y: 0 },
            points,
            2,
            false,
            curveSegments,
            false,
            this.pathDrawHandles
        );

        const showBothAtLast = (this.pathDrawCurvedEndIndex !== null || this.nextSegmentCurved) && points.length >= 2;
        const lastFixedIndex = this.pathDrawCurvedEndIndex !== null
            ? this.pathDrawCurvedEndIndex
            : Math.max(0, points.length - 2);
        const fixedHandleLength = 35 / this.viewport.zoom;
        for (let i = 0; i < points.length; i += 1) {
            if (showBothAtLast && i !== lastFixedIndex) {
                continue;
            }
            let handles = previewShape.getHandles(i);
            const point = points[i];
            if (showBothAtLast && i === lastFixedIndex) {
                let outDir = handles.handleOut;
                if (!outDir || (outDir.x === 0 && outDir.y === 0)) {
                    const prevPoint = points[i - 1] || points[i];
                    outDir = { x: point.x - prevPoint.x, y: point.y - prevPoint.y };
                }
                const outLen = Math.sqrt(outDir.x * outDir.x + outDir.y * outDir.y) || 1;
                const outNorm = { x: outDir.x / outLen, y: outDir.y / outLen };
                handles = {
                    handleOut: { x: outNorm.x * fixedHandleLength, y: outNorm.y * fixedHandleLength },
                    handleIn: { x: -outNorm.x * fixedHandleLength, y: -outNorm.y * fixedHandleLength }
                };
            }
            if (handles.handleOut) {
                const hx = point.x + handles.handleOut.x;
                const hy = point.y + handles.handleOut.y;
                const dx = worldX - hx;
                const dy = worldY - hy;
                if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                    return { pointIndex: i, handleType: 'handleOut' };
                }
            }
            if (handles.handleIn) {
                const hx = point.x + handles.handleIn.x;
                const hy = point.y + handles.handleIn.y;
                const dx = worldX - hx;
                const dy = worldY - hy;
                if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                    return { pointIndex: i, handleType: 'handleIn' };
                }
            }
        }

        return null;
    }

    /**
     * Hit test for path anchor points while drawing.
     * @returns {{pointIndex: number}|null}
     */
    hitTestPathDrawAnchor(worldX, worldY, hitRadius = 10) {
        if (!this.isPathDrawing) return null;
        const points = this.pathDrawPoints;
        for (let i = 0; i < points.length; i += 1) {
            const p = points[i];
            const dx = worldX - p.x;
            const dy = worldY - p.y;
            if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                return { pointIndex: i };
            }
        }
        return null;
    }
    
    /**
     * Start editing handles for a path point
     */
    startHandleEditing(shapeId, pointIndex) {
        const shape = this.sceneState.shapeStore.get(shapeId);
        if (!shape || shape.type !== 'path') return;
        
        // Ensure the segment connected to this point is curved
        // Enable curve for segment ending at this point
        if (pointIndex > 0 && pointIndex - 1 < shape.curveSegments.length) {
            shape.curveSegments[pointIndex - 1] = true;
        }
        // Enable curve for segment starting at this point
        if (pointIndex < shape.curveSegments.length) {
            shape.curveSegments[pointIndex] = true;
        }
        
        // Initialize handles array if not already set
        if (!shape.handles) {
            shape.handles = shape.points.map(() => ({ handleIn: null, handleOut: null }));
        }
        
        // Ensure handles array is long enough
        while (shape.handles.length < shape.points.length) {
            shape.handles.push({ handleIn: null, handleOut: null });
        }
        
        // Always create handles for this point (don't rely on getHandles which might return null)
        const point = shape.points[pointIndex];
        const prevPoint = shape.points[pointIndex - 1];
        const nextPoint = shape.points[pointIndex + 1];
        
        // Create handleOut if there's a next point (or use default if exists)
        if (nextPoint) {
            if (!shape.handles[pointIndex].handleOut) {
                const dx = nextPoint.x - point.x;
                const dy = nextPoint.y - point.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 0.001) {
                    const handleLen = len / 3;
                    shape.handles[pointIndex].handleOut = {
                        x: dx / len * handleLen,
                        y: dy / len * handleLen
                    };
                }
            }
        }
        
        // Create handleIn if there's a previous point (or use default if exists)
        if (prevPoint) {
            if (!shape.handles[pointIndex].handleIn) {
                const dx = prevPoint.x - point.x;
                const dy = prevPoint.y - point.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 0.001) {
                    const handleLen = len / 3;
                    shape.handles[pointIndex].handleIn = {
                        x: dx / len * handleLen,
                        y: dy / len * handleLen
                    };
                }
            }
        }
        
        // For the last point, also create a handleOut pointing away from the path
        // This makes it easier to continue the curve
        if (!nextPoint && prevPoint && !shape.handles[pointIndex].handleOut) {
            // Create handleOut in the direction away from previous point
            const dx = point.x - prevPoint.x;
            const dy = point.y - prevPoint.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0.001) {
                const handleLen = len / 3;
                shape.handles[pointIndex].handleOut = {
                    x: dx / len * handleLen,
                    y: dy / len * handleLen
                };
            }
        }
        
        this.handleEditState = { shapeId, pointIndex, activeHandle: null };
        this.sceneState.shapeStore.setSelected(shapeId);
        this.selectedShapeId = shapeId;
        this.selectedShapeIds = new Set([shapeId]);
        this.requestRender();
    }

    /**
     * Finish path drawing and add shape
     * @param {boolean} closed - Whether to close the path (connect last point to first)
     */
    finishPathDrawing(closed = false) {
        if (this.pathDrawPoints.length > 1) {
            const shape = new PathShape(
                `path-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                { x: 0, y: 0 },
                this.pathDrawPoints,
                1,
                closed,
                this.pathDrawCurveSegments,
                false,
                this.pathDrawHandles
            );
            this.sceneState.shapeStore.add(shape);
            this.sceneState.shapeStore.setSelected(shape.id);
            
            // Automatically show handles at the last point
            const lastPointIndex = shape.points.length - 1;
            this.startHandleEditing(shape.id, lastPointIndex);
        }
        this.isPathDrawing = false;
        this.pathDrawPoints = [];
        this.pathPreviewPos = null;
        this.pathDrawCurveSegments = [];
        this.pathDrawHandles = [];
        this.isDrawingAnchorDrag = false;
        this.pathDrawAnchorIndex = null;
        this.pathDrawEditSegmentIndex = null;
        this.lastPathClickTime = 0;
        this.lastPathClickPos = null;
        this.nextSegmentCurved = false;
        this.skipNextPathClick = false;
        this.requestRender();
    }

    /**
     * Set tool mode
     * @param {'select'|'path'} mode
     */
    setToolMode(mode) {
        this.toolMode = mode;
        if (mode === 'path') {
            this.isSelecting = false;
            this.isDragging = false;
            this.canvas.style.cursor = 'crosshair';
        } else {
            this.isPathDrawing = false;
            this.pathDrawPoints = [];
            this.pathPreviewPos = null;
            this.pathDrawCurveSegments = [];
            this.pathDrawHandles = [];
            this.isDrawingAnchorDrag = false;
            this.pathDrawAnchorIndex = null;
            this.pathDrawEditSegmentIndex = null;
            this.lastPathClickTime = 0;
            this.lastPathClickPos = null;
            this.nextSegmentCurved = false;
            this.skipNextPathClick = false;
        }
    }
    
    /**
     * Handle wheel event for zooming (centered on cursor)
     * @param {WheelEvent} e 
     */
    onWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoom(factor, x, y);
    }
    
    /**
     * Setup keyboard event listeners
     */
    setupKeyboardListeners() {
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
    }
    
    /**
     * Handle key down
     */
    onKeyDown(e) {
        this.pressedKeys.add(e.key);
        if (this.isEditableTarget(e.target)) {
            return;
        }

        // 'E' key: toggle edge selection mode
        if (e.key === 'e' || e.key === 'E') {
            e.preventDefault();
            const shapeStore = this.sceneState.shapeStore;
            const currentMode = shapeStore.getSelectionMode();
            shapeStore.setSelectionMode(currentMode === 'edge' ? 'shape' : 'edge');
            return;
        }

        // Escape: exit edge selection mode
        if (e.key === 'Escape') {
            const shapeStore = this.sceneState.shapeStore;
            if (shapeStore.getSelectionMode() === 'edge') {
                shapeStore.setSelectionMode('shape');
                return;
            }
        }

        if (this.isPathDrawing) {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.finishPathDrawing();
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                this.isPathDrawing = false;
                this.pathDrawPoints = [];
                this.pathPreviewPos = null;
                this.pathDrawCurveSegments = [];
                this.pathDrawHandles = [];
                this.isDrawingAnchorDrag = false;
                this.pathDrawAnchorIndex = null;
                this.pathDrawEditSegmentIndex = null;
                this.lastPathClickTime = 0;
                this.lastPathClickPos = null;
                this.nextSegmentCurved = false;
                this.skipNextPathClick = false;
                this.requestRender();
                return;
            }
        }
        
        // Arrow keys: move selected shape(s)
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            if (this.selectedShapeIds.size === 0 && this.selectedShapeId) {
                this.selectedShapeIds.add(this.selectedShapeId);
            }
            if (this.selectedShapeIds.size > 0) {
                const step = e.shiftKey ? 10 : 1;
                let dx = 0, dy = 0;
                
                if (e.key === 'ArrowUp') dy = -step;
                else if (e.key === 'ArrowDown') dy = step;
                else if (e.key === 'ArrowLeft') dx = -step;
                else if (e.key === 'ArrowRight') dx = step;
                
                const selectedIds = Array.from(this.selectedShapeIds);
                selectedIds.forEach(shapeId => {
                    const shape = this.sceneState.shapeStore.get(shapeId);
                    if (!shape) return;
                    
                    const resolved = this.bindingResolver.resolveShape(shape);
                    const snapped = this.snapStrategy.snap(
                        resolved.centerX || resolved.x + resolved.width / 2,
                        resolved.centerY || resolved.y + resolved.height / 2,
                        { gridSize: this.gridSize }
                    );
                    
                    if (shape.type === 'circle' || shape.type === 'polygon' || shape.type === 'star') {
                        const newX = snapped.x + dx;
                        const newY = snapped.y + dy;
                        shape.centerX = newX;
                        shape.centerY = newY;
                    } else if (shape.type === 'rectangle') {
                        const newX = resolved.x + dx;
                        const newY = resolved.y + dy;
                        const snapped = this.snapStrategy.snap(newX, newY, { gridSize: this.gridSize });
                        shape.x = snapped.x;
                        shape.y = snapped.y;
                    } else if (shape.type === 'path') {
                        shape.points = shape.points.map((p) => ({
                            x: p.x + dx,
                            y: p.y + dy
                        }));
                    }
                    
                    // Update bindings
                    if (shape.type === 'circle' || shape.type === 'polygon' || shape.type === 'star') {
                        shape.setBinding('centerX', new LiteralBinding(shape.centerX));
                        shape.setBinding('centerY', new LiteralBinding(shape.centerY));
                    } else if (shape.type === 'rectangle') {
                        shape.setBinding('x', new LiteralBinding(shape.x));
                        shape.setBinding('y', new LiteralBinding(shape.y));
                    }
                });
                
                EventBus.emit(EVENTS.PARAM_CHANGED);
                this.requestRender();
            }
        }
        
        // Ctrl+A: select all
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            e.preventDefault();
            this.sceneState.shapeStore.selectAll();
            this.selectedShapeIds = this.sceneState.shapeStore.getSelectedIds();
            this.selectedShapeId = Array.from(this.selectedShapeIds)[0] || null;
            this.requestRender();
        }
        
        // Escape: exit handle editing or deselect all
        if (e.key === 'Escape') {
            if (this.handleEditState) {
                // First Escape: exit handle editing
                this.handleEditState = null;
                this.isDraggingHandle = false;
                this.requestRender();
                return;
            }
            // Second Escape: deselect all
            this.sceneState.shapeStore.clearSelection();
            this.selectedShapeId = null;
            this.selectedShapeIds.clear();
            this.requestRender();
        }
        
        // Ctrl+D: duplicate selected
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            const selectedIds = Array.from(this.selectedShapeIds);
            if (selectedIds.length === 0 && this.selectedShapeId) {
                selectedIds.push(this.selectedShapeId);
            }
            if (selectedIds.length > 0) {
                import('../models/shapes/ShapeRegistry.js').then(({ ShapeRegistry }) => {
                    const command = new DuplicateShapesCommand(
                        this.sceneState.shapeStore,
                        ShapeRegistry,
                        selectedIds
                    );
                    command.execute();
                    this.requestRender();
                });
            }
        }
        
        // Delete or Backspace: delete all selected shapes
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            
            // Get all selected shape IDs
            const selectedIds = Array.from(this.selectedShapeIds);
            if (selectedIds.length === 0 && this.selectedShapeId) {
                selectedIds.push(this.selectedShapeId);
            }
            
            // Delete all selected shapes
            if (selectedIds.length > 0) {
                selectedIds.forEach(shapeId => {
                    this.sceneState.shapeStore.remove(shapeId);
                });
                
                // Clear selection after deletion
                this.selectedShapeIds.clear();
                this.selectedShapeId = null;
                this.sceneState.shapeStore.clearSelection();
                
                this.requestRender();
                console.log(`Deleted ${selectedIds.length} shape(s)`);
            }
        }
    }

    isEditableTarget(target) {
        const el = target instanceof Element ? target : null;
        if (!el) return false;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
        if (el.isContentEditable) return true;
        if (el.closest('.CodeMirror')) return true;
        if (el.closest('.blockly-workspace') || el.closest('#blockly-container')) return true;
        return false;
    }
    
    /**
     * Handle key up
     */
    onKeyUp(e) {
        this.pressedKeys.delete(e.key);
    }
}

// Prevent context menu on right click
document.addEventListener('contextmenu', (e) => {
    if (e.target.tagName === 'CANVAS') {
        e.preventDefault();
    }
});
