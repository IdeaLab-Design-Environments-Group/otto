export class GridLayoutStrategy {
    constructor({ gap = 20, maxRowWidth = 600 } = {}) {
        this.gap = gap;
        this.maxRowWidth = maxRowWidth;
    }

    layout(pieces) {
        let cursorX = 0;
        let cursorZ = 0;
        let rowDepth = 0;

        pieces.forEach(piece => {
            const width = piece.width || 40;
            const depth = piece.height || 40;

            if (cursorX + width > this.maxRowWidth) {
                cursorX = 0;
                cursorZ += rowDepth + this.gap;
                rowDepth = 0;
            }

            piece.position = {
                x: cursorX + width / 2,
                z: cursorZ + depth / 2
            };

            cursorX += width + this.gap;
            rowDepth = Math.max(rowDepth, depth);
        });

        this.centerPieces(pieces);
        return pieces;
    }

    centerPieces(pieces) {
        if (pieces.length === 0) return;

        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;

        pieces.forEach(piece => {
            const width = piece.width || 0;
            const depth = piece.height || 0;
            const x = piece.position?.x || 0;
            const z = piece.position?.z || 0;

            minX = Math.min(minX, x - width / 2);
            maxX = Math.max(maxX, x + width / 2);
            minZ = Math.min(minZ, z - depth / 2);
            maxZ = Math.max(maxZ, z + depth / 2);
        });

        const offsetX = (minX + maxX) / 2;
        const offsetZ = (minZ + maxZ) / 2;

        pieces.forEach(piece => {
            if (!piece.position) piece.position = { x: 0, z: 0 };
            piece.position.x -= offsetX;
            piece.position.z -= offsetZ;
        });
    }
}
