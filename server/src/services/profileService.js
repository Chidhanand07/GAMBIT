// @ts-check
/**
 * Public profile lookups used by the HTTP API.
 */
const { AppError } = require('./errors');

const HTTP_UNAVAILABLE = 503;

/**
 * @param {object} deps
 * @param {{ findUsernameByUsername: (username: string) => PromiseLike<{ data: unknown, error?: { message: string } | null }> }} deps.profilesRepo
 */
function createProfileService({ profilesRepo }) {
    return {
        /**
         * True when no profile has this username. If the lookup fails the
         * answer is an error, never "available" (SEC-09, G14).
         * @param {string} username
         * @returns {Promise<boolean>}
         * @throws {AppError} username_check_unavailable (503)
         */
        async isUsernameAvailable(username) {
            let answer;
            try {
                answer = await profilesRepo.findUsernameByUsername(username);
            } catch (e) {
                throw new AppError('username_check_unavailable', HTTP_UNAVAILABLE, /** @type {Error} */ (e).message);
            }
            if (answer.error) throw new AppError('username_check_unavailable', HTTP_UNAVAILABLE, answer.error.message);
            return !answer.data;
        },
    };
}

module.exports = { createProfileService };
