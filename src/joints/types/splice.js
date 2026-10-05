/**
 * @fileoverview Splice: joins two panels edge to edge IN ONE PLANE with
 * interlocking puzzle teeth — the way to make a part longer than the laser
 * bed out of two pieces.
 *
 *   join splice top_l.right top_r.left { style: knob count: 3 }
 *
 * A gets notches, B gets the same shape as tabs, so they lock in-plane.
 * style dovetail: flared trapezoid teeth; style knob: round jigsaw knobs.
 *
 * @module joints/types/splice
 */
import { FIT_CLEARANCE, alongEdge } from '../params.js';
import { overlap, centres, mirrorProfile } from './common.js';

/** Tooth layout shared by cut and check. */
export function spliceLayout({ joint, partA, partB }) {
    const lenA = partA.ports[joint.a.port].length, lenB = partB.ports[joint.b.port].length;
    const s = alongEdge(joint.params.align, lenA, lenB);
    const [o0, o1] = overlap(s, lenA, lenB);
    const L = o1 - o0;
    const t = Math.max(partA.thickness, partB.thickness);
    const n = joint.params.count ?? Math.max(1, Math.round(L / Math.max(8 * t, 40)));
    const pitch = L / n;
    return { s, o0, o1, L, n, pitch, t, mids: centres(o0, o1, n) };
}

/**
 * Round knob in edge coordinates (u along the edge, n into A), centred on
 * `mid`: a neck from the edge, then a circular head. `grow` enlarges it
 * (fit clearance on the notch side).
 */
function knobProfile(mid, pitch, grow) {
    const neck = 0.3 * pitch + 2 * grow;
    const r = 0.22 * pitch + grow;
    const neckLen = 0.12 * pitch;
    // Head centre placed so the circle meets the neck sides exactly at n = neckLen.
    const cy = neckLen + Math.sqrt(r * r - (neck / 2) ** 2);
    const left = Math.atan2(neckLen - cy, -neck / 2);    // lower-left junction
    const right = Math.atan2(neckLen - cy, neck / 2);    // lower-right junction
    const sweep = left - (right - 2 * Math.PI);          // the long way round, over the far side
    const pts = [{ u: mid - neck / 2, n: 0 }];
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
        const a = left - (i / steps) * sweep;
        pts.push({ u: mid + r * Math.cos(a), n: cy + r * Math.sin(a) });
    }
    pts.push({ u: mid + neck / 2, n: 0 });
    return pts;
}

function dovetailProfile(mid, pitch, grow) {
    const w = pitch / 2 + 2 * grow;
    const depth = Math.min(Math.max(0.8 * (pitch / 2), 12), 40) + grow;
    const flare = 0.25 * (pitch / 2);
    return [
        { u: mid - w / 2, n: 0 }, { u: mid - w / 2 - flare, n: depth },
        { u: mid + w / 2 + flare, n: depth }, { u: mid + w / 2, n: 0 }
    ];
}

export default {
    id: 'splice',
    label: 'Splice',
    description: 'Joins two panels edge to edge in one plane with puzzle teeth (parts larger than the bed).',
    ports: ['edge', 'edge'],
    params: {
        count: { type: 'int', default: null, min: 1, max: 40, label: 'Teeth', help: 'Empty = about one per 8 × thickness (≥ 40 mm).' },
        style: { type: 'enum', default: 'dovetail', values: ['dovetail', 'knob'], label: 'Style' },
        align: { type: 'enum', default: 'center', values: ['start', 'center', 'end'], label: 'Align' },
        fit: { type: 'enum', default: 'snug', values: ['snug', 'press', 'loose'], label: 'Fit' }
    },

    /** Coplanar continuation: B lies on the far side of A's edge. */
    pose({ joint, lenA, lenB }) {
        return { s: alongEdge(joint.params.align, lenA, lenB), dy: 0, dz: 0, fold: 180 };
    },

    cut(ctx) {
        const { joint, partA, partB } = ctx;
        const k = spliceLayout(ctx);
        const c = (FIT_CLEARANCE[joint.params.fit] ?? 0) / 2;
        const shape = joint.params.style === 'knob' ? knobProfile : dovetailProfile;
        const features = [];
        for (const mid of k.mids) {
            const notch = shape(mid, k.pitch, c);     // A: grown by the clearance
            const tab = shape(mid, k.pitch, 0);       // B: nominal
            features.push({ kind: 'edge', partId: partA.id, port: joint.a.port, u0: notch[0].u, u1: notch[notch.length - 1].u, depth: 1, profile: notch });
            const profile = mirrorProfile(tab, k.s);
            features.push({ kind: 'edge', partId: partB.id, port: joint.b.port, u0: profile[0].u, u1: profile[profile.length - 1].u, depth: -1, profile });
        }
        return features;
    },

    check(ctx) {
        const k = spliceLayout(ctx);
        const neck = ctx.joint.params.style === 'knob' ? 0.3 * k.pitch : k.pitch / 2;
        return neck < 2 * k.t
            ? [{ severity: 'warning', code: 'splice_neck_thin', message: `tooth necks are ${neck.toFixed(1)} mm (< 2 × thickness); they may snap — use fewer teeth` }]
            : [];
    }
};
