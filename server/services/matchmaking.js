const { supabase } = require('../supabase');
const pairing = require('../src/domain/matchmaking/pairing');
const { createInitialGameState } = require('../src/domain/gameState');

class MatchmakingService {
    constructor(io) {
        this.io = io;
        // In-memory queue:
        // { userId: { user_id, username, rating, time_control, increment, joined_at, socketId } }
        this.queue = new Map();
        this._interval = setInterval(() => this.matchPlayers(), 1000);
    }

    joinQueue(user, socketId, timeControl, increment, isRated = true) {
        if (this.queue.has(user.id)) return;

        this.queue.set(user.id, pairing.createQueueEntry({
            user, socketId, timeControl, increment, isRated, now: Date.now(),
        }));
        
        this.io.to(socketId).emit('queue_joined', { 
            position: this.queue.size, 
            estimated_wait: 10 
        });
    }

    leaveQueue(userId) {
        this.queue.delete(userId);
    }

    destroy() {
        clearInterval(this._interval);
    }

    getSearchRadius(elapsedSec) {
        return pairing.getSearchRadius(elapsedSec);
    }

    async matchPlayers() {
        // Sort by longest waiting
        const players = pairing.sortByLongestWaiting(Array.from(this.queue.values()));
        const paired = new Set();

        for (let i = 0; i < players.length; i++) {
            const p1 = players[i];
            if (paired.has(p1.user_id)) continue;

            // Candidates are sorted by joined_at, so the first match is the longest-waiting one
            const candidates = players.slice(i + 1).filter((p) => !paired.has(p.user_id));
            const bestMatch = pairing.findOpponent(p1, candidates, () => Date.now());

            if (bestMatch) {
                paired.add(p1.user_id);
                paired.add(bestMatch.user_id);
                await this.createGame(p1, bestMatch);
            }
        }

        // broadcast queue status
        this.io.emit('queue_status', { players_searching: this.queue.size });
    }

    async createGame(p1, p2) {
        this.queue.delete(p1.user_id);
        this.queue.delete(p2.user_id);

        let white, black;
        if (Math.random() > 0.5) { white = p1; black = p2; }
        else { white = p2; black = p1; }

        const { data, error } = await supabase.from('games').insert({
            white_id: white.user_id,
            black_id: black.user_id,
            time_control: p1.time_control,
            increment: p1.increment,
            status: 'active',
            started_at: new Date().toISOString()
        }).select().single();

        if (error || !data) {
            console.error('[matchmaking] createGame error:', error?.message)
            return
        }

        // Write initial game state to Redis
        const { setGame, addActiveGame } = require('../lib/gameStore')

        await setGame(data.id, createInitialGameState({
            id: data.id,
            whiteId: white.user_id,
            blackId: black.user_id,
            timeControl: p1.time_control,
            isRated: p1.isRated ?? true,
        }))
        await addActiveGame(data.id)

        this.io.to(white.socketId).emit('match_found', { ...data, color: 'white', opponent: black });
        this.io.to(black.socketId).emit('match_found', { ...data, color: 'black', opponent: white });
    }
}

module.exports = MatchmakingService;
