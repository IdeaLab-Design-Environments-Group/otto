import { THREE } from './three.js';

const WOOD_COLOR = 0xd9b98c;

export class AssemblyPieceFactory {
    constructor({ thickness = 3 } = {}) {
        this.thickness = thickness;
        this.colorIndex = 0;
    }

    createPiece(shape, options = {}) {
        if (!shape) return null;

        const { geometry, width, height } = this.buildGeometry(shape, options);
        if (!geometry) return null;

        const material = new THREE.MeshStandardMaterial({
            color: WOOD_COLOR,
            roughness: 0.6,
            metalness: 0.1
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = {
            id: shape.id,
            type: shape.type,
            width,
            height,
            isPiece: true,
            lift: this.thickness / 2
        };

        mesh.position.y = this.thickness / 2;

        this.addOutline(mesh, geometry);

        return {
            mesh,
            width,
            height
        };
    }

    buildGeometry(shape, options = {}) {
        const thickness = this.thickness;
        let shape2d = null;
        let width = 40;
        let height = 40;
        let skipFemaleHoles = false;

        if (shape.type === 'rectangle') {
            width = shape.width;
            height = shape.height;
            const joineryBySide = this.getRectangleJoinery(shape, options);
            if (joineryBySide) {
                shape2d = this.rectShapeWithJoinery(width, height, shape, joineryBySide);
                skipFemaleHoles = true;
            } else {
                shape2d = this.rectShape(width, height);
            }
        } else if (shape.type === 'circle') {
            const radius = shape.radius;
            width = radius * 2;
            height = radius * 2;
            shape2d = new THREE.Shape();
            shape2d.absarc(0, 0, radius, 0, Math.PI * 2, false);
        } else if (shape.type === 'polygon') {
            const radius = shape.radius;
            const sides = Math.max(3, Math.floor(shape.sides || 3));
            width = radius * 2;
            height = radius * 2;
            shape2d = this.polygonShape(radius, sides);
        } else if (shape.type === 'triangle') {
            // Triangle shape: uses base and height properties
            const base = shape.base || 30;
            const triangleHeight = shape.height || 40;
            width = base;
            height = triangleHeight;
            shape2d = this.triangleShape(base, triangleHeight);
        } else if (shape.type === 'star') {
            const outer = shape.outerRadius;
            const inner = shape.innerRadius;
            const points = Math.max(3, Math.floor(shape.points || 5));
            width = outer * 2;
            height = outer * 2;
            shape2d = this.starShape(outer, inner, points);
        } else if (shape.type === 'line') {
            const dx = shape.x2 - shape.x1;
            const dy = shape.y2 - shape.y1;
            const length = Math.max(1, Math.hypot(dx, dy));
            width = length;
            height = Math.max(2, thickness / 2);
            shape2d = this.rectShape(width, height);
        } else if (shape.type === 'path' && Array.isArray(shape.points) && shape.points.length > 2 && shape.closed) {
            const bounds = this.pointsBounds(shape.points);
            width = bounds.width;
            height = bounds.height;
            shape2d = this.pointsShape(shape.points, bounds.center);
        } else if (shape.type === 'path' && Array.isArray(shape.points) && shape.points.length > 1) {
            const bounds = this.pointsBounds(shape.points);
            width = bounds.width;
            height = bounds.height;
            shape2d = this.rectShape(width, height);
        } else if (shape.type === 'ellipse') {
            // Ellipse: use radiusX and radiusY
            const radiusX = shape.radiusX || 30;
            const radiusY = shape.radiusY || 20;
            width = radiusX * 2;
            height = radiusY * 2;
            shape2d = this.ellipseShape(radiusX, radiusY);
        } else if (shape.type === 'donut') {
            // Donut (annulus): outer and inner radius
            const outerRadius = shape.outerRadius || 25;
            const innerRadius = shape.innerRadius || 12.5;
            width = outerRadius * 2;
            height = outerRadius * 2;
            shape2d = this.donutShape(outerRadius, innerRadius);
        } else if (shape.type === 'roundedRectangle' || shape.type === 'roundedrectangle') {
            // Rounded rectangle: width, height, cornerRadius
            width = shape.width || 50;
            height = shape.height || 50;
            const cornerRadius = shape.cornerRadius || 5;
            shape2d = this.roundedRectShape(width, height, cornerRadius);
        } else if (shape.type === 'chamferRectangle' || shape.type === 'chamferrectangle') {
            // Chamfer rectangle: width, height, chamfer
            width = shape.width || 50;
            height = shape.height || 50;
            const chamfer = shape.chamfer || 5;
            shape2d = this.chamferRectShape(width, height, chamfer);
        } else if (shape.type === 'arc') {
            // Arc: radius, startAngle, endAngle (convert to closed pie slice for 3D)
            const radius = shape.radius || 25;
            const startAngle = (shape.startAngle || 0) * Math.PI / 180;
            const endAngle = (shape.endAngle || 90) * Math.PI / 180;
            width = radius * 2;
            height = radius * 2;
            shape2d = this.arcShape(radius, startAngle, endAngle);
        } else if (shape.type === 'cross') {
            // Cross: width and thickness
            const crossWidth = shape.width || 50;
            const thickness = shape.thickness || 10;
            width = crossWidth;
            height = crossWidth;
            shape2d = this.crossShape(crossWidth, thickness);
        } else if (shape.type === 'slot') {
            // Slot (stadium/obround): length and width
            const length = shape.length || 50;
            const slotWidth = shape.slotWidth || shape.width || 15;
            width = length;
            height = slotWidth;
            shape2d = this.slotShape(length, slotWidth);
        } else if (shape.type === 'arrow') {
            // Arrow: length, headWidth, headLength
            const length = shape.length || 50;
            const headWidth = shape.headWidth || 15;
            const headLength = shape.headLength || 12.5;
            width = length;
            height = Math.max(headWidth, 5);
            shape2d = this.arrowShape(length, headWidth, headLength);
        } else if (shape.type === 'gear' || shape.type === 'spiral' || shape.type === 'wave') {
            // Complex shapes: use toGeometryPath if available, otherwise fallback to bounds
            if (typeof shape.toGeometryPath === 'function') {
                try {
                    const path = shape.toGeometryPath();
                    // Path has anchors, each with a position property
                    if (path && path.anchors && path.anchors.length > 0) {
                        const points = path.anchors.map(anchor => ({
                            x: anchor.position ? anchor.position.x : anchor.x || 0,
                            y: anchor.position ? anchor.position.y : anchor.y || 0
                        }));
                        const bounds = this.pointsBounds(points);
                        width = bounds.width;
                        height = bounds.height;
                        shape2d = this.pointsShape(points, bounds.center);
                    } else {
                        // Fallback to bounds-based rectangle
                        const bounds = shape.getBounds ? shape.getBounds() : { width: 40, height: 40 };
                        width = bounds.width || 40;
                        height = bounds.height || 40;
                        shape2d = this.rectShape(width, height);
                    }
                } catch (e) {
                    console.warn('Failed to convert shape to geometry path:', e);
                    const bounds = shape.getBounds ? shape.getBounds() : { width: 40, height: 40 };
                    width = bounds.width || 40;
                    height = bounds.height || 40;
                    shape2d = this.rectShape(width, height);
                }
            } else {
                // Fallback to bounds-based rectangle
                const bounds = shape.getBounds ? shape.getBounds() : { width: 40, height: 40 };
                width = bounds.width || 40;
                height = bounds.height || 40;
                shape2d = this.rectShape(width, height);
            }
        } else {
            // Unknown shape type: try to use toGeometryPath if available
            if (typeof shape.toGeometryPath === 'function') {
                try {
                    const path = shape.toGeometryPath();
                    // Path has anchors, each with a position property
                    if (path && path.anchors && path.anchors.length > 0) {
                        const points = path.anchors.map(anchor => ({
                            x: anchor.position ? anchor.position.x : anchor.x || 0,
                            y: anchor.position ? anchor.position.y : anchor.y || 0
                        }));
                        const bounds = this.pointsBounds(points);
                        width = bounds.width;
                        height = bounds.height;
                        shape2d = this.pointsShape(points, bounds.center);
                    } else {
                        shape2d = this.rectShape(width, height);
                    }
                } catch (e) {
                    console.warn(`Unknown shape type "${shape.type}", using default rectangle`);
                    shape2d = this.rectShape(width, height);
                }
            } else {
                console.warn(`Unknown shape type "${shape.type}", using default rectangle`);
                shape2d = this.rectShape(width, height);
            }
        }

        if (!shape2d) return { geometry: null, width, height };

        if (!skipFemaleHoles) {
            this.addFemaleJoineryHoles(shape2d, shape, options);
        }

        const geometry = new THREE.ExtrudeGeometry(shape2d, {
            depth: thickness,
            bevelEnabled: false
        });
        geometry.rotateX(-Math.PI / 2);

        return { geometry, width, height };
    }

    rectShape(width, height) {
        const hw = width / 2;
        const hh = height / 2;
        const shape = new THREE.Shape();
        shape.moveTo(-hw, -hh);
        shape.lineTo(hw, -hh);
        shape.lineTo(hw, hh);
        shape.lineTo(-hw, hh);
        shape.closePath();
        return shape;
    }

    polygonShape(radius, sides) {
        const shape = new THREE.Shape();
        const angleStep = (Math.PI * 2) / sides;
        for (let i = 0; i < sides; i += 1) {
            const angle = -Math.PI / 2 + i * angleStep;
            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);
            if (i === 0) {
                shape.moveTo(x, y);
            } else {
                shape.lineTo(x, y);
            }
        }
        shape.closePath();
        return shape;
    }

    triangleShape(base, height) {
        // Triangle with base at top, point at bottom
        // Points: top-left, top-right, bottom-center
        const hb = base / 2; // half base
        const hh = height / 2; // half height
        const shape = new THREE.Shape();
        shape.moveTo(-hb, -hh); // Top-left
        shape.lineTo(hb, -hh);  // Top-right
        shape.lineTo(0, hh);     // Bottom-center
        shape.closePath();
        return shape;
    }

    ellipseShape(radiusX, radiusY) {
        // Ellipse: create using bezier curves for smooth shape
        const shape = new THREE.Shape();
        const segments = 32;
        const angleStep = (Math.PI * 2) / segments;
        for (let i = 0; i < segments; i += 1) {
            const angle = -Math.PI / 2 + i * angleStep;
            const x = radiusX * Math.cos(angle);
            const y = radiusY * Math.sin(angle);
            if (i === 0) {
                shape.moveTo(x, y);
            } else {
                shape.lineTo(x, y);
            }
        }
        shape.closePath();
        return shape;
    }

    donutShape(outerRadius, innerRadius) {
        // Donut (annulus): outer circle with inner hole
        const shape = new THREE.Shape();
        // Outer circle
        shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
        // Inner hole (counter-clockwise for hole)
        const hole = new THREE.Path();
        hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
        shape.holes.push(hole);
        return shape;
    }

    roundedRectShape(width, height, cornerRadius) {
        // Rounded rectangle with specified corner radius
        const hw = width / 2;
        const hh = height / 2;
        const r = Math.min(cornerRadius, hw, hh);
        const shape = new THREE.Shape();
        
        // Start from top-left (after corner)
        shape.moveTo(-hw + r, -hh);
        // Top edge
        shape.lineTo(hw - r, -hh);
        // Top-right corner
        shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
        // Right edge
        shape.lineTo(hw, hh - r);
        // Bottom-right corner
        shape.quadraticCurveTo(hw, hh, hw - r, hh);
        // Bottom edge
        shape.lineTo(-hw + r, hh);
        // Bottom-left corner
        shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
        // Left edge
        shape.lineTo(-hw, -hh + r);
        // Top-left corner
        shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
        shape.closePath();
        return shape;
    }

    chamferRectShape(width, height, chamfer) {
        // Chamfer rectangle: cut corners at 45 degrees
        const hw = width / 2;
        const hh = height / 2;
        const c = Math.min(chamfer, hw, hh);
        const shape = new THREE.Shape();
        
        // Top-left (after chamfer)
        shape.moveTo(-hw + c, -hh);
        // Top edge
        shape.lineTo(hw - c, -hh);
        // Top-right chamfer
        shape.lineTo(hw, -hh + c);
        // Right edge
        shape.lineTo(hw, hh - c);
        // Bottom-right chamfer
        shape.lineTo(hw - c, hh);
        // Bottom edge
        shape.lineTo(-hw + c, hh);
        // Bottom-left chamfer
        shape.lineTo(-hw, hh - c);
        // Left edge
        shape.lineTo(-hw, -hh + c);
        // Top-left chamfer
        shape.lineTo(-hw + c, -hh);
        shape.closePath();
        return shape;
    }

    arcShape(radius, startAngle, endAngle) {
        // Arc: convert to closed pie slice for 3D extrusion
        const shape = new THREE.Shape();
        // Start at center
        shape.moveTo(0, 0);
        // Arc from start to end
        const segments = 32;
        const angleSpan = endAngle - startAngle;
        for (let i = 0; i <= segments; i += 1) {
            const angle = startAngle + (i / segments) * angleSpan;
            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);
            shape.lineTo(x, y);
        }
        // Close back to center
        shape.lineTo(0, 0);
        shape.closePath();
        return shape;
    }

