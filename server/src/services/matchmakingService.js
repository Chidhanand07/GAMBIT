// @ts-check
/**
 * Matchmaking queue and pairing loop (pairing rules in domain/matchmaking/pairing).
 * Moved from `server/services/matchmaking.js`, which is now a class facade that
 * owns the 1 s interval.
 */
const pairing = require('../domain/matchmaking/pairing');
const { createInitialGameState } = require('../domain/gameState');
const { ratingField } = require('../domain/timeControl');

const DEFAULT_RATING = 1200;
const ESTIMATED_WAIT_SECONDS = 10;

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

    queue.set(user.id, pairing.createQueueEntry({ user, socketId, timeControl, increment, isRated, now: now() }));

    emitter.toRoom(socketId, 'queue_joined', {
        position: queue.size,
        estimated_wait: ESTIMATED_WAIT_SECONDS,
    });
}

/**
 * `join_queue`: queue the player with their rating read from the DB (C3: never
 * trust a client-provided rating). Unknown users are ignored.
 * @param {Matchmaker} mm
 * @param {{ user?: { id?: string }, time_control?: unknown, increment?: unknown, is_rated?: boolean }} data
 * @param {string} socketId
 */
async function requestMatch(mm, data, socketId) {
    if (!data?.user?.id) return;
    const { data: profile } = await mm.profilesRepo.findForMatchmaking(data.user.id);
    if (!profile) return;
    const verifiedUser = {
        id: profile.id,
        username: profile.username,
        rating: profile[ratingField(data.time_control)] ?? DEFAULT_RATING,
        games_played: profile.games_played ?? 0,
    };
    joinQueue(mm, {
        user: verifiedUser,
        socketId,
        timeControl: data.time_control,
        increment: data.increment,
        isRated: data.is_rated ?? true,
    });
}

/**
 * Create the DB game and Redis state for a pair and notify both sockets.
 * @param {Matchmaker} mm
 * @param {QueueEntry} p1
 * @param {QueueEntry} p2
 */
async function createGame({ queue, gamesRepo, gameStore, emitter, random }, p1, p2) {
    queue.delete(p1.user_id);
    queue.delete(p2.user_id);

    const [white, black] = random() > 0.5 ? [p1, p2] : [p2, p1];

    const { data, error } = await gamesRepo.insertReturning({
        white_id: white.user_id,
        black_id: black.user_id,
        time_control: p1.time_control,
        increment: p1.increment,
        status: 'active',
        started_at: new Date().toISOString(),
    });

    if (error || !data) {
        console.error('[matchmaking] createGame error:', error?.message);
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
        }),
    );
    await gameStore.addActiveGame(data.id);

    emitter.toRoom(white.socketId, 'match_found', { ...data, color: 'white', opponent: black });
    emitter.toRoom(black.socketId, 'match_found', { ...data, color: 'black', opponent: white });
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
        /** @type {(data: Parameters<typeof requestMatch>[1], socketId: string) => Promise<void>} */
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
