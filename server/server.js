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
const { startGlobalClock } = require('./services/clock');
const { buildPgnFromMoveLog } = require('./src/domain/pgn');
const { ratingField } = require('./src/domain/timeControl');
const { clocksAt, clocksAfterMove } = require('./src/domain/clock');
const { gameStateFromRow } = require('./src/domain/gameState');
const { resultLabel, parseOutcome, sideToColor, colorOfPlayer, winnerIdFor } = require('./src/domain/result');
const env = require('./src/config/env');
const { createEngineClient } = require('./src/clients/engineClient');
const { createGamesRepository } = require('./src/repositories/gamesRepository');
const { createMovesRepository } = require('./src/repositories/movesRepository');
const { createMessagesRepository } = require('./src/repositories/messagesRepository');
const { createProfilesRepository } = require('./src/repositories/profilesRepository');
const { createFriendshipsRepository } = require('./src/repositories/friendshipsRepository');
const { createNotificationsRepository } = require('./src/repositories/notificationsRepository');

const engineClient = createEngineClient({ baseUrl: env.engineUrl });
const gamesRepo = createGamesRepository(supabase);
const movesRepo = createMovesRepository(supabase);
const messagesRepo = createMessagesRepository(supabase);
const profilesRepo = createProfilesRepository(supabase);
const friendshipsRepo = createFriendshipsRepository(supabase);
const notificationsRepo = createNotificationsRepository(supabase);

// ── Game Review trigger ──────────────────────────────────────────────────────
// Ask the engine to analyse a finished game (fire-and-forget; engine runs it async
// and writes accuracy/classifications/eval_graph back to the games row).
function triggerGameReview(gameId, moveLog, timeControl) {
  const pgn = buildPgnFromMoveLog(moveLog);
  if (!pgn) return;
  engineClient.analyseGame({ gameId, pgn, timeControl: String(timeControl ?? '10') })
    .then(res => { if (!res.ok) console.warn('[game_review] engine returned', res.status); })
    .catch(e => console.warn('[game_review] trigger failed:', e.message));
}

