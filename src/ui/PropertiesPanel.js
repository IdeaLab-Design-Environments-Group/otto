/**
 * Properties Panel using Observer Pattern and Strategy Pattern
 * Displays and edits properties of selected shape
 */
import { Component } from './Component.js';
import EventBus, { EVENTS } from '../events/EventBus.js';
import { LiteralBinding, ParameterBinding, ExpressionBinding } from '../models/Binding.js';

export class PropertiesPanel extends Component {
    constructor(container, shapeStore, parameterStore) {
        super(container);
        this.shapeStore = shapeStore;
        this.parameterStore = parameterStore;
        this.selectedShape = null;
        this.selectedShapeIds = new Set(); // Multi-selection
        this.bindingResolver = shapeStore.bindingResolver;
        
        // Subscribe to shape selection events (only once in constructor)
        this.subscribe(EVENTS.SHAPE_SELECTED, (payload) => {
            console.log('PropertiesPanel: Shape selected event received', payload);
            this.selectedShape = payload ? payload.shape : null;
            if (payload && payload.selectedIds) {
                this.selectedShapeIds = new Set(payload.selectedIds);
            } else if (payload && payload.id) {
                this.selectedShapeIds = new Set([payload.id]);
            } else {
                this.selectedShapeIds.clear();
            }
            this.render();
        });
        
        // Subscribe to parameter changes to refresh property values
        // Use requestAnimationFrame to debounce rapid updates
        this._pendingRender = false;
        this.subscribe(EVENTS.PARAM_CHANGED, () => {
            if ((this.selectedShape || this.selectedShapeIds.size > 0) && !this._pendingRender) {
                this._pendingRender = true;
                requestAnimationFrame(() => {
                    this._pendingRender = false;
                    if (this.selectedShape || this.selectedShapeIds.size > 0) {
                        this.render();
                    }
                });
            }
        });
        
        // Check for initially selected shapes
        const selectedShape = this.shapeStore.getSelected();
        if (selectedShape) {
            this.selectedShape = selectedShape;
            console.log('PropertiesPanel: Found initially selected shape', selectedShape);
        }
        const selectedIds = this.shapeStore.getSelectedIds();
        if (selectedIds.size > 0) {
            this.selectedShapeIds = selectedIds;
        }
        
        // Helper method to request render
        this.requestRender = () => {
            setTimeout(() => this.render(), 0);
        };
    }
    
    /**
     * Render the properties panel
     */
    render() {
        if (!this.container) {
            console.warn('PropertiesPanel: Container not found');
            return;
        }
        
        this.container.innerHTML = '';
        
        if (this.selectedShapeIds.size === 0 && !this.selectedShape) {
            this.renderEmpty();
            return;
        }
        
        // Render multi-selection or single selection
        if (this.selectedShapeIds.size > 1) {
            this.renderMultiSelection();
        } else if (this.selectedShape) {
            this.renderProperties(this.selectedShape);
        }
    }
    
    /**
     * Render empty state
     */
    renderEmpty() {
        const message = this.createElement('div', {
            class: 'properties-empty'
        }, 'No shape selected');
        
        if (this.container) {
            this.container.appendChild(message);
        } else {
            console.warn('PropertiesPanel: Cannot render empty state, container is null');
        }
    }
    
    /**
     * Render multi-selection properties - show each shape's properties vertically
     */
    renderMultiSelection() {
        const selectedShapes = Array.from(this.selectedShapeIds)
            .map(id => this.shapeStore.get(id))
            .filter(shape => shape !== null);
        
        if (selectedShapes.length === 0) {
            this.renderEmpty();
            return;
        }
        
        // Header showing count
        const header = this.createElement('div', {
            class: 'properties-header'
        }, `${selectedShapes.length} Shapes Selected`);
        this.container.appendChild(header);
        
        // Render each shape's properties vertically
        selectedShapes.forEach((shape, index) => {
            // Add separator between shapes (except before first)
            if (index > 0) {
                const separator = this.createElement('div', {
                    class: 'properties-separator'
                });
                this.container.appendChild(separator);
            }
            
            // Shape type header (e.g., "Circle")
            const shapeHeader = this.createElement('div', {
                class: 'properties-section-header'
            }, shape.type.charAt(0).toUpperCase() + shape.type.slice(1));
            this.container.appendChild(shapeHeader);
            
            // Render all properties for this shape (same as single selection)
            this.renderPropertiesForShape(shape);
        });
    }
    
