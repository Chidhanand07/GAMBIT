/**
 * src/services/readiness.js — /readyz answers "ready" only when Redis and Supabase answer and the
 * process is not draining [OBSERVABILITY] (NODE-21).
 */
const { createReadiness } = require('../../src/services/readiness');

const ok = async () => {};
const down = async () => {
    throw new Error('ECONNREFUSED');
};
const never = () => new Promise(() => {});

test('both dependencies answer → ready', async () => {
    const r = createReadiness({ probes: { redis: ok, supabase: ok }, timeoutMs: 50 });
    expect(await r.check()).toEqual({ ready: true, checks: { redis: 'ok', supabase: 'ok' } });
});

test('a failing dependency → not ready, and says which', async () => {
    const r = createReadiness({ probes: { redis: down, supabase: ok }, timeoutMs: 50 });
    expect(await r.check()).toEqual({ ready: false, checks: { redis: 'failed', supabase: 'ok' } });
});

test('a dependency that hangs counts as failed after the timeout', async () => {
    const r = createReadiness({ probes: { redis: ok, supabase: never }, timeoutMs: 20 });
    expect(await r.check()).toEqual({ ready: false, checks: { redis: 'ok', supabase: 'timeout' } });
});

test('draining → not ready, without probing anything', async () => {
    const redis = jest.fn(ok);
    const r = createReadiness({ probes: { redis, supabase: ok }, timeoutMs: 50 });
    r.startDraining();
    expect(await r.check()).toEqual({ ready: false, draining: true, checks: {} });
    expect(redis).not.toHaveBeenCalled();
});
