// @ts-check
/**
 * Public profile lookups used by the HTTP API.
 */

/**
 * @param {object} deps
 * @param {{ findUsernameByUsername: (username: string) => PromiseLike<{ data: unknown }> }} deps.profilesRepo
 */
function createProfileService({ profilesRepo }) {
    return {
        /**
         * True when no profile has this username. A DB error result also reads
         * as available (known bug, pinned by the characterization tests).
         * @param {string} username
         * @returns {Promise<boolean>}
         */
        async isUsernameAvailable(username) {
            const { data } = await profilesRepo.findUsernameByUsername(username);
            return !data;
        },
    };
}

module.exports = { createProfileService };
