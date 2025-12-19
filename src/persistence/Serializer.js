/**
 * Serializer using Serializer Pattern
 * Handles serialization and deserialization of the entire application state
 */
export class Serializer {
    static VERSION = '1.0.0';
    
    /**
     * Serialize TabManager to JSON string
     * @param {TabManager} tabManager 
     * @returns {string}
     */
    static serialize(tabManager) {
        const data = {
            version: this.VERSION,
            activeTab: tabManager.activeTabId,
            tabs: tabManager.tabs.map(tab => this.serializeTab(tab))
        };
        return JSON.stringify(data, null, 2);
    }
    
    /**
     * Deserialize JSON string to TabManager
     * @param {string} json 
     * @returns {Promise<TabManager>}
     */
    static async deserialize(json) {
        const data = JSON.parse(json);
        
        if (!data.version) {
            throw new Error('Invalid file format: missing version');
        }
        
        const { TabManager } = await import('../core/TabManager.js');
        const tabManager = new TabManager();
        
        // Clear initial tab
        tabManager.tabs = [];
        tabManager.activeTabId = null;
        
        // Deserialize tabs
        if (data.tabs && Array.isArray(data.tabs)) {
            for (const tabData of data.tabs) {
                const tab = await this.deserializeTab(tabData);
                tabManager.tabs.push(tab);
            }
        }
        
        // Set active tab
        if (data.activeTab && tabManager.tabs.length > 0) {
            const activeTab = tabManager.tabs.find(t => t.id === data.activeTab);
            tabManager.activeTabId = activeTab ? data.activeTab : tabManager.tabs[0].id;
        } else if (tabManager.tabs.length > 0) {
            tabManager.activeTabId = tabManager.tabs[0].id;
        }
        
        return tabManager;
    }
    
    /**
     * Serialize a single tab
     * @param {Tab} tab 
     * @returns {Object}
     */
    static serializeTab(tab) {
        return {
            id: tab.id,
            name: tab.name,
            parameters: tab.sceneState.parameterStore.toJSON().parameters,
            shapes: tab.sceneState.shapeStore.toJSON().shapes,
            selectedShapeId: tab.sceneState.shapeStore.selectedShapeId,
            viewport: { ...tab.sceneState.viewport }
        };
    }
    
    /**
     * Deserialize a single tab
     * @param {Object} json 
     * @returns {Promise<Tab>}
     */
    static async deserializeTab(json) {
        const { Tab } = await import('../core/TabManager.js');
        const { SceneState } = await import('../core/SceneState.js');
        
        const sceneState = new SceneState();
        
        // Deserialize scene state
        if (json.parameters) {
            sceneState.parameterStore.fromJSON({ parameters: json.parameters });
        }
        
        if (json.shapes) {
            await sceneState.shapeStore.fromJSON({
                shapes: json.shapes,
                selectedShapeId: json.selectedShapeId || null
            });
        }
        
        if (json.viewport) {
            sceneState.viewport = { ...json.viewport };
        }
        
        const tab = new Tab(json.id, json.name, sceneState);
        return tab;
    }
    
    /**
     * Serialize SceneState to JSON
     * @param {SceneState} sceneState 
     * @returns {Object}
     */
    static serializeSceneState(sceneState) {
        return {
            parameters: sceneState.parameterStore.toJSON().parameters,
            shapes: sceneState.shapeStore.toJSON().shapes,
            selectedShapeId: sceneState.shapeStore.selectedShapeId,
            viewport: { ...sceneState.viewport }
        };
    }
    
    /**
     * Deserialize JSON to SceneState
     * @param {Object} json 
     * @returns {Promise<SceneState>}
     */
    static async deserializeSceneState(json) {
        const { SceneState } = await import('../core/SceneState.js');
        const sceneState = new SceneState();
        
        if (json.parameters) {
            await sceneState.parameterStore.fromJSON({ parameters: json.parameters });
        }
        
        if (json.shapes) {
            await sceneState.shapeStore.fromJSON({
                shapes: json.shapes,
                selectedShapeId: json.selectedShapeId || null
            });
        }
        
        if (json.viewport) {
            sceneState.viewport = { ...json.viewport };
        }
        
        return sceneState;
    }
}
