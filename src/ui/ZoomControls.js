/**
 * @fileoverview Zoom-controls toolbar component.
 *
 * Renders a compact row of buttons and a live percentage display that lets the
 * user zoom in, zoom out, fit all shapes into view, or reset to 100%.
 *
 * The component owns no zoom logic itself -- every zoom mutation is delegated
 * to an {@link ZoomControls#onZoomChange} callback that Application injects
 * after construction.  This keeps ZoomControls a pure presentation layer and
 * lets Application remain the single source of truth for the viewport state.
 *
 * The percentage display is kept in sync with the viewport by subscribing to
 * {@link EVENTS.VIEWPORT_CHANGED} through the inherited Component.subscribe()
 * mechanism, which guarantees automatic cleanup on unmount.
 *
 * @module ui/ZoomControls
 */
import { Component } from './Component.js';
import EventBus, { EVENTS } from '../events/EventBus.js';

/**
 * Zoom toolbar component.
 *
 * Provides zoom-in (+), zoom-out (-), fit-to-content (Fit), reset-to-100%
 * (100%), and a live percentage label.  Extends {@link Component}.
 *
 * @class ZoomControls
 * @extends Component
 */
export class ZoomControls extends Component {
    /**
     * @param {HTMLElement} container - The DOM element this toolbar renders into.
     * @param {{x: number, y: number, zoom: number}} viewport - The shared
     *   viewport state object.  This is the same object that CanvasRenderer and
     *   Application hold references to; mutations to it are visible everywhere.
     *   ZoomControls reads viewport.zoom to compute the displayed percentage and
     *   writes to it directly in fitToContent().
     */
    constructor(container, viewport) {
        super(container);
        /**
         * @type {{x: number, y: number, zoom: number}} The shared viewport
         * state object.  Read by getZoomPercentage(); written by fitToContent().
         */
        this.viewport = viewport;
        /**
         * @type {?function(number, number, number): void} Callback invoked
         * whenever the user requests a zoom change via the +/- buttons or the
         * reset button.  Arguments are (zoomRatio, centerScreenX, centerScreenY).
         * Set by Application after construction; null until then, which causes
         * zoom() and resetZoom() to no-op.
         */
        this.onZoomChange = null;
    }
    
    /**
     * Render the zoom-controls toolbar.
     *
     * Builds the following button layout (left to right):
     *   [ - ]  [ 85% ]  [ + ]  [ Fit ]  [ 100% ]
     *
     * Button responsibilities:
     * - `-` calls zoom(-0.1) -- decreases the absolute zoom value by 0.1.
     * - `+` calls zoom(+0.1) -- increases the absolute zoom value by 0.1.
     * - `Fit` calls fitToContent() -- computes and applies the zoom/pan that
     *   makes all shapes visible with padding.
     * - `100%` calls resetZoom() -- returns the viewport to baseZoom.
     *
     * The percentage span (`zoom-display`) is populated with the current zoom
     * immediately and then kept up to date via a VIEWPORT_CHANGED subscription.
     * A direct reference to the span element is stored in
     * {@link ZoomControls#zoomDisplayElement} so that
     * {@link ZoomControls#updateZoomDisplay} can patch just the text content
     * without re-rendering the entire toolbar.
     *
     * The VIEWPORT_CHANGED subscription is guarded by a `_zoomSubscribed` flag
     * so that repeated calls to render() (e.g. on window resize) do not
     * accumulate duplicate listeners.  The flag is reset when the component is
     * unmounted because Component.unmount() drains all subscriptions.
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
     * Compute the current zoom level as a human-readable percentage string.
     *
     * The percentage is expressed *relative to baseZoom*, not relative to an
     * absolute value of 1.  baseZoom is the zoom level at which the canvas
     * fills its container at a 1:1 pixel ratio -- it is computed by
     * CanvasRenderer.resizeCanvas() and injected via getBaseZoom().  Displaying
     * the percentage relative to baseZoom means "100%" always corresponds to
     * "the canvas exactly fills the viewport", regardless of window size.
     *
     * Falls back to baseZoom = 1 when getBaseZoom has not yet been injected
     * (e.g. during the very first render before Application wires things up).
     *
     * @returns {string} The zoom percentage with a '%' suffix (e.g. '150%').
     */
    getZoomPercentage() {
        const baseZoom = this.getBaseZoom ? this.getBaseZoom() : 1;
        return Math.round((this.viewport.zoom / baseZoom) * 100) + '%';
    }
    
