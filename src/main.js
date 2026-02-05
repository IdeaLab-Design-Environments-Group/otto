/**
 * Main Entry Point
 * 
 * This is the application bootstrap file that initializes the entire Nova Otto
 * parametric 2D design system. It sets up the Application instance, connects
 * UI components, and exposes global APIs for plugins and console usage.
 * 
 * @module main
 */

// Main entry point - Initialize Application
import { Application } from './core/Application.js';
import * as Geometry from './geometry/index.js';

/**
 * Global application instance
 * Exposed for debugging and plugin access
 * @type {Application|null}
 */
let app;

/**
 * DOMContentLoaded Event Handler
 * 
 * Initializes the application once the DOM is fully loaded. This ensures all
 * required HTML elements are available before creating UI components.
 * 
 * Sets up:
 * - Application instance with all managers and components
 * - Geometry library initialization (PathKit if available)
 * - Toolbar button event listeners
 * - Global window exports for console/plugin access
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('Nova Otto - Parametric 2D Design System');
    
    try {
        // Create and initialize application (Phase 9)
        // This sets up all core managers, UI components, and connects them
        app = new Application();
        app.init();

        // Expose geometry library for plugins and console usage
        // This allows plugins and console scripts to access geometry utilities
        app.geometry = Geometry;
        if (typeof window !== 'undefined') {
            // Global exports for external access
            window.OttoGeometry = Geometry; // Geometry utilities (Vec, Path, etc.)
            window.OttoCodeRunner = app.codeRunner; // Code execution engine
            
            // Initialize PathKit if available (for advanced path operations)
            // PathKit provides high-performance path manipulation capabilities
            if (window.PathKitInit || window.PathKit) {
                Geometry.initCuttleGeometry({
                    PathKitInit: window.PathKitInit,
                    PathKit: window.PathKit
                });
            }
        }
        
        // Setup UI buttons - connects toolbar buttons to application methods
        setupToolbarButtons(app);
        
        console.log('Application initialized successfully');
        console.log('Phases 1-9 fully implemented and initialized');
        console.log('Keyboard shortcuts:');
        console.log('  Ctrl+S / Cmd+S: Save');
        console.log('  Ctrl+O / Cmd+O: Open file');
        console.log('  Ctrl+Z / Cmd+Z: Undo');
        console.log('  Ctrl+Y / Cmd+Y: Redo');
        console.log('  Ctrl+T / Cmd+T: New tab');
        console.log('  Delete/Backspace: Remove selected shape(s)');
    } catch (error) {
        console.error('Error initializing application:', error);
        console.error(error.stack);
        alert(`Error initializing application: ${error.message}`);
    }
});

/**
 * Setup Toolbar Button Event Listeners
 * 
 * Connects all toolbar buttons to their corresponding application methods.
 * This includes file operations (save/load/export/import), undo/redo,
 * and tool mode toggles.
 * 
 * @param {Application} app - The application instance
 */
function setupToolbarButtons(app) {
    // Save button - saves current scene state to browser storage
    const btnSave = document.getElementById('btn-save');
    if (btnSave) {
        btnSave.addEventListener('click', () => {
            app.save();
        });
    }
    
    // Load button - loads previously saved scene from browser storage
    const btnLoad = document.getElementById('btn-load');
    if (btnLoad) {
        btnLoad.addEventListener('click', async () => {
            const loaded = await app.load();
            if (loaded) {
                alert('Loaded successfully!');
            } else {
                alert('No saved data found or error loading.');
            }
        });
    }
    
    // Export button - exports current scene to .pds file for file system storage
    const btnExport = document.getElementById('btn-export');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            app.exportFile();
        });
    }
    
    // Import button - imports a .pds file from file system
    const btnImport = document.getElementById('btn-import');
    if (btnImport) {
        btnImport.addEventListener('click', async () => {
            await app.importFile();
        });
    }
    
    // Undo button - reverts the last action using command history
    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) {
        btnUndo.addEventListener('click', () => {
            app.undo();
        });
        
        // Update button state based on history
        updateUndoRedoButtons(app, btnUndo, null);
    }
    
    // Redo button - reapplies the last undone action
    const btnRedo = document.getElementById('btn-redo');
    if (btnRedo) {
        btnRedo.addEventListener('click', () => {
            app.redo();
        });
        
        // Update button state based on history
        updateUndoRedoButtons(app, null, btnRedo);
    }
    
    // Update undo/redo buttons periodically and on history changes
    // This keeps the UI in sync with command history state
    const updateInterval = setInterval(() => {
        updateUndoRedoButtons(app, btnUndo, btnRedo);
    }, 100);
    
    // Also update when app is available
    // Expose method for manual UI updates when history changes
    if (app) {
        app.updateUndoRedoUI = function() {
            updateUndoRedoButtons(app, btnUndo, btnRedo);
        };
    }

    // Free draw button - toggles path drawing tool mode
    // When active, allows drawing freeform paths with bezier curves
    const btnFreeDraw = document.getElementById('btn-free-draw');
    if (btnFreeDraw) {
        let drawActive = false;
        btnFreeDraw.addEventListener('click', () => {
            if (!drawActive) {
                drawActive = true;
                btnFreeDraw.classList.toggle('active', drawActive);
                if (app.canvasRenderer) {
                    app.canvasRenderer.setToolMode('path');
                }
                return;
            }

            if (app.canvasRenderer && app.canvasRenderer.isPathDrawing) {
                app.canvasRenderer.finishPathDrawing();
                btnFreeDraw.classList.toggle('active', true);
                drawActive = true;
                return;
            }

            drawActive = false;
            btnFreeDraw.classList.toggle('active', drawActive);
            if (app.canvasRenderer) {
                app.canvasRenderer.setToolMode('select');
            }
        });
    }

    // Assembly plan button - navigates to 3D assembly view
    // Opens a separate page for visualizing 3D assembly of 2D parts
    const btnAssembly = document.getElementById('btn-assembly');
    if (btnAssembly) {
        btnAssembly.addEventListener('click', () => {
            window.location.href = './assemble.html';
        });
    }
}

/**
 * Update Undo/Redo Button States
 * 
 * Enables/disables undo and redo buttons based on command history state.
 * Also updates visual styling (opacity, cursor) to reflect availability.
 * 
 * @param {Application} app - The application instance
 * @param {HTMLElement|null} btnUndo - Undo button element
 * @param {HTMLElement|null} btnRedo - Redo button element
 */
function updateUndoRedoButtons(app, btnUndo, btnRedo) {
    if (app.sceneHistory) {
        if (btnUndo) {
            btnUndo.disabled = !app.sceneHistory.canUndo();
            btnUndo.style.opacity = app.sceneHistory.canUndo() ? '1' : '0.5';
            btnUndo.style.cursor = app.sceneHistory.canUndo() ? 'pointer' : 'not-allowed';
        }
        
        if (btnRedo) {
            btnRedo.disabled = !app.sceneHistory.canRedo();
            btnRedo.style.opacity = app.sceneHistory.canRedo() ? '1' : '0.5';
            btnRedo.style.cursor = app.sceneHistory.canRedo() ? 'pointer' : 'not-allowed';
        }
    }
}

export { app };
