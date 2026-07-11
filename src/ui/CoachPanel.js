/**
 * @fileoverview CoachPanel — the right-panel UI for the AI Fabrication Coach.
 *
 * A student presses "Review my design"; the panel gathers the active scene
 * through {@link SceneContext}, asks {@link FabricationCoach} for feedback, and
 * renders the findings as a severity-coded list. When no Gemini key is
 * configured it shows a BYOK (bring-your-own-key) field so the coach works on
 * the static, no-build app without a config file.
 *
 * All model-provided text is written via `textContent` (never innerHTML), so a
 * response can never inject markup into the page.
 */
import { Component } from './Component.js';
import { createCoach, saveApiKey, loadLlmConfig } from '../review/index.js';

/** Leading glyph per severity, matching the coach's vocabulary. */
const SEVERITY_ICON = { error: '✕', warning: '⚠', info: 'ℹ', praise: '✓' };

export class CoachPanel extends Component {
    /**
     * @param {HTMLElement} container
     * @param {import('../core/SceneContext.js').SceneContext} context
     *   Live accessor for the active tab's shapeStore / parameterStore.
     * @param {Object} [opts]
     * @param {() => string} [opts.getCode]  Returns the current AQUI source, if any.
     */
    constructor(container, context, { getCode = () => '' } = {}) {
        super(container);
        this.context = context;
        this.getCode = getCode;
        /** @type {?import('../review/FabricationCoach.js').FabricationCoach} */
        this.coach = null;
        this.busy = false;
        /** Latest render state: 'idle' | 'loading' | 'findings' | 'error'. */
        this.state = 'idle';
        this.findings = [];
        this.errorMessage = '';
    }

    /** Build (or rebuild after a key change) the coach lazily. */
    async ensureCoach() {
        if (!this.coach) this.coach = await createCoach();
        return this.coach;
    }

    render() {
        this.container.innerHTML = '';
        this.container.classList.add('coach-panel');

        const runButton = this.createElement('button', {
            class: 'btn-coach-run',
            type: 'button',
            disabled: this.busy
        }, this.busy ? 'Reviewing…' : 'Review my design');
        runButton.addEventListener('click', () => this.runReview());
        this.container.appendChild(runButton);

        // Results region — role=status so screen readers announce new findings.
        const results = this.createElement('div', {
            class: 'coach-results',
            role: 'status',
            'data-live': 'polite'
        });
        results.setAttribute('aria-live', 'polite');
        this.container.appendChild(results);
        this.renderResults(results);

        // Refresh the key field's presence against the current config.
        this.renderKeyRow();
    }

    /** Render the BYOK key row only when no key is configured. */
    async renderKeyRow() {
        const config = await loadLlmConfig().catch(() => null);
        // Re-check: render() may have run again while we awaited.
        const existing = this.container.querySelector('.coach-key-row');
        if (existing) existing.remove();

        const configured = config && config.apiKey
            && config.apiKey !== 'YOUR_GEMINI_API_KEY';
        if (configured) return;

        const row = this.createElement('div', { class: 'coach-key-row' });
        const label = this.createElement('label', { class: 'coach-key-label' },
            'Gemini API key (stored in this browser only):');
        const input = this.createElement('input', {
            type: 'password',
            class: 'coach-key-input',
            placeholder: 'Paste your Gemini API key'
        });
        const saveBtn = this.createElement('button', {
            class: 'btn-coach-key',
            type: 'button'
        }, 'Save key');
        saveBtn.addEventListener('click', () => {
            const key = input.value.trim();
            if (!key) return;
            saveApiKey(key);
            this.coach = null; // force rebuild with the new key
            this.render();
        });
        const help = this.createElement('a', {
            class: 'coach-key-help',
            href: 'https://aistudio.google.com/apikey',
            target: '_blank',
            rel: 'noopener'
        }, 'Get a free key');

        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(saveBtn);
        row.appendChild(help);
        this.container.appendChild(row);
    }

    /** Paint the results region for the current state. */
    renderResults(region = this.container.querySelector('.coach-results')) {
        if (!region) return;
        region.innerHTML = '';

        if (this.state === 'idle') {
            region.appendChild(this.createElement('p', { class: 'coach-hint' },
                'Get feedback on your design before you fabricate it.'));
            return;
        }
        if (this.state === 'loading') {
            region.appendChild(this.createElement('p', { class: 'coach-hint' },
                'Asking the coach…'));
            return;
        }
        if (this.state === 'error') {
            region.appendChild(this.createElement('p', { class: 'coach-error' },
                this.errorMessage));
            return;
        }
        // state === 'findings'
        if (this.findings.length === 0) {
            region.appendChild(this.createElement('p', { class: 'coach-hint' },
                'No feedback returned.'));
            return;
        }
        for (const f of this.findings) {
            region.appendChild(this.renderFinding(f));
        }
    }

    /**
     * @param {{severity: string, title: string, detail: string, suggestion: string}} f
     * @returns {HTMLElement}
     */
    renderFinding(f) {
        const item = this.createElement('div', {
            class: `coach-finding coach-finding--${f.severity}`
        });
        const head = this.createElement('div', { class: 'coach-finding__head' });
        head.appendChild(this.createElement('span', {
            class: 'coach-finding__icon', 'aria-hidden': 'true'
        }, SEVERITY_ICON[f.severity] || 'ℹ'));
        head.appendChild(this.createElement('span', { class: 'coach-finding__title' }, f.title));
        item.appendChild(head);

        if (f.detail) {
            item.appendChild(this.createElement('p', { class: 'coach-finding__detail' }, f.detail));
        }
        if (f.suggestion) {
            item.appendChild(this.createElement('p', { class: 'coach-finding__suggestion' },
                `Try: ${f.suggestion}`));
        }
        return item;
    }

    /** Gather the scene, call the coach, and re-render with the result. */
    async runReview() {
        if (this.busy) return;
        this.busy = true;
        this.state = 'loading';
        this.render();

        try {
            const coach = await this.ensureCoach();
            const shapes = this.context.shapeStore.getResolved();
            const parameters = this.context.parameterStore.getAll();
            const code = this.getCode();

            const { findings } = await coach.review({ shapes, parameters, code });
            this.findings = findings;
            this.state = 'findings';
        } catch (err) {
            this.state = 'error';
            this.errorMessage = err?.message || 'The coach could not complete the review.';
        } finally {
            this.busy = false;
            this.render();
        }
    }
}
