const { supabase } = require('../supabase');
const { ratingField } = require('../src/domain/timeControl');
const glicko = require('../src/domain/rating/glicko');

class RatingService {
    calculateNewRatings(params) {
        return glicko.calculateNewRatings(params);
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

            // Stats always update (rated and unrated)
            const whiteUpdate = glicko.statsAfterGame(wp, result, 'white');
            const blackUpdate = glicko.statsAfterGame(bp, result, 'black');

            let whiteOld = wp[field] ?? glicko.DEFAULT_RATING;
            let blackOld = bp[field] ?? glicko.DEFAULT_RATING;
            let newRatings = null;

            // Rating column only updates for rated games
            if (isRated) {
                newRatings = this.calculateNewRatings(glicko.glickoInputs({
                    whiteRating: whiteOld, whiteProfile: wp,
                    blackRating: blackOld, blackProfile: bp,
                    outcome: result,
                }));
                whiteUpdate[field] = glicko.cappedRating(whiteOld, newRatings.white.rating);
                blackUpdate[field] = glicko.cappedRating(blackOld, newRatings.black.rating);
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
        return ratingField(timeControl);
    }
}

module.exports = new RatingService();
