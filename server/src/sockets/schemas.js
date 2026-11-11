// @ts-check
/**
 * One zod schema per client → server socket event (NODE-08). Objects are parsed
 * in zod's default "strip" mode: unknown keys are dropped rather than rejected,
 * because the current frontend sends extra fields (a whole profile in
 * `join_queue.user`, for example). See docs/fixes/DECISIONS.md F-003.
 *
 * No schema names the *acting* user: the actor is `socket.data.userId`, set by
 * the handshake middleware (NODE-10). A `from_user_id` on a request or a
 * `to_user_id` on an accept is therefore stripped like any unknown key.
 */
const { z } = require('zod');

const MAX_ID_LENGTH = 64;
const MAX_TIME_CONTROL_LENGTH = 16;
const MAX_INCREMENT_SECONDS = 180;
const MAX_NAME_LENGTH = 64;
const MAX_CHAT_LENGTH = 500;
const MAX_FEN_LENGTH = 100;
const MAX_SAN_LENGTH = 16;
const MAX_RESULT_LENGTH = 32;
const MAX_REASON_LENGTH = 64;

/**
 * A user or game id. Production ids are UUIDs; the charset also admits short
 * slugs, and excludes everything with a meaning in a PostgREST filter.
 */
const id = z
    .string()
    .min(1)
    .max(MAX_ID_LENGTH)
    .regex(/^[A-Za-z0-9_-]+$/);

/** "10", "5+3", or a number of minutes. */
const timeControl = z.union([z.string().min(1).max(MAX_TIME_CONTROL_LENGTH), z.number().finite().nonnegative()]);
const increment = z.number().finite().min(0).max(MAX_INCREMENT_SECONDS);
const square = z.string().regex(/^[a-h][1-8]$/);
const promotion = z.enum(['q', 'r', 'b', 'n']);
const color = z.enum(['white', 'black', 'random']);
const name = z.string().max(MAX_NAME_LENGTH);

const matchTerms = {
    time_control: timeControl.nullish(),
    is_rated: z.boolean().nullish(),
};

const schemas = {
    join_queue: z.object({
        ...matchTerms,
        increment: increment.optional(),
    }),
    // Older clients send their own id; it is ignored (the actor is the verified user).
    leave_queue: z.unknown(),
    join_game: id,
    spectate_game: id,
    make_move: z.object({
        game_id: id,
        from: square.optional(),
        to: square.optional(),
        promotion: promotion.optional(),
        move: z.string().max(MAX_SAN_LENGTH).optional(),
        fen: z.string().max(MAX_FEN_LENGTH).optional(),
        san: z.string().max(MAX_SAN_LENGTH).optional(),
        captured: z.boolean().optional(),
    }),
    game_end: z.object({
        game_id: id,
        result: z.string().max(MAX_RESULT_LENGTH).nullish(),
        reason: z.string().max(MAX_REASON_LENGTH).optional(),
        ...matchTerms,
    }),
    send_message: z.object({
        game_id: id,
        from: name.optional(),
        text: z.string().max(MAX_CHAT_LENGTH).optional(),
        message: z.string().max(MAX_CHAT_LENGTH).optional(),
    }),
    rematch_request: z.object({
        to_user_id: id,
        from_username: name.optional(),
        ...matchTerms,
    }),
    // Answers name only the requester. Terms in an accept are not read: the
    // game is created from the request the server stored (S4).
    rematch_accept: z.object({ from_user_id: id }),
    rematch_decline: z.object({ from_user_id: id }),
    challenge_request: z.object({
        to_user_id: id,
        from_username: name.optional(),
        ...matchTerms,
        color: color.optional(),
    }),
    challenge_accept: z.object({ from_user_id: id }),
    challenge_decline: z.object({ from_user_id: id, by_username: name.optional() }),
};

module.exports = { schemas };
