/**
 * src/sockets/wrap.js — every socket handler validates its payload and can
 * never produce an unhandled rejection [S15] (NODE-07, NODE-08).
 */
const { z } = require('zod');
const { wrap, guard } = require('../../src/sockets/wrap');

const schema = z.object({ game_id: z.string() });

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

describe('wrap', () => {
    test('invalid payload: handler is not called and the ack reports invalid_payload', async () => {
        const handler = jest.fn();
        const ack = jest.fn();
        await wrap('make_move', schema, handler)(null, ack);
        expect(handler).not.toHaveBeenCalled();
        expect(ack).toHaveBeenCalledWith({ ok: false, error: 'invalid_payload' });
    });

    test('invalid payload without an ack callback is dropped silently', async () => {
        const handler = jest.fn();
        await expect(wrap('make_move', schema, handler)({ game_id: 7 })).resolves.toBeUndefined();
        expect(handler).not.toHaveBeenCalled();
    });

    test('valid payload: handler gets the parsed data (unknown keys stripped) and the ack is ok', async () => {
        const handler = jest.fn(async () => {});
        const ack = jest.fn();
        await wrap('make_move', schema, handler)({ game_id: 'g1', user_id: 'spoofed' }, ack);
        expect(handler).toHaveBeenCalledWith({ game_id: 'g1' });
        expect(ack).toHaveBeenCalledWith({ ok: true });
    });

    test('a handler result that carries `ok` is acked as-is', async () => {
        const ack = jest.fn();
        await wrap('make_move', schema, async () => ({ ok: false, error: 'illegal_move' }))({ game_id: 'g1' }, ack);
        expect(ack).toHaveBeenCalledWith({ ok: false, error: 'illegal_move' });
    });

    test.each([
        ['rejects', async () => Promise.reject(new Error('boom'))],
        [
            'throws synchronously',
            () => {
                throw new Error('boom');
            },
        ],
    ])('a handler that %s is logged and acked as internal_error, never rethrown', async (_name, handler) => {
        const ack = jest.fn();
        await expect(wrap('make_move', schema, handler)({ game_id: 'g1' }, ack)).resolves.toBeUndefined();
        expect(ack).toHaveBeenCalledWith({ ok: false, error: 'internal_error' });
        expect(console.error).toHaveBeenCalledWith('[socket] make_move failed:', 'boom');
    });

    test('a thrown Supabase-style { message } object is logged by its message', async () => {
        await wrap('make_move', schema, async () => Promise.reject({ message: 'insert failed', code: '23505' }))({
            game_id: 'g1',
        });
        expect(console.error).toHaveBeenCalledWith('[socket] make_move failed:', 'insert failed');
    });

    test('a throwing ack callback cannot escape either', async () => {
        const ack = jest.fn(() => {
            throw new Error('client gone');
        });
        await expect(wrap('make_move', schema, async () => {})({ game_id: 'g1' }, ack)).resolves.toBeUndefined();
    });
});

describe('guard (events without a payload, e.g. disconnect)', () => {
    test('runs the handler and swallows + logs its failure', async () => {
        const handler = jest.fn(async () => {
            throw new Error('redis down');
        });
        await expect(guard('disconnect', handler)('transport close')).resolves.toBeUndefined();
        expect(handler).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalledWith('[socket] disconnect failed:', 'redis down');
    });
});
