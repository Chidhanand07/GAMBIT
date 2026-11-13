// @ts-check
/**
 * Matchmaking queue and pairing loop (pairing rules in domain/matchmaking/pairing).
 * `server/services/matchmaking.js` is the class facade that owns the 1 s interval.
 *
 * The queue is a shared port (Redis in production), so any number of server
 * instances can queue players [MULTI-INSTANCE]. Each pass every instance
 * refreshes the entries it queued; one instance at a time (a short lock)
 * pairs. A pair becomes a game only after `queue.claimPair` took both players
 * out of the queue atomically: that claim, not the lock, is what guarantees a
 * player is never paired twice (NODE-17).
 */
const pairing = require('../domain/matchmaking/pairing');
const { toPublicGame } = require('../domain/gameDto');
const { createInitialGameState } = require('../domain/gameState');
const { DEFAULT_TIME_CONTROL, formatTimeControl, parseTimeControl, ratingField } = require('../domain/timeControl');
const { randomUUID } = require('node:crypto');
const { log } = require('../observability/log');

const DEFAULT_RATING = 1200;
/** Longer than a pass normally takes; claims stay safe if a slow pass outlives it. */
const PAIRING_LOCK_TTL_MS = 5000;
const ESTIMATED_WAIT_SECONDS = 10;
const INVALID_TIME_CONTROL = Object.freeze({ ok: false, error: 'invalid_time_control' });
const PROFILE_NOT_FOUND = Object.freeze({ ok: false, error: 'profile_not_found' });
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
 * @property {MatchmakingQueue} queue
 * @property {() => number} [now]
 * @property {() => number} [random]
 * @property {string} [instanceId] unique per process; names this instance's pairing-lock tokens
 * @property {number} [lockTtlMs]
 */

/**
 * The shared queue (port). Implementations: src/repositories/
 * matchmakingQueueRepository.js (Redis) and the in-memory test fake; both pass
 * __tests__/repositories/matchmakingQueue.contract.test.js (SOLID-04).
 * @typedef {object} MatchmakingQueue
 * @property {(entry: QueueEntry) => Promise<number | null>} add queue size after joining; null if already queued
 * @property {(userId: string) => Promise<QueueEntry | null>} get
 * @property {(userId: string, socketId?: string) => Promise<boolean>} remove
 * @property {() => Promise<QueueEntry[]>} list longest-waiting first
 * @property {() => Promise<number>} size
 * @property {(a: QueueEntry, b: QueueEntry) => Promise<boolean>} claimPair both out of the queue, or neither
 * @property {(userIds: string[]) => Promise<string[]>} touch refresh TTLs; returns the ones still queued
 * @property {(token: string, ttlMs: number) => Promise<boolean>} acquirePairingLock
 * @property {(token: string) => Promise<boolean>} releasePairingLock
 */

/**
 * @typedef {Required<MatchmakingDeps> & {
 *   local: Map<string, string>, searching: { count: number }, nextToken: () => string }} Matchmaker
 * `local`: userId → socketId for the entries THIS instance queued (refreshed
 * every pass; looked up on disconnect). `searching`: the last queue size seen.
 */

/**
 * Add a player (no-op when already queued) and tell their socket.
 * @param {Matchmaker} mm
 * @param {{ user: { id: string, username: string, rating?: number | null, games_played?: number | null },
 *   socketId: string, timeControl: unknown, increment: unknown, isRated?: boolean }} p
 */
async function joinQueue(mm, { user, socketId, timeControl, increment, isRated = true }) {
    // One canonical "M+S" per entry, so pairing compares base and increment (G4).
    const model = parseTimeControl(timeControl ?? DEFAULT_TIME_CONTROL.minutes, increment) ?? DEFAULT_TIME_CONTROL;
    const entry = pairing.createQueueEntry({
        user,
        socketId,
        timeControl: formatTimeControl(model),
        increment: model.incrementSeconds,
        isRated,
        now: mm.now(),
    });
    const position = await mm.queue.add(entry);
    if (position === null) return;
    mm.local.set(user.id, socketId);
    mm.searching.count = position;

    mm.emitter.toRoom(socketId, 'queue_joined', {
        position,
        estimated_wait: ESTIMATED_WAIT_SECONDS,
    });
}

/**
 * `join_queue`: queue the player with their rating read from the DB (C3: never
 * trust a client-provided rating). An invalid time control and an unknown
 * profile are refused with a reason, so the client stops searching [ACKS].
 * A join from a new socket of a player who is already queued (the client's
 * automatic re-queue after a reconnect) moves the entry to that socket.
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
    if (!profile) return PROFILE_NOT_FOUND;
    const verifiedUser = {
        id: profile.id,
        username: profile.username,
        rating: profile[ratingField(timeControl)] ?? DEFAULT_RATING,
        games_played: profile.games_played ?? 0,
    };
    await joinQueue(mm, {
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
 * Claim a pair, create the DB game and Redis state, and notify both sockets.
 * Nothing happens when the claim fails (either player left, or another pass
 * claimed one of them first).
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
    const { queue, gameStore, emitter, random, now, local } = mm;
    if (!(await queue.claimPair(p1, p2))) return;
    local.delete(p1.user_id);
    local.delete(p2.user_id);

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
 * Keep this instance's entries alive; forget the ones that are gone (claimed
 * by another instance's pass, or removed).
 * @param {Matchmaker} mm
 */
