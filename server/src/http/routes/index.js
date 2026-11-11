// @ts-check
/**
 * Registers every HTTP route, in the original order.
 */
const { registerStatusRoutes } = require('./status');
const { registerUserRoutes } = require('./users');
const { registerAnalysisRoutes } = require('./analysis');
const { registerGameRoutes } = require('./games');

/**
 * @param {import('express').Express} app
 * @param {Parameters<typeof registerStatusRoutes>[1] & Parameters<typeof registerUserRoutes>[1] &
 *   Parameters<typeof registerAnalysisRoutes>[1] & import('./games').GameRouteDeps} deps
 */
function registerRoutes(app, deps) {
    registerStatusRoutes(app, deps);
    registerUserRoutes(app, deps);
    registerAnalysisRoutes(app, deps);
    registerGameRoutes(app, deps);
}

module.exports = { registerRoutes };
