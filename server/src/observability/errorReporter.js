// @ts-check
/**
 * Error tracking port (SEC-12). The paths that must raise an alert (a fatal
 * process error, an HTTP 500, a socket handler's internal_error, a failed
 * token verification, a rating function error, a game result the outbox
 * cannot persist) call `reportError(error, context)` next to their log line.
 *
 * The default reporter does nothing: logs stay the source of truth. The
 * composition root installs a real one (`setErrorReporter`), today the generic
 * webhook in clients/webhookErrorReporter.js when `ERROR_WEBHOOK_URL` is set.
 * A hosted tracker (Sentry and the like) needs a dependency and is deferred
 * (ADR F-069); it would be one more implementation of this port.
 *
 * Like the logger this is process-wide: every layer may report, and none of
 * them needs the reporter passed through its factory.
 */

/**
 * @typedef {'error' | 'fatal'} ReportLevel
 * @typedef {{ level?: ReportLevel, where: string } & Record<string, unknown>} ReportContext
 *   `where`: the code path (e.g. 'http', 'socket:make_move', 'process'); other keys are plain data
 * @typedef {object} ErrorReporter
 * @property {(error: unknown, context: ReportContext) => Promise<void>} report must not throw
 */

/** @type {ErrorReporter} */
const noopErrorReporter = Object.freeze({ report: async () => {} });

/** @type {ErrorReporter} */
let current = noopErrorReporter;

/**
 * Install the reporter (composition root, tests). `undefined` restores the no-op.
 * @param {ErrorReporter | undefined} reporter
 */
function setErrorReporter(reporter) {
    current = reporter ?? noopErrorReporter;
}

/**
 * Report an error. Never rejects, so a caller may `await` it (the fatal path,
 * before exiting) or let it run (`void reportError(...)`).
 * @param {unknown} error
 * @param {ReportContext} context
 * @returns {Promise<void>}
 */
async function reportError(error, context) {
    try {
        await current.report(error, context);
    } catch {
        // A broken reporter must not break the path that is already failing.
    }
}

module.exports = { noopErrorReporter, setErrorReporter, reportError };
