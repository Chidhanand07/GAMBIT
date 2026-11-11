// @ts-check
/**
 * Rematches, challenges and notifications between players. Payloads are
 * relayed as the client sent them (user ids are client-asserted; known bug,
 * preserved).
 */
const { userRoom, gameRoom } = require('./emitter');

/**
 * @typedef {import('./emitter').Emitter} Emitter
 * @typedef {{ from_user_id: string, to_user_id: string, time_control?: unknown, is_rated?: unknown,
 *   color?: string, from_username?: string, by_username?: string }} SocialPayload
 */

/**
 * @typedef {object} PrivateGamesPort
 * @property {(userId: string, timeControl: unknown, color?: string, isRated?: unknown) => Promise<any>} createPrivateGame
 * @property {(token: string, userId: string) => Promise<any>} joinPrivateGame
 */

/**
 * @param {object} deps
 * @param {PrivateGamesPort} deps.privateGames
 * @param {{ insert: (row: object) => PromiseLike<unknown> }} deps.notificationsRepo
 * @param {Emitter} deps.emitter
 * @param {() => number} [deps.random]
 */
function createSocialService({ privateGames, notificationsRepo, emitter, random = () => Math.random() }) {
    /**
     * Store an unread notification for `userId`.
     * @param {string} userId
     * @param {string} type
     * @param {object} [payload]
     * @returns {Promise<void>}
     */
    async function insertNotification(userId, type, payload = {}) {
        await notificationsRepo.insert({
            user_id: userId,
            type,
            payload,
            read: false,
            created_at: new Date().toISOString(),
        });
    }

    /**
     * Create a game hosted by `hostId`, seat `joinId`, and send `readyEvent` to both users.
     * @param {{ hostId: string, joinId: string, color: string, data: SocialPayload, readyEvent: string }} p
     */
    async function startGameBetween({ hostId, joinId, color, data, readyEvent }) {
        const game = await privateGames.createPrivateGame(hostId, data.time_control, color, data.is_rated);
        await privateGames.joinPrivateGame(game.invite_token, joinId);
        emitter.toRoom(userRoom(data.from_user_id), readyEvent, { game_id: game.id });
        emitter.toRoom(userRoom(data.to_user_id), readyEvent, { game_id: game.id });
    }

    return {
        insertNotification,

        /**
         * Tell everyone waiting in the game room that a private game started.
         * @param {{ id: string }} game
         */
        announceGameStart(game) {
            emitter.toRoom(gameRoom(game.id), 'game_start', game);
        },

        /** @param {SocialPayload} data relayed verbatim to the addressee */
        async requestRematch(data) {
            emitter.toRoom(userRoom(data.to_user_id), 'rematch_request', data);
        },

        /**
         * The original requester (`from_user_id`) hosts with a random colour.
         * @param {SocialPayload} data
         */
        async acceptRematch(data) {
            try {
                const p = { hostId: data.from_user_id, joinId: data.to_user_id, color: 'random', data };
                await startGameBetween({ ...p, readyEvent: 'rematch_ready' });
            } catch (e) {
                console.error('[rematch_accept] error:', /** @type {Error} */ (e).message);
            }
        },

        /** @param {SocialPayload} data */
        declineRematch(data) {
            emitter.toRoom(userRoom(data.to_user_id), 'rematch_declined');
        },

        /**
         * Relay a challenge and persist it as a notification (C6).
         * @param {SocialPayload} data
         */
        async requestChallenge(data) {
            emitter.toRoom(userRoom(data.to_user_id), 'challenge_request', data);
            await insertNotification(data.to_user_id, 'challenge', {
                from_user_id: data.from_user_id,
                from_username: data.from_username,
                time_control: data.time_control,
                is_rated: data.is_rated,
                color: data.color,
            });
        },

        /**
         * `color` is the challenger's colour; 'random' flips a coin. The white
         * player hosts.
         * @param {SocialPayload} data
         */
        async acceptChallenge(data) {
            try {
                const challengerColor = data.color === 'random' ? (random() > 0.5 ? 'white' : 'black') : data.color;
                const hostId = challengerColor === 'white' ? data.from_user_id : data.to_user_id;
                const joinId = challengerColor === 'white' ? data.to_user_id : data.from_user_id;
                await startGameBetween({ hostId, joinId, color: 'white', data, readyEvent: 'challenge_ready' });
            } catch (e) {
                console.error('[challenge_accept] error:', /** @type {Error} */ (e).message);
            }
        },

        /** @param {SocialPayload} data */
        declineChallenge(data) {
            emitter.toRoom(userRoom(data.from_user_id), 'challenge_declined', { by: data.by_username });
        },
    };
}

module.exports = { createSocialService };
