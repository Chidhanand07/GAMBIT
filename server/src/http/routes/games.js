// @ts-check
/**
 * Private-game invite links (join page): look up and join by token.
 */

/**
 * @typedef {object} GameRouteDeps
 * @property {{ getGameByToken: (token: string) => Promise<any>,
 *   joinPrivateGame: (token: string, userId: string) => Promise<any> }} privateGames
 * @property {{ announceGameStart: (game: { id: string }) => void }} socialService
 * @property {(req: import('express').Request, res: import('express').Response) => Promise<string | null>} requireUserId
 */

/**
 * @param {import('express').Express} app
 * @param {GameRouteDeps} deps
 */
function registerGameRoutes(app, { privateGames, socialService, requireUserId }) {
    app.get('/api/games/join/:token', async (req, res) => {
        try {
            const game = await privateGames.getGameByToken(req.params.token);
            if (!game) return res.status(404).json({ error: 'Not found or expired' });
            res.json(game);
        } catch (e) {
            res.status(400).json({ error: /** @type {Error} */ (e).message });
        }
    });

    app.post('/api/games/join/:token', async (req, res) => {
        try {
            const userId = await requireUserId(req, res);
            if (!userId) return;
            const game = await privateGames.joinPrivateGame(req.params.token, userId);
            res.json(game);
            // Notify any waiting clients via socket using game room
            socialService.announceGameStart(game);
        } catch (e) {
            res.status(400).json({ error: /** @type {Error} */ (e).message });
        }
    });
}

module.exports = { registerGameRoutes };
