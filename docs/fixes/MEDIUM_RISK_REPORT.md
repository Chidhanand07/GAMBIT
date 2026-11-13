# MEDIUM-risk fixes — final report

Written for the repository owner and whoever reviews and deploys the four stacked PRs.

All work is **local only**: four branches in four git worktrees. Nothing was pushed, no PR was opened, nothing was merged, and the main checkout and git config were not touched. "CI" means the same commands run locally (macOS, Node 26.13.1, Python 3.11.1, redis-server 8.10.2). Decisions are in `docs/fixes/DECISIONS.md` as F-022 to F-059, and each PR's title and description are in `docs/fixes/pr/M<n>.md`.

## 1. Branches

The base for all four is `fix/high-3-supabase-lockdown` at `70a94f9`. It was the newest high-risk branch available locally; `git fetch` was not allowed, so origin was not compared (F-022).

| Branch | Worktree | Base ref (SHA) | Head | Commits | Files | Lines |
|---|---|---|---|---|---|---|
| `fix/medium-1-platform-upgrade` | `../GAMBIT-wt/medium-1` | `fix/high-3-supabase-lockdown` (`70a94f9`) | `c4d38a6` | 6 | 69 | +2,101 / −811 |
| `fix/medium-2-game-correctness` | `../GAMBIT-wt/medium-2` | M1 (`c4d38a6`) | `63e3ef5` | 20 | 118 | +4,739 / −1,072 |
| `fix/medium-3-abuse-integrity` | `../GAMBIT-wt/medium-3` | M2 (`63e3ef5`) | `96ca8a5` | 13 | 96 | +4,888 / −453 |
| `fix/medium-4-scaling-ops` | `../GAMBIT-wt/medium-4` | M3 (`96ca8a5`) | the commit that adds this file (its parent: `9881a4a`) | 11 | 102 | about +5,300 / −944 |

The M4 numbers include this report. Up to `9881a4a` the M4 diff is 101 files, +4,921 / −944; of that, 1,475 added / 163 removed lines are code outside tests, lockfiles and docs.

**Commits by item**

- **M1:**
  - `5dc8f2a` NODE-RUNTIME
  - `0366627` NEXT-16
  - `a39429a` IDENTITY-PERF
  - `8b18ad9` S12
  - `0186868` NX-14
  - `c4d38a6` PR doc
- **M2:**
  - `8bf5dd2` TIME-CONTROL (G4, F7, F9)
  - `62860d9` G2
  - `5e8c7f7` G3
  - `f86d788` G8, G9
  - `2d5ffa9` FIRST-MOVE
  - `b3cb2be` G10
  - `f71df17` G7
  - `d23821f` G11
  - `b988802` G6
  - `42afa3a` G12
  - `c2fdece` G14
  - `f0a7711` G15
  - `31dccb9` MULTI-SOCKET
  - `e1994c8` G17
  - `1b0cf15` TOKEN-LIFETIME
  - `b6f1bab` ERRORS
  - `34a4bbf` ACKS
  - `1a20be8` + `37d2be6` G22
  - `63e3ef5` PR doc
- **M3:**
  - `ee6f68c` G19
  - `6601426` G20
  - `73a6d54` G21
  - `ea0331b` ENGINE-BUILD
  - `ad7f88e` S6
  - `6c221f6` + `8da5e1b` S14
  - `2f668d4` S13
  - `70bc48c` ADRs
  - `ceae28e` RATE-LIMITS
  - `710b2c0` + `5121a24` RATING-ATOMIC
  - `96ca8a5` PR doc
- **M4:**
  - `8eec687` EXPRESS-5
  - `4067a41` OBSERVABILITY
  - `efa6380` SHUTDOWN
  - `6746d8b` SUPPLY-CHAIN
  - `bba6835` SCHEMA-DRIFT
  - `c6bab52` ADRs
  - `c9c9f52` MULTI-INSTANCE
  - `dd7bcef` PR doc
  - `9750cf3` SCHEMA-DRIFT tests
  - `9881a4a` MULTI-INSTANCE follow-up (unawaited adapter writes)
  - this report (which also updates the PR doc)

