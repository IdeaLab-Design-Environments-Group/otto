/**
 * @fileoverview JevSession — Jev's build-up loop.
 *
 * The guide decides (jev/guide/Guide.js); the session carries it out. The
 * guide answers every event with a list of effects:
 *
 *   {say: text}                         a line from Jev
 *   {plan: {goal, steps: [title]}}      set the build plan
 *   {ask: {question, options}}          ask the user, then wait
 *   {propose: {title, why, steps, planStep?, alternatives?}}
 *                                       dry-run on a copy, then the policy
 *                                       shows it (wait) or applies it
 *
 * States (logged for studies):
 *   idle ──send──▶ thinking ──propose / ask──▶ waiting ──accept / reject / answer──▶ thinking
 *   thinking ──nothing to wait for──▶ idle;  any ──guide error──▶ error
 *
 * Jev never edits directly: every change is a proposal checked on a copy of
 * the scene, and only `accept` (or the policy) applies it, as ONE undoable
 * history entry.
 *
 * @module jev/JevSession
 */
import { proposalRisk } from './actions.js';
import { dryRun, buildCommands } from './dryRun.js';
import { POLICIES, DEFAULT_POLICY } from './policy.js';
import { SessionLog } from './SessionLog.js';

/** Auto-applied proposals in a row before Jev stops and lets the user look. */
const MAX_AUTO = 50;

export class JevSession {
    /**
     * @param {Object} deps
     * @param {{scene, history}} deps.context - Live scene + its undo history (SceneContext).
     * @param {Object} deps.guide - Decides what comes next (see jev/guide/Guide.js):
     *   onText(text), onApplied(), onRejected(reason) → effects; progress(scene) → boolean[].
     * @param {string} [deps.policy]
     * @param {SessionLog} [deps.log]
     */
    constructor({ context, guide, policy = DEFAULT_POLICY, log = new SessionLog() }) {
        this.context = context;
        this.guide = guide;
        this.policyName = policy;
        this.log = log;
        this.state = 'idle';
        /** What the overlay shows: [{kind: 'user'|'jev'|'proposal'|'question'|'note', ...}] */
        this.transcript = [];
        this.plan = null;
        this.proposals = new Map();
        this.listeners = new Set();
        this.nextProposal = 1;
        this.log.add('session_start', { policy });
    }

    onChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    setPolicy(name) {
        if (!POLICIES[name]) throw new Error(`Unknown policy '${name}'`);
        this.policyName = name;
        this.log.add('policy_changed', { policy: name });
        this.emit();
    }

    // ---- user actions -------------------------------------------------------

    /** The user says something (a goal, an answer, "next"). */
    async send(text) {
        this.transcript.push({ kind: 'user', text });
        this.log.add('user_msg', { text });
        this.closeQuestions();
        await this.run(() => this.guide.onText(text));
    }

    /** Apply a shown proposal (one undo step), then let Jev continue. */
    async accept(id) {
        const p = this.proposals.get(id);
        if (!p || p.status !== 'shown') return;
        try {
            await this.apply(p);
        } catch (error) {
            this.settle(p, 'failed');
            p.error = error.message;
            this.log.add('proposal_failed', { id, message: error.message });
            this.transcript.push({ kind: 'note', text: `Applying "${p.title}" failed: ${error.message}. Nothing was changed.` });
            this.setState('idle');
            return;
        }
        this.settle(p, 'applied');
        this.log.add('proposal_accepted', { id, waitedMs: Date.now() - p.shownAt });
        await this.run(() => this.guide.onApplied());
    }

    /** Decline a shown proposal, optionally with a reason (e.g. one of its alternatives). */
    async reject(id, reason = '') {
        const p = this.proposals.get(id);
        if (!p || p.status !== 'shown') return;
        this.settle(p, 'rejected');
        p.reason = reason;
        this.log.add('proposal_rejected', { id, reason, waitedMs: Date.now() - p.shownAt });
        await this.run(() => this.guide.onRejected(reason));
    }

    /**
     * Re-read plan progress from the design itself: blocks the user builds
     * or undoes by hand tick on and off. Call it whenever the scene changes.
     */
    syncPlan() {
        const flags = this.guide.progress?.(this.context.scene);
        if (!this.plan || !flags?.length) return;
        let changed = false;
        this.plan.steps.forEach((step, i) => {
            if (typeof flags[i] === 'boolean' && step.done !== flags[i]) {
                step.done = flags[i];
                changed = true;
            }
        });
        if (changed) this.emit();
    }

    // ---- carrying out the guide's effects -------------------------------------

