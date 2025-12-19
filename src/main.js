// Main entry point - Initialize Application
import { Application } from './core/Application.js';

// Global application instance
let app;

document.addEventListener('DOMContentLoaded', () => {
    console.log('Nova Otto - Parametric 2D Design System');
    
    try {
        // Create and initialize application (Phase 9)
        app = new Application();
        app.init();
        
        // Setup UI buttons
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
 * Setup toolbar button event listeners
 * @param {Application} app 
 */
function setupToolbarButtons(app) {
    // Save button
    const btnSave = document.getElementById('btn-save');
    if (btnSave) {
        btnSave.addEventListener('click', () => {
            app.save();
        });
    }
    
    // Load button
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
    
    // Export button
    const btnExport = document.getElementById('btn-export');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            app.exportFile();
        });
    }
    
    // Import button
    const btnImport = document.getElementById('btn-import');
    if (btnImport) {
        btnImport.addEventListener('click', async () => {
            await app.importFile();
        });
    }
    
    // Undo button
    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) {
        btnUndo.addEventListener('click', () => {
            app.undo();
        });
        
        // Update button state based on history
        updateUndoRedoButtons(app, btnUndo, null);
    }
    
    // Redo button
    const btnRedo = document.getElementById('btn-redo');
    if (btnRedo) {
        btnRedo.addEventListener('click', () => {
            app.redo();
        });
        
        // Update button state based on history
        updateUndoRedoButtons(app, null, btnRedo);
    }
    
    // Update undo/redo buttons periodically and on history changes
    const updateInterval = setInterval(() => {
        updateUndoRedoButtons(app, btnUndo, btnRedo);
    }, 100);
    
    // Also update when app is available
    if (app) {
        app.updateUndoRedoUI = function() {
            updateUndoRedoButtons(app, btnUndo, btnRedo);
        };
    }
}

/**
 * Update undo/redo button states
 * @param {Application} app 
 * @param {HTMLElement|null} btnUndo 
 * @param {HTMLElement|null} btnRedo 
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
