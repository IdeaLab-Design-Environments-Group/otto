/**
 * @fileoverview MeshBuilder — turns a resolved 2D shape into a 3D piece mesh
 * with per-shape depth (extrusion thickness) and z (elevation).
 *
 * Wraps the existing {@link AssemblyPieceFactory} (the battle-tested
 * universal toGeometryPath → THREE.Shape converter, including joinery teeth
 * and female holes) rather than reimplementing it. The 2.5D contribution is
 * threading each shape's resolved `depth`/`z` into the factory instead of the
 * old hardcoded 3mm thickness.
 *
 * It also computes a `geomKey`: a fingerprint of everything that affects the
 * mesh GEOMETRY (type, geometry-affecting properties, depth, joinery). The
 * Viewport3D sync uses it to decide, per shape, between a cheap transform
 * update (position/rotation/elevation only) and a full geometry rebuild.
 *
 * @module views/viewport3d/MeshBuilder
 */
import { THREE } from './three.js';
import { AssemblyPieceFactory } from '../../assembly/AssemblyPieceFactory.js';

export class MeshBuilder {
    constructor() {
        this.factory = new AssemblyPieceFactory({ thickness: 3 });
    }

    /**
     * Build a piece mesh for a resolved shape.
     *
     * @param {Object} resolvedShape - A shape with bindings resolved (so
     *   depth/z/geometry are concrete numbers).
     * @param {Object} [options]
     * @param {Array} [options.edges] - Edges for joinery (from
     *   shapeStore.getEdgesForShape).
     * @param {Object} [options.joineryProvider] - Object exposing
     *   getEdgeJoinery(edge) (the shapeStore).
     * @returns {?{mesh: THREE.Object3D, geomKey: string}} null if the shape
     *   produced no geometry.
     */
    build(resolvedShape, { edges = [], joineryProvider = null } = {}) {
        const depth = Number(resolvedShape.depth ?? 3) || 3;
        const z = Number(resolvedShape.z ?? 0) || 0;

        const piece = this.factory.createPiece(resolvedShape, {
            edges,
            joineryProvider,
            depth,
            z
        });
        if (!piece) return null;

        piece.mesh.userData.id = resolvedShape.id;
        return {
            mesh: piece.mesh,
            geomKey: this.geomKey(resolvedShape, edges, joineryProvider)
        };
    }

    /**
     * Fingerprint of a shape's geometry-affecting state. Two shapes with the
     * same key produce identical geometry, so only their transform differs.
     * z is intentionally EXCLUDED (it only elevates the mesh, no rebuild).
     *
     * @param {Object} shape
     * @param {Array} edges
     * @param {?Object} joineryProvider
     * @returns {string}
     */
    geomKey(shape, edges = [], joineryProvider = null) {
        // Geometry props = all schema props except the pure-transform ones
        // (rotation and z), captured from the resolved shape's toJSON.
        const json = shape.toJSON();
        delete json.bindings;
        delete json.rotation;
        delete json.z;
        delete json.position;

        let joineryKey = '';
        if (joineryProvider && edges.length) {
            joineryKey = edges
                .map(edge => {
                    const j = joineryProvider.getEdgeJoinery(edge);
                    return j ? `${j.type}:${j.thicknessMm}:${j.fingerCount}:${j.align}` : '';
                })
                .join('|');
        }

        return JSON.stringify(json) + '#' + joineryKey;
    }

    /**
     * Update only the transform of an existing mesh (used when geomKey is
     * unchanged): elevation from z, rotation from the shape's rotation.
     *
     * @param {THREE.Object3D} mesh
     * @param {Object} resolvedShape
     */
    updateTransform(mesh, resolvedShape) {
        const depth = Number(mesh.userData.depth ?? resolvedShape.depth ?? 3) || 3;
        const z = Number(resolvedShape.z ?? 0) || 0;
        mesh.position.y = z + depth / 2;
        mesh.userData.z = z;
        mesh.userData.lift = z + depth / 2;
        // Rotation about the vertical axis mirrors the 2D canvas rotation.
        const rot = Number(resolvedShape.rotation || 0);
        mesh.rotation.y = -(rot * Math.PI) / 180;
    }

    /** Dispose a mesh's geometry/material and any child outline. */
    dispose(mesh) {
        if (!mesh) return;
        mesh.traverse?.((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        });
    }
}
