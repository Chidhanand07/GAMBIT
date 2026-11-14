/**
 * src/clients/socketAdapter.js — the adapter's fire-and-forget Redis writes [MULTI-INSTANCE].
 *
 * The Streams adapter persists each disconnecting socket's recovery session with a SET it never
 * awaits. With Redis unreachable that promise rejected unhandled, and an unhandled rejection is
 * fatal (SHUTDOWN): every disconnect during a Redis blip would have restarted the replica.
 */
const { log } = require('../../src/observability/log');
const { handleUnawaitedWrites } = require('../../src/clients/socketAdapter');

// set: persistSession; xadd: heartbeats and responses; publish: responses on the Pub/Sub channel.
test.each(['set', 'xadd', 'publish'])(
    'a failed %s nobody awaits is logged, not an unhandled rejection',
    async (method) => {
        const unhandled = jest.fn();
        process.on('unhandledRejection', unhandled);
        const client = { [method]: jest.fn(() => Promise.reject(new Error('Connection is closed.'))) };
        handleUnawaitedWrites(client);

        client[method]('key', 'value'); // what the adapter does: no await
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));

        process.off('unhandledRejection', unhandled);
        expect(unhandled).not.toHaveBeenCalled();
        expect(log.warn).toHaveBeenCalledWith(`[socket adapter] a Redis ${method} failed:`, 'Connection is closed.');
    },
);

test('a caller that awaits the SET still sees the failure and the arguments pass through', async () => {
    const client = { set: jest.fn(() => Promise.reject(new Error('down'))) };
    handleUnawaitedWrites(client);
    await expect(client.set('k', 'v', 'PX', 5)).rejects.toThrow('down');

    const ok = { set: jest.fn(async () => 'OK') };
    handleUnawaitedWrites(ok);
    await expect(ok.set('k', 'v')).resolves.toBe('OK');
});
