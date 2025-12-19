/**
 * Zoom Controls UI Component
 * Provides zoom in/out, fit to content, reset zoom, and zoom percentage display
 */
import { Component } from './Component.js';
import EventBus, { EVENTS } from '../events/EventBus.js';

export class ZoomControls extends Component {
    constructor(container, viewport) {
        super(container);
        this.viewport = viewport;
        this.onZoomChange = null;
    }
    
    /**
     * Render zoom controls
     */
    render() {
        this.container.innerHTML = '';
        
        const controls = this.createElement('div', {
            class: 'zoom-controls'
        });
        
        // Zoom out button
        const btnZoomOut = this.createElement('button', {
            class: 'zoom-btn',
            title: 'Zoom Out'
        }, '-');
        btnZoomOut.addEventListener('click', () => {
            this.zoom(-0.1);
        });
        
        // Zoom percentage display
        const zoomDisplay = this.createElement('span', {
            class: 'zoom-display'
        }, this.getZoomPercentage());
        
        // Zoom in button
        const btnZoomIn = this.createElement('button', {
            class: 'zoom-btn',
            title: 'Zoom In'
        }, '+');
        btnZoomIn.addEventListener('click', () => {
            this.zoom(0.1);
        });
        
        // Fit to content button
        const btnFit = this.createElement('button', {
            class: 'zoom-btn zoom-btn-fit',
            title: 'Fit to Content'
        }, 'Fit');
        btnFit.addEventListener('click', () => {
            this.fitToContent();
        });
        
        // Reset zoom button
        const btnReset = this.createElement('button', {
            class: 'zoom-btn zoom-btn-reset',
            title: 'Reset Zoom (100%)'
        }, '100%');
        btnReset.addEventListener('click', () => {
            this.resetZoom();
        });
        
        controls.appendChild(btnZoomOut);
        controls.appendChild(zoomDisplay);
        controls.appendChild(btnZoomIn);
        controls.appendChild(btnFit);
        controls.appendChild(btnReset);
        
        this.container.appendChild(controls);
        
        // Subscribe to viewport changes to update display
        if (!this._zoomSubscribed) {
            this.subscribe(EVENTS.VIEWPORT_CHANGED, () => {
                this.updateZoomDisplay();
            });
            this._zoomSubscribed = true;
        }
        
        // Store reference to zoom display for updates
        this.zoomDisplayElement = zoomDisplay;
    }
    
    /**
     * Get current zoom as percentage
     * @returns {string}
     */
    getZoomPercentage() {
        return Math.round(this.viewport.zoom * 100) + '%';
    }
    
    /**
     * Update zoom display element
     */
    updateZoomDisplay() {
        if (this.zoomDisplayElement) {
            this.zoomDisplayElement.textContent = this.getZoomPercentage();
        } else {
            // Re-render if element not found
            this.render();
        }
    }
    
    /**
     * Zoom by a factor
     * @param {number} factor - Positive to zoom in, negative to zoom out
     */
    zoom(factor) {
        if (this.onZoomChange) {
            const newZoom = Math.max(0.1, Math.min(5, this.viewport.zoom + factor));
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            this.onZoomChange(newZoom / this.viewport.zoom, centerX, centerY);
            // Update display immediately
            this.updateZoomDisplay();
        }
    }
    
    /**
     * Fit all shapes to view
     */
    fitToContent() {
        if (this.onZoomChange) {
            // Get all shapes bounds
            const shapes = this.sceneState ? this.sceneState.shapeStore.getResolved() : [];
            if (shapes.length === 0) {
                this.resetZoom();
                return;
            }
            
            // Calculate bounding box
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            shapes.forEach(shape => {
                const bounds = shape.getBounds();
                minX = Math.min(minX, bounds.x);
                minY = Math.min(minY, bounds.y);
                maxX = Math.max(maxX, bounds.x + bounds.width);
                maxY = Math.max(maxY, bounds.y + bounds.height);
            });
            
            const width = maxX - minX;
            const height = maxY - minY;
            const padding = 50;
            
            // Calculate zoom to fit
            const canvasWidth = this.canvas ? this.canvas.width : window.innerWidth;
            const canvasHeight = this.canvas ? this.canvas.height : window.innerHeight;
            
            const zoomX = (canvasWidth - padding * 2) / width;
            const zoomY = (canvasHeight - padding * 2) / height;
            const targetZoom = Math.min(zoomX, zoomY, 5);
            
            // Center viewport on shapes
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            
            this.viewport.zoom = targetZoom;
            this.viewport.x = canvasWidth / 2 - centerX * targetZoom;
            this.viewport.y = canvasHeight / 2 - centerY * targetZoom;
            
            EventBus.emit(EVENTS.VIEWPORT_CHANGED, { viewport: this.viewport });
            this.render();
        }
    }
    
    /**
     * Reset zoom to 100%
     */
    resetZoom() {
        if (this.onZoomChange) {
            const factor = 1 / this.viewport.zoom;
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            this.onZoomChange(factor, centerX, centerY);
            // Update display immediately
            this.updateZoomDisplay();
        }
    }
    
    /**
     * Set scene state reference (for fit to content)
     * @param {SceneState} sceneState 
     */
    setSceneState(sceneState) {
        this.sceneState = sceneState;
    }
    
    /**
     * Set canvas reference (for fit to content)
     * @param {HTMLCanvasElement} canvas 
     */
    setCanvas(canvas) {
        this.canvas = canvas;
    }
}