    /**
     * Render properties for a single shape (helper method for multi-select)
     * @param {Shape} shape 
     */
    renderPropertiesForShape(shape) {
        // Shape ID
        const idDiv = this.createElement('div', {
            class: 'property-item'
        });
        idDiv.appendChild(this.createElement('label', {}, 'ID:'));
        idDiv.appendChild(this.createElement('span', {
            class: 'property-value'
        }, shape.id));
        this.container.appendChild(idDiv);
        
        // Bindable properties
        const bindableProps = shape.getBindableProperties();
        bindableProps.forEach(property => {
            const propItem = this.createElement('div', {
                class: 'property-item'
            });
            
            const label = this.createElement('label', {}, `${property}:`);
            propItem.appendChild(label);
            
            const binding = shape.getBinding(property);
            // Get current property value - resolve binding if present, otherwise use shape property
            let currentValue = shape[property];
            if (binding && binding.type === 'literal') {
                currentValue = binding.value;
            } else if (binding && this.bindingResolver) {
                // For parameter/expression bindings, try to resolve it
                try {
                    const resolvedShape = this.bindingResolver.resolveShape(shape);
                    currentValue = resolvedShape[property];
                } catch (e) {
                    // If resolution fails, use property value
                    currentValue = shape[property];
                }
            }
            const bindingEditor = this.renderBindingEditor(property, binding, currentValue, shape);
            propItem.appendChild(bindingEditor);
            
            this.container.appendChild(propItem);
        });
    }
    
    /**
     * Render properties for a shape
     * @param {Shape} shape 
     */
    renderProperties(shape) {
        // Shape type header
        const header = this.createElement('div', {
            class: 'properties-header'
        }, `${shape.type.charAt(0).toUpperCase() + shape.type.slice(1)} Properties`);
        this.container.appendChild(header);
        
        // Use the shared method
        this.renderPropertiesForShape(shape);
    }
    
    /**
     * Render binding editor for a property
     * @param {string} property 
     * @param {Binding|null} currentBinding 
     * @param {number} currentValue 
     * @param {Shape} shape - The shape this property belongs to (for multi-select)
     * @returns {HTMLElement}
     */
    renderBindingEditor(property, currentBinding, currentValue, shape = null) {
        // Use selectedShape if shape not provided (for backward compatibility)
        const targetShape = shape || this.selectedShape;
        const editor = this.createElement('div', {
            class: 'binding-editor'
        });
        
        // Binding type selector
        const typeSelect = this.createElement('select', {
            class: 'binding-type-select'
        });
        
        const literalOption = this.createElement('option', {
            value: 'literal'
        }, 'Value');
        const paramOption = this.createElement('option', {
            value: 'parameter'
        }, 'Link to Parameter');
        const exprOption = this.createElement('option', {
            value: 'expression'
        }, 'Formula');
        
        typeSelect.appendChild(literalOption);
        typeSelect.appendChild(paramOption);
        typeSelect.appendChild(exprOption);
        
        // Set current type
        if (currentBinding) {
            typeSelect.value = currentBinding.type;
        } else {
            typeSelect.value = 'literal';
        }
        
        // Binding value container
        const valueContainer = this.createElement('div', {
            class: 'binding-value-container'
        });
        
        // Initial render of binding input
        const updateBindingInput = () => {
            valueContainer.innerHTML = '';
            const type = typeSelect.value;
            
            if (type === 'literal') {
                valueContainer.appendChild(this.renderLiteralInput(property, currentValue, targetShape));
            } else if (type === 'parameter') {
                const paramId = currentBinding && currentBinding.type === 'parameter' 
                    ? currentBinding.parameterId 
                    : null;
                valueContainer.appendChild(this.renderParameterDropdown(property, paramId, targetShape));
            } else if (type === 'expression') {
                const expr = currentBinding && currentBinding.type === 'expression'
                    ? currentBinding.expression
                    : `${property}`;
                valueContainer.appendChild(this.renderExpressionInput(property, expr, targetShape));
            }
        };
        
        typeSelect.addEventListener('change', () => {
            updateBindingInput();
        });
        
        updateBindingInput();
        
        editor.appendChild(typeSelect);
        editor.appendChild(valueContainer);
        
        return editor;
    }
    