    /**
     * Refresh the live zoom-percentage label without re-rendering the toolbar.
     *
     * Directly patches the textContent of the stored span reference
     * ({@link ZoomControls#zoomDisplayElement}).  This is a micro-optimisation:
     * the toolbar buttons and layout do not change when zoom changes, so
     * touching only the label avoids unnecessary DOM churn and layout
     * recalculations.
     *
     * If the element reference has been lost (e.g. something external cleared
     * the container), falls back to a full render() call to rebuild the toolbar.
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
     * Adjust the zoom level by an additive delta and notify Application.
     *
     * The new absolute zoom is computed as `viewport.zoom + factor` and then
     * clamped to the range [0.1, 5] to prevent the user from zooming out to
     * nothing or in to an unusable magnification.
     *
     * The callback ({@link ZoomControls#onZoomChange}) receives a *ratio*
     * (newZoom / oldZoom), not the absolute value.  This is because
     * CanvasRenderer.zoom() expects a multiplicative factor so it can
     * re-centre the viewport around the provided screen point.  The screen
     * point passed here is the centre of the window, which keeps the middle
     * of the visible area stable while the toolbar buttons are used.
     *
     * The percentage display is updated immediately (without waiting for the
     * VIEWPORT_CHANGED event) so the UI feels responsive.
     *
     * @param {number} factor - Additive change to viewport.zoom.  Positive
     *   values zoom in; negative values zoom out.  The +/- buttons pass
     *   +0.1 and -0.1 respectively.
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
     * Zoom and pan so that every shape on the canvas is visible with padding.
     *
     * Algorithm:
     * 1. Fetch all *resolved* shapes (bindings evaluated) from the scene's
     *    ShapeStore.  If none exist, fall back to resetZoom() and return early.
     * 2. Walk every shape's bounding box to compute the overall axis-aligned
     *    bounding box (minX, minY, maxX, maxY) that encloses all shapes.
     * 3. Compute two candidate zoom factors -- one for the horizontal axis
     *    (`zoomX`) and one for the vertical axis (`zoomY`) -- each calculated
     *    so that the shapes' extent plus 50 px of padding on each side exactly
     *    fills the canvas dimension.
     * 4. Take the *minimum* of zoomX and zoomY to maintain aspect ratio (the
     *    shapes will not be stretched), and cap at 5x to stay within the
     *    global zoom ceiling.
     * 5. Re-centre the viewport so that the bounding box centre maps to the
     *    canvas centre.
     * 6. Write the new zoom and pan directly into the shared viewport object
     *    and emit VIEWPORT_CHANGED so that CanvasRenderer re-renders and
     *    ZoomControls updates its percentage label.
     *
     * Requires that {@link ZoomControls#setSceneState} and
     * {@link ZoomControls#setCanvas} have been called by Application beforehand;
     * otherwise the shapes list or canvas dimensions fall back to window size.
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
     * Reset the zoom back to 100% (baseZoom).
     *
     * Computes the ratio needed to bring the current zoom back to baseZoom
     * (`baseZoom / viewport.zoom`) and passes it to {@link ZoomControls#onZoomChange}
     * with the window centre as the zoom origin.  This causes CanvasRenderer to
     * scale the viewport so that the centre of the screen stays fixed while
     * the zoom snaps to 100%.
     *
     * Falls back to baseZoom = 1 when getBaseZoom has not been injected.
     * The percentage display is updated immediately for responsiveness.
     */
    resetZoom() {
        if (this.onZoomChange) {
            const baseZoom = this.getBaseZoom ? this.getBaseZoom() : 1;
            const factor = baseZoom / this.viewport.zoom;
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            this.onZoomChange(factor, centerX, centerY);
            // Update display immediately
            this.updateZoomDisplay();
        }
    }
    
    /**
     * Inject the scene-state reference needed by {@link ZoomControls#fitToContent}.
     *
     * Called once by Application during initialisation.  The sceneState object
     * exposes shapeStore.getResolved(), which fitToContent() uses to obtain
     * every shape's bounding box.
     *
     * @param {object} sceneState - The application-level scene state container.
     *   Must expose at minimum `{ shapeStore: { getResolved(): Shape[] } }`.
     */
    setSceneState(sceneState) {
        this.sceneState = sceneState;
    }

    /**
     * Inject the canvas element reference needed by {@link ZoomControls#fitToContent}.
     *
     * Called once by Application during initialisation.  fitToContent() reads
     * canvas.width and canvas.height to determine the available drawing area.
     * Without this reference, the method falls back to window.innerWidth /
     * innerHeight, which may not match the actual canvas size when panels are
     * open.
     *
     * @param {HTMLCanvasElement} canvas - The main drawing canvas element.
     */
    setCanvas(canvas) {
        this.canvas = canvas;
    }
}
