/**
 * @fileoverview CutFilesPanel — the toolbar's "Cut files" panel: laser
 * settings, what to fix before cutting, a preview of every sheet with a
 * download, the bill of materials, and shapes that will not be cut.
 *
 * Non-modal: it stays open while you edit and follows every change (the
 * plan is rebuilt from the scene on each update).
 *
 * @module ui/CutFilesPanel
 */
import { Component } from './Component.js';
import { EVENTS } from '../events/EventBus.js';
import { buildFabrication } from '../fabrication/FabricationPlan.js';
import { SetFabricationCommand } from '../commands/jointCommands.js';

export class CutFilesPanel extends Component {
    /**
     * @param {import('../core/SceneContext.js').SceneContext} context
     * @param {{button?: HTMLElement, download?: (filename: string, text: string) => void}} [opts]
     */
    constructor(context, { button = null, download = downloadText } = {}) {
        const root = document.createElement('div');
        root.className = 'cut-panel';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-label', 'Cut files');
        root.hidden = true;
        document.body.appendChild(root);
        super(root);
        this.context = context;
        this.button = button;
        this.download = download;
        this.isOpen = false;
        this.pending = false;
        button?.addEventListener('click', () => this.toggle());
        root.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.toggle(false); });
        for (const event of [EVENTS.JOINTS_CHANGED, EVENTS.SHAPE_ADDED, EVENTS.SHAPE_REMOVED, EVENTS.SHAPE_UPDATED,
            EVENTS.SHAPE_MOVED, EVENTS.PARAM_CHANGED, EVENTS.TAB_SWITCHED, EVENTS.SCENE_LOADED]) {
            this.subscribe(event, () => this.scheduleRender());
        }
    }

    toggle(open = !this.isOpen) {
        this.isOpen = open;
        this.container.hidden = !open;
        this.button?.classList.toggle('active', open);
        this.button?.setAttribute('aria-expanded', String(open));
        if (open) {
            this.render();
            this.container.querySelector('button, input')?.focus();
        }
    }

    scheduleRender() {
        if (!this.isOpen || this.pending) return;
        this.pending = true;
        requestAnimationFrame(() => { this.pending = false; this.render(); });
    }

    render() {
        this.container.innerHTML = '';
        if (!this.isOpen) return;
        const scene = this.context.scene;
        if (!scene) return;
        const plan = buildFabrication(scene);
        const el = (tag, cls, text) => this.createElement(tag, cls ? { class: cls } : {}, text);

        const header = el('div', 'cut-panel__header');
        header.appendChild(el('h3', 'cut-panel__title', 'Cut files'));
        const close = this.createElement('button', { class: 'cut-panel__btn', type: 'button' }, '×');
        close.setAttribute('aria-label', 'Close cut files');
        close.addEventListener('click', () => this.toggle(false));
        header.appendChild(close);
        this.container.appendChild(header);

        // ---- settings ----------------------------------------------------------
        const s = plan.settings;
        const form = el('div', 'cut-panel__settings');
        const field = (label, value, patch, step = '1') => {
            const id = `cut-${label.replace(/\W+/g, '-').toLowerCase()}`;
            const l = this.createElement('label', { class: 'cut-panel__label' }, label);
            l.setAttribute('for', id);
            const input = this.createElement('input', { class: 'cut-panel__input', type: 'number', step, value: String(value) });
            input.id = id;
            input.addEventListener('change', () => {
                const v = Number(input.value);
                if (Number.isFinite(v)) this.apply(patch(v));
            });
            form.append(l, input);
        };
        field('Bed width (mm)', s.bed.w, v => ({ bed: { w: v } }), '10');
        field('Bed height (mm)', s.bed.h, v => ({ bed: { h: v } }), '10');
        field('Kerf (mm)', s.kerf, v => ({ kerf: v }), '0.01');
        field('Margin (mm)', s.margin, v => ({ margin: v }));
        field('Gap between parts (mm)', s.gap, v => ({ gap: v }));
        const labelsRow = el('label', 'cut-panel__check');
        const box = this.createElement('input', { type: 'checkbox', checked: s.labels });
        box.addEventListener('change', () => this.apply({ labels: box.checked }));
        labelsRow.append(box, document.createTextNode(' Engrave part names (blue layer)'));
        this.container.append(form, labelsRow);

        // ---- problems ------------------------------------------------------------
        if (plan.findings.length) {
            this.container.appendChild(el('h4', 'cut-panel__section', `Fix before cutting (${plan.findings.length})`));
            const list = el('ul', 'cut-panel__problems');
            for (const f of plan.findings) list.appendChild(el('li', `cut-panel__problem is-${f.severity}`, f.message));
            this.container.appendChild(list);
        }

        // ---- sheets ----------------------------------------------------------------
        const partCount = plan.files.reduce((n, f) => n + f.partIds.length, 0);
        this.container.appendChild(el('h4', 'cut-panel__section',
            plan.files.length ? `${partCount} parts on ${plan.files.length} sheet${plan.files.length === 1 ? '' : 's'}` : 'Nothing to cut yet'));
        if (plan.files.length) {
            const all = this.createElement('button', { class: 'cut-panel__primary', type: 'button' }, `Download all SVGs (${plan.files.length})`);
            all.addEventListener('click', () => plan.files.forEach(f => this.download(f.filename, f.svg)));
            this.container.appendChild(all);
        }
        const sheets = el('div', 'cut-panel__sheets');
        for (const file of plan.files) {
            const card = el('figure', 'cut-panel__sheet');
            const img = this.createElement('img', { class: 'cut-panel__preview', alt: `${file.thickness} sheet: ${file.partIds.join(', ')}` });
            // Preview with a visible stroke (the file itself uses a 0.01 mm hairline).
            img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(file.svg.replace('stroke-width="0.01"', 'stroke-width="1.2"'))}`;
            const caption = el('figcaption', 'cut-panel__caption', `${file.thickness} · ${file.filename.match(/sheet\d+/)[0]} · ${file.partIds.length} parts`);
            const dl = this.createElement('button', { class: 'cut-panel__btn', type: 'button' }, 'Download');
            dl.addEventListener('click', () => this.download(file.filename, file.svg));
            caption.appendChild(dl);
            card.append(img, caption);
            sheets.appendChild(card);
        }
        this.container.appendChild(sheets);

        // ---- bill of materials, skipped ----------------------------------------------------
        if (plan.bom.length) {
            this.container.appendChild(el('h4', 'cut-panel__section', 'Hardware'));
            const list = el('ul', 'cut-panel__bom');
            for (const line of plan.bom) list.appendChild(el('li', null, `${line.qty} × ${line.item}`));
            this.container.appendChild(list);
        }
        if (plan.skipped.length) {
            this.container.appendChild(el('p', 'cut-panel__note', `Not cut (open lines, not panels): ${plan.skipped.join(', ')}`));
        }
    }

    /** Apply a settings patch through the undoable command. */
    async apply(patch) {
        try {
            await this.context.history.execute(new SetFabricationCommand(patch));
        } catch (error) {
            const note = this.createElement('p', { class: 'cut-panel__problem is-error' }, error.message);
            note.setAttribute('role', 'alert');
            this.container.querySelector('.cut-panel__settings')?.after(note);
        }
    }
}

/** Download a text file in the browser. */
export function downloadText(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
