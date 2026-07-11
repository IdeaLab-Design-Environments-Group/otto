/**
 * @fileoverview Three.js re-export for the embedded 3D viewport.
 * Loaded lazily (only when the 3D panel is first opened) via the import map
 * in index.html. Direct object movement is handled by the viewport's small
 * work-plane drag controller, so only OrbitControls is needed from addons.
 * @module views/viewport3d/three
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export { THREE, OrbitControls };
