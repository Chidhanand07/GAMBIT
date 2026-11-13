// @ts-check
/**
 * Username availability (signup page).
 */
const { parseOrReject, sendError } = require('../respond');
const { schemas } = require('../schemas');

/**
 * @param {import('express').Express} app
 * @param {{ profileService: { isUsernameAvailable: (username: string) => Promise<boolean> } }} deps
 */
function registerUserRoutes(app, { profileService }) {
    app.get('/api/users/check-username', async (req, res) => {
        const input = parseOrReject(res, schemas.usernameQuery, req.query);
        if (!input) return;
        try {
            res.json({ available: await profileService.isUsernameAvailable(input.u) });
        } catch (e) {
            sendError(res, 'users/check-username', e);
        }
    });
}

module.exports = { registerUserRoutes };
