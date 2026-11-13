// @ts-check
/**
 * Engine proxy for the analysis page.
 */
const { parseOrReject } = require('../respond');
const { schemas } = require('../schemas');

/**
 * @param {import('express').Express} app
 * @param {{ analysisService: { analysePosition: (p: { fen: string, depth?: number }) => Promise<unknown> } }} deps
 */
function registerAnalysisRoutes(app, { analysisService }) {
    app.post('/api/analysis/engine', async (req, res) => {
        const input = parseOrReject(res, schemas.analysis, req.body);
        if (!input) return;
        res.json(await analysisService.analysePosition(input));
    });
}

module.exports = { registerAnalysisRoutes };
