/**
 * Component Base Class using Template Method Pattern
 * Provides base functionality for all UI components
 */
import EventBus from '../events/EventBus.js';

export class Component {
    constructor(container) {
        if (this.constructor === Component) {
            throw new Error('Component is an abstract class and cannot be instantiated directly');
        }
        this.container = container;
        this.isMounted = false;
        this.unsubscribers = []; // Store unsubscribe functions
    }
    
    /**
     * Abstract render method - must be implemented by subclasses
     * Template Method Pattern: defines the structure
     */
    render() {
        throw new Error('render() must be implemented by subclass');
    }
    
    /**
     * Mount the component to its container
     */
    mount() {
        if (!this.container) {
            throw new Error('Container is required to mount component');
        }
        if (this.isMounted) {
            this.unmount();
        }
        this.render();
        this.isMounted = true;
    }
    
    /**
     * Unmount the component and clean up
     */
    unmount() {
        if (this.container) {
            this.container.innerHTML = '';
        }
        // Unsubscribe from all events
        this.unsubscribers.forEach(unsub => unsub());
        this.unsubscribers = [];
        this.isMounted = false;
    }
    
    /**
     * Subscribe to an event via EventBus
     * @param {string} eventType 
     * @param {Function} callback 
     */
    subscribe(eventType, callback) {
        const unsubscribe = EventBus.subscribe(eventType, callback);
        this.unsubscribers.push(unsubscribe);
        return unsubscribe;
    }
    
    /**
     * Emit an event via EventBus
     * @param {string} eventType 
     * @param {*} payload 
     */
    emit(eventType, payload = null) {
        EventBus.emit(eventType, payload);
    }
    
    /**
     * Helper method to create a DOM element
     * @param {string} tag 
     * @param {Object} attributes 
     * @param {string|Node|Array} content 
     * @returns {HTMLElement}
     */
    createElement(tag, attributes = {}, content = null) {
        const element = document.createElement(tag);
        
        Object.keys(attributes).forEach(key => {
            if (key === 'class') {
                element.className = attributes[key];
            } else if (key.startsWith('data-')) {
                element.setAttribute(key, attributes[key]);
            } else {
                element[key] = attributes[key];
            }
        });
        
        if (content !== null) {
            if (typeof content === 'string') {
                element.textContent = content;
            } else if (content instanceof Node) {
                element.appendChild(content);
            } else if (Array.isArray(content)) {
                content.forEach(item => {
                    if (typeof item === 'string') {
                        element.appendChild(document.createTextNode(item));
                    } else if (item instanceof Node) {
                        element.appendChild(item);
                    }
                });
            }
        }
        
        return element;
    }
}
