/**
 * @fileoverview meshSpecs — the 3D preview's input, as plain data (pure, so
 * it is tested in Node; the three.js view only turns specs into meshes).
 *
 * One spec per jointed part: its cut outline + holes in part coordinates,
 * the sheet thickness to extrude by, its world pose (column-major 4×4, the
 * layout three.js `Matrix4.fromArray` reads), and whether it sits in a loop
 * of joints that does not close.
 *
 * @module views/three/meshSpecs
 */

/**
 * @param {{resolved, cuts3d, solved}} joints - JointService.resolveJoints output.
 * @returns {{parts: Array<{partId, outer, holes, depth, matrix, status: 'ok'|'bad'}>,
 *   problems: string[]}}
 */
export function meshSpecs({ resolved, cuts3d, solved, findings = [] }) {
    const bad = new Set();
    for (const r of solved.inconsistent) r.cycle.forEach(id => bad.add(id));
    const parts = resolved.parts
        .filter(part => solved.poses.has(part.id) && cuts3d.has(part.id))
        .map(part => ({
            partId: part.id,
            outer: cuts3d.get(part.id).outer,
            holes: cuts3d.get(part.id).holes,
            depth: part.thickness,
            matrix: solved.poses.get(part.id).slice(),
            status: bad.has(part.id) ? 'bad' : 'ok'
        }));
    const problems = findings
        .filter(f => f.code === 'loop_not_closed' || f.severity === 'error')
        .map(f => f.message);
    return { parts, problems };
}
