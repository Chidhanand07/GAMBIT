// @ts-check
/**
 * In-game chat (G6). Only the two players of an active game may send; the
 * sender is the connection's verified user, never a payload field (NODE-10,
 * NODE-11). The text is the `text` field the web client sends (the schema
 * also maps an older `message` field onto it).
 */
const { playerRejection } = require('../domain/moveAuthorization');
const { gameRoom } = require('./emitter');

/**
 * @typedef {{ game_id: string, text: string, from?: string }} ChatRequest validated by the socket schema
 */

/**
 * @param {object} deps
 * @param {{ getGame: (id: string) => Promise<any> }} deps.gameStore
 * @param {{ insert: (row: object) => PromiseLike<{ error: { message: string } | null }> }} deps.messagesRepo
 * @param {import('./emitter').Emitter} deps.emitter
 */
function createChatService({ gameStore, messagesRepo, emitter }) {
    return {
        /**
         * `send_message`: broadcast to the game room and persist (fire-and-forget).
         * Refused with a reason when the caller is not a player of the game or
         * the game is over.
         * @param {ChatRequest} data
         * @param {string} userId the connection's verified user
         * @returns {Promise<{ ok: boolean, error?: string }>}
         */
        async sendMessage({ game_id: gameId, text, from }, userId) {
            const game = await gameStore.getGame(gameId);
            const reason = playerRejection(game, userId);
            if (reason) return { ok: false, error: reason };

            // `from` is the display name the client chose to show; identity is `from_user_id`.
            emitter.toRoom(gameRoom(gameId), 'chat_message', {
                game_id: gameId,
                ...(from === undefined ? {} : { from }),
                text,
                from_user_id: userId,
            });

            messagesRepo
                .insert({ game_id: gameId, user_id: userId, content: text, created_at: new Date().toISOString() })
                .then(({ error }) => {
                    if (error) console.error('[send_message] persist:', error.message);
                });
            return { ok: true };
        },
    };
}

module.exports = { createChatService };
