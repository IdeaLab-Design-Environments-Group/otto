/**
 * Canvas Renderer using Observer Pattern
 * Handles rendering of shapes on canvas and user interactions
 */
import { Component } from './Component.js';
import EventBus, { EVENTS } from '../events/EventBus.js';
import { LiteralBinding } from '../models/Binding.js';
import { NoSnap, GridSnap, ShapeSnap } from '../core/SnapStrategy.js';
import { MoveShapesCommand, DuplicateShapesCommand } from '../core/Command.js';

export class CanvasRenderer extends Component {
    constructor(canvasElement, sceneState, bindingResolver) {
        super(canvasElement.parentElement);
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.sceneState = sceneState;
        this.bindingResolver = bindingResolver;
        this.viewport = sceneState.viewport;
        
        // Interaction state
        this.isDragging = false;
        this.dragStart = null;
        this.dragShape = null;
        this.selectedShapeId = null;
        this.selectedShapeIds = new Set(); // Multi-selection
        
        // Selection rectangle state
        this.isSelecting = false;
        this.selectionStart = null;
        this.selectionRect = null;
        
        // Drag preview state
        this.dragPreviewType = null;
        this.dragPreviewPos = null;
        
        // Render throttling
        this.animationFrameId = null;
        this.needsRender = false;
        
        // Grid settings
        this.gridSize = 20;
        this.showGrid = true;
        
        // Snap strategy (Strategy Pattern)
        this.snapStrategy = new NoSnap(); // Default: no snapping
        
        // Keyboard navigation
        this.pressedKeys = new Set();
        this.setupKeyboardListeners();
        
        // Command history for undo/redo (for batch operations)
        this.commandHistory = [];
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Subscribe to events for re-rendering
        this.subscribeToEvents();
        
        // Subscribe to drag preview events from DragDropManager
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
    }
    
    /**
     * Setup mouse and wheel event listeners
     */
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
        this.canvas.addEventListener('mouseleave', () => {
            if (this.isDragging) {
                this.onMouseUp(new MouseEvent('mouseup'));
            }
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.render();
        });
        
