/**
 * @fileoverview Guide — what Jev proposes next. Rule-based: no network, no
 * model; the recipes are blueprints.js, the goal reader is goal.js.
 *
 * What it does — build up, block by block, like Lego:
 *   1. Read the goal (blueprints + goal parser). Unclear → ask which object.
 *   2. Set the plan: one plan step per block.
 *   3. Propose the next block that is not in the design yet: only the
 *      panels and joints still MISSING, so blocks the user built by hand
 *      count and are never added twice.
 *   4. After each applied block, propose the next one. At the end, run the
 *      checks and say what is left to fix.
 *   Rejected with an offered alternative → act on it (another joint: the
 *   block's variants; skip). Rejected plainly → ask what to change (also:
 *   another size, which resizes the panels already placed).
 *
 * Every event returns effects for JevSession: {say}, {plan}, {ask}, {propose}.
 * Progress is read from the design itself (`progress(scene)`), so the plan
 * ticks off whoever placed the block.
 *
 * @module jev/guide/Guide
 */
import { resolveDims, describeDims } from './blueprints.js';
import { parseGoal, parseDims } from './goal.js';
import { portRefText } from '../../joints/ports.js';
import { checkDesign } from '../queries.js';

const NEXT = /^\s*(next|continue|go( on)?|ok(ay)?|yes|sure|go ahead|next block|keep going)\b/i;
const CHOICES = { joint: 'Other joint', skip: 'Skip', size: 'Change size', stop: 'Stop' };

const say = (line) => ({ say: line });

const portKeyOf = (p) => portRefText(p);
const jointKey = (j) => {
    const a = portKeyOf(j.a), b = portKeyOf(j.b);
    return `${j.type}|${a < b ? a : b}|${a < b ? b : a}`;
};

export class Guide {
    /** @param {{getScene: () => import('../../core/SceneState.js').SceneState}} deps */
    constructor({ getScene }) {
        this.getScene = getScene;
        this.blueprint = null;
        this.dims = null;
        this.variantOf = new Map();   // block index → chosen variant
        this.skipped = new Set();
        this.current = null;          // block index of the last proposal
        this.awaiting = null;         // 'goal' | 'change' | 'size'
    }

    /** Which plan steps are in the design (whoever placed them). */
    progress(scene = this.getScene()) {
        if (!this.blueprint) return [];
        return this.blocks().map((_, i) => this.missing(i, scene).length === 0);
    }

    // ---- deciding ---------------------------------------------------------------

    /** A proposal was applied (by the user or the policy): on to the next block. */
    onApplied() {
        return this.proposeNext('');
    }

    /** A proposal was rejected; `reason` may be one of the alternatives it offered. */
    onRejected(reason = '') {
        const choice = reason.trim();
        return Object.values(CHOICES).includes(choice) ? this.choose(choice) : this.askWhatToChange();
    }

    /** The user said something: a goal, a size, an answer, "next". */
    onText(text) {
        const said = String(text).trim();
        if (this.awaiting === 'change' && Object.values(CHOICES).includes(said)) return this.choose(said);

        const { blueprint, dims } = parseGoal(said);
        if (blueprint && blueprint !== this.blueprint) return this.start(blueprint, dims);
        if (this.blueprint) {
            const sizes = parseDims(said, this.blueprint);
            if (Object.keys(sizes).length) return this.resize(sizes);
            if (NEXT.test(said) || blueprint) return this.proposeNext('');
            return [say(`I can build this ${this.blueprint.label.toLowerCase()} block by block: say "next" for the next block, give a new size ("${this.example()}"), or ask for a box, a shelf or a stool.`)];
        }
        this.awaiting = 'goal';
        return [
            say('What are we building? I know these, block by block:'),
            { ask: { question: 'Pick a starting point (you can add sizes, e.g. "a shelf 80 cm tall with 3 boards").', options: ['A box', 'A shelf', 'A stool'] } }
        ];
    }

