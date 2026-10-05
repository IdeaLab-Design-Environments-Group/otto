/**
 * @fileoverview Living hinge: two panels cut as ONE piece joined by a strip
 * of staggered slits, so the sheet bends — curved backs, wrap-around
 * corners, soft folds.
 *
 *   join hinge front.right side.left { fold: 90 radius: 30 }
 *
 * The strip is cut on A's side of the joint, as long as the bend
 * (radius × bend angle); B is attached to the far side of the strip when
 * the parts are exported (see `mergeHingePiece`). In 3D the strip is shown
 * as an arc of `radius` — an approximation of a flexing strip.
 *
 * @module joints/types/hinge
 */
import { alongEdge } from '../params.js';
import { overlap, portRect } from './common.js';

const DEG = Math.PI / 180;

/**
 * Strip and slit pattern, shared by pose / cut / check.
 * @param {Object} params - Resolved joint params.
 * @param {number} lenA @param {number} lenB - Edge lengths.
 * @param {number} t - Sheet thickness (the thicker of the two).
 */
export function hingeLayout(params, lenA, lenB, t) {
    const bend = (180 - params.fold) * DEG;
    const radius = params.radius ?? 5 * t;
    const s = alongEdge('center', lenA, lenB);
    const [o0, o1] = overlap(s, lenA, lenB);
    const L = o1 - o0;
    return {
        lenA, lenB, t, bend, radius, s, o0, o1, L,
        strip: radius * bend,
        gap: params.gap ?? 2,
        slit: params.slit ?? Math.min(30, L / 3),
        bridge: params.bridge ?? Math.max(3, t),
        width: 0.4
    };
}

const layoutOf = ({ joint, partA, partB }) => hingeLayout(
    joint.params, partA.ports[joint.a.port].length, partB.ports[joint.b.port].length,
    Math.max(partA.thickness, partB.thickness));

export default {
    id: 'hinge',
    label: 'Living hinge',
    description: 'Cuts two panels as one piece joined by a slitted strip that bends (curved backs, soft corners).',
    ports: ['edge', 'edge'],
    params: {
        fold: { type: 'number', default: 90, min: 0, max: 179, unit: '°', label: 'Fold angle', help: 'Angle between the panels: 90 = right angle.' },
        radius: { type: 'number', default: null, min: 1, max: 1000, unit: 'mm', label: 'Bend radius', help: 'Empty = 5 × thickness.' },
        side: { type: 'enum', default: 'up', values: ['up', 'down'], label: 'Side' },
        gap: { type: 'number', default: null, min: 0.8, max: 20, unit: 'mm', label: 'Slit spacing' },
        slit: { type: 'number', default: null, min: 4, max: 500, unit: 'mm', label: 'Slit length' },
        bridge: { type: 'number', default: null, min: 0.5, max: 50, unit: 'mm', label: 'Bridge' }
    },

    /** End of an arc of `radius` bending by (180° − fold), leaving A's edge outward. */
    pose({ joint, lenA, lenB, tA, tB }) {
        const h = hingeLayout(joint.params, lenA, lenB, Math.max(tA, tB));
        const up = joint.params.side !== 'down';
        return {
            s: h.s,
            dy: -h.radius * Math.sin(h.bend),
            dz: (up ? 1 : -1) * h.radius * (1 - Math.cos(h.bend)),
            fold: joint.params.fold
        };
    },

    cut(ctx) {
        const { joint, partA } = ctx;
        const h = layoutOf(ctx);
        if (h.strip <= 0) return [];
        const port = partA.ports[joint.a.port];
        // The strip: A's edge pushed outward by the strip length over the overlap.
        // The strip and its slits are flat-cut only (`only2d`): in 3D it bends, drawn by the pose.
        const features = [{ kind: 'edge', partId: partA.id, port: joint.a.port, u0: h.o0, u1: h.o1, depth: -h.strip, flare: 0, only2d: true }];
        // Slit columns across the strip (v outward = negative). Columns are
        // staggered by half a period; slits are clipped to keep a bridge at
        // both ends of the strip.
        const period = h.slit + h.bridge;
        const columns = Math.max(1, Math.floor(h.strip / h.gap));
        const lo = h.o0 + h.bridge, hi = h.o1 - h.bridge;
        for (let c = 0; c < columns; c++) {
            const v = -(c + 0.5) * (h.strip / columns);
            const phase = (c % 2) * (period / 2);
            for (let u = lo - phase; u < hi; u += period) {
                const u0 = Math.max(lo, u), u1 = Math.min(hi, u + h.slit);
                if (u1 - u0 >= h.bridge) {
                    features.push({ kind: 'hole', partId: partA.id, polygon: portRect(port, u0, u1, v - h.width / 2, v + h.width / 2), only2d: true });
                }
            }
        }
        return features;
    },

    check(ctx) {
        const h = layoutOf(ctx);
        const findings = [];
        if (Math.abs(h.lenA - h.lenB) > 1e-6) {
            findings.push({ severity: 'error', code: 'hinge_unequal', message: `a living hinge needs edges of equal length (${h.lenA.toFixed(1)} vs ${h.lenB.toFixed(1)} mm)` });
        }
        if (h.radius < 3 * h.t) {
            findings.push({ severity: 'warning', code: 'hinge_tight', message: `bend radius ${h.radius} mm is under 3 × thickness; the strip may crack (heuristic)` });
        }
        if (h.bridge < 1.5) {
            findings.push({ severity: 'warning', code: 'hinge_bridge', message: `bridges of ${h.bridge} mm are very fragile` });
        }
        return findings;
    },

    /** The piece to export: B is attached to the strip's far side. */
    merges(ctx) {
        return [{ base: ctx.partA.id, attached: ctx.partB.id, jointId: ctx.joint.id }];
    }
};
