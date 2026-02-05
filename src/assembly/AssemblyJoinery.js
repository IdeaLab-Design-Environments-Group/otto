import { THREE } from './three.js';

const COLOR_FINGER_JOINT = 0xd9b98c;
const COLOR_DOVETAIL = 0xd9b98c;

export class AssemblyJoineryDecorator {
    constructor({ thickness = 3 } = {}) {
        this.thickness = thickness;
        this.materials = {
            finger_joint: new THREE.MeshStandardMaterial({
                color: COLOR_FINGER_JOINT,
                roughness: 0.5,
                metalness: 0.1,
                transparent: false
            }),
            dovetail: new THREE.MeshStandardMaterial({
                color: COLOR_DOVETAIL,
                roughness: 0.5,
                metalness: 0.1,
                transparent: false
            })
        };
    }

    apply(mesh, shape, edges, shapeStore) {
        if (!mesh || !shape || !edges || edges.length === 0 || !shapeStore) return;

        const bounds = this.getBounds(shape);
        if (!bounds) return;

        const center = {
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height / 2
        };

        const group = new THREE.Group();
        group.name = 'joinery-preview';

        edges.forEach(edge => {
            const joinery = shapeStore.getEdgeJoinery(edge);
            if (!joinery) return;
            if (!edge.isLinear || !edge.isLinear()) return;
            const joineryType = String(joinery.type || '').toLowerCase();
            const isFingerJoint = joineryType === 'finger_joint' || joineryType === 'male' || joineryType === 'finger_male';
            const isDovetail = joineryType === 'dovetail';
            if (!isFingerJoint && !isDovetail) return;
            if (isFingerJoint) {
                this.addFingerJoinery(group, edge, joinery, center);
            } else {
                this.addDovetailJoinery(group, edge, joinery, center);
            }
        });

        if (group.children.length > 0) {
            mesh.add(group);
        }
    }

    addFingerJoinery(group, edge, joinery, center) {
        const p1 = edge.anchor1?.position;
        const p2 = edge.anchor2?.position;
        if (!p1 || !p2) return;

        const x1 = p1.x - center.x;
        const z1 = p1.y - center.y;
        const x2 = p2.x - center.x;
        const z2 = p2.y - center.y;

        const dx = x2 - x1;
        const dz = z2 - z1;
        const length = Math.hypot(dx, dz);
        if (length < 0.001) return;

        const ux = dx / length;
        const uz = dz / length;

        const midX = (x1 + x2) / 2;
        const midZ = (z1 + z2) / 2;
        const toMidX = midX;
        const toMidZ = midZ;

        const normalA = { x: -uz, z: ux };
        const normalB = { x: uz, z: -ux };
        const dotA = normalA.x * toMidX + normalA.z * toMidZ;
        const outward = dotA >= 0 ? normalA : normalB;
        const direction = outward;

        const thicknessMm = Number(joinery.thicknessMm);
        const depth = Math.min(Math.max(thicknessMm || 0, 0.5), length * 0.45);
        const requestedCount = Number(joinery.fingerCount);
        const count = Number.isFinite(requestedCount) && requestedCount >= 2
            ? Math.floor(requestedCount)
            : Math.max(2, Math.floor(length / Math.max(depth * 2, 4)));

        const toothWidth = length / count;
        const material = this.materials.finger_joint;
        const angle = Math.atan2(uz, ux);
        const height = this.thickness * 0.9;

        // Alignment: left = first tooth at start, right = first tooth at end
        const align = joinery.align || 'left';
        // For right alignment, we start at index 1 instead of 0
        const startIndex = align === 'right' ? 1 : 0;

        for (let i = startIndex; i < count; i += 2) {
            const midDist = (i + 0.5) * toothWidth;
            const baseX = x1 + ux * midDist;
            const baseZ = z1 + uz * midDist;
            const clearance = Math.max(0.05, depth * 0.02);
            const offsetX = direction.x * (depth / 2 + clearance);
            const offsetZ = direction.z * (depth / 2 + clearance);

            const tooth = new THREE.Mesh(
                new THREE.BoxGeometry(toothWidth, height, depth),
                material
            );
            tooth.position.set(
                baseX + offsetX,
                height / 2,
                baseZ + offsetZ
            );
            tooth.rotation.y = angle;
            tooth.castShadow = false;
            tooth.receiveShadow = true;
            tooth.userData.isJoinery = true;
            group.add(tooth);
        }
    }

