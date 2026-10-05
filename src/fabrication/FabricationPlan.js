/**
 * @fileoverview FabricationPlan — everything needed to cut the scene:
 *
 *   every closed shape is a part (jointed shapes use their cut outline with
 *   teeth / slots; a living hinge pair becomes ONE piece; wedges are extra
 *   pieces) → kerf compensation (outlines grow by kerf/2, holes shrink) →
 *   parts grouped by thickness and packed onto bed-sized sheets → one SVG
 *   per sheet, plus a bill of materials and the problems to fix first
 *   (parts larger than the bed, joint errors, loops that do not close).
 *
 * Pure apart from reading the scene, so it is tested in Node.
 *
 * @module fabrication/FabricationPlan
 */
import { resolveJoints } from '../joints/JointService.js';
import { shapeOutlines } from '../joints/resolveParts.js';
import { jointTypes } from '../joints/JointRegistry.js';
import { hingeLayout } from '../joints/types/hinge.js';
import { mergeHingePiece } from './mergePieces.js';
import { offsetPolygon, toCCW, bounds } from './polygon.js';
import { layoutSheets } from './SheetLayout.js';
import { renderSheetSVG } from './SvgExporter.js';

/** Sheet group key for a thickness, e.g. "6 mm". */
export const thicknessKey = (t) => `${Number(t.toFixed(2))} mm`;

/**
 * @param {import('../core/SceneState.js').SceneState} scene
 * @param {import('../joints/JointRegistry.js').JointRegistry} [registry]
 * @returns {{settings: Object, parts: Array, sheets: Array, files: Array,
 *   oversize: Array, bom: Array, findings: Array, skipped: Array}}
 */
export function buildFabrication(scene, registry = jointTypes) {
    const settings = scene.jointStore.getFabrication();
    const hasJoints = scene.jointStore.getAll().length > 0;
    const joints = hasJoints ? resolveJoints(scene, registry) : null;
    const findings = joints ? joints.findings.filter(f => f.severity !== 'info') : [];
    const parts = new Map();   // id → {id, thickness, outer, holes, kind}
    const skipped = [];

    for (const stored of scene.shapeStore.getAll()) {
        const shape = scene.bindingResolver.resolveShape(stored);
        const thickness = Number(shape.depth) || 3;
        const cut = joints?.cuts.get(shape.id);
        if (cut) {
            parts.set(shape.id, { id: shape.id, thickness, outer: cut.outer, holes: cut.holes, kind: 'jointed' });
            continue;
        }
        const outlines = shapeOutlines(shape);
        if (!outlines) {
            skipped.push(shape.id);
            continue;
        }
        parts.set(shape.id, { id: shape.id, thickness, ...outlines, kind: 'plain' });
    }

    // A living hinge cuts its two panels as one piece.
    for (const merge of joints?.merges || []) {
        const joint = joints.resolved.joints.find(j => j.id === merge.jointId);
        const partA = joints.resolved.partsById.get(merge.base);
        const partB = joints.resolved.partsById.get(merge.attached);
        const portA = partA.ports[joint.a.port], portB = partB.ports[joint.b.port];
        const h = hingeLayout(joint.params, portA.length, portB.length, Math.max(partA.thickness, partB.thickness));
        const merged = mergeHingePiece({
            cutA: joints.cuts.get(merge.base), cutB: joints.cuts.get(merge.attached),
            portA, portB, s: h.s, strip: h.strip
        });
        if (merged.error) {
            findings.push({ severity: 'error', code: 'hinge_merge', target: joint.id, message: `${joint.id}: ${merged.error}` });
            continue;
        }
        parts.set(merge.base, { ...parts.get(merge.base), ...merged, id: `${merge.base}+${merge.attached}`, kind: 'hinge' });
        parts.delete(merge.attached);
    }

    // Loose pieces made by joints (wedges).
    for (const extra of joints?.extras || []) {
        parts.set(extra.id, { id: extra.id, thickness: extra.thickness, outer: toCCW(extra.outline), holes: [], kind: 'extra' });
    }

    // Kerf: the laser burns kerf/2 on each side of the line.
    const k = settings.kerf / 2;
    const items = [...parts.values()].map(p => ({
        partId: p.id,
        materialId: thicknessKey(p.thickness),
        thickness: p.thickness,
        kind: p.kind,
        outer: offsetPolygon(toCCW(p.outer), k),
        holes: p.holes.map(h => offsetPolygon(toCCW(h), -k))
    }));
    const byId = new Map(items.map(i => [i.partId, i]));

    const { sheets, oversize } = layoutSheets(items, { bed: settings.bed, margin: settings.margin, gap: settings.gap });
    for (const o of oversize) {
        findings.push({
            severity: 'error', code: 'part_too_big', target: o.partId,
            message: `${o.partId} (${fmt(o.w)} × ${fmt(o.h)} mm with kerf) does not fit the ${settings.bed.w} × ${settings.bed.h} mm bed ` +
                `(${fmt(settings.bed.w - 2 * settings.margin)} × ${fmt(settings.bed.h - 2 * settings.margin)} mm inside the ${settings.margin} mm margin) — ` +
                'split it into pieces joined with a splice, or set a larger bed or smaller margin'
        });
    }

    const files = sheets.map(sheet => ({
        filename: `otto-${sheet.materialId.replace(' ', '')}-sheet${sheet.index + 1}.svg`,
        thickness: sheet.materialId,
        partIds: sheet.placements.map(p => p.partId),
        svg: renderSheetSVG(sheet, byId, settings.bed, { labels: settings.labels })
    }));

    const bomTotals = new Map();
    for (const line of joints?.bom || []) bomTotals.set(line.item, (bomTotals.get(line.item) || 0) + line.qty);
    const bom = [...bomTotals].map(([item, qty]) => ({ item, qty })).sort((a, b) => a.item.localeCompare(b.item));

    return { settings, parts: items, sheets, files, oversize, bom, findings, skipped };
}

const fmt = (v) => String(Math.round(v * 10) / 10);

/** Size of the bounding box of a part (after kerf), for summaries. */
export function partSize(item) {
    const b = bounds(item.outer);
    return { w: b.w, h: b.h };
}
