# GAMBIT architecture

Three deployable services plus Supabase:

| Service | Stack | Deployed to | Owns |
|---|---|---|---|
| `frontend/` | Next.js 16 App Router, React 19, TypeScript | Vercel | UI, and Next.js route handlers for profile, friends, notifications, games history, leaderboard, auth |
| `server/` | Node, Express 4, Socket.io, CommonJS | Railway | Realtime only: sessions, matchmaking, clocks, live game state (Redis), game end, rating, review trigger |
| `chess-engine/` | FastAPI, python-chess, Stockfish | Render | Move validation, position analysis, full-game review, computer opponent |
| `supabase/` | Postgres + Auth | Supabase | Persistent data; schema changes only via `supabase migration new` (SEC-08) |

The rules every change must follow are in [`docs/ENGINEERING_RULES.md`](ENGINEERING_RULES.md).
The decisions behind this layout are in [`docs/refactor/DECISIONS.md`](refactor/DECISIONS.md).

## Game server (`server/`)

```
server.js            5-line shim: require('./src/index'), listen only when run directly
src/index.js         composition root: wires config, clients, repositories, services, http, sockets
src/config/env.js    the only reader of process.env (call-time accessors)
src/domain/          pure functions: timeControl, clock, gameState, result, pgn,
                     chessRules (legality, chess.js), moveAuthorization, adjudication,
                     rating/glicko, matchmaking/pairing  (no I/O, 100% unit-tested)
src/clients/         engineClient (fetch), supabaseClient, redisClient
src/repositories/    gameState (Redis + per-game lock, atomic mutateGame), pendingRequests
                     (Redis, 60 s TTL), games, moves, messages, profiles, notifications,
                     gameResultOutbox (Redis: results waiting for a database write)
src/services/        game, moveRecorder, gameFinalizer, tokenVerifier, clock, matchmaking,
                     rating, privateGame, social, chat, review, analysis, profile,
                     resultOutboxWorker (re-drives results the database refused);
                     emitter port over io
src/http/            app.js (express + cors), routes/*, middleware/requireUser.js
src/sockets/         index.js, auth.js (handshake token → socket.data.userId),
                     schemas.js (zod per event), wrap.js (validate, catch, ack),
                     handlers/{session,lobby,game,chat,social}.js,
                     sessionRegistry.js (userSockets, socketUsers, userActiveGame)
supabase.js, lib/redis.js, lib/gameStore.js, services/*.js
                     legacy module paths kept as thin facades: the test suites
                     jest.mock these paths, and src/index.js obtains infrastructure
                     through them (ADR 0102, 0103, 0105)
```

### Dependency rules (enforced by `server/.dependency-cruiser.cjs`, all at `error`)

```
http/, sockets/  ──▶ services/ ──▶ domain/
                        │
                        └── receive repositories/ and clients/ by injection
repositories/, clients/ ──▶ @supabase/supabase-js, ioredis, fetch
```

- `domain/` imports nothing from other layers or SDKs (SOLID-07).
- `services/` never import repositories, clients or SDKs; they get them as factory
  arguments from `src/index.js` (SOLID-06, SOLID-08: plain factories, no container).
- Only `repositories/` and `clients/` touch Supabase, ioredis or `fetch`
  (ESLint `no-restricted-globals` for `fetch` outside `clients/`).
- `http/` and `sockets/` call services only (NODE-03, SIZE-05).
- No import cycles (SOLID-12).

### Trust boundary (docs/fixes/DECISIONS.md)

- **Identity:** `io.use` verifies the Supabase access token from the handshake; every handler
  acts as `socket.data.userId`. No event or payload names the acting user (NODE-10).
- **Input:** every event payload is parsed by its zod schema inside `wrap()`; handlers cannot
  throw an unhandled rejection (NODE-07, NODE-08).
- **Moves and results:** the server validates each move with chess.js against its own state,
  adjudicates the position, and is the only thing that can end a game (NODE-11, NODE-16).
  `gameFinalizer.endGame` and the clock both move a game active → completed through one
  atomic transition, so a game is finalized and rated once (NODE-18).
- **Rematch / challenge:** requests are stored in Redis for 60 s; an accept or decline must
  match one, and the game is built from the stored terms.

## Frontend (`frontend/`)

```
proxy.ts              session refresh + optimistic redirect for the protected pages only
                      (allow-list matcher); never the only auth check (NX-09)
app/**/page.tsx       thin compositions (< 150 lines)
app/api/**/route.ts   parse → identity → lib/server data function → respond
features/<feature>/   components/, hooks/, state/, utils — one folder per feature:
                      game, lobby, profile, analysis, navigation, offline,
                      game-result, auth, challenge, join, leaderboard, landing,
                      settings, knight
lib/server/           server-only (`import 'server-only'`): Supabase client
                      factories, caller identity, per-entity data functions (NX-05)
lib/api/              typed client-side fetch helpers per feature
lib/socket/           the realtime connection (handshake token, reconnect)
lib/chess/            pure chess helpers (board coords, clock format, time controls)
types/                shared domain and socket payload types (no runtime code)
components/           app-wide providers (Socket, Profile, Presence), Navbar entry, ui/
```

- Pages compose hooks and components; hooks own effects and socket wiring;
  components are presentational and receive callbacks, never the socket (SOLID-02, SOLID-05).
- The socket comes only from `useSocket()` in `components/SocketProvider`.
- `server-only` modules can't be imported by client code (build error).

## Chess engine (`chess-engine/`)

```
main.py         FastAPI app; includes routers in the original order; `uvicorn main:app`
config.py       the only reader of env vars
routers/        health, moves, analysis, computer  (APIRouter)
services/       analysis (scoring, classification), review (full-game pipeline)
engine.py       Stockfish pool API
seams.py        late-bound dependency lookup through `main` (ADR 0301)
```

## Shared definitions (`shared/`)

`shared/time-control.json` is the one definition of the time-control model (limits, category
thresholds, lobby presets, contract cases). Each deployable carries a copy
(`server/src/domain/timeControl.data.json`, `frontend/lib/chess/timeControl.data.json`) written
by `node scripts/sync-shared.js`; a test on each side fails when a copy differs
(docs/fixes/DECISIONS.md F-027). Edit the file in `shared/`, never a copy.

## How to add a feature

1. **Pure rules first.** Put chess/clock/rating logic in `server/src/domain/` or
   `frontend/lib/chess/` with unit tests (TEST-03).
2. **Data access.** Add a repository function (server) or a `lib/server/` data
   function (frontend). Keep queries there and nowhere else.
3. **Service.** Add or extend a service factory that receives its repositories
   and clients as arguments; unit-test it with plain fakes.
4. **Entry point.** Add a thin socket handler / Express route / Next.js route
   handler: validate input → identify the caller → call the service → respond.
   Never trust ids, ratings or results from the client (NODE-10/11/16, NX-07).
5. **UI.** Add `features/<name>/` hooks and components; keep `page.tsx` a composition.
6. **Gates.** `npx jest`, `npx tsc --noEmit` (frontend), `npm run lint`,
   `npm run lint:arch` (server), `npm run format:check`, `pytest` and `ruff`
   (engine). Lint baselines are empty: every file must pass the size and
   complexity limits (SIZE-01..04).
