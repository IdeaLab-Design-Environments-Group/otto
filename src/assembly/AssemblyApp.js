import { THREE } from './three.js';
import { AssemblySceneBuilder } from './AssemblyScene.js';
import { AssemblyDataLoader } from './AssemblyDataLoader.js';
import { AssemblyPieceFactory } from './AssemblyPieceFactory.js';
import { GridLayoutStrategy } from './AssemblyLayout.js';
import { AssemblyInteraction } from './AssemblyInteraction.js';
import { AssemblyJoineryDecorator } from './AssemblyJoinery.js';

export class AssemblyApp {
    constructor({ container, emptyState, backButton, controls, thickness = 3 } = {}) {
        this.container = container;
        this.emptyState = emptyState;
        this.backButton = backButton;
        this.controls = controls;
        this.thickness = thickness;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.pieces = [];
        this.interaction = null;

        this.loader = new AssemblyDataLoader();
        this.layoutStrategy = new GridLayoutStrategy({ gap: 24, maxRowWidth: 700 });
        this.factory = new AssemblyPieceFactory({ thickness: this.thickness });
        this.joinery = new AssemblyJoineryDecorator({ thickness: this.thickness });

        this.animate = this.animate.bind(this);
        this.onResize = this.onResize.bind(this);
        this.onSelect = this.onSelect.bind(this);
    }

    async init() {
        if (!this.container) return;

        this.setupBackButton();

        const builder = new AssemblySceneBuilder({ thickness: this.thickness });
        const built = builder.buildScene();
        this.scene = built.scene;
        this.camera = built.camera;

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        try {
            await this.loadPieces();
        } catch (error) {
            console.error('AssemblyApp: failed to load pieces', error);
            this.setEmptyState(true);
        }
        this.onResize();
        window.addEventListener('resize', this.onResize);

        this.setupControls();

        this.animate();
    }

    setupBackButton() {
        if (!this.backButton) return;
        this.backButton.addEventListener('click', () => {
            window.location.href = './index.html';
        });
    }

    async loadPieces() {
        const sceneState = await this.loader.loadActiveSceneState();
        if (!sceneState) {
            this.setEmptyState(true);
            return;
        }

        const shapeStore = sceneState.shapeStore;
        const shapes = shapeStore.getResolved();
        if (shapes.length === 0) {
            this.setEmptyState(true);
            return;
        }

        const pieces = shapes
            .map(shape => {
                const edges = shapeStore.getEdgesForShape(shape.id);
                const piece = this.factory.createPiece(shape, {
                    edges,
                    joineryProvider: shapeStore
                });
                if (!piece) return null;
                this.joinery.apply(piece.mesh, shape, edges, shapeStore);
                piece.mesh.userData.source = shape;
                return piece;
            })
            .filter(Boolean);

        if (pieces.length === 0) {
            this.setEmptyState(true);
            return;
        }

        this.layoutStrategy.layout(pieces);

        pieces.forEach(piece => {
            piece.mesh.position.x = piece.position.x;
            piece.mesh.position.z = piece.position.z;
            piece.mesh.position.y = this.thickness / 2;
            this.scene.add(piece.mesh);
        });

        this.pieces = pieces;

        this.interaction = new AssemblyInteraction({
            camera: this.camera,
            renderer: this.renderer,
            scene: this.scene,
            meshes: pieces.map(piece => piece.mesh),
            thickness: this.thickness
            , onSelect: this.onSelect
        }).init();

        this.setEmptyState(false);
    }

    setEmptyState(isEmpty) {
        if (!this.emptyState) return;
        this.emptyState.classList.toggle('is-hidden', !isEmpty);
    }

    setupControls() {
        if (!this.controls) return;
        this.selectedNameEl = this.controls.selectedName;
    }

    onSelect(mesh) {
        if (this.selectedNameEl) {
            this.selectedNameEl.textContent = mesh?.userData?.id || 'None';
        }
    }

    onResize() {
        if (!this.renderer || !this.camera) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    animate() {
        requestAnimationFrame(this.animate);
        if (this.interaction) {
            this.interaction.update();
        }
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
}
