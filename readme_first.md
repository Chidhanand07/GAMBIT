# GAMBIT – read this first

A short orientation for new contributors. It points to the documents that hold the details instead
of repeating them.

## 1. What GAMBIT is

An online chess platform. Players can:
- play rated or casual games through matchmaking, or private games through an invite link;
- play bullet, blitz, rapid, classical or custom time controls (`M+S`: minutes plus increment);
- challenge friends, send rematches, chat in a game;
- get Glicko-2 ratings per category, statistics, a leaderboard and a profile page;
- read a post-game review (accuracy, move classifications, critical moments, eval graph);
- analyse any position, and play the computer opponent MAVERICK without an account (`/offline`).

## 2. Read next, in this order

| Document | What it gives you |
|---|---|
| [`README.md`](README.md) | stack, quick start, test commands |
| [`setup.md`](setup.md) | local development step by step |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | components, where state lives, layers per package, main flows |
| [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md) | the rulebook; MUST rules block merge |
| [`CLAUDE.md`](CLAUDE.md) | the working rules in one page (branches, commits, non-negotiables) |
| [`DEPLOY.md`](DEPLOY.md) | deployment, every environment variable per platform, deploy order, operator procedures |
| [`docs/fixes/DECISIONS.md`](docs/fixes/DECISIONS.md) | why things are the way they are (ADRs F-001 onward, indexed at the top) |

## 3. The few ideas that explain most of the code

- **The game server is the authority.** It verifies the Supabase access token sent in the socket
  handshake and acts as that user; it validates every move with chess.js, runs the clocks and decides
  every result. A client can never name the acting user, a result or a rating (NODE-10/11/16).
- **One finalizer.** Every way a game ends (move, resignation, flag fall, abandonment, first-move
  timeout) goes through the same code, which completes the game once. Ratings and statistics are
  written once per game, in one transaction, by `public.apply_game_result`.
- **Redis holds live state**, not process memory: games (compare-and-set), the matchmaking queue,
  challenges and rematches, clock tick locks, rate limits, the result outbox, the Socket.IO adapter.
  That is why the game server can run as several replicas.
- **Supabase holds durable state**, with RLS on every public table. The web app's route handlers
  identify the caller with `requireUser()` (verified token claims) before touching data, and return
  allow-listed DTOs.
- **The engine is a protected service.** Every endpoint except `GET /health` needs the shared secret
  in `X-Engine-Key`. Scores leaving it are always from White's point of view.

## 4. Where to make common changes

| Change | Where |
|---|---|
| Chess, clock, rating or matchmaking rules | `server/src/domain/` (pure, unit-tested) |
| A new socket event | `server/src/sockets/schemas.js` (zod) + `sockets/handlers/*` + a service; client side in `frontend/features/<feature>/hooks` and `types/socket.ts` |
| A new HTTP endpoint for the web app | `frontend/app/api/<path>/route.ts` → `lib/server/*`; parse → `requireUser()` → data function → DTO |
| A new page | `frontend/app/<page>/page.tsx` composing `features/<feature>/`; add the path to the `matcher` in `frontend/proxy.ts` if it needs a session |
| Time controls, presets, category thresholds | `shared/time-control.json`, then `node scripts/sync-shared.js` |
| Engine analysis or review | `chess-engine/services/`, routers in `chess-engine/routers/` |
| Database schema, RLS, functions | `supabase migration new <name>` + pgTAP tests in `supabase/tests/`; never edit an applied migration |
| Environment variables | read only in `server/src/config/env.js`, `frontend/lib/server/env.ts` / `lib/supabase/publicEnv.ts` / the `lib/server` client modules, and `chess-engine/config.py`; document them in DEPLOY.md and the `.env.example` files |

## 5. Things that bite

- `frontend/lib/server/**` is `server-only`. Secrets never get a `NEXT_PUBLIC_` prefix; the app refuses
  an `sb_secret_` key in a public variable.
- `proxy.ts` only redirects signed-out visitors; it is not an authorization check. Every route handler
  checks identity itself.
- The game server reads `server/.env`, the web app `frontend/.env.local`; the engine reads **no** `.env`
  file, so export its variables before starting it (setup.md §5).
- Some migrations must wait for code and some code for migrations (DEPLOY.md, "Deploy order").
- Legacy module paths in `server/` (`supabase.js`, `lib/*.js`, `services/*.js`) are thin facades that the
  tests mock; new code goes in `server/src/`.
- Never weaken or delete a test to make a change pass; run every suite before a PR (setup.md §7).
- Pull requests target `preprod`; `main` and `preprod` are protected.
