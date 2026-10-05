/**
 * @fileoverview Finger (box) joint: interlocking rectangular fingers where
 * two panels meet at a 90° corner.
 *
 * The overlap of the two edges is split into an ODD number of teeth. Panel A
 * is notched at even teeth (depth = B's thickness), panel B at odd teeth
 * (depth = A's thickness). With an odd count A loses both end teeth, so where
 * three panels meet at a box corner exactly one of them owns the corner.
 *
 * @module joints/types/finger
 */
import { FIT_CLEARANCE, alongEdge } from '../params.js';

/** Odd tooth count ≥ 3 for an overlap of length L. */
export function fingerCount(length, toothWidth, requested) {
    let n = Number.isInteger(requested) && requested >= 2 ? requested : Math.round(length / toothWidth);
    if (n % 2 === 0) n += 1;
    return Math.max(3, n);
}

export default {
    id: 'finger',
    label: 'Finger joint',
    description: 'Interlocking fingers at a 90° corner (boxes, carcasses, drawers).',
    ports: ['edge', 'edge'],
    params: {
        count: { type: 'int', default: null, min: 3, max: 99, label: 'Teeth', help: 'Rounded up to an odd number; empty = automatic (about 2.5 × thickness wide).' },
        fold: { type: 'number', default: 90, values: [90], unit: '°', label: 'Fold angle' },
        side: { type: 'enum', default: 'up', values: ['up', 'down'], label: 'Side', help: 'Which face of A the B panel stands on.' },
        align: { type: 'enum', default: 'center', values: ['start', 'center', 'end'], label: 'Align' },
        fit: { type: 'enum', default: 'snug', values: ['snug', 'press', 'loose'], label: 'Fit' }
    },

    /**
     * @param {{joint, partA, partB}} ctx - joint.params resolved; parts with ports.
     * @returns {Array} cut features
     */
    cut({ joint, partA, partB }) {
        const lenA = partA.ports[joint.a.port].length;
        const lenB = partB.ports[joint.b.port].length;
        const s = alongEdge(joint.params.align, lenA, lenB);
        const o0 = Math.max(0, s - lenB), o1 = Math.min(lenA, s);
        const L = o1 - o0;
        if (L <= 0) return [];
        const tA = partA.thickness, tB = partB.thickness;
        const n = fingerCount(L, Math.max(2.5 * Math.max(tA, tB), 8), joint.params.count ?? undefined);
        const w = L / n;
        const c = (FIT_CLEARANCE[joint.params.fit] ?? 0) / 2;
        const features = [];
        for (let i = 0; i < n; i++) {
            const u0 = o0 + i * w, u1 = u0 + w;
            // Each notch is widened by the fit clearance, never past the overlap.
            const lo = Math.max(o0, u0 - c), hi = Math.min(o1, u1 + c);
            if (i % 2 === 0) {
                features.push({ kind: 'edge', partId: partA.id, port: joint.a.port, u0: lo, u1: hi, depth: tB, flare: 0 });
            } else {
                // B's edge runs the other way: A-coordinate u is B-coordinate s − u.
                features.push({ kind: 'edge', partId: partB.id, port: joint.b.port, u0: s - hi, u1: s - lo, depth: tA, flare: 0 });
            }
        }
        return features;
    },

    /**
     * 3D placement of B's edge relative to A's (see joints/JointSolver).
     * Both outlines reach the outer corner; B's thickness lies inside A's
     * outline. 'down' hangs B below A, still inside A's outline.
     */
    pose({ joint, lenA, lenB, tA, tB }) {
        const s = alongEdge(joint.params.align, lenA, lenB);
        return joint.params.side === 'down'
            ? { s, dy: tB, dz: tA, fold: joint.params.fold }
            : { s, dy: 0, dz: 0, fold: joint.params.fold };
    },

    /** Deterministic checks with a reason. */
    check({ joint, partA, partB }) {
        const findings = [];
        const lenA = partA.ports[joint.a.port].length;
        const lenB = partB.ports[joint.b.port].length;
        if (Math.abs(lenA - lenB) > 1e-6 && joint.params.align === 'center') {
            findings.push({ severity: 'info', code: 'finger_unequal', message: `edges are ${lenA.toFixed(1)} and ${lenB.toFixed(1)} mm; fingers cover the shorter one, centred` });
        }
        const L = Math.min(lenA, lenB);
        const n = fingerCount(L, Math.max(2.5 * Math.max(partA.thickness, partB.thickness), 8), joint.params.count ?? undefined);
        if (L / n < 2 * Math.max(partA.thickness, partB.thickness) / 3) {
            findings.push({ severity: 'warning', code: 'finger_thin', message: `${n} teeth on ${L.toFixed(1)} mm are only ${(L / n).toFixed(1)} mm wide; they may snap` });
        }
        return findings;
    }
};
