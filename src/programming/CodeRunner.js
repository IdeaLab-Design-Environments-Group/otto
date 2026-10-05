/**
 * CodeRunner - Bridges the text-based programming language with the shape/parameter stores
 * 
 * Executes Otto code and maps the results to the current ShapeStore and ParameterStore.
 */

import { Lexer } from './Lexer.js';
import { Parser } from './Parser.js';
import { Interpreter } from './Interpreter.js';
import { ShapeRegistry } from '../models/shapes/ShapeRegistry.js';
import { ParameterBuilder } from '../models/Parameter.js';
import { resolveJoints } from '../joints/JointService.js';

export class CodeRunner {
    /**
     * @param {Object} options
     * @param {import('../core/ShapeStore.js').ShapeStore} options.shapeStore
     * @param {import('../core/ParameterStore.js').ParameterStore} options.parameterStore
     */
    constructor({ shapeStore, parameterStore, getScene = null }) {
        this.shapeStore = shapeStore;
        this.parameterStore = parameterStore;
        /** Optional () => SceneState; needed to apply `join` / `ground`. */
        this.getScene = getScene;
        this.interpreter = new Interpreter();
        this.lastResult = null;
    }

    /**
     * Run Otto code and update stores with results
     * @param {string} code - Otto programming language code
     * @param {Object} options
     * @param {boolean} options.clearExisting - Whether to clear existing shapes/params first
     * @param {boolean} options.clearShapes - Whether to clear existing shapes first
     * @param {boolean} options.clearParameters - Whether to clear existing params first
     * @returns {Object} - Execution result
     */
    run(code, { clearExisting = true, clearShapes = clearExisting, clearParameters = clearExisting } = {}) {
        try {
            // Parse and interpret
            const lexer = new Lexer(code);
            const parser = new Parser(lexer);
            const ast = parser.parse();
            
            // Reset interpreter for fresh state
            this.interpreter = new Interpreter();
            const result = this.interpreter.interpret(ast);
            this.lastResult = result;

            // Optionally clear existing data
            if (clearShapes) {
                const allShapes = this.shapeStore.getAll();
                allShapes.forEach(shape => this.shapeStore.remove(shape.id));
            }
            
            if (clearParameters) {
                const allParams = this.parameterStore.getAll();
                allParams.forEach(param => this.parameterStore.remove(param.id));
            }

            // Map parameters to ParameterStore
            if (result.parameters) {
                for (const [name, value] of result.parameters) {
                    const existing = this.parameterStore.getByName(name);
                    if (existing) {
                        // Update value in place
                        if (typeof value === 'number') {
                            this.parameterStore.setValue(existing.id, value);
                        } else {
                            // Non-numeric parameters aren't supported by ParameterStore UI yet
                            // Store as 0 to avoid crashing; keep name.
                            this.parameterStore.setValue(existing.id, 0);
                        }
                        continue;
                    }

                    // Create a new parameter via builder (matches app's ParameterStore API)
                    const builder = new ParameterBuilder();
                    const param = builder
                        .withName(name)
                        .withValue(typeof value === 'number' ? value : 0)
                        .withRange(-Infinity, Infinity)
                        .withStep(0)
                        .build();
                    this.parameterStore.add(param);
                }
            }

            // Map shapes to ShapeStore
            if (result.shapes) {
                for (const [name, shapeData] of result.shapes) {
                    if (shapeData && shapeData._consumedByBoolean) {
                        continue;
                    }
                    this._createShape(name, shapeData);
                }
            }

            const { errors: jointErrors, warnings: jointWarnings } = this._applyJoints(result, { clearExisting: clearShapes });

            return {
                success: true,
                result,
                shapesCreated: result.shapes ? result.shapes.size : 0,
                parametersCreated: result.parameters ? result.parameters.size : 0,
                jointsCreated: result.joints ? result.joints.length : 0,
                jointErrors,
                jointWarnings
            };

        } catch (error) {
            console.error('[CodeRunner] Execution error:', error);
            return {
                success: false,
                error: error.message,
                line: error.line,
                column: error.column
            };
        }
    }