**Local checks at each head**

| Check | M1 | M2 | M3 | M4 |
|---|---|---|---|---|
| server jest | pass (864) | pass (1145) | pass (1200) | pass (1301; 73 suites; 6 consecutive runs) |
| server lint, lint:arch, format, lint:baseline | pass | pass | pass | pass |
| frontend jest | pass (1098) | pass (1209) | pass (1347) | pass (1348) |
| frontend tsc, format, lint:baseline | pass | pass | pass | pass |
| frontend lint | pass (0 errors, 9 warnings) | pass (same) | pass (same) | pass (same) |
| frontend `next build` | pass | not run (no build-relevant change; M3 built on top) | pass | pass |
| engine pytest, ruff | pass (191) | untouched | pass (466) | pass (466) |
| shared `sync-shared --check` | n/a | pass | pass | pass |
| real-Redis multi-instance tests | n/a | n/a | n/a | pass (spawned redis-server, and every suite on one shared Redis as in CI) |
| script self-tests (`node --test`) | n/a | n/a | n/a | pass (19) |
| `supabase test db` | **not run** | **not run** | **not run** | **not run** |
| `docker build` | **not run** | n/a | **not run** | n/a |
| CodeQL, Dependency audit, Schema drift | n/a | n/a | n/a | **not run** |

Why some checks did not run:

- **`supabase test db`:** there is no Docker and no Supabase CLI on this machine. The M3 SQL function was tested on a throwaway Postgres 17 with a pgTAP shim instead.
- **`docker build`:** no Docker.
- **CodeQL, Dependency audit, Schema drift:** these run only on GitHub-hosted runners.

The 9 frontend lint warnings are old (`<img>` elements and one intentional `location.assign`).

## 2. Item checklist

| Item | Status | Commit | Proving tests |
|---|---|---|---|
| NODE-RUNTIME | fixed | `5dc8f2a` | `server/__tests__/config/nodeRuntime.test.js` (engines, `.nvmrc`, Dockerfile, railway.toml) |
| NEXT-16 | fixed | `0366627` | `proxy.test.ts`, `security/nextVersion.test.ts`, page and route tests with async params |
| IDENTITY-PERF | fixed | `a39429a` | `lib/server/identity.test.ts`, `api/cookieAuth.test.ts` (no `getUser` round trip) |
| S12 | fixed | `8b18ad9` | `security/noDebugRoutes.test.ts`, `api/misc.test.ts` |
| NX-14 | fixed | `0186868` | `security/buildConfig.test.ts` (no `ignoreBuildErrors`); `next build` in CI |
| TIME-CONTROL (G4, F7, F9) | fixed | `8bf5dd2` | `timeControl.test.js`, frontend time-control tests, shared-copy drift tests |
| G2 | fixed | `62860d9` | move-persistence and finalizer column tests |
| G3 | fixed | `5e8c7f7` | clock and finalizer tests (one finalizer for every ending) |
| G7 | fixed | `f71df17` | `time_expired` move refusal tests |
| G8, G9 | fixed | `f86d788` | clock disconnect and reconnect tests |
| G10 | fixed | `b3cb2be` | abandonment-before-first-move tests |
| FIRST-MOVE | fixed | `2d5ffa9` | `domain/clockVerdict.test.js`, abort tests |
| G11 | fixed (part already fixed by high-risk S3, now pinned) | `d23821f` | final-clock tests |
| G6 | fixed | `b988802` | chat tests |
| G12 | fixed | `42afa3a` | `match_found` / `match_failed` tests |
| G14 | fixed | `c2fdece` | engine-proxy status tests, username 503 test |
| G15 | fixed | `f0a7711` | invite tests |
| G17 | fixed | `e1994c8` | session-registry tests |
| G22 | fixed | `1a20be8`, `37d2be6` | frontend `games.test.ts` |
| MULTI-SOCKET | fixed | `31dccb9` | two-tab tests; across replicas since `c9c9f52` |
| TOKEN-LIFETIME | fixed | `1b0cf15` | `sockets/tokenLifetime.test.js`, client reconnect tests |
| ACKS | fixed (challenge emits and the auto re-queue still have no ack; acks have no timeout) | `34a4bbf` | `lib/socket/ack` tests, handler ack tests |
| ERRORS | fixed (no outbox for a DB row that cannot be written) | `b6f1bab` | Redis-error and retry tests |
| RATE-LIMITS | fixed (fail open, F-046) | `ceae28e` | socket and HTTP limiter tests, Upstash store contract, engine admission tests |
| S13 | fixed | `2f668d4` | HTTP and socket CORS tests, startup validation tests |
| S6 | fixed | `ad7f88e` | `lib/safeRedirect.test.ts` |
| S14 | fixed | `6c221f6`, `8da5e1b` | `security/noClientConsole.test.ts`, ESLint `no-console` |
| RATING-ATOMIC | fixed (migration not run on a real Supabase) | `710b2c0`, `5121a24` | `ratingService` tests, pgTAP `03_rating_function.test.sql` (shim) |
| G19 | fixed | `ee6f68c` | engine API tests (400 for a bad FEN) |
| G20 | fixed | `6601426` | review and mate-score tests |
| G21 | fixed | `73a6d54` | review tests (no moves → no review, 422) |
| ENGINE-BUILD | fixed (image not built locally) | `ea0331b` | engine build-config tests, model checksum tests |
| EXPRESS-5 | fixed | `8eec687` | HTTP tests (JSON 404, 400, 413) |
| OBSERVABILITY | fixed | `4067a41` (+ hostname in `c9c9f52`) | `observability/log.test.js`, `services/readiness.test.js` |
| SHUTDOWN | fixed | `efa6380` | `shutdown.test.js`, `processHandlers.test.js` |
| SUPPLY-CHAIN | fixed (audit is red today) | `6746d8b` | `scripts/dependency-audit.test.js` |
| SCHEMA-DRIFT | fixed (real CLI never run here) | `bba6835`, `9750cf3` | `scripts/schema-drift.test.js` (fake CLI; a mutation that hides drift fails it) |
| MULTI-INSTANCE | fixed | `c9c9f52`, `9881a4a` | `integration/twoInstances.test.js`, `clients/socketAdapter.test.js`, `repositories/multiInstance.test.js`, `sockets/adapter.test.js`, `matchmakingTwoInstances.test.js`, `matchmakingQueue.contract.test.js` |

