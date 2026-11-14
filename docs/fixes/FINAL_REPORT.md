# GAMBIT fixes — final report

Written for the repository owner and whoever deploys and maintains GAMBIT after the fix programme.
It covers the publishing of the medium-risk work and the remaining (low-risk) work. The earlier
phases are in `docs/fixes/HIGH_RISK_REPORT.md` and `docs/fixes/MEDIUM_RISK_REPORT.md`; every decision
is in `docs/fixes/DECISIONS.md` (F-001 … F-094, with an index at the top). Current deployment, setup
and architecture docs: `DEPLOY.md`, `setup.md`, `docs/ARCHITECTURE.md`, `readme_first.md`.

## 1. Publishing outcome

- **Account:** `Chidhanand07` (the owner, ADMIN on `Chidhanand07/GAMBIT`), active in `gh`.
- **Case of A2:** (a). `origin/fix/high-3-supabase-lockdown` was still at `70a94f9`, so the medium stack
  was pushed as built, with no rebase.
- **What went wrong, and the repair.** #23–#26 were merged into their stacked base branches *after*
  those bases had already been merged upward, so none of M1–M4 reached `preprod` (the high stack #20–#22
  had). Repaired with #27 (`fix/medium-4-scaling-ops` → `preprod`). From then on every PR targeted
  `preprod` directly and was merged in order, each verified with `git merge-base --is-ancestor <tip>
  origin/preprod` and an empty tree diff. The leftover `fix/*` and `refactor/*` branches on origin are
  each one merge commit ahead of `preprod` and add no content (verified with `git merge-tree`).
- **Merges were done at the owner's explicit request** ("merge them to preprod properly", "i want all
  works on preprod") with **merge commits** (never squash). Nothing was merged into `main`.

