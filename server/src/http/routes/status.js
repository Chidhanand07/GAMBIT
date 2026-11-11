// @ts-check
/**
 * Liveness (Railway healthcheck) and matchmaking queue size
 * (scripts/test-deployment.sh).
 */

/**
 * @param {import('express').Express} app
 * @param {{ queueSize: () => number }} deps
 */
function registerStatusRoutes(app, { queueSize }) {
    app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
    app.get('/api/matchmaking/status', (req, res) => res.json({ players_searching: queueSize() }));
}

module.exports = { registerStatusRoutes };
