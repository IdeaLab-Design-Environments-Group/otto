/**
 * @fileoverview FabricationCoach — turns a scene summary into fabrication
 * feedback using Otto's deterministic laser-cutting rules (bed fit, tiny
 * parts, material thickness, kerf). Offline and free; no AI model.
 */
import { buildSceneSummary } from './SceneSummary.js';
import { runFabricationRules } from './FabricationRules.js';

/** Allowed finding severities, most to least urgent. Used to validate + sort. */
export const SEVERITIES = ['error', 'warning', 'info', 'praise'];

export class FabricationCoach {
    /**
     * @param {Object} [opts]
     * @param {Partial<import('./FabricationRules.js').DEFAULT_LASER>} [opts.laser]
     *   Laser bed / material overrides forwarded to the rules.
     */
    constructor({ laser = {} } = {}) {
        this.laser = laser;
    }

    /**
     * Review a scene and return findings, most urgent first.
     * @param {Object} sceneInput  Passed straight to {@link buildSceneSummary}
     *   (`{ shapes, parameters, code }`).
     * @returns {Promise<{findings: Array, summary: Object}>}
     */
    async review(sceneInput) {
        const summary = buildSceneSummary(sceneInput);
        if (summary.counts.shapes === 0) {
            return {
                summary,
                findings: [{
                    severity: 'info',
                    title: 'Nothing to review yet',
                    detail: 'The canvas is empty. Add a shape or two and run the check again.',
                    suggestion: ''
                }]
            };
        }
        const findings = runFabricationRules(summary, this.laser);
        findings.sort((x, y) => SEVERITIES.indexOf(x.severity) - SEVERITIES.indexOf(y.severity));
        return { summary, findings };
    }
}
