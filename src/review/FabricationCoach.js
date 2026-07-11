/**
 * @fileoverview FabricationCoach — the review pipeline that turns a scene
 * summary into actionable design feedback via Gemini.
 *
 * This is the "brain" half of the review module: {@link GeminiProvider} is
 * transport-only, and {@link module:review/SceneSummary} distils the scene.
 * This class owns the *task*: it frames Gemini as a digital-fabrication design
 * coach, asks for structured JSON findings, and validates them into a stable
 * shape the UI can render without guessing.
 *
 * The persona mirrors Otto's purpose — teaching parametric design for digital
 * fabrication (laser cutting, CNC, 3D-printed jigs). So the coach flags the
 * things that actually bite a student at the machine: joints thinner than the
 * material, dimensions that should be parameters but are hard-coded, missing
 * relationships between pieces, and "what could go wrong" when the design is
 * fabricated — the same spirit as the classroom AI-teacher feedback loop.
 */
import { buildSceneSummary, sceneSummaryToText } from './SceneSummary.js';

/** Allowed finding severities, most to least urgent. Used to validate + sort. */
export const SEVERITIES = ['error', 'warning', 'info', 'praise'];

/** Persona + task framing sent as Gemini's systemInstruction. */
export const SYSTEM_INSTRUCTION = [
    'You are the Fabrication Coach inside Otto, a 2.5D parametric design tool',
    'used to teach digital fabrication (laser cutting, CNC routing, 3D-printed',
    'jigs) to students. You are given a description of the student\'s current',
    'design: its parameters, its shapes with dimensions in millimetres, which',
    'dimensions are driven by parameters, and optionally the AQUI source.',
    '',
    'Give concise, specific, encouraging coaching a teacher would give before',
    'the student sends the design to a machine. Prioritise:',
    '  1. Fabrication problems: features thinner than typical material,',
    '     joints/tabs that will be loose or fragile, pieces with no depth,',
    '     dimensions that seem physically implausible.',
    '  2. Parametric quality: hard-coded numbers that should be parameters,',
    '     repeated values that should share one parameter, missing relationships',
    '     between pieces that ought to move together.',
    '  3. "What could go wrong" when this is actually cut or printed.',
    '',
    'Base every point on the numbers you are given — never invent shapes or',
    'values that are not in the description. If the design is genuinely sound,',
    'say so with a short praise finding rather than inventing problems.'
].join('\n');

/**
 * The output contract, restated in the user prompt. Kept next to the parser so
 * the two never drift.
 */
const OUTPUT_CONTRACT = [
    'Respond with ONLY a JSON object of the form:',
    '{ "findings": [ { "severity": "error|warning|info|praise",',
    '  "title": "<short headline>", "detail": "<one or two sentences>",',
    '  "suggestion": "<concrete fix, or empty>" } ] }',
    'Return at most 6 findings, most important first. No prose outside the JSON.'
].join('\n');

export class FabricationCoach {
    /**
     * @param {import('./GeminiProvider.js').GeminiProvider} provider
     */
    constructor(provider) {
        this.provider = provider;
    }

    /** @returns {boolean} True when the underlying provider has a real key. */
    isConfigured() {
        return !!this.provider && this.provider.isConfigured();
    }

    /**
     * Review a scene and return validated findings.
     *
     * @param {Object} sceneInput  Passed straight to {@link buildSceneSummary}
     *   (`{ shapes, parameters, code }`).
     * @returns {Promise<{findings: Array, summary: Object}>}
     */
    async review(sceneInput) {
        const summary = buildSceneSummary(sceneInput);

        if (summary.counts.shapes === 0) {
            // Nothing on the canvas — answer locally instead of spending a call.
            return {
                summary,
                findings: [{
                    severity: 'info',
                    title: 'Nothing to review yet',
                    detail: 'The canvas is empty. Add a shape or two and ask the '
                        + 'coach again for feedback on your design.',
                    suggestion: ''
                }]
            };
        }

        const prompt = `${sceneSummaryToText(summary)}\n\n${OUTPUT_CONTRACT}`;
        const raw = await this.provider.generateJSON(prompt, {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.3,
            maxOutputTokens: 1024
        });

        return { summary, findings: parseFindings(raw) };
    }
}

/**
 * Validate and normalise a raw Gemini response into a clean findings array.
 * Tolerant of the common shape drifts (bare array, unknown severity, missing
 * fields) so a slightly-off model response still renders instead of throwing.
 *
 * Pure and exported for unit testing.
 *
 * @param {any} raw  Parsed JSON from Gemini.
 * @returns {Array<{severity: string, title: string, detail: string, suggestion: string}>}
 */
export function parseFindings(raw) {
    const list = Array.isArray(raw) ? raw
        : Array.isArray(raw?.findings) ? raw.findings
        : [];

    const findings = [];
    for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const title = typeof item.title === 'string' ? item.title.trim() : '';
        const detail = typeof item.detail === 'string' ? item.detail.trim() : '';
        // A finding with neither a title nor detail carries no information.
        if (!title && !detail) continue;

        const severity = SEVERITIES.includes(item.severity) ? item.severity : 'info';
        const suggestion = typeof item.suggestion === 'string' ? item.suggestion.trim() : '';
        findings.push({ severity, title: title || 'Note', detail, suggestion });
    }

    // Most urgent first; stable within a severity (model order preserved).
    findings.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
    return findings;
}
