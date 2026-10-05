/**
 * @fileoverview SvgExporter — laser-ready SVG for one sheet.
 *
 * Units are millimetres (width/height in mm, viewBox in mm). Cut paths are a
 * red hairline (#FF0000, 0.01 mm), the convention most laser drivers map to
 * "cut"; optional part labels are a blue text layer (#0000FF) for engraving
 * or reference. Outlines arrive already kerf-compensated (see
 * fabrication/FabricationPlan).
 *
 * @module fabrication/SvgExporter
 */
import { bounds } from './polygon.js';
import { placePoints } from './SheetLayout.js';

/** Render one sheet as an SVG string. */
export function renderSheetSVG(sheet, itemsById, bed, { labels = true } = {}) {
    const fmt = (v) => (Math.round(v * 1000) / 1000).toString();
    const loop = (pts) => `M ${pts.map(p => `${fmt(p.x)} ${fmt(p.y)}`).join(' L ')} Z`;
    const paths = [];
    const texts = [];
    for (const placement of sheet.placements) {
        const item = itemsById.get(placement.partId);
        const b = bounds(item.outer);
        const d = [item.outer, ...item.holes].map(pts => loop(placePoints(pts, placement, b))).join(' ');
        // data-part, not id: shape names may contain spaces (not valid XML ids).
        paths.push(`    <path data-part="${escapeXml(placement.partId)}" d="${d}"/>`);
        if (labels) {
            texts.push(`    <text x="${fmt(placement.x + placement.w / 2)}" y="${fmt(placement.y + placement.h / 2)}">${escapeXml(placement.partId)}</text>`);
        }
    }
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(bed.w)}mm" height="${fmt(bed.h)}mm" viewBox="0 0 ${fmt(bed.w)} ${fmt(bed.h)}">`,
        '  <g id="cut" fill="none" stroke="#FF0000" stroke-width="0.01">',
        ...paths,
        '  </g>',
        ...(labels ? [
            '  <g id="labels" fill="#0000FF" font-family="sans-serif" font-size="6" text-anchor="middle" dominant-baseline="middle">',
            ...texts,
            '  </g>'
        ] : []),
        '</svg>'
    ].join('\n');
}

function escapeXml(s) {
    return String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}