    /** @private Act on one of the choices offered after a rejection. */
    choose(choice) {
        this.awaiting = null;
        if (choice === CHOICES.skip) {
            if (this.current !== null) this.skipped.add(this.current);
            return this.proposeNext('Skipped. ');
        }
        if (choice === CHOICES.joint) return this.otherJoint();
        if (choice === CHOICES.size) {
            this.awaiting = 'size';
            return [say(`Tell me the new size, e.g. "${this.example()}".`)];
        }
        return [say('Stopped. Say "next" whenever you want the next block.')];
    }

    /** @private Set the plan and propose the first block. */
    start(blueprint, dims) {
        this.blueprint = blueprint;
        this.dims = resolveDims(blueprint, dims);
        this.variantOf.clear();
        this.skipped.clear();
        this.current = null;
        this.awaiting = null;
        const blocks = this.blocks();
        const intro = `${blueprint.label}: ${describeDims(blueprint, this.dims)}. ${blocks.length} blocks — I will propose them one at a time; apply, reject, or build one yourself and I will notice.${this.bedNote()}`;
        return [
            say(intro),
            { plan: { goal: `${blueprint.label} (${describeDims(blueprint, this.dims)})`, steps: blocks.map(b => b.title) } },
            ...this.proposeBlock()
        ];
    }

    /** @private The next block that is not in the design yet. */
    proposeNext(prefix) {
        if (!this.blueprint) return [say(`${prefix}Tell me what to build: a box, a shelf or a stool.`)];
        const block = this.proposeBlock();
        if (block.length) return [...(prefix ? [say(prefix.trim())] : []), ...block];
        return [say(`${prefix}${this.wrapUp()}`)];
    }

    /** @private The effect proposing the next missing block (empty when all are in). */
    proposeBlock() {
        const scene = this.getScene();
        const blocks = this.blocks();
        const index = blocks.findIndex((_, i) => !this.skipped.has(i) && this.missing(i, scene).length > 0);
        if (index < 0) return [];
        this.current = index;
        const block = blocks[index];
        const variant = this.variant(index);
        const steps = this.missing(index, scene);
        const partly = steps.length < this.fullSteps(index).length;
        return [{
            propose: {
                title: `Block ${index + 1}/${blocks.length}: ${block.title}${variant.label && block.variants.length > 1 ? ` — ${variant.label}` : ''}`,
                why: `${variant.why || block.why}${partly ? ' (Part of it is already there; this adds what is missing.)' : ''}`,
                steps,
                planStep: index + 1,
                alternatives: [...(block.variants.length > 1 ? [CHOICES.joint] : []), CHOICES.skip]
            }
        }];
    }

    /** @private When everything is in: the checks' verdict. */
    wrapUp() {
        const skipped = [...this.skipped].map(i => this.blocks()[i].title);
        const check = checkDesign(this.getScene());
        const head = `All ${this.blocks().length - skipped.length} blocks are in${skipped.length ? ` (skipped: ${skipped.join(', ')})` : ''}.`;
        if (check.problems.length === 0) {
            return `${head} No problems: open 3D to see it folded up, then Cut files for ${check.sheets} sheet${check.sheets === 1 ? '' : 's'} to cut${check.hardware?.length ? ' and the hardware list' : ''}.`;
        }
        return `${head} Still to fix:\n${check.problems.map(p => `• ${p.message}`).join('\n')}`;
    }

    /** @private */
    askWhatToChange() {
        this.awaiting = 'change';
        const options = [CHOICES.skip];
        if (this.current !== null && this.blocks()[this.current].variants.length > 1) options.push(CHOICES.joint);
        options.push(CHOICES.size, CHOICES.stop);
        return [{ ask: { question: 'What should I change?', options } }];
    }

    /** @private Cycle the current block to its next joint variant. */
    otherJoint() {
        const i = this.current;
        const block = i === null ? null : this.blocks()[i];
        if (!block || block.variants.length < 2) return [say('This block has only one joint that fits. Say "next" to see it again, or skip it.')];
        this.variantOf.set(i, (this.variant(i, true) + 1) % block.variants.length);
        return this.proposeNext('');
    }

