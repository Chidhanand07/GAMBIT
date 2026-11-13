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
const { createApp, attachErrorHandler } = require('./http/app');
const { createSocketServer, registerSocketHandlers } = require('./sockets');
require('dotenv').config();

const MatchmakingService = require('../services/matchmaking');
const privateGames = require('../services/friends');
const ratingService = require('../services/rating');
const { supabase } = require('../supabase');
const gameStore = require('../lib/gameStore');
const redis = require('../lib/redis');
const { startGlobalClock } = require('../services/clock');
const env = require('./config/env');
const { buildPgnFromMoveLog } = require('./domain/pgn');
const { createEngineClient } = require('./clients/engineClient');
const { createGamesRepository } = require('./repositories/gamesRepository');
const { createMovesRepository } = require('./repositories/movesRepository');
const { createMessagesRepository } = require('./repositories/messagesRepository');
const { createProfilesRepository } = require('./repositories/profilesRepository');
const { createNotificationsRepository } = require('./repositories/notificationsRepository');
const { createPendingRequestsRepository } = require('./repositories/pendingRequestsRepository');
const { createIoEmitter } = require('./services/emitter');
const { createReviewService } = require('./services/reviewService');
const { createClockService } = require('./services/clockService');
const { createGameFinalizer } = require('./services/gameFinalizer');
const { createGameService } = require('./services/gameService');
const { createChatService } = require('./services/chatService');
const { createSocialService } = require('./services/socialService');
const { createProfileService } = require('./services/profileService');
const { createTokenVerifier } = require('./services/tokenVerifier');
const { createOriginPolicy } = require('./services/originPolicy');
const { createRateLimiter } = require('./services/rateLimiter');
const { RULES: RATE_LIMIT_RULES } = require('./domain/rateLimits');
const { createRateLimitRepository } = require('./repositories/rateLimitRepository');
const { createHttpRateLimit } = require('./http/rateLimit');
const { createSocketRateLimit } = require('./sockets/rateLimit');
const { createReadiness } = require('./services/readiness');
const { redisProbe, supabaseProbe } = require('./clients/healthProbes');

const READINESS_TIMEOUT_MS = 2000;
const { createAnalysisService } = require('./services/analysisService');
const { createRequireUserId } = require('./http/middleware/requireUser');
const { registerRoutes } = require('./http/routes');
const { createSessionRegistry } = require('./sockets/sessionRegistry');
const { registerProcessHandlers } = require('./processHandlers');
const { log } = require('./observability/log');

const engineClient = createEngineClient({ baseUrl: env.engineUrl, sharedSecret: env.engineSharedSecret });
const gamesRepo = createGamesRepository(supabase);

// One allow-list of browser origins for HTTP and the socket handshake (S13); read per request.
const originPolicy = () => createOriginPolicy({ origins: env.corsOrigins(), previewPattern: env.corsPreviewPattern() });
const app = createApp({ originPolicy });
const server = http.createServer(app);
const io = createSocketServer(server, originPolicy);

const matchmaking = new MatchmakingService(io);

const sessions = createSessionRegistry();
const emitter = createIoEmitter(io);
const socialService = createSocialService({
    privateGames,
    notificationsRepo: createNotificationsRepository(supabase),
    pendingRequests: createPendingRequestsRepository(redis),
    emitter,
});
// One finalizer for every way a game ends: moves and resignations (gameService)
// and flag falls and abandonment (the clock) share it (G3).
const reviewService = createReviewService({ engineClient });
const finalizer = createGameFinalizer({
    gameStore,
    gamesRepo,
    ratingService,
    reviewService,
    sessions,
    emitter,
});
const gameService = createGameService({
    gameStore,
    gamesRepo,
    movesRepo: createMovesRepository(supabase),
    ratingService,
    reviewService,
    sessions,
    emitter,
    finalizer,
});

// Start single global clock ticker (replaces all per-game setInterval timers)
startGlobalClock(createClockService({ gameStore, finalizer, emitter }));

const chatService = createChatService({
    gameStore,
    messagesRepo: createMessagesRepository(supabase),
    emitter,
});

// Rate limits live in Redis, so every instance shares them (NODE-12).
const rateLimiter = createRateLimiter({ store: createRateLimitRepository(redis), rules: RATE_LIMIT_RULES });
app.use(createHttpRateLimit({ limiter: rateLimiter }));
// /readyz: Redis and Supabase answer within 2 s, and the process is not draining (NODE-21).
const readiness = createReadiness({
    probes: { redis: redisProbe(redis), supabase: supabaseProbe(supabase) },
    timeoutMs: READINESS_TIMEOUT_MS,
});

registerRoutes(app, {
    queueSize: () => matchmaking.queue.size,
    readiness,
    profileService: createProfileService({ profilesRepo: createProfilesRepository(supabase) }),
    analysisService: createAnalysisService({ engineClient }),
    privateGames,
    socialService,
    requireUserId: createRequireUserId({ getUser: (token) => supabase.auth.getUser(token) }),
});
// After every route: JSON 404 and the one error middleware (Express 5 forwards async errors).
attachErrorHandler(app);

const getUser = /** @type {import('./services/tokenVerifier').GetUser} */ ((token) => supabase.auth.getUser(token));
const tokenVerifier = createTokenVerifier({ getUser });

registerSocketHandlers(io, {
    sessions,
    matchmaking: matchmaking.service,
    gameService,
    chatService,
    socialService,
    verifyToken: tokenVerifier.verify,
    tokenDeadline: tokenVerifier.deadline,
    rateLimit: createSocketRateLimit({ limiter: rateLimiter }),
});

/** Bind `PORT` (default 3001). Called only when the process is started directly. */
function start() {
    registerProcessHandlers();
    const PORT = env.port();
    server.listen(PORT, () => {
        log.info(`Node server running on port ${PORT}`);
    });
}

module.exports = { app, server, io, matchmaking, readiness, buildPgnFromMoveLog, start };
