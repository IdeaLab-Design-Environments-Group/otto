/**
 * @fileoverview CutGeometry — the real laser-cut outline of every part: the
 * part outline with joint teeth, tabs and notches spliced into its edges,
 * plus slot holes. Nominal size (kerf is compensated at export).
 *
 * Edge splicing works in edge-local coordinates (u along the edge from its
 * start vertex, n inward). A feature is a notch (depth > 0) or tab
 * (depth < 0) between u0 and u1, optionally flared, or carries its own
 * `profile` points ({u, n}, from (u0, 0) to (u1, 0)) for shaped cuts. Where notches meet at a corner, the corner vertex
 * is replaced by the intersection of the two cut lines, which turns the two
 * notches into one clean L-shaped cut (the classic finger-box corner).
 *
 * @module fabrication/CutGeometry
 */
import { toCCW } from './polygon.js';

const EPS = 1e-6;

/**
 * Build the cut of every part from joint features.
 * @param {{parts: Array}} resolved - Parts with CCW outlines and edge ports.
 * @param {Array} features - Cut features (see joints/JointRegistry, `cut`).
 * @returns {{cuts: Map<string, {outer: Array, holes: Array}>, diagnostics: Array}}
 */
export function buildAllCuts(resolved, features) {
    const diagnostics = [];
    const byPart = new Map();
    for (const f of features) {
        if (!byPart.has(f.partId)) byPart.set(f.partId, []);
        byPart.get(f.partId).push(f);
    }
    const cuts = new Map();
    for (const part of resolved.parts) {
        cuts.set(part.id, buildPartCut(part, byPart.get(part.id) || [], diagnostics));
    }
    return { cuts, diagnostics };
}

/**
 * @param {Object} part - Resolved part (CCW outline, ports).
 * @param {Array} features - Its cut features (see joints/JointRegistry).
 * @param {Array} [diagnostics] - Problems are appended here.
 * @returns {{outer: Array<{x,y}>, holes: Array<Array<{x,y}>>}}
 */
export function buildPartCut(part, features, diagnostics = []) {
    const V = part.outline;
    const n = V.length;
    const edges = V.map((a, k) => {
        const b = V[(k + 1) % n];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        const x = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
        return { a, b, L, x, y: { x: -x.y, y: x.x }, features: [] };
    });

    for (const f of features) {
        if (f.kind === 'edge') {
            const k = edgeIndexOfPort(part, f.port, edges);
            if (k < 0) {
                diagnostics.push(diag('error', 'port_not_on_outline', `${part.id}.${f.port}: joint features need an outline edge`, f.jointId));
                continue;
            }
            edges[k].features.push({ u0: f.u0, u1: f.u1, depth: f.depth, flare: f.flare || 0, profile: f.profile || null, jointId: f.jointId });
        } else if (f.kind === 'notchAt') {
            const hit = locateOnOutline(f.point, edges);
            if (!hit) {
                diagnostics.push(diag('error', 'notch_off_outline', `${part.id}: cross-lap slot must start on the outline`, f.jointId));
                continue;
            }
            const e = edges[hit.k];
            if (f.dir.x * e.y.x + f.dir.y * e.y.y < 1 - 1e-6) {
                diagnostics.push(diag('error', 'notch_not_perpendicular', `${part.id}: cross-lap slot must run straight into the part`, f.jointId));
                continue;
            }
            e.features.push({ u0: hit.u - f.width / 2, u1: hit.u + f.width / 2, depth: f.depth, flare: 0, jointId: f.jointId });
        }
    }

    // Per edge: sorted, clamped, non-overlapping features → interior profile.
    for (const e of edges) {
        e.features.sort((p, q) => p.u0 - q.u0);
        const kept = [];
        for (const f of e.features) {
            const g = { ...f, u0: Math.max(0, f.u0), u1: Math.min(e.L, f.u1) };
            if (g.u1 - g.u0 <= EPS) continue;
            if (kept.length && g.u0 < kept[kept.length - 1].u1 - EPS) {
                diagnostics.push(diag('error', 'feature_overlap', `${part.id}: joints ${kept[kept.length - 1].jointId} and ${g.jointId} overlap on one edge`, g.jointId));
                continue;
            }
            kept.push(g);
        }
        e.features = kept;
        const first = kept[0], last = kept[kept.length - 1];
        e.startDepth = first && first.u0 <= EPS ? first.depth : 0;
        e.endDepth = last && last.u1 >= e.L - EPS ? last.depth : 0;
        e.profile = [];
        for (const f of kept) {
            const atStart = f.u0 <= EPS, atEnd = f.u1 >= e.L - EPS;
            if (f.profile) {
                // Custom shape (knob, T-slot): its own points, from (u0, 0) to (u1, 0).
                if (atStart || atEnd) {
                    diagnostics.push(diag('error', 'profile_at_corner', `${part.id}: shaped joint features cannot touch a corner`, f.jointId));
                    continue;
                }
                e.profile.push(...f.profile);
                continue;
            }
            if (!atStart) {
                e.profile.push({ u: f.u0, n: 0 });
                e.profile.push({ u: Math.max(0, f.u0 - f.flare), n: f.depth });
            }
            if (!atEnd) {
                e.profile.push({ u: Math.min(e.L, f.u1 + f.flare), n: f.depth });
                e.profile.push({ u: f.u1, n: 0 });
            }
        }
    }

    const outer = [];
    for (let k = 0; k < n; k++) {
        const prev = edges[(k - 1 + n) % n];
        const e = edges[k];
        outer.push(cornerPoint(V[k], prev, prev.endDepth, e, e.startDepth));
        for (const p of e.profile) outer.push({ x: e.a.x + e.x.x * p.u + e.y.x * p.n, y: e.a.y + e.x.y * p.u + e.y.y * p.n });
    }

    const holes = features.filter(f => f.kind === 'hole').map(f => toCCW(f.polygon));
    return { outer: dedupe(outer), holes };
}