    /**
     * Replace the scene's joints with the ones the code declared (when the
     * run replaces the scene) and report joint problems as messages. The
     * caller's ReplaceSceneCommand makes this part of the same undo step.
     * @private
     * @returns {{errors: string[], warnings: string[]}} joint problems
     *   (errors: joints that do not resolve; warnings: e.g. loops that do not close)
     */
    _applyJoints(result, { clearExisting }) {
        const scene = this.getScene?.();
        const none = { errors: [], warnings: [] };
        if (!scene?.jointStore) return none;
        const declared = result.joints || [];
        if (!clearExisting && declared.length === 0 && !result.ground) return none;
        const kept = clearExisting ? [] : scene.jointStore.getAll().map(j => structuredClone(j));
        const joints = [...kept];
        let n = 1;
        const nextId = () => {
            while (joints.some(j => j.id === `j${n}`)) n++;
            return `j${n}`;
        };
        for (const j of declared) joints.push({ id: nextId(), ...j });
        scene.jointStore.fromJSON({
            joints,
            ground: result.ground ?? (clearExisting ? null : scene.jointStore.ground)
        });
        const findings = resolveJoints(scene).findings;
        return {
            errors: findings.filter(f => f.severity === 'error').map(f => f.message),
            warnings: findings.filter(f => f.severity === 'warning').map(f => f.message)
        };
    }

    /**
     * Parse code and return AST (for syntax checking)
     * @param {string} code
     * @returns {Object}
     */
    parse(code) {
        try {
            const lexer = new Lexer(code);
            const parser = new Parser(lexer);
            const ast = parser.parse();
            return { success: true, ast };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Create a shape in ShapeStore from interpreter result
     * @private
     */
    _createShape(name, shapeData) {
        const type = shapeData.type;
        const params = shapeData.params || {};
        const transform = shapeData.transform || {};

        // Calculate position from transform
        const position = {
            x: transform.position ? transform.position[0] : (params.centerX || params.x || 0),
            y: transform.position ? transform.position[1] : (params.centerY || params.y || 0)
        };

        // Map interpreter params to ShapeRegistry options
        const options = this._mapParamsToOptions(type, params);
        options.id = name;

        try {
            // Check if shape type is registered
            if (!ShapeRegistry.isRegistered(type)) {
                console.warn(`[CodeRunner] Unknown shape type: ${type}, skipping`);
                return null;
            }

            const shape = ShapeRegistry.create(type, position, options, this.shapeStore);
            
            // Apply transform properties to shape
            if (transform.rotation) {
                shape.rotation = transform.rotation;
            }
            if (transform.scale) {
                shape.scaleX = transform.scale[0];
                shape.scaleY = transform.scale[1];
            }

            this.shapeStore.add(shape);
            return shape;

        } catch (error) {
            console.error(`[CodeRunner] Failed to create shape "${name}":`, error);
            return null;
        }
    }

    /**
     * Map interpreter params to ShapeRegistry options format.
     *
     * Snake_case AQUI names (pitch_diameter, corner_radius, …) are resolved
     * by each shape's schema `aliases`, so params pass through untouched —
     * only path point arrays need normalization into {x, y} objects.
     * @private
     */
    _mapParamsToOptions(type, params) {
        const options = { ...params };

        if (type === 'path' && Array.isArray(params.points)) {
            options.points = this._normalizePathPoints(params.points);
        }

        return options;
    }

    _normalizePathPoints(points) {
        const normalized = [];
        for (const p of points) {
            if (p === null) {
                // Only keep the first contour; ignore holes/extra contours for now
                break;
            }
            if (Array.isArray(p) && p.length >= 2) {
                normalized.push({ x: Number(p[0]) || 0, y: Number(p[1]) || 0 });
            } else if (p && typeof p === 'object') {
                normalized.push({ x: Number(p.x) || 0, y: Number(p.y) || 0 });
            }
        }
        return normalized;
    }

    /**
     * Get the last execution result
     * @returns {Object|null}
     */
    getLastResult() {
        return this.lastResult;
    }

    /**
     * Reset the interpreter state
     */
    reset() {
        this.interpreter = new Interpreter();
        this.lastResult = null;
    }
}

// Export a factory function for convenience
export function createCodeRunner(shapeStore, parameterStore) {
    return new CodeRunner({ shapeStore, parameterStore });
}
