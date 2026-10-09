/**
 * @fileoverview Dry run: apply a proposal's steps to a COPY of the scene and
 * compare Otto's checks before and after — what Jev and the user see before
 * anything is changed for real.
 *
 * @module jev/dryRun
 */
import { Serializer } from '../persistence/Serializer.js';
import { HistoryManager } from '../commands/HistoryManager.js';
import { validateSchema } from '../core/jsonSchemaLite.js';
import { JEV_ACTIONS } from './actions.js';
import { checkDesign } from './queries.js';

const keyOf = (p) => `${p.code}|${p.target ?? ''}`;

/**
 * Check every step's arguments against its action schema.
 * @returns {string[]} problems, empty when all steps are well-formed
 */
export function validateSteps(steps) {
    if (!Array.isArray(steps) || steps.length === 0) return ['a proposal needs at least one step'];
    const errors = [];
    steps.forEach((step, i) => {
        const action = JEV_ACTIONS[step?.action];
        if (!action) {
            errors.push(`step ${i + 1}: unknown action '${step?.action}' (use ${Object.keys(JEV_ACTIONS).join(', ')})`);
            return;
        }
        const r = validateSchema(action.schema, step.args ?? {});
        for (const e of r.errors) errors.push(`step ${i + 1} (${step.action}): ${e.path.replace(/^\$\.?/, '') || 'args'} ${e.message}`);
    });
    return errors;
}

/** Build the commands for steps against `scene` (throws with the step number on failure). */
export function buildCommands(steps, scene) {
    return steps.map((step, i) => {
        try {
            return JEV_ACTIONS[step.action].toCommand(step.args ?? {}, scene);
        } catch (e) {
            throw new Error(`step ${i + 1} (${step.action}): ${e.message}`);
        }
    });
}

/**
 * @param {import('../core/SceneState.js').SceneState} scene - Not modified.
 * @param {Array<{action: string, args: Object}>} steps
 * @returns {Promise<{ok: boolean, error?: string, before: Object, after?: Object,
 *   newProblems: Array, fixedProblems: Array, scene?: Object}>} `scene` is the
 *   copy with the steps applied: what the canvas draws as the ghost.
 */
export async function dryRun(scene, steps) {
    const before = checkDesign(scene);
    const invalid = validateSteps(steps);
    if (invalid.length) return { ok: false, error: invalid.join('; '), before, newProblems: [], fixedProblems: [] };

    const copy = await Serializer.deserializeSceneState(Serializer.serializeSceneState(scene));
    const history = new HistoryManager(copy);
    try {
        // Each step sees the result of the previous one (a joint may name a panel added just before).
        for (let i = 0; i < steps.length; i++) {
            const [command] = buildCommands([steps[i]], copy);
            try {
                await history.execute(command);
            } catch (e) {
                throw new Error(`step ${i + 1} (${steps[i].action}): ${e.message}`);
            }
        }
    } catch (error) {
        return { ok: false, error: error.message, before, newProblems: [], fixedProblems: [] };
    }
    const after = checkDesign(copy);
    const beforeKeys = new Set(before.problems.map(keyOf));
    const afterKeys = new Set(after.problems.map(keyOf));
    return {
        ok: true,
        before,
        after,
        newProblems: after.problems.filter(p => !beforeKeys.has(keyOf(p))),
        fixedProblems: before.problems.filter(p => !afterKeys.has(keyOf(p))),
        scene: copy
    };
}