## 3. Behaviour changes users will notice

- **Sign-in:**
  - Protected pages need a session that Supabase can verify; a forged cookie leads to `/login`.
  - If Supabase Auth is down, protected pages fail closed.
  - `/api/debug/session` is gone (404).
- **Time controls:**
  - The chosen increment applies.
  - Players are paired only on the same base time and increment.
  - 30-minute games count as classical.
  - Private games play at their chosen speed.
- **Clocks:**
  - A side that doesn't make its first move within 30 s aborts the game, unrated.
  - Leaving before both sides have moved aborts the game.
  - A move after your flag fell is refused and you lose on time.
  - Clocks stand still while a player is disconnected.
- **Tabs and reconnects:**
  - Closing one of two tabs doesn't start the opponent's "disconnected" countdown.
  - About once an hour the socket reconnects to pick up a fresh token.
  - A deploy reconnects clients instead of dropping them.
- **Chat and errors:**
  - Chat is stored and closes when the game ends.
  - Refused actions show a short toast.
- **Invites:** an old invite link to a game that already started says "not found or expired".
- **Rate limits:** bursts are refused with 429 / `rate_limited` and a retry time, e.g. more than 5 chat lines in 10 s, or 10 failed logins for one e-mail in 15 min.
- **CORS:** other people's `*.vercel.app` previews can no longer reach the game server.
- **Engine:**
  - "Engine busy" appears quickly when the engine is saturated.
  - Reviews of games without moves are no longer made.
  - Mates and moves like `Nbd7` are classified correctly.
- **Transport:** WebSocket only. A network that blocks WebSockets cannot play.

**Frontend changes made:**

