/**
 * @fileoverview Viewport3D — the embedded, live-synced 3D panel.
 *
 * This replaces the old standalone assemble.html page (which read the
 * localStorage autosave once and never updated). It is a Component that:
 *   - lazily owns a Three.js renderer + scene + orbit camera (created on
 *     first open so initial page load pays nothing);
 *   - subscribes to the EventBus and rebuilds/updates piece meshes as the
 *     2D scene changes, debounced so a slider drag stays smooth;
 *   - maps each shape's resolved depth → extrusion thickness and z →
 *     elevation, so the 3D view IS the 2.5D model;
 *   - keeps an in-place layout (canvas x→x, canvas y→z) so the 3D scene
 *     mirrors the editor;
 *   - is read-only in v1: clicking a piece selects the shape (via the
 *     SelectionModel), and selecting in 2D highlights the piece.
 *
 * Per-shape sync uses a mesh cache keyed by shape id, each entry carrying a
 * `geomKey`. On sync: unchanged key → transform-only update (fast path);
 * changed key → rebuild that mesh; missing shape → dispose. This keeps
 * param-slider scrubs at interactive frame rates for scenes of dozens of
 * pieces.
 *
 * @module views/viewport3d/Viewport3D
 */
import { Component } from '../../ui/Component.js';
import { EVENTS } from '../../events/EventBus.js';
import { THREE, OrbitControls } from './three.js';
import { Viewport3DScene } from './Viewport3DScene.js';
import { MeshBuilder } from './MeshBuilder.js';

const SYNC_DEBOUNCE_MS = 150;
const SELECTED_EMISSIVE = 0x2266aa;

export class Viewport3D extends Component {
    /**
     * @param {HTMLElement} container - The panel element to render into.
     * @param {Object} deps
     * @param {import('../../core/SceneContext.js').SceneContext} deps.context
     */
    constructor(container, { context }) {
        super(container);
        this.context = context;
        this.meshBuilder = new MeshBuilder();

        /** @type {Map<string, {mesh: THREE.Object3D, geomKey: string}>} */
        this.pieces = new Map();

        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.orbit = null;
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this._frame = null;
        this._syncTimer = null;
        this._started = false;

        this.animate = this.animate.bind(this);
        this.onResize = this.onResize.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
    }

    /**
     * Component render hook. This view drives its own Three.js render loop
     * (see {@link Viewport3D#start} / {@link Viewport3D#animate}), so the
     * DOM-render hook is intentionally empty — mount() only needs it to mark
     * the component mounted so unmount() drains EventBus subscriptions.
     */
    render() {}

    /**
     * Create the renderer/scene on first open. Idempotent — safe to call
     * every time the panel is shown.
     */
    start() {
        if (this._started) {
            this.onResize();
            this.scheduleSync();
            return;
        }
        this._started = true;

        const width = this.container.clientWidth || 1;
        const height = this.container.clientHeight || 1;

        const built = new Viewport3DScene().build({ width, height });
        this.scene = built.scene;
        this.camera = built.camera;

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.renderer.setSize(width, height);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
        this.orbit.enableDamping = true;
        this.orbit.dampingFactor = 0.08;

        this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('resize', this.onResize);

        this.subscribeToScene();
        this.syncScene();
        this.animate();
    }

    /** Subscribe to every event that can change what the 3D view should show. */
    subscribeToScene() {
        const resync = () => this.scheduleSync();
        this.subscribe(EVENTS.SHAPE_ADDED, resync);
        this.subscribe(EVENTS.SHAPE_REMOVED, resync);
        this.subscribe(EVENTS.SHAPE_MOVED, resync);
        this.subscribe(EVENTS.SHAPE_UPDATED, resync);
        this.subscribe(EVENTS.PARAM_CHANGED, resync);
        this.subscribe(EVENTS.EDGE_JOINERY_CHANGED, resync);
        this.subscribe(EVENTS.TAB_SWITCHED, resync);
        this.subscribe(EVENTS.SCENE_LOADED, resync);
        this.subscribe(EVENTS.SHAPE_SELECTED, () => this.updateSelectionHighlight());
    }

