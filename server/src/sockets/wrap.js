// @ts-check
/**
 * Crash-safe socket handlers (NODE-07, NODE-08, SEC-09). `wrap` validates the
 * payload against a zod schema, runs the handler and acknowledges the result;
 * nothing a client sends, and nothing a handler throws, can become an
 * unhandled rejection.
 *
 * Ack shape: `{ ok: true }`, or `{ ok: false, error }` where `error` is
 * 'invalid_payload', 'internal_error' or a reason the handler returned.
 */

const INVALID_PAYLOAD = Object.freeze({ ok: false, error: 'invalid_payload' });
const INTERNAL_ERROR = Object.freeze({ ok: false, error: 'internal_error' });
const OK = Object.freeze({ ok: true });

/**
 * @typedef {{ ok: boolean, error?: string }} AckResult
 * @typedef {{ safeParse: (input: unknown) => { success: true, data: any } | { success: false } }} Schema
 */

/**
 * Call the client's ack callback, if it sent one. A throwing callback is ignored.
 * @param {unknown} ack
 * @param {AckResult} result
 */
function acknowledge(ack, result) {
    if (typeof ack !== 'function') return;
    try {
        ack(result);
    } catch {
        // The client is gone or its callback is broken; there is nobody to tell.
    }
}

/**
 * @param {string} event
 * @param {unknown} error
 */
function logFailure(event, error) {
    console.error(`[socket] ${event} failed:`, error instanceof Error ? error.message : error);
}

/** @param {unknown} result */
const isAckResult = (result) => typeof result === 'object' && result !== null && 'ok' in result;

/**
 * Wrap a handler for an event that carries one payload.
 * @template T
 * @param {string} event event name, for the log line
 * @param {Schema} schema
 * @param {(payload: T) => unknown} handler may return an AckResult to report a rejection
 * @returns {(payload?: unknown, ack?: unknown) => Promise<void>}
 */
function wrap(event, schema, handler) {
    return async (payload, ack) => {
        // socket.io passes the ack as the only argument when the client sent no payload.
        const callback = typeof payload === 'function' ? payload : ack;
        const parsed = schema.safeParse(typeof payload === 'function' ? undefined : payload);
        if (!parsed.success) {
            acknowledge(callback, INVALID_PAYLOAD);
            return;
        }
        try {
            const result = await handler(parsed.data);
            acknowledge(callback, isAckResult(result) ? /** @type {AckResult} */ (result) : OK);
        } catch (error) {
            logFailure(event, error);
            acknowledge(callback, INTERNAL_ERROR);
        }
    };
}

/**
 * Wrap a handler for an event without a client payload (`disconnect`).
 * @param {string} event
 * @param {() => unknown} handler
 * @returns {(...args: unknown[]) => Promise<void>}
 */
function guard(event, handler) {
    return async () => {
        try {
            await handler();
        } catch (error) {
            logFailure(event, error);
        }
    };
}

module.exports = { wrap, guard };
