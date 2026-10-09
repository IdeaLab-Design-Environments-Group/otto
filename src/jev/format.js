/**
 * @fileoverview Plain-language lines for Jev's proposal steps, as the
 * panel shows them ("Add panel front — 300 × 150 mm, 6 mm sheet").
 *
 * @module jev/format
 */
import { jointTypes } from '../joints/JointRegistry.js';
import { portRefText } from '../joints/ports.js';

const params = (p) => {
    const entries = Object.entries(p || {});
    return entries.length ? ` (${entries.map(([k, v]) => `${k} ${v}`).join(', ')})` : '';
};

/** @param {{action: string, args: Object}} step */
export function describeStep({ action, args = {} }) {
    switch (action) {
        case 'add_panel':
            return `Add panel ${args.id} — ${args.width} × ${args.height} mm, ${args.thickness ?? 6} mm sheet`;
        case 'set_panel_size': {
            const size = [args.width, args.height].every(v => v !== undefined) ? `${args.width} × ${args.height} mm` : '';
            const t = args.thickness !== undefined ? `${args.thickness} mm sheet` : '';
            return `Resize ${args.id} → ${[size, t].filter(Boolean).join(', ')}`;
        }
        case 'remove_panel':
            return `Remove panel ${args.id} and its joints`;
        case 'join': {
            const label = jointTypes.get(args.type)?.label ?? args.type;
            return `${label}: ${portRefText(args.a)} ↔ ${portRefText(args.b)}${params(args.params)}`;
        }
        case 'set_joint':
            return `Change joint ${args.id}${params(args.params)}`;
        case 'remove_joint':
            return `Remove joint ${args.id}`;
        case 'set_ground':
            return `${args.shape} lies on the floor in 3D`;
        default:
            return `${action} ${JSON.stringify(args)}`;
    }
}
