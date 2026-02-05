import { OrbitControls, DragControls, TransformControls, THREE } from './three.js';

export class AssemblyInteraction {
    constructor({ camera, renderer, scene, meshes, thickness = 3, target, onSelect }) {
        this.camera = camera;
        this.renderer = renderer;
        this.scene = scene;
        this.meshes = meshes;
        this.thickness = thickness;
        this.target = target;
        this.onSelect = onSelect;
        this.orbitControls = null;
        this.dragControls = null;
        this.transformControls = null;
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
    }

    init() {
        this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
        this.orbitControls.enableDamping = true;
        this.orbitControls.dampingFactor = 0.08;
        this.orbitControls.target.set(0, 0, 0);

        this.dragControls = new DragControls(this.meshes, this.camera, this.renderer.domElement);
        this.dragControls.addEventListener('dragstart', (event) => {
            this.orbitControls.enabled = false;
            this.selectObject(event.object);
        });
        this.dragControls.addEventListener('dragend', () => {
            this.orbitControls.enabled = true;
        });
        this.dragControls.addEventListener('drag', (event) => {
            const obj = event.object;
            const lift = Number.isFinite(obj.userData?.lift)
                ? obj.userData.lift
                : this.thickness / 2;
            obj.position.y = lift;
        });

        // TransformControls - only 3 arrow handles for translation
        this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
        this.transformControls.setMode('translate');
        this.transformControls.setSpace('world');
        this.transformControls.setSize(0.9);
        
        // Show only X, Y, Z axes
        this.transformControls.showX = true;
        this.transformControls.showY = true;
        this.transformControls.showZ = true;
        
        this.transformControls.addEventListener('dragging-changed', (event) => {
            const dragging = event.value;
            this.orbitControls.enabled = !dragging;
            if (this.dragControls) {
                this.dragControls.enabled = !dragging;
            }
        });
        
        this.transformControls.addEventListener('objectChange', () => {
            const obj = this.transformControls.object;
            if (!obj) return;
            obj.userData.lift = obj.position.y;
        });
        
        if (this.scene) {
            this.scene.add(this.transformControls);
        }
        
        this.hideNonArrowHandles();

        this.renderer.domElement.addEventListener('pointerdown', (event) => {
            this.handlePointerDown(event);
        });

        return this;
    }

    update() {
        if (this.orbitControls) {
            this.orbitControls.update();
        }
    }

    handlePointerDown(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hits = this.raycaster.intersectObjects(this.meshes, true);
        if (hits.length > 0) {
            this.selectObject(hits[0].object);
        }
    }

    selectObject(object) {
        if (!object) return;
        let candidate = object;
        while (candidate && !candidate.userData?.isPiece && candidate.parent) {
            candidate = candidate.parent;
        }
        if (candidate?.userData?.isPiece) {
            if (this.transformControls) {
                this.transformControls.attach(candidate);
                this.hideNonArrowHandles();
            }
            if (typeof this.onSelect === 'function') {
                this.onSelect(candidate);
            }
        }
    }

    hideNonArrowHandles() {
        if (!this.transformControls) return;
        
        // Hide plane handles (XY, YZ, XZ squares) - keep only arrow lines
        requestAnimationFrame(() => {
            const controls = this.transformControls;
            const gizmoRoot = controls._gizmo || controls.gizmo;
            if (!gizmoRoot) return;

            const roots = [];
            if (gizmoRoot.gizmo) roots.push(gizmoRoot.gizmo);
            if (gizmoRoot.helper) roots.push(gizmoRoot.helper);
            if (gizmoRoot.picker) roots.push(gizmoRoot.picker);
            roots.push(gizmoRoot);

            // Hide plane handles and other non-arrow elements
            const hideNames = new Set(['XY', 'YZ', 'XZ', 'XYZ', 'XYZE', 'E']);
            roots.forEach((root) => {
                if (!root || typeof root.traverse !== 'function') return;
                root.traverse((obj) => {
                    if (!obj.name) return;
                    if (hideNames.has(obj.name)) {
                        obj.visible = false;
                    }
                });
            });
        });
    }
}
