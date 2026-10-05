/**
 * @fileoverview Tab and slot (T joint): panel B's edge carries tabs that
 * pass through slots cut along a line on panel A's face — shelves into
 * sides, ribs into a spine, legs into a top.
 *
 *   join tab_slot shelf.left side.left.inset(120) { tabs: 3 lock: wedge }
 *
 * Either order may be written; A is always the face (line) side.
 * `lock: wedge` (wedged / tusk tenon) lengthens each tab past A's far face
 * and cuts a hole for a loose wedge, generated as an extra piece: glue-free
 * and knock-down.
 *
 * @module joints/types/tab_slot
 */
import { FIT_CLEARANCE, alongEdge } from '../params.js';
import { edgeOnFacePose, overlap, portRect, portPoint, centres } from './common.js';
import { pointInPolygon } from '../../fabrication/polygon.js';

/** Geometry of the tabs, shared by cut / extras / checks. */
export function tabLayout({ joint, partA, partB }) {
    const portA = partA.ports[joint.a.port];
    const lenA = portA.length, lenB = partB.ports[joint.b.port].length;
    const s = alongEdge(joint.params.align, lenA, lenB);
    const [o0, o1] = overlap(s, lenA, lenB);
    const L = o1 - o0;
    const n = joint.params.tabs ?? Math.min(8, Math.max(2, Math.round(L / 120)));
    const w = joint.params.tab_width ?? Math.min(40, L / n / 2);
    const tA = partA.thickness, tB = partB.thickness;
    const wedge = joint.params.lock === 'wedge';
    // Wedge hole: one wedge thickness (= tB) long, starting 0.5 mm inside A's
    // far face so the wedge pulls the joint tight; margin beyond it ≥ tB.
    const wedgeHole = wedge ? { from: tA - 0.5, to: tA - 0.5 + tB, width: w * 0.6 } : null;
    const protrusion = wedge ? wedgeHole.to + Math.max(tB, 4) : tA;
    return { portA, s, o0, o1, L, n, w, tA, tB, protrusion, wedgeHole, mids: centres(o0, o1, n) };
}

export default {
    id: 'tab_slot',
    label: 'Tab and slot',
    description: 'Tabs on one panel edge go through slots in another panel face (shelves, ribs, legs).',
    ports: ['line', 'edge'],
    params: {
        tabs: { type: 'int', default: null, min: 1, max: 20, label: 'Tabs', help: 'Empty = about one per 120 mm.' },
        tab_width: { type: 'number', default: null, min: 4, max: 400, unit: 'mm', label: 'Tab width' },
        lock: { type: 'enum', default: 'none', values: ['none', 'wedge'], label: 'Lock' },
        side: { type: 'enum', default: 'up', values: ['up', 'down'], label: 'Side' },
        align: { type: 'enum', default: 'center', values: ['start', 'center', 'end'], label: 'Align' },
        fit: { type: 'enum', default: 'snug', values: ['snug', 'press', 'loose'], label: 'Fit' }
    },

    pose: edgeOnFacePose,

    cut(ctx) {
        const { joint, partA, partB } = ctx;
        const t = tabLayout(ctx);
        const c = (FIT_CLEARANCE[joint.params.fit] ?? 0) / 2;
        const portB = partB.ports[joint.b.port];
        const features = [];
        for (const mid of t.mids) {
            features.push({ kind: 'hole', partId: partA.id, polygon: portRect(t.portA, mid - t.w / 2 - c, mid + t.w / 2 + c, -t.tB / 2 - c, t.tB / 2 + c) });
            const [b0, b1] = [t.s - (mid + t.w / 2), t.s - (mid - t.w / 2)];
            features.push({ kind: 'edge', partId: partB.id, port: joint.b.port, u0: b0, u1: b1, depth: -t.protrusion, flare: 0 });
            if (t.wedgeHole) {
                const bm = (b0 + b1) / 2, hw = t.wedgeHole.width / 2;
                features.push({ kind: 'hole', partId: partB.id, polygon: portRect(portB, bm - hw, bm + hw, -t.wedgeHole.to, -t.wedgeHole.from) });
            }
        }
        return features;
    },

    /** Loose wedges for `lock: wedge`, cut from B's sheet. */
    extraParts(ctx) {
        const t = tabLayout(ctx);
        if (!t.wedgeHole) return [];
        const narrow = t.wedgeHole.width * 0.7, wide = t.wedgeHole.width * 1.4, length = 6 * t.tB + 24;
        return t.mids.map((_, i) => ({
            id: `${ctx.joint.id}.wedge${i + 1}`,
            thickness: t.tB,
            outline: [{ x: 0, y: 0 }, { x: length, y: (wide - narrow) / 2 }, { x: length, y: (wide + narrow) / 2 }, { x: 0, y: wide }]
        }));
    },

    check(ctx) {
        const { partA } = ctx;
        const t = tabLayout(ctx);
        const findings = [];
        if (t.n * t.w > t.L) findings.push({ severity: 'error', code: 'tabs_do_not_fit', message: `${t.n} tabs of ${t.w.toFixed(1)} mm do not fit on ${t.L.toFixed(1)} mm` });
        const margin = Math.max(2 * t.tA, 3);
        for (const mid of t.mids) {
            const corners = [[-t.w / 2, -t.tB / 2], [t.w / 2, -t.tB / 2], [t.w / 2, t.tB / 2], [-t.w / 2, t.tB / 2]]
                .map(([du, dv]) => portPoint(t.portA, mid + du, dv));
            if (!corners.every(p => pointInPolygon(p, partA.outline))) {
                findings.push({ severity: 'error', code: 'slot_outside', message: `a slot falls outside ${partA.id}` });
                break;
            }
            const near = corners.some(p => distanceToOutline(p, partA.outline) < margin);
            if (near) {
                findings.push({ severity: 'warning', code: 'slot_near_edge', message: `a slot is closer than ${margin.toFixed(0)} mm to the edge of ${partA.id}; it may break out` });
                break;
            }
        }
        return findings;
    },

    bom(ctx) {
        const t = tabLayout(ctx);
        return t.wedgeHole ? [{ item: `wedge (${t.tB} mm sheet)`, qty: t.n }] : [];
    }
};

function distanceToOutline(p, outline) {
    let best = Infinity;
    for (let i = 0; i < outline.length; i++) {
        const a = outline[i], b = outline[(i + 1) % outline.length];
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
    }
    return best;
}
