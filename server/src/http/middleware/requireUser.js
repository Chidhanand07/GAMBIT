// @ts-check
/**
 * Bearer-token check for protected routes. Same semantics as the original
 * `requireUserId` in server.js: it is called inside a route's try block,
 * answers 401 itself and returns null when the caller is not authenticated,
 * and lets a thrown `getUser` error reach the route's catch.
 */

const BEARER_PREFIX = 'Bearer ';

/**
 * @typedef {(token: string) => Promise<{ data: { user: { id: string } | null }, error: unknown }>} GetUser
 */

/**
 * @param {object} deps
 * @param {GetUser} deps.getUser verifies an access token (Supabase `auth.getUser`)
 */
function createRequireUserId({ getUser }) {
    /**
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @returns {Promise<string | null>} the caller's user id, or null after a 401
     */
    return async function requireUserId(req, res) {
        const authHeader = req.headers['authorization'];
        if (!authHeader?.startsWith(BEARER_PREFIX)) {
            res.status(401).json({ error: 'Missing Authorization header' });
            return null;
        }
        const token = authHeader.slice(BEARER_PREFIX.length);
        const {
            data: { user },
            error,
        } = await getUser(token);
        if (error || !user) {
            res.status(401).json({ error: 'Invalid or expired token' });
            return null;
        }
        return user.id;
    };
}

module.exports = { createRequireUserId };
