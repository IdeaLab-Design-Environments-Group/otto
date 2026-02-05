import { THREE } from './three.js';

const WOOD_COLOR = 0xd9b98c;

export class AssemblyPieceFactory {
    constructor({ thickness = 3 } = {}) {
        this.thickness = thickness;
        this.colorIndex = 0;
    }

    /**
     * Universal converter: converts any shape's geometry path to a THREE.js Shape.
     * This ensures perfect transfer from 2D SVG definitions to 3D extrusions.
     * 
     * @param {Object} shape - The shape object (must have toGeometryPath() method)
     * @param {Object} options - Options for conversion
     * @returns {{shape2d: THREE.Shape, width: number, height: number, center: {x: number, y: number}}}
     */
    shapeToThreeShape(shape, options = {}) {
        // Get the geometry path from the shape
        if (typeof shape.toGeometryPath !== 'function') {
            console.warn(`Shape ${shape.type || 'unknown'} does not have toGeometryPath() method`);
            return { shape2d: this.rectShape(40, 40), width: 40, height: 40, center: { x: 0, y: 0 } };
        }

        try {
            const geoPath = shape.toGeometryPath();
            if (!geoPath || !geoPath.anchors || geoPath.anchors.length === 0) {
                console.warn(`Shape ${shape.type || 'unknown'} produced empty geometry path`);
                return { shape2d: this.rectShape(40, 40), width: 40, height: 40, center: { x: 0, y: 0 } };
            }

            // Get bounds to center the shape
            const bounds = geoPath.tightBoundingBox() || geoPath.looseBoundingBox();
            if (!bounds) {
                return { shape2d: this.rectShape(40, 40), width: 40, height: 40, center: { x: 0, y: 0 } };
            }

            const width = bounds.width();
            const height = bounds.height();
            const center = {
                x: (bounds.min.x + bounds.max.x) / 2,
                y: (bounds.min.y + bounds.max.y) / 2
            };

            // Create THREE.js Shape from geometry path anchors
            const shape2d = new THREE.Shape();
            const anchors = geoPath.anchors;
            const isClosed = geoPath.closed;

            if (anchors.length === 0) {
                return { shape2d: this.rectShape(width, height), width, height, center };
            }

            // Start with first anchor (centered)
            const firstAnchor = anchors[0];
            const startX = firstAnchor.position.x - center.x;
            const startY = firstAnchor.position.y - center.y;
            shape2d.moveTo(startX, startY);

            // Convert each segment
            for (let i = 1; i < anchors.length; i++) {
                const a1 = anchors[i - 1];
                const a2 = anchors[i];
                this.addSegmentToShape(shape2d, a1, a2, center);
            }

            // Close the path if it's closed, or if we need to close it for extrusion
            if (isClosed && anchors.length > 2) {
                // Close back to first anchor
                const lastAnchor = anchors[anchors.length - 1];
                this.addSegmentToShape(shape2d, lastAnchor, anchors[0], center);
                shape2d.closePath();
            } else if (!isClosed && anchors.length > 1) {
                // For open paths, close them for 3D extrusion
                const lastAnchor = anchors[anchors.length - 1];
                this.addSegmentToShape(shape2d, lastAnchor, anchors[0], center);
                shape2d.closePath();
            }

            // Handle holes (for shapes like Donut)
            // Note: The geometry library's Path doesn't directly expose holes,
            // but shapes like Donut might have multiple paths. We'd need to check
            // if the shape has multiple paths and convert them as holes.
            // For now, we'll handle this in the specific shape cases if needed.

            return { shape2d, width, height, center };
        } catch (e) {
            console.warn(`Failed to convert shape ${shape.type || 'unknown'} to THREE.js Shape:`, e);
            const bounds = shape.getBounds ? shape.getBounds() : { width: 40, height: 40 };
            return {
                shape2d: this.rectShape(bounds.width || 40, bounds.height || 40),
                width: bounds.width || 40,
                height: bounds.height || 40,
                center: { x: 0, y: 0 }
            };
        }
    }

