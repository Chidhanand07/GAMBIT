// @ts-check
/**
 * Readiness (NODE-21): is this instance able to serve traffic right now?
 * Ready when every dependency probe answers within the timeout and the
 * process is not draining (SIGTERM, see processHandlers).
 */

/**
 * @typedef {Record<string, () => Promise<unknown>>} Probes
 * @typedef {'ok' | 'failed' | 'timeout'} ProbeResult
 */

const TIMEOUT = Symbol('timeout');

/**
 * @param {() => Promise<unknown>} probe
 * @param {number} timeoutMs
 * @returns {Promise<ProbeResult>}
 */
async function run(probe, timeoutMs) {
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    const deadline = new Promise((resolve) => {
        timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
    });
    try {
        const outcome = await Promise.race([probe().then(() => 'ok'), deadline]);
        return outcome === TIMEOUT ? 'timeout' : 'ok';
    } catch {
        return 'failed';
    } finally {
        clearTimeout(timer);
    }
}

/**
 * @param {{ probes: Probes, timeoutMs: number }} deps
 */
function createReadiness({ probes, timeoutMs }) {
    let draining = false;
    return {
        /** Called on SIGTERM: from now on /readyz answers 503 so the platform stops routing here. */
        startDraining() {
            draining = true;
        },
        isDraining: () => draining,
        /** @returns {Promise<{ ready: boolean, draining?: boolean, checks: Record<string, ProbeResult> }>} */
        async check() {
            if (draining) return { ready: false, draining: true, checks: {} };
            const names = Object.keys(probes);
            const results = await Promise.all(names.map((name) => run(probes[name], timeoutMs)));
            const checks = Object.fromEntries(names.map((name, i) => [name, results[i]]));
            return { ready: results.every((r) => r === 'ok'), checks };
        },
    };
}

module.exports = { createReadiness };
