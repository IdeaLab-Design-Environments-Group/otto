/**
 * @fileoverview SessionLog — an append-only record of a Jev session for
 * studies: every message, tool call, proposal and decision with a
 * timestamp. Exported as JSON lines; `redact` drops message text and keeps
 * events and timings only.
 *
 * @module jev/SessionLog
 */
export class SessionLog {
    /**
     * @param {{sessionId?: string, participant?: string, condition?: string, now?: () => number}} [meta]
     */
    constructor({ sessionId = `jev-${Date.now()}`, participant = null, condition = null, now = () => Date.now() } = {}) {
        this.meta = { sessionId, participant, condition };
        this.now = now;
        this.events = [];
    }

    /** Record one event. */
    add(type, data = {}) {
        this.events.push({ t: this.now(), type, ...data });
    }

    /** @returns {string} one JSON object per line (meta first). */
    toJSONL({ redact = false } = {}) {
        const strip = (e) => {
            if (!redact) return e;
            const { text, message, reason, question, ...rest } = e;
            return rest;
        };
        return [JSON.stringify({ type: 'meta', ...this.meta }), ...this.events.map(e => JSON.stringify(strip(e)))].join('\n');
    }
}