    crossShape(width, thickness) {
        // Cross: horizontal and vertical bars intersecting
        // Create as a single outline path
        const hw = width / 2;
        const ht = thickness / 2;
        const shape = new THREE.Shape();
        
        // Start at top-left of vertical bar
        shape.moveTo(-ht, -hw);
        // Top of vertical bar
        shape.lineTo(ht, -hw);
        // Right side of horizontal bar (top)
        shape.lineTo(ht, -ht);
        shape.lineTo(hw, -ht);
        // Right side of horizontal bar (bottom)
        shape.lineTo(hw, ht);
        shape.lineTo(ht, ht);
        // Bottom of vertical bar
        shape.lineTo(ht, hw);
        shape.lineTo(-ht, hw);
        // Left side of horizontal bar (bottom)
        shape.lineTo(-ht, ht);
        shape.lineTo(-hw, ht);
        // Left side of horizontal bar (top)
        shape.lineTo(-hw, -ht);
        shape.lineTo(-ht, -ht);
        shape.closePath();
        return shape;
    }

    slotShape(length, width) {
        // Slot (stadium/obround): rectangle with semicircular ends
        const hw = width / 2;
        const hl = length / 2;
        const shape = new THREE.Shape();
        
        // Start at left end (top of left semicircle)
        shape.moveTo(-hl, -hw);
        // Top edge
        shape.lineTo(hl, -hw);
        // Right semicircle (top half)
        shape.absarc(hl, 0, hw, -Math.PI / 2, Math.PI / 2, false);
        // Bottom edge
        shape.lineTo(-hl, hw);
        // Left semicircle (bottom half, reversed)
        shape.absarc(-hl, 0, hw, Math.PI / 2, -Math.PI / 2, true);
        shape.closePath();
        return shape;
    }

