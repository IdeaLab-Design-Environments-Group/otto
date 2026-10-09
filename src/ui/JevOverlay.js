/**
 * @fileoverview JevOverlay — Jev, built into the canvas.
 *
 * No button, no side panel: Jev is part of the workspace.
 *
 *   ┌ canvas ───────────────────────────────────────────────┐
 *   │ Jev  Open box  ● Base ─ ● Front ─ ○ Right …   ✓ No problems ⋯ │  plan strip
 *   │                                                       │
 *   │   ┌──────┐┌ ─ ─ ─ ┐   ← ghost of the next block       │
 *   │   │ base ││ front │     (JevPreviewPass draws it)     │
 *   │   └──────┘└ ─ ─ ─ ┘                                   │
 *   │        ┌ Front wall · finger joint ─────────┐         │  card pinned
 *   │        │ teeth square the corner            │         │  under the ghost
 *   │        │ [Apply ⏎] [Other joint] [Skip]  ✕  │         │
 *   │        └────────────────────────────────────┘         │
 *   │  Jev: Open box: 300 × 200 × 150 …        (last line)  │
 *   │  [ Ask Jev… ]                                       │  command bar
 *   └───────────────────────────────────────────────────────┘
 *
 * All decisions live in {@link JevSession}; this draws it and forwards
 * clicks. Text goes through textContent, never innerHTML.
 *
 * @module ui/JevOverlay
 */
import { Component } from './Component.js';
import { EVENTS } from '../events/EventBus.js';
import { POLICIES } from '../jev/policy.js';
import { checkDesign } from '../jev/queries.js';
import { describeStep } from '../jev/format.js';
import { ghostOf, union } from '../jev/ghost.js';

const STARTERS = ['Build a box', 'Build a shelf with 3 boards', 'Build a stool'];
const CARD_GAP = 14;       // px between the ghost and its card
const STRIP_BOTTOM = 72;   // px from the top kept for the plan strip

export class JevOverlay extends Component {
    /**
     * @param {HTMLElement} container - Inside the canvas container (positioned over the canvas).
     * @param {Object} deps
     * @param {import('../core/SceneContext.js').SceneContext} deps.context
     * @param {import('../jev/JevSession.js').JevSession} deps.session
     * @param {import('../controllers/ViewportController.js').ViewportController} deps.viewportController
     * @param {import('../controllers/InteractionState.js').InteractionState} deps.interaction
     * @param {() => void} deps.requestRender - Repaint the canvas (the ghost is drawn there).
     * @param {(box: Object, inset: Object) => void} [deps.fitToBounds] - Bring a world box into view.
     * @param {(filename: string, text: string) => void} [deps.download]
     */
    constructor(container, { context, session, viewportController, interaction, requestRender, fitToBounds = () => {}, download = downloadLog }) {
        super(container);
        this.context = context;
        this.session = session;
        this.vc = viewportController;
        this.interaction = interaction;
        this.requestRender = requestRender;
        this.fitToBounds = fitToBounds;
        this.download = download;
        this.pending = false;
        this.minimized = false;
        this.menuOpen = false;
        this.checkOpen = false;
        this.detailsOpen = false;
        this.dismissedLine = null;
        this.ghost = null;
        this.ghostFor = null;

        session.onChange(() => this.scheduleUpdate());
        for (const event of [EVENTS.HISTORY_CHANGED, EVENTS.JOINTS_CHANGED, EVENTS.SHAPE_ADDED, EVENTS.SHAPE_REMOVED,
            EVENTS.SHAPE_UPDATED, EVENTS.PARAM_CHANGED, EVENTS.TAB_SWITCHED, EVENTS.SCENE_LOADED]) {
            this.subscribe(event, () => {
                this.session.syncPlan();
                this.scheduleUpdate();
            });
        }
        this.subscribe(EVENTS.VIEWPORT_CHANGED, () => this.placeCard());

        this.onKeyDown = (e) => this.handleKey(e);
        document.addEventListener('keydown', this.onKeyDown);
    }

    /** createElement, but aria-* and role become attributes (they are not element properties). */
    el(tag, attrs = {}, content = null) {
        const props = {}, attributes = {};
        for (const [k, v] of Object.entries(attrs)) (k.startsWith('aria-') || k === 'role' ? attributes : props)[k] = v;
        const node = this.createElement(tag, props, content);
        for (const [k, v] of Object.entries(attributes)) node.setAttribute(k, v);
        return node;
    }

    // ---- skeleton (built once, so typed text survives updates) -----------------