    /** @private New sizes: resize what is placed, then carry on. */
    resize(sizes) {
        this.awaiting = null;
        this.dims = resolveDims(this.blueprint, { ...this.dims, ...sizes });
        const scene = this.getScene();
        const steps = [];
        for (const block of this.blocks()) {
            for (const p of block.panels) {
                const s = scene.shapeStore.get(p.id);
                if (!s) continue;
                const t = this.dims.thickness;
                if (s.width !== p.width || s.height !== p.height || Number(s.depth) !== t) {
                    steps.push({ action: 'set_panel_size', args: { id: p.id, width: p.width, height: p.height, thickness: t } });
                }
            }
        }
        const head = say(`New size: ${describeDims(this.blueprint, this.dims)}.${this.bedNote()}`);
        const plan = { plan: { goal: `${this.blueprint.label} (${describeDims(this.blueprint, this.dims)})`, steps: this.blocks().map(b => b.title) } };
        if (steps.length === 0) return [head, plan, ...this.proposeBlock()];
        return [head, plan, { propose: { title: 'Resize the placed panels', why: 'The panels already in the design take the new size; every joint follows its edges.', steps } }];
    }

    // ---- blocks vs. the design ---------------------------------------------------

    /** @private */
    blocks() {
        return this.blueprint.blocks(this.dims);
    }

    /** @private Index of the chosen variant; by default the first one already in the design. */
    variant(i, indexOnly = false) {
        const block = this.blocks()[i];
        let v = this.variantOf.get(i);
        if (v === undefined) {
            const have = new Set(this.getScene().jointStore.getAll().map(jointKey));
            v = Math.max(0, block.variants.findIndex(x => x.joints.length && x.joints.every(j => have.has(jointKey(j)))));
        }
        return indexOnly ? v : block.variants[v];
    }

    /** @private Every step of a block (as if nothing were placed). */
    fullSteps(i) {
        const block = this.blocks()[i];
        return [...block.panels, ...this.variant(i).joints, ...(block.ground ? [block.ground] : [])];
    }

    /** @private The steps a block still needs in `scene`: missing panels, joints and ground. */
    missing(i, scene) {
        const block = this.blocks()[i];
        const steps = [];
        for (const p of block.panels) {
            if (!scene.shapeStore.get(p.id)) {
                steps.push({ action: 'add_panel', args: { id: p.id, width: p.width, height: p.height, thickness: this.dims.thickness } });
            }
        }
        const have = new Set(scene.jointStore.getAll().map(jointKey));
        const anyVariantIn = block.variants.some(v => v.joints.length && v.joints.every(j => have.has(jointKey(j))));
        if (!anyVariantIn) {
            for (const j of this.variant(i).joints) {
                if (!have.has(jointKey(j))) steps.push({ action: 'join', args: { type: j.type, a: j.a, b: j.b, ...(Object.keys(j.params).length ? { params: j.params } : {}) } });
            }
        }
        if (block.ground && scene.jointStore.ground !== block.ground) steps.push({ action: 'set_ground', args: { shape: block.ground } });
        return steps;
    }

    /** @private A warning when a panel will not fit the laser bed. */
    bedNote() {
        const { bed, margin = 0 } = this.getScene().jointStore.getFabrication();
        const W = bed.w - 2 * margin, H = bed.h - 2 * margin;
        const fits = (w, h) => (w <= W && h <= H) || (h <= W && w <= H);
        const big = this.blocks().flatMap(b => b.panels).filter(p => !fits(p.width, p.height));
        if (!big.length) return '';
        const names = [...new Set(big.map(p => p.id))].join(', ');
        return ` Heads-up: ${names} ${big.length === 1 ? 'is' : 'are'} bigger than your ${bed.w} × ${bed.h} mm laser bed — set your bed in Cut files, or split ${big.length === 1 ? 'it' : 'them'} with a splice joint.`;
    }

    /** @private */
    example() {
        return this.blueprint?.id === 'shelf' ? '80 cm tall, 3 boards' : this.blueprint?.id === 'stool' ? '45 cm tall' : '400 x 250 x 200';
    }
}
