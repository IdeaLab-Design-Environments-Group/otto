/**
 * @fileoverview Bolt (T-slot with captive nut): panel B's edge is bolted to
 * a line on panel A's face — removable, strong, knock-down.
 *
 *   join bolt leg.top seat.bottom.inset(40) { size: M4 count: 2 }
 *
 * A gets round holes on the line; B's edge gets a T-slot per bolt: a channel
 * for the shank plus a pocket that traps a hex nut. The bill of materials
 * lists the bolts and nuts.
 *
 * @module joints/types/bolt
 */
import { alongEdge } from '../params.js';
import { edgeOnFacePose, overlap, centres, portPoint, circle } from './common.js';

/** ISO metric coarse: shank Ø, nut across flats, nut height (mm). */
export const BOLTS = {
    M3: { d: 3, af: 5.5, nut: 2.4 },
    M4: { d: 4, af: 7, nut: 3.2 },
    M5: { d: 5, af: 8, nut: 4 },
    M6: { d: 6, af: 10, nut: 5 }
};
export const BOLT_LENGTHS = [10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80];
const CLEAR = 0.3;   // clearance on holes and pockets

/** Bolt layout and T-slot dimensions, shared by cut / check / bom. */
export function boltLayout({ joint, partA, partB }) {
    const spec = BOLTS[joint.params.size];
    const lenA = partA.ports[joint.a.port].length, lenB = partB.ports[joint.b.port].length;
    const s = alongEdge(joint.params.align, lenA, lenB);
    const [o0, o1] = overlap(s, lenA, lenB);
    const n = joint.params.count ?? Math.min(6, Math.max(2, Math.round((o1 - o0) / 150)));
    const tA = partA.thickness;
    const needed = tA + 3 + spec.nut + 3;   // through A, 3 mm shank, nut, 3 mm past it
    const length = joint.params.length ?? (BOLT_LENGTHS.find(l => l >= needed) ?? BOLT_LENGTHS[BOLT_LENGTHS.length - 1]);
    const channel = length - tA + 1;               // shank inside B (+1 mm so the bolt never bottoms)
    const pocketTo = length - tA - 2;              // nut ends 2 mm before the bolt tip
    const pocketFrom = pocketTo - spec.nut - CLEAR;
    return { spec, s, o0, o1, n, length, channel, pocketFrom, pocketTo, mids: centres(o0, o1, n) };
}

/** T-slot outline in B's edge coordinates around B-coordinate `m`. */
function tSlot(m, k) {
    const ds = (k.spec.d + CLEAR) / 2, nw = (k.spec.af + CLEAR) / 2;
    return [
        { u: m - ds, n: 0 }, { u: m - ds, n: k.pocketFrom }, { u: m - nw, n: k.pocketFrom },
        { u: m - nw, n: k.pocketTo }, { u: m - ds, n: k.pocketTo }, { u: m - ds, n: k.channel },
        { u: m + ds, n: k.channel }, { u: m + ds, n: k.pocketTo }, { u: m + nw, n: k.pocketTo },
        { u: m + nw, n: k.pocketFrom }, { u: m + ds, n: k.pocketFrom }, { u: m + ds, n: 0 }
    ];
}

export default {
    id: 'bolt',
    label: 'Bolt (T-slot)',
    description: 'Bolts through a face into T-slots with captive nuts in the other panel edge (removable).',
    ports: ['line', 'edge'],
    params: {
        size: { type: 'enum', default: 'M4', values: Object.keys(BOLTS), label: 'Bolt size' },
        count: { type: 'int', default: null, min: 1, max: 20, label: 'Bolts', help: 'Empty = about one per 150 mm (2–6).' },
        length: { type: 'number', default: null, values: BOLT_LENGTHS, unit: 'mm', label: 'Bolt length', help: 'Empty = shortest standard length that reaches past the nut.' },
        side: { type: 'enum', default: 'up', values: ['up', 'down'], label: 'Side' },
        align: { type: 'enum', default: 'center', values: ['start', 'center', 'end'], label: 'Align' }
    },

    pose: edgeOnFacePose,

    cut(ctx) {
        const { joint, partA, partB } = ctx;
        const k = boltLayout(ctx);
        const portA = partA.ports[joint.a.port];
        const features = [];
        for (const mid of k.mids) {
            features.push({ kind: 'hole', partId: partA.id, polygon: circle(portPoint(portA, mid, 0), (k.spec.d + CLEAR) / 2) });
            const profile = tSlot(k.s - mid, k);
            features.push({ kind: 'edge', partId: partB.id, port: joint.b.port, u0: profile[0].u, u1: profile[profile.length - 1].u, depth: 1, profile });
        }
        return features;
    },

    check(ctx) {
        const k = boltLayout(ctx);
        const tB = ctx.partB.thickness;
        const findings = [];
        if (k.pocketFrom < 3) {
            findings.push({ severity: 'error', code: 'bolt_too_short', message: `an M${k.spec.d}×${k.length} bolt is too short to reach a nut pocket in ${ctx.partB.id}` });
        }
        if (k.spec.af > tB) {
            findings.push({ severity: 'warning', code: 'nut_wider_than_sheet', message: `the ${ctx.joint.params.size} nut (${k.spec.af} mm across flats) is wider than ${ctx.partB.id} (${tB} mm); it will stick out of the faces` });
        }
        return findings;
    },

    bom(ctx) {
        const k = boltLayout(ctx);
        return [
            { item: `${ctx.joint.params.size}×${k.length} bolt`, qty: k.n },
            { item: `${ctx.joint.params.size} hex nut`, qty: k.n }
        ];
    }
};
