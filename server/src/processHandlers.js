// @ts-check
/**
 * Process-level safety net (NODE-07). Socket handlers are wrapped so they
 * cannot reject (see sockets/wrap.js); this logs anything that still slips
 * through from timers or fire-and-forget chains instead of letting Node's
 * default (exit on an unhandled rejection) take every live game down.
 */
const { log } = require('./observability/log');

/** @type {WeakSet<object>} */
const registered = new WeakSet();

/** @param {unknown} reason */
function logUnhandledRejection(reason) {
    log.error('[process] unhandledRejection:', reason instanceof Error ? reason.stack : reason);
}

/**
 * Install the handlers once per process object.
 * @param {Pick<NodeJS.Process, 'on'>} [proc]
 */
function registerProcessHandlers(proc = process) {
    if (registered.has(proc)) return;
    registered.add(proc);
    proc.on('unhandledRejection', logUnhandledRejection);
}

module.exports = { registerProcessHandlers };
