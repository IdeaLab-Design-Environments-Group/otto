import { StorageManager } from '../persistence/StorageManager.js';
import { SceneState } from '../core/SceneState.js';

export class AssemblyDataLoader {
    async loadActiveSceneState() {
        const raw = localStorage.getItem(StorageManager.AUTOSAVE_KEY);
        if (!raw) return null;

        try {
            const data = JSON.parse(raw);
            if (!data?.tabs?.length) return null;

            const activeTabId = data.activeTab;
            const activeTab = data.tabs.find(tab => tab.id === activeTabId) || data.tabs[0];
            if (!activeTab || !Array.isArray(activeTab.shapes)) return null;

            const sceneState = new SceneState();
            if (activeTab.parameters) {
                await sceneState.parameterStore.fromJSON({ parameters: activeTab.parameters });
            }
            await sceneState.shapeStore.fromJSON({
                shapes: activeTab.shapes,
                selectedShapeId: activeTab.selectedShapeId || null,
                edgeJoinery: activeTab.edgeJoinery || []
            });

            return sceneState;
        } catch (error) {
            console.error('AssemblyDataLoader: failed to parse autosave', error);
            return null;
        }
    }
}
