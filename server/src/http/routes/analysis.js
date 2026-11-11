// @ts-check
/**
 * Engine proxy for the analysis page.
 */

/**
 * @param {import('express').Express} app
 * @param {{ analysisService: { analysePosition: (p: { fen: string, depth?: number }) => Promise<unknown> } }} deps
 */
function registerAnalysisRoutes(app, { analysisService }) {
    app.post('/api/analysis/engine', async (req, res) => {
        try {
            const { fen, depth } = req.body;
            res.json(await analysisService.analysePosition({ fen, depth }));
        } catch (e) {
            res.status(500).json({ error: /** @type {Error} */ (e).message });
        }
    });
}

module.exports = { registerAnalysisRoutes };