- M1: Next 16 / React 19 migration (async `cookies`/`params`, `proxy.ts`), three UI libraries bumped to versions that support React 19, `requireUser` via claims, debug route deleted, build errors no longer ignored.
- M2: time-control picker values and labels, abort and time-out messages, ack toasts, `token_expired` reconnect, stale-game detection (G22).
- M3: safe redirects (S6), no console output (S14), rate limits on four API routes (login, signup, friend request, maverick move).
- M4: `transports: ['websocket']`.
- No low-risk frontend item (F2–F6, F8, F10–F18) was touched. F7 and F9 were fixed because they are part of TIME-CONTROL.

## 4. Decisions and updated tests

**ADR summary**

| ADR | Topic |
|---|---|
| F-022 | Base ref |
| F-023 | Node 26 everywhere |
| F-024 | Next 16 proxy: allow-list matcher, fails closed |
| F-025 | `getClaims` for reads, `getUser` for writes |
| F-026 | NX-14 |
| F-027 | One shared time-control model |
| F-028 | Canonical clock columns |
| F-029 | One finalizer |
| F-030 | One clock view |
| F-031 | First-move rule as a table; aborted games unrated |
| F-032 | G10 |
| F-033 | Moves after flag fall refused |
| F-034 | G11 |
| F-035 | G6 |
| F-036 | G12 |
| F-037 | G14 `AppError` codes |
| F-038 | G15 |
| F-039 | Per-socket game links |
| F-040 | G17 |
| F-041 | Token deadline and reconnect |
| F-042 | Errors propagate; retry; no outbox |
| F-043 | Acks |
| F-044 | G22 |
| F-045 | One CORS allow-list |
| F-046 | Rate limits; **fail open** (the availability choice) |
| F-047 | One FEN check at the engine boundary |
| F-048 | Mate scores and move parsing; logs the eval-perspective bug |
| F-049 | No review without moves |
| F-050 | Engine Dockerfile; model in git with checksum fallback |
| F-051 | Safe redirect helper |
| F-052 | No client console |
| F-053 | `apply_game_result` security definer function with compare-and-set |
| F-054 | Express 5 |
| F-055 | pino logs, `/livez`, `/readyz` |
| F-056 | Graceful shutdown |
| F-057 | Dependabot, CodeQL (advanced setup), audit gate |
| F-058 | Schema drift on a schedule |
| F-059 | Multi-replica design (CAS, tick lock, Redis matchmaking, Streams adapter, WebSocket only, presence) |

**Tests updated because they pinned the old behaviour.** None were deleted to get green. Each PR doc lists its own:

- **M1:**
  - The middleware tests became proxy tests: the "expired under a minute ago is accepted" pin and the locally decoded JWT table were removed.
  - Version pins.
  - `getUser` mocks became `getClaims` mocks.
- **M2:** about 15 "BUG pinned" tests now assert the fix: time controls, clock columns, the finalizer, clock views, first move, flag fall, chat, `match_found`, engine status codes, invites.
- **M3:**
  - CORS pins became 403.
  - A bad FEN now gets 400.
  - The engine health check reports "online" while the pool is busy.
  - Rating tests assert one function call.
  - Two lobby tests no longer expect a console line.
- **M4:**
  - Malformed JSON now gets a JSON 400.
  - Console spies became logger-port spies, with the same arguments.
  - An unhandled rejection is now fatal.
  - The CORS handshake tests use a WebSocket client.
  - Player rooms are added to joined rooms.
  - `socket.data` must be plain data.
  - Matchmaking tests read the queue asynchronously.

## 5. Manual steps, in order

1. **Node versions.**
   - Vercel: 26.x, read from `engines`; set it if the project pins a version.
   - Railway: the `server/Dockerfile` (`node:26-alpine`), with the builder set to DOCKERFILE.
   - Render (engine): its Docker image, Python 3.11.
   - Developers: `nvm use` (root `.nvmrc`).
