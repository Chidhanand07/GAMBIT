// @ts-check
/**
 * Composition root (SOLID-06, NODE-04): builds clients, repositories and
 * services, the Express app, the http server and Socket.IO, and wires them.
 * Requiring this module constructs everything and starts the matchmaking and
 * global clock intervals, exactly as requiring `server.js` always did; only
 * `start()` binds a port.
 *
 * Supabase, Redis, the game-state store and the rating / private-game /
 * matchmaking / clock singletons come through their legacy module paths so
 * the tests' `jest.mock` calls apply (refactor playbook, "Test seams").
 */
const http = require('http');
// Express, cors and socket.io load before dotenv runs, as in the original server.js.
const { createApp } = require('./http/app');
const { createSocketServer, registerSocketHandlers } = require('./sockets');
require('dotenv').config();

const MatchmakingService = require('../services/matchmaking');
const privateGames = require('../services/friends');
const ratingService = require('../services/rating');
const { supabase } = require('../supabase');
const gameStore = require('../lib/gameStore');
const { startGlobalClock } = require('../services/clock');
const env = require('./config/env');
const { buildPgnFromMoveLog } = require('./domain/pgn');
const { createEngineClient } = require('./clients/engineClient');
const { createGamesRepository } = require('./repositories/gamesRepository');
const { createMovesRepository } = require('./repositories/movesRepository');
const { createMessagesRepository } = require('./repositories/messagesRepository');
const { createProfilesRepository } = require('./repositories/profilesRepository');
const { createNotificationsRepository } = require('./repositories/notificationsRepository');
const { createIoEmitter } = require('./services/emitter');
const { createReviewService } = require('./services/reviewService');
const { createGameService } = require('./services/gameService');
const { createChatService } = require('./services/chatService');
const { createSocialService } = require('./services/socialService');
const { createProfileService } = require('./services/profileService');
const { createAnalysisService } = require('./services/analysisService');
const { createRequireUserId } = require('./http/middleware/requireUser');
const { registerRoutes } = require('./http/routes');
const { createSessionRegistry } = require('./sockets/sessionRegistry');
const { registerProcessHandlers } = require('./processHandlers');

const engineClient = createEngineClient({ baseUrl: env.engineUrl });
const gamesRepo = createGamesRepository(supabase);

const app = createApp({ frontendUrl: env.frontendUrl });
const server = http.createServer(app);
const io = createSocketServer(server);

const matchmaking = new MatchmakingService(io);

// Start single global clock ticker (replaces all per-game setInterval timers)
startGlobalClock(io);

const sessions = createSessionRegistry();
const emitter = createIoEmitter(io);
const socialService = createSocialService({
    privateGames,
    notificationsRepo: createNotificationsRepository(supabase),
    emitter,
});
const gameService = createGameService({
    gameStore,
    gamesRepo,
    movesRepo: createMovesRepository(supabase),
    engineClient,
    ratingService,
    reviewService: createReviewService({ engineClient }),
    sessions,
    emitter,
});
const chatService = createChatService({
    gameStore,
    messagesRepo: createMessagesRepository(supabase),
    sessions,
    emitter,
});

registerRoutes(app, {
    queueSize: () => matchmaking.queue.size,
    profileService: createProfileService({ profilesRepo: createProfilesRepository(supabase) }),
    analysisService: createAnalysisService({ engineClient }),
    privateGames,
    socialService,
    requireUserId: createRequireUserId({ getUser: (token) => supabase.auth.getUser(token) }),
});

registerSocketHandlers(io, { sessions, matchmaking: matchmaking.service, gameService, chatService, socialService });

/** Bind `PORT` (default 3001). Called only when the process is started directly. */
function start() {
    registerProcessHandlers();
    const PORT = env.port();
    server.listen(PORT, () => {
        console.log(`Node server running on port ${PORT}`);
    });
}

module.exports = { app, server, io, matchmaking, buildPgnFromMoveLog, start };
