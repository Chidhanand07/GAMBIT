# High-risk fixes: final report

Date: 2026-11-12. Scope: the 18 HIGH items of `docs/refactor/REPORT.md` §5, delivered as three
stacked pull requests. Nothing has been merged. Decisions referenced as F-0xx are in
[`DECISIONS.md`](./DECISIONS.md).

**Read this first.** Every item is implemented and covered by automated tests, and CI is green
on the tip of each branch except for one Vercel preview on PR 2 (see §1). What has **not**
happened: nothing was run against a real Supabase project, a real browser session, a deployed
engine, or real `sb_publishable_` / `sb_secret_` keys. The tests use a mocked Supabase and
Redis; the database tests run on the local Supabase stack in CI. The manual steps in §5 and the
manual tests in §6 are therefore required before production, not optional.

## 1. Pull requests

| # | Link | Branch | Base | CI | Files | Lines |
|---|---|---|---|---|---|---|
| 1/3 | [#20](https://github.com/Chidhanand07/GAMBIT/pull/20) | `fix/high-1-game-server-security` | `preprod` | Server, Frontend, Engine, Vercel: pass | 93 | +5316 / −1272 |
| 2/3 | [#21](https://github.com/Chidhanand07/GAMBIT/pull/21) | `fix/high-2-web-engine-security` | `fix/high-1-game-server-security` | Server, Frontend, Engine: pass. **Vercel preview: failed** | 81 | +2674 / −734 |
| 3/3 | [#22](https://github.com/Chidhanand07/GAMBIT/pull/22) | `fix/high-3-supabase-lockdown` | `fix/high-2-web-engine-security` | Server, Frontend, Engine, Database (Supabase), Vercel: pass | 56 (+ this file) | +1606 / −304 (+ this file) |

Line counts include tests and lockfiles. Production code only (no tests, no lockfiles):
PR 1 +1710 / −623, PR 2 +851 / −334, PR 3 +390 / −97.

**The PR 2 Vercel failure is unexplained.** The build log is not readable without Vercel
access. The same code builds locally on Node 20 and Node 22, and PR 3, which contains all of
PR 2, deploys to a Vercel preview successfully. Open the failed deployment in the Vercel
dashboard before merging PR 2; if it is a transient failure, "Redeploy" will clear it.

Branch base (F-001): `origin/main` and `origin/preprod` pointed at the same history, so PR 1
was cut from `origin/preprod`.

### Commits

**PR 1 (#20)**

| SHA | Commit | Items |
|---|---|---|
| `4a54970` | fix(config): read GAMBIT_ENGINE_URL, keep ENGINE_URL as a warned fallback | G5 |
| `32eac6c` | fix(socket): validate every payload with zod and make handlers crash-safe | S15 |
| `21f1919` | fix(socket): verify the Supabase token in the handshake, delete authenticate | S2, G13 |
| `71fa308` | fix(game): link only participants on join_game; others are spectators | S9 |
| `fe7b862` | fix(social): store rematch/challenge requests server-side; answers must match one | S4 |
| `fb5011f` | fix(game): validate every move on the server with chess.js; never trust a client FEN | S1, S10 |
| `8524ce5` | fix(game): the server decides results; add resign, remove client game_end | S3 |
| `f9307fe` | fix(game): make disconnect, reconnect and clock endings atomic with moves | S1, S3 (review follow-up) |
| `8bb8007` | fix(socket): keep the socket across a failed profile refetch; close on sign-out | S2 (review follow-up) |

**PR 2 (#21)**

| SHA | Commit | Items |
|---|---|---|
| `959273b` | fix(deps): upgrade next 14.0.3 -> 14.2.35 | NEXT-CVE |
| `d0e8be0` | fix(web): verify the caller with supabase.auth.getUser in every route handler | S5 |
| `0d9b259` | fix(web): validate every route input with zod; build .or() filters from UUIDs only | S7 |
| `5c368cc` | fix(api): return allow-listed DTOs; never send invite_token in a game response | S8 |
| `8bc397f` | fix(engine): require X-Engine-Key on every endpoint except /health | ENG-AUTH |
| `c4920b0` | fix(engine): release the Stockfish instance /health acquires | G18 |

**PR 3 (#22)**

| SHA | Commit | Items |
|---|---|---|
| `cc9b0a4` | fix(db): lock down profiles with column privileges and owner policies | S11 |
| `e224ee1` | fix(db): move invite tokens out of the world-readable games table | INV-TOKEN |
| `f6eb3eb` | fix(db): drop unused matchmaking_queue; guard that every public table has RLS | MATCHMAKING-QUEUE |
| `052c6d6` | ci(db): run migrations and pgTAP tests in a Database (Supabase) job | pgTAP + CI |
| `54f5f69` | test(db): compare policy and privilege catalog rows by count, not results_eq | S11 (test fix) |
| `62b6fca` | feat(config): accept Supabase publishable/secret keys, keep legacy names as fallbacks | SUPABASE-KEYS |
| (this commit) | docs(fixes): final report | – |

## 2. Item checklist

All 18 items are fixed in code. "Fixed" below means: implemented, with tests that failed before
the change and pass after. It does not mean verified in production (see the note at the top).

| Item | Status | Commit | Tests that prove it |
|---|---|---|---|
| S1 server-side move validation | Fixed | `fb5011f`, `f9307fe` | `server/__tests__/domain/chessRules.test.js`, `domain/moveAuthorization.test.js`, `services/gameService.test.js` (makeMove + race cases), `characterization/game.test.js` (illegal move → `move_rejected` + resync; engine down still validates; duplicate applied once) |
| S2 socket identity from a verified token | Fixed | `21f1919`, `8bb8007` | `server/__tests__/sockets/auth.test.js`, `services/tokenVerifier.test.js`, `characterization/session.test.js` ("handshake identity"), `frontend/__tests__/lib/socket/connection.test.ts`, `components/SocketProvider.test.tsx` |
| S3 server decides results | Fixed | `8524ce5`, `f9307fe` | `server/__tests__/domain/adjudication.test.js`, `services/gameFinalizer.test.js`, `services/clockService.test.js`, `characterization/game-end.test.js` (mate, stalemate, insufficient material, threefold, fifty-move, resign, client `game_end` ignored) |
| S4 rematch/challenge need a stored request | Fixed | `fe7b862` | `server/__tests__/repositories/pendingRequestsRepository.test.js`, `services/socialService.test.js`, `characterization/social.test.js` (no pending, third party, single use, expiry) |
| S5 verified identity in route handlers | Fixed | `d0e8be0` | `frontend/__tests__/api/cookieAuth.test.ts` (18 handlers × 9 forged/absent sessions → 401, zero DB calls), `lib/server/identity.test.ts` |
| S7 input validation, safe `.or()` filters | Fixed | `0d9b259` | `frontend/__tests__/api/validation.test.ts`, `lib/server/validation.test.ts`, updated `api/{friends,games,profile}.test.ts` |
| S8 allow-listed responses | Fixed | `5c368cc` | `frontend/__tests__/lib/server/dto.test.ts`, `server/__tests__/domain/gameDto.test.js`, `characterization/http.test.js` (join responses and `game_start` carry no token) |
| S9 only participants are linked to a game | Fixed | `71fa308` | `server/__tests__/characterization/timers.test.js` (spectator disconnect changes nothing), `services/gameService.test.js` |
| S10 client FEN never trusted | Fixed | `fb5011f` | Same as S1; `sockets/schemas.test.js` (client `fen`/`san` stripped) |
| S11 profiles lockdown | Fixed | `cc9b0a4`, `54f5f69` | `supabase/tests/01_profiles_rls.test.sql` (31 assertions) |
| S15 payload schemas, crash-safe handlers | Fixed | `32eac6c` | `server/__tests__/sockets/schemas.test.js`, `sockets/wrap.test.js`, `sockets/crashSafety.test.js`, `processHandlers.test.js` |
| G5 engine URL variable | Fixed | `4a54970` | `server/__tests__/config/env.test.js` |
| G18 Stockfish leak in `/health` | Fixed | `c4920b0` | `chess-engine/tests/test_health_pool.py` |
| ENG-AUTH engine shared secret | Fixed | `8bc397f` | `chess-engine/tests/test_auth.py`, `tests/test_api.py` (`/analyse-game` 404/409/422/503), `server/__tests__/clients/engineClient.test.js`, `frontend/__tests__/api/misc.test.ts` |
| INV-TOKEN invite tokens out of `games` | Fixed | `e224ee1` | `supabase/tests/02_game_invites.test.sql` (13), `server/__tests__/services/privateGameService.test.js`, `friends.test.js`, `frontend/__tests__/api/games.test.ts` |
| MATCHMAKING-QUEUE | Fixed | `f6eb3eb` | `supabase/tests/00_schema_guards.test.sql` (8) |
| NEXT-CVE | Fixed, with a limit | `959273b` | `frontend/__tests__/security/nextVersion.test.ts`. Limit: `npm audit` still lists advisories for the 14.x line that are only fixed in Next 15/16 (F-011) |
| SUPABASE-KEYS | Fixed, not tested with real keys | `62b6fca` | `frontend/__tests__/security/supabaseKeys.test.ts`, `server/__tests__/config/env.test.js`, `chess-engine/tests/test_config.py` |

Also fixed because a listed item could not be done without it (each logged): G13 (`leave_queue`
could remove any user; F-004), F1 (rematch decline was addressed to the wrong user; F-006),
G16 (challenge accept sent an inverted colour; F-006), G1 (`games.result` was null for wins;
F-008).

Totals at the tip of PR 3: server 54 suites / 857 tests, frontend 51 suites / 989 tests,
engine 191 tests, database 52 pgTAP assertions.

## 3. Behaviour changes and frontend changes

### What users will notice

- **A signed-out or expired session cannot open a game socket.** The client retries with a
  fresh token every 5 seconds. Tabs that were open during the PR 1 deploy must reload: the old
  client does not send a token and is refused.
- **An illegal move snaps back.** The server answers `move_rejected` and resends the position.
- **Results appear when the server announces them**, slightly later than before (previously the
  mover's browser declared checkmate itself). Threefold repetition, the fifty-move rule and
  insufficient material now end the game as draws automatically; before, they did not.
- **Rematch and challenge answers only work for a request made in the last 60 seconds.** An
  older request silently does nothing when accepted; the user has to ask again.
- **A challenge accepted with no colour chosen gives random colours** (the challenger was
  always black before).
- **Declining a rematch now reaches the requester** (it went to the decliner before).
- **Spectators leaving no longer trigger the "opponent disconnected" countdown.**
- **Every data API route answers 401 when signed out**, including routes that used to return
  an empty list. Pages that need them already require sign-in. Still public: sign-in, sign-up,
  the leaderboard and the offline computer opponent.
- **Malformed ids, usernames or paging values give 400** instead of an empty result or a
  database error.
- **Game review** needs `ENGINE_SHARED_SECRET` on all three services. Without it reviews and
  the computer opponent stop working (503) rather than running unprotected.
- **No visible change from PR 3** if the deploy order in §5 is followed.

### Frontend changes

- `components/SocketProvider.tsx`, `lib/socket/connection.ts`: the socket sends the Supabase
  access token in the handshake; `authenticate` is gone; the socket lives until `SIGNED_OUT`.
- `features/game`: `make_move` sends `{ game_id, from, to, promotion }` only; handles
  `move_rejected`; no client-side game-over detection; `resign { game_id }` replaces the
  client `game_end`.
- Rematch/challenge emits send only the other user's id.
- `lib/server/identity.ts` (`requireUser`), `supabase.ts`, `validation.ts`, `filters.ts`,
  `dto.ts`, `engine.ts`, `env.ts`: all `server-only`. Every non-public route handler is
  parse → `requireUser()` → `lib/server` call → DTO, and is `force-dynamic`.
- `/login` is wrapped in `<Suspense>` (required by Next 14.2 for `useSearchParams`).
- `lib/supabase/publicEnv.ts`: reads the publishable key and refuses a secret key.
- Private game creation stores the invite in `game_invites`.
- Deleted: `app/actions/auth.ts` (an unused, unauthenticated service-role insert; F-017).

## 4. Decisions and characterization tests updated

### Decisions (full text in `DECISIONS.md`)

| ADR | Decision |
|---|---|
| F-001 | PR 1 is based on `origin/preprod`. |
| F-002 | `GAMBIT_ENGINE_URL` is canonical; `ENGINE_URL` still works and warns once. |
| F-003 | Socket schemas strip unknown keys (not `.strict()`); ack is `{ ok:false, error }`; ids are a slug charset; `unhandledRejection` logs and does not exit. |
| F-004 | Identity comes only from the handshake token; checked at connect time only. G13 fixed with it. |
| F-005 | Non-participants may join a game room as spectators but are never linked to a seat. |
| F-006 | Pending requests live in Redis for 60 s and are consumed atomically. F1 and G16 fixed with it. |
| F-007 | chess.js on the game server is the only move authority; the engine is no longer called per move; the per-game lock is per process. |
| F-008 | One finalizer; `games.result` is `white` / `black` / `draw` (G1). |
| F-009 | No draw-offer or abort events were added (none existed). |
| F-010 | Independent review before PR 1: five findings fixed, six deferred (listed in §7). |
| F-011 | Next pinned to exactly 14.2.35; 15/16 is the next phase. |
| F-012 | Route handlers keep the service-role client, only after `requireUser()`. |
| F-013 | Username lookups accept a wider pattern than new usernames so old accounts stay reachable. |
| F-014 | DTO allow-lists; what each response may contain. |
| F-015 | Engine: shared secret, constant-time compare, 503 when unset; `/analyse-game` requires an existing completed game. |
| F-016 | `/health` returns the Stockfish instance through the pool's context manager. |
| F-017 | `profiles`: column privileges; four editable columns; no client insert. |
| F-018 | `game_invites` table, expand/contract in two migrations, mirror trigger in between. |
| F-019 | Drop `matchmaking_queue`; the migration fails if any public table lacks RLS. |
| F-020 | Database CI job; `00005_schema_fixes.sql` renamed to `00006_…` (content unchanged) because two files shared a version. |
| F-021 | New key names first, legacy names as fallbacks; `supabase-js ~2.109.0`, `@supabase/ssr 0.12.0`, Python `supabase 2.34.1`. This revises the versions PR 2 took. |

### Tests updated because they pinned the old behaviour

No test was deleted to get green. Where a test characterized a bug, it now asserts the correct
behaviour; where it characterized an event or function that no longer exists, its assertions
were moved to the replacement.

**PR 1**

- *S15*: unknown payload keys are no longer relayed (`social`, `game`, `game-end`
  characterization suites); non-string ids are rejected instead of echoed (`session`).
- *S2 / G13*: the test harness connects with a token. "`authenticate`" cases became "handshake
  identity" cases. "Social events work from unauthenticated sockets (BUG pinned)" → the sender
  is the verified user and an unauthenticated client cannot connect. "`leave_queue` removes the
  given user id from ANY socket (pinned)" → only the caller is removed. Frontend: expected
  emits no longer include `authenticate`.
- *S9*: "a non-player who joined the room is recorded as the BLACK side when disconnecting
  (pinned)" → a spectator's disconnect changes nothing.
- *S4*: rematch and challenge suites rewritten around a stored request. Removed pinned
  oddities: accept trusting payload terms, "challenger always black". Frontend expectations for
  `rematch_decline` (wrong addressee) and `challenge_accept` (inverted colour) corrected.
- *S1 / S10*: `make_move` suite rewritten. "Engine unreachable → move accepted with the CLIENT
  fen (BUG pinned)" → validated on the server with the engine down. "Engine down + no client
  fen → Redis loses its fen (BUG pinned)" → the stored FEN survives. "A move without `move`
  skips validation (pinned)" → invalid payload. The "ENGINE_URL overrides the validation
  endpoint" case was removed with the endpoint call it tested; the variable is covered by the
  config tests. Stored game state gains `startFen`.
- *S3*: the `game-end` suite characterized the client `game_end` event, which no longer
  exists; the same assertions are now driven by a mating move or `resign`. Removed pinned
  bugs: the result-text parsing table (including "black beat white" → white), client fallbacks
  for `time_control` / `is_rated`, "any signed-in socket can end a game". "Completed game with
  result null → Draw (BUG pinned)" → `winner_id` decides. `parseOutcome` tests removed with the
  function; `detectGameOver` / `gameEndPayload` frontend tests now assert the helpers are gone.

**PR 2**

- *S5*: `cookieAuth.test.ts` asserted that an **unsigned** cookie authenticates; it now asserts
  the opposite for every handler. `identity.test.ts` pinned the two unverified decoders, which
  were deleted. "Anonymous → `[]`" and "signed-out callers are spectators" → 401.
- *S7*: ids in route tests are UUIDs; "non-numeric `limit` / `offset` produce NaN ranges"
  (todo) → real tests expecting 400.
- *S8*: "join returns the row verbatim" → returns the public view, on both join endpoints and
  the `game_start` broadcast.
- *ENG-AUTH*: engine tests send the key; `/analyse-game` ids are UUIDs and the write is
  filtered by `status = 'completed'`; expected engine request headers gain `X-Engine-Key`.
- Harness connect timeout raised from 1 s to 2.5 s after two flaky runs under parallel load.
  The cause was not fully established; later full runs were clean.

**PR 3**

- *INV-TOKEN*: token lookups go `game_invites` → `games` by id; the `games` insert has no
  token columns (server `friends`, `http`, `social`, `privateGameService` tests; frontend
  `games.test.ts`).
- *SUPABASE-KEYS*: `SUPABASE_SECRET_KEY` wins over both legacy names; the fatal log line names
  it.

## 5. Manual steps for the owner, in order

### 5.1 Supabase dashboard

1. **Create the new API keys.** Project Settings → API Keys → create a publishable key
   (`sb_publishable_…`) and a secret key (`sb_secret_…`). Leave the legacy `anon` and
   `service_role` keys enabled until step 5.4.
2. **Back up production** (Database → Backups, or `pg_dump`) before any migration.
3. **Check the migration history**: `supabase migration list`. If it shows `00005` as applied
   remotely, run `supabase migration repair --status applied 00006` once (F-020). If the
   project has no migration history, nothing is needed.
4. **Apply the migrations to staging first**, one file at a time (SQL editor or `psql -f`),
   following the order in §5.3. Do **not** use `supabase db push` for this release: it applies
   all four files at once, including the "contract" step that must wait for the deploy.
   - `20261112100200` stops with `Row level security is not enabled on: …` if the live database
     has another public table without RLS. That is intended; enable RLS on it or drop it, then
     re-run. Nothing is changed when it stops.
5. **Run the Security Advisor** (Advisors → Security) after the migrations and resolve what it
   reports.
6. After each file is applied by hand, record it:
   `supabase migration repair --status applied <version>`.

### 5.2 Environment variables

Set these before deploying the PR that needs them. Old names keep working, so nothing breaks
if a rename is done later.

| Platform | Variable | Value | Needed from |
|---|---|---|---|
| Vercel (frontend) | `ENGINE_SHARED_SECRET` | `openssl rand -hex 32`, the same value on all three platforms | PR 2 |
| Vercel | `GAMBIT_ENGINE_URL` | the Render engine URL (`ENGINE_URL` is still read) | PR 2 |
| Vercel | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key (replaces `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | PR 3 |
| Vercel | `SUPABASE_SECRET_KEY` | the secret key (replaces `SUPABASE_SERVICE_ROLE_KEY`). Never with a `NEXT_PUBLIC_` prefix | PR 3 |
| Railway (game server) | `GAMBIT_ENGINE_URL` | the Render engine URL (replaces `ENGINE_URL`, which still works with a warning) | PR 1 |
| Railway | `ENGINE_SHARED_SECRET` | same value as Vercel | PR 2 |
| Railway | `SUPABASE_SECRET_KEY` | the secret key (replaces `SUPABASE_SERVICE_KEY`) | PR 3 |
| Render (engine) | `ENGINE_SHARED_SECRET` | same value. Until it is set, every endpoint except `GET /health` answers 503 | PR 2 |
| Render | `SUPABASE_SECRET_KEY` | the secret key (replaces `SUPABASE_SERVICE_KEY`) | PR 3 |

Unchanged and still required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SOCKET_URL`,
`SUPABASE_URL`, `REDIS_URL`, `FRONTEND_URL`, `STOCKFISH_PATH`, `STOCKFISH_POOL_SIZE`.

`NEXT_PUBLIC_*` values are compiled into the frontend, so changing the publishable key needs a
redeploy on Vercel. The game server needs Node 20 or newer (`server/Dockerfile` still says
Node 18; check which runtime Railway actually uses).

### 5.3 Deploy order

1. **PR 1.** Deploy the game server (Railway) and the frontend (Vercel) together. The socket
   protocol changes, so an old tab cannot talk to the new server and must reload. Pick a quiet
   moment: games in progress during the switch will see a disconnect.
2. **PR 2.** Set `ENGINE_SHARED_SECRET` on all three platforms first. Then deploy engine,
   server and frontend close together. Between the engine and the server deploys, game reviews
   fail (the old server does not send the key); games themselves are unaffected, because the
   engine is no longer used to validate moves after PR 1.
3. **PR 3**, the two-step invite migration:
   1. Apply `20261112100000_profiles_lockdown.sql`, `20261112100100_game_invites_expand.sql`
      and `20261112100200_drop_matchmaking_queue.sql`.
   2. Deploy the game server and the frontend from PR 3. (The engine too, for the new key
      names and the Python client upgrade.)
   3. Confirm a private invite can be created and joined.
   4. Apply `20261112100300_game_invites_contract.sql`. After this, the old code cannot run
      against the database.
4. **Switch the keys** (any time after PR 3 is live): set the new variables from §5.2,
   redeploy, verify sign-in and a game, then disable the legacy keys in the Supabase dashboard
   and remove the old variables.

### 5.4 Rollback

| PR | How to roll back | What to know |
|---|---|---|
| 1 | Redeploy the previous server and frontend builds together | Completed games written by the new server have `result` = `white`/`black`; the old code reads `winner_id` for wins, so they display correctly. Pending rematch/challenge keys in Redis expire on their own. |
| 2 | Redeploy the previous builds of all three services | Roll the engine back with the callers, or leave the new engine up: old callers without the key get 401 on reviews. `ENGINE_SHARED_SECRET` can stay set. |
| 3, before the contract migration | Redeploy the previous server and frontend | Invites created by the new code exist only in `game_invites`; copy them back with one `UPDATE games … FROM game_invites` or accept that those links die. The `profiles` grants can stay; to undo them, re-grant `UPDATE` on `profiles` to `authenticated` (not recommended). `matchmaking_queue` was unused; nothing to restore. |
| 3, after the contract migration | Re-add `invite_token` and `invite_expires_at` to `games`, copy the values back from `game_invites`, then redeploy old code | This is why the contract step waits until the new code is confirmed. |
| Keys | Put the legacy variable names back, or simply keep them set | The legacy names are read as fallbacks; rollback is only impossible after the legacy keys are disabled in the dashboard. |

## 6. Merge order and manual tests

**Merge order:** #20 → `preprod`, then #21, then #22, then `preprod` → `main`. #21 and #22
target the branch below them; after #20 is merged GitHub retargets #21 to `preprod` if the
merged branch is deleted, otherwise change the base by hand before merging. Do the manual
tests on `preprod` (or the PR 3 preview, which contains everything) before `preprod` → `main`.

**Two-browser game, two different accounts:**

1. **Moves**: matchmaking starts a game; normal moves, castling, en passant, promotion; clocks
   run on both sides.
2. **Illegal move**: from the console, `socket.emit('make_move', …)` with an illegal move, a
   move for the opponent, or a made-up FEN → rejected, board resyncs, opponent sees nothing.
3. **Checkmate** (and stalemate): both players see the result; ratings change once.
4. **Resign** from each side.
5. **Disconnect**: close one tab → the opponent sees the countdown; return within 20 s → the
   game continues; stay away → abandonment.
6. **Rematch**: request, accept, decline (the requester sees the decline); accept after more
   than 60 s does nothing.
7. **Challenge** from a profile page with each colour choice.
8. **Private invite**: create, open the link in the other browser, join. Repeat between
   steps 3.1 and 3.4 of the PR 3 deploy.

**Sign-in and API** (S5 changes how every request is authenticated):

9. Sign in with email and with Google; reload; open `/lobby`, `/profile/<you>`, `/settings`.
   No redirect loop, no 401s.
10. A browser that was signed in before the deploy stays signed in.
11. Leave a tab open for more than an hour, then click around: the session refreshes.
12. `curl` a data route with a hand-made `sb-<ref>-auth-token` cookie → 401.
13. `curl https://<engine>/analyze` without the header → 401; `/health` → 200; finish a game
    and confirm the review appears.
14. `/offline`, signed out: play a move against the computer.

**Database** (with the publishable key, signed in as a normal user, from the browser console):

15. `supabase.from('profiles').update({ rating_rapid: 3000 }).eq('id', myId)` → error.
16. `supabase.from('profiles').update({ bio: 'x' }).eq('id', myId)` → works.
17. `supabase.from('game_invites').select('*')` → error; `games` rows have no `invite_token`.

## 7. Remaining medium/low issues discovered or touched

Not fixed, by the brief's rule 5. Listed so they are not lost.

**Game server**

- The per-game lock is per process. With more than one server instance, two instances can
  apply moves to the same game concurrently; it needs a Redis-side transition (F-007).
- The handshake token is checked at connect time only; a socket outlives its token until it
  reconnects (F-004).
- Any one of a player's sockets disconnecting (a second tab closing) starts the abandonment
  countdown (F-010).
- `gameStateRepository.setGame` swallows Redis write errors, so a move can be broadcast
  without being stored (F-010).
- A database error during finalization is treated as "already finalized": no log, no rating,
  the row stays `active` (F-010).
- `time_control` on socket events is a free string; `"-5"` gives a negative clock (F-010).
- A rejected `resign` shows nothing in the UI; a move can be acked `internal_error` after it
  was applied if finalization throws (F-010).
- No draw offers or aborts exist (F-009).
- `unhandledRejection` logs but does not exit (F-003).

**Frontend**

- Next 14.x has advisories fixed only in 15/16; upgrade is the next phase (F-011).
- The debug session route still exists (S12).
- Route handlers use the service-role client rather than a user-scoped one, so RLS is not a
  second line of defence there (F-012).
- Socket acks are ignored by the game page.

**Engine and database**

- `/computer-move` is reachable by anyone through the public Next.js proxy (by design for
  offline play); it has no rate limit.
- `auth.getUser()` costs an Auth round trip per request and per socket connect; `getClaims()`
  with asymmetric signing keys would remove it (F-021).
- `supabase-js` is pinned to `~2.109.0` because later versions need Node 22 (F-021).
- `profiles.sex` and `is_public` cannot be edited by anyone but the service role, because no
  code edits them today (F-017).
- Ratings in `profiles` would be better in their own table (F-017).
- The live database has diverged from the migration files before; the history should be
  reconciled once (F-020).

## 8. Rulebook and SOLID compliance

Rule IDs are from `docs/ENGINEERING_RULES.md`. No `eslint-disable`, `ts-expect-error` or
`noqa` was added in any PR. `lint`, `lint:arch` (dependency-cruiser: no violations, no
cycles), `tsc`, Prettier and Ruff are clean at the tip of every branch.

### PR 1

- **Rules applied:** NODE-05, NODE-07, NODE-08, NODE-10, NODE-11, NODE-16, NODE-17, NODE-18,
  SEC-09, SOLID-01, SOLID-03, SOLID-04, SOLID-06/07, SIZE-01..05, TEST-03, TEST-06, TEST-08.
- **How:** chess rules, move authorization and adjudication are pure `domain/` modules with no
  I/O. Token verification, schemas and the handler wrapper are separate modules. Rejection
  checks, ending rules and rematch/challenge are tables or strategies, not if/else chains.
  Services receive their ports by injection. The game-store port has one shared contract test
  that runs against the Redis repository and the test fake.
- **Deviations:** schemas strip instead of `.strict()`, ack shape, id charset, no exit on
  unknown errors (all F-003). GIT-05 size (1,710 code lines; the brief set no limit).

### PR 2

- **Rules applied:** NX-01, NX-02, NX-04..NX-08, NX-10, NX-11, SEC-01, SEC-09, NODE-05,
  NODE-08, SOLID-01, SIZE-01..04.
- **How:** identity, validation, filters and DTOs are separate `lib/server` modules, each
  marked `server-only`. Handlers are parse → `requireUser()` → one `lib/server` call → DTO.
  Engine auth is a FastAPI dependency; routers stay thin; configuration only through
  `config.py`.
- **Deviations:** NX-01 (still on 14.x; F-011), NX-08 (service-role client kept; F-012),
  wider username lookup rule (F-013), GIT-05 size.

### PR 3

- **Rules applied:** SEC-02, SEC-03, SEC-04, SEC-08, SEC-09, NX-05, NX-06, NODE-05, TEST-04,
  SOLID-01, SOLID-06, SIZE-01..04.
- **How:** invites have their own repository port, injected into `privateGameService`. Secret
  and public keys are read in one module each. Policies use `(select auth.uid())` and name
  their roles. Every new table has RLS; privileges are revoked from `PUBLIC`.
- **Deviations:** one existing migration file renamed, content unchanged (F-020).
  `createGamesRepository` is 61 physical lines by the metrics script, which counts comments;
  ESLint's `max-lines-per-function` (which skips them) passes.

### Metrics (`scripts/metrics/metrics.js`)

Package totals, base (`origin/preprod`) → tip of PR 3:

| Package | Files | Lines | Files over 300 lines | Largest file | Max complexity | Import cycles |
|---|---|---|---|---|---|---|
| server | 52 → 64 | 3419 → 4637 | 0 → 0 | 296 → 275 (`services/gameService.js`) | 9 → 9 | 0 → 0 |
| frontend | 223 → 228 | 13932 → 14346 | 0 → 0 | 214 → 233 (`types/socket.ts`) | 9 → 10 | 0 → 0 |
| chess-engine | 15 → 16 | 1080 → 1175 | 0 → 0 | 219 → 219 | 10 → 10 | n/a |

The frontend maximum of 10 is `PATCH /api/games/[id]`, at the limit, not over it.

Touched files (lines; longest function; max complexity), before → after the PR that changed
them:

| PR | File | Lines | Longest function | Complexity |
|---|---|---|---|---|
| 1 | `server/src/services/gameService.js` | 296 → 275 | 38 → 31 | 9 → 6 |
| 1 | `server/src/services/moveRecorder.js` | 98 → 142 | 82 → 68 | 4 → 3 |
| 1 | `server/src/services/socialService.js` | 129 → 218 | 100 → 34 | 6 → 6 |
| 1 | `server/src/services/clockService.js` | 169 → 199 | 27 → 27 | 7 → 5 |
| 1 | `server/src/repositories/gameStateRepository.js` | 174 → 205 | 106 → 90 | 3 → 3 |
| 1 | `frontend/components/SocketProvider.tsx` | 72 → 74 | 57 → 24 | 4 → 4 |
| 1 | `frontend/features/game/commands.ts` | 66 → 58 | 9 → 8 | 6 → 4 |
| 2 | `frontend/lib/server/identity.ts` | 98 → 51 | 19 → 14 | 8 → 5 |
| 2 | `frontend/app/api/games/[id]/route.ts` | 54 → 65 | 24 → 29 | 7 → 10 |
| 2 | `server/src/clients/engineClient.js` | 55 → 63 | 25 → 41 | 1 → 2 |
| 2 | `chess-engine/routers/analysis.py` | 60 → 76 | 33 → 39 | 3 → 3 |
| 2 | `chess-engine/services/review.py` | 120 → 150 | 27 → 27 | 5 → 6 |
| 3 | `server/src/services/privateGameService.js` | 196 → 220 | 32 → 32 | 9 → 9 |
| 3 | `server/src/repositories/gamesRepository.js` | 78 → 85 | 54 → 61 | 1 → 1 |
| 3 | `server/src/config/env.js` | 91 → 103 | 11 → 11 | 4 → 4 |
| 3 | `frontend/lib/server/supabase.ts` | 75 → 82 | 17 → 17 | 3 → 3 |
| 3 | `frontend/lib/server/privateGames.ts` | 48 → 53 | 18 → 13 | 5 → 5 |
| 3 | `frontend/app/api/games/private/create/route.ts` | 27 → 35 | 16 → 24 | 4 → 5 |

Function lengths are physical lines including comments, as the script reports them. The
functions shown above 60 (`moveRecorder`, `gameStateRepository`, `gamesRepository`) are factory
functions whose bodies are mostly nested small functions and comments; they pass ESLint's
limit, which is the enforced gate.
