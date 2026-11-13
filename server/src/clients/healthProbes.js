// @ts-check
/**
 * Dependency probes for /readyz (NODE-21). Only clients touch the SDKs.
 */

/**
 * @param {{ ping: () => Promise<unknown> }} redis
 * @returns {() => Promise<void>}
 */
function redisProbe(redis) {
    return async () => {
        await redis.ping();
    };
}

/**
 * A minimal round trip to PostgREST: no rows read, only whether it answers.
 * @param {{ from: (table: string) => any }} supabase
 * @returns {() => Promise<void>}
 */
function supabaseProbe(supabase) {
    return async () => {
        const { error } = await supabase.from('profiles').select('id', { head: true }).limit(1);
        if (error) throw new Error(error.message);
    };
}

module.exports = { redisProbe, supabaseProbe };