async function refreshLocalEntries({ queue, local }) {
    if (local.size === 0) return;
    const alive = new Set(await queue.touch([...local.keys()]));
    for (const userId of [...local.keys()]) if (!alive.has(userId)) local.delete(userId);
}

/**
 * The pairing pass proper: pair what the queue holds, then broadcast its size.
 * @param {Matchmaker} mm
 */
async function pairQueued(mm) {
    for (const [p1, p2] of pairing.planPairs(await mm.queue.list(), mm.now)) {
        await createGame(mm, p1, p2);
    }
    mm.searching.count = await mm.queue.size();
    mm.emitter.toAll('queue_status', { players_searching: mm.searching.count });
}

/**
 * One tick: refresh this instance's entries; if this instance wins the
 * pairing lock, pair (longest-waiting first) and broadcast the queue size.
 * Instances that do not hold the lock only update their queue-size snapshot.
 * @param {Matchmaker} mm
 */
async function matchPlayers(mm) {
    await refreshLocalEntries(mm);
    const token = mm.nextToken();
    if (!(await mm.queue.acquirePairingLock(token, mm.lockTtlMs))) {
        mm.searching.count = await mm.queue.size();
        return;
    }
    try {
        await pairQueued(mm);
    } finally {
        await mm.queue.releasePairingLock(token);
    }
}

/**
 * Run `fn`, logging instead of rejecting: socket handlers call leave without
 * awaiting it, so a Redis error must not become an unhandled rejection.
 * @param {string} what
 * @param {() => Promise<unknown>} fn
 */
async function logFailure(what, fn) {
    try {
        await fn();
    } catch (e) {
        log.error(`[matchmaking] ${what} failed:`, /** @type {Error} */ (e).message);
    }
}

/**
 * @param {Matchmaker} mm
 * @param {string} userId
 */
async function leaveQueue(mm, userId) {
    mm.local.delete(userId);
    await mm.queue.remove(userId);
}

/**
 * Drop the queue entry this instance made for a disconnected socket.
 * @param {Matchmaker} mm
 * @param {string} socketId
 */
async function leaveQueueBySocket(mm, socketId) {
    const users = [...mm.local.entries()].filter(([, sid]) => sid === socketId).map(([userId]) => userId);
    for (const userId of users) {
        mm.local.delete(userId);
        await mm.queue.remove(userId, socketId);
    }
}

/**
 * @param {MatchmakingDeps} deps
 */
function createMatchmakingService({
    now = () => Date.now(),
    random = () => Math.random(),
    instanceId = randomUUID(),
    lockTtlMs = PAIRING_LOCK_TTL_MS,
    ...rest
}) {
    let seq = 0;
    /** @type {Matchmaker} */
    const mm = {
        ...rest,
        now,
        random,
        instanceId,
        lockTtlMs,
        local: new Map(),
        searching: { count: 0 },
        nextToken: () => `${instanceId}:${++seq}`,
    };

    return {
        /** @param {Parameters<typeof joinQueue>[1]} p */
        joinQueue: (p) => joinQueue(mm, p),
        /** @type {(data: Parameters<typeof requestMatch>[1], socketId: string) => ReturnType<typeof requestMatch>} */
        requestMatch: (data, socketId) => requestMatch(mm, data, socketId),
        /** Never rejects (failures are logged). @param {string} userId */
        leaveQueue: (userId) => logFailure('leaveQueue', () => leaveQueue(mm, userId)),
        /** Never rejects (failures are logged). @param {string} socketId */
        leaveQueueBySocket: (socketId) => logFailure('leaveQueueBySocket', () => leaveQueueBySocket(mm, socketId)),
        /** @type {(p1: QueueEntry, p2: QueueEntry) => Promise<void>} */
        createGame: (p1, p2) => createGame(mm, p1, p2),
        matchPlayers: () => matchPlayers(mm),
        getSearchRadius: pairing.getSearchRadius,
        /** @param {string} userId */
        queuedEntry: (userId) => mm.queue.get(userId),
        /** User ids in the queue, longest-waiting first. */
        queuedUserIds: async () => (await mm.queue.list()).map((e) => e.user_id),
        /** Reads the shared queue size (and updates the snapshot). */
        queueSize: async () => (mm.searching.count = await mm.queue.size()),
        /** Last queue size this instance saw (each pass, join): synchronous, at most ~1 s old. */
        searchingCount: () => mm.searching.count,
    };
}

module.exports = { createMatchmakingService };
