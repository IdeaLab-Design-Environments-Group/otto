/**
 * Shape Library Panel using Factory Pattern
 * Displays draggable shape items for adding to canvas
 */
import { Component } from './Component.js';
import EventBus from '../events/EventBus.js';

export class ShapeLibrary extends Component {
    constructor(container, shapeRegistry) {
        super(container);
        this.shapeRegistry = shapeRegistry;
    }
    
    /**
     * Render the shape library
     */
    render() {
        this.container.innerHTML = '';
        
        const availableTypes = this.shapeRegistry.getAvailableTypes();
        
        availableTypes.forEach(type => {
            const shapeItem = this.createShapeItem(type);
            this.container.appendChild(shapeItem);
        });
    }
    
    /**
     * Create a draggable shape item
     * @param {string} type 
     * @returns {HTMLElement}
     */
    createShapeItem(type) {
        const item = this.createElement('div', {
            class: 'shape-item',
            draggable: 'true',
            'data-shape-type': type
        });
        
        // Shape icon/preview
        const icon = this.createElement('div', {
            class: `shape-icon shape-icon-${type}`
        });
        item.appendChild(icon);
        
        // Shape label
        const label = this.createElement('div', {
            class: 'shape-label'
        }, this.formatShapeName(type));
        item.appendChild(label);
        
        // Event listeners
        item.addEventListener('dragstart', (e) => this.onDragStart(e, type));
        item.addEventListener('dragend', (e) => this.onDragEnd(e));
        
        return item;
    }
    
    /**
     * Format shape type name for display
     * @param {string} type 
     * @returns {string}
     */
    formatShapeName(type) {
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
    
    /**
     * Handle drag start
     * @param {DragEvent} e 
     * @param {string} shapeType 
     */
    onDragStart(e, shapeType) {
        e.dataTransfer.setData('application/json', JSON.stringify({
            type: 'shape',
            shapeType: shapeType
        }));
        e.dataTransfer.effectAllowed = 'copy';
        
        // Emit event so DragDropManager knows what's being dragged
        EventBus.emit('SHAPE_DRAG_START', { shapeType });
        
        // Add visual feedback
        e.target.classList.add('dragging');
    }
    
    /**
     * Handle drag end
     * @param {DragEvent} e 
     */
    onDragEnd(e) {
        e.target.classList.remove('dragging');
        
        // Emit event to clear drag state
        EventBus.emit('SHAPE_DRAG_END', {});
    }
}
