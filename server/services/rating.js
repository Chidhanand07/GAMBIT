const { supabase } = require('../supabase');

const GLICKO_SETTINGS = { tau: 0.5, rating: 1200, rd: 350, vol: 0.06 };

class RatingService {
    constructor() {
        this.glicko2 = require('glicko2');
    }

    calculateNewRatings({ whiteRating = 1200, whiteRD = 350, whiteVol = 0.06,
                           blackRating = 1200, blackRD = 350, blackVol = 0.06, result }) {
        const ranking = new this.glicko2.Glicko2(GLICKO_SETTINGS);
        const white = ranking.makePlayer(whiteRating, whiteRD, whiteVol);
        const black = ranking.makePlayer(blackRating, blackRD, blackVol);
        ranking.updateRatings([[white, black, result]]);
        return {
            white: { rating: Math.round(white.getRating()), rd: white.getRd(), vol: white.getVol() },
            black: { rating: Math.round(black.getRating()), rd: black.getRd(), vol: black.getVol() },
        };
    }

    // Call after any game ends. result: 'white' | 'black' | 'draw'
    // isRated=true updates rating column; both rated and unrated update stats.
    // Returns { white: { oldRating, newRating, change }, black: ... } for rated games, null for unrated.
    async processGameEnd(gameId, whiteId, blackId, result, timeControl, isRated = true) {
        try {
            // Select base columns only; rating_rd/vol are optional and may not exist yet
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, rating_rapid, rating_blitz, rating_bullet, rating_classical, rating_rd, rating_vol, games_played, wins, losses, draws')
                .in('id', [whiteId, blackId]);

            if (!profiles || profiles.length < 2) return null;

            const wp = profiles.find(p => p.id === whiteId);
            const bp = profiles.find(p => p.id === blackId);
            if (!wp || !bp) return null;

            const field = this._ratingField(timeControl);
            const whiteWon = result === 'white';
            const blackWon = result === 'black';
            const isDraw = result === 'draw';

            // Stats always update (rated and unrated)
            const whiteUpdate = {
                games_played: (wp.games_played ?? 0) + 1,
                wins: (wp.wins ?? 0) + (whiteWon ? 1 : 0),
                losses: (wp.losses ?? 0) + (blackWon ? 1 : 0),
                draws: (wp.draws ?? 0) + (isDraw ? 1 : 0),
            };
            const blackUpdate = {
                games_played: (bp.games_played ?? 0) + 1,
                wins: (bp.wins ?? 0) + (blackWon ? 1 : 0),
                losses: (bp.losses ?? 0) + (whiteWon ? 1 : 0),
                draws: (bp.draws ?? 0) + (isDraw ? 1 : 0),
            };

            let whiteOld = wp[field] ?? 1200;
            let blackOld = bp[field] ?? 1200;
            let newRatings = null;

            // Rating column only updates for rated games
            if (isRated) {
                const glickoResult = whiteWon ? 1 : blackWon ? 0 : 0.5;
                newRatings = this.calculateNewRatings({
                    whiteRating: whiteOld,
                    whiteRD: Math.min(wp.rating_rd ?? 100, 150),
                    whiteVol: wp.rating_vol ?? 0.06,
                    blackRating: blackOld,
                    blackRD: Math.min(bp.rating_rd ?? 100, 150),
                    blackVol: bp.rating_vol ?? 0.06,
                    result: glickoResult,
                });
                const MAX_CHANGE = 50;
                const wChange = Math.max(-MAX_CHANGE, Math.min(MAX_CHANGE, newRatings.white.rating - whiteOld));
                const bChange = Math.max(-MAX_CHANGE, Math.min(MAX_CHANGE, newRatings.black.rating - blackOld));
                whiteUpdate[field] = Math.max(100, Math.round(whiteOld + wChange));
                blackUpdate[field] = Math.max(100, Math.round(blackOld + bChange));
                newRatings.white.rating = whiteUpdate[field];
                newRatings.black.rating = blackUpdate[field];
                whiteUpdate.rating_rd = newRatings.white.rd;
                whiteUpdate.rating_vol = newRatings.white.vol;
                blackUpdate.rating_rd = newRatings.black.rd;
                blackUpdate.rating_vol = newRatings.black.vol;
            }

            const [wRes, bRes] = await Promise.all([
                supabase.from('profiles').update(whiteUpdate).eq('id', whiteId),
                supabase.from('profiles').update(blackUpdate).eq('id', blackId),
            ]);
            if (wRes.error) console.error('[rating] white update error:', wRes.error.message);
            if (bRes.error) console.error('[rating] black update error:', bRes.error.message);

            if (!isRated || !newRatings) return null;

            return {
                white: { oldRating: whiteOld, newRating: newRatings.white.rating, change: newRatings.white.rating - whiteOld },
                black: { oldRating: blackOld, newRating: newRatings.black.rating, change: newRatings.black.rating - blackOld },
            };
        } catch (e) {
            console.error('[rating] processGameEnd error:', e.message);
            return null;
        }
    }

    _ratingField(timeControl) {
        const mins = parseInt(timeControl) || 10;
        if (mins <= 2) return 'rating_bullet';
        if (mins <= 5) return 'rating_blitz';
        if (mins <= 60) return 'rating_rapid';
        return 'rating_classical';
    }
}

module.exports = new RatingService();
