/**
 * @fileoverview Blueprints — the build-up recipes Jev's offline guide knows.
 *
 * A blueprint turns a goal ("a 60 cm shelf") into an ordered list of
 * blocks. Each block is a small Lego step: the panels it adds, the joints
 * that click them onto what is already there, and WHY that joint suits that
 * connection. A block may offer variants (another joint for the same
 * connection) that the user can switch to.
 *
 *   {id, label, keywords: RegExp, dims: {name: {label, default, min, max}},
 *    triple: [dim, dim, dim]    // order of "A × B × C" in a goal
 *    main: dim                  // what a lone number means
 *    blocks(d) → [{title, why, panels: [{id, width, height}],
 *                  variants: [{label, why?, joints: [...]}], ground?}]}
 *
 * Adding a recipe = one entry here. Every recipe is checked by
 * tests/unit/jevGuide.test.js: built block by block it must have no joint
 * errors or warnings at its default size.
 *
 * @module jev/guide/blueprints
 */
import { BOLTS } from '../../joints/types/bolt.js';

const edge = (shape, name) => ({ shape, edge: name });
const inset = (shape, name, d) => ({ shape, edge: name, inset: d });
const at = (shape, name, d) => ({ shape, edge: name, at: d });
const joint = (type, a, b, params = {}) => ({ type, a, b, params });
const r = (v) => Math.round(v * 10) / 10;

/** The biggest bolt whose nut still fits inside a sheet of thickness t. */
export function boltFor(t) {
    const fits = Object.entries(BOLTS).filter(([, s]) => s.af < t);
    return fits.length ? fits[fits.length - 1][0] : null;
}

