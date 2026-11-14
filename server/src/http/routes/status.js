// @ts-check
/**
 * Liveness, readiness (NODE-21) and the matchmaking queue size
 * (scripts/test-deployment.sh). The Railway healthcheck targets `/readyz`
 * (server/railway.toml); `/api/health` stays for existing monitors and
 * scripts and is the same as `/livez`.
 */

const HTTP_UNAVAILABLE = 503;

/**
 * @param {import('express').Express} app
 * @param {{ queueSize: () => number, readiness: { check: () => Promise<{ ready: boolean }> } }} deps
 */
function registerStatusRoutes(app, { queueSize, readiness }) {
    const alive = (/** @type {import('express').Request} */ req, /** @type {import('express').Response} */ res) =>
        res.json({ status: 'ok' });
    app.get('/livez', alive);
    app.get('/api/health', alive);
    app.get('/readyz', async (req, res) => {
        const result = await readiness.check();
        res.status(result.ready ? 200 : HTTP_UNAVAILABLE).json(result);
    });
    app.get('/api/matchmaking/status', (req, res) => res.json({ players_searching: queueSize() }));
}

module.exports = { registerStatusRoutes };
