// @ts-check
/**
 * Engine proxy for the analysis page.
 */
const { parseOrReject, sendError } = require('../respond');
const { schemas } = require('../schemas');

/**
 * @param {import('express').Express} app
 * @param {{ analysisService: { analysePosition: (p: { fen: string, depth?: number }) => Promise<unknown> } }} deps
 */
function registerAnalysisRoutes(app, { analysisService }) {
    app.post('/api/analysis/engine', async (req, res) => {
        const input = parseOrReject(res, schemas.analysis, req.body);
        if (!input) return;
        try {
            res.json(await analysisService.analysePosition(input));
        } catch (e) {
            sendError(res, 'analysis/engine', e);
        }
    });
}

module.exports = { registerAnalysisRoutes };
