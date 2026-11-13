/**
 * src/shutdown.js — graceful shutdown on SIGTERM [SHUTDOWN] (NODE-19).
 */
const { createShutdown, DEFAULT_DRAIN_MS } = require('../src/shutdown');

function setup({ httpCloses = true } = {}) {
    const calls = [];
    const step = (name) => jest.fn(async () => calls.push(name));
    const deps = {
        readiness: { startDraining: jest.fn(() => calls.push('readiness 503')) },
        stopTimers: jest.fn(() => calls.push('stop timers')),
        notifyClients: jest.fn(() => calls.push('notify clients')),
        closeSockets: step('io.close'),
        closeHttp: httpCloses ? step('http close') : jest.fn(() => new Promise(() => {})),
        closeRedis: step('redis quit'),
        flushLogs: step('flush logs'),
        exit: jest.fn((code) => calls.push(`exit ${code}`)),
        drainMs: 1000,
    };
    return { calls, deps, shutdown: createShutdown(deps) };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('the drain window is named and fits inside a typical 30 s platform drain', () => {
    expect(DEFAULT_DRAIN_MS).toBeLessThan(30_000);
});

test('SIGTERM: stop being ready, stop timers, tell clients, close sockets, close HTTP, quit Redis, flush logs, exit 0 — in that order', async () => {
    const { calls, shutdown } = setup();
    await shutdown.run('SIGTERM');
    expect(calls).toEqual([
        'readiness 503',
        'stop timers',
        'notify clients',
        'io.close',
        'http close',
        'redis quit',
        'flush logs',
        'exit 0',
    ]);
});

test('a second signal does not start a second shutdown', async () => {
    const { deps, shutdown } = setup();
    await Promise.all([shutdown.run('SIGTERM'), shutdown.run('SIGINT')]);
    expect(deps.closeSockets).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledTimes(1);
});

test('if in-flight work does not finish within the drain window, the process exits 1 anyway', async () => {
    const { deps, shutdown } = setup({ httpCloses: false });
    const done = shutdown.run('SIGTERM');
    await jest.advanceTimersByTimeAsync(999);
    expect(deps.exit).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(deps.exit).toHaveBeenCalledWith(1);
    void done;
});

test('a step that throws is logged and the rest still runs', async () => {
    const { calls, deps, shutdown } = setup();
    deps.closeRedis.mockImplementationOnce(async () => {
        throw new Error('already closed');
    });
    await shutdown.run('SIGTERM');
    expect(calls).toEqual(expect.arrayContaining(['flush logs', 'exit 0']));
});

test('a fatal error (uncaught exception, unhandled rejection) logs and exits 1 for a restart', async () => {
    const { deps, shutdown } = setup();
    await shutdown.fatal(new Error('boom'));
    expect(deps.flushLogs).toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(1);
});
