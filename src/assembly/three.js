/**
 * @fileoverview Three.js re-export for AssemblyPieceFactory (the mesh
 * converter reused by the embedded 3D viewport).
 *
 * Only THREE itself is needed here. The old Drag/Transform/Orbit controls
 * imports were removed with the standalone assembly page — eagerly loading
 * unused addon modules over the CDN was pure risk (any one 404/blocked would
 * break the whole 3D import chain).
 *
 * @module assembly/three
 */
import * as THREE from 'three';

export { THREE };
