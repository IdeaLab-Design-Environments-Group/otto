/**
 * @fileoverview Policies — how much Jev may do without asking (Strategy).
 * The policy in use is logged with every decision: it is a study variable.
 *
 *   conservative  every proposal waits for the user
 *   balanced      only low-risk fixes apply themselves: every step 'low',
 *                 the dry run removes a problem and adds none
 *   autopilot     anything that adds no problem applies itself, except
 *                 removals (always asked)
 *
 * @module jev/policy
 */
import { proposalRisk } from './actions.js';

export const POLICIES = {
    conservative: {
        label: 'Ask every time',
        decide: () => 'confirm'
    },
    balanced: {
        label: 'Auto-apply small fixes',
        decide: (proposal) => (proposalRisk(proposal.steps) === 'low'
            && proposal.preview.newProblems.length === 0
            && proposal.preview.fixedProblems.length > 0 ? 'auto' : 'confirm')
    },
    autopilot: {
        label: 'Autopilot (asks only for removals)',
        decide: (proposal) => (proposalRisk(proposal.steps) !== 'destructive'
            && proposal.preview.newProblems.length === 0 ? 'auto' : 'confirm')
    }
};

export const DEFAULT_POLICY = 'balanced';
