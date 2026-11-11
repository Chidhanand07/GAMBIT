# ADR 0105 — Server entry adapters, composition root and the server.js shim

- **Status:** accepted (PR 06/13, http + sockets)

## Context

PR 06/13 finishes the server layering:

- `src/http/` for Express;
- `src/sockets/` for Socket.IO;
- `src/index.js` as the composition root;
- `server.js` reduced to a shim (NODE-04, SIZE-05, SOLID-06).

dependency-cruiser forbids `http/` and `sockets/` from importing repositories,
clients, domain or legacy modules. Requiring `server.js` must still build
everything and start both 1 s intervals without binding a port. The test
`jest.mock` seams must keep working.

## Decisions

1. **`requireUserId` stays a helper, not Express middleware.**
   `http/middleware/requireUser.js` exports `createRequireUserId({ getUser })`.
   Each route calls it inside its own `try`, exactly as before. A thrown
   `getUser` error therefore still reaches that route's `catch`, which answers
   400 for `POST /api/games/join/:token`. Real middleware would have routed
   that error to Express's error handler and changed the response. The
   Supabase call comes in as `getUser: (token) => supabase.auth.getUser(token)`
   from `index.js`, resolved at call time so the mocked `auth.getUser` applies.
2. **Controllers call services only.**
   - Two small services were added: `profileService.isUsernameAvailable`
     (check-username) and `analysisService.analysePosition` (engine proxy,
     with the `depth || 18` default).
   - `game_start` after `POST /api/games/join/:token` goes through
     `socialService.announceGameStart`, still after `res.json(game)`.
   - The routes are registered in their original relative order: health,
     matchmaking status, check-username, analysis, GET join, POST join.
3. **Module load order is preserved.** `src/index.js` requires `./http/app`
   (express, cors) and `./sockets` (socket.io) before
   `require('dotenv').config()`, as the old `server.js` did. Everything else
   loads after it. That covers the `services/matchmaking` facade first (which
   loads `../supabase`, with its start-up log lines), then friends, rating,
   gameStore and clock. A `DEBUG` or similar variable set only in `.env`
   therefore affects the same libraries as before. Running `node server.js`
   before and after this PR logs byte-identical output apart from the port.
4. **Construction order is preserved:** engine client and repositories →
   app → http server → io → `new MatchmakingService(io)` (pairing interval) →
   `startGlobalClock(io)` (ticker) → services → routes → socket handlers. The
   two intervals are created in the same order, so they fire in the same
   order.
5. **Socket.IO CORS.** The old origin callback called `callback(null, true)`
   on both branches. The `if` only read `FRONTEND_URL`, which has no side
   effects. `createSocketServer` keeps the same options and accepts every
   origin with credentials. The characterization test pins this (known issue
   NODE-09, preserved).
6. **Handlers get the matchmaking service, not the class facade.**
   `index.js` passes `matchmaking.service` (from the legacy
   `new MatchmakingService(io)`) to the lobby and session handlers. They share
   `queue` with the facade, so `matchmaking.queue` (exported and used by the
   tests and `/api/matchmaking/status`) is the same Map.
7. **`server.js` is a 5-line shim.** It requires `./src/index`, calls
   `start()` only when `require.main === module`, and re-exports
   `{ app, server, io, matchmaking, buildPgnFromMoveLog, start }`.
8. **dependency-cruiser `LEGACY_SEVERITY` is now `error`.** With the facades
   clean, the whole graph has no violations (61 modules). The server lint
   baseline is empty (`"files": {}`).

## Why

Each decision keeps a behaviour that is observable through the HTTP and
socket contracts, start-up logging or the test seams. The adapters stay
within SIZE-05: every socket handler is one or two lines, and every route
body is 10 lines or fewer.
