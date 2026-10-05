/**
 * @fileoverview Tooth profile of a jointed edge in EDGE-LOCAL coordinates.
 *
 * Pure geometry shared by the canvas (JoineryPass) and the fabrication cut
 * pipeline: given a joint plan (see models/joinery.js `jointRenderPlan`), it
 * returns the polyline that replaces a straight edge. Points are
 * `{s, n}`: `s` is the distance along the edge from its start, `n` the
 * inward offset into the panel (0 = on the original edge line).
 *
 * @module fabrication/toothProfile
 */

/**
 * @param {Object} plan - A joint plan: {depth, toothWidth, taper, count, startIndex, tooth}.
 * @returns {Array<{s:number, n:number}>} The profile, starting at (0,0) and
 *   ending at (count*toothWidth, 0).
 */
export function toothProfile(plan) {
    const { depth, toothWidth, taper, count, startIndex, tooth } = plan;
    const length = toothWidth * count;

    // Notches are the removed teeth; tabs keep material on the boundary.
    const isNotch = (i) => i >= startIndex && ((i - startIndex) % 2 === 0);
    const flare = tooth === 'trapezoid' ? taper : 0;

    const pts = [{ s: 0, n: 0 }];   // tie into the starting corner at edge level
    for (let i = 0; i < count; i++) {
        const s0 = i * toothWidth;
        const s1 = s0 + toothWidth;
        if (isNotch(i)) {
            // Cut inward; a dovetail flares wider at the base (socket grip).
            pts.push({ s: s0, n: 0 });
            pts.push({ s: Math.max(0, s0 - flare), n: depth });
            pts.push({ s: Math.min(length, s1 + flare), n: depth });
            pts.push({ s: s1, n: 0 });
        } else {
            pts.push({ s: s0, n: 0 });
            pts.push({ s: s1, n: 0 });
        }
    }
    pts.push({ s: length, n: 0 });  // tie into the ending corner at edge level
    return pts;
}
