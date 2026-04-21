const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const MatchmakingService = require('./services/matchmaking');
const friendsService = require('./services/friends');
const ratingService = require('./services/rating');
const { supabase } = require('./supabase');
const { getGame, setGame, updateGame, addActiveGame, removeActiveGame } = require('./lib/gameStore');
const { startGlobalClock, parseIncrement } = require('./services/clock');

const app = express();
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      process.env.FRONTEND_URL,
    ].filter(Boolean);
    // Allow any vercel.app subdomain
    if (!origin || allowed.includes(origin) || /\.vercel\.app$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || /\.vercel\.app$/.test(origin) || origin === process.env.FRONTEND_URL) {
        callback(null, true);
      } else {
        callback(null, true); // permissive fallback for WS
      }
    },
    credentials: true,
  },
  transports: ['websocket', 'polling'], // prefer WebSocket, fall back to polling
});

const matchmaking = new MatchmakingService(io);

// Start single global clock ticker (replaces all per-game setInterval timers)
startGlobalClock(io);

// Track authenticated userId → current socketId for reconnect support
const userSockets = new Map();
// socketId → userId (reverse lookup for disconnect)
const socketUsers = new Map();
// userId → gameId for currently active games
const userActiveGame = new Map();

// ── Auth helper — defined first so all routes below can call it ───────────────
async function requireUserId(req, res) {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing Authorization header' });
        return null;
    }
    const token = authHeader.slice(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return null;
    }
    return user.id;
}

// Endpoints
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/matchmaking/status', (req, res) => res.json({ players_searching: matchmaking.queue.size }));

