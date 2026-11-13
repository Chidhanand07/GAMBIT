// @ts-check
/**
 * Matchmaking queue and pairing loop (pairing rules in domain/matchmaking/pairing).
 * Moved from `server/services/matchmaking.js`, which is now a class facade that
 * owns the 1 s interval.
 */
const pairing = require('../domain/matchmaking/pairing');
const { toPublicGame } = require('../domain/gameDto');
const { createInitialGameState } = require('../domain/gameState');
const { DEFAULT_TIME_CONTROL, formatTimeControl, parseTimeControl, ratingField } = require('../domain/timeControl');
const { log } = require('../observability/log');

const DEFAULT_RATING = 1200;
const ESTIMATED_WAIT_SECONDS = 10;
const INVALID_TIME_CONTROL = Object.freeze({ ok: false, error: 'invalid_time_control' });
const GAME_CREATION_FAILED = Object.freeze({ reason: 'game_creation_failed' });
/** Above this `random()` value the longer-waiting player gets White. */
const WHITE_FOR_FIRST_THRESHOLD = 0.5;

/**
 * @typedef {import('./emitter').Emitter} Emitter
 * @typedef {import('../domain/matchmaking/pairing').QueueEntry} QueueEntry
 */

/**
 * @typedef {object} MatchmakingDeps
 * @property {{ insertReturning: (row: object) => PromiseLike<{ data: any, error: { message: string } | null }> }} gamesRepo
 * @property {{ findForMatchmaking: (id: string) => PromiseLike<{ data: any }> }} profilesRepo
 * @property {{ setGame: (id: string, game: object) => Promise<unknown>, addActiveGame: (id: string) => Promise<void> }} gameStore
 * @property {Emitter} emitter
 * @property {() => number} [now]
 * @property {() => number} [random]
 */

/**
 * @typedef {Required<MatchmakingDeps> & { queue: Map<string, QueueEntry> }} Matchmaker
 */

/**
 * Add a player (no-op when already queued) and tell their socket.
 * @param {Matchmaker} mm
 * @param {{ user: { id: string, username: string, rating?: number | null, games_played?: number | null },
 *   socketId: string, timeControl: unknown, increment: unknown, isRated?: boolean }} p
 */
function joinQueue({ queue, emitter, now }, { user, socketId, timeControl, increment, isRated = true }) {
    if (queue.has(user.id)) return;

    // One canonical "M+S" per entry, so pairing compares base and increment (G4).
    const model = parseTimeControl(timeControl ?? DEFAULT_TIME_CONTROL.minutes, increment) ?? DEFAULT_TIME_CONTROL;
    queue.set(
        user.id,
        pairing.createQueueEntry({
            user,
            socketId,
            timeControl: formatTimeControl(model),
            increment: model.incrementSeconds,
            isRated,
            now: now(),
        }),
    );

    emitter.toRoom(socketId, 'queue_joined', {
        position: queue.size,
        estimated_wait: ESTIMATED_WAIT_SECONDS,
    });
}

/**
 * `join_queue`: queue the player with their rating read from the DB (C3: never
 * trust a client-provided rating). Unknown users are ignored; an invalid
 * time control is refused with a reason.
 * @param {Matchmaker} mm
 * @param {{ user?: { id?: string }, time_control?: unknown, increment?: unknown, is_rated?: boolean }} data
 * @param {string} socketId
 * @returns {Promise<{ ok: false, error: string } | void>}
 */
async function requestMatch(mm, data, socketId) {
    if (!data?.user?.id) return;
    const model = parseTimeControl(data.time_control ?? DEFAULT_TIME_CONTROL.minutes, data.increment);
    if (!model) return INVALID_TIME_CONTROL;
    const timeControl = formatTimeControl(model);
    const { data: profile } = await mm.profilesRepo.findForMatchmaking(data.user.id);
    if (!profile) return;
    const verifiedUser = {
        id: profile.id,
        username: profile.username,
        rating: profile[ratingField(timeControl)] ?? DEFAULT_RATING,
        games_played: profile.games_played ?? 0,
    };
    joinQueue(mm, {
        user: verifiedUser,
        socketId,
        timeControl,
        increment: model.incrementSeconds,
        isRated: data.is_rated ?? true,
    });
}

/**
 * Insert the `games` row for a pair. A failure (an error result or a throw) is
 * logged and reported as null.
 * @param {Matchmaker} mm
 * @param {QueueEntry} white
 * @param {QueueEntry} black
 * @returns {Promise<any | null>} the created row
 */