export const BLUEPRINTS = [
    {
        id: 'box',
        label: 'Open box',
        keywords: /\b(box|boxes|crate|tray|drawer|bin|planter)\b/i,
        dims: {
            width: { label: 'width', default: 300, min: 40, max: 3000 },
            depth: { label: 'depth', default: 200, min: 40, max: 3000 },
            height: { label: 'height', default: 150, min: 20, max: 3000 },
            thickness: { label: 'sheet', default: 6, min: 2, max: 30 }
        },
        triple: ['width', 'depth', 'height'],
        main: 'width',
        blocks: (d) => [
            {
                title: 'Base',
                why: 'Start from the floor: every wall clicks onto the base, so it is the brick everything else stands on.',
                panels: [{ id: 'base', width: d.width, height: d.depth }],
                variants: [{ joints: [] }],
                ground: 'base'
            },
            {
                title: 'Front wall',
                why: 'A finger joint along the base: interlocking teeth make a square 90° corner with lots of glue area, and the teeth line the wall up for you.',
                panels: [{ id: 'front', width: d.width, height: d.height }],
                variants: [{ joints: [joint('finger', edge('base', 'top'), edge('front', 'top'))] }]
            },
            {
                title: 'Right wall',
                why: 'It closes the first corner: finger joints to the base below and to the front wall beside it, so the corner is locked in two directions.',
                panels: [{ id: 'east', width: d.depth, height: d.height }],
                variants: [{
                    joints: [
                        joint('finger', edge('base', 'right'), edge('east', 'top')),
                        joint('finger', edge('front', 'left'), edge('east', 'right'))
                    ]
                }]
            },
            {
                title: 'Left wall',
                why: 'Same as the right wall, mirrored: finger joints to the base and the front.',
                panels: [{ id: 'west', width: d.depth, height: d.height }],
                variants: [{
                    joints: [
                        joint('finger', edge('base', 'left'), edge('west', 'top')),
                        joint('finger', edge('west', 'left'), edge('front', 'right'))
                    ]
                }]
            },
            {
                title: 'Back wall',
                why: 'The last brick closes the loop: three finger joints at once. If the box does not close, Otto reports by how many mm.',
                panels: [{ id: 'back', width: d.width, height: d.height }],
                variants: [{
                    joints: [
                        joint('finger', edge('base', 'bottom'), edge('back', 'top')),
                        joint('finger', edge('east', 'left'), edge('back', 'right')),
                        joint('finger', edge('back', 'left'), edge('west', 'right'))
                    ]
                }]
            }
        ]
    },

    {
        id: 'shelf',
        label: 'Shelf',
        keywords: /\b(shelf|shelves|shelving|bookcase|bookshelf|rack|cabinet)\b/i,
        dims: {
            width: { label: 'inner width', default: 400, min: 80, max: 3000 },
            depth: { label: 'depth', default: 280, min: 60, max: 1500 },
            height: { label: 'height', default: 560, min: 100, max: 3000 },
            count: { label: 'boards', default: 2, min: 1, max: 12 },
            thickness: { label: 'sheet', default: 6, min: 2, max: 30 }
        },
        triple: ['width', 'depth', 'height'],
        main: 'height',
        blocks: (d) => {
            const n = Math.round(d.count);
            const bolt = boltFor(d.thickness);
            const sides = [
                {
                    title: 'Left side',
                    why: 'The sides carry everything: every board hangs between them, so they come first.',
                    panels: [{ id: 'side_a', width: d.depth, height: d.height }],
                    variants: [{ joints: [] }]
                },
                {
                    title: 'Right side',
                    why: 'The twin of the left side. The boards will fix the distance between the two.',
                    panels: [{ id: 'side_b', width: d.depth, height: d.height }],
                    variants: [{ joints: [] }]
                }
            ];
            const boards = Array.from({ length: n }, (_, i) => {
                const id = `board_${i + 1}`;
                const y = r(d.height * (2 * i + 1) / (2 * n));
                const tabs = (params) => [
                    joint('tab_slot', edge(id, 'left'), inset('side_a', 'top', y), params),
                    joint('tab_slot', edge(id, 'right'), inset('side_b', 'top', y), params)
                ];
                const wedge = {
                    label: 'Tabs with wedges',
                    why: 'Tabs through slots in both sides, locked with wedges: no glue, it comes apart again, and the wedges pull the sides tight so the shelf does not rack.',
                    joints: tabs({ tabs: 2, lock: 'wedge' })
                };
                const plain = {
                    label: 'Plain tabs',
                    why: 'Tabs through slots in both sides: the board carries load on the slot edges. Glue them, or rely on the wedged board to keep the sides together.',
                    joints: tabs({ tabs: 2 })
                };
                const variants = i === 0 ? [wedge, plain] : [plain, wedge];
                if (bolt) {
                    variants.push({
                        label: `${bolt} bolts`,
                        why: `${bolt} bolts with captive nuts into each side: strongest, and it comes apart as often as you like. Needs hardware (listed in Cut files).`,
                        joints: [
                            joint('bolt', edge(id, 'left'), inset('side_a', 'top', y), { size: bolt, count: 2 }),
                            joint('bolt', edge(id, 'right'), inset('side_b', 'top', y), { size: bolt, count: 2 })
                        ]
                    });
                }
                return {
                    title: n === 1 ? 'Board' : `Board ${i + 1}${i === 0 ? ' (bottom)' : ''}`,
                    why: variants[0].why,
                    panels: [{ id, width: d.width, height: d.depth }],
                    variants,
                    // The bottom board lies level, so the sides stand up in 3D.
                    ...(i === 0 ? { ground: id } : {})
                };
            });
            return [...sides, ...boards];
        }
    },

    {
        id: 'stool',
        label: 'Stool',
        keywords: /\b(stool|stools|seat|side ?table|plinth|bench)\b/i,
        dims: {
            width: { label: 'seat size', default: 360, min: 150, max: 1500 },
            height: { label: 'height', default: 380, min: 150, max: 1500 },
            thickness: { label: 'sheet', default: 9, min: 4, max: 30 }
        },
        triple: ['width', 'width', 'height'],
        main: 'height',
        blocks: (d) => {
            const mid = r(d.width / 2);
            const bolt = boltFor(d.thickness);
            const seatVariants = [];
            if (bolt) {
                seatVariants.push({
                    label: `${bolt} bolts`,
                    why: `Bolted down with ${bolt} bolts and captive nuts: the seat takes your weight straight into the leg, and you can take the stool apart flat.`,
                    joints: [joint('bolt', edge('leg_a', 'top'), inset('seat', 'top', mid), { size: bolt, count: 2, side: 'down' })]
                });
            }
            seatVariants.push({
                label: 'Tabs',
                why: 'The leg\'s top edge goes through slots in the seat: no hardware, glue it for a permanent stool.',
                joints: [joint('tab_slot', edge('leg_a', 'top'), inset('seat', 'top', mid), { tabs: 2, side: 'down' })]
            });
            return [
                {
                    title: 'First leg',
                    why: 'A stool stands on its legs: start with one leg frame, the second one will slot across it.',
                    panels: [{ id: 'leg_a', width: d.width, height: d.height }],
                    variants: [{ joints: [] }]
                },
                {
                    title: 'Second leg (cross lap)',
                    why: 'A cross lap: each leg gets a slot halfway, and they slide into each other as an X. No glue, no screws, and the X cannot rack.',
                    panels: [{ id: 'leg_b', width: d.width, height: d.height }],
                    variants: [{ joints: [joint('cross_lap', at('leg_a', 'top', mid), at('leg_b', 'bottom', mid))] }]
                },
                {
                    title: 'Seat',
                    why: seatVariants[0].why,
                    panels: [{ id: 'seat', width: d.width, height: d.width }],
                    variants: seatVariants,
                    ground: 'seat'
                }
            ];
        }
    }
];

export const blueprintById = (id) => BLUEPRINTS.find(b => b.id === id) || null;

/** Default dimensions of a blueprint, overridden by `dims` (clamped to the limits). */
export function resolveDims(blueprint, dims = {}) {
    const out = {};
    for (const [k, spec] of Object.entries(blueprint.dims)) {
        const v = Number(dims[k]);
        out[k] = Number.isFinite(v) ? Math.min(spec.max, Math.max(spec.min, v)) : spec.default;
    }
    return out;
}

/** "300 × 200 × 150 mm, 6 mm sheet" */
export function describeDims(blueprint, d) {
    const parts = Object.entries(blueprint.dims)
        .filter(([k]) => k !== 'thickness')
        .map(([k, spec]) => (k === 'count' ? `${d[k]} ${spec.label}` : `${spec.label} ${d[k]} mm`));
    return `${parts.join(', ')}, ${d.thickness} mm sheet`;
}
