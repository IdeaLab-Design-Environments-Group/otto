/**
 * Event Bus using Singleton Pattern and Observer Pattern
 * Central event system for decoupled communication between components
 */
class EventBus {
    // Private static instance (Singleton Pattern)
    static #instance = null;
    
    // Event type constants
    static EVENTS = {
        PARAM_CHANGED: 'PARAM_CHANGED',
        PARAM_ADDED: 'PARAM_ADDED',
        PARAM_REMOVED: 'PARAM_REMOVED',
        SHAPE_ADDED: 'SHAPE_ADDED',
        SHAPE_REMOVED: 'SHAPE_REMOVED',
        SHAPE_MOVED: 'SHAPE_MOVED',
        SHAPE_SELECTED: 'SHAPE_SELECTED',
        TAB_SWITCHED: 'TAB_SWITCHED',
        TAB_CREATED: 'TAB_CREATED',
        TAB_CLOSED: 'TAB_CLOSED',
        SCENE_LOADED: 'SCENE_LOADED',
        SCENE_SAVED: 'SCENE_SAVED',
        VIEWPORT_CHANGED: 'VIEWPORT_CHANGED'
    };
    
    // Observer storage: Map<eventType, Set<callback>>
    #subscribers = new Map();
    
    /**
     * Private constructor (Singleton Pattern)
     */
    constructor() {
        if (EventBus.#instance) {
            return EventBus.#instance;
        }
        EventBus.#instance = this;
    }
    
    /**
     * Get singleton instance
     * @returns {EventBus}
     */
    static getInstance() {
        if (!EventBus.#instance) {
            EventBus.#instance = new EventBus();
        }
        return EventBus.#instance;
    }
    
    /**
     * Subscribe to an event type (Observer Pattern)
     * @param {string} eventType - The event type to subscribe to
     * @param {Function} callback - Callback function to execute when event is emitted
     * @returns {Function} Unsubscribe function
     */
    subscribe(eventType, callback) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        
        if (!this.#subscribers.has(eventType)) {
            this.#subscribers.set(eventType, new Set());
        }
        
        this.#subscribers.get(eventType).add(callback);
        
        // Return unsubscribe function for convenience
        return () => this.unsubscribe(eventType, callback);
    }
    
    /**
     * Unsubscribe from an event type
     * @param {string} eventType - The event type to unsubscribe from
     * @param {Function} callback - The callback function to remove
     */
    unsubscribe(eventType, callback) {
        const callbacks = this.#subscribers.get(eventType);
        if (callbacks) {
            callbacks.delete(callback);
            if (callbacks.size === 0) {
                this.#subscribers.delete(eventType);
            }
        }
    }
    
    /**
     * Emit an event to all subscribers (Observer Pattern)
     * @param {string} eventType - The event type to emit
     * @param {*} payload - Optional payload data to pass to subscribers
     */
    emit(eventType, payload = null) {
        const callbacks = this.#subscribers.get(eventType);
        if (callbacks) {
            // Create a copy of the Set to avoid issues if callbacks modify subscriptions
            const callbacksCopy = new Set(callbacks);
            callbacksCopy.forEach(callback => {
                try {
                    callback(payload);
                } catch (error) {
                    console.error(`Error in event callback for ${eventType}:`, error);
                }
            });
        }
    }
    
    /**
     * Clear all subscribers for a specific event type
     * @param {string} eventType - The event type to clear
     */
    clear(eventType) {
        if (eventType) {
            this.#subscribers.delete(eventType);
        } else {
            this.#subscribers.clear();
        }
    }
    
    /**
     * Get count of subscribers for an event type (useful for debugging)
     * @param {string} eventType - The event type to check
     * @returns {number}
     */
    getSubscriberCount(eventType) {
        const callbacks = this.#subscribers.get(eventType);
        return callbacks ? callbacks.size : 0;
    }
}

// Export singleton instance as default
const eventBusInstance = EventBus.getInstance();

// Also export the class and EVENTS for accessing constants
export { EventBus };
export const EVENTS = EventBus.EVENTS;

export default eventBusInstance;
