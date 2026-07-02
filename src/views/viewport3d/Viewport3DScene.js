/**
 * @fileoverview Builds the Three.js scene for the embedded 3D viewport:
 * camera, lights, and a wooden work table. Adapted from the old
 * AssemblySceneBuilder — the only change is that the camera aspect derives
 * from the panel container size (passed in), not window.innerWidth, since
 * the viewport is a sidebar panel, not a full page.
 *
 * @module views/viewport3d/Viewport3DScene
 */
import { THREE } from './three.js';

export class Viewport3DScene {
    /**
     * @param {{width: number, height: number}} size - Container pixel size.
     */
    build({ width, height }) {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xd4e8f2);

        const camera = new THREE.PerspectiveCamera(45, (width / height) || 1, 0.1, 5000);
        camera.position.set(300, 260, 380);
        camera.lookAt(0, 0, 0);

        scene.add(new THREE.AmbientLight(0xffffff, 0.7));

        const directional = new THREE.DirectionalLight(0xffffff, 0.8);
        directional.position.set(200, 300, 200);
        directional.castShadow = true;
        directional.shadow.mapSize.width = 1024;
        directional.shadow.mapSize.height = 1024;
        scene.add(directional);

        const planeSize = 1200;
        const woodTexture = this.createWoodTexture();
        const planeMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, roughness: 0.82, metalness: 0, map: woodTexture || null
        });
        const tableThickness = 40;
        const tableTop = new THREE.Mesh(new THREE.BoxGeometry(planeSize, tableThickness, planeSize), planeMat);
        tableTop.receiveShadow = true;
        tableTop.position.y = -tableThickness / 2;
        scene.add(tableTop);

        const legMaterial = new THREE.MeshStandardMaterial({
            color: 0xb08b67, roughness: 0.9, metalness: 0, map: woodTexture || null
        });
        const legThickness = 40;
        const legHeight = 280;
        const legInset = 90;
        const legGeo = new THREE.BoxGeometry(legThickness, legHeight, legThickness);
        const legY = -(tableThickness + legHeight / 2);
        const legOffset = planeSize / 2 - legInset;
        [
            [legOffset, legY, legOffset],
            [legOffset, legY, -legOffset],
            [-legOffset, legY, legOffset],
            [-legOffset, legY, -legOffset]
        ].forEach(([x, y, z]) => {
            const leg = new THREE.Mesh(legGeo, legMaterial);
            leg.position.set(x, y, z);
            leg.receiveShadow = true;
            scene.add(leg);
        });

        return { scene, camera, plane: tableTop };
    }

    /** Procedural wood grain for the table surface. */
    createWoodTexture() {
        const canvas = document.createElement('canvas');
        const size = 512;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.fillStyle = '#e8dcc8';
        ctx.fillRect(0, 0, size, size);

        ctx.globalAlpha = 0.15;
        for (let i = 0; i < 220; i += 1) {
            const y = Math.random() * size;
            const thickness = 1 + Math.random() * 3;
            const hueShift = Math.random() * 20 - 10;
            ctx.strokeStyle = `hsl(${32 + hueShift}, 25%, ${55 + Math.random() * 12}%)`;
            ctx.lineWidth = thickness;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(size * 0.3, y + Math.random() * 18 - 9, size * 0.6, y + Math.random() * 18 - 9, size, y);
            ctx.stroke();
        }

        ctx.globalAlpha = 0.08;
        for (let i = 0; i < 1800; i += 1) {
            ctx.fillStyle = i % 2 === 0 ? '#d4c4a8' : '#efe5d5';
            ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4, 4);
        texture.needsUpdate = true;
        return texture;
    }
}