app.get('/api/users/check-username', async (req, res) => {
    try {
        const username = req.query.u;
        if (!username) return res.status(400).json({ error: 'Missing username parameter' });
        
        const { data } = await supabase
            .from('profiles')
            .select('username')
            .eq('username', username)
            .single();
            
        res.json({ available: !data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/auth/register-profile', async (req, res) => {
    try {
        const userId = await requireUserId(req, res);
        if (!userId) return;
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Missing mandatory fields' });

        const { error } = await supabase
            .from('profiles')
            .insert([{
                id: userId,
                username: username,
                rating_bullet: 1200,
                rating_blitz: 1200,
                rating_rapid: 1200,
                rating_classical: 1200,
                games_played: 0,
                wins: 0,
                losses: 0,
                draws: 0
            }]);

        if (error) return res.status(400).json({ error: error.message });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/analysis/engine', async (req, res) => {
    try {
        const { fen, depth } = req.body;
        const engineUrl = process.env.ENGINE_URL || 'http://localhost:8001';
        const response = await fetch(`${engineUrl}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen, depth: depth || 18 })
        });
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/games/private/create', async (req, res) => {
    try {
        const userId = await requireUserId(req, res);
        if (!userId) return;
        const { timeControl, color, isRated } = req.body;
        const game = await friendsService.createPrivateGame(userId, timeControl, color, isRated);
        res.json({ token: game.invite_token, game_id: game.id, url: `/join/${game.invite_token}` });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.get('/api/games/join/:token', async (req, res) => {
    try {
        const game = await friendsService.getGameByToken(req.params.token);
        if (!game) return res.status(404).json({ error: 'Not found or expired' });
        res.json(game);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.put('/api/profile', async (req, res) => {
    try {
        const userId = await requireUserId(req, res);
        if (!userId) return;
        const { displayName, bio, country, sex, isPublic } = req.body;

        const { error } = await supabase
            .from('profiles')
            .update({ display_name: displayName, bio, country, sex, is_public: isPublic })
            .eq('id', userId);

        if (error) return res.status(400).json({ error: error.message });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/games/join/:token', async (req, res) => {
    try {
        const userId = await requireUserId(req, res);
        if (!userId) return;
        const game = await friendsService.joinPrivateGame(req.params.token, userId);
        res.json(game);
        
        // Notify any waiting clients via socket using game room
        io.to(`game_${game.id}`).emit('game_start', game);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// ── Friend system ──────────────────────────────────────────────────────────

app.get('/api/friends/status/:username', async (req, res) => {
    try {
        const meId = await requireUserId(req, res); if (!meId) return;
        const { data: them } = await supabase.from('profiles').select('id').eq('username', req.params.username).single();
        if (!them) return res.json({ status: 'none' });
        if (them.id === meId) return res.json({ status: 'self' });
        const { data } = await supabase.from('friendships')
            .select('status, requester_id')
            .or(`and(requester_id.eq.${meId},addressee_id.eq.${them.id}),and(requester_id.eq.${them.id},addressee_id.eq.${meId})`)
            .maybeSingle();
        if (!data) return res.json({ status: 'none' });
        if (data.status === 'accepted') return res.json({ status: 'friends' });
        if (data.status === 'pending') {
            return res.json({ status: data.requester_id === meId ? 'pending_sent' : 'pending_received' });
        }
        res.json({ status: 'none' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/friends/request', async (req, res) => {
    try {
        const meId = await requireUserId(req, res); if (!meId) return;
        const { addressee_username } = req.body;
        if (!addressee_username) return res.status(400).json({ error: 'addressee_username required' });
        const { data: them } = await supabase.from('profiles').select('id').eq('username', addressee_username).single();
        if (!them) return res.status(404).json({ error: 'User not found' });
        if (them.id === meId) return res.status(400).json({ error: 'Cannot friend yourself' });
        const { error } = await supabase.from('friendships').insert({ requester_id: meId, addressee_id: them.id });
        if (error) return res.status(400).json({ error: error.message });
        // H3: notify addressee of the incoming friend request
        const { data: me } = await supabase.from('profiles').select('username').eq('id', meId).maybeSingle();
        await insertNotification(them.id, 'friend_request', { from_user_id: meId, from_username: me?.username });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/friends', async (req, res) => {
    try {
        const meId = await requireUserId(req, res); if (!meId) return;
        const { data, error } = await supabase.from('friendships')
            .select('id, requester_id, addressee_id, status, requester:profiles!friendships_requester_id_fkey(username,avatar_url,rating_rapid), addressee:profiles!friendships_addressee_id_fkey(username,avatar_url,rating_rapid)')
            .or(`requester_id.eq.${meId},addressee_id.eq.${meId}`)
            .eq('status', 'accepted');
        if (error) return res.status(500).json({ error: error.message });
        const seen = new Set();
        const friends = [];
        for (const f of data || []) {
            const friend = f.requester_id === meId ? f.addressee : f.requester;
            if (!friend || seen.has(friend.username)) continue;
            seen.add(friend.username);
            friends.push({ ...friend, friendship_id: f.id });
        }
        res.json(friends);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/friends/:id/accept', async (req, res) => {
    try {
        const meId = await requireUserId(req, res); if (!meId) return;
        const { error } = await supabase.from('friendships')
            .update({ status: 'accepted' })
            .eq('id', req.params.id)
            .eq('addressee_id', meId);
        if (error) return res.status(400).json({ error: error.message });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/friends/:id', async (req, res) => {
    try {
        const meId = await requireUserId(req, res); if (!meId) return;
        const { error } = await supabase.from('friendships').delete()
            .eq('id', req.params.id)
            .or(`requester_id.eq.${meId},addressee_id.eq.${meId}`);
        if (error) return res.status(400).json({ error: error.message });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Pending friend requests (incoming — where I am the addressee)
app.get('/api/friends/requests/pending', async (req, res) => {
    try {
        const meId = await requireUserId(req, res); if (!meId) return;
        const { data, error } = await supabase.from('friendships')
            .select('id, created_at, requester:profiles!friendships_requester_id_fkey(id,username,display_name,avatar_url,rating_rapid)')
            .eq('addressee_id', meId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        res.json(data ?? []);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/friends/:id/decline', async (req, res) => {
    try {
        const meId = await requireUserId(req, res); if (!meId) return;
        const { error } = await supabase.from('friendships')
            .update({ status: 'declined' })
            .eq('id', req.params.id)
            .eq('addressee_id', meId);
        if (error) return res.status(400).json({ error: error.message });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Notifications ──────────────────────────────────────────────────────────
app.get('/api/notifications', async (req, res) => {
    try {
        const meId = await requireUserId(req, res); if (!meId) return;
        const { data, error } = await supabase.from('notifications')
            .select('*')
            .eq('user_id', meId)
            .order('created_at', { ascending: false })
            .limit(30);
        if (error) return res.status(500).json({ error: error.message });
        res.json(data ?? []);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notifications/read-all', async (req, res) => {
    try {
        const meId = await requireUserId(req, res); if (!meId) return;
        const { error } = await supabase.from('notifications')
            .update({ read: true })
            .eq('user_id', meId)
            .eq('read', false);
        if (error) return res.status(400).json({ error: error.message });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notifications/:id/read', async (req, res) => {
    try {
        const meId = await requireUserId(req, res); if (!meId) return;
        const { error } = await supabase.from('notifications')
            .update({ read: true })
            .eq('id', req.params.id)
            .eq('user_id', meId);
        if (error) return res.status(400).json({ error: error.message });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Friend request notification helper ───────────────────────────────────────
async function insertNotification(userId, type, payload = {}) {
    await supabase.from('notifications').insert({
        user_id: userId,
        type,
        payload,
        read: false,
        created_at: new Date().toISOString(),
    });
}

// Socket.io logic
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // User authenticates their socket
    socket.on('authenticate', async (userId) => {
        userSockets.set(userId, socket.id);
        socketUsers.set(socket.id, userId);
        socket.join(`user_${userId}`);
        socket.emit('authenticated', { userId });

        // If reconnecting while in an active game, clear the disconnect grace period in Redis
        const gameId = userActiveGame.get(userId);
        if (gameId) {
            const game = await getGame(gameId);
            if (game && game.status === 'active' && game.disconnectInfo?.userId === userId) {
                await setGame(gameId, { ...game, disconnectInfo: null, lastMoveAt: Date.now() });
                socket.join(`game_${gameId}`);
                io.to(`game_${gameId}`).emit('opponent_reconnected', { userId });
                socket.emit('clock_sync', { whiteMs: game.whiteClockMs, blackMs: game.blackClockMs });
            }
        }
    });

    socket.on('join_queue', async (data) => {
        if (!data?.user?.id) return;
        // C3 fix: look up actual rating from DB — never trust client-provided rating
        const { data: profile } = await supabase.from('profiles')
            .select('id, username, rating_bullet, rating_blitz, rating_rapid, rating_classical, games_played')
            .eq('id', data.user.id)
            .maybeSingle();
        if (!profile) return;
        const mins = parseInt(data.time_control) || 10;
        const ratingField = mins <= 2 ? 'rating_bullet' : mins <= 5 ? 'rating_blitz' : mins <= 60 ? 'rating_rapid' : 'rating_classical';
        const verifiedUser = {
            id: profile.id,
            username: profile.username,
            rating: profile[ratingField] ?? 1200,
            games_played: profile.games_played ?? 0,
        };
        matchmaking.joinQueue(verifiedUser, socket.id, data.time_control, data.increment, data.is_rated ?? true);
    });

    socket.on('leave_queue', (userId) => {
        matchmaking.leaveQueue(userId);
    });

    socket.on('join_game', async (gameId) => {
        socket.join(`game_${gameId}`);
        const userId = socketUsers.get(socket.id);
        if (userId) userActiveGame.set(userId, gameId);

        let game = await getGame(gameId);

        // Server-restart fallback: restore from Supabase if Redis has no state
        if (!game) {
            const { data: dbGame } = await supabase
                .from('games')
                .select('id, status, white_id, black_id, is_rated, time_control, fen, white_clock_ms, black_clock_ms')
                .eq('id', gameId)
                .maybeSingle();

            if (dbGame && dbGame.status === 'active') {
                const mins = parseInt(dbGame.time_control) || 10;
                const clockMs = mins * 60 * 1000;
                const whiteClockMs = dbGame.white_clock_ms ?? clockMs;
                const blackClockMs = dbGame.black_clock_ms ?? clockMs;
                const fenTurn = dbGame.fen ? (dbGame.fen.split(' ')[1] ?? 'w') : 'w';
                game = {
                    id: gameId,
                    fen: dbGame.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                    whiteId: dbGame.white_id,
                    blackId: dbGame.black_id,
                    whiteClockMs,
                    blackClockMs,
                    activeSide: fenTurn,
                    status: 'active',
                    result: null,
                    reason: null,
                    moveLog: [],
                    timeControl: dbGame.time_control,
                    incrementMs: parseIncrement(dbGame.time_control),
                    isRated: dbGame.is_rated ?? false,
                    lastMoveAt: (dbGame.white_clock_ms !== null || dbGame.black_clock_ms !== null) ? Date.now() : null,
                    disconnectInfo: null,
                };
                await setGame(gameId, game);
                await addActiveGame(gameId);
            } else if (dbGame && dbGame.status === 'completed') {
                const result = dbGame.result === 'white' ? 'White wins' : dbGame.result === 'black' ? 'Black wins' : 'Draw';
                socket.emit('game_end', {
                    game_id: gameId, result, reason: 'Game over',
                    white_id: dbGame.white_id, black_id: dbGame.black_id,
                });
                return;
            }
        }

        if (!game) return;

        // If game is already completed in Redis, notify joining client
        if (game.status === 'completed') {
            const result = game.result === 'white' ? 'White wins' : game.result === 'black' ? 'Black wins' : 'Draw';
            socket.emit('game_end', {
                game_id: gameId, result, reason: game.reason || 'Game over',
                white_id: game.whiteId, black_id: game.blackId,
            });
            return;
        }

        // Compute real remaining time for the active player
        const now = Date.now();
        let whiteMs = game.whiteClockMs;
        let blackMs = game.blackClockMs;
        if (game.lastMoveAt && !game.disconnectInfo) {
            const elapsed = now - game.lastMoveAt;
            if (game.activeSide === 'w') whiteMs = Math.max(0, game.whiteClockMs - elapsed);
            else blackMs = Math.max(0, game.blackClockMs - elapsed);
        }

        socket.emit('game_state_sync', {
            fen: game.fen,
            moveLog: game.moveLog || [],
            whiteMs,
            blackMs,
            activeSide: game.activeSide,
            clockActive: game.lastMoveAt !== null,
            whiteId: game.whiteId,
            blackId: game.blackId,
        });
    });
    
    socket.on('spectate_game', async (gameId) => {
        // H8: verify game exists before joining its room
        const game = await getGame(gameId);
        if (!game) return;
        socket.join(`game_${gameId}`);
    });

    socket.on('make_move', async (data) => {
        const game = await getGame(data.game_id);
        if (!game || game.status !== 'active') return;

        // C2 fix: verify the moving socket is the player whose turn it is
        const movingUserId = socketUsers.get(socket.id);
        const expectedId = game.activeSide === 'w' ? game.whiteId : game.blackId;
        if (!movingUserId || movingUserId !== expectedId) return;

        if (game.fen && data.move) {
            try {
                const engineUrl = process.env.ENGINE_URL || 'http://localhost:8001';
                const validationRes = await fetch(`${engineUrl}/validate-move`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fen: game.fen, move: data.move }),
                });
                if (validationRes.ok) {
                    const validation = await validationRes.json();
                    if (!validation.valid) {
                        console.warn('[make_move] illegal move rejected:', data.move, 'from', game.fen);
                        return;
                    }
                    data.fen = validation.new_fen;
                }
            } catch (e) {
                console.warn('[make_move] engine validation unavailable:', e.message);
            }
        }

        const now = Date.now();
        const movedSide = game.activeSide;
        let whiteClockMs = game.whiteClockMs;
        let blackClockMs = game.blackClockMs;

        if (game.lastMoveAt) {
            const elapsed = now - game.lastMoveAt;
            if (movedSide === 'w') whiteClockMs = Math.max(0, whiteClockMs - elapsed);
            else blackClockMs = Math.max(0, blackClockMs - elapsed);
        }

        // Add increment to the player who just moved
        const incMs = game.incrementMs ?? 0;
        if (movedSide === 'w') whiteClockMs += incMs;
        else blackClockMs += incMs;

        const newSide = movedSide === 'w' ? 'b' : 'w';
        const newMoveLog = [...(game.moveLog || []), { move: data.move, fen: data.fen, san: data.san }];

        await updateGame(data.game_id, {
            fen: data.fen,
            whiteClockMs,
            blackClockMs,
            activeSide: newSide,
            lastMoveAt: now,
            moveLog: newMoveLog,
        });

        data.whiteMs = whiteClockMs;
        data.blackMs = blackClockMs;
        io.to(`game_${data.game_id}`).emit('move_made', data);

        const moveNumber = newMoveLog.length; // sequential index (1-based)
        const movedColor = movedSide === 'w' ? 'white' : 'black';
        const clockAfterMove = movedSide === 'w' ? Math.round(whiteClockMs) : Math.round(blackClockMs);

        // Async persist to Supabase — only FEN (H10: clocks flushed on game_end only)
        Promise.all([
            supabase.from('games').update({
                fen: data.fen,
            }).eq('id', data.game_id),
            supabase.from('moves').insert({
                game_id: data.game_id,
                move_number: moveNumber,
                color: movedColor,
                uci: data.move,
                san: data.san,
                fen_after: data.fen,
                clock_ms_remaining: clockAfterMove,
            }),
        ]).then(([gRes, mRes]) => {
            if (gRes.error) console.error('[make_move] game persist:', gRes.error.message);
            if (mRes.error) console.error('[make_move] move persist:', mRes.error.message);
        });
    });

    socket.on('send_message', async (data) => {
        // H5: validate sender is a participant of this game
        const senderId = socketUsers.get(socket.id);
        if (!senderId || !data.game_id) return;
        const game = await getGame(data.game_id);
        if (!game || (senderId !== game.whiteId && senderId !== game.blackId)) return;

        // Override from field with server-verified identity
        const safeData = { ...data, from_user_id: senderId };

        // M4: persist chat message to DB
        supabase.from('messages').insert({
            game_id: data.game_id,
            user_id: senderId,
            content: data.message,
            created_at: new Date().toISOString(),
        }).then(({ error }) => { if (error) console.error('[send_message] persist:', error.message); });

        io.to(`game_${data.game_id}`).emit('chat_message', safeData);
    });

    socket.on('game_end', async (data) => {
        // C1 fix: always read player IDs and game state from Redis — never trust client payload
        const game = await getGame(data.game_id);
        if (!game || game.status !== 'active') return; // reject if not active or already ended

        const whiteId = game.whiteId;
        const blackId = game.blackId;
        if (!whiteId || !blackId) return;

        const outcome = data.result?.toLowerCase().includes('white') ? 'white'
            : data.result?.toLowerCase().includes('black') ? 'black' : 'draw';

        await setGame(data.game_id, { ...game, status: 'completed', result: outcome });
        await removeActiveGame(data.game_id);

        // Broadcast with server-verified player IDs
        io.to(`game_${data.game_id}`).emit('game_end', {
            ...data,
            white_id: whiteId,
            black_id: blackId,
        });

        // Clean up active game tracking
        for (const [uid, gid] of userActiveGame.entries()) {
            if (gid === data.game_id) userActiveGame.delete(uid);
        }

        // Idempotent DB update — only applies if game is still marked active
        const { data: updated } = await supabase.from('games').update({
            status: 'completed',
            result: outcome === 'draw' ? 'draw' : null,
            winner_id: outcome === 'white' ? whiteId : outcome === 'black' ? blackId : null,
            ended_at: new Date().toISOString(),
            final_fen: game.fen ?? null,
            white_clock_ms: Math.round(game.whiteClockMs ?? 0),
            black_clock_ms: Math.round(game.blackClockMs ?? 0),
        }).eq('id', data.game_id).eq('status', 'active').select('id').maybeSingle();

        if (!updated) return;

        const changes = await ratingService.processGameEnd(
            data.game_id, whiteId, blackId, outcome,
            game.timeControl ?? data.time_control ?? '10',
            game.isRated ?? data.is_rated ?? false
        );
        if (changes) {
            io.to(`game_${data.game_id}`).emit('rating_updated', changes);
        }
    });

    // ── Rematch request ──────────────────────────────────────────────────────
    socket.on('rematch_request', async (data) => {
        // data: { from_user_id, to_user_id, time_control, is_rated, from_username }
        io.to(`user_${data.to_user_id}`).emit('rematch_request', data);
    });

    socket.on('rematch_accept', async (data) => {
        // data: { from_user_id (original requester), to_user_id (accepter), time_control, is_rated }
        try {
            const game = await friendsService.createPrivateGame(data.from_user_id, data.time_control, 'random', data.is_rated);
            await friendsService.joinPrivateGame(game.invite_token, data.to_user_id);
            // Notify both players
            io.to(`user_${data.from_user_id}`).emit('rematch_ready', { game_id: game.id });
            io.to(`user_${data.to_user_id}`).emit('rematch_ready', { game_id: game.id });
        } catch (e) {
            console.error('[rematch_accept] error:', e.message);
        }
    });

    socket.on('rematch_decline', (data) => {
        io.to(`user_${data.to_user_id}`).emit('rematch_declined');
    });

    // ── Challenge request ─────────────────────────────────────────────────────
    socket.on('challenge_request', async (data) => {
        // data: { from_user_id, to_user_id, from_username, time_control, is_rated, color }
        io.to(`user_${data.to_user_id}`).emit('challenge_request', data);
        // C6: persist notification so recipient gets it even if they reconnect later
        await insertNotification(data.to_user_id, 'challenge', {
            from_user_id: data.from_user_id,
            from_username: data.from_username,
            time_control: data.time_control,
            is_rated: data.is_rated,
            color: data.color,
        });
    });

    socket.on('challenge_accept', async (data) => {
        // data: { from_user_id, to_user_id, time_control, is_rated, color }
        try {
            const challengerColor = data.color === 'random' ? (Math.random() > 0.5 ? 'white' : 'black') : data.color;
            const hostId = challengerColor === 'white' ? data.from_user_id : data.to_user_id;
            const joinId = challengerColor === 'white' ? data.to_user_id : data.from_user_id;
            const game = await friendsService.createPrivateGame(hostId, data.time_control, 'white', data.is_rated);
            await friendsService.joinPrivateGame(game.invite_token, joinId);
            io.to(`user_${data.from_user_id}`).emit('challenge_ready', { game_id: game.id });
            io.to(`user_${data.to_user_id}`).emit('challenge_ready', { game_id: game.id });
        } catch (e) {
            console.error('[challenge_accept] error:', e.message);
        }
    });

    socket.on('challenge_decline', (data) => {
        io.to(`user_${data.from_user_id}`).emit('challenge_declined', { by: data.by_username });
    });

    socket.on('disconnect', async () => {
        // Remove from matchmaking
        for (let [userId, entry] of matchmaking.queue.entries()) {
            if (entry.socketId === socket.id) matchmaking.leaveQueue(userId);
        }

        const userId = socketUsers.get(socket.id);
        socketUsers.delete(socket.id);
        if (userId) userSockets.delete(userId);

        // If this user is in an active game, set disconnectInfo in Redis (global clock handles timeout)
        if (userId && userActiveGame.has(userId)) {
            const gameId = userActiveGame.get(userId);
            const game = await getGame(gameId);

            if (game && game.status === 'active') {
                const now = Date.now();
                let whiteClockMs = game.whiteClockMs;
                let blackClockMs = game.blackClockMs;

                // Snapshot the clock at disconnect time
                if (game.lastMoveAt) {
                    const elapsed = now - game.lastMoveAt;
                    if (game.activeSide === 'w') whiteClockMs = Math.max(0, whiteClockMs - elapsed);
                    else blackClockMs = Math.max(0, blackClockMs - elapsed);
                }

                const disconnectedSide = game.whiteId === userId ? 'white' : 'black';

                await setGame(gameId, {
                    ...game,
                    whiteClockMs,
                    blackClockMs,
                    disconnectInfo: { userId, side: disconnectedSide, at: now },
                });

                // Persist clock snapshot to Supabase
                supabase.from('games').update({
                    white_time_ms: Math.round(whiteClockMs),
                    black_time_ms: Math.round(blackClockMs),
                }).eq('id', gameId).eq('status', 'active').then(() => {});

                io.to(`game_${gameId}`).emit('opponent_disconnected', {
                    userId,
                    timeoutSeconds: 20,
                });
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Node server running on port ${PORT}`);
});
