/**
 * @fileoverview JointRegistry — joint types as data + strategies.
 *
 * Each type is one object (see joints/types/*.js):
 *   {id, label, description, ports: [kindA, kindB], params: <schema>,
 *    cut(ctx) → features, check(ctx) → findings, pose?(ctx) → 3D placement}
 * The params schema drives code validation, the inspector and Blockly.
 * Adding a joint type = writing one such object and registering it.
 *
 * @module joints/JointRegistry
 */
import finger from './types/finger.js';
import tabSlot from './types/tab_slot.js';
import crossLap from './types/cross_lap.js';
import splice from './types/splice.js';
import bolt from './types/bolt.js';
import hinge from './types/hinge.js';

export class JointRegistry {
    constructor(types = [finger, tabSlot, crossLap, splice, bolt, hinge]) {
        /** @type {Map<string, Object>} */
        this.types = new Map();
        types.forEach(t => this.register(t));
    }

    register(type) {
        if (!type?.id || !Array.isArray(type.ports) || typeof type.cut !== 'function' || !type.params) {
            throw new Error('JointRegistry.register: a joint type needs id, ports, params and cut()');
        }
        this.types.set(type.id, type);
    }

    get(id) { return this.types.get(id) || null; }
    has(id) { return this.types.has(id); }
    ids() { return Array.from(this.types.keys()); }
    list() { return Array.from(this.types.values()); }
}

/** The app-wide registry of built-in joint types. */
export const jointTypes = new JointRegistry();
