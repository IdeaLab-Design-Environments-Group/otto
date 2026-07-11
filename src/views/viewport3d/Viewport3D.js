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
 *   - supports direct, planar object dragging with one undo entry per gesture;
 *   - uses CAD-style navigation: right-drag orbit, middle-drag pan, wheel zoom.
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
import EventBus, { EVENTS } from '../../events/EventBus.js';
import { THREE, OrbitControls } from './three.js';
import { Viewport3DScene } from './Viewport3DScene.js';
import { MeshBuilder } from './MeshBuilder.js';
import { MutateShapesCommand, syncLiteralBindingsForTranslate } from '../../commands/shapeCommands.js';

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
        this._hasFramed = false;
        this._drag = null;
        this._resizeObserver = null;
        this._toolbar = null;

        this.animate = this.animate.bind(this);
        this.onResize = this.onResize.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onDoubleClick = this.onDoubleClick.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
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
            if (this._frame === null) this.animate();
            return;
        }
        this._started = true;

        // clientWidth/Height can be 0 the instant the panel unhides; fall back
        // to the canvas-container size or a sane default so the renderer is
        // never created at 0×0 (which renders nothing).
        const width = this.container.clientWidth || this.container.parentElement?.clientWidth || 600;
        const height = this.container.clientHeight || this.container.parentElement?.clientHeight || 600;

        const built = new Viewport3DScene().build({ width, height });
        this.scene = built.scene;
        this.camera = built.camera;

        try {
            this.renderer = new THREE.WebGLRenderer({ antialias: true });
        } catch (err) {
            this._started = false;
            this.showError('WebGL is unavailable in this browser', err);
            return;
        }
        // Capping DPR avoids allocating enormous framebuffers on Retina
        // displays while panels are resized. It is visually indistinguishable
        // here and substantially reduces context-loss risk.
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(width, height);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.domElement.tabIndex = 0;
        this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D model');
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);
        this.buildToolbar();

        this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
        this.orbit.enableDamping = true;
        this.orbit.dampingFactor = 0.08;
        this.orbit.screenSpacePanning = true;
        this.orbit.zoomToCursor = true;
        this.orbit.minDistance = 10;
        this.orbit.maxDistance = 8000;
        // Reserve left-drag for direct manipulation. This mirrors the core
        // CAD convention without requiring a separate mode switch.
        this.orbit.mouseButtons.LEFT = null;
        this.orbit.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
        this.orbit.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
        this.orbit.touches.ONE = null;
        this.orbit.touches.TWO = THREE.TOUCH.DOLLY_PAN;

        this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
        this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
        this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
        this.renderer.domElement.addEventListener('pointercancel', this.onPointerUp);
        this.renderer.domElement.addEventListener('dblclick', this.onDoubleClick);
        this.renderer.domElement.addEventListener('keydown', this.onKeyDown);
        this.renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
        window.addEventListener('resize', this.onResize);
        if (window.ResizeObserver) {
            this._resizeObserver = new ResizeObserver(this.onResize);
            this._resizeObserver.observe(this.container);
        }

        this.subscribeToScene();
        // Build pieces best-effort — a bad piece must not stop the render loop,
        // so the table + valid pieces always show.
        try {
            this.syncScene();
        } catch (err) {
            console.error('Viewport3D: initial sync failed', err);
        }
        // Ensure the size is right after layout settled, then run the loop.
        this.onResize();
        this.animate();
    }

    /** Surface a fatal 3D error in the panel instead of a blank blue box. */
    showError(message, err) {
        if (err) console.error('Viewport3D:', message, err);
        this.container.innerHTML =
            `<div style="padding:16px;color:#334155;font:13px sans-serif">3D view: ${message}.</div>`;
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
        const resyncAndFrame = () => {
            this._hasFramed = false;
            this.scheduleSync();
        };
        this.subscribe(EVENTS.TAB_SWITCHED, resyncAndFrame);
        this.subscribe(EVENTS.SCENE_LOADED, resyncAndFrame);
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
            // Per-piece guard: a single shape that fails to build (bad
            // geometry, joinery edge case) is skipped and logged — it must not
            // blank the whole 3D scene.
            try {
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
            } catch (err) {
                console.error(`Viewport3D: failed to build piece "${shape.id}"`, err);
            }
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
        if (!this._hasFramed && this.pieces.size > 0) {
            this._hasFramed = true;
            this.fitToView();
        }
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

    /** Start selection/direct manipulation on the horizontal work plane. */
    onPointerDown(event) {
        if (event.button !== 0 || !this.renderer || !this.camera) return;
        const rect = this.renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const meshes = Array.from(this.pieces.values()).map(p => p.mesh);
        const hits = this.raycaster.intersectObjects(meshes, true);
        if (hits.length === 0) {
            if (!event.shiftKey) this.context.shapeStore.clearSelection();
            return;
        }

        // Walk up to the piece root that carries the shape id.
        let obj = hits[0].object;
        while (obj && !obj.userData?.id && obj.parent) obj = obj.parent;
        if (obj?.userData?.id) {
            const id = obj.userData.id;
            if (event.shiftKey) {
                if (this.context.selection.selectedShapeIds.has(id)) {
                    this.context.shapeStore.removeFromSelection(id);
                    return;
                }
                this.context.shapeStore.addToSelection(id);
            } else if (!this.context.selection.selectedShapeIds.has(id)) {
                this.context.shapeStore.setSelected(id);
            }

            const selectedIds = Array.from(this.context.selection.selectedShapeIds);
            const before = {};
            selectedIds.forEach(shapeId => {
                const shape = this.context.shapeStore.get(shapeId);
                if (shape) before[shapeId] = shape.toJSON();
            });

            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hits[0].point.y);
            const startPoint = new THREE.Vector3();
            if (!this.raycaster.ray.intersectPlane(plane, startPoint)) return;
            this._drag = { plane, lastPoint: startPoint, before, selectedIds, moved: false };
            this.orbit.enabled = false;
            this.renderer.domElement.setPointerCapture?.(event.pointerId);
            this.renderer.domElement.classList.add('is-dragging-object');
            event.preventDefault();
        }
    }

    /** Apply an incremental X/Z translation directly to the scene model. */
    onPointerMove(event) {
        if (!this._drag || !this.renderer || !this.camera) return;
        const rect = this.renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);

        const point = new THREE.Vector3();
        if (!this.raycaster.ray.intersectPlane(this._drag.plane, point)) return;
        const dx = point.x - this._drag.lastPoint.x;
        const dy = point.z - this._drag.lastPoint.z;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
        if (Math.abs(dx) + Math.abs(dy) < 0.0001) return;

        this._drag.lastPoint.copy(point);
        this._drag.moved = true;
        this._drag.selectedIds.forEach(id => {
            const shape = this.context.shapeStore.get(id);
            if (!shape) return;
            shape.translate(dx, dy);
            syncLiteralBindingsForTranslate(shape);
            const entry = this.pieces.get(id);
            if (entry) {
                entry.mesh.position.x += dx;
                entry.mesh.position.z += dy;
            }
            EventBus.emit(EVENTS.SHAPE_MOVED, { id, shape });
        });
        event.preventDefault();
    }

    /** Finish the drag and record the complete gesture as one undo command. */
    onPointerUp(event) {
        if (!this._drag) return;
        const drag = this._drag;
        this._drag = null;
        if (this.orbit) this.orbit.enabled = true;
        this.renderer?.domElement.classList.remove('is-dragging-object');
        if (event?.pointerId !== undefined) {
            try { this.renderer?.domElement.releasePointerCapture?.(event.pointerId); } catch (_) { /* no-op */ }
        }

        if (drag.moved) {
            const entries = {};
            let changed = false;
            for (const [id, before] of Object.entries(drag.before)) {
                const shape = this.context.shapeStore.get(id);
                if (!shape) continue;
                const after = shape.toJSON();
                entries[id] = { before, after };
                if (JSON.stringify(before) !== JSON.stringify(after)) changed = true;
                EventBus.emit(EVENTS.PARAM_CHANGED, { shapeId: id });
            }
            if (changed) this.context.history.record(new MutateShapesCommand('Move shapes in 3D', entries));
            this.scheduleSync();
        }
    }

    onDoubleClick(event) {
        if (event.button === 0) this.fitToView(true);
    }

    onKeyDown(event) {
        if (event.key.toLowerCase() === 'f') {
            event.preventDefault();
            this.fitToView(true);
        }
    }

    buildToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'viewport-3d-toolbar';
        toolbar.innerHTML =
            '<div class="viewport-3d-actions" role="toolbar" aria-label="3D camera controls">' +
            '<button type="button" data-view="fit" title="Fit model (F)">Fit</button>' +
            '<button type="button" data-view="iso" title="Isometric view">Iso</button>' +
            '<button type="button" data-view="top" title="Top view">Top</button>' +
            '</div><div class="viewport-3d-hint">Drag object · Right-drag orbit · Middle-drag pan · Wheel zoom</div>';
        toolbar.addEventListener('click', event => {
            const view = event.target.closest?.('button[data-view]')?.dataset.view;
            if (view === 'fit') this.fitToView(true);
            if (view === 'iso') this.setView('iso');
            if (view === 'top') this.setView('top');
        });
        this.container.appendChild(toolbar);
        this._toolbar = toolbar;
    }

    setView(view) {
        if (!this.camera || !this.orbit) return;
        const target = this.orbit.target.clone();
        const distance = Math.max(this.camera.position.distanceTo(target), 100);
        if (view === 'top') {
            this.camera.up.set(0, 0, -1);
            this.camera.position.set(target.x, target.y + distance, target.z + 0.001);
        } else {
            this.camera.up.set(0, 1, 0);
            const d = distance / Math.sqrt(3);
            this.camera.position.set(target.x + d, target.y + d, target.z + d);
        }
        this.camera.lookAt(target);
        this.orbit.update();
    }

    /** Frame all model pieces while preserving the current viewing direction. */
    fitToView(resetDirection = false) {
        if (!this.camera || !this.orbit || this.pieces.size === 0) return;
        const box = new THREE.Box3();
        this.pieces.forEach(entry => box.expandByObject(entry.mesh));
        if (box.isEmpty()) return;

        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxSize = Math.max(size.x, size.y, size.z, 20);
        const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
        const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(this.camera.aspect, 0.1));
        const distance = Math.max(
            maxSize * 0.8,
            size.y / (2 * Math.tan(verticalFov / 2)),
            size.x / (2 * Math.tan(horizontalFov / 2))
        ) * 1.45;

        let direction = this.camera.position.clone().sub(this.orbit.target).normalize();
        if (resetDirection || direction.lengthSq() < 0.5) direction.set(1, 0.85, 1).normalize();
        this.orbit.target.copy(center);
        this.camera.position.copy(center).addScaledVector(direction, Math.max(distance, 60));
        this.camera.near = Math.max(distance / 1000, 0.05);
        this.camera.far = Math.max(5000, distance * 30);
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(center);
        this.orbit.update();
    }

    onResize() {
        if (!this.renderer || !this.camera) return;
        const width = Math.max(1, Math.floor(this.container.clientWidth || 1));
        const height = Math.max(1, Math.floor(this.container.clientHeight || 1));
        if (!Number.isFinite(width / height)) return;
        this.renderer.setSize(width, height, false);
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
        if (this._drag) this.onPointerUp({});
        if (this._frame !== null) {
            cancelAnimationFrame(this._frame);
            this._frame = null;
        }
    }

    unmount() {
        this.stop();
        window.removeEventListener('resize', this.onResize);
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
        if (this.renderer) {
            this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
            this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
            this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
            this.renderer.domElement.removeEventListener('pointercancel', this.onPointerUp);
            this.renderer.domElement.removeEventListener('dblclick', this.onDoubleClick);
            this.renderer.domElement.removeEventListener('keydown', this.onKeyDown);
        }
        for (const entry of this.pieces.values()) {
            this.meshBuilder.dispose(entry.mesh);
        }
        this.pieces.clear();
        this.orbit?.dispose();
        this.renderer?.dispose();
        super.unmount();
    }
}
