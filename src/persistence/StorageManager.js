/**
 * StorageManager using Observer Pattern
 * Manages local storage (autosave) for the application
 */
import EventBus, { EVENTS } from '../events/EventBus.js';
import { Serializer } from './Serializer.js';

export class StorageManager {
    static AUTOSAVE_KEY = 'nova_otto_autosave';
    static AUTOSAVE_INTERVAL = 30000; // 30 seconds
    
    constructor(tabManager, serializer) {
        this.tabManager = tabManager;
        // Use Serializer class directly (all methods are static)
        this.serializer = Serializer;
        this.autoSaveTimer = null;
        
        // Subscribe to events that should trigger autosave
        this.subscribeToEvents();
    }
    
    /**
     * Subscribe to events that should trigger autosave
     */
    subscribeToEvents() {
        EventBus.subscribe(EVENTS.SHAPE_ADDED, () => this.autoSave());
        EventBus.subscribe(EVENTS.SHAPE_REMOVED, () => this.autoSave());
        EventBus.subscribe(EVENTS.SHAPE_MOVED, () => this.autoSave());
        EventBus.subscribe(EVENTS.PARAM_ADDED, () => this.autoSave());
        EventBus.subscribe(EVENTS.PARAM_REMOVED, () => this.autoSave());
        EventBus.subscribe(EVENTS.PARAM_CHANGED, () => this.autoSave());
        EventBus.subscribe(EVENTS.TAB_CREATED, () => this.autoSave());
        EventBus.subscribe(EVENTS.TAB_CLOSED, () => this.autoSave());
        EventBus.subscribe(EVENTS.TAB_SWITCHED, () => this.autoSave());
    }
    
    /**
     * Start autosave interval
     */
    startAutoSave() {
        if (this.autoSaveTimer) {
            this.stopAutoSave();
        }
        
        this.autoSaveTimer = setInterval(() => {
            this.autoSave();
        }, StorageManager.AUTOSAVE_INTERVAL);
        
        console.log('AutoSave started');
    }
    
    /**
     * Stop autosave interval
     */
    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
            console.log('AutoSave stopped');
        }
    }
    
    /**
     * Perform autosave
     */
    autoSave() {
        try {
            const json = Serializer.serialize(this.tabManager);
            localStorage.setItem(StorageManager.AUTOSAVE_KEY, json);
            EventBus.emit(EVENTS.SCENE_SAVED, { type: 'autosave' });
        } catch (error) {
            console.error('AutoSave error:', error);
        }
    }
    
    /**
     * Save to local storage
     */
    save() {
        try {
            const json = Serializer.serialize(this.tabManager);
            localStorage.setItem(StorageManager.AUTOSAVE_KEY, json);
            EventBus.emit(EVENTS.SCENE_SAVED, { type: 'manual' });
            return true;
        } catch (error) {
            console.error('Save error:', error);
            return false;
        }
    }
    
    /**
     * Load from local storage
     * @returns {Promise<TabManager|null>}
     */
    async load() {
        try {
            const json = localStorage.getItem(StorageManager.AUTOSAVE_KEY);
            if (!json) {
                return null;
            }
            
            const tabManager = await Serializer.deserialize(json);
            EventBus.emit(EVENTS.SCENE_LOADED, { type: 'autosave' });
            return tabManager;
        } catch (error) {
            console.error('Load error:', error);
            return null;
        }
    }
    
    /**
     * Clear local storage
     */
    clear() {
        localStorage.removeItem(StorageManager.AUTOSAVE_KEY);
        console.log('Storage cleared');
    }
    
    /**
     * Check if autosave exists
     * @returns {boolean}
     */
    hasAutoSave() {
        return localStorage.getItem(StorageManager.AUTOSAVE_KEY) !== null;
    }
}
