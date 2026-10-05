/**
 * @fileoverview Preview3D — a read-only 3D view of the joined parts folded
 * up by their joints (three.js, loaded on demand so the 2D app never
 * depends on it).
 *
 * Every jointed part is its cut outline extruded by its thickness and
 * placed at its solved pose (views/three/meshSpecs). Parts in a loop of
 * joints that does not close are drawn red, with the reasons listed.
 * Clicking a part selects its shape on the canvas — navigation only.
 *
 * Otto's 3D frames are z-up; three.js is y-up, so the model is turned −90°
 * about x once at the root.
 *
 * @module views/three/Preview3D
 */
import { Component } from '../../ui/Component.js';
import EventBus, { EVENTS } from '../../events/EventBus.js';
import { resolveJoints } from '../../joints/JointService.js';
import { meshSpecs } from './meshSpecs.js';

const WOOD = 0xd8b58a;
const BAD = 0xe0524a;

export class Preview3D extends Component {
    /**
     * @param {HTMLElement} container
     * @param {import('../../core/SceneContext.js').SceneContext} context
     * @param {{onOpenChange?: (open: boolean) => void}} [handlers]
     */
    constructor(container, context, { onOpenChange } = {}) {
        super(container);
        this.context = context;
        this.onOpenChange = onOpenChange;
        this.isOpen = false;
        this.three = null;        // loaded module namespace
        this.view = null;         // {renderer, scene, camera, controls, root}
        this.pendingBuild = false;
        this.fitted = false;
        const rebuild = () => this.scheduleBuild();
        for (const event of [EVENTS.JOINTS_CHANGED, EVENTS.SHAPE_UPDATED, EVENTS.SHAPE_ADDED, EVENTS.SHAPE_REMOVED,
            EVENTS.PARAM_CHANGED, EVENTS.TAB_SWITCHED, EVENTS.SCENE_LOADED]) {
            this.subscribe(event, rebuild);
        }
    }

    render() {
        this.container.innerHTML = '';
        const bar = this.createElement('div', { class: 'preview-3d__bar' });
        bar.appendChild(this.createElement('span', { class: 'preview-3d__title' }, '3D preview'));
        const fit = this.createElement('button', { class: 'preview-3d__btn', type: 'button', title: 'Frame all parts' }, 'Fit');
        fit.addEventListener('click', () => { this.fitted = false; this.build(); });
        const close = this.createElement('button', { class: 'preview-3d__btn', type: 'button', title: 'Close the 3D preview' }, '×');
        close.setAttribute('aria-label', 'Close 3D preview');
        close.addEventListener('click', () => this.toggle(false));
        bar.append(fit, close);
        this.viewport = this.createElement('div', { class: 'preview-3d__viewport' });
        this.message = this.createElement('div', { class: 'preview-3d__message' });
        this.problems = this.createElement('ul', { class: 'preview-3d__problems' });
        this.container.append(bar, this.viewport, this.message, this.problems);
    }

    /** Open / close (toggle when `open` is omitted). */
    async toggle(open = !this.isOpen) {
        this.isOpen = open;
        this.container.classList.toggle('is-hidden', !open);
        this.onOpenChange?.(open);
        if (!open) return;
        if (!this.three) {
            this.message.textContent = 'Loading 3D…';
            try {
                const [three, controls] = await Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')]);
                this.three = { ...three, OrbitControls: controls.OrbitControls };
                this.setupView();
            } catch (error) {
                this.message.textContent = `The 3D view could not load (${error.message}). It needs an internet connection the first time.`;
                return;
            }
        }
        this.fitted = false;
        this.build();
    }

    /** @private */
    setupView() {
        const T = this.three;
        const renderer = new T.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.viewport.appendChild(renderer.domElement);
        const scene = new T.Scene();
        scene.background = new T.Color(0xf4f1ea);
        scene.add(new T.HemisphereLight(0xffffff, 0x8a7a66, 2.2));
        const sun = new T.DirectionalLight(0xffffff, 1.6);
        sun.position.set(1, 2, 1.5);
        scene.add(sun);
        const camera = new T.PerspectiveCamera(40, 1, 1, 100000);
        const controls = new T.OrbitControls(camera, renderer.domElement);
        controls.addEventListener('change', () => this.renderFrame());
        const root = new T.Group();
        root.rotation.x = -Math.PI / 2;   // Otto z-up → three y-up
        scene.add(root);
        this.view = { renderer, scene, camera, controls, root, grid: null };
        new ResizeObserver(() => this.resize()).observe(this.viewport);
        this.resize();
        this.setupPicking();
    }

