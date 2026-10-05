/**
 * @fileoverview ExamplesPanel — the left panel's Examples tab: one card per
 * example program. Opening a card loads the program into the Code tab and
 * runs it (through the injected `onOpen`).
 *
 * @module ui/ExamplesPanel
 */
import { Component } from './Component.js';

export class ExamplesPanel extends Component {
    /**
     * @param {HTMLElement} container
     * @param {Array<{id, title, description, code}>} examples
     * @param {{onOpen: (example: Object) => void}} handlers
     */
    constructor(container, examples, { onOpen }) {
        super(container);
        this.examples = examples;
        this.onOpen = onOpen;
    }

    render() {
        this.container.innerHTML = '';
        const intro = this.createElement('p', { class: 'examples__intro' },
            'Open an example to load it into the Code tab and run it. Then try the 3D view and the Join tool.');
        this.container.appendChild(intro);
        const list = this.createElement('ul', { class: 'examples__list' });
        list.setAttribute('aria-label', 'Example programs');
        for (const example of this.examples) {
            const item = this.createElement('li', { class: 'examples__item' });
            const card = this.createElement('button', { class: 'examples__card', type: 'button', 'data-example': example.id });
            card.appendChild(this.createElement('span', { class: 'examples__title' }, example.title));
            card.appendChild(this.createElement('span', { class: 'examples__description' }, example.description));
            const joints = [...new Set((example.code.match(/^\s*join (\w+)/gm) || []).map(l => l.trim().split(/\s+/)[1]))];
            if (joints.length) card.appendChild(this.createElement('span', { class: 'examples__tags' }, joints.join(' · ')));
            card.addEventListener('click', () => this.onOpen(example));
            item.appendChild(card);
            list.appendChild(item);
        }
        this.container.appendChild(list);
    }
}
