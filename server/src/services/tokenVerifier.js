// @ts-check
/**
 * Access-token verification (NODE-10). The token is checked by Supabase Auth
 * (`auth.getUser(token)`), which works for both legacy HS256 projects and
 * projects on asymmetric signing keys; nothing is decoded or trusted locally.
 */

const { socketDeadline } = require('../domain/accessToken');

/**
 * @typedef {(token: string) => Promise<{ data: { user: { id?: string } | null }, error: unknown }>} GetUser
 */

/**
 * @param {object} deps
 * @param {GetUser} deps.getUser Supabase `auth.getUser`
 * @param {() => number} [deps.now]
 */
function createTokenVerifier({ getUser, now = () => Date.now() }) {
    return {
        /**
         * When a connection opened with this (already verified) token must end.
         * @param {string} token
         * @returns {number} ms since the epoch
         */
        deadline: (token) => socketDeadline(token, now()),

        /**
         * The user id a token belongs to, or null when Supabase Auth rejects it.
         * A failed lookup throws: callers must treat that as "not verified".
         * @param {string} token
         * @returns {Promise<string | null>}
         */
        async verify(token) {
            const { data, error } = await getUser(token);
            if (error || !data?.user?.id) return null;
            return data.user.id;
        },
    };
}

module.exports = { createTokenVerifier };
