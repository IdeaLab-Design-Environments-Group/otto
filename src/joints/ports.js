/**
 * @fileoverview Port references — where on a part a joint attaches.
 *
 *   {shape, edge}               a named straight edge            kind 'edge'
 *   {shape, edge, inset: d}     a line on the face, parallel to   kind 'line'
 *                               the edge, d mm inside it
 *   {shape, edge, at: d}        a slot start d mm along the edge, kind 'slot'
 *                               running straight into the panel
 *   {shape, line: [x0,y0,x1,y1]} an explicit face line           kind 'line'
 *
 * `d` and the line coordinates are numbers or expression strings over scene
 * parameters. Resolution adds the derived port to the part under a stable
 * key (e.g. `top.inset(120)`), so joint types see every port the same way:
 * {kind, a, b, length} (+ slot: {dir, extent}).
 *
 * @module joints/ports
 */
import { ExpressionParser } from '../models/ExpressionParser.js';

const parser = new ExpressionParser();

/** Stable key of a port reference within its part. */
export function portKey(ref) {
    if (ref.line) return `line(${ref.line.join(', ')})`;
    if (ref.inset !== undefined) return `${ref.edge}.inset(${ref.inset})`;
    if (ref.at !== undefined) return `${ref.edge}.at(${ref.at})`;
    return ref.edge;
}

/** AQUI text of a port reference, e.g. `wall.left.inset(120)`. */
export function portRefText(ref, nameOf = (id) => id) {
    if (ref.line) return `${nameOf(ref.shape)}.line(${ref.line.join(', ')})`;
    return `${nameOf(ref.shape)}.${portKey(ref)}`;
}

function value(v, globals) {
    return typeof v === 'number' ? v : parser.evaluate(parser.parse(String(v)), globals, { strict: true });
}

/**
 * Resolve a reference on a part, adding derived ports to `part.ports`.
 * @returns {{key: string, port: Object} | {error: string}}
 */
export function resolvePortRef(part, ref, globals = {}) {
    const key = portKey(ref);
    try {
        if (ref.line) {
            const [x0, y0, x1, y1] = ref.line.map(v => value(v, globals));
            const length = Math.hypot(x1 - x0, y1 - y0);
            if (!(length > 0)) return { error: `${ref.shape}.line(...) has zero length` };
            part.ports[key] = { kind: 'line', a: { x: x0, y: y0 }, b: { x: x1, y: y1 }, length };
            return { key, port: part.ports[key] };
        }
        const edge = part.ports[ref.edge];
        if (!edge || edge.kind !== 'edge') {
            const names = Object.keys(part.ports).filter(n => part.ports[n].kind === 'edge' && !/^e\d+$/.test(n));
            return { error: `${ref.shape} has no straight edge '${ref.edge}'` + (names.length ? ` (edges: ${names.join(', ')}, or e0…)` : '') };
        }
        if (ref.inset === undefined && ref.at === undefined) return { key, port: edge };
        const ux = (edge.b.x - edge.a.x) / edge.length, uy = (edge.b.y - edge.a.y) / edge.length;
        const n = { x: -uy, y: ux };   // into the material (outlines have positive winding)
        if (ref.inset !== undefined) {
            const d = value(ref.inset, globals);
            if (!(d > 0)) return { error: `${portRefText(ref)}: inset must be positive` };
            part.ports[key] = {
                kind: 'line',
                a: { x: edge.a.x + n.x * d, y: edge.a.y + n.y * d },
                b: { x: edge.b.x + n.x * d, y: edge.b.y + n.y * d },
                length: edge.length
            };
            return { key, port: part.ports[key] };
        }
        const d = value(ref.at, globals);
        if (!(d > 0 && d < edge.length)) return { error: `${portRefText(ref)}: at must be inside the edge (0…${edge.length.toFixed(1)})` };
        const p = { x: edge.a.x + ux * d, y: edge.a.y + uy * d };
        const extent = rayExtent(part.outline, p, n);
        if (!(extent > 0)) return { error: `${portRefText(ref)}: no material behind that point` };
        const length = extent / 2;
        part.ports[key] = { kind: 'slot', a: p, dir: n, extent, length, b: { x: p.x + n.x * length, y: p.y + n.y * length } };
        return { key, port: part.ports[key] };
    } catch (e) {
        return { error: `${portRefText(ref)}: ${e.message}` };
    }
}

/** Set a slot port's depth (keeps it inside the panel). */
export function setSlotLength(port, length) {
    port.length = Math.max(0, Math.min(port.extent, length));
    port.b = { x: port.a.x + port.dir.x * port.length, y: port.a.y + port.dir.y * port.length };
}

/** Distance from p along unit direction d to the far side of the outline. */
export function rayExtent(outline, p, d) {
    let best = Infinity;
    for (let i = 0; i < outline.length; i++) {
        const a = outline[i], b = outline[(i + 1) % outline.length];
        const ex = b.x - a.x, ey = b.y - a.y;
        const den = d.x * ey - d.y * ex;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;
        const s = ((a.x - p.x) * d.y - (a.y - p.y) * d.x) / den;
        if (t > 1e-6 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.min(best, t);
    }
    return Number.isFinite(best) ? best : 0;
}
