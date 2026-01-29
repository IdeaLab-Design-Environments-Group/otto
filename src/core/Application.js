/**
 * Application class using Facade Pattern and Dependency Injection
 * Provides a unified interface for the entire application
 */
import { TabManager } from './TabManager.js';
import { ShapeRegistry } from '../models/shapes/ShapeRegistry.js';
import { ShapeLibrary } from '../ui/ShapeLibrary.js';
import { CanvasRenderer } from '../ui/CanvasRenderer.js';
import { ParametersMenu } from '../ui/ParametersMenu.js';
import { PropertiesPanel } from '../ui/PropertiesPanel.js';
import { TabBar } from '../ui/TabBar.js';
import { ZoomControls } from '../ui/ZoomControls.js';
import { DragDropManager } from './DragDropManager.js';
import { Serializer } from '../persistence/Serializer.js';
import { StorageManager } from '../persistence/StorageManager.js';
import { FileManager } from '../persistence/FileManager.js';
import { SceneHistory, SceneMemento } from './SceneState.js';
import EventBus, { EVENTS } from '../events/EventBus.js';

export class Application {
    constructor() {
        // Core managers
        this.tabManager = new TabManager();
        // Serializer is a static class, no instance needed
        this.storageManager = new StorageManager(this.tabManager, Serializer);
        this.fileManager = new FileManager(this.tabManager, Serializer);
        
        // UI Components (will be initialized in init)
        this.canvasRenderer = null;
        this.shapeLibrary = null;
        this.parametersMenu = null;
        this.propertiesPanel = null;
        this.tabBar = null;
        this.zoomControls = null;
        this.dragDropManager = null;
        
        // Undo/Redo history
        this.sceneHistory = null;
        
        // Current scene state reference
        this.currentSceneState = null;
    }
    
