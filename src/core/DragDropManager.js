/**
 * DragDropManager using Mediator Pattern
 * Mediates between drag sources (ShapeLibrary) and drop targets (Canvas)
 */
import EventBus from '../events/EventBus.js';

export class DragDropManager {
    constructor(canvas, shapeStore, shapeRegistry) {
        this.canvas = canvas;
        this.shapeStore = shapeStore;
        this.shapeRegistry = shapeRegistry;
        this.canvasContainer = canvas.parentElement;
        
        // Drag state
        this.isDragging = false;
        this.draggedShapeType = null;
        this.dragPreviewPosition = { x: 0, y: 0 };
        this.screenToWorldConverter = null; // Will be set by canvas renderer
        
        // Setup drop target
        this.setupDropTarget();
        
        // Subscribe to drag start/end events from ShapeLibrary
        this.subscribeToDragEvents();
    }
    
    /**
     * Subscribe to drag events from ShapeLibrary
     */
    subscribeToDragEvents() {
        EventBus.subscribe('SHAPE_DRAG_START', (payload) => {
            if (payload && payload.shapeType) {
                this.draggedShapeType = payload.shapeType;
                this.isDragging = true;
            }
        });
        
        EventBus.subscribe('SHAPE_DRAG_END', () => {
            this.clearPreview();
        });
    }
    
    /**
     * Set screen to world coordinate converter
     * @param {Function} converter - Function that takes (x, y) and returns world coordinates
     */
    setScreenToWorldConverter(converter) {
        this.screenToWorldConverter = converter;
    }
    
    /**
     * Setup drop target on canvas container
     */
    setupDropTarget() {
        // Setup listeners on both container and canvas element
        const elements = [this.canvasContainer, this.canvas];
        
        elements.forEach(element => {
            element.addEventListener('dragover', (e) => {
                this.onDragOver(e);
            }, false);
            
            element.addEventListener('dragenter', (e) => {
                this.onDragEnter(e);
            }, false);
            
            element.addEventListener('dragleave', (e) => {
                this.onDragLeave(e);
            }, false);
            
            element.addEventListener('drop', (e) => {
                this.onDrop(e);
            }, false);
        });
        
        console.log('DragDropManager: Drop targets setup on canvas and container');
    }
    
    /**
     * Handle drag over event
     * @param {DragEvent} e 
     */
    onDragOver(e) {
        // Convert DataTransferList to array for checking
        const hasJsonData = Array.from(e.dataTransfer.types).includes('application/json');
        
        if (hasJsonData) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
            
            // Update preview position if we know the shape type
            if (this.isDragging && this.draggedShapeType) {
                const rect = this.canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                this.updatePreview(x, y);
            }
        }
    }
    
    /**
     * Handle drag enter event
     * @param {DragEvent} e 
     */
    onDragEnter(e) {
        // Convert DataTransferList to array for checking
        const hasJsonData = Array.from(e.dataTransfer.types).includes('application/json');
        
        if (hasJsonData) {
            e.preventDefault();
            e.stopPropagation();
            this.canvasContainer.classList.add('drag-over');
            this.isDragging = true;
            console.log('DragDropManager: Drag enter detected');
        }
    }
    
    /**
     * Handle drag leave event
     * @param {DragEvent} e 
     */
    onDragLeave(e) {
        // Only remove class if we're actually leaving the container
        if (!this.canvasContainer.contains(e.relatedTarget)) {
            this.canvasContainer.classList.remove('drag-over');
            this.clearPreview();
        }
    }
    
    /**
     * Handle drop event
     * @param {DragEvent} e 
     */
    onDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.canvasContainer.classList.remove('drag-over');
        
        console.log('DragDropManager: Drop event detected');
        console.log('DataTransfer types:', Array.from(e.dataTransfer.types));
        
        try {
            // Get data (only available during drop event)
            const dataStr = e.dataTransfer.getData('application/json');
            console.log('Drop data string:', dataStr);
            
            if (!dataStr) {
                console.warn('DragDropManager: No drag data available');
                this.clearPreview();
                return;
            }
            
            const data = JSON.parse(dataStr);
            console.log('Parsed drop data:', data);
            
            if (data.type === 'shape' && data.shapeType) {
                // Store shape type for potential preview
                this.draggedShapeType = data.shapeType;
                
                // Get canvas coordinates
                const rect = this.canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                console.log(`Drop at screen coordinates: (${x}, ${y})`);
                
                // Convert screen coordinates to world coordinates
                let worldPos;
                if (this.screenToWorldConverter) {
                    worldPos = this.screenToWorldConverter(x, y);
                    console.log(`Converted to world coordinates: (${worldPos.x}, ${worldPos.y})`);
                } else {
                    // Fallback: use screen coordinates directly
                    worldPos = { x, y };
                    console.warn('No screenToWorldConverter, using screen coordinates');
                }
                
                // Create new shape at drop position using ShapeRegistry
                const shape = this.shapeRegistry.create(data.shapeType, { 
                    x: worldPos.x, 
                    y: worldPos.y 
                });
                
                console.log('Created shape:', shape);
                
                // Add shape to store (will emit SHAPE_ADDED event)
                this.shapeStore.add(shape);
                
                // Select the new shape
                this.shapeStore.setSelected(shape.id);
                
                console.log('Shape added and selected successfully');
            } else {
                console.warn('DragDropManager: Invalid drop data:', data);
            }
        } catch (error) {
            console.error('DragDropManager: Error handling drop:', error);
            console.error(error.stack);
        } finally {
            // Always clear drag state
            this.clearPreview();
        }
    }
    
    /**
     * Update drag preview position
     * @param {number} x - Screen X coordinate
     * @param {number} y - Screen Y coordinate
     */
    updatePreview(x, y) {
        this.dragPreviewPosition = { x, y };
        
        // Only emit if we have a shape type (will be set on drop)
        if (this.draggedShapeType) {
            // Emit event to canvas renderer to update preview
            EventBus.emit('DRAG_PREVIEW_UPDATE', {
                shapeType: this.draggedShapeType,
                position: this.dragPreviewPosition
            });
        }
    }
    
    /**
     * Clear drag preview
     */
    clearPreview() {
        this.dragPreviewPosition = { x: 0, y: 0 };
        this.isDragging = false;
        this.draggedShapeType = null;
        
        // Emit event to canvas renderer to clear preview
        EventBus.emit('DRAG_PREVIEW_CLEAR', {});
    }
}
