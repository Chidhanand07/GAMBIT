// @ts-check
/**
 * Legacy seam: `new MatchmakingService(io)` starts the 1 s pairing loop.
 * Queue and pairing logic live in src/services/matchmakingService.js.
 */
const { supabase } = require('../supabase');
// Loaded after ../supabase, as the original lazy require did.
const gameStore = require('../lib/gameStore');
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
            emitter: createIoEmitter(io),
        });
        /** userId → queue entry; shared with the service. */
        this.queue = this.service.queue;
        this._interval = setInterval(() => this.matchPlayers(), PAIRING_INTERVAL_MS);
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
        this.service.joinQueue({ user, socketId, timeControl, increment, isRated });
    }

    /** @param {string} userId */
    leaveQueue(userId) {
        this.service.leaveQueue(userId);
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
