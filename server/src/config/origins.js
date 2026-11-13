// @ts-check
/**
 * Parsing of the `CORS_ORIGINS` setting (NODE-05, NODE-09). Configuration
 * syntax only; the policy that uses the list is services/originPolicy.js.
 */

const ORIGIN = /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/;

/**
 * `CORS_ORIGINS`: comma-separated exact origins. A trailing slash is dropped;
 * anything that is not `scheme://host[:port]` is a configuration error.
 * @param {string | undefined} value
 * @returns {string[]}
 * @throws {Error} on a wildcard, a path or another malformed entry
 */
function parseOrigins(value) {
    return (value ?? '')
        .split(',')
        .map((entry) => entry.trim().replace(/\/$/, ''))
        .filter(Boolean)
        .map((entry) => {
            if (!ORIGIN.test(entry)) {
                throw new Error(`CORS_ORIGINS: "${entry}" is not an exact origin like https://example.com`);
            }
            return entry;
        });
}

module.exports = { parseOrigins };
