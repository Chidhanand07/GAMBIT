// @ts-check
/**
 * Legacy seam: `new MatchmakingService(io)` starts the 1 s pairing loop.
 * Queue and pairing logic live in src/services/matchmakingService.js; the
 * queue itself lives in Redis, shared by every instance [MULTI-INSTANCE].
 */
const { supabase } = require('../supabase');
// Loaded after ../supabase, as the original lazy require did.
const gameStore = require('../lib/gameStore');
const redis = require('../lib/redis');
const { createMatchmakingQueueRepository } = require('../src/repositories/matchmakingQueueRepository');
const { log } = require('../src/observability/log');
const { createGamesRepository } = require('../src/repositories/gamesRepository');
const { createProfilesRepository } = require('../src/repositories/profilesRepository');
const { createMatchmakingService } = require('../src/services/matchmakingService');
const { createIoEmitter } = require('../src/services/emitter');

const PAIRING_INTERVAL_MS = 1000;

class MatchmakingService {
    /**
     * @param {import('../src/services/emitter').IoLike} io
     */
    constructor(io) {
        this.io = io;
        this.service = createMatchmakingService({
            gamesRepo: createGamesRepository(supabase),
            profilesRepo: createProfilesRepository(supabase),
            gameStore,
            queue: createMatchmakingQueueRepository(redis),
            emitter: createIoEmitter(io),
        });
        this._interval = setInterval(() => {
            this.matchPlayers().catch((e) => log.error('[matchmaking] pairing pass failed:', e.message));
        }, PAIRING_INTERVAL_MS);
    }

    /**
     * @param {{ id: string, username: string, rating?: number | null, games_played?: number | null }} user
     * @param {string} socketId
     * @param {unknown} timeControl
     * @param {unknown} increment
     * @param {boolean} [isRated]
     */
    // eslint-disable-next-line max-params -- legacy public signature pinned by __tests__/matchmaking.test.js
    joinQueue(user, socketId, timeControl, increment, isRated) {
        return this.service.joinQueue({ user, socketId, timeControl, increment, isRated });
    }

    /** @param {string} userId */
    leaveQueue(userId) {
        return this.service.leaveQueue(userId);
    }

    /**
     * The queue entry for a user, or null (inspection for tests and tools).
     * @param {string} userId
     */
    queuedEntry(userId) {
        return this.service.queuedEntry(userId);
    }

    /** Queued user ids, longest-waiting first. */
    queuedUserIds() {
        return this.service.queuedUserIds();
    }

    /** Players searching, read from the shared queue. */
    queueSize() {
        return this.service.queueSize();
    }

    /** Last queue size this instance saw (synchronous; for GET /api/matchmaking/status). */
    searchingCount() {
        return this.service.searchingCount();
    }

    destroy() {
        clearInterval(this._interval);
    }

    /** @param {number} elapsedSec */
    getSearchRadius(elapsedSec) {
        return this.service.getSearchRadius(elapsedSec);
    }

    matchPlayers() {
        return this.service.matchPlayers();
    }

    /**
     * @param {import('../src/domain/matchmaking/pairing').QueueEntry} p1
     * @param {import('../src/domain/matchmaking/pairing').QueueEntry} p2
     */
    createGame(p1, p2) {
        return this.service.createGame(p1, p2);
    }
}

module.exports = MatchmakingService;
