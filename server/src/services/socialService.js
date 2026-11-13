// @ts-check
/**
 * Rematches and challenges between players, plus notifications.
 *
 * Trust model (NODE-10, NODE-11): the sender of a request and the answerer of
 * an accept/decline are the socket's verified user (set by the handler). A
 * request is stored server-side for 60 s; an accept or decline only succeeds
 * if a request from that requester to the answering user is pending, and the
 * game is created from the *stored* terms. Nothing in an accept payload can
 * choose the players, the time control, the rated flag or the colours.
 */
const { toPublicGame } = require('../domain/gameDto');
const { userRoom, gameRoom } = require('./emitter');

/**
 * @typedef {import('./emitter').Emitter} Emitter
 * @typedef {'rematch' | 'challenge'} RequestKind
 * @typedef {{ time_control?: unknown, is_rated?: unknown, color?: string }} Terms
 * @typedef {{ from_user_id: string, to_user_id: string, from_username?: string } & Terms} RequestPayload
 * @typedef {{ from_user_id: string, to_user_id: string, by_username?: string }} AnswerPayload
 * @typedef {{ ok: boolean, error?: string }} Outcome
 */

/**
 * @typedef {object} PrivateGamesPort
 * @property {(userId: string, timeControl: unknown, color?: string, isRated?: unknown) => Promise<any>} createPrivateGame
 * @property {(token: string, userId: string) => Promise<any>} joinPrivateGame
 */

/**
 * @typedef {object} PendingRequestsPort
 * @property {(request: { kind: RequestKind, requesterId: string, targetId: string, terms: Terms }) => Promise<void>} put
 * @property {(key: { kind: RequestKind, requesterId: string, targetId: string }) => Promise<Terms | null>} take
 */

/**
 * @typedef {object} RequestStrategy what differs between a rematch and a challenge
 * @property {string} requestEvent
 * @property {string} readyEvent
 * @property {string} declinedEvent
 * @property {(data: Terms) => Terms} termsOf the terms worth storing
 * @property {(p: { requesterId: string, accepterId: string, terms: Terms, random: () => number }) =>
 *   { hostId: string, joinId: string, color: string }} seats who hosts, who joins, the host's colour
 * @property {(answer: AnswerPayload) => unknown[]} declinedArgs payload of the declined event
 */

const OK = Object.freeze({ ok: true });
const NO_PENDING_REQUEST = Object.freeze({ ok: false, error: 'no_pending_request' });
const INVALID_TARGET = Object.freeze({ ok: false, error: 'invalid_target' });
const COIN_FLIP = 0.5;

/** @type {Record<RequestKind, RequestStrategy>} */
const STRATEGIES = {
    // The original requester hosts with a random colour.
    rematch: {
        requestEvent: 'rematch_request',
        readyEvent: 'rematch_ready',
        declinedEvent: 'rematch_declined',
        termsOf: ({ time_control, is_rated }) => ({ time_control, is_rated }),
        seats: ({ requesterId, accepterId }) => ({ hostId: requesterId, joinId: accepterId, color: 'random' }),
        declinedArgs: () => [],
    },
    // `color` is the challenger's colour ('random' or missing flips a coin); the white player hosts.
    challenge: {
        requestEvent: 'challenge_request',
        readyEvent: 'challenge_ready',
        declinedEvent: 'challenge_declined',
        termsOf: ({ time_control, is_rated, color }) => ({ time_control, is_rated, color }),
        seats: ({ requesterId, accepterId, terms, random }) => {
            const picked = terms.color === 'white' || terms.color === 'black' ? terms.color : null;
            const challengerColor = picked ?? (random() > COIN_FLIP ? 'white' : 'black');
            return challengerColor === 'white'
                ? { hostId: requesterId, joinId: accepterId, color: 'white' }
                : { hostId: accepterId, joinId: requesterId, color: 'white' };
        },
        declinedArgs: (answer) => [{ by: answer.by_username }],
    },
};

/**
 * @typedef {object} SocialDeps
 * @property {PrivateGamesPort} privateGames
 * @property {{ insert: (row: object) => PromiseLike<unknown> }} notificationsRepo
 * @property {PendingRequestsPort} pendingRequests
 * @property {Emitter} emitter
 * @property {() => number} random
 */

/**
 * Store an unread notification for `userId`.
 * @param {SocialDeps} deps
 * @param {{ userId: string, type: string, payload?: object }} notification
 * @returns {Promise<void>}
 */
async function insertNotification({ notificationsRepo }, { userId, type, payload = {} }) {
    await notificationsRepo.insert({
        user_id: userId,
        type,
        payload,
        read: false,
        created_at: new Date().toISOString(),
    });
}

