/**
 * @fileoverview Named edges of shapes — the stable attachment points for
 * joints.
 *
 * A joint refers to an edge by NAME (`base.top`), never by raw index, and
 * the name is resolved against the shape's current geometry every time, so
 * joints follow a shape when its parameters change the anchor layout (e.g. a
 * RoundedRectangle going from r = 0 to r > 0).
 *
 * Every closed shape gets generic names `e0..eN-1` for its straight,
 * non-zero-length edges; shape classes may add readable names with
 * `static edgeNames(shape, edges) → {name: edgeIndex}`. Shapes whose straight
 * edges only approximate a curve (ellipse, gear…) declare
 * `static curvedOutline = true` and offer no edges at all. Names that point at a
 * curved or zero-length edge are dropped (a joint there is an error, never a
 * silent pick).
 *
 * Coordinates are the shape's own (unrotated) geometry coordinates; use
 * `toWorld` for canvas positions (rotation about the bounds centre, matching
 * ShapesPass).
 *
 * @module joints/edges
 */

const EPS = 1e-6;

/**
 * Edges of the shape's outer path (pathIndex 0), in path order.
 * @param {Object} shape - A (resolved) model shape.
 * @returns {Array<{index: number, a: {x,y}, b: {x,y}, length: number, straight: boolean}>}
 *   Empty for open paths (lines, arcs) — they cannot be panels.
 */
export function shapeEdges(shape) {
    const geometry = shape?.toGeometryPath?.();
    if (!geometry) return [];
    const path = typeof geometry.allPaths === 'function' ? geometry.allPaths()[0] : geometry;
    if (!path?.closed || !Array.isArray(path.anchors) || path.anchors.length < 2) return [];
    const anchors = path.anchors;
    const edges = [];
    for (let i = 0; i < anchors.length; i++) {
        const p = anchors[i], q = anchors[(i + 1) % anchors.length];
        const a = { x: p.position.x, y: p.position.y };
        const b = { x: q.position.x, y: q.position.y };
        const straight = isZero(p.handleOut) && isZero(q.handleIn);
        edges.push({ index: i, a, b, length: Math.hypot(b.x - a.x, b.y - a.y), straight });
    }
    return edges;
}

/**
 * Every usable edge of a shape by name: class-provided names first, then
 * the generic `e<i>` names.
 * @param {Object} shape
 * @returns {Map<string, {index, a, b, length, straight, name}>}
 */
export function namedEdges(shape) {
    if (shape?.constructor?.curvedOutline) return new Map();
    const edges = shapeEdges(shape);
    const usable = (e) => e && e.straight && e.length > EPS;
    const named = new Map();
    const custom = shape?.constructor?.edgeNames?.(shape, edges) || {};
    for (const [name, index] of Object.entries(custom)) {
        if (usable(edges[index])) named.set(name, { ...edges[index], name });
    }
    for (const e of edges) {
        if (usable(e)) named.set(`e${e.index}`, { ...e, name: `e${e.index}` });
    }
    return named;
}

/**
 * Resolve one edge name.
 * @returns {{edge: ?Object, error: ?string}}
 */
export function resolveEdge(shape, name) {
    const edge = namedEdges(shape).get(name);
    if (edge) return { edge, error: null };
    const known = [...namedEdges(shape).keys()].filter(n => !/^e\d+$/.test(n));
    return {
        edge: null,
        error: `${shape?.id ?? 'shape'} has no straight edge '${name}'` +
            (known.length ? ` (edges: ${known.join(', ')}, or e0…)` : ' (it has no straight edges)')
    };
}

/** Signed area of the outer path (positive = the anchor order the y-down shapes use). */
export function outlineArea(shape) {
    const edges = shapeEdges(shape);
    let area = 0;
    for (const e of edges) area += e.a.x * e.b.y - e.b.x * e.a.y;
    return area / 2;
}

/**
 * Unit normal of an edge pointing INTO the shape's material, from the
 * outline winding (works for concave outlines, unlike a bounds-centre test).
 */
export function inwardNormal(shape, edge) {
    const ux = (edge.b.x - edge.a.x) / edge.length;
    const uy = (edge.b.y - edge.a.y) / edge.length;
    return outlineArea(shape) >= 0 ? { x: -uy, y: ux } : { x: uy, y: -ux };
}

/**
 * Map a point from the shape's geometry coordinates to world (canvas)
 * coordinates: rotation about the centre of the shape's bounds, as drawn.
 */
export function toWorld(shape, p) {
    const deg = Number(shape?.rotation || 0);
    if (!deg) return { x: p.x, y: p.y };
    const b = shape.getBounds();
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const rad = (deg * Math.PI) / 180;
    const dx = p.x - cx, dy = p.y - cy;
    return { x: cx + dx * Math.cos(rad) - dy * Math.sin(rad), y: cy + dx * Math.sin(rad) + dy * Math.cos(rad) };
}

/** Inverse of {@link toWorld}. */
export function toLocal(shape, p) {
    const deg = Number(shape?.rotation || 0);
    if (!deg) return { x: p.x, y: p.y };
    return toWorld({ rotation: -deg, getBounds: () => shape.getBounds() }, p);
}

function isZero(v) {
    return !v || (Math.abs(v.x) < EPS && Math.abs(v.y) < EPS);
}

/**
 * `top/right/bottom/left` for rectangle-like outlines, chosen by direction
 * rather than index: the outermost horizontal / vertical straight edge on
 * each side (longest wins a tie). Screen coordinates: y grows downward.
 * @param {Array} edges - From {@link shapeEdges}.
 * @returns {Object<string, number>} name → edge index
 */
export function axisSideNames(edges) {
    const straight = edges.filter(e => e.straight && e.length > EPS);
    const horizontal = straight.filter(e => Math.abs(e.b.y - e.a.y) <= EPS * Math.max(1, e.length));
    const vertical = straight.filter(e => Math.abs(e.b.x - e.a.x) <= EPS * Math.max(1, e.length));
    const pick = (list, key, better) => list.reduce((best, e) => {
        if (!best) return e;
        const d = key(e) - key(best);
        if (Math.abs(d) > EPS) return better(d) ? e : best;
        return e.length > best.length ? e : best;
    }, null);
    const names = {};
    const top = pick(horizontal, e => e.a.y, d => d < 0);
    const bottom = pick(horizontal, e => e.a.y, d => d > 0);
    const left = pick(vertical, e => e.a.x, d => d < 0);
    const right = pick(vertical, e => e.a.x, d => d > 0);
    if (top) names.top = top.index;
    if (bottom && bottom !== top) names.bottom = bottom.index;
    if (left) names.left = left.index;
    if (right && right !== left) names.right = right.index;
    return names;
}
