/**
 * @fileoverview SheetLayout — packs cut parts onto laser-bed sized sheets.
 *
 * Shelf packing per material: parts are placed tallest-first left to right
 * in horizontal shelves; a part may be turned 90° to lie long side
 * horizontal or to fit at all. Parts that fit the bed in neither
 * orientation are reported as oversize (they need splitting, e.g. with a
 * dovetail splice) instead of being placed.
 *
 * @module fabrication/SheetLayout
 */
import { bounds } from './polygon.js';

/**
 * @param {Array<{partId: string, materialId: string, outer: Array<{x,y}>}>} items
 * @param {{bed: {w: number, h: number}, margin?: number, gap?: number, allowRotate?: boolean}} options
 * @returns {{sheets: Array<{materialId: string, index: number,
 *   placements: Array<{partId: string, rot: 0|90, x: number, y: number, w: number, h: number}>}>,
 *   oversize: Array<{partId: string, w: number, h: number}>}}
 *   Each placement puts the part's (rotated) bounding box at (x, y) on the sheet.
 */
export function layoutSheets(items, { bed, margin = 5, gap = 4, allowRotate = true }) {
    const usableW = bed.w - 2 * margin;
    const usableH = bed.h - 2 * margin;
    const sheets = [];
    const oversize = [];

    const byMaterial = new Map();
    for (const item of items) {
        if (!byMaterial.has(item.materialId)) byMaterial.set(item.materialId, []);
        byMaterial.get(item.materialId).push(item);
    }

    for (const [materialId, group] of byMaterial) {
        const sized = [];
        for (const item of group) {
            const b = bounds(item.outer);
            const fits = (w, h) => w <= usableW + 1e-9 && h <= usableH + 1e-9;
            // Prefer long side horizontal (flatter shelves), else whatever fits.
            const options = [{ rot: 0, w: b.w, h: b.h }];
            if (allowRotate) options.push({ rot: 90, w: b.h, h: b.w });
            const fitting = options.filter(o => fits(o.w, o.h)).sort((p, q) => p.h - q.h);
            if (fitting.length === 0) oversize.push({ partId: item.partId, w: b.w, h: b.h });
            else sized.push({ partId: item.partId, ...fitting[0] });
        }
        sized.sort((p, q) => q.h - p.h || p.partId.localeCompare(q.partId));

        let sheet = null;
        for (const it of sized) {
            let placed = false;
            if (sheet) {
                for (const shelf of sheet.shelves) {
                    if (it.h <= shelf.h + 1e-9 && shelf.x + it.w <= usableW + 1e-9) {
                        sheet.placements.push(place(it, shelf.x, shelf.y, margin));
                        shelf.x += it.w + gap;
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    const last = sheet.shelves[sheet.shelves.length - 1];
                    const y = last.y + last.h + gap;
                    if (y + it.h <= usableH + 1e-9) {
                        sheet.shelves.push({ y, h: it.h, x: it.w + gap });
                        sheet.placements.push(place(it, 0, y, margin));
                        placed = true;
                    }
                }
            }
            if (!placed) {
                sheet = { materialId, index: sheets.filter(s => s.materialId === materialId).length, shelves: [{ y: 0, h: it.h, x: it.w + gap }], placements: [] };
                sheets.push(sheet);
                sheet.placements.push(place(it, 0, 0, margin));
            }
        }
    }

    return {
        sheets: sheets.map(({ materialId, index, placements }) => ({ materialId, index, placements })),
        oversize
    };
}

function place(it, x, y, margin) {
    return { partId: it.partId, rot: it.rot, x: x + margin, y: y + margin, w: it.w, h: it.h };
}

/**
 * Map a part-local outline point to sheet coordinates for a placement:
 * rotate by `rot`, then move the rotated bounding box's corner to (x, y).
 */
export function placePoints(points, placement, partBounds) {
    return points.map(p => {
        const r = placement.rot === 90
            ? { x: partBounds.maxY - p.y, y: p.x - partBounds.minX }
            : { x: p.x - partBounds.minX, y: p.y - partBounds.minY };
        return { x: r.x + placement.x, y: r.y + placement.y };
    });
}
