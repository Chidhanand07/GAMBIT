const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const MatchmakingService = require('./services/matchmaking');
const friendsService = require('./services/friends');
const ratingService = require('./services/rating');
const { supabase } = require('./supabase');
const gameStore = require('./lib/gameStore');
const { startGlobalClock } = require('./services/clock');
const { buildPgnFromMoveLog } = require('./src/domain/pgn');
const env = require('./src/config/env');
const { createEngineClient } = require('./src/clients/engineClient');
const { createGamesRepository } = require('./src/repositories/gamesRepository');
const { createMovesRepository } = require('./src/repositories/movesRepository');
const { createMessagesRepository } = require('./src/repositories/messagesRepository');
const { createProfilesRepository } = require('./src/repositories/profilesRepository');
const { createFriendshipsRepository } = require('./src/repositories/friendshipsRepository');
const { createNotificationsRepository } = require('./src/repositories/notificationsRepository');
const { createIoEmitter } = require('./src/services/emitter');
const { createReviewService } = require('./src/services/reviewService');
const { createGameService } = require('./src/services/gameService');
const { createChatService } = require('./src/services/chatService');
const { createSocialService } = require('./src/services/socialService');
const { createSessionRegistry } = require('./src/sockets/sessionRegistry');

const engineClient = createEngineClient({ baseUrl: env.engineUrl });
const gamesRepo = createGamesRepository(supabase);
const movesRepo = createMovesRepository(supabase);
const messagesRepo = createMessagesRepository(supabase);
const profilesRepo = createProfilesRepository(supabase);
const friendshipsRepo = createFriendshipsRepository(supabase);
const notificationsRepo = createNotificationsRepository(supabase);
const reviewService = createReviewService({ engineClient });

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

const sessions = createSessionRegistry();
const emitter = createIoEmitter(io);
const gameService = createGameService({
    gameStore, gamesRepo, movesRepo, engineClient, ratingService, reviewService, sessions, emitter,
});
const chatService = createChatService({ gameStore, messagesRepo, sessions, emitter });
const socialService = createSocialService({ privateGames: friendsService, notificationsRepo, emitter });

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
        socialService.announceGameStart(game);
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
        await socialService.insertNotification(them.id, 'friend_request', { from_user_id: meId, from_username: me?.username });
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

// Socket.io logic
/**
 * The connection as services see it (NODE-03: services never get the socket).
 * @param {import('socket.io').Socket} socket
 */
function clientOf(socket) {
    return { id: socket.id, join: (room) => socket.join(room), emit: (event, ...args) => socket.emit(event, ...args) };
}

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    const client = clientOf(socket);

    // User authenticates their socket
    socket.on('authenticate', async (userId) => {
        sessions.register(userId, socket.id);
        socket.join(`user_${userId}`);
        socket.emit('authenticated', { userId });
        // If reconnecting while in an active game, clear the disconnect grace period in Redis
        await gameService.reconnect(userId, client);
    });

    socket.on('join_queue', (data) => matchmaking.service.requestMatch(data, socket.id));
    socket.on('leave_queue', (userId) => {
        matchmaking.leaveQueue(userId);
    });

    socket.on('join_game', (gameId) => gameService.joinGame(gameId, client));
    socket.on('spectate_game', (gameId) => gameService.spectate(gameId, client));
    socket.on('make_move', (data) => gameService.makeMove(data, socket.id));
    socket.on('send_message', (data) => chatService.sendMessage(data, socket.id));
    socket.on('game_end', (data) => gameService.endGame(data));

    socket.on('rematch_request', (data) => socialService.requestRematch(data));
    socket.on('rematch_accept', (data) => socialService.acceptRematch(data));
    socket.on('rematch_decline', (data) => socialService.declineRematch(data));
    socket.on('challenge_request', (data) => socialService.requestChallenge(data));
    socket.on('challenge_accept', (data) => socialService.acceptChallenge(data));
    socket.on('challenge_decline', (data) => socialService.declineChallenge(data));

    socket.on('disconnect', async () => {
        // Remove from matchmaking
        matchmaking.service.leaveQueueBySocket(socket.id);
        const userId = sessions.unregister(socket.id);
        // If this user is in an active game, set disconnectInfo in Redis (global clock handles timeout)
        await gameService.handleDisconnect(userId);
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
