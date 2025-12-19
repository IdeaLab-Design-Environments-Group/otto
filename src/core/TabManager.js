/**
 * TabManager using Observer Pattern and Factory Method
 * Manages multiple tabs (scenes) in the application
 */
import EventBus, { EVENTS } from '../events/EventBus.js';
import { SceneState } from './SceneState.js';

/**
 * Tab class - represents a single tab/scene
 */
export class Tab {
    constructor(id, name, sceneState) {
        this.id = id;
        this.name = name;
        this.sceneState = sceneState;
    }
}

/**
 * TabManager - manages tabs and active tab
 */
export class TabManager {
    constructor() {
        this.tabs = []; // Array of Tab objects
        this.activeTabId = null;
        this.eventBus = EventBus;
        
        // Create initial tab
        this.createTab('Scene 1');
    }
    
    /**
     * Create a new tab
     * @param {string} name - Tab name
     * @returns {Tab}
     */
    createTab(name) {
        const id = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const sceneState = new SceneState();
        const tab = new Tab(id, name, sceneState);
        
        this.tabs.push(tab);
        // Don't auto-switch to new tab - stay on current active tab
        // Only switch if there's no active tab
        if (!this.activeTabId && this.tabs.length > 0) {
            this.activeTabId = this.tabs[0].id;
        }
        // Keep current activeTabId, don't change it
        
        this.eventBus.emit(EVENTS.TAB_CREATED, { tab });
        // Only emit TAB_SWITCHED if we actually switched
        if (this.activeTabId === id) {
            this.eventBus.emit(EVENTS.TAB_SWITCHED, { tabId: id, tab });
        }
        
        return tab;
    }
    
    /**
     * Close a tab
     * @param {string} id - Tab id
     */
    closeTab(id) {
        if (this.tabs.length <= 1) {
            // Don't allow closing the last tab
            return;
        }
        
        const tabIndex = this.tabs.findIndex(tab => tab.id === id);
        if (tabIndex === -1) return;
        
        const wasActive = this.activeTabId === id;
        this.tabs.splice(tabIndex, 1);
        
        // If we closed the active tab, switch to another
        if (wasActive) {
            const newActiveIndex = Math.min(tabIndex, this.tabs.length - 1);
            this.activeTabId = this.tabs[newActiveIndex].id;
            this.eventBus.emit(EVENTS.TAB_SWITCHED, { 
                tabId: this.activeTabId, 
                tab: this.tabs[newActiveIndex] 
            });
        }
        
        this.eventBus.emit(EVENTS.TAB_CLOSED, { tabId: id });
    }
    
    /**
     * Switch to a different tab
     * @param {string} id - Tab id
     */
    switchTab(id) {
        const tab = this.tabs.find(t => t.id === id);
        if (!tab || tab.id === this.activeTabId) return;
        
        this.activeTabId = id;
        this.eventBus.emit(EVENTS.TAB_SWITCHED, { tabId: id, tab });
    }
    
    /**
     * Rename a tab
     * @param {string} id - Tab id
     * @param {string} newName - New tab name
     */
    renameTab(id, newName) {
        const tab = this.tabs.find(t => t.id === id);
        if (!tab || !newName.trim()) return;
        
        tab.name = newName.trim();
        // Could emit a TAB_RENAMED event if needed
        this.eventBus.emit(EVENTS.TAB_SWITCHED, { tabId: id, tab });
    }
    
    /**
     * Get the active tab
     * @returns {Tab|null}
     */
    getActiveTab() {
        return this.tabs.find(tab => tab.id === this.activeTabId) || null;
    }
    
    /**
     * Get the active scene state
     * @returns {SceneState|null}
     */
    getActiveScene() {
        const activeTab = this.getActiveTab();
        return activeTab ? activeTab.sceneState : null;
    }
    
    /**
     * Get tab by id
     * @param {string} id 
     * @returns {Tab|null}
     */
    getTab(id) {
        return this.tabs.find(tab => tab.id === id) || null;
    }
    
    /**
     * Serialize to JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            activeTabId: this.activeTabId,
            tabs: this.tabs.map(tab => ({
                id: tab.id,
                name: tab.name,
                sceneState: tab.sceneState.toJSON()
            }))
        };
    }
    
    /**
     * Deserialize from JSON
     * @param {Object} json 
     */
    async fromJSON(json) {
        if (!json || !json.tabs) {
            throw new Error('Invalid TabManager JSON');
        }
        
        this.tabs = [];
        
        for (const tabJson of json.tabs) {
            const sceneState = new SceneState();
            await sceneState.fromJSON(tabJson.sceneState);
            const tab = new Tab(tabJson.id, tabJson.name, sceneState);
            this.tabs.push(tab);
        }
        
        this.activeTabId = json.activeTabId || (this.tabs.length > 0 ? this.tabs[0].id : null);
        
        if (this.activeTabId) {
            const activeTab = this.getActiveTab();
            if (activeTab) {
                this.eventBus.emit(EVENTS.TAB_SWITCHED, { tabId: this.activeTabId, tab: activeTab });
            }
        }
    }
}