    /** @private Click (not drag) on a part selects its shape. */
    setupPicking() {
        const { renderer, camera, root } = this.view;
        const T = this.three;
        let down = null;
        renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
        renderer.domElement.addEventListener('pointerup', (e) => {
            if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
            const rect = renderer.domElement.getBoundingClientRect();
            const ndc = new T.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
            const ray = new T.Raycaster();
            ray.setFromCamera(ndc, camera);
            const hit = ray.intersectObjects(root.children, false).find(h => h.object.userData.partId);
            if (!hit) return;
            const id = hit.object.userData.partId;
            const store = this.context.shapeStore;
            store.setSelected(id);
            EventBus.emit(EVENTS.SHAPE_SELECTED, { id, shape: store.get(id), selectedIds: [id] });
        });
    }

    /** @private */
    resize() {
        if (!this.view) return;
        const w = this.viewport.clientWidth || 1, h = this.viewport.clientHeight || 1;
        this.view.renderer.setSize(w, h, false);
        this.view.renderer.domElement.style.width = '100%';
        this.view.renderer.domElement.style.height = '100%';
        this.view.camera.aspect = w / h;
        this.view.camera.updateProjectionMatrix();
        this.renderFrame();
    }

    scheduleBuild() {
        if (!this.isOpen || !this.view || this.pendingBuild) return;
        this.pendingBuild = true;
        requestAnimationFrame(() => {
            this.pendingBuild = false;
            this.build();
        });
    }

    /** Rebuild every mesh from the current scene. */
    build() {
        if (!this.view) return;
        const T = this.three;
        const { root } = this.view;
        for (const child of [...root.children]) {
            child.geometry?.dispose();
            root.remove(child);
        }
        const scene = this.context.scene;
        const specs = scene?.jointStore?.getAll().length ? meshSpecs(resolveJoints(scene)) : { parts: [], problems: [] };
        this.message.textContent = specs.parts.length ? '' : 'Join shapes (code: join finger a.top b.bottom, or the Join tool) to see them folded up here.';
        this.problems.innerHTML = '';
        for (const p of specs.problems) this.problems.appendChild(this.createElement('li', {}, p));

        for (const spec of specs.parts) {
            const shape = new T.Shape(spec.outer.map(p => new T.Vector2(p.x, p.y)));
            shape.holes = spec.holes.map(h => new T.Path(h.map(p => new T.Vector2(p.x, p.y))));
            const geometry = new T.ExtrudeGeometry(shape, { depth: spec.depth, bevelEnabled: false });
            const material = new T.MeshStandardMaterial({ color: spec.status === 'bad' ? BAD : WOOD, roughness: 0.8 });
            const mesh = new T.Mesh(geometry, material);
            mesh.matrixAutoUpdate = false;
            mesh.matrix.fromArray(spec.matrix);
            mesh.userData.partId = spec.partId;
            root.add(mesh);
            const edges = new T.LineSegments(new T.EdgesGeometry(geometry, 20), new T.LineBasicMaterial({ color: 0x5a4632 }));
            edges.matrixAutoUpdate = false;
            edges.matrix.fromArray(spec.matrix);
            root.add(edges);
        }
        if (!this.fitted && specs.parts.length) {
            this.fitCamera();
            this.fitted = true;
        }
        this.renderFrame();
    }

    /** @private Frame everything from a three-quarter view, with a floor grid. */
    fitCamera() {
        const T = this.three;
        const { root, camera, controls, scene } = this.view;
        root.updateMatrixWorld(true);
        const box = new T.Box3().setFromObject(root);
        const size = box.getSize(new T.Vector3());
        const centre = box.getCenter(new T.Vector3());
        const radius = Math.max(size.x, size.y, size.z) || 100;
        camera.position.set(centre.x + radius * 1.8, centre.y + radius * 1.4, centre.z + radius * 2.1);
        camera.near = radius / 100;
        camera.far = radius * 100;
        camera.updateProjectionMatrix();
        controls.target.copy(centre);
        controls.update();
        if (this.view.grid) scene.remove(this.view.grid);
        const grid = new T.GridHelper(Math.ceil(radius * 3 / 100) * 100, 30, 0xb9ad9a, 0xddd5c6);
        grid.position.set(centre.x, box.min.y, centre.z);
        scene.add(grid);
        this.view.grid = grid;
    }

    /** @private */
    renderFrame() {
        if (this.view && this.isOpen) this.view.renderer.render(this.view.scene, this.view.camera);
    }
}
