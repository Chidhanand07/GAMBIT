// @ts-check
/**
 * Which browser origins may talk to this server (NODE-09, S13). One policy is
 * used by Express CORS and by the Socket.IO handshake (`allowRequest`), so the
 * two can never disagree.
 *
 * Origins are matched exactly. The only pattern allowed is one for this
 * project's Vercel preview deployments, and it is checked at startup: it must
 * be anchored, https, on vercel.app, and must NOT match an arbitrary
 * `*.vercel.app` host (anyone can create one).
 */

/** Hosts anyone can create on Vercel: a preview pattern must not match these. */
const FOREIGN_PREVIEW_PROBES = Object.freeze([
    'https://evil.vercel.app',
    'https://attacker-gambit.vercel.app',
    'https://gambit-attacker.vercel.app',
    'https://x.vercel.app',
]);

/**
 * @param {string} pattern
 * @returns {RegExp}
 * @throws {Error} when the pattern is not a safe preview-deployment pattern
 */
function previewRegex(pattern) {
    const fail = (/** @type {string} */ why) => new Error(`CORS_PREVIEW_ORIGIN_REGEX ${why}: ${pattern}`);
    if (!pattern.startsWith('^https://') || !pattern.endsWith('\\.vercel\\.app$')) {
        throw fail('must look like ^https://<project>-…\\.vercel\\.app$');
    }
    let regex;
    try {
        regex = new RegExp(pattern);
    } catch {
        throw fail('is not a valid regular expression');
    }
    if (FOREIGN_PREVIEW_PROBES.some((probe) => regex.test(probe))) {
        throw fail("matches vercel.app hosts that are not this project's previews");
    }
    return regex;
}

/**
 * @param {{ origins: string[], previewPattern?: string }} config
 */
function createOriginPolicy({ origins, previewPattern }) {
    const exact = new Set(origins);
    const preview = previewPattern ? previewRegex(previewPattern) : null;

    /** @param {string} origin */
    const isAllowed = (origin) => exact.has(origin) || Boolean(preview?.test(origin));

    return {
        isAllowed,
        /**
         * A request without an Origin header does not come from a browser page
         * (curl, server-to-server, native clients): CORS does not apply to it.
         * @param {string | undefined} origin
         */
        allowsRequest: (origin) => origin === undefined || isAllowed(origin),
    };
}

module.exports = { createOriginPolicy };
