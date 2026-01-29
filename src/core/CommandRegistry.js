/**
 * CommandRegistry - Registry Pattern for Commands
 *
 * Enables dynamic registration and execution of named commands.
 * Supports plugin-registered commands and command composition.
 *
 * Benefits:
 * - Open/Closed: Add commands without modifying existing code
 * - Plugin support: Plugins can register custom commands
 * - Named execution: Execute commands by name with arguments
 * - History integration: Works with SceneState for undo/redo
 */
export class CommandRegistry {
    constructor(sceneState = null) {
        // Map<commandName, { CommandClass, description, shortcut }>
        this._registry = new Map();

        // Scene state for undo/redo integration
        this._sceneState = sceneState;

        // Command history for tracking
        this._history = [];
        this._historyIndex = -1;
        this._maxHistorySize = 100;
    }

    /**
     * Register a command
     * @param {string} name - Command name (e.g., 'moveShapes', 'alignLeft')
     * @param {Class} CommandClass - Command class with execute/undo methods
     * @param {Object} options - Optional metadata
     * @param {string} options.description - Human-readable description
     * @param {string} options.shortcut - Keyboard shortcut (e.g., 'Ctrl+M')
     * @param {string} options.category - Command category for grouping
     *
     * @example
     * CommandRegistry.register('alignShapes', AlignShapesCommand, {
     *     description: 'Align selected shapes',
     *     shortcut: 'Ctrl+Shift+A',
     *     category: 'Transform'
     * });
     */
    register(name, CommandClass, options = {}) {
        if (!name || typeof name !== 'string') {
            throw new Error('Command name must be a non-empty string');
        }

        if (typeof CommandClass !== 'function') {
            throw new Error('CommandClass must be a constructor function');
        }

        const normalizedName = name.toLowerCase();

        this._registry.set(normalizedName, {
            CommandClass,
            description: options.description || '',
            shortcut: options.shortcut || null,
            category: options.category || 'General'
        });
    }

    /**
     * Unregister a command
     * @param {string} name
     */
    unregister(name) {
        const normalizedName = name.toLowerCase();
        this._registry.delete(normalizedName);
    }

    /**
     * Check if a command is registered
     * @param {string} name
     * @returns {boolean}
     */
    isRegistered(name) {
        return this._registry.has(name.toLowerCase());
    }

    /**
     * Get registered command names
     * @returns {Array<string>}
     */
    getCommandNames() {
        return Array.from(this._registry.keys());
    }

    /**
     * Get command metadata
     * @param {string} name
     * @returns {Object|null}
     */
    getCommandInfo(name) {
        const entry = this._registry.get(name.toLowerCase());
        if (!entry) return null;

        return {
            name,
            description: entry.description,
            shortcut: entry.shortcut,
            category: entry.category
        };
    }

    /**
     * Get all commands with metadata
     * @returns {Array<Object>}
     */
    getAllCommands() {
        return Array.from(this._registry.entries()).map(([name, entry]) => ({
            name,
            description: entry.description,
            shortcut: entry.shortcut,
            category: entry.category
        }));
    }

    /**
     * Get commands by category
     * @param {string} category
     * @returns {Array<Object>}
     */
    getCommandsByCategory(category) {
        return this.getAllCommands().filter(cmd => cmd.category === category);
    }

    /**
     * Create a command instance
     * @param {string} name
     * @param {...*} args - Arguments for command constructor
     * @returns {Command}
     */
    create(name, ...args) {
        const normalizedName = name.toLowerCase();
        const entry = this._registry.get(normalizedName);

        if (!entry) {
            const available = Array.from(this._registry.keys()).join(', ');
            throw new Error(
                `Unknown command: "${name}". ` +
                `Available commands: ${available}`
            );
        }

        return new entry.CommandClass(...args);
    }

    /**
     * Execute a command by name
     * @param {string} name
     * @param {...*} args - Arguments for command constructor
     * @returns {*} Command execution result
     */
    execute(name, ...args) {
        const command = this.create(name, ...args);

        // Execute the command
        const result = command.execute();

        // Add to history for undo support
        this.addToHistory(command);

        return result;
    }

    /**
     * Execute a pre-created command instance
     * @param {Command} command
     * @returns {*}
     */
    executeCommand(command) {
        const result = command.execute();
        this.addToHistory(command);
        return result;
    }

    /**
     * Add command to history
     * @param {Command} command
     */
    addToHistory(command) {
        // Clear redo history when new command is executed
        if (this._historyIndex < this._history.length - 1) {
            this._history = this._history.slice(0, this._historyIndex + 1);
        }

        this._history.push(command);
        this._historyIndex = this._history.length - 1;

        // Trim history if too large
        if (this._history.length > this._maxHistorySize) {
            this._history.shift();
            this._historyIndex--;
        }
    }

    /**
     * Undo the last command
     * @returns {boolean} Success
     */
    undo() {
        if (this._historyIndex < 0) {
            console.warn('Nothing to undo');
            return false;
        }

        const command = this._history[this._historyIndex];
        try {
            command.undo();
            this._historyIndex--;
            return true;
        } catch (error) {
            console.error('Undo failed:', error);
            return false;
        }
    }

    /**
     * Redo the last undone command
     * @returns {boolean} Success
     */
    redo() {
        if (this._historyIndex >= this._history.length - 1) {
            console.warn('Nothing to redo');
            return false;
        }

        const command = this._history[this._historyIndex + 1];
        try {
            command.execute();
            this._historyIndex++;
            return true;
        } catch (error) {
            console.error('Redo failed:', error);
            return false;
        }
    }

    /**
     * Check if undo is available
     * @returns {boolean}
     */
    canUndo() {
        return this._historyIndex >= 0;
    }

    /**
     * Check if redo is available
     * @returns {boolean}
     */
    canRedo() {
        return this._historyIndex < this._history.length - 1;
    }

    /**
     * Clear command history
     */
    clearHistory() {
        this._history = [];
        this._historyIndex = -1;
    }

    /**
     * Get history size
     * @returns {number}
     */
    getHistorySize() {
        return this._history.length;
    }

    /**
     * Set maximum history size
     * @param {number} size
     */
    setMaxHistorySize(size) {
        this._maxHistorySize = size;
        // Trim if current history exceeds new max
        while (this._history.length > this._maxHistorySize) {
            this._history.shift();
            this._historyIndex--;
        }
    }
}

// Singleton instance (can be used directly or instantiated per-app)
let _instance = null;

/**
 * Get global CommandRegistry instance
 * @returns {CommandRegistry}
 */
export function getCommandRegistry() {
    if (!_instance) {
        _instance = new CommandRegistry();
    }
    return _instance;
}

/**
 * Set global CommandRegistry instance
 * @param {CommandRegistry} instance
 */
export function setCommandRegistry(instance) {
    _instance = instance;
}