    render() {
        this.container.innerHTML = '';
        this.container.classList.add('jev');

        this.strip = this.el('div', { class: 'jev-strip', role: 'region', 'aria-label': 'Jev build plan' });
        this.card = this.el('div', { class: 'jev-card', role: 'region', 'aria-label': 'Jev proposal' });
        this.dock = this.el('div', { class: 'jev-dock' });
        this.line = this.el('div', { class: 'jev-line', role: 'status', 'aria-live': 'polite' });

        const form = this.el('form', { class: 'jev-bar' });
        this.input = this.el('input', {
            class: 'jev-bar__input', type: 'text', placeholder: 'Ask Jev… e.g. "a stool 45 cm tall"',
            'aria-label': 'Ask Jev'
        });
        this.nextButton = this.el('button', { class: 'jev-btn', type: 'button', title: 'Propose the next block' }, 'Next block');
        this.nextButton.addEventListener('click', () => this.act(() => this.session.send('next')));
        const hide = this.el('button', { class: 'jev-icon', type: 'button', title: 'Hide Jev', 'aria-label': 'Hide Jev' }, '–');
        hide.addEventListener('click', () => this.setMinimized(true));
        form.append(this.input, this.nextButton, hide);
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = this.input.value.trim();
            if (!text || this.busy) return;
            this.input.value = '';
            this.act(() => this.session.send(text));
        });
        this.dock.append(this.line, form);

        this.pill = this.el('button', { class: 'jev-pill', type: 'button', 'aria-label': 'Show Jev' }, 'Jev');
        this.pill.addEventListener('click', () => this.setMinimized(false));

        this.container.append(this.strip, this.card, this.dock, this.pill);
        this.update();
    }

    // ---- state -------------------------------------------------------------------

    get busy() {
        return this.session.state === 'thinking';
    }

    get shown() {
        return [...this.session.proposals.values()].find(p => p.status === 'shown') || null;
    }

    setMinimized(min) {
        this.minimized = min;
        this.update();
        if (!min) this.input?.focus();
    }

    /** Run a session action, then bring the new block into view. */
    async act(action) {
        await action();
        this.update();
        const scene = this.context.scene;
        const shapes = scene?.shapeStore.getResolved?.() ?? [];
        let box = null;
        for (const s of shapes) box = union(box, s.getBounds());
        box = union(box, this.ghost?.bounds ?? null);
        if (box) this.fitToBounds(box, { top: STRIP_BOTTOM - 40, bottom: this.spaceBelow() });
    }

    scheduleUpdate() {
        if (this.pending) return;
        this.pending = true;
        requestAnimationFrame(() => { this.pending = false; this.update(); });
    }

    update() {
        if (!this.strip) return;
        this.container.classList.toggle('is-minimized', this.minimized);
        this.updateGhost();
        this.renderStrip();
        this.renderCard();
        this.renderLine();
        this.input.disabled = this.busy;
        const plan = this.session.plan;
        this.nextButton.hidden = !plan || Boolean(this.shown) || plan.steps.every(st => st.done);
        this.nextButton.disabled = this.busy;
    }

    /** @private Hand the shown proposal's ghost to the canvas. */
    updateGhost() {
        const p = this.minimized ? null : this.shown;
        const scene = this.context.scene;
        if (p !== this.ghostFor || (p && !this.ghost)) {
            this.ghostFor = p;
            this.detailsOpen = false;
            this.ghost = p && scene ? ghostOf(p, scene) : null;
        }
        this.interaction.jevPreview = this.ghost;
        this.requestRender();
    }

    // ---- plan strip ---------------------------------------------------------------

    renderStrip() {
        const s = this.strip;
        s.innerHTML = '';
        const plan = this.session.plan;

        s.appendChild(this.el('span', { class: 'jev-strip__brand' }, 'Jev'));
        if (plan) {
            s.appendChild(this.el('span', { class: 'jev-strip__goal', title: plan.goal }, plan.goal.replace(/ \(.*\)$/, '')));
            const list = this.el('ol', { class: 'jev-steps' });
            const current = plan.steps.findIndex(x => !x.done);
            plan.steps.forEach((step, i) => {
                const state = step.done ? 'is-done' : i === current ? 'is-current' : '';
                const li = this.el('li', { class: `jev-step ${state}`, title: step.done ? `${step.title} (done)` : step.title });
                li.appendChild(this.el('span', { class: 'jev-step__dot', 'aria-hidden': 'true' }));
                li.appendChild(this.el('span', { class: 'jev-step__label' }, step.title));
                if (step.done) li.appendChild(this.el('span', { class: 'visually-hidden' }, ' (done)'));
                list.appendChild(li);
            });
            s.appendChild(list);
        } else {
            s.appendChild(this.el('span', { class: 'jev-strip__hint' }, 'builds your design with you, block by block'));
        }

        s.appendChild(this.el('span', { class: 'jev-strip__spacer' }));
        s.appendChild(this.renderCheck());

        const more = this.el('button', { class: 'jev-icon', type: 'button', 'aria-label': 'Jev settings', 'aria-expanded': String(this.menuOpen) }, '⋯');
        more.addEventListener('click', () => { this.menuOpen = !this.menuOpen; this.renderStrip(); });
        s.appendChild(more);
        if (this.menuOpen) s.appendChild(this.renderMenu());
    }

    /** @private The live design check (the "lens"): problems after every change. */
    renderCheck() {
        const scene = this.context.scene;
        const wrap = this.el('span', { class: 'jev-check' });
        if (!scene || scene.shapeStore.getAll().length === 0) return wrap;
        let problems;
        try {
            problems = checkDesign(scene).problems;
        } catch (error) {
            problems = [{ message: `The check failed: ${error.message}` }];
        }
        if (problems.length === 0) {
            wrap.appendChild(this.el('span', { class: 'jev-check__ok' }, '✓ No problems'));
            return wrap;
        }
        const button = this.el('button', { class: 'jev-check__warn', type: 'button', 'aria-expanded': String(this.checkOpen) },
            `⚠ ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
        button.addEventListener('click', () => { this.checkOpen = !this.checkOpen; this.renderStrip(); });
        wrap.appendChild(button);
        if (this.checkOpen) {
            const list = this.el('ul', { class: 'jev-pop jev-check__list' });
            for (const p of problems.slice(0, 6)) list.appendChild(this.el('li', {}, p.message));
            if (problems.length > 6) list.appendChild(this.el('li', {}, `… and ${problems.length - 6} more`));
            wrap.appendChild(list);
        }
        return wrap;
    }

    /** @private Settings: policy, log export. */
    renderMenu() {
        const menu = this.el('div', { class: 'jev-pop jev-menu' });
        const label = this.el('label', { class: 'jev-menu__row' }, 'Jev may apply by itself:');
        const select = this.el('select', { class: 'jev-menu__select' });
        for (const [id, p] of Object.entries(POLICIES)) select.appendChild(this.el('option', { value: id }, p.label));
        select.value = this.session.policyName;
        select.addEventListener('change', () => this.session.setPolicy(select.value));
        label.appendChild(select);
        menu.appendChild(label);
        const exportLog = this.el('button', { class: 'jev-link', type: 'button' }, 'Export session log (.jsonl)');
        exportLog.addEventListener('click', () => this.download(`${this.session.log.meta.sessionId}.jsonl`, this.session.log.toJSONL()));
        menu.appendChild(exportLog);
        return menu;
    }

    // ---- proposal card --------------------------------------------------------------

    renderCard() {
        const c = this.card;
        c.innerHTML = '';
        const p = this.minimized ? null : this.shown;
        c.hidden = !p;
        if (!p) return;

        const [head, ...rest] = p.title.split(': ');
        const title = rest.length ? rest.join(': ') : head;
        const top = this.el('div', { class: 'jev-card__top' });
        if (rest.length) top.appendChild(this.el('span', { class: 'jev-card__count' }, head));
        const close = this.el('button', { class: 'jev-icon', type: 'button', 'aria-label': 'Reject this block', title: 'Not this' }, '✕');
        close.addEventListener('click', () => this.act(() => this.session.reject(p.id)));
        top.appendChild(close);
        c.appendChild(top);
        c.appendChild(this.el('h3', { class: 'jev-card__title' }, title.replace(' — ', ' · ')));
        if (p.why) c.appendChild(this.el('p', { class: 'jev-card__why' }, p.why));

        const { newProblems = [] } = p.preview || {};
        for (const f of newProblems) c.appendChild(this.el('p', { class: 'jev-card__problem' }, `⚠ ${f.message}`));

        const actions = this.el('div', { class: 'jev-card__actions' });
        const apply = this.el('button', { class: 'jev-btn jev-btn--primary', type: 'button', disabled: this.busy }, 'Apply');
        apply.appendChild(this.el('kbd', {}, '⏎'));
        apply.addEventListener('click', () => this.act(() => this.session.accept(p.id)));
        actions.appendChild(apply);
        for (const alt of p.alternatives || []) {
            const b = this.el('button', { class: 'jev-btn', type: 'button', disabled: this.busy }, alt);
            b.addEventListener('click', () => this.act(() => this.session.reject(p.id, alt)));
            actions.appendChild(b);
        }
        const toggle = this.el('button', { class: 'jev-link jev-card__more', type: 'button', 'aria-expanded': String(this.detailsOpen) },
            this.detailsOpen ? 'Hide steps' : `${p.steps.length} step${p.steps.length === 1 ? '' : 's'}`);
        toggle.addEventListener('click', () => { this.detailsOpen = !this.detailsOpen; this.renderCard(); });
        actions.appendChild(toggle);
        c.appendChild(actions);

        if (this.detailsOpen) {
            const steps = this.el('ul', { class: 'jev-card__steps' });
            for (const s of p.steps) steps.appendChild(this.el('li', {}, describeStep(s)));
            c.appendChild(steps);
        }
        this.placeCard();
    }

    /** @private Screen px to keep free under the design: the card (when shown) and the command bar. */
    spaceBelow() {
        const H = this.container.clientHeight;
        const dockTop = this.dock.offsetTop || H - 60;
        const card = this.card.hidden ? 0 : this.card.offsetHeight + CARD_GAP;
        return Math.max(0, H - dockTop + card - 30);
    }

    /** @private Pin the card under the ghost (or above it when there is no room), inside the canvas. */
    placeCard() {
        if (!this.card || this.card.hidden) return;
        const box = this.ghost?.bounds;
        const W = this.container.clientWidth;
        const floor = (this.dock.offsetTop || this.container.clientHeight - 60) - CARD_GAP;
        const cw = this.card.offsetWidth, ch = this.card.offsetHeight;
        let x = (W - cw) / 2, y = floor - ch;
        if (box) {
            const a = this.vc.worldToScreen(box.x, box.y);
            const b = this.vc.worldToScreen(box.x + box.width, box.y + box.height);
            x = (a.x + b.x) / 2 - cw / 2;
            y = b.y + CARD_GAP;
            if (y + ch > floor && a.y - ch - CARD_GAP >= STRIP_BOTTOM) y = a.y - ch - CARD_GAP;
        }
        x = Math.max(12, Math.min(W - cw - 12, x));
        y = Math.max(STRIP_BOTTOM, Math.min(floor - ch, y));
        this.card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }

    // ---- Jev's latest line, questions, starters ------------------------------------

    renderLine() {
        const l = this.line;
        l.innerHTML = '';
        const items = this.session.transcript;
        const question = [...items].reverse().find(t => t.kind === 'question' && t.open);
        const lastSaid = [...items].reverse().find(t => t.kind === 'jev' || t.kind === 'note');

        if (this.busy) {
            l.appendChild(this.el('p', { class: 'jev-line__text is-muted' }, 'Jev is thinking…'));
        } else if (question) {
            l.appendChild(this.el('p', { class: 'jev-line__text' }, question.text));
            l.appendChild(this.chips(question.options || []));
        } else if (items.length === 0) {
            l.appendChild(this.el('p', { class: 'jev-line__text' }, 'Tell me what to build. I will put it together with you one block at a time — a panel and its joints — shown on the canvas before anything changes.'));
            l.appendChild(this.chips(STARTERS));
        } else if (lastSaid && lastSaid !== this.dismissedLine && !this.shown) {
            l.appendChild(this.el('p', { class: 'jev-line__text' }, lastSaid.text));
            const x = this.el('button', { class: 'jev-icon', type: 'button', 'aria-label': 'Dismiss' }, '✕');
            x.addEventListener('click', () => { this.dismissedLine = lastSaid; this.renderLine(); });
            l.appendChild(x);
        }
        l.hidden = l.childNodes.length === 0;
    }

    chips(options) {
        const row = this.el('div', { class: 'jev-chips' });
        for (const option of options) {
            const b = this.el('button', { class: 'jev-btn', type: 'button', disabled: this.busy }, option);
            b.addEventListener('click', () => this.act(() => this.session.send(option)));
            row.appendChild(b);
        }
        return row;
    }

    // ---- keyboard ----------------------------------------------------------------------

    /** ⏎ applies the shown block — unless you are typing, drawing or joining. */
    handleKey(e) {
        const p = this.shown;
        if (e.key !== 'Enter' || !p || this.minimized || this.busy || e.defaultPrevented) return;
        const t = e.target;
        const typing = t?.closest?.('input, textarea, select, button, [contenteditable="true"], .CodeMirror, .blocklyWidgetDiv, [role="dialog"]');
        if (typing || this.interaction.isPathDrawing || this.interaction.jointToolFirst) return;
        e.preventDefault();
        this.act(() => this.session.accept(p.id));
    }

    unmount() {
        document.removeEventListener('keydown', this.onKeyDown);
        super.unmount();
    }
}

function downloadLog(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/x-ndjson' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
