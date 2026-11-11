// @ts-check
/**
 * Username availability (signup page).
 */

/**
 * @param {import('express').Express} app
 * @param {{ profileService: { isUsernameAvailable: (username: string) => Promise<boolean> } }} deps
 */
function registerUserRoutes(app, { profileService }) {
    app.get('/api/users/check-username', async (req, res) => {
        try {
            const username = /** @type {string | undefined} */ (req.query.u);
            if (!username) return res.status(400).json({ error: 'Missing username parameter' });
            res.json({ available: await profileService.isUsernameAvailable(username) });
        } catch (e) {
            res.status(500).json({ error: /** @type {Error} */ (e).message });
        }
    });
}

module.exports = { registerUserRoutes };
