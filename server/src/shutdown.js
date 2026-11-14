// @ts-check
/**
 * Graceful shutdown (NODE-19). On SIGTERM: report not-ready, stop the timers,
 * tell connected clients, close Socket.IO and HTTP (in-flight requests finish),
 * quit Redis, flush logs, exit 0. If that takes longer than the drain window
 * the process exits 1 anyway, before the platform kills it.
 *
 * A fatal error (uncaught exception, unhandled rejection) is logged and the
 * process exits 1 so the platform restarts a clean one (NODE-07).
 */
const { log } = require('./observability/log');
const { reportError } = require('./observability/errorReporter');

/** Railway sends SIGTERM and kills after its drain window (30 s unless configured); stay well inside. */
const DEFAULT_DRAIN_MS = 20_000;

/**
 * @typedef {object} ShutdownDeps
 * @property {{ startDraining: () => void }} readiness
 * @property {() => void} stopTimers matchmaking and clock intervals
 * @property {() => void} notifyClients tell sockets the server is going away
 * @property {() => Promise<unknown>} closeSockets
 * @property {() => Promise<unknown>} closeHttp
 * @property {() => Promise<unknown>} closeRedis
 * @property {() => Promise<unknown>} flushLogs
 * @property {(code: number) => void} exit
 * @property {number} [drainMs]
 */

/**
 * Run `step`, logging (not throwing) a failure so the next step still runs.
 * @param {string} name
 * @param {() => unknown} step
 */
async function attempt(name, step) {
    try {
        await step();
    } catch (e) {
        log.error(`[shutdown] ${name} failed:`, /** @type {Error} */ (e)?.message ?? e);
    }
}

/**
 * @param {ShutdownDeps} deps
 */
function createShutdown(deps) {
    const drainMs = deps.drainMs ?? DEFAULT_DRAIN_MS;
    /** @type {Promise<void> | null} */
    let running = null;

    async function sequence() {
        deps.readiness.startDraining();
        await attempt('stop timers', deps.stopTimers);
        await attempt('notify clients', deps.notifyClients);
        await attempt('close sockets', deps.closeSockets);
        await attempt('close http', deps.closeHttp);
        await attempt('quit redis', deps.closeRedis);
        await attempt('flush logs', deps.flushLogs);
    }

    return {
        /**
         * @param {string} signal
         * @returns {Promise<void>}
         */
        run(signal) {
            if (running) return running;
            log.info(`[shutdown] ${signal}: draining for at most ${drainMs} ms`);
            const hardExit = setTimeout(() => {
                log.error('[shutdown] drain window exceeded; exiting');
                deps.exit(1);
            }, drainMs);
            hardExit.unref?.();
            running = sequence().then(() => {
                clearTimeout(hardExit);
                deps.exit(0);
            });
            return running;
        },
        /**
         * @param {unknown} error
         * @returns {Promise<void>}
         */
        async fatal(error) {
            log.fatal('[process] fatal error, exiting for a restart:', error instanceof Error ? error.stack : error);
            // Awaited (bounded by the reporter's own timeout): the process exits right after.
            await reportError(error, { level: 'fatal', where: 'process' });
            await attempt('flush logs', deps.flushLogs);
            deps.exit(1);
        },
    };
}

module.exports = { createShutdown, DEFAULT_DRAIN_MS };