    arrowShape(length, headWidth, headLength) {
        // Arrow: shaft with triangular head
        const hw = headWidth / 2;
        const shaftLength = length - headLength;
        const shape = new THREE.Shape();
        
        // Start at tip (point)
        shape.moveTo(length / 2, 0);
        // Top of arrowhead
        shape.lineTo(shaftLength / 2, -hw);
        // Top of shaft
        shape.lineTo(-length / 2, -hw);
        // Bottom of shaft
        shape.lineTo(-length / 2, hw);
        // Bottom of arrowhead
        shape.lineTo(shaftLength / 2, hw);
        // Back to tip
        shape.lineTo(length / 2, 0);
        shape.closePath();
        return shape;
    }

    starShape(outer, inner, points) {
        const shape = new THREE.Shape();
        const angleStep = Math.PI / points;
        for (let i = 0; i < points * 2; i += 1) {
            const angle = -Math.PI / 2 + i * angleStep;
            const radius = i % 2 === 0 ? outer : inner;
            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);
            if (i === 0) {
                shape.moveTo(x, y);
            } else {
                shape.lineTo(x, y);
            }
        }
        shape.closePath();
        return shape;
    }

    pointsShape(points, center) {
        const shape = new THREE.Shape();
        points.forEach((pt, index) => {
            const x = pt.x - center.x;
            const y = pt.y - center.y;
            if (index === 0) {
                shape.moveTo(x, y);
            } else {
                shape.lineTo(x, y);
            }
        });
        shape.closePath();
        return shape;
    }

    pointsBounds(points) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        points.forEach(pt => {
            minX = Math.min(minX, pt.x);
            maxX = Math.max(maxX, pt.x);
            minY = Math.min(minY, pt.y);
            maxY = Math.max(maxY, pt.y);
        });
        const width = Math.max(1, maxX - minX);
        const height = Math.max(1, maxY - minY);
        return {
            width,
            height,
            center: {
                x: (minX + maxX) / 2,
                y: (minY + maxY) / 2
            }
        };
    }

    addFemaleJoineryHoles(shape2d, shape, options) {
        const edges = options.edges || [];
        if (!shape2d || edges.length === 0) return;

        if (!this.isClosedShape(shape)) return;

        const joineryProvider = options.joineryProvider;
        const getJoinery = typeof joineryProvider === 'function'
            ? joineryProvider
            : joineryProvider?.getEdgeJoinery?.bind(joineryProvider);
        if (!getJoinery) return;

        if (typeof shape.getBounds !== 'function') return;
        const bounds = shape.getBounds();
        if (!bounds) return;

        const center = {
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height / 2
        };

        edges.forEach(edge => {
            const joinery = getJoinery(edge);
            if (!joinery || joinery.type !== 'finger_female') return;
            if (!edge.isLinear || !edge.isLinear()) return;
            this.addFemaleHolesForEdge(shape2d, edge, joinery, center);
        });
    }

    getRectangleJoinery(shape, options) {
        const edges = options.edges || [];
        if (!edges.length) return null;
        const joineryProvider = options.joineryProvider;
        const getJoinery = typeof joineryProvider === 'function'
            ? joineryProvider
            : joineryProvider?.getEdgeJoinery?.bind(joineryProvider);
        if (!getJoinery) return null;

        const joineryBySide = {};
        const eps = 0.01;
        const left = shape.x;
        const right = shape.x + shape.width;
        const top = shape.y;
        const bottom = shape.y + shape.height;

        edges.forEach(edge => {
            const joinery = getJoinery(edge);
            if (!joinery || joinery.type !== 'finger_female') return;
            const p1 = edge.anchor1?.position;
            const p2 = edge.anchor2?.position;
            if (!p1 || !p2) return;
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            if (Math.abs(midY - top) < eps) {
                joineryBySide.top = joinery;
            } else if (Math.abs(midX - right) < eps) {
                joineryBySide.right = joinery;
            } else if (Math.abs(midY - bottom) < eps) {
                joineryBySide.bottom = joinery;
            } else if (Math.abs(midX - left) < eps) {
                joineryBySide.left = joinery;
            }
        });

        return Object.keys(joineryBySide).length > 0 ? joineryBySide : null;
    }

    rectShapeWithJoinery(width, height, shape, joineryBySide) {
        const hw = width / 2;
        const hh = height / 2;
        const shape2d = new THREE.Shape();

        const topLeft = { x: -hw, y: -hh };
        const topRight = { x: hw, y: -hh };
        const bottomRight = { x: hw, y: hh };
        const bottomLeft = { x: -hw, y: hh };

        const center = { x: 0, y: 0 };
        shape2d.moveTo(topLeft.x, topLeft.y);

        this.appendEdgeWithNotches(shape2d, topLeft, topRight, this.inwardForEdge(topLeft, topRight, center), joineryBySide.top);
        this.appendEdgeWithNotches(shape2d, topRight, bottomRight, this.inwardForEdge(topRight, bottomRight, center), joineryBySide.right);
        this.appendEdgeWithNotches(shape2d, bottomRight, bottomLeft, this.inwardForEdge(bottomRight, bottomLeft, center), joineryBySide.bottom);
        this.appendEdgeWithNotches(shape2d, bottomLeft, topLeft, this.inwardForEdge(bottomLeft, topLeft, center), joineryBySide.left);

        shape2d.closePath();
        return shape2d;
    }

    appendEdgeWithNotches(shape2d, start, end, inward, joinery) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        if (length < 0.001) {
            shape2d.lineTo(end.x, end.y);
            return;
        }
        const ux = dx / length;
        const uy = dy / length;

        if (!joinery) {
            shape2d.lineTo(end.x, end.y);
            return;
        }

        const thicknessMm = Number(joinery.thicknessMm);
        const depth = Math.min(Math.max(thicknessMm || 0, 0.5), length * 0.45);
        const requestedCount = Number(joinery.fingerCount);
        const count = Number.isFinite(requestedCount) && requestedCount >= 2
            ? Math.floor(requestedCount)
            : Math.max(2, Math.floor(length / Math.max(depth * 2, 4)));

        let step = length / count;
        let edgeInset = step * 0.5;
        let usableLength = length - edgeInset * 2;
        if (usableLength <= 0) {
            edgeInset = 0;
            usableLength = length;
        }
        step = usableLength / count;

        if (edgeInset > 0) {
            shape2d.lineTo(start.x + ux * edgeInset, start.y + uy * edgeInset);
        }

        for (let i = 0; i < count; i += 1) {
            const segStartDist = edgeInset + step * i;
            const segEndDist = edgeInset + step * (i + 1);
            const segStart = {
                x: start.x + ux * segStartDist,
                y: start.y + uy * segStartDist
            };
            const segEnd = {
                x: start.x + ux * segEndDist,
                y: start.y + uy * segEndDist
            };

            if (i % 2 === 0) {
                shape2d.lineTo(segStart.x, segStart.y);
                shape2d.lineTo(segStart.x + inward.x * depth, segStart.y + inward.y * depth);
                shape2d.lineTo(segEnd.x + inward.x * depth, segEnd.y + inward.y * depth);
                shape2d.lineTo(segEnd.x, segEnd.y);
            } else {
                shape2d.lineTo(segEnd.x, segEnd.y);
            }
        }

        shape2d.lineTo(end.x, end.y);
    }

    inwardForEdge(start, end, center) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy) || 1;
        let nx = -dy / length;
        let ny = dx / length;
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        const dot = nx * (midX - center.x) + ny * (midY - center.y);
        if (dot > 0) {
            nx = -nx;
            ny = -ny;
        }
        return { x: nx, y: ny };
    }

    addOutline(mesh, geometry) {
        const edges = new THREE.EdgesGeometry(geometry, 1);
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x8a6a44,
            linewidth: 1
        });
        const outline = new THREE.LineSegments(edges, lineMaterial);
        outline.renderOrder = 2;
        outline.userData.isOutline = true;
        mesh.add(outline);
    }

    addFemaleHolesForEdge(shape2d, edge, joinery, center) {
        const p1 = edge.anchor1?.position;
        const p2 = edge.anchor2?.position;
        if (!p1 || !p2) return;

        const x1 = p1.x - center.x;
        const y1 = p1.y - center.y;
        const x2 = p2.x - center.x;
        const y2 = p2.y - center.y;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.hypot(dx, dy);
        if (length < 0.001) return;

        const ux = dx / length;
        const uy = dy / length;

        let nx = -uy;
        let ny = ux;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        if (midX * nx + midY * ny < 0) {
            nx = -nx;
            ny = -ny;
        }
        const inwardX = -nx;
        const inwardY = -ny;

        const thicknessMm = Number(joinery.thicknessMm);
        const depth = Math.min(Math.max(thicknessMm || 0, 0.5), length * 0.45);
        const requestedCount = Number(joinery.fingerCount);
        const count = Number.isFinite(requestedCount) && requestedCount >= 2
            ? Math.floor(requestedCount)
            : Math.max(2, Math.floor(length / Math.max(depth * 2, 4)));

        const toothWidth = length / count;
        const halfDepth = depth / 2;
        const halfWidth = toothWidth / 2;

        for (let i = 0; i < count; i += 2) {
            const midDist = (i + 0.5) * toothWidth;
            const baseX = x1 + ux * midDist;
            const baseY = y1 + uy * midDist;
            const centerX = baseX + inwardX * halfDepth;
            const centerY = baseY + inwardY * halfDepth;

            const alongX = ux * halfWidth;
            const alongY = uy * halfWidth;
            const normX = inwardX * halfDepth;
            const normY = inwardY * halfDepth;

            const pA = { x: centerX - alongX - normX, y: centerY - alongY - normY };
            const pB = { x: centerX + alongX - normX, y: centerY + alongY - normY };
            const pC = { x: centerX + alongX + normX, y: centerY + alongY + normY };
            const pD = { x: centerX - alongX + normX, y: centerY - alongY + normY };

            const hole = new THREE.Path();
            hole.moveTo(pA.x, pA.y);
            hole.lineTo(pB.x, pB.y);
            hole.lineTo(pC.x, pC.y);
            hole.lineTo(pD.x, pD.y);
            hole.closePath();
            shape2d.holes.push(hole);
        }
    }

    isClosedShape(shape) {
        if (!shape) return false;
        if (shape.type === 'circle' || shape.type === 'rectangle' || shape.type === 'polygon' || shape.type === 'star') return true;
        if (shape.type === 'path') return Boolean(shape.closed);
        return false;
    }
}
