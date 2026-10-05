/**
 * @fileoverview Small 2D polygon helpers for the fabrication pipeline
 * (pure, dependency-free so they run in the browser and under Node).
 * Polygons are arrays of {x, y}; "CCW" means positive signed area in a
 * y-up frame.
 *
 * @module fabrication/polygon
 */

export function signedArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
}

/** @returns {Array} The polygon in CCW order (copy). */
export function toCCW(pts) {
    return signedArea(pts) < 0 ? pts.slice().reverse() : pts.slice();
}

/** Even-odd point-in-polygon test (boundary points are unspecified). */
export function pointInPolygon(p, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a.y > p.y) !== (b.y > p.y)
            && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Offset a simple CCW polygon by `d` (d > 0 grows it outward, d < 0 shrinks
 * it) with mitred corners — exact for the rectilinear joint outlines Otto
 * generates, and used to compensate laser kerf. Very sharp corners have
 * their miter capped at `miterLimit · |d|`.
 *
 * @param {Array<{x:number, y:number}>} pts - CCW polygon.
 * @param {number} d
 * @param {number} [miterLimit=4]
 * @returns {Array<{x:number, y:number}>}
 */
export function offsetPolygon(pts, d, miterLimit = 4) {
    if (d === 0) return pts.map(p => ({ x: p.x, y: p.y }));
    const n = pts.length;
    const out = [];
    for (let i = 0; i < n; i++) {
        const prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n];
        const n1 = outwardNormal(prev, cur);
        const n2 = outwardNormal(cur, next);
        // Miter point: cur + d·m where m bisects the normals, |m| = 1/cos(θ/2).
        const mx = n1.x + n2.x, my = n1.y + n2.y;
        const dot = mx * n2.x + my * n2.y;
        if (Math.abs(dot) < 1e-12) {
            out.push({ x: cur.x + d * n1.x, y: cur.y + d * n1.y });
            continue;
        }
        let k = 1 / dot;   // scale so that m·n2 = 1
        const len = Math.hypot(mx * k, my * k);
        if (len > miterLimit) k *= miterLimit / len;
        out.push({ x: cur.x + d * mx * k, y: cur.y + d * my * k });
    }
    return out;
}

function outwardNormal(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dy / len, y: -dx / len };   // right-hand normal = outward for CCW
}

/** Axis-aligned bounds. */
export function bounds(pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}