    /** @private Ask the guide, perform its effects; continue after auto-applied proposals. */
    async run(decide) {
        this.setState('thinking');
        try {
            let effects = decide();
            for (let auto = 0; ; auto++) {
                const outcome = await this.perform(effects);
                if (outcome !== 'auto-applied') {
                    this.setState(outcome === 'wait' ? 'waiting' : 'idle');
                    return;
                }
                if (auto >= MAX_AUTO) {
                    this.transcript.push({ kind: 'note', text: `Jev paused after ${MAX_AUTO} blocks in a row. Say "next" to go on.` });
                    this.setState('idle');
                    return;
                }
                effects = this.guide.onApplied();
            }
        } catch (error) {
            this.transcript.push({ kind: 'note', text: `Jev stopped: ${error.message}` });
            this.log.add('guide_error', { message: error.message });
            this.setState('error');
        }
    }

    /**
     * @private
     * @returns {Promise<'wait' | 'auto-applied' | 'done'>}
     */
    async perform(effects = []) {
        for (const effect of effects) {
            if (effect.say) {
                this.transcript.push({ kind: 'jev', text: effect.say });
            } else if (effect.plan) {
                this.plan = { goal: String(effect.plan.goal || ''), steps: effect.plan.steps.map(t => ({ title: String(t), done: false })) };
                this.log.add('plan_set', { steps: this.plan.steps.length });
                this.syncPlan();
            } else if (effect.ask) {
                this.transcript.push({ kind: 'question', text: effect.ask.question, options: effect.ask.options || [], open: true });
                this.log.add('question', { question: effect.ask.question });
                return 'wait';
            } else if (effect.propose) {
                return this.propose(effect.propose);
            }
        }
        return 'done';
    }

    /** @private Dry-run a proposal, then show it or let the policy apply it. */
    async propose({ title = 'Step', why = '', steps = [], planStep, alternatives = [] }) {
        const preview = await dryRun(this.context.scene, steps);
        if (!preview.ok) {
            this.log.add('proposal_invalid', { error: preview.error });
            this.transcript.push({ kind: 'note', text: `"${title}" did not check out: ${preview.error}` });
            return 'done';
        }
        // A new proposal replaces any still on screen: they were checked against an older design.
        for (const old of this.proposals.values()) {
            if (old.status === 'shown') {
                this.settle(old, 'superseded');
                this.log.add('proposal_superseded', { id: old.id });
            }
        }
        const id = `p${this.nextProposal++}`;
        const proposal = {
            id, title: String(title), why: String(why), steps, planStep,
            alternatives: alternatives.map(String),
            preview, risk: proposalRisk(steps), status: 'shown', shownAt: Date.now()
        };
        proposal.decision = POLICIES[this.policyName].decide(proposal);
        this.proposals.set(id, proposal);
        this.log.add('proposal_created', { id, steps: steps.length, risk: proposal.risk, decision: proposal.decision, policy: this.policyName, newProblems: preview.newProblems.length, fixedProblems: preview.fixedProblems.length });
        this.transcript.push({ kind: 'proposal', id });

        if (proposal.decision !== 'auto') return 'wait';
        try {
            await this.apply(proposal);
        } catch (error) {
            this.settle(proposal, 'failed');
            proposal.error = error.message;
            this.transcript.push({ kind: 'note', text: `Applying "${proposal.title}" failed: ${error.message}. Nothing was changed.` });
            return 'done';
        }
        this.settle(proposal, 'auto-applied');
        this.log.add('proposal_auto_applied', { id, policy: this.policyName });
        return 'auto-applied';
    }

    /** @private Apply a proposal's steps to the real scene as ONE undo entry (all or nothing). */
    async apply(proposal) {
        const history = this.context.history;
        history.beginBatch(`Jev: ${proposal.title}`);
        try {
            for (const step of proposal.steps) {
                const [command] = buildCommands([step], this.context.scene);
                await history.execute(command);
            }
        } catch (error) {
            history.endBatch();
            await history.undo();
            throw error;
        }
        history.endBatch();
        if (proposal.planStep && this.plan?.steps[proposal.planStep - 1]) this.plan.steps[proposal.planStep - 1].done = true;
    }

    // ---- helpers ----------------------------------------------------------------

    /** @private A proposal leaves the screen: set its status and drop the preview copy of the design. */
    settle(proposal, status) {
        proposal.status = status;
        if (proposal.preview) delete proposal.preview.scene;
    }

    closeQuestions() {
        for (const item of this.transcript) if (item.kind === 'question') item.open = false;
    }

    setState(state) {
        if (this.state !== state) this.log.add('state', { from: this.state, to: state });
        this.state = state;
        this.emit();
    }

    emit() {
        for (const l of this.listeners) {
            try { l(this); } catch (e) { console.error('JevSession listener failed:', e); }
        }
    }
}