/**
 * Store the request for 60 s, then relay it to the target.
 * @param {SocialDeps} deps
 * @param {RequestKind} kind
 * @param {RequestPayload} data `from_user_id` is the verified sender
 * @returns {Promise<Outcome>}
 */
async function request({ pendingRequests, emitter }, kind, data) {
    const { from_user_id: requesterId, to_user_id: targetId } = data;
    if (requesterId === targetId) return INVALID_TARGET;
    const strategy = STRATEGIES[kind];
    await pendingRequests.put({ kind, requesterId, targetId, terms: strategy.termsOf(data) });
    emitter.toRoom(userRoom(targetId), strategy.requestEvent, data);
    return OK;
}

/**
 * Consume the pending request and start the game it describes.
 * @param {SocialDeps} deps
 * @param {RequestKind} kind
 * @param {AnswerPayload} answer `to_user_id` is the verified accepter
 * @returns {Promise<Outcome>}
 */
async function accept({ pendingRequests, privateGames, emitter, random }, kind, answer) {
    const { from_user_id: requesterId, to_user_id: accepterId } = answer;
    const terms = await pendingRequests.take({ kind, requesterId, targetId: accepterId });
    if (!terms) return NO_PENDING_REQUEST;

    const strategy = STRATEGIES[kind];
    const { hostId, joinId, color } = strategy.seats({ requesterId, accepterId, terms, random });
    const game = await privateGames.createPrivateGame(hostId, terms.time_control, color, terms.is_rated);
    await privateGames.joinPrivateGame(game.invite_token, joinId);
    emitter.toRoom(userRoom(requesterId), strategy.readyEvent, { game_id: game.id });
    emitter.toRoom(userRoom(accepterId), strategy.readyEvent, { game_id: game.id });
    return OK;
}

/**
 * Consume the pending request and tell the requester it was declined.
 * @param {SocialDeps} deps
 * @param {RequestKind} kind
 * @param {AnswerPayload} answer `to_user_id` is the verified decliner
 * @returns {Promise<Outcome>}
 */
async function decline({ pendingRequests, emitter }, kind, answer) {
    const { from_user_id: requesterId, to_user_id: declinerId } = answer;
    const terms = await pendingRequests.take({ kind, requesterId, targetId: declinerId });
    if (!terms) return NO_PENDING_REQUEST;
    const strategy = STRATEGIES[kind];
    emitter.toRoom(userRoom(requesterId), strategy.declinedEvent, ...strategy.declinedArgs(answer));
    return OK;
}

/**
 * Relay a challenge and persist it as a notification (C6).
 * @param {SocialDeps} deps
 * @param {RequestPayload} data
 * @returns {Promise<Outcome>}
 */
async function requestChallenge(deps, data) {
    const outcome = await request(deps, 'challenge', data);
    if (!outcome.ok) return outcome;
    await insertNotification(deps, {
        userId: data.to_user_id,
        type: 'challenge',
        payload: {
            from_user_id: data.from_user_id,
            from_username: data.from_username,
            time_control: data.time_control,
            is_rated: data.is_rated,
            color: data.color,
        },
    });
    return outcome;
}

/**
 * @param {Omit<SocialDeps, 'random'> & { random?: () => number }} options
 */
function createSocialService({ random = () => Math.random(), ...rest }) {
    /** @type {SocialDeps} */
    const deps = { ...rest, random };
    return {
        /**
         * Store an unread notification for `userId`.
         * @param {string} userId
         * @param {string} type
         * @param {object} [payload]
         */
        insertNotification: (userId, type, payload) => insertNotification(deps, { userId, type, payload }),

        /**
         * Tell everyone waiting in the game room that a private game started.
         * Only the public view of the row is broadcast (never the invite token).
         * @param {{ id: string }} game
         */
        announceGameStart(game) {
            deps.emitter.toRoom(gameRoom(game.id), 'game_start', toPublicGame(game));
        },

        /** @param {RequestPayload} data */
        requestRematch: (data) => request(deps, 'rematch', data),
        /** @param {AnswerPayload} answer */
        acceptRematch: (answer) => accept(deps, 'rematch', answer),
        /** @param {AnswerPayload} answer */
        declineRematch: (answer) => decline(deps, 'rematch', answer),
        /** @param {RequestPayload} data */
        requestChallenge: (data) => requestChallenge(deps, data),
        /** @param {AnswerPayload} answer */
        acceptChallenge: (answer) => accept(deps, 'challenge', answer),
        /** @param {AnswerPayload} answer */
        declineChallenge: (answer) => decline(deps, 'challenge', answer),
    };
}

module.exports = { createSocialService };