| PR | Branch | Base | Head | Merged as | Server | Frontend | Engine | Database | CodeQL | Audit | Vercel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| [#23](https://github.com/Chidhanand07/GAMBIT/pull/23) M1 | `fix/medium-1-platform-upgrade` | `fix/high-3-…` | `c4d38a6` | `e214c7d` (into base) | ✓ | ✓ | ✓ | ✓ | – | – | ✓ |
| [#24](https://github.com/Chidhanand07/GAMBIT/pull/24) M2 | `fix/medium-2-game-correctness` | M1 | `63e3ef5` | `6daf212` (into base) | ✓ | ✓ | ✓ | ✓ | – | – | ✓ |
| [#25](https://github.com/Chidhanand07/GAMBIT/pull/25) M3 | `fix/medium-3-abuse-integrity` | M2 | `96ca8a5` | `ff1005f` (into base) | ✓ | ✓ | ✓ | ✓ (83 pgTAP) | – | – | ✓ |
| [#26](https://github.com/Chidhanand07/GAMBIT/pull/26) M4 | `fix/medium-4-scaling-ops` | M3 | `cfeb664` | `882ec98` (into base) | ✓ | ✓ | ✓ | ✓ | ✓ 0 alerts | ✗ | ✓ |
| [#27](https://github.com/Chidhanand07/GAMBIT/pull/27) M1–M4 → preprod | `fix/medium-4-scaling-ops` | `preprod` | `4be9698` | `a33a2b3` | ✓ | ✓ | ✓ | ✓ | ✓ (3 alerts fixed) | ✗ | ✓ |
| [#28](https://github.com/Chidhanand07/GAMBIT/pull/28) L1 | `fix/low-1-engine-server-correctness` | `preprod` | `8df9ba7` | `c9beebb` | ✓ | ✓ | ✓ | ✓ | ✓ 0 | ✗ | ✓ |
| [#29](https://github.com/Chidhanand07/GAMBIT/pull/29) L2 | `fix/low-2-frontend-game-lobby` | `preprod` | `0fe0be3` | `805fb81` | ✓ | ✓ | ✓ | ✓ | ✓ 0 | ✗ | ✓ |
| [#30](https://github.com/Chidhanand07/GAMBIT/pull/30) L3 | `fix/low-3-frontend-pages-cleanup` | `preprod` | `60c9ea6` | `c31a101` | ✓ | ✓ | ✓ | ✓ (99 pgTAP) | ✓ 0 | ✗ | ✓ |
| L4 (the PR that adds this file) | `fix/low-4-supply-chain-docs` | `preprod` | see the PR | see the PR | see the PR | | | | | **green locally** | |

"Audit ✗" before L4 is the known red Dependency audit (advisories already present in `preprod`); L4
makes it green. Its CI results are on the PR page.

Housekeeping: the helper worktrees (`side-mm`, `side-ops`, `side-engine`) and the local `wip/*`
branches were removed; nothing on origin was deleted.

## 2. Item checklist (Part B)

| Item | Status | PR · commits | Proving tests |
|---|---|---|---|
| ENG-PERSPECTIVE (reviews mis-scored White; MAVERICK as Black) | fixed | L1 `92bfd4b` | `tests/test_perspective.py`, `test_perspective_real_stockfish.py` (8, real binary; 3 failed on the old code); 15 existing tests failed on the old code once the fake modelled the package |
| ENG-PERSPECTIVE re-review script | fixed (not run on real data) | L1 `3220190` | `tests/test_rereview.py` |
| ACKS (challenge acks, timeouts, one retry, re-queue) | fixed | L1 `386d515`, L2 `40fb7c4` | `__tests__/lib/socket/ack.test.ts` (22), SocialPages, lobby characterization, `commands.test.ts` "never answers" (6 failed before), server matchmaking takeover + `profile_not_found` |
| ERRORS (durable re-drive outbox) | fixed | L1 `58c71c1` | `gameResultOutbox.contract.test.js` (18), `resultOutboxWorker.test.js` (11), `integration/resultOutboxTwoWorkers.test.js` (real Redis), finalizer tests |
| FLAKY (two one-off http.test failures) | fixed (root cause found) | L1 `eee509f` | `helpers/loopback.test.js`; forced reproduction 13–18 failures/run → 0 |
| §8 socket wrapper child logger | fixed | L1 `e4be495` | `sockets/handlers.test.js`, `wrap.test.js` |
| §8 request id to engine/Supabase | fixed | L1 `8015873` | `clients/engineClient.test.js`, `supabaseClient.test.js`, end to end in `characterization/http.test.js` |
| §8 error tracker (SEC-12) | partial (port + webhook; Sentry deferred) | L1 `e762c24` | `observability/errorReporter.test.js`, `clients/webhookErrorReporter.test.js` |
| §8 drop legacy `*_time_ms` columns | fixed | L1 `871aafa` | pgTAP `04_legacy_clock_columns` (CI ✓), `scripts/legacy-clock-columns.test.js` |
| §8 Railway healthcheck → `/readyz` | fixed | L1 `ad3212e` | `config/railway.test.js` |
| §8 `/classify-move` illegal move → 400 | fixed | L1 `33ca758` | `tests/test_classify_move_validation.py` |
| §8 `/analyze` unbounded depth | fixed | L1 `6f89995`, `70de4be` | `tests/test_depth_bound.py`, `__tests__/http/schemas.test.js` |
| §8 maverick proxy 503 → 502 | fixed | L3 `90ddf54` | maverick route tests |
| §8 `service_role` UPDATE on profiles | fixed | L3 `af63aa6` | pgTAP `05_profiles_service_role` + updated `01` (CI ✓), `api/profile` S8-PRIV test |
| §8 stale docs; `supabase/.temp` | docs fixed (L4); `.temp` ignore not changed | L4 docs commits | – |
| F2 duplicate join/resync | fixed | L2 `7170174` | GamePage "join_game exactly once…" (4 failed before) |
| F3 rematch timer | fixed | L2 `f4a93c0` | GamePage + `gameSocketHandlers.test.ts` |
| F4 spectator "You" | fixed | L2 `e3e248a` | GamePage, `utils.test.ts` |
| F5 clock override threshold | fixed | L2 `a825685` | `gameReducer.test.ts` |
| F6 first ← from live | fixed | L2 `8e94d68` | `utils.test.ts`, GamePage, `components.test.tsx` |
| F8 lobby queue | fixed | L2 `986616e` | LobbyPage characterization, `features/lobby/hooks.test.tsx` |
| F10 Play Online redirect | fixed | L2 `8cb6146` | `loginRedirect.test.ts`, LobbyPage |
| F11 presence channel | fixed | L3 `fd5935f` | `features/profile/presence.test.tsx` |
| F12 profile issues (7) | fixed | L3 `cb41b6d` `031fcc8` `1be1e38` `6c0267e` `b9c84f6` `67bcbc9` `06dc1e4` | ProfilePage, `gameOutcome.test.ts`, `links.test.ts`, profileApi |
| F13 offline takeback as Black + engine retry | fixed | L2 `70a13ea` | OfflinePage characterization, `offline/game.test.ts` |
| F14 analysis (status, stale selection, updaters; real engine body) | fixed | L3 `a0b51c5` | AnalysisPage, `board.test.ts`, `useArrowKeyNavigation.test.tsx` |
| F15 notifications dot + errors | fixed | L3 `0e04582` | Navbar characterization |
| F16 review polling on error | fixed | L2 `450b327` | GameResultPage |
| F17 misc (8) | fixed | L1 `386d515` (spinner), L3 `edd4310` `20e8048` `c8333c8` `e9c0e7b` `1df3c72` `13e8fe1` `d538952` | per-item tests in each commit |
| F18 PATCH, limit/offset, invite tokens, signup rollback | fixed (limit/offset already fixed in S7) | L3 `cf63757` `71d9172` `d843cf5` | `api/profile.test.ts`, `privateGames.test.ts`, signup tests |
| exhaustive-deps disables in game/lobby | fixed (5 removed) | L2 `69126ea` | GamePage stale-closure tests, `useOpponentDisconnect.test.ts` |
| Remaining eslint-disables + 9 lint warnings | fixed (8 removed; 0 warnings) | L3 `c5eec6f` `bfa4de2` `7f7f312` | `AvatarImage.test.tsx`, signup tests |
| SUPPLY-CHAIN (audit green) | fixed | L4 (9 commits) | the audit gate itself (0/0/0), zod 4 equivalence tests |
| Docs (README, readme_first, setup, DEPLOY, ARCHITECTURE, `.env.example`) | fixed | L4 docs commits | `tests/test_build_config.py` (engine env vars documented) |
| CodeQL alerts found on the first run (3) | fixed | #27 `deaf493` `34fc9b8` `4be9698` | `test_api.py`, `eslint-baseline.test.js`, `sync-shared.test.js` |

## 3. CI findings on the first GitHub runs

- **CodeQL** (first run against `preprod`, #27): 3 alerts — `js/file-system-race` (high,
  `scripts/sync-shared.js`), `js/incomplete-sanitization` (high,
  `scripts/lint-baseline/eslint-baseline.js`), `py/stack-trace-exposure` (medium,
  `chess-engine/routers/moves.py`: exception text returned to the client). All fixed with tests before
  merging #27; every later PR showed **0 open alerts**.
- **Dependency audit:** red from M4 on (server 27 high, frontend 4 high, engine 17), as recorded in
  F-057. Made green in L4 by upgrading/removing direct dependencies only (F-090).
- **Database (Supabase) / pgTAP** ran in CI for the first time on these branches: 83 tests on M3
  (including the rating function), **99 tests in 6 files** on L3 (including both new migrations) —
  all pass. This closes the "pgTAP not run" items of the medium phase.
- **Schema drift** is schedule/dispatch-only and needs three repository secrets; it has not run (§6).
- **Vercel previews** built on every PR.

## 4. Behaviour changes users will notice (low phase)

- **Game reviews are scored correctly for White** (1.e4 was an "Inaccuracy"); accuracies change; old
  reviews stay wrong until the re-run script is applied (§6). The computer opponent plays correctly as
  Black.
- **Analysis shows real evaluations** (it always showed 0.0), mates as "M3", "Engine unavailable" on
  errors.
- Actions the server never confirms (move, resign, chat, rematch, challenge, queue) report "The server
  did not answer…" after 8 s instead of hanging; challenges show a spinner until confirmed.
- A dropped connection while searching keeps you in the queue and matched; leaving the lobby while
  searching leaves the queue.
- Game page: no re-join on sound toggle or seat resolve; correct history stepping; no "You" for
  spectators; a rematch window per request.
- Profiles: Online dot, aborted games not losses, per-category ratings, not-found page, retryable
  errors; **changing the avatar no longer erases display name, bio and country**.
- Notifications dot on page load; login shows OAuth errors and returns you where you were going.
- Offline: Retry on engine errors; Takeback as Black no longer strands the game.

## 5. Decisions and tests updated

Decisions F-060 … F-094 (index in `DECISIONS.md`): one evaluation perspective (F-060) and the
re-review script (F-061); engine boundary checks (F-062, F-063, F-072); ack timeouts with a retry
policy by idempotency (F-065); a Redis outbox for refused results (F-066); the flaky-test root cause
(F-067); logging context and request ids (F-068); an error-reporting port (F-069); dropping the legacy
clock columns (F-070); `/readyz` as healthcheck (F-071); React `useEffectEvent` for socket callbacks
(F-075); history semantics (F-076); one queue request (F-077); offline retry (F-078); countdown
dependency (F-079); presence, outcome, peak, analysis adapter, sounds, images, profile privileges,
login errors, maverick 503 (F-080 … F-088); the supply-chain upgrades (F-090 … F-094).

Tests that pinned old behaviour were updated, never deleted; each PR description (`docs/fixes/pr/L1.md`
… `L4.md`) lists them with old → new. The largest groups: the engine's fake Stockfish now models the
package (sign of evaluations); game page join counts and history indexes; lobby payload shapes and
`leave_queue` on unmount; profile outcome/peak/encoding; analysis fixtures with the real engine body;
`01_profiles_rls` now expects the direct service-role rating write to fail.

## 6. Everything the owner must do, in order (all phases still outstanding)

**A. Before any deploy**
1. Back up production (Supabase → Database → Backups, or `pg_dump`).
2. Supabase → API Keys: create a **publishable** and a **secret** key; keep the legacy keys enabled
   until step F. Create the `avatars` Storage bucket if it does not exist (DEPLOY.md §1c).
3. GitHub → Settings → Code security: enable **secret scanning** and **push protection**, Dependabot
   alerts. Keep CodeQL on **advanced** setup (the workflow).
4. GitHub rulesets `protect-preprod` and `protect-main`: add required status checks with these exact
   names: `Server (Node)`, `Frontend (Next.js)`, `Chess engine (Python)`, `Database (Supabase)`,
   `CodeQL (javascript-typescript)`, `CodeQL (python)`, and — once L4 is merged and green —
   `Dependency audit`. Do not require `Schema drift (Supabase)` (scheduled).
5. GitHub repository secrets for the drift check: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`,
   `SUPABASE_PROJECT_REF`; then run the workflow once by hand.

**B. Environment variables** (full tables per platform in `DEPLOY.md`)
- **Vercel:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
  `NEXT_PUBLIC_SOCKET_URL`, `GAMBIT_ENGINE_URL`, `ENGINE_SHARED_SECRET`, `UPSTASH_REDIS_REST_URL`,
  `UPSTASH_REDIS_REST_TOKEN` (rate limits; off without them). Node 26 (from `engines`).
- **Railway:** `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `REDIS_URL`, `CORS_ORIGINS` (**required**),
  `GAMBIT_ENGINE_URL`, `ENGINE_SHARED_SECRET`; optional `CORS_PREVIEW_ORIGIN_REGEX`, `LOG_LEVEL`,
  `SOCKET_ADAPTER` (leave unset = `redis`), `ERROR_WEBHOOK_URL`. Docker builder (Node 26). Healthcheck
  `/readyz` (set by `server/railway.toml`).
- **Render (engine, Docker runtime):** `ENGINE_SHARED_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
  `STOCKFISH_PATH=/usr/games/stockfish`, `STOCKFISH_POOL_SIZE`; optional `ENGINE_MAX_QUEUE`,
  `ENGINE_QUEUE_TIMEOUT_SECONDS`, `MAVERICK_MODEL_URL` + `MAVERICK_MODEL_SHA256` (the model is in git,
  26,113,812 bytes, sha256 `9d27ba3b1d57bd563c5e970111e362fc448f9217442b280383877fe6caf88f20`). An old
  native-Python service must be recreated as Docker.
- **Upstash / Redis:** the game server needs Lua, Streams (`XREAD BLOCK`) and `SET … PX NX` (Redis ≥ 7);
  for two or more replicas prefer a Railway Redis add-on (blocking reads are billed per command on
  Upstash). The web app's limiter needs an Upstash REST database.
- **Local development:** see `setup.md` and the three `.env.example` files.

**C. Database migrations — staging first, then production, one file at a time** (SQL editor or
`psql -f`; record each with `supabase migration repair --status applied <version>`; not `db push`)
1. `20261112100000_profiles_lockdown.sql`, `20261112100100_game_invites_expand.sql`,
   `20261112100200_drop_matchmaking_queue.sql` (high phase; the last stops if a public table lacks RLS).
2. `20261113100000_rating_atomic.sql` — **before** the new game server goes live.
3. Deploy (D below), confirm a private invite works, then `20261112100300_game_invites_contract.sql`.
4. `20261114100000_drop_legacy_clock_columns.sql` — only once every game server and the web app run
   the new code (they do after D).
5. `20261114200000_profiles_revoke_service_role_update.sql` — only after the new web app is live.
6. Run the Security Advisor; run `supabase test db` against staging (CI already passes 99 pgTAP tests).

**D. Deploy order** (everything is in `preprod`; deploy `preprod` to staging, then promote)
1. Engine (Render, Docker) → game server (Railway, **1 replica**) → web app (Vercel). Pick a quiet
   moment: the socket protocol changed several times; open tabs must reload.
2. Smoke test (§7), then apply C.3–C.5.
3. Re-run stored reviews from the engine's shell (`DEPLOY.md` §10): `python -m scripts.rereview_games
   --limit 20` (dry run), check, then `--apply --concurrency 2`.

**E. Scaling Railway beyond 1 replica** — only after a day on one replica, with `SOCKET_ADAPTER`
unset/`redis`, a Redis meeting B, and the new web app live; then 2 replicas and the two-replica test
(§7) before going higher.

**F. Keys** — once everything works on the new keys, disable the legacy `anon`/`service_role` keys in
Supabase and remove the old variable names.

**G. Merge order and promotion.** All PRs (#20–#30 and L4) are merged into `preprod` once L4 is merged.
Promote `preprod` → `main` with one PR (merge commit) when: all required checks are green on
`preprod`; staging ran D and C without errors; the manual tests in §7 pass, including the review-score
check and, if scaling, the two-replica test; no fatal lines or webhook reports for a day.

**Rollback per PR**

| PR | Rollback |
|---|---|
| High #20–#22 | `HIGH_RISK_REPORT.md` §5.4 (before the invite contract migration: redeploy; after it: re-add the two invite columns first). |
| M1–M4 (#27) | `MEDIUM_RISK_REPORT.md` §5: previous builds; leave `rating_atomic` in place; scale to 1 replica before rolling the server back. |
| L1 (#28) | Previous engine and server builds; outbox keys are ignored by old code; re-add the two clock columns as `integer` only if an old server must run. |
| L2 (#29) | Previous web build. |
| L3 (#30) | Previous web build **and** `GRANT UPDATE ON TABLE public.profiles TO service_role;`. |
| L4 | Previous builds of all three (dependency versions only); no data changes. |

## 7. Manual test checklist

**Two browsers, two accounts (staging)**
1. Sign up/in on both; queue the same time control; you are paired; play a game to mate with clocks
   and increment, chat, then resign a second game; one rating change per game; rematch; an invite
   link; a challenge (spinner until sent).
2. Don't move for 30 s as White → aborted, unrated, shown as "Aborted" on the profile.
3. Close one of two tabs on a game → no countdown for the opponent; close both → countdown, then
   abandonment.
4. Toggle sound in a game → no reconnect; as a spectator → no "You" badge; ← from live shows the
   previous move.
5. Leave the lobby while searching → the other browser's searching count drops.
6. Profile: Online dot; change avatar → name/bio/country kept; `/profile/does-not-exist` → not found.
7. Stop the game server briefly and move → "The server did not answer…" after ~8 s.

**Review scoring**
8. Play 1.e4 e5 2.Nf3 Nc6 3.Bb5 and resign; the review rates White's moves "Best"/"Excellent"-class
   (not "Inaccuracy"); the eval graph rises for White's good moves. Analysis of the same FEN shows a
   small positive evaluation, not 0.0.
9. MAVERICK as Black: hang a piece; it takes it.

**Two replicas (only when scaling)**
10. Two browsers until the logs (`hostname`) show the players on different replicas; play a full game:
    moves, clocks, chat, resign, rematch reach both; one rating change.
11. Restart one replica mid-game → the game continues; clocks were charged once; `/readyz` 200 on both.

## 8. Rulebook / SOLID compliance and metrics

Each PR description has a "Rulebook compliance" section with the rules applied, deviations (with
ADRs) and the check output. Summary:
- **L1:** pure perspective helper and redrive policy (SOLID-01/07); outbox port with one contract
  suite over fake, mock and real Redis (SOLID-04, TEST-08); injection from `src/index.js` (SOLID-06);
  boundary validation for move, depth, FEN (NODE-08); lock with compare-and-delete, correctness from the
  row guard (NODE-17); child loggers and request ids (NODE-20); `/readyz` (NODE-21); error port
  (SEC-12, Sentry deferred: F-069).
- **L2:** logic in hooks and pure helpers, rendering in components; every refusable emit has an ack
  with a timeout (NODE-13); 5 `eslint-disable` lines removed.
- **L3:** route handlers parse → requireUser → lib/server → DTO; least privilege (service role loses
  UPDATE on profiles, SEC-04/06); boundary parsing of the engine body; 8 `eslint-disable` lines
  removed; **frontend lint 0 errors, 0 warnings; no `eslint-disable` left in the frontend**.
- **L4:** SEC-11 green with no overrides or exceptions (F-090); docs rewritten to the current code.
- Throughout: no new `eslint-disable`, `ts-expect-error` or `noqa`; no `any`; dependency-cruiser clean
  (server 116 modules, 0 violations); files ≤ 300 code lines, functions ≤ 60 (100 JSX), complexity ≤ 10
  (ESLint-enforced).

**Test counts, before (M4 tip) → after (L4):** server 1,301 → 1,393; frontend 1,348 → 1,488; engine
466 → 571 (8 against a real Stockfish, skipped in CI); repository scripts 19 → 26; pgTAP 83 → 99.

## 9. Still open

1. The re-review script has not run against a real Supabase project (dry run first, §6 D.3).
2. Google sign-in still loses `?redirect=` (needs `?next=` in Supabase's `redirectTo` and an allow-list
   entry); the login "Sign up" link does not carry `?redirect=`.
3. A hosted error tracker (Sentry) and source maps are not set up (port ready, F-069).
4. Analysis replay after loading a FEN with moves starts from the standard position (pre-existing).
5. Review polling that exhausts its 20 tries without an analysis stays on "Analysing…".
6. `useComputerBoard` plays the win sound for any game over after the player's move (stalemate
   included); the game socket handler passes `won = false` for draws.
7. History lists still omit aborted games (product decision, F-081); `peak_*` columns do not exist yet
   (Peak is hidden, F-082).
8. Dev-only audit leftovers (not gated): server 16, frontend 25 (including a critical handlebars via
   jest's istanbul reporters); most are lockfile-only fixes.
9. Not verified on real infrastructure: two Railway replicas, Redis Cluster/failover, Upstash
   `PEXPIRE NX`, Socket.IO 4.8.4 across Vercel ↔ Railway, Supabase recording `X-Request-Id`, the error
   webhook, Railway's `/readyz` gating, the new FastAPI image on Render, the `avatars` bucket policy.
10. `/style-move` `top_k` is not bounded; `supabase/.temp/` is not git-ignored; the root `npm run dev`
    starts the engine without loading `chess-engine/.env`.
11. Starlette's TestClient warns about the httpx → httpx2 move (F-091).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
