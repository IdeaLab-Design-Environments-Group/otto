/**
 * Lightweight CAD-style scene used by the embedded 3D viewport.
 *
 * The previous scene built a textured table and four legs. Besides adding
 * geometry and a non-deterministic canvas texture, that made the origin hard
 * to read. A neutral ground plane and grid provide the same spatial context
 * with fewer moving parts and behave much more like a modelling application.
 *
 * @module views/viewport3d/Viewport3DScene
 */
import { THREE } from './three.js';

export class Viewport3DScene {
    build({ width, height }) {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xe9eef3);

        const aspect = Number.isFinite(width / height) && height > 0 ? width / height : 1;
        const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 10000);
        camera.position.set(360, 300, 420);
        camera.lookAt(0, 0, 0);

        scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa7b3, 1.25));

        const key = new THREE.DirectionalLight(0xffffff, 1.35);
        key.position.set(-300, 650, 400);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.camera.left = -800;
        key.shadow.camera.right = 800;
        key.shadow.camera.top = 800;
        key.shadow.camera.bottom = -800;
        scene.add(key);

        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(4000, 4000),
            new THREE.MeshStandardMaterial({ color: 0xf5f7f9, roughness: 1, metalness: 0 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.6;
        ground.receiveShadow = true;
        ground.userData.viewportGround = true;
        scene.add(ground);

        const grid = new THREE.GridHelper(2000, 100, 0x718096, 0xcbd5df);
        grid.position.y = -0.25;
        grid.material.transparent = true;
        grid.material.opacity = 0.62;
        scene.add(grid);

        const axes = new THREE.AxesHelper(70);
        axes.position.y = 0.1;
        scene.add(axes);

        return { scene, camera, ground };
    }
}
