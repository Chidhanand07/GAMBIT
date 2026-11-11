// @ts-check
/**
 * Private (invite-link) games: create, look up by token, join. Moved from
 * `server/services/friends.js`, which is now the singleton facade.
 */
const { nanoid } = require('nanoid');
const { createInitialGameState } = require('../domain/gameState');

const INVITE_TOKEN_LENGTH = 10;
const INVITE_TTL_HOURS = 48;
/** Grace period for clock skew between server and DB. */
const EXPIRY_GRACE_MS = 5 * 60 * 1000;

/**
 * @typedef {object} PrivateGamesRepoPort
 * @property {(row: object) => PromiseLike<{ data: any, error: any }>} insertReturning
 * @property {(token: string) => PromiseLike<{ data: any, error: any }>} findByInviteToken
 * @property {(id: string, fields: object) => PromiseLike<{ data: any, error: any }>} startIfWaiting
 */

/**
 * @typedef {object} PrivateGameDeps
 * @property {PrivateGamesRepoPort} gamesRepo
 * @property {{ setGame: (id: string, game: object) => Promise<unknown>, addActiveGame: (id: string) => Promise<void> }} gameStore
 * @property {() => number} random
 * @property {() => string} generateToken
 */

/**
 * Pre-assign the creator's colour: 'white' / 'black' (any case), else a coin flip.
 * @param {() => number} random
 * @param {string} userId
 * @param {string | undefined} color
 */
function seatCreator(random, userId, color) {
    const colorLower = (color || 'random').toLowerCase();
    if (colorLower === 'white') return { white_id: userId, black_id: null };
    if (colorLower === 'black') return { white_id: null, black_id: userId };
    return random() > 0.5 ? { white_id: userId, black_id: null } : { white_id: null, black_id: userId };
}

/**
 * Create a waiting game with a 48 h invite token.
 * @param {PrivateGameDeps} deps
 * @param {{ userId: string, timeControl: unknown, color?: string, isRated?: unknown }} p
 * @returns {Promise<any>} the inserted row
 * @throws the Supabase error when the insert fails
 */
async function createPrivateGame({ gamesRepo, random, generateToken }, { userId, timeControl, color, isRated }) {
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + INVITE_TTL_HOURS);

    const { white_id, black_id } = seatCreator(random, userId, color);

    const { data, error } = await gamesRepo.insertReturning({
        white_id,
        black_id,
        time_control: timeControl,
        status: 'waiting',
        invite_token: token,
        invite_expires_at: expiresAt.toISOString(),
        is_rated: isRated,
    });

    if (error) throw error;
    return data;
}

/**
 * The game for an invite token, in any status; null when unknown, on a DB
 * error, or when expired for more than the 5-minute grace period.
 * @param {PrivateGameDeps} deps
 * @param {string} token
 * @returns {Promise<any | null>}
 */
async function getGameByToken({ gamesRepo }, token) {
    // Simplify query — nested profile selects can sometimes cause issues in PostgREST
    // if the foreign keys are null. We'll fetch the base game and join manually if needed,
    // but for the join page check, we only need the basic game info first.
    const { data, error } = await gamesRepo.findByInviteToken(token);

    if (error) {
        console.error('[FriendsService] getGameByToken error:', error.message);
        return null;
    }
    if (!data) return null;

    const now = new Date();
    const expiresAt = new Date(data.invite_expires_at);
    if (expiresAt.getTime() + EXPIRY_GRACE_MS < now.getTime()) {
        console.warn(`[FriendsService] Token ${token} expired at ${data.invite_expires_at}`);
        return null;
    }

    return data;
}

/**
 * Seats after `userId` joins: null when `userId` already holds a seat
 * (creator re-joining); otherwise the joiner takes the empty colour.
 * @param {{ white_id: string | null, black_id: string | null }} game
 * @param {string} userId
 */
function seatJoiner(game, userId) {
    let white_id = game.white_id;
    let black_id = game.black_id;

    if (white_id && white_id === userId) return null; // Creator rejoining
    if (black_id && black_id === userId) return null;

    if (white_id && !black_id) black_id = userId;
    else if (black_id && !white_id) white_id = userId;
    return { white_id, black_id };
}

/**
 * Seat `userId` in the empty colour, start the game and write its Redis state.
 * The creator re-joining gets the waiting row back unchanged.
 * @param {PrivateGameDeps} deps
 * @param {(token: string) => Promise<any>} findGame token lookup (the service's `getGameByToken`)
 * @param {{ token: string, userId: string }} p
 * @returns {Promise<any>} the started (or still waiting) row
 * @throws {Error} on an invalid/expired token, a started game or a DB error
 */
async function joinPrivateGame({ gamesRepo, gameStore }, findGame, { token, userId }) {
    const game = await findGame(token);
    if (!game) throw new Error('Invalid or expired token');
    if (game.status !== 'waiting') throw new Error('Game already started');

    const seats = seatJoiner(game, userId);
    if (!seats) return game;

    const { data, error } = await gamesRepo.startIfWaiting(game.id, {
        ...seats,
        status: 'active',
        started_at: new Date().toISOString(),
    });

    if (error) throw error;
    if (!data) throw new Error('Game already started or not found');

    // Write initial game state to Redis now that both players are assigned
    await gameStore.setGame(
        data.id,
        createInitialGameState({
            id: data.id,
            whiteId: data.white_id,
            blackId: data.black_id,
            timeControl: data.time_control,
            isRated: data.is_rated ?? false,
        }),
    );
    await gameStore.addActiveGame(data.id);

    return data;
}

/**
 * @param {Pick<PrivateGameDeps, 'gamesRepo' | 'gameStore'> & Partial<PrivateGameDeps>} deps
 */
function createPrivateGameService({
    random = () => Math.random(),
    generateToken = () => nanoid(INVITE_TOKEN_LENGTH),
    ...rest
}) {
    /** @type {PrivateGameDeps} */
    const deps = { ...rest, random, generateToken };
    const service = {
        /**
         * @param {string} userId
         * @param {unknown} timeControl
         * @param {string} [color] 'white' | 'black' | 'random'
         * @param {unknown} [isRated]
         */
        createPrivateGame: (userId, timeControl, color, isRated) =>
            createPrivateGame(deps, { userId, timeControl, color, isRated }),
        /** @param {string} token */
        getGameByToken: (token) => getGameByToken(deps, token),
        /**
         * @param {string} token
         * @param {string} userId
         */
        joinPrivateGame: (token, userId) => joinPrivateGame(deps, (t) => service.getGameByToken(t), { token, userId }),
    };
    return service;
}

module.exports = { createPrivateGameService };