async function insertGame({ gamesRepo }, white, black) {
    try {
        const { data, error } = await gamesRepo.insertReturning({
            white_id: white.user_id,
            black_id: black.user_id,
            time_control: white.time_control,
            increment: white.increment,
            status: 'active',
            started_at: new Date().toISOString(),
        });
        if (!error && data) return data;
        log.error('[matchmaking] createGame error:', error?.message);
    } catch (e) {
        log.error('[matchmaking] createGame error:', /** @type {Error} */ (e).message);
    }
    return null;
}

/**
 * Create the DB game and Redis state for a pair and notify both sockets.
 *
 * If the game cannot be created both players are told (`match_failed`) and
 * are out of the queue: they used to be dropped without a word, still showing
 * "searching" (G12). They are not re-queued automatically: with the database
 * failing that would retry the insert every second for every pair.
 * @param {Matchmaker} mm
 * @param {QueueEntry} p1
 * @param {QueueEntry} p2
 */
async function createGame(mm, p1, p2) {
    const { queue, gameStore, emitter, random, now } = mm;
    queue.delete(p1.user_id);
    queue.delete(p2.user_id);

    const [white, black] = random() > WHITE_FOR_FIRST_THRESHOLD ? [p1, p2] : [p2, p1];

    const data = await insertGame(mm, white, black);
    if (!data) {
        for (const player of [p1, p2]) emitter.toRoom(player.socketId, 'match_failed', GAME_CREATION_FAILED);
        return;
    }

    // Write initial game state to Redis
    await gameStore.setGame(
        data.id,
        createInitialGameState({
            id: data.id,
            whiteId: white.user_id,
            blackId: black.user_id,
            timeControl: p1.time_control,
            isRated: p1.isRated ?? true,
            startedAt: now(),
        }),
    );
    await gameStore.addActiveGame(data.id);

    // The public view of the game, and public facts about the opponent: nothing else.
    const game = toPublicGame(data);
    emitter.toRoom(white.socketId, 'match_found', { ...game, color: 'white', opponent: pairing.opponentView(black) });
    emitter.toRoom(black.socketId, 'match_found', { ...game, color: 'black', opponent: pairing.opponentView(white) });
}

/**
 * One pairing pass: longest-waiting first, then broadcast the queue size.
 * @param {Matchmaker} mm
 */
async function matchPlayers(mm) {
    // Sort by longest waiting
    const players = pairing.sortByLongestWaiting(Array.from(mm.queue.values()));
    const paired = new Set();

    for (let i = 0; i < players.length; i++) {
        const p1 = players[i];
        if (paired.has(p1.user_id)) continue;

        // Candidates are sorted by joined_at, so the first match is the longest-waiting one
        const candidates = players.slice(i + 1).filter((p) => !paired.has(p.user_id));
        const bestMatch = pairing.findOpponent(p1, candidates, mm.now);

        if (bestMatch) {
            paired.add(p1.user_id);
            paired.add(bestMatch.user_id);
            await createGame(mm, p1, bestMatch);
        }
    }

    // broadcast queue status
    mm.emitter.toAll('queue_status', { players_searching: mm.queue.size });
}

/**
 * @param {MatchmakingDeps} deps
 */
function createMatchmakingService({ now = () => Date.now(), random = () => Math.random(), ...rest }) {
    // In-memory queue:
    // { userId: { user_id, username, rating, time_control, increment, joined_at, socketId } }
    /** @type {Map<string, QueueEntry>} */
    const queue = new Map();
    /** @type {Matchmaker} */
    const mm = { ...rest, now, random, queue };

    /** @param {string} userId */
    const leaveQueue = (userId) => {
        queue.delete(userId);
    };

    return {
        queue,
        /** @param {Parameters<typeof joinQueue>[1]} p */
        joinQueue: (p) => joinQueue(mm, p),
        /** @type {(data: Parameters<typeof requestMatch>[1], socketId: string) => ReturnType<typeof requestMatch>} */
        requestMatch: (data, socketId) => requestMatch(mm, data, socketId),
        leaveQueue,
        /**
         * Drop every queue entry that belongs to a disconnected socket.
         * @param {string} socketId
         */
        leaveQueueBySocket(socketId) {
            for (const [userId, entry] of queue.entries()) {
                if (entry.socketId === socketId) leaveQueue(userId);
            }
        },
        /** @type {(p1: QueueEntry, p2: QueueEntry) => Promise<void>} */
        createGame: (p1, p2) => createGame(mm, p1, p2),
        matchPlayers: () => matchPlayers(mm),
        getSearchRadius: pairing.getSearchRadius,
    };
}

module.exports = { createMatchmakingService };
