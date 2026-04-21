const { supabase } = require('../supabase');

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

        const isProvisional = (user.games_played || 0) < 5;
        const rating = user.rating || 1200;

        this.queue.set(user.id, {
            user_id: user.id,
            username: user.username,
            rating,
            isProvisional,
            time_control: timeControl,
            increment,
            isRated,
            joined_at: Date.now(),
            socketId
        });
        
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
        if (elapsedSec <= 10) return 50;
        if (elapsedSec <= 20) return 100;
        if (elapsedSec <= 35) return 150;
        if (elapsedSec <= 60) return 250;
        if (elapsedSec <= 120) return 400;
        return 9999;
    }

    async matchPlayers() {
        const players = Array.from(this.queue.values());
        const paired = new Set();
        
        // Sort by longest waiting
        players.sort((a, b) => a.joined_at - b.joined_at);

        for (let i = 0; i < players.length; i++) {
            let p1 = players[i];
            if (paired.has(p1.user_id)) continue;
            
            let p1Elapsed = (Date.now() - p1.joined_at) / 1000;
            let radius1 = this.getSearchRadius(p1Elapsed);

            let bestMatch = null;
            let longestWait = -1;

            for (let j = i + 1; j < players.length; j++) {
                let p2 = players[j];
                if (paired.has(p2.user_id)) continue;
                if (p1.time_control !== p2.time_control) continue;
                
                let p2Elapsed = (Date.now() - p2.joined_at) / 1000;
                let radius2 = this.getSearchRadius(p2Elapsed);

                // Check Rating compatibility
                let isMatch = false;
                
                if (p1.isProvisional && p2.isProvisional) {
                    isMatch = true;
                } else if (p1.isProvisional) {
                    isMatch = (p2.rating >= 800 && p2.rating <= 1400);
                } else if (p2.isProvisional) {
                    isMatch = (p1.rating >= 800 && p1.rating <= 1400);
                } else {
                    let diff = Math.abs(p1.rating - p2.rating);
                    if (diff <= radius1 || diff <= radius2) {
                        isMatch = true;
                    }
                }

                if (isMatch) {
                    // Pick the one waiting the longest if multiple candidates exist 
                    // (since outer loop and inner loop are sorted by joined_at, the first match found is implicitly the longest waiting available match)
                    bestMatch = p2;
                    break;
                }
            }

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
        const { parseIncrement } = require('./clock')
        const mins = parseInt(p1.time_control) || 10
        const clockMs = mins * 60 * 1000

        await setGame(data.id, {
            id: data.id,
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            whiteId: white.user_id,
            blackId: black.user_id,
            whiteClockMs: clockMs,
            blackClockMs: clockMs,
            activeSide: 'w',
            status: 'active',
            result: null,
            reason: null,
            moveLog: [],
            timeControl: p1.time_control,
            incrementMs: parseIncrement(p1.time_control),
            isRated: p1.isRated ?? true,
            lastMoveAt: null,
            disconnectInfo: null,
        })
        await addActiveGame(data.id)

        this.io.to(white.socketId).emit('match_found', { ...data, color: 'white', opponent: black });
        this.io.to(black.socketId).emit('match_found', { ...data, color: 'black', opponent: white });
    }
}

module.exports = MatchmakingService;
