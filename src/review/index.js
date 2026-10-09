/**
 * @fileoverview Review module entry point: the rule-based fabrication coach.
 * @module review
 */
import { FabricationCoach } from './FabricationCoach.js';

/**
 * Build a ready-to-use Fabrication Coach.
 * @returns {Promise<FabricationCoach>}
 */
export async function createCoach() {
    return new FabricationCoach();
}

export { FabricationCoach };
