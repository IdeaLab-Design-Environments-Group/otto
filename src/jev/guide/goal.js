/**
 * @fileoverview Reading a goal: which blueprint, which sizes.
 *
 *   "a shelf 60 cm tall with 3 boards"  → shelf {height: 600, count: 3}
 *   "box 300 x 200 x 150"               → box {width: 300, depth: 200, height: 150}
 *   "stool, 9 mm plywood"               → stool {thickness: 9}
 *
 * Lengths are mm unless they say cm or m. Pure, so it is unit-tested.
 *
 * @module jev/guide/goal
 */
import { BLUEPRINTS } from './blueprints.js';

const NUM = '(\\d+(?:[.,]\\d+)?)';
const UNIT = '\\s*(mm|cm|m)?\\b';
const SCALE = { mm: 1, cm: 10, m: 1000 };

const toMm = (num, unit) => Number(num.replace(',', '.')) * (SCALE[unit?.toLowerCase()] ?? 1);

const WORD_DIM = [
    [/^(wide|width|long|length|across)$/i, 'width'],
    [/^(tall|high|height)$/i, 'height'],
    [/^(deep|depth)$/i, 'depth'],
    [/^(thick|thickness|sheet|plywood|ply|mdf|acrylic|board|boards?)$/i, 'thickness']
];
const dimOfWord = (w) => WORD_DIM.find(([re]) => re.test(w))?.[1] ?? null;

/** The blueprint a text asks for, or null. */
export function matchBlueprint(text) {
    return BLUEPRINTS.find(b => b.keywords.test(text)) || null;
}

/**
 * Sizes named in a text, by dimension name (width, depth, height,
 * thickness, count). Unlabelled single lengths go to `main`.
 * @param {string} text
 * @param {{triple: string[], main: string}} [blueprint]
 * @returns {Object<string, number>}
 */
export function parseDims(text, blueprint = null) {
    const dims = {};
    let rest = String(text);

    // "A × B (× C) unit": the trailing unit applies to all.
    const tripleRe = new RegExp(`${NUM}${UNIT}\\s*[x×*]\\s*${NUM}${UNIT}(?:\\s*[x×*]\\s*${NUM}${UNIT})?`, 'i');
    const t = rest.match(tripleRe);
    if (t) {
        const unit = t[6] || t[4] || t[2];
        const values = [[t[1], t[2]], [t[3], t[4]], [t[5], t[6]]].filter(([n]) => n !== undefined)
            .map(([n, u]) => toMm(n, u || unit));
        const order = blueprint?.triple ?? ['width', 'depth', 'height'];
        values.forEach((v, i) => { if (order[i] && dims[order[i]] === undefined) dims[order[i]] = v; });
        rest = rest.replace(t[0], ' ');
    }

    // "3 shelves / boards / levels"
    const count = rest.match(/\b(\d+)\s*(shelves|boards|levels|tiers|shelf boards)\b/i);
    if (count) {
        dims.count = Number(count[1]);
        rest = rest.replace(count[0], ' ');
    }

    // "60 cm tall", "6 mm plywood"
    const after = new RegExp(`${NUM}${UNIT}\\s*(?:-\\s*)?([a-z]+)`, 'gi');
    rest = rest.replace(after, (whole, n, u, word) => {
        const dim = dimOfWord(word);
        if (!dim || dims[dim] !== undefined) return whole;
        dims[dim] = toMm(n, u);
        return ' ';
    });
    // "height 600", "width: 40cm"
    const before = new RegExp(`\\b([a-z]+)\\s*[:=]?\\s*(?:of\\s+)?${NUM}${UNIT}`, 'gi');
    rest = rest.replace(before, (whole, word, n, u) => {
        const dim = dimOfWord(word);
        if (!dim || dims[dim] !== undefined) return whole;
        dims[dim] = toMm(n, u);
        return ' ';
    });

    // A lone length with a unit ("a 60 cm shelf") is the main dimension.
    const lone = rest.match(new RegExp(`${NUM}\\s*(mm|cm|m)\\b`, 'i'));
    if (lone && blueprint?.main && dims[blueprint.main] === undefined) dims[blueprint.main] = toMm(lone[1], lone[2]);
    return dims;
}

/** @returns {{blueprint: ?Object, dims: Object}} */
export function parseGoal(text) {
    const blueprint = matchBlueprint(text);
    return { blueprint, dims: parseDims(text, blueprint) };
}