2. **Migrations, staging first, then production, BEFORE deploying the M3 server:** `supabase/migrations/20261113100000_rating_atomic.sql`. It is additive and backfills `rated_at` for completed games; don't re-run the backfill after the new server is live. Then run `supabase test db` against staging. It was never run here.
3. **Model.** `chess-engine/style_model.pt` stays in git (26,113,812 bytes, sha256 `9d27ba3b1d57bd563c5e970111e362fc448f9217442b280383877fe6caf88f20`). To serve it from storage instead, upload it and set `MAVERICK_MODEL_URL` together with `MAVERICK_MODEL_SHA256`, computed with `shasum -a 256 style_model.pt`.
4. **Environment variables, per platform:**
   - **Railway (game server):**
     - `CORS_ORIGINS`: **required** (M3). Exact origins, comma-separated.
     - Optional: `CORS_PREVIEW_ORIGIN_REGEX` (M3), `LOG_LEVEL` (M4), `SOCKET_ADAPTER` (M4; leave unset = `redis`).
   - **Vercel (web):** `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (M3). Server-only. Without them the web rate limits are off.
   - **Render (engine):**
     - Docker runtime from the root `render.yaml`; an old native-Python service must be recreated.
     - `STOCKFISH_PATH=/usr/games/stockfish`.
     - Optional: `ENGINE_MAX_QUEUE`, `ENGINE_QUEUE_TIMEOUT_SECONDS`, `MAVERICK_MODEL_URL` + `MAVERICK_MODEL_SHA256`.
   - **GitHub secrets for the drift check:** `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`.
5. **Redis requirements.**
   - The game server needs Lua (`EVAL`), Streams (`XADD`/`XREAD BLOCK`) and `SET … PX NX`. Redis ≥ 7 is recommended; CI uses `redis:7-alpine`.
   - The web limiter uses Upstash REST with `PEXPIRE … NX`, which needs Redis 7 semantics. This is not verified on Upstash.
   - For two or more replicas, prefer a Railway Redis add-on: every blocking `XREAD` is a billed command on Upstash.
6. **GitHub settings.**
   - Enable secret scanning **and push protection**, and Dependabot alerts.
   - Keep CodeQL on *advanced* setup (the workflow); default setup would conflict with it.
   - Required status checks on `preprod` and `main`, exact names:
     - `Server (Node)`
     - `Frontend (Next.js)`
     - `Chess engine (Python)`
     - `Database (Supabase)`
     - `CodeQL (javascript-typescript)`
     - `CodeQL (python)`
   - Add `Dependency audit` as required only once it is green; today it is red with 29 server and 4 frontend advisories.
   - Don't make `Schema drift (Supabase)` required: it runs on a schedule.
7. **Railway healthcheck:** move it to `/readyz` after M4. `/api/health` still works.
8. **When Railway can scale beyond 1 replica:** after M4 is deployed on one replica and has run for about a day, with `SOCKET_ADAPTER` at `redis`, a Redis that meets step 5, and the M4 frontend already live. Then go to 2 replicas and run the two-replica manual test (section 6) before going higher. DEPLOY.md §4b-2 has the details. No single-replica restriction was written in DEPLOY.md before, so none was removed; a "Running more than one replica" section was added instead.
9. **Deploy order and rollback, per PR:**
   - **M1:**
     - Deploy: web and server, any order.
     - Rollback: redeploy the previous builds; sessions survive.
   - **M2:**
     - Deploy: server and web **together**, because the socket payloads changed.
     - Rollback: roll both back together. Rows written in the meantime stay readable by the old code.
   - **M3:**
     - Deploy: migration → engine (Docker) → server (with `CORS_ORIGINS`) → web.
     - Rollback: previous builds; leave the migration in place.
   - **M4:**
     - Deploy: web first (WebSocket-only works with the old server), then the server on 1 replica, then scale.
     - Rollback: scale to 1 replica first, then the previous server build. The `{mm}:*` and `clocktick:*` keys expire on their own; players who were in the queue must search again.

## 6. How to publish later

From the main checkout (`/Users/chidanandh/Desktop/GAMBIT`), with the owner's GitHub account signed in:

```bash
git push -u origin fix/medium-1-platform-upgrade
git push -u origin fix/medium-2-game-correctness
git push -u origin fix/medium-3-abuse-integrity
git push -u origin fix/medium-4-scaling-ops

