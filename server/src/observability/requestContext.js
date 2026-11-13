// @ts-check
/**
 * The id of the HTTP request being served, wherever the code is (NODE-20).
 * `requestLog` runs each request inside `runWithRequestId(req.id, ...)`; the
 * outgoing clients (engine, Supabase) add it as `X-Request-Id`, so one id
 * links our log line to the engine's and the database gateway's. Built on
 * AsyncLocalStorage (node:async_hooks), so the id follows every `await`
 * without being passed through service signatures.
 *
 * Outside an HTTP request (socket events, the clock, the outbox worker) there
 * is no id and no header is added.
 */
const { AsyncLocalStorage } = require('node:async_hooks');

const REQUEST_ID_HEADER = 'X-Request-Id';

/** @type {AsyncLocalStorage<{ requestId: string }>} */
const storage = new AsyncLocalStorage();

/**
 * Run `fn` with `requestId` as the current request id.
 * @template T
 * @param {string} requestId
 * @param {() => T} fn
 * @returns {T}
 */
function runWithRequestId(requestId, fn) {
    return storage.run({ requestId }, fn);
}

/** @returns {string | undefined} the id of the request being served, if any */
function currentRequestId() {
    return storage.getStore()?.requestId;
}

/**
 * `headers` plus `X-Request-Id` when a request is being served (a new object; the input is not changed).
 * @param {Record<string, string>} headers
 * @returns {Record<string, string>}
 */
function withRequestIdHeader(headers) {
    const requestId = currentRequestId();
    return requestId ? { ...headers, [REQUEST_ID_HEADER]: requestId } : headers;
}

module.exports = { REQUEST_ID_HEADER, runWithRequestId, currentRequestId, withRequestIdHeader };
