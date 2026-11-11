const { nanoid } = require('nanoid');
const { supabase } = require('../supabase');
const { createInitialGameState } = require('../src/domain/gameState');

const generateInviteUrl = () => {
    // using a 10 char nanoid as specified
    return nanoid(10);
}

class FriendsService {
    async createPrivateGame(userId, timeControl, color, isRated) {
        const token = generateInviteUrl();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48);

        // Pre-assign colors
        let white_id = null;
        let black_id = null;

        const colorLower = (color || 'random').toLowerCase();
        if (colorLower === 'white') white_id = userId;
        else if (colorLower === 'black') black_id = userId;
        else {
            if (Math.random() > 0.5) white_id = userId;
            else black_id = userId;
        }

        const { data, error } = await supabase.from('games').insert({
            white_id,
            black_id,
            time_control: timeControl,
            status: 'waiting',
            invite_token: token,
            invite_expires_at: expiresAt.toISOString(),
            is_rated: isRated
        }).select().single();

        if (error) throw error;
        return data;
    }

    async getGameByToken(token) {
        // Simplify query — nested profile selects can sometimes cause issues in PostgREST 
        // if the foreign keys are null. We'll fetch the base game and join manually if needed, 
        // but for the join page check, we only need the basic game info first.
        const { data, error } = await supabase.from('games')
            .select(`
                *,
                white:profiles!white_id(username, avatar_url),
                black:profiles!black_id(username, avatar_url)
            `)
            .eq('invite_token', token)
            .maybeSingle();

        if (error) {
            console.error('[FriendsService] getGameByToken error:', error.message);
            return null;
        }
        if (!data) return null;
        
        // Add a 5-minute grace period for clock skew between server and DB
        const now = new Date();
        const expiresAt = new Date(data.invite_expires_at);
        if (expiresAt.getTime() + (5 * 60 * 1000) < now.getTime()) {
            console.warn(`[FriendsService] Token ${token} expired at ${data.invite_expires_at}`);
            return null;
        }

        return data;
    }

    async joinPrivateGame(token, userId) {
        const game = await this.getGameByToken(token);
        if (!game) throw new Error('Invalid or expired token');
        if (game.status !== 'waiting') throw new Error('Game already started');

        let white_id = game.white_id;
        let black_id = game.black_id;

        if (!white_id && !black_id) {
           white_id = game.white_id; // shouldn't happen based on create
        }
        
        if (white_id && white_id === userId) return game; // Creator rejoining
        if (black_id && black_id === userId) return game; 

        if (white_id && !black_id) black_id = userId;
        else if (black_id && !white_id) white_id = userId;

        const { data, error } = await supabase.from('games').update({
            white_id,
            black_id,
            status: 'active',
            started_at: new Date().toISOString()
        }).eq('id', game.id).eq('status', 'waiting').select().maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Game already started or not found');

        // Write initial game state to Redis now that both players are assigned
        const { setGame, addActiveGame } = require('../lib/gameStore')

        await setGame(data.id, createInitialGameState({
            id: data.id,
            whiteId: data.white_id,
            blackId: data.black_id,
            timeControl: data.time_control,
            isRated: data.is_rated ?? false,
        }))
        await addActiveGame(data.id)

        return data;
    }
}

module.exports = new FriendsService();
