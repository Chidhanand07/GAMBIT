// @ts-check
/**
 * When an access token stops being valid (NODE-10). Pure. The token passed in
 * has already been verified by Supabase Auth; this only reads its `exp` claim
 * to know how long a connection opened with it may live. It never decides
 * whether a token is genuine.
 */

const MS_PER_SECOND = 1000;
const JWT_PARTS = 3;

/** Supabase's default access-token lifetime: the longest a socket may live on one token. */
const DEFAULT_TOKEN_LIFETIME_MS = 3_600_000;

/**
 * The `exp` claim of a JWT in milliseconds since the epoch, or null when the
 * token is not a JWT or has no usable `exp`.
 * @param {string} token
 * @returns {number | null}
 */
function expiryOfToken(token) {
    const parts = token.split('.');
    if (parts.length !== JWT_PARTS) return null;
    try {
        const { exp } = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        return typeof exp === 'number' && Number.isFinite(exp) && exp > 0 ? exp * MS_PER_SECOND : null;
    } catch {
        return null;
    }
}

/**
 * When a socket opened with `token` at `now` must be closed: the token's
 * expiry, but never later than the default lifetime from now. An expiry that
 * cannot be read therefore means "one default lifetime", not "forever".
 * @param {string} token
 * @param {number} now
 * @returns {number}
 */
function socketDeadline(token, now) {
    const latest = now + DEFAULT_TOKEN_LIFETIME_MS;
    return Math.min(expiryOfToken(token) ?? latest, latest);
}

module.exports = { DEFAULT_TOKEN_LIFETIME_MS, expiryOfToken, socketDeadline };
