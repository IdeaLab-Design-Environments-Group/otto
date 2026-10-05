/**
 * @fileoverview CommandCatalog — name → command-factory registry.
 *
 * Backs PluginAPI.registerCommand (plugins contribute commands by name) and
 * gives tooling a discoverable list. Replaces the never-instantiated
 * CommandRegistry class, whose separate history stack is superseded by the
 * per-tab HistoryManager.
 *
 * @module commands/CommandCatalog
 */
import { AddShapeCommand, RemoveShapesCommand, DuplicateShapesCommand, MutateShapesCommand, SetBindingCommand, SetShapePropertyCommand } from './shapeCommands.js';
import { AddParameterCommand, RemoveParameterCommand, SetParameterValueCommand, UpdateParameterMetaCommand } from './parameterCommands.js';
import { SetEdgeJoineryCommand, ReplaceSceneCommand } from './sceneCommands.js';
import { JOINT_COMMANDS } from './jointCommands.js';

export class CommandCatalog {
    constructor() {
        /** @type {Map<string, Function>} name → factory(...args) => Command */
        this.factories = new Map();
        /** @type {Map<string, CommandMeta>} name → optional metadata */
        this.meta = new Map();

        // Built-ins
        this.register('shape.add', (...args) => new AddShapeCommand(...args));
        this.register('shape.remove', (...args) => new RemoveShapesCommand(...args));
        this.register('shape.duplicate', (...args) => new DuplicateShapesCommand(...args));
        this.register('shape.mutate', (...args) => new MutateShapesCommand(...args));
        this.register('shape.setBinding', (...args) => new SetBindingCommand(...args));
        this.register('shape.setProperty', (...args) => new SetShapePropertyCommand(...args));
        this.register('param.add', (...args) => new AddParameterCommand(...args));
        this.register('param.remove', (...args) => new RemoveParameterCommand(...args));
        this.register('param.setValue', (...args) => new SetParameterValueCommand(...args));
        this.register('param.updateMeta', (...args) => new UpdateParameterMetaCommand(...args));
        this.register('edge.setJoinery', (...args) => new SetEdgeJoineryCommand(...args));
        this.register('scene.replace', (...args) => new ReplaceSceneCommand(...args));
        for (const [name, factory, meta] of JOINT_COMMANDS) this.register(name, factory, meta);
    }

    /**
     * @typedef {Object} CommandMeta
     * @property {string} [summary] - One-line description (tooling / agent tools).
     * @property {Object} [schema] - JSON schema of the single structured
     *   argument object (see core/jsonSchemaLite).
     * @property {'read'|'low'|'structural'|'destructive'} [risk]
     */

    /**
     * Register a command factory under a name. Plugins use this via
     * PluginAPI.registerCommand.
     *
     * @param {string} name
     * @param {Function} factory - (...args) => Command
     * @param {CommandMeta} [meta] - Optional description of the command.
     */
    register(name, factory, meta = null) {
        if (!name || typeof factory !== 'function') {
            throw new Error('CommandCatalog.register requires a name and a factory function');
        }
        this.factories.set(name, factory);
        if (meta) {
            this.meta.set(name, { ...meta });
        } else {
            this.meta.delete(name);
        }
    }

    unregister(name) {
        this.factories.delete(name);
        this.meta.delete(name);
    }

    /**
     * @param {string} name
     * @returns {?CommandMeta} The command's metadata, or null if none.
     */
    getMeta(name) {
        return this.meta.get(name) || null;
    }

    /**
     * Every command that has metadata, sorted by name.
     * @returns {Array<{name: string} & CommandMeta>}
     */
    describe() {
        return Array.from(this.meta.entries())
            .map(([name, meta]) => ({ name, ...meta }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    has(name) {
        return this.factories.has(name);
    }

    /**
     * Build a command instance by name.
     * @param {string} name
     * @param {...*} args - Passed to the factory.
     * @returns {import('./Command.js').Command}
     */
    create(name, ...args) {
        const factory = this.factories.get(name);
        if (!factory) {
            throw new Error(`Unknown command: "${name}". Registered: ${Array.from(this.factories.keys()).join(', ')}`);
        }
        return factory(...args);
    }

    getNames() {
        return Array.from(this.factories.keys());
    }
}