    /**
     * Add a segment (line or bezier curve) to a THREE.js Shape.
     * 
     * @param {THREE.Shape} shape2d - The THREE.js Shape to add to
     * @param {Object} a1 - First anchor (with position Vec, handleOut Vec)
     * @param {Object} a2 - Second anchor (with position Vec, handleIn Vec)
     * @param {Object} center - Center point to offset coordinates
     */
    addSegmentToShape(shape2d, a1, a2, center) {
        // Check if handles are non-zero Vec objects
        // Handles are Vec objects with .x and .y properties (relative to position)
        const handleOutX = (a1.handleOut && typeof a1.handleOut.x === 'number') ? a1.handleOut.x : 0;
        const handleOutY = (a1.handleOut && typeof a1.handleOut.y === 'number') ? a1.handleOut.y : 0;
        const handleInX = (a2.handleIn && typeof a2.handleIn.x === 'number') ? a2.handleIn.x : 0;
        const handleInY = (a2.handleIn && typeof a2.handleIn.y === 'number') ? a2.handleIn.y : 0;
        
        const hasHandleOut = handleOutX !== 0 || handleOutY !== 0;
        const hasHandleIn = handleInX !== 0 || handleInY !== 0;
        const hasHandles = hasHandleOut || hasHandleIn;

        if (hasHandles) {
            // Bezier curve: handles are relative to anchor position
            // Control point 1: position + handleOut (from first anchor)
            const cp1x = a1.position.x + handleOutX - center.x;
            const cp1y = a1.position.y + handleOutY - center.y;
            
            // Control point 2: position + handleIn (from second anchor)
            const cp2x = a2.position.x + handleInX - center.x;
            const cp2y = a2.position.y + handleInY - center.y;
            
            // End point: second anchor position
            const endX = a2.position.x - center.x;
            const endY = a2.position.y - center.y;
            
            shape2d.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
        } else {
            // Straight line
            const x = a2.position.x - center.x;
            const y = a2.position.y - center.y;
            shape2d.lineTo(x, y);
        }
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
        let skipFemaleHoles = false;

        // Special handling for rectangles with joinery (needs custom edge notches)
        if (shape.type === 'rectangle') {
            const joineryBySide = this.getRectangleJoinery(shape, options);
            if (joineryBySide) {
                const width = shape.width;
                const height = shape.height;
                const shape2d = this.rectShapeWithJoinery(width, height, shape, joineryBySide);
                skipFemaleHoles = true;
                
                const geometry = new THREE.ExtrudeGeometry(shape2d, {
                    depth: thickness,
                    bevelEnabled: false
                });
                geometry.rotateX(-Math.PI / 2);
                return { geometry, width, height };
            }
        }

        // Universal converter: use the shape's SVG path definition for all shapes
        // Special handling for Donut: it uses winding-rule holes which THREE.js doesn't support directly
        // So we'll use the existing donutShape method which creates explicit holes
        if (shape.type === 'donut') {
            const outerRadius = shape.outerRadius || 25;
            const innerRadius = shape.innerRadius || 12.5;
            const donutShape2d = this.donutShape(outerRadius, innerRadius);
            
            if (!skipFemaleHoles) {
                this.addFemaleJoineryHoles(donutShape2d, shape, options);
            }

            const geometry = new THREE.ExtrudeGeometry(donutShape2d, {
                depth: thickness,
                bevelEnabled: false
            });
            geometry.rotateX(-Math.PI / 2);
            return { geometry, width: outerRadius * 2, height: outerRadius * 2 };
        }

        // For all other shapes, use the universal converter
        const { shape2d, width, height, center } = this.shapeToThreeShape(shape, options);

        if (!shape2d) return { geometry: null, width, height };

        // Add female joinery holes if needed
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