gh pr create --base fix/high-3-supabase-lockdown --head fix/medium-1-platform-upgrade \
  --title "$(head -1 ../GAMBIT-wt/medium-1/docs/fixes/pr/M1.md | sed 's/^# //')" \
  --body-file ../GAMBIT-wt/medium-1/docs/fixes/pr/M1.md
gh pr create --base fix/medium-1-platform-upgrade --head fix/medium-2-game-correctness \
  --title "$(head -1 ../GAMBIT-wt/medium-2/docs/fixes/pr/M2.md | sed 's/^# //')" \
  --body-file ../GAMBIT-wt/medium-2/docs/fixes/pr/M2.md
gh pr create --base fix/medium-2-game-correctness --head fix/medium-3-abuse-integrity \
  --title "$(head -1 ../GAMBIT-wt/medium-3/docs/fixes/pr/M3.md | sed 's/^# //')" \
  --body-file ../GAMBIT-wt/medium-3/docs/fixes/pr/M3.md
gh pr create --base fix/medium-3-abuse-integrity --head fix/medium-4-scaling-ops \
  --title "$(head -1 ../GAMBIT-wt/medium-4/docs/fixes/pr/M4.md | sed 's/^# //')" \
  --body-file ../GAMBIT-wt/medium-4/docs/fixes/pr/M4.md

