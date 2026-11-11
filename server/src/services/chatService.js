// @ts-check
/**
 * In-game chat. Only the two players may send (H5); the sender id comes from
 * the session, not the payload. The message column is read from `data.message`
 * (the frontend sends `text`: known bug, preserved).
 */
const { gameRoom } = require('./emitter');

/**
 * @param {object} deps
 * @param {{ getGame: (id: string) => Promise<any> }} deps.gameStore
 * @param {{ insert: (row: object) => PromiseLike<{ error: { message: string } | null }> }} deps.messagesRepo
 * @param {{ userIdOf: (socketId: string) => string | undefined }} deps.sessions
 * @param {import('./emitter').Emitter} deps.emitter
 */
function createChatService({ gameStore, messagesRepo, sessions, emitter }) {
    return {
        /**
         * `send_message`: persist (fire-and-forget, M4) and broadcast with the
         * server-verified `from_user_id`.
         * @param {Record<string, any>} data
         * @param {string} socketId
         */
        async sendMessage(data, socketId) {
            // H5: validate sender is a participant of this game
            const senderId = sessions.userIdOf(socketId);
            if (!senderId || !data.game_id) return;
            const game = await gameStore.getGame(data.game_id);
            if (!game || (senderId !== game.whiteId && senderId !== game.blackId)) return;

            // Override from field with server-verified identity
            const safeData = { ...data, from_user_id: senderId };

            // M4: persist chat message to DB
            messagesRepo
                .insert({
                    game_id: data.game_id,
                    user_id: senderId,
                    content: data.message,
                    created_at: new Date().toISOString(),
                })
                .then(({ error }) => {
                    if (error) console.error('[send_message] persist:', error.message);
                });

            emitter.toRoom(gameRoom(data.game_id), 'chat_message', safeData);
        },
    };
}

module.exports = { createChatService };
