/**
 * src/processHandlers.js — signals start the graceful shutdown; fatal errors exit for a restart
 * [SHUTDOWN] (NODE-07, NODE-19). Was: an unhandled rejection was logged and the process kept running.
 */
const { EventEmitter } = require('events');
const { registerProcessHandlers } = require('../src/processHandlers');

function setup() {
    const shutdown = { run: jest.fn(async () => {}), fatal: jest.fn(async () => {}) };
    const proc = new EventEmitter();
    registerProcessHandlers(shutdown, proc);
    return { shutdown, proc };
}

test.each(['SIGTERM', 'SIGINT'])('%s starts the graceful shutdown', (signal) => {
    const { shutdown, proc } = setup();
    proc.emit(signal);
    expect(shutdown.run).toHaveBeenCalledWith(signal);
});

test('an unhandled rejection is fatal: logged and the process exits for a restart', () => {
    const { shutdown, proc } = setup();
    const reason = new Error('boom');
    proc.emit('unhandledRejection', reason);
    expect(shutdown.fatal).toHaveBeenCalledWith(reason);
});

test('an uncaught exception is fatal', () => {
    const { shutdown, proc } = setup();
    const error = new Error('bug');
    proc.emit('uncaughtException', error);
    expect(shutdown.fatal).toHaveBeenCalledWith(error);
});

test('registering twice on the same process adds one listener per event', () => {
    const shutdown = { run: jest.fn(), fatal: jest.fn() };
    const proc = new EventEmitter();
    registerProcessHandlers(shutdown, proc);
    registerProcessHandlers(shutdown, proc);
    expect(proc.listenerCount('SIGTERM')).toBe(1);
    expect(proc.listenerCount('unhandledRejection')).toBe(1);
});