    /**
     * Render literal input
     * @param {string} property 
     * @param {number} value 
     * @param {Shape} shape - The shape this property belongs to
     * @returns {HTMLElement}
     */
    renderLiteralInput(property, value, shape = null) {
        const targetShape = shape || this.selectedShape;
        
        // Get current value - if there's a binding, resolve it, otherwise use the property value
        let currentValue = value;
        if (targetShape) {
            const binding = targetShape.getBinding(property);
            if (binding && binding.type === 'literal') {
                currentValue = binding.value;
            } else if (targetShape[property] !== undefined) {
                currentValue = targetShape[property];
            }
        }
        
        const input = this.createElement('input', {
            type: 'number',
            class: 'binding-input binding-literal',
            value: currentValue || 0,
            step: 'any'
        });
        
        // Only update on blur or Enter key to allow multi-digit typing
        const updateValue = () => {
            if (!targetShape) return;
            const newValue = parseFloat(input.value);
            if (!isNaN(newValue)) {
                // Create literal binding with the new value
                const binding = new LiteralBinding(newValue);
                
                // Also update the shape's actual property value for immediate feedback
                if (targetShape[property] !== undefined) {
                    targetShape[property] = newValue;
                }
                
                // Set the binding
                this.setBinding(targetShape.id, property, binding);
            }
        };
        
        input.addEventListener('blur', updateValue);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur(); // Trigger blur which will update the value
            }
        });
        
        return input;
    }
    
    /**
     * Render parameter dropdown
     * @param {string} property 
     * @param {string|null} selectedParamId 
     * @param {Shape} shape - The shape this property belongs to
     * @returns {HTMLElement}
     */
    renderParameterDropdown(property, selectedParamId, shape = null) {
        const targetShape = shape || this.selectedShape;
        const select = this.createElement('select', {
            class: 'binding-input binding-parameter'
        });
        
        // Add empty option
        const emptyOption = this.createElement('option', {
            value: ''
        }, '-- Select a Parameter --');
        select.appendChild(emptyOption);
        
        // Add parameter options
        const parameters = this.parameterStore.getAll();
        parameters.forEach(param => {
            const option = this.createElement('option', {
                value: param.id
            }, param.name);
            if (param.id === selectedParamId) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        select.addEventListener('change', () => {
            if (select.value && targetShape) {
                const binding = new ParameterBinding(select.value);
                this.setBinding(targetShape.id, property, binding);
            }
        });
        
        return select;
    }
    
    /**
     * Render expression input
     * @param {string} property 
     * @param {string} expression 
     * @param {Shape} shape - The shape this property belongs to
     * @returns {HTMLElement}
     */
    renderExpressionInput(property, expression, shape = null) {
        const targetShape = shape || this.selectedShape;
        const input = this.createElement('input', {
            type: 'text',
            class: 'binding-input binding-expression',
            value: expression || '',
            placeholder: 'e.g., radius * 2 + 10'
        });
        
        input.addEventListener('change', () => {
            if (input.value.trim() && targetShape) {
                const binding = new ExpressionBinding(input.value.trim());
                this.setBinding(targetShape.id, property, binding);
            }
        });
        
        return input;
    }
    
    /**
     * Set binding for a shape property
     * @param {string} shapeId 
     * @param {string} property 
     * @param {Binding} binding 
     */
    setBinding(shapeId, property, binding) {
        this.shapeStore.updateBinding(shapeId, property, binding);
        
        // If it's a literal binding, also update the shape's property value
        if (binding.type === 'literal' && this.selectedShape) {
            this.selectedShape[property] = binding.value;
        }
        
        // Re-render to show updated binding
        setTimeout(() => this.render(), 0);
    }
}