    addDovetailJoinery(group, edge, joinery, center) {
        const p1 = edge.anchor1?.position;
        const p2 = edge.anchor2?.position;
        if (!p1 || !p2) return;

        const x1 = p1.x - center.x;
        const z1 = p1.y - center.y;
        const x2 = p2.x - center.x;
        const z2 = p2.y - center.y;

        const dx = x2 - x1;
        const dz = z2 - z1;
        const length = Math.hypot(dx, dz);
        if (length < 0.001) return;

        const ux = dx / length;
        const uz = dz / length;

        const midX = (x1 + x2) / 2;
        const midZ = (z1 + z2) / 2;
        const toMidX = midX;
        const toMidZ = midZ;

        const normalA = { x: -uz, z: ux };
        const normalB = { x: uz, z: -ux };
        const dotA = normalA.x * toMidX + normalA.z * toMidZ;
        const outward = dotA >= 0 ? normalA : normalB;
        const direction = outward;

        const thicknessMm = Number(joinery.thicknessMm);
        const baseDepth = Math.min(Math.max(thicknessMm || 0, 0.5), length * 0.45);
        const depth = Math.min(baseDepth * 1.6, length * 0.6);
        const requestedCount = Number(joinery.fingerCount);
        const count = Number.isFinite(requestedCount) && requestedCount >= 2
            ? Math.floor(requestedCount)
            : Math.max(2, Math.floor(length / Math.max(depth * 2, 4)));

        const toothWidth = length / count;
        const taper = Math.min(depth * 0.2, toothWidth * 0.2);
        const material = this.materials.dovetail;
        const angle = Math.atan2(uz, ux);
        const height = this.thickness * 0.9;

        // Alignment: left = first tooth at start, right = first tooth at end
        const align = joinery.align || 'left';
        const startIndex = align === 'right' ? 1 : 0;

        for (let i = startIndex; i < count; i += 2) {
            const midDist = (i + 0.5) * toothWidth;
            const baseX = x1 + ux * midDist;
            const baseZ = z1 + uz * midDist;
            const clearance = Math.max(0.05, depth * 0.02);
            const offsetX = direction.x * (depth / 2 + clearance);
            const offsetZ = direction.z * (depth / 2 + clearance);

            const geometry = this.createDovetailGeometry(toothWidth, depth, height, taper);
            const tooth = new THREE.Mesh(geometry, material);

            const localZ = { x: -Math.sin(angle), z: Math.cos(angle) };
            const dot = localZ.x * direction.x + localZ.z * direction.z;
            const finalAngle = dot < 0 ? angle + Math.PI : angle;

            tooth.position.set(
                baseX + offsetX,
                height / 2,
                baseZ + offsetZ
            );
            tooth.rotation.y = finalAngle;
            tooth.castShadow = false;
            tooth.receiveShadow = true;
            tooth.userData.isJoinery = true;
            group.add(tooth);
        }
    }

    createDovetailGeometry(width, depth, height, taper) {
        const hw = width / 2;
        const shape2d = new THREE.Shape();
        shape2d.moveTo(-hw, 0);
        shape2d.lineTo(hw, 0);
        shape2d.lineTo(hw + taper, depth);
        shape2d.lineTo(-hw - taper, depth);
        shape2d.closePath();

        const geometry = new THREE.ExtrudeGeometry(shape2d, {
            depth: height,
            bevelEnabled: false
        });
        geometry.rotateX(Math.PI / 2);
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        if (box) {
            const cx = (box.min.x + box.max.x) / 2;
            const cy = (box.min.y + box.max.y) / 2;
            const cz = (box.min.z + box.max.z) / 2;
            geometry.translate(-cx, -cy, -cz);
        }
        return geometry;
    }

    getBounds(shape) {
        if (shape && typeof shape.getBounds === 'function') {
            return shape.getBounds();
        }
        return null;
    }
}
