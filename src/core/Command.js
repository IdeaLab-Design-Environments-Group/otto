/**
 * Command Pattern for batch operations
 * Allows undoable batch operations on multiple shapes
 */

/**
 * Base command interface
 */
export class Command {
    /**
     * Execute the command
     */
    execute() {
        throw new Error('execute() must be implemented');
    }
    
    /**
     * Undo the command
     */
    undo() {
        throw new Error('undo() must be implemented');
    }
}

/**
 * Command to move multiple shapes
 */
export class MoveShapesCommand extends Command {
    /**
     * @param {ShapeStore} shapeStore 
     * @param {Array<string>} shapeIds 
     * @param {number} dx 
     * @param {number} dy 
     */
    constructor(shapeStore, shapeIds, dx, dy) {
        super();
        this.shapeStore = shapeStore;
        this.shapeIds = shapeIds;
        this.dx = dx;
        this.dy = dy;
        this.originalPositions = [];
    }
    
    execute() {
        // Store original positions
        this.originalPositions = this.shapeIds.map(id => {
            const shape = this.shapeStore.get(id);
            if (!shape) return null;
            
            if (shape.type === 'circle') {
                return { id, type: 'circle', centerX: shape.centerX, centerY: shape.centerY };
            } else if (shape.type === 'rectangle') {
                return { id, type: 'rectangle', x: shape.x, y: shape.y };
            }
            return null;
        }).filter(p => p !== null);
        
        // Move shapes
        this.shapeIds.forEach(id => {
            const shape = this.shapeStore.get(id);
            if (!shape) return;
            
            if (shape.type === 'circle') {
                shape.centerX += this.dx;
                shape.centerY += this.dy;
            } else if (shape.type === 'rectangle') {
                shape.x += this.dx;
                shape.y += this.dy;
            }
        });
    }
    
    undo() {
        // Restore original positions
        this.originalPositions.forEach(pos => {
            if (!pos) return;
            
            const shape = this.shapeStore.get(pos.id);
            if (!shape) return;
            
            if (pos.type === 'circle') {
                shape.centerX = pos.centerX;
                shape.centerY = pos.centerY;
            } else if (pos.type === 'rectangle') {
                shape.x = pos.x;
                shape.y = pos.y;
            }
        });
    }
}

/**
 * Command to duplicate shapes
 */
export class DuplicateShapesCommand extends Command {
    /**
     * @param {ShapeStore} shapeStore 
     * @param {ShapeRegistry} shapeRegistry 
     * @param {Array<string>} shapeIds 
     * @param {number} offsetX 
     * @param {number} offsetY 
     */
    constructor(shapeStore, shapeRegistry, shapeIds, offsetX = 20, offsetY = 20) {
        super();
        this.shapeStore = shapeStore;
        this.shapeRegistry = shapeRegistry;
        this.shapeIds = shapeIds;
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        this.createdShapeIds = [];
    }
    
    execute() {
        this.createdShapeIds = [];
        
        this.shapeIds.forEach(id => {
            const originalShape = this.shapeStore.get(id);
            if (!originalShape) return;
            
            // Get resolved shape to get actual position
            const resolved = this.shapeStore.bindingResolver.resolveShape(originalShape);
            
            let newPosition;
            if (originalShape.type === 'circle') {
                newPosition = {
                    x: resolved.centerX + this.offsetX,
                    y: resolved.centerY + this.offsetY
                };
            } else if (originalShape.type === 'rectangle') {
                newPosition = {
                    x: resolved.x + this.offsetX,
                    y: resolved.y + this.offsetY
                };
            } else {
                return;
            }
            
            // Create duplicate
            const duplicate = this.shapeRegistry.create(originalShape.type, newPosition);
            
            // Copy bindings
            const bindableProps = originalShape.getBindableProperties();
            bindableProps.forEach(prop => {
                const binding = originalShape.getBinding(prop);
                if (binding) {
                    duplicate.setBinding(prop, binding);
                }
            });
            
            // Add to store
            this.shapeStore.add(duplicate);
            this.createdShapeIds.push(duplicate.id);
        });
    }
    
    undo() {
        // Remove duplicated shapes
        this.createdShapeIds.forEach(id => {
            this.shapeStore.remove(id);
        });
        this.createdShapeIds = [];
    }
}