    /**
     * Initialize the application
     */
    init() {
        // Get DOM elements
        const tabBarContainer = document.getElementById('tab-bar-container');
        const shapeLibraryContainer = document.getElementById('shape-library-container');
        const canvasElement = document.getElementById('main-canvas');
        const parametersMenuContainer = document.getElementById('parameters-menu-container');
        const propertiesPanelContainer = document.getElementById('properties-panel-container');
        const zoomControlsContainer = document.getElementById('zoom-controls-container');

        if (!tabBarContainer || !shapeLibraryContainer || !canvasElement ||
            !parametersMenuContainer || !propertiesPanelContainer || !zoomControlsContainer) {
            throw new Error('Required DOM elements not found');
        }
        
        // Get current scene state
        this.currentSceneState = this.tabManager.getActiveScene();
        if (!this.currentSceneState) {
            throw new Error('No active scene available');
        }
        
        // Initialize undo/redo history for active scene
        this.sceneHistory = new SceneHistory(50);
        
        // Create initial snapshot
        this.createHistorySnapshot();
        
        // Initialize UI components
        this.tabBar = new TabBar(tabBarContainer, this.tabManager);
        this.tabBar.mount();
        
        this.shapeLibrary = new ShapeLibrary(shapeLibraryContainer, ShapeRegistry);
        this.shapeLibrary.mount();
        
        this.canvasRenderer = new CanvasRenderer(
            canvasElement, 
            this.currentSceneState, 
            this.currentSceneState.bindingResolver
        );
        
        // Initialize Zoom Controls
        this.zoomControls = new ZoomControls(zoomControlsContainer, this.currentSceneState.viewport);
        this.zoomControls.setSceneState(this.currentSceneState);
        this.zoomControls.setCanvas(canvasElement);
        this.zoomControls.onZoomChange = (factor, centerX, centerY) => {
            this.canvasRenderer.zoom(factor, centerX, centerY);
        };
        this.zoomControls.mount();
        
        this.parametersMenu = new ParametersMenu(
            parametersMenuContainer, 
            this.currentSceneState.parameterStore
        );
        this.parametersMenu.mount();
        
        this.propertiesPanel = new PropertiesPanel(
            propertiesPanelContainer, 
            this.currentSceneState.shapeStore, 
            this.currentSceneState.parameterStore
        );
        this.propertiesPanel.mount();
        
        // Initialize DragDropManager
        this.dragDropManager = new DragDropManager(
            canvasElement,
            this.currentSceneState.shapeStore,
            ShapeRegistry
        );

        // Connect DragDropManager with CanvasRenderer
        this.dragDropManager.setScreenToWorldConverter((x, y) => {
            return this.canvasRenderer.screenToWorld(x, y);
        });

        // Setup event listeners
        this.setupEventListeners();
        
        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();
        
        // Load initial state (autosave if available)
        this.loadInitialState();
        
        // Start autosave
        this.storageManager.startAutoSave();
        
        // Initialize undo/redo button states
        this.updateUndoRedoUI();
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for tab switches to update components
        EventBus.subscribe(EVENTS.TAB_SWITCHED, ({ tab }) => {
            if (tab) {
                this.currentSceneState = tab.sceneState;
                this.updateComponentsForNewScene(this.currentSceneState);
                
                // Reset history for new scene
                this.sceneHistory = new SceneHistory(50);
            }
        });
        
        // Listen for shape/parameter changes to create history snapshots
        EventBus.subscribe(EVENTS.SHAPE_ADDED, () => {
            setTimeout(() => this.createHistorySnapshot(), 100);
        });
        EventBus.subscribe(EVENTS.SHAPE_REMOVED, () => {
            setTimeout(() => this.createHistorySnapshot(), 100);
        });
        EventBus.subscribe(EVENTS.SHAPE_MOVED, () => {
            setTimeout(() => this.createHistorySnapshot(), 100);
        });
        EventBus.subscribe(EVENTS.PARAM_ADDED, () => {
            setTimeout(() => this.createHistorySnapshot(), 100);
        });
        EventBus.subscribe(EVENTS.PARAM_REMOVED, () => {
            setTimeout(() => this.createHistorySnapshot(), 100);
        });
        EventBus.subscribe(EVENTS.PARAM_CHANGED, () => {
            setTimeout(() => this.createHistorySnapshot(), 100);
        });
    }
    
    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+S or Cmd+S: Save
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.save();
            }
            
            // Ctrl+O or Cmd+O: Open
            if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
                e.preventDefault();
                this.importFile();
            }
            
            // Ctrl+Z or Cmd+Z: Undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
                this.updateUndoRedoUI();
            }
            
            // Ctrl+Y or Cmd+Y or Ctrl+Shift+Z: Redo
            if (((e.ctrlKey || e.metaKey) && e.key === 'y') || 
                ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
                e.preventDefault();
                this.redo();
                this.updateUndoRedoUI();
            }
            
            // Ctrl+T or Cmd+T: New tab
            if ((e.ctrlKey || e.metaKey) && e.key === 't') {
                e.preventDefault();
                this.newTab();
            }
            
            // Delete: Remove selected shape
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                this.deleteSelectedShape();
            }
        });
    }
    
    /**
     * Update components when switching to a new scene
     * @param {SceneState} sceneState 
     */
    updateComponentsForNewScene(sceneState) {
        // Update canvas renderer
        this.canvasRenderer.sceneState = sceneState;
        this.canvasRenderer.viewport = sceneState.viewport;
        this.canvasRenderer.bindingResolver = sceneState.bindingResolver;
        this.canvasRenderer.render();
        
        // Update zoom controls
        if (this.zoomControls) {
            this.zoomControls.viewport = sceneState.viewport;
            this.zoomControls.setSceneState(sceneState);
            this.zoomControls.render();
        }
        
        // Reset history for new scene
        this.sceneHistory = new SceneHistory(50);
        // Create initial snapshot for new scene
        setTimeout(() => this.createHistorySnapshot(), 100);
        
        // Update parameters menu
        this.parametersMenu.parameterStore = sceneState.parameterStore;
        this.parametersMenu.render();
        
        // Update properties panel
        this.propertiesPanel.shapeStore = sceneState.shapeStore;
        this.propertiesPanel.parameterStore = sceneState.parameterStore;
        this.propertiesPanel.bindingResolver = sceneState.bindingResolver;
        this.propertiesPanel.selectedShape = null;
        this.propertiesPanel.render();
        
        // Update drag drop manager
        this.dragDropManager.shapeStore = sceneState.shapeStore;
    }
    
    /**
     * Create a history snapshot
     * Uses debouncing to avoid creating too many snapshots
     */
    createHistorySnapshot() {
        if (!this._historyTimeout && this.currentSceneState && this.sceneHistory) {
            this._historyTimeout = setTimeout(() => {
                if (this.currentSceneState && this.sceneHistory) {
                    try {
                        const memento = this.currentSceneState.createMemento();
                        this.sceneHistory.push(memento);
                        this.updateUndoRedoUI();
                    } catch (error) {
                        console.error('Error creating history snapshot:', error);
                    }
                }
                this._historyTimeout = null;
            }, 300); // Debounce for 300ms
        }
    }
    
    /**
     * Load initial state from autosave
     */
    async loadInitialState() {
        try {
            const tabManager = await this.storageManager.load();
            if (tabManager) {
                // Replace current tab manager with loaded one
                this.tabManager = tabManager;
                
                // Update file and storage managers to use new tab manager
                this.storageManager.tabManager = tabManager;
                this.fileManager.tabManager = tabManager;
                
                // Update tab bar
                this.tabBar.tabManager = tabManager;
                this.tabBar.render();
                
                // Update current scene
                this.currentSceneState = this.tabManager.getActiveScene();
                if (this.currentSceneState) {
                    this.updateComponentsForNewScene(this.currentSceneState);
                }
                
                console.log('Loaded autosave');
            }
        } catch (error) {
            console.error('Error loading initial state:', error);
        }
    }
    
    /**
     * Create a new tab
     */
    newTab() {
        const tabNumber = this.tabManager.tabs.length + 1;
        this.tabManager.createTab(`Scene ${tabNumber}`);
    }
    
    /**
     * Save current state (manual save to localStorage)
     */
    save() {
        const success = this.storageManager.save();
        if (success) {
            console.log('Saved successfully');
            this.showNotification('Saved successfully!', 'success');
        } else {
            this.showNotification('Error saving file', 'error');
        }
        return success;
    }
    
    /**
     * Load from localStorage
     */
    async load() {
        const tabManager = await this.storageManager.load();
        if (tabManager) {
            this.tabManager = tabManager;
            this.storageManager.tabManager = tabManager;
            this.fileManager.tabManager = tabManager;
            this.tabBar.tabManager = tabManager;
            this.tabBar.render();
            this.currentSceneState = this.tabManager.getActiveScene();
            if (this.currentSceneState) {
                this.updateComponentsForNewScene(this.currentSceneState);
                this.sceneHistory = new SceneHistory(50);
            }
            console.log('Loaded successfully');
            this.showNotification('Loaded successfully!', 'success');
            return true;
        }
        this.showNotification('No saved data found', 'error');
        return false;
    }
    
    /**
     * Export to file
     * @param {string} filename 
     */
    exportFile(filename = null) {
        const success = this.fileManager.exportToFile(filename);
        if (success) {
            this.showNotification('File exported successfully!', 'success');
        } else {
            this.showNotification('Error exporting file', 'error');
        }
        return success;
    }
    
    /**
     * Import from file
     */
    async importFile() {
        const tabManager = await this.fileManager.showImportDialog();
        if (tabManager) {
            this.tabManager = tabManager;
            this.storageManager.tabManager = tabManager;
            this.fileManager.tabManager = tabManager;
            this.tabBar.tabManager = tabManager;
            this.tabBar.render();
            this.currentSceneState = this.tabManager.getActiveScene();
            if (this.currentSceneState) {
                this.updateComponentsForNewScene(this.currentSceneState);
                this.sceneHistory = new SceneHistory(50);
            }
            console.log('Imported successfully');
            this.showNotification('File imported successfully!', 'success');
        }
    }
    
    /**
     * Show notification message
     * @param {string} message 
     * @param {string} type - 'success' or 'error'
     */
    showNotification(message, type = 'success') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Add to document
        document.body.appendChild(notification);
        
        // Show notification
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
    
    /**
     * Undo last action
     */
    async undo() {
        if (!this.sceneHistory || !this.currentSceneState) {
            console.log('Cannot undo: no history or scene state');
            return;
        }
        
        if (this.sceneHistory.canUndo()) {
            try {
                // Clear any pending history snapshot to avoid conflicts
                if (this._historyTimeout) {
                    clearTimeout(this._historyTimeout);
                    this._historyTimeout = null;
                }
                
                const memento = this.sceneHistory.undo();
                if (memento) {
                    await this.currentSceneState.restoreMemento(memento);
                    
                    // Update all UI components
                    if (this.canvasRenderer) {
                        this.canvasRenderer.render();
                    }
                    if (this.parametersMenu) {
                        this.parametersMenu.render();
                    }
                    if (this.propertiesPanel) {
                        this.propertiesPanel.render();
                    }
                    if (this.zoomControls) {
                        this.zoomControls.updateZoomDisplay();
                    }

                    this.updateUndoRedoUI();
                    console.log('Undo successful');
                }
            } catch (error) {
                console.error('Error during undo:', error);
            }
        } else {
            console.log('Cannot undo: no undo history available');
        }
    }
    
    /**
     * Redo last undone action
     */
    async redo() {
        if (!this.sceneHistory || !this.currentSceneState) {
            console.log('Cannot redo: no history or scene state');
            return;
        }
        
        if (this.sceneHistory.canRedo()) {
            try {
                // Clear any pending history snapshot to avoid conflicts
                if (this._historyTimeout) {
                    clearTimeout(this._historyTimeout);
                    this._historyTimeout = null;
                }
                
                const memento = this.sceneHistory.redo();
                if (memento) {
                    await this.currentSceneState.restoreMemento(memento);
                    
                    // Update all UI components
                    if (this.canvasRenderer) {
                        this.canvasRenderer.render();
                    }
                    if (this.parametersMenu) {
                        this.parametersMenu.render();
                    }
                    if (this.propertiesPanel) {
                        this.propertiesPanel.render();
                    }
                    if (this.zoomControls) {
                        this.zoomControls.updateZoomDisplay();
                    }

                    this.updateUndoRedoUI();
                    console.log('Redo successful');
                }
            } catch (error) {
                console.error('Error during redo:', error);
            }
        } else {
            console.log('Cannot redo: no redo history available');
        }
    }
    
    /**
     * Delete selected shape(s) - supports multi-selection
     */
    deleteSelectedShape() {
        if (!this.currentSceneState) return;
        
        const selectedIds = Array.from(this.currentSceneState.shapeStore.getSelectedIds());
        const singleSelected = this.currentSceneState.shapeStore.getSelected();
        
        // Get all selected shapes
        const idsToDelete = selectedIds.length > 0 ? selectedIds : (singleSelected ? [singleSelected.id] : []);
        
        if (idsToDelete.length > 0) {
            // Delete all selected shapes
            idsToDelete.forEach(shapeId => {
                this.currentSceneState.shapeStore.remove(shapeId);
            });
            
            // Clear selection after deletion
            this.currentSceneState.shapeStore.clearSelection();
            
            console.log(`Deleted ${idsToDelete.length} shape(s)`);
        }
    }
    
    /**
     * Update undo/redo button UI states
     */
    updateUndoRedoUI() {
        const btnUndo = document.getElementById('btn-undo');
        const btnRedo = document.getElementById('btn-redo');
        
        if (this.sceneHistory) {
            if (btnUndo) {
                btnUndo.disabled = !this.sceneHistory.canUndo();
                btnUndo.style.opacity = this.sceneHistory.canUndo() ? '1' : '0.5';
                btnUndo.style.cursor = this.sceneHistory.canUndo() ? 'pointer' : 'not-allowed';
            }
            
            if (btnRedo) {
                btnRedo.disabled = !this.sceneHistory.canRedo();
                btnRedo.style.opacity = this.sceneHistory.canRedo() ? '1' : '0.5';
                btnRedo.style.cursor = this.sceneHistory.canRedo() ? 'pointer' : 'not-allowed';
            }
        }
    }
}