    /** Debounced sync trigger. */
    scheduleSync() {
        if (!this._started) return;
        if (this._syncTimer !== null) {
            clearTimeout(this._syncTimer);
        }
        this._syncTimer = setTimeout(() => {
            this._syncTimer = null;
            this.syncScene();
        }, SYNC_DEBOUNCE_MS);
    }

    /**
     * Reconcile the 3D pieces with the current 2D scene: rebuild changed
     * geometry, transform-update unchanged pieces, dispose removed ones.
     * Layout is in-place (canvas x→world x, canvas y→world z).
     */
    syncScene() {
        if (!this._started || !this.scene) return;
        const store = this.context.shapeStore;
        const resolved = store.getResolved();
        const seen = new Set();

        for (const shape of resolved) {
            seen.add(shape.id);
            const edges = store.getEdgesForShape(shape.id);
            const geomKey = this.meshBuilder.geomKey(shape, edges, store);
            const existing = this.pieces.get(shape.id);

            if (existing && existing.geomKey === geomKey) {
                // Fast path: geometry unchanged — only move/elevate/rotate.
                this.meshBuilder.updateTransform(existing.mesh, shape);
                this.placeInWorld(existing.mesh, shape);
                continue;
            }

            // Rebuild this piece (new or geometry changed).
            if (existing) {
                this.scene.remove(existing.mesh);
                this.meshBuilder.dispose(existing.mesh);
                this.pieces.delete(shape.id);
            }
            const built = this.meshBuilder.build(shape, { edges, joineryProvider: store });
            if (!built) continue;
            this.meshBuilder.updateTransform(built.mesh, shape);
            this.placeInWorld(built.mesh, shape);
            this.scene.add(built.mesh);
            this.pieces.set(shape.id, built);
        }

        // Dispose pieces whose shapes are gone.
        for (const [id, entry] of this.pieces) {
            if (!seen.has(id)) {
                this.scene.remove(entry.mesh);
                this.meshBuilder.dispose(entry.mesh);
                this.pieces.delete(id);
            }
        }

        this.updateSelectionHighlight();
    }

    /**
     * Place a piece in the world at the 2D canvas location (in-place layout):
     * canvas x → world x, canvas y → world z (its vertical elevation is set
     * by MeshBuilder.updateTransform from the shape's z).
     */
    placeInWorld(mesh, shape) {
        const bounds = shape.getBounds?.();
        if (bounds) {
            mesh.position.x = bounds.x + bounds.width / 2;
            mesh.position.z = bounds.y + bounds.height / 2;
        }
    }

    /** Emissive-highlight the selected shapes' pieces. */
    updateSelectionHighlight() {
        if (!this._started) return;
        const selected = this.context.selection.selectedShapeIds;
        for (const [id, entry] of this.pieces) {
            const mat = entry.mesh.material;
            if (!mat || !mat.emissive) continue;
            mat.emissive.setHex(selected.has(id) ? SELECTED_EMISSIVE : 0x000000);
        }
    }

    /** Click a piece → select its shape (read-only interaction, v1). */
    onPointerDown(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const meshes = Array.from(this.pieces.values()).map(p => p.mesh);
        const hits = this.raycaster.intersectObjects(meshes, true);
        if (hits.length === 0) return;

        // Walk up to the piece root that carries the shape id.
        let obj = hits[0].object;
        while (obj && !obj.userData?.id && obj.parent) obj = obj.parent;
        if (obj?.userData?.id) {
            this.context.shapeStore.setSelected(obj.userData.id);
        }
    }

    onResize() {
        if (!this.renderer || !this.camera) return;
        const width = this.container.clientWidth || 1;
        const height = this.container.clientHeight || 1;
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    animate() {
        if (!this._started) return;
        this._frame = requestAnimationFrame(this.animate);
        if (this.orbit) this.orbit.update();
        if (this.renderer) this.renderer.render(this.scene, this.camera);
    }

    /** Pause the render loop when the panel is hidden (keeps GPU idle). */
    stop() {
        if (this._frame !== null) {
            cancelAnimationFrame(this._frame);
            this._frame = null;
        }
    }

    unmount() {
        this.stop();
        window.removeEventListener('resize', this.onResize);
        if (this.renderer) {
            this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
        }
        for (const entry of this.pieces.values()) {
            this.meshBuilder.dispose(entry.mesh);
        }
        this.pieces.clear();
        super.unmount();
    }
}