const app = express();
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      env.frontendUrl(),
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
      if (!origin || /\.vercel\.app$/.test(origin) || origin === env.frontendUrl()) {
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
        
        const { data } = await profilesRepo.findUsernameByUsername(username);
            
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

        const { error } = await profilesRepo.insert([{
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
        const response = await engineClient.analyzePosition({ fen, depth: depth || 18 });
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

        const { error } = await profilesRepo.updateById(userId, { display_name: displayName, bio, country, sex, is_public: isPublic });

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
        const { data: them } = await profilesRepo.findIdByUsername(req.params.username);
        if (!them) return res.json({ status: 'none' });
        if (them.id === meId) return res.json({ status: 'self' });
        const { data } = await friendshipsRepo.findBetween(meId, them.id);
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
        const { data: them } = await profilesRepo.findIdByUsername(addressee_username);
        if (!them) return res.status(404).json({ error: 'User not found' });
        if (them.id === meId) return res.status(400).json({ error: 'Cannot friend yourself' });
        const { error } = await friendshipsRepo.insertRequest(meId, them.id);
        if (error) return res.status(400).json({ error: error.message });
        // H3: notify addressee of the incoming friend request
        const { data: me } = await profilesRepo.findUsernameById(meId);
        await insertNotification(them.id, 'friend_request', { from_user_id: meId, from_username: me?.username });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/friends', async (req, res) => {
    try {
        const meId = await requireUserId(req, res); if (!meId) return;
        const { data, error } = await friendshipsRepo.listAccepted(meId);
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
        const { error } = await friendshipsRepo.setStatusAsAddressee(req.params.id, meId, 'accepted');
        if (error) return res.status(400).json({ error: error.message });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/friends/:id', async (req, res) => {
    try {
        const meId = await requireUserId(req, res); if (!meId) return;
        const { error } = await friendshipsRepo.deleteInvolving(req.params.id, meId);
        if (error) return res.status(400).json({ error: error.message });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Pending friend requests (incoming — where I am the addressee)
app.get('/api/friends/requests/pending', async (req, res) => {
    try {
        const meId = await requireUserId(req, res); if (!meId) return;
        const { data, error } = await friendshipsRepo.listPendingFor(meId);
        if (error) return res.status(500).json({ error: error.message });
        res.json(data ?? []);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/friends/:id/decline', async (req, res) => {
    try {
        const meId = await requireUserId(req, res); if (!meId) return;
        const { error } = await friendshipsRepo.setStatusAsAddressee(req.params.id, meId, 'declined');
        if (error) return res.status(400).json({ error: error.message });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Notifications ──────────────────────────────────────────────────────────
app.get('/api/notifications', async (req, res) => {
    try {
        const meId = await requireUserId(req, res); if (!meId) return;
        const { data, error } = await notificationsRepo.listRecent(meId);
        if (error) return res.status(500).json({ error: error.message });
        res.json(data ?? []);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notifications/read-all', async (req, res) => {
    try {
        const meId = await requireUserId(req, res); if (!meId) return;
        const { error } = await notificationsRepo.markAllRead(meId);
        if (error) return res.status(400).json({ error: error.message });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notifications/:id/read', async (req, res) => {
    try {
        const meId = await requireUserId(req, res); if (!meId) return;
        const { error } = await notificationsRepo.markRead(req.params.id, meId);
        if (error) return res.status(400).json({ error: error.message });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Friend request notification helper ───────────────────────────────────────
async function insertNotification(userId, type, payload = {}) {
    await notificationsRepo.insert({
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
        const { data: profile } = await profilesRepo.findForMatchmaking(data.user.id);
        if (!profile) return;
        const verifiedUser = {
            id: profile.id,
            username: profile.username,
            rating: profile[ratingField(data.time_control)] ?? 1200,
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
            const { data: dbGame } = await gamesRepo.findForRestore(gameId);

            if (dbGame && dbGame.status === 'active') {
                game = gameStateFromRow(gameId, dbGame, Date.now());
                await setGame(gameId, game);
                await addActiveGame(gameId);
            } else if (dbGame && dbGame.status === 'completed') {
                const result = resultLabel(dbGame.result);
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
            const result = resultLabel(game.result);
            socket.emit('game_end', {
                game_id: gameId, result, reason: game.reason || 'Game over',
                white_id: game.whiteId, black_id: game.blackId,
            });
            return;
        }

        // Compute real remaining time for the active player
        // (clocks are frozen while a player is disconnected)
        const now = Date.now();
        const { whiteMs, blackMs } = game.disconnectInfo
            ? { whiteMs: game.whiteClockMs, blackMs: game.blackClockMs }
            : clocksAt(game, now);

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
                const validationRes = await engineClient.validateMove({ fen: game.fen, move: data.move });
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
        // Charge elapsed time, then add increment to the player who just moved
        const { whiteMs: whiteClockMs, blackMs: blackClockMs, nextSide: newSide } = clocksAfterMove(game, now);
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
        const movedColor = sideToColor(movedSide);
        const clockAfterMove = movedSide === 'w' ? Math.round(whiteClockMs) : Math.round(blackClockMs);

        // Async persist to Supabase — only FEN (H10: clocks flushed on game_end only)
        Promise.all([
            gamesRepo.updateById(data.game_id, {
                fen: data.fen,
            }),
            movesRepo.insert({
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
        messagesRepo.insert({
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

        const outcome = parseOutcome(data.result);

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
        const { data: updated } = await gamesRepo.finishIfActive(data.game_id, {
            status: 'completed',
            result: outcome === 'draw' ? 'draw' : null,
            winner_id: winnerIdFor(outcome, { whiteId, blackId }),
            ended_at: new Date().toISOString(),
            final_fen: game.fen ?? null,
            white_clock_ms: Math.round(game.whiteClockMs ?? 0),
            black_clock_ms: Math.round(game.blackClockMs ?? 0),
        });

        if (!updated) return;

        // Fire off a full chess.com-style Game Review (depth-18 Stockfish per move).
        // Runs in the engine as a background task and writes accuracy / per-move
        // classifications / eval graph back to the games row. Fire-and-forget.
        triggerGameReview(data.game_id, game.moveLog, game.timeControl ?? data.time_control ?? '10');

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
                // Snapshot the clock at disconnect time
                const { whiteMs: whiteClockMs, blackMs: blackClockMs } = clocksAt(game, now);

                const disconnectedSide = colorOfPlayer(userId, game.whiteId);

                await setGame(gameId, {
                    ...game,
                    whiteClockMs,
                    blackClockMs,
                    disconnectInfo: { userId, side: disconnectedSide, at: now },
                });

                // Persist clock snapshot to Supabase
                gamesRepo.updateIfActive(gameId, {
                    white_time_ms: Math.round(whiteClockMs),
                    black_time_ms: Math.round(blackClockMs),
                }).then(() => {});

                io.to(`game_${gameId}`).emit('opponent_disconnected', {
                    userId,
                    timeoutSeconds: 20,
                });
            }
        }
    });
});

// Only bind a port when started directly (`node server.js`). When the file is
// required (by the test suite) the caller decides whether and where to listen.
if (require.main === module) {
    const PORT = env.port();
    server.listen(PORT, () => {
        console.log(`Node server running on port ${PORT}`);
    });
}

module.exports = { app, server, io, matchmaking, buildPgnFromMoveLog };
