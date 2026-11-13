/**
 * src/processHandlers.js — the process-level safety net [S15] (NODE-07).
 */
const { EventEmitter } = require('events');
const { registerProcessHandlers } = require('../src/processHandlers');
const { log } = require('../src/observability/log');

afterEach(() => jest.restoreAllMocks());

test('an unhandled rejection is logged with its stack and does not throw', () => {
    const error = jest.spyOn(log, 'error');
    const proc = new EventEmitter();
    registerProcessHandlers(proc);
    const reason = new Error('boom');
    expect(() => proc.emit('unhandledRejection', reason)).not.toThrow();
    expect(error).toHaveBeenCalledWith('[process] unhandledRejection:', reason.stack);
});

test('a non-Error reason is logged as given', () => {
    const error = jest.spyOn(log, 'error');
    const proc = new EventEmitter();
    registerProcessHandlers(proc);
    proc.emit('unhandledRejection', 'plain reason');
    expect(error).toHaveBeenCalledWith('[process] unhandledRejection:', 'plain reason');
});

test('registering twice on the same process adds one listener', () => {
    const proc = new EventEmitter();
    registerProcessHandlers(proc);
    registerProcessHandlers(proc);
    expect(proc.listenerCount('unhandledRejection')).toBe(1);
});