# once pushed (the branches stay):
git worktree remove ../GAMBIT-wt/medium-1
git worktree remove ../GAMBIT-wt/medium-2
git worktree remove ../GAMBIT-wt/medium-3
git worktree remove ../GAMBIT-wt/medium-4
```

Before pushing, make sure `fix/high-3-supabase-lockdown` on origin is still at `70a94f9`. If it moved, rebase M1 onto it and the rest of the stack in order. The helper worktrees `../GAMBIT-wt/side-*` and their `wip/*` branches can be removed (`git worktree remove`, `git branch -D wip/...`); everything in them was merged into the four branches. Never merge into `main` or `preprod` without review; PRs target `preprod`.

**Manual test checklist (staging):**

1. Two browsers, two accounts:
   - sign up, log in, and find a game through matchmaking;
   - play to mate: moves, clocks, increment, chat; one rating change each;
   - rematch;
   - an invite link and a challenge.
2. Don't move for 30 s as White → game aborted, unrated.
3. Let a flag fall and move just after → refused, loss on time.
4. Close one of two tabs on the same game → no countdown for the opponent. Close both → countdown, then abandonment.
5. Six chat lines in 10 s → the 6th is refused.
6. `?next=https://example.com` after sign-in → you land on `/lobby`.
7. Engine: analysis, review, the computer opponent; "Engine busy" under load.
8. Redeploy the server mid-game → clients reconnect and the game continues.
9. **Two-replica test:**
   - scale Railway to 2;
   - repeat test 1 until the logs (`hostname` field) show the two players on different replicas;
   - then open a second tab on the other replica and close the first (test 4);
   - restart one replica mid-game → the game continues and the clocks were charged once;
   - `/readyz` is 200 on both.

## 7. Rulebook and SOLID compliance, and metrics

Each PR doc has a "Rulebook compliance" section with the rules applied, the deviations with links to their ADRs, and the gate output.

**Applied throughout:**

- **Structure:**
  - Pure domain rules: `clockVerdict` table, `timeControl`, `planPairs`, result.
  - Small ports with shared contract suites: game store, matchmaking queue, Upstash store.
  - Factory injection from `src/index.js`.
  - Supabase and Redis access only in `repositories/` and `clients/`.
  - Thin routers in the engine; config through `config.py` / `env.js`, validated at startup.
- **Safety:**
  - Input validated at every boundary.
  - Security checks fail closed (proxy, CORS, redirects, FEN, model checksum, rating function grants).
  - Rate limiters fail open, by ADR (F-046).
- **Code rules:**
  - No new `eslint-disable`, `ts-expect-error` or `noqa`.
  - No `any`.
  - dependency-cruiser: all rules at error, no violations.

**Deviations, all with ADRs:**

| Deviation | ADR |
|---|---|
| Proxy matcher is an allow-list | F-024 |
| Claims-only reads | F-025 |
| `timeControlRules` re-export | F-027 |
| Categories ignore the increment | F-027 |
| Legacy clock columns kept | F-028 |
| Acks without timeout; challenges without acks | F-043 |
| No outbox | F-042 |
| Limiters fail open | F-046 |
| `service_role` keeps profile UPDATE | F-053 |
| CodeQL advanced setup (GIT-06) | F-057 |
| Socket wrapper logs without the socket's child logger | F-055 |

**Metrics** (`scripts/metrics/metrics.js`; raw lines; SIZE rules count code lines only, and ESLint enforces them):

| | Before (base `70a94f9`) | After M4 (`c9c9f52`) |
|---|---|---|
| Server source files / lines | 64 / 4,637 | 90 / 6,798 |
| Frontend files / lines | 228 / 14,346 | 232 / 14,744 |
| Engine files / lines | 16 / 1,175 | 18 / 1,527 |
| Longest function, raw lines (server / frontend / engine) | 90 / 111 / 46 | 112 / 113 / 46 |
| Functions over complexity 10 | 0 | 0 |
| Max complexity (server / frontend / engine) | 9 / 10 / 10 | 9 / 10 / 10 |
| Explicit `any` | 0 | 0 |
| Files over 300 *code* lines (ESLint SIZE-01) | 0 | 0 |

The server grew mostly from new modules with one job each: repositories (game store CAS, tick lock, matchmaking queue, Lua scripts), clients (adapter, Redis commands), observability, shutdown and readiness. Functions that are long in raw lines are factory functions, mostly JSDoc. By code lines they are within SIZE-02, which ESLint enforces.

Per-file before/after tables for the files each PR changed are in each `docs/fixes/pr/M<n>.md`.

## 8. Remaining issues

1. **Review scores are wrong for White (found in M3, not fixed).** The stockfish package returns White-perspective evaluations, but the review code always negates them, so every White move is mis-scored. MAVERICK playing Black has the same bug. This should be the first fix in the next phase (F-048).
2. **Dependency audit is red:** 29 server advisories (28 high, 1 critical) and 4 frontend, all transitive. Bump the dependencies or add dated exceptions.
3. **Not verified here:**
   - `supabase test db` and the rating function through PostgREST `rpc`. A float8 round-trip mismatch in the compare-and-set would mark every rated game "stale", so check one rated game on staging.
   - Real Upstash, including `PEXPIRE NX`.
   - Vercel's `x-forwarded-for`.
   - The Docker images.
   - Render's Docker runtime.
   - A real two-replica Railway deploy, Redis Cluster and failover.
   - The schema-drift CLI flags.
4. **No outbox:** a game whose result row cannot be written after 3 tries stays `active` in the database. It is logged.
5. **Acks:** they have no timeout; challenge emits and the auto re-queue have no acks.
6. **Database privileges:** `service_role` still has UPDATE on `profiles`. Move the web routes to functions, then revoke it.
7. **Legacy columns:** the `*_time_ms` columns are still there; drop them in a later migration.
8. **Engine API:**
   - `/classify-move` answers 200 "Mistake" for an illegal move.
   - `/analyze` accepts an unbounded depth.
   - The maverick proxy maps the engine's 503 to 502.
9. **Logging:**
   - The socket handler wrapper doesn't use the socket's child logger.
   - The request id is not passed on to Supabase or engine calls.
   - There is no error tracker (SEC-12).
10. **Stale docs and housekeeping:**
    - `docs/Analysis_model_chess_bot.md` and the engine tree in `ARCHITECTURE`.
    - `supabase/.temp/` is not git-ignored.
11. **Possible flakes:** two unexplained one-off failures in `characterization/http.test.js` under full-suite load, "21st analysis request → 429" and a CORS check answering 404 instead of 403. Neither reproduced in 10+ later full runs; watch them in CI.
12. **Redis outages:** the adapter's unawaited writes are now handled (`9881a4a`). Other library code that might reject unhandled during a long Redis outage was not audited, and any such rejection is fatal by design (F-056).
13. **Deploy risk with one replica:** a server deploy of more than ~20 s can still end games by abandonment. Two replicas remove this.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