/** Index of the outline edge that a part's edge port runs along, or −1. */
function edgeIndexOfPort(part, portName, edges) {
    const port = part.ports[portName];
    if (!port || port.kind !== 'edge') return -1;
    return edges.findIndex(e => near(e.a, port.a) && near(e.b, port.b));
}

/** Outline edge containing point p (within tolerance) and the distance along it. */
function locateOnOutline(p, edges) {
    for (let k = 0; k < edges.length; k++) {
        const e = edges[k];
        const u = (p.x - e.a.x) * e.x.x + (p.y - e.a.y) * e.x.y;
        const v = (p.x - e.a.x) * e.y.x + (p.y - e.a.y) * e.y.y;
        if (u >= -EPS && u <= e.L + EPS && Math.abs(v) < 1e-4) return { k, u };
    }
    return null;
}

/** Corner vertex after shifting the two adjacent edges inward by their cut depths. */
function cornerPoint(v, prev, dPrev, next, dNext) {
    if (dPrev === 0 && dNext === 0) return { x: v.x, y: v.y };
    // Line 1: v + dPrev·prev.y + t·prev.x ; line 2: v + dNext·next.y + s·next.x.
    const p1 = { x: v.x + dPrev * prev.y.x, y: v.y + dPrev * prev.y.y };
    const p2 = { x: v.x + dNext * next.y.x, y: v.y + dNext * next.y.y };
    const cross = prev.x.x * next.x.y - prev.x.y * next.x.x;
    if (Math.abs(cross) < 1e-12) return p1;
    const t = ((p2.x - p1.x) * next.x.y - (p2.y - p1.y) * next.x.x) / cross;
    return { x: p1.x + t * prev.x.x, y: p1.y + t * prev.x.y };
}

function near(p, q) {
    return Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6;
}

function dedupe(pts) {
    const out = [];
    for (const p of pts) {
        const last = out[out.length - 1];
        if (!last || Math.abs(last.x - p.x) > 1e-9 || Math.abs(last.y - p.y) > 1e-9) out.push(p);
    }
    if (out.length > 1 && near(out[0], out[out.length - 1])) out.pop();
    return out;
}

function diag(severity, code, message, target) {
    return { severity, code, message, target };
}
