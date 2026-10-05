/**
 * @fileoverview JointStore — the joints of one scene (tab).
 *
 * A joint connects two shapes at named ports and is two-sided: one joint
 * produces the matching cut on both panels.
 *
 *   Joint   {id, type, a: PortRef, b: PortRef, params: {name: number|string}}
 *   PortRef {shape: <shape id>, edge: <edge name>}
 *
 * Param values are numbers, enum words, or expression strings over scene
 * parameters (they stay bound to those parameters). `ground` is the shape
 * that lies on the floor when the joints are folded up in 3D. `fabrication`
 * holds the laser settings (bed, kerf, margin, gap); null = defaults.
 *
 * Mutations go through commands (commands/jointCommands.js); every change
 * bumps `revision` and emits JOINTS_CHANGED.
 *
 * @module core/JointStore
 */
import EventBus, { EVENTS } from '../events/EventBus.js';

/** Laser defaults (all editable per scene). */
export const DEFAULT_FABRICATION = Object.freeze({
    bed: Object.freeze({ w: 600, h: 400 }),
    kerf: 0.15,
    margin: 5,
    gap: 4,
    labels: true
});

export class JointStore {
    constructor() {
        /** @type {Array<Object>} in creation order */
        this.joints = [];
        /** @type {?string} shape id */
        this.ground = null;
        /** @type {?{bed: {w, h}, kerf, margin, gap, labels}} null = DEFAULT_FABRICATION */
        this.fabrication = null;
        this.revision = 0;
    }

    getAll() { return this.joints; }
    get(id) { return this.joints.find(j => j.id === id) || null; }
    isEmpty() { return this.joints.length === 0 && this.ground === null && this.fabrication === null; }

    /** Laser settings, defaults filled in. */
    getFabrication() {
        return { ...DEFAULT_FABRICATION, ...(this.fabrication || {}), bed: { ...DEFAULT_FABRICATION.bed, ...(this.fabrication?.bed || {}) } };
    }

    /** Replace the laser settings (null = back to defaults). */
    setFabrication(fabrication) {
        this.fabrication = fabrication ? structuredClone(fabrication) : null;
        this.changed('fabrication');
    }

    /** Joints that touch a shape, with their indices. */
    jointsOfShape(shapeId) {
        return this.joints
            .map((joint, index) => ({ joint, index }))
            .filter(({ joint }) => joint.a.shape === shapeId || joint.b.shape === shapeId);
    }

    /** First free `j<n>` id. */
    nextId() {
        const taken = new Set(this.joints.map(j => j.id));
        let n = 1;
        while (taken.has(`j${n}`)) n++;
        return `j${n}`;
    }

    add(joint, index = this.joints.length) {
        if (this.get(joint.id)) throw new Error(`Joint '${joint.id}' already exists`);
        this.joints.splice(index, 0, structuredClone(joint));
        this.changed('add');
    }

    /** @returns {?{joint: Object, index: number}} */
    remove(id) {
        const index = this.joints.findIndex(j => j.id === id);
        if (index < 0) return null;
        const [joint] = this.joints.splice(index, 1);
        this.changed('remove');
        return { joint, index };
    }

    /** Merge params (a value of undefined removes that param). */
    setParams(id, params) {
        const joint = this.get(id);
        if (!joint) throw new Error(`Unknown joint '${id}'`);
        const next = { ...joint.params };
        for (const [k, v] of Object.entries(params)) {
            if (v === undefined) delete next[k];
            else next[k] = v;
        }
        joint.params = next;
        this.changed('params');
    }

    setGround(shapeId) {
        this.ground = shapeId || null;
        this.changed('ground');
    }

    toJSON() {
        const json = { joints: structuredClone(this.joints), ground: this.ground };
        if (this.fabrication) json.fabrication = structuredClone(this.fabrication);
        return json;
    }

    /** Replace everything (null = empty). */
    fromJSON(json) {
        this.joints = json?.joints ? structuredClone(json.joints) : [];
        this.ground = json?.ground ?? null;
        this.fabrication = json?.fabrication ? structuredClone(json.fabrication) : null;
        this.changed('replace');
    }

    /** @private */
    changed(kind) {
        this.revision++;
        EventBus.emit(EVENTS.JOINTS_CHANGED, { kind, revision: this.revision });
    }
}
