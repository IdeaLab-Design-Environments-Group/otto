/**
 * @fileoverview Cross lap / egg-crate: two panels slotted halfway into each
 * other at 90° — X bases, stool legs, egg-crate grids, rib structures.
 *
 *   join cross_lap a.top.at(200) b.bottom.at(200)
 *
 * Each slot starts on an edge and runs straight into its panel, as wide as
 * the other panel is thick. A's slot is `depth` deep (default: half of A);
 * B's slot takes the rest of B's height, so the two panels end flush.
 *
 * @module joints/types/cross_lap
 */
import { FIT_CLEARANCE } from '../params.js';
import { setSlotLength } from '../ports.js';

export default {
    id: 'cross_lap',
    label: 'Cross lap',
    description: 'Two panels slotted halfway into each other at 90° (X bases, egg-crate grids).',
    ports: ['slot', 'slot'],
    params: {
        depth: { type: 'number', default: null, min: 1, max: 5000, unit: 'mm', label: 'Slot depth in A', help: 'Empty = half of A.' },
        fit: { type: 'enum', default: 'snug', values: ['snug', 'press', 'loose'], label: 'Fit' }
    },

    /** Slot depths: A's from `depth` (or half), B's makes the panels end flush. */
    preparePorts({ joint, partA, partB }) {
        const pa = partA.ports[joint.a.port], pb = partB.ports[joint.b.port];
        setSlotLength(pa, joint.params.depth ?? pa.extent / 2);
        setSlotLength(pb, pb.extent - pa.length);
    },

    /** Slot lines coincide (opposite directions); the mid-planes intersect. */
    pose({ lenA, lenB, tA, tB }) {
        return { s: lenA + lenB, dy: -tB / 2, dz: tA / 2, fold: 90 };
    },

    cut({ joint, partA, partB }) {
        const c = FIT_CLEARANCE[joint.params.fit] ?? 0;
        const notch = (part, portName, mateT) => {
            const p = part.ports[portName];
            return { kind: 'notchAt', partId: part.id, point: p.a, dir: p.dir, width: mateT + c, depth: p.length };
        };
        return [notch(partA, joint.a.port, partB.thickness), notch(partB, joint.b.port, partA.thickness)];
    },

    check({ joint, partA, partB }) {
        const pa = partA.ports[joint.a.port], pb = partB.ports[joint.b.port];
        const findings = [];
        if (Math.abs(pa.extent - pb.extent) > 0.5) {
            findings.push({ severity: 'info', code: 'cross_lap_unequal', message: `${partA.id} is ${pa.extent.toFixed(1)} mm and ${partB.id} ${pb.extent.toFixed(1)} mm deep at the slot; they will not end flush on ${partA.id}'s side` });
        }
        if (pb.length < 1) findings.push({ severity: 'error', code: 'cross_lap_depth', message: `slot in ${partA.id} is as deep as ${partB.id}; nothing is left for ${partB.id}'s slot` });
        return findings;
    }
};
