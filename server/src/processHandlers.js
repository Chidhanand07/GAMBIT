// @ts-check
/**
 * Process-level signals and fatal errors (NODE-07, NODE-19). SIGTERM / SIGINT
 * start the graceful shutdown; an uncaught exception or an unhandled rejection
 * is logged and ends the process with exit code 1, so the platform restarts a
 * clean one instead of running on in an unknown state.
 */

/** @type {WeakSet<object>} */
const registered = new WeakSet();

/**
 * Install the handlers once per process object.
 * @param {{ run: (signal: string) => Promise<void>, fatal: (error: unknown) => Promise<void> }} shutdown
 * @param {Pick<NodeJS.Process, 'on'>} [proc]
 */
function registerProcessHandlers(shutdown, proc = process) {
    if (registered.has(proc)) return;
    registered.add(proc);
    for (const signal of ['SIGTERM', 'SIGINT']) proc.on(signal, () => void shutdown.run(signal));
    proc.on('uncaughtException', (error) => void shutdown.fatal(error));
    proc.on('unhandledRejection', (reason) => void shutdown.fatal(reason));
}

module.exports = { registerProcessHandlers };
