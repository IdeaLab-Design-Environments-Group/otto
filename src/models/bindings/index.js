/**
 * Bindings Module - Chain of Responsibility Pattern Implementation
 *
 * Provides composable value transformation pipelines for bindings.
 *
 * Components:
 * - BindingHandler: Base class for value processors
 * - ProcessedBinding: Wraps bindings with handler chain
 * - Handlers: ValidationHandler, ClampHandler, RoundHandler, ScaleHandler
 *
 * Usage:
 * ```javascript
 * import {
 *     ProcessedBinding,
 *     ValidationHandler,
 *     ClampHandler,
 *     RoundHandler
 * } from './bindings';
 *
 * // Create binding with validation pipeline
 * const binding = new ProcessedBinding(new ParameterBinding('radius'))
 *     .addHandler(new ValidationHandler(0, 1000))
 *     .addHandler(new ClampHandler(10, 500))
 *     .addHandler(new RoundHandler());
 *
 * // Value flows: parameter → validate → clamp → round → result
 * const value = binding.getValue(parameterStore);
 * ```
 */

// Base handler class
export { BindingHandler, PassThroughHandler } from './BindingHandler.js';

// Processed binding wrapper
export {
    ProcessedBinding,
    HandlerRegistry,
    defaultHandlerRegistry,
    initializeHandlerRegistry
} from './ProcessedBinding.js';

// Concrete handlers
export { ValidationHandler } from './handlers/ValidationHandler.js';
export { ClampHandler } from './handlers/ClampHandler.js';
export { RoundHandler } from './handlers/RoundHandler.js';
export { ScaleHandler, MapRangeHandler } from './handlers/ScaleHandler.js';