        this.resizeCanvas();
    }
    
    /**
     * Resize canvas to fill container
     */
    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.render();
    }
    
    /**
     * Main render method
     */
    render() {
        if (!this.ctx) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Apply viewport transformation
        this.ctx.save();
        this.ctx.translate(this.viewport.x, this.viewport.y);
        this.ctx.scale(this.viewport.zoom, this.viewport.zoom);
        
        // Render grid
        if (this.showGrid) {
            this.renderGrid();
        }
        
        // Render shapes
        this.renderShapes();
        
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
        
        this.ctx.restore();
        
        this.needsRender = false;
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
     * Render grid
     */
    renderGrid() {
        const gridSize = this.gridSize * this.viewport.zoom;
        const offsetX = this.viewport.x % gridSize;
        const offsetY = this.viewport.y % gridSize;
        
        this.ctx.strokeStyle = '#e0e0e0';
        this.ctx.lineWidth = 0.5;
        
        // Vertical lines
        for (let x = -offsetX; x < this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        // Horizontal lines
        for (let y = -offsetY; y < this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }
    
    /**
     * Render all shapes
     * Optimized: during drag, render shapes directly without binding resolution
     */
    renderShapes() {
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 1;

        // During drag, render shapes directly for maximum performance
        // This avoids expensive binding resolution and cloning
        if (this.isDragging && this.dragStart && this.dragStart.shapeId) {
            const shapes = this.sceneState.shapeStore.getAll();
            shapes.forEach(shape => {
                this.ctx.save();
                shape.render(this.ctx);
                this.ctx.restore();
            });
        } else {
            // Normal rendering with binding resolution
            const resolvedShapes = this.sceneState.shapeStore.getResolved();
            resolvedShapes.forEach(shape => {
                this.ctx.save();
                shape.render(this.ctx);
                this.ctx.restore();
            });
        }
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
            const shapeForBounds = (this.isDragging && this.dragStart && this.dragStart.shapeId === shapeId)
                ? shape
                : this.bindingResolver.resolveShape(shape);
            const bounds = shapeForBounds.getBounds();

            // Draw selection rectangle (use doctor blue color)
            this.ctx.strokeStyle = '#0066b2';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.strokeRect(bounds.x - 5, bounds.y - 5, bounds.width + 10, bounds.height + 10);
            this.ctx.setLineDash([]);
        });
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
            this.ctx.beginPath();
            this.ctx.arc(x, y, 50, 0, Math.PI * 2);
            this.ctx.stroke();
        } else if (shapeType === 'rectangle') {
            this.ctx.strokeRect(x - 50, y - 50, 100, 100);
        }
        
        this.ctx.globalAlpha = 1.0;
        this.ctx.setLineDash([]);
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
            if (shape.containsPoint(worldPos.x, worldPos.y)) {
                return this.sceneState.shapeStore.get(shape.id);
            }
        }
        
        return null;
    }
    
    /**
     * Handle mouse down event
     * @param {MouseEvent} e 
     */
    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Right click for pan
        if (e.button === 2) {
            this.isDragging = true;
            this.dragStart = { x, y, viewportX: this.viewport.x, viewportY: this.viewport.y };
            this.canvas.style.cursor = 'grabbing';
            e.preventDefault();
            return;
        }
        
        // Left click for selection/shape drag
        if (e.button === 0) {
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
                    if (selShape) {
                        const resolvedSelShape = this.bindingResolver.resolveShape(selShape);
                        if (selShape.type === 'circle') {
                            initialPositions[id] = {
                                type: 'circle',
                                centerX: resolvedSelShape.centerX,
                                centerY: resolvedSelShape.centerY
                            };
                        } else if (selShape.type === 'rectangle') {
                            initialPositions[id] = {
                                type: 'rectangle',
                                x: resolvedSelShape.x,
                                y: resolvedSelShape.y
                            };
                        }
                    }
                });
                
                // Get the resolved shape to know its current position
                const resolvedShape = this.bindingResolver.resolveShape(shape);
                
                // Store initial drag position and shape center/position
                const worldPos = this.screenToWorld(x, y);
                const snappedPos = this.snapStrategy.snap(worldPos.x, worldPos.y, { gridSize: this.gridSize });
                
                this.isDragging = true;
                
                // Store all selected shapes' initial positions for multi-drag
                if (shape.type === 'circle') {
                    this.dragStart = { 
                        x, 
                        y, 
                        shapeId: shape.id,
                        initialCenterX: resolvedShape.centerX,
                        initialCenterY: resolvedShape.centerY,
                        selectedIds: selectedIdsArray,
                        initialPositions: initialPositions // Store all initial positions
                    };
                } else if (shape.type === 'rectangle') {
                    this.dragStart = { 
                        x, 
                        y, 
                        shapeId: shape.id,
                        initialX: resolvedShape.x,
                        initialY: resolvedShape.y,
                        selectedIds: selectedIdsArray,
                        initialPositions: initialPositions // Store all initial positions
                    };
                }
                
                this.canvas.style.cursor = 'grabbing';
            } else {
                // Start selection rectangle
                if (!e.shiftKey) {
                    this.selectedShapeId = null;
                    this.selectedShapeIds.clear();
                    this.sceneState.shapeStore.clearSelection();
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
                    
                    if (initialPos && initialPos.type === 'circle') {
                        shape.centerX = initialPos.centerX + dx;
                        shape.centerY = initialPos.centerY + dy;
                    } else if (initialPos && initialPos.type === 'rectangle') {
                        shape.x = initialPos.x + dx;
                        shape.y = initialPos.y + dy;
                    } else {
                        // Fallback to old method if initialPositions not available
                        if (shape.type === 'circle' && this.dragStart.initialCenterX !== undefined) {
                            const offset = shapeId === this.dragStart.shapeId ? 0 : 
                                this.getShapeOffset(this.dragStart.shapeId, shapeId);
                            shape.centerX = this.dragStart.initialCenterX + dx + (offset ? offset.x : 0);
                            shape.centerY = this.dragStart.initialCenterY + dy + (offset ? offset.y : 0);
                        } else if (shape.type === 'rectangle' && this.dragStart.initialX !== undefined) {
                            const offset = shapeId === this.dragStart.shapeId ? 0 : 
                                this.getShapeOffset(this.dragStart.shapeId, shapeId);
                            shape.x = this.dragStart.initialX + dx + (offset ? offset.x : 0);
                            shape.y = this.dragStart.initialY + dy + (offset ? offset.y : 0);
                        }
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
        if (this.isDragging) {
            // If we were dragging shape(s), update bindings and emit events now
            if (this.dragStart && this.dragStart.shapeId) {
                const selectedIds = this.dragStart.selectedIds || [this.dragStart.shapeId];
                
                selectedIds.forEach(shapeId => {
                    const shape = this.sceneState.shapeStore.get(shapeId);
                    if (!shape) return;
                    
                    // Update bindings with final values (only on drag end)
                    if (shape.type === 'circle') {
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
                    
                    if (shape.type === 'circle') {
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
                    }
                    
                    // Update bindings
                    if (shape.type === 'circle') {
                        shape.setBinding('centerX', new LiteralBinding(shape.centerX));
                        shape.setBinding('centerY', new LiteralBinding(shape.centerY));
                    } else {
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
        
        // Escape: deselect all
        if (e.key === 'Escape') {
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
            // Only delete if not typing in an input field
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
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
