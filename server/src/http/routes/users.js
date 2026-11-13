// @ts-check
/**
 * Username availability (signup page).
 */
const { parseOrReject } = require('../respond');
const { schemas } = require('../schemas');

/**
 * @param {import('express').Express} app
 * @param {{ profileService: { isUsernameAvailable: (username: string) => Promise<boolean> } }} deps
 */
function registerUserRoutes(app, { profileService }) {
    app.get('/api/users/check-username', async (req, res) => {
        const input = parseOrReject(res, schemas.usernameQuery, req.query);
        if (!input) return;
        res.json({ available: await profileService.isUsernameAvailable(input.u) });
    });
}

module.exports = { registerUserRoutes };
