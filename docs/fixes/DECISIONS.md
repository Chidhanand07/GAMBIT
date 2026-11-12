# High-risk fix phase — decision log

Decisions taken while fixing the HIGH-risk items from
[`docs/refactor/REPORT.md` §5](../refactor/REPORT.md) across three stacked PRs
(`fix/high-1-game-server-security`, `fix/high-2-web-engine-security`,
`fix/high-3-supabase-lockdown`). ADR style: context, options, decision, why.

Priority order used whenever two goals pulled apart: security correctness >
no regressions in existing user-facing features > rulebook MUST rules >
backwards-compatible rollout > simplicity.

The refactor's own log stays in [`docs/refactor/DECISIONS.md`](../refactor/DECISIONS.md).
This phase keeps its decisions in this one file (`F-0xx` ids), as the fix brief asked,
instead of one file per ADR under `docs/refactor/adr/`.

| ADR | Title | PR | Items |
|---|---|---|---|
| [F-001](#f-001) | Branch from `origin/main`, target `preprod` | 1 | — |
| [F-002](#f-002) | `GAMBIT_ENGINE_URL` is canonical; `ENGINE_URL` stays as a warned fallback | 1 | G5 |
| [F-003](#f-003) | Socket payload schemas: strip mode, slug-safe ids, brief's ack shape | 1 | S15 |
| [F-004](#f-004) | Socket identity: handshake token verified by Supabase Auth; no socket for signed-out users | 1 | S2, G13 |
| [F-005](#f-005) | `join_game`: non-participants are spectators and are never linked to the game | 1 | S9 |
| [F-006](#f-006) | Rematch/challenge: requests stored in Redis for 60 s; answers consume them and use stored terms | 1 | S4 (+F1, G16) |
| [F-007](#f-007) | Moves are validated on the server with chess.js; FEN is the authority, UCI history adds repetition | 1 | S1, S10 |
| [F-008](#f-008) | The server decides results; one finalizer; `games.result` = `white` / `black` / `draw` | 1 | S3 (+G1) |
| [F-009](#f-009) | No draw-offer or abort events: the UI has neither | 1 | S3 |
| [F-010](#f-010) | Pre-PR review of PR 1: what was fixed, what was deferred | 1 | S1, S2, S3 |
| [F-011](#f-011) | Next.js pinned to 14.2.35; `/login` gets the Suspense boundary the patch line requires | 2 | NEXT-CVE |
| [F-012](#f-012) | Route-handler identity: `requireUser()` on `auth.getUser()`; which routes stay public | 2 | S5 |
| [F-013](#f-013) | Route input validation with zod; `.or()` filters only from UUIDs; two username rules | 2 | S7 |
| [F-014](#f-014) | Response DTOs are allow-lists; invite token never leaves the server in a game response | 2 | S8 |
| [F-015](#f-015) | Engine endpoints require `X-Engine-Key`; reviews only for existing, completed games | 2 | ENG-AUTH |
| [F-016](#f-016) | `/health` returns its Stockfish instance to the pool | 2 | G18 |
| [F-017](#f-017) | Profiles: column privileges + owner policies; no client INSERT; dead server action removed | 3 | S11 |
| [F-018](#f-018) | Invite tokens move to `game_invites` (service-role only), expand → deploy → contract | 3 | INV-TOKEN |

---

## F-001

**Branch PR 1 from `origin/main`, target `preprod`.**

- **Context.** The brief says to branch from `origin/preprod` unless `origin/main` has
  commits `preprod` lacks. `origin/main` has one such commit: `416502a` (merge of PR #19,
  `preprod` → `main`). `git diff origin/preprod origin/main` is empty, so the trees are identical.
- **Options.** (a) branch from `origin/preprod`; (b) branch from `origin/main`.
- **Decision.** (b), as the brief prescribes for this case. PR 1 still targets `preprod`.
- **Why.** Following the stated rule keeps the branch a descendant of both. The PR diff is
  unaffected because the trees match; the PR's commit list shows the extra merge commit.

## F-002

**`GAMBIT_ENGINE_URL` is the canonical engine URL variable on the game server (G5).**

- **Context.** `server/src/config/env.js` read `ENGINE_URL`, while `server/.env.example`,
  `README.md`, `DEPLOY.md` and `setup.md` all document `GAMBIT_ENGINE_URL`. A deployment
  configured from the docs silently talked to `http://localhost:8001`.
- **Options.** (a) rename the docs to `ENGINE_URL`; (b) read only `GAMBIT_ENGINE_URL`;
  (c) read `GAMBIT_ENGINE_URL`, fall back to `ENGINE_URL` with a warning.
- **Decision.** (c). A warning is also logged when neither is set and `NODE_ENV=production`.
  Each warning is logged once per process, because the accessor runs on every engine call (ADR 0101).
- **Why.** Docs were already consistent, so the code moves to them. The fallback means a
  deployment that set `ENGINE_URL` by reading the code keeps working (backwards-compatible rollout).
  The server no longer needs the engine for move legality (F-006), so a missing URL degrades
  analysis and game review only; that is why it warns rather than refusing to boot.

## F-003

**Socket payload validation: zod in strip mode, slug-safe ids, `{ ok:false, error }` acks (S15).**

- **Context.** No socket payload was validated. A `null` payload or a non-string `result`
  threw inside an async handler, which is an unhandled rejection (Node ≥ 15 exits, ending
  every live game). NODE-08 asks for `.strict()` schemas and an ack of
  `{ ok:false, code:'VALIDATION' }`; the fix brief asks for `{ ok:false, error:'invalid_payload' }`.
- **Options.**
  1. Schema mode: (a) `.strict()` — reject unknown keys; (b) default strip — drop them.
  2. Id format: (a) `z.string().uuid()`; (b) bounded slug `^[A-Za-z0-9_-]{1,64}$`.
  3. Ack shape: (a) the rulebook's `code`; (b) the brief's `error`.
- **Decision.** 1b, 2b, 3b. Schemas live in `server/src/sockets/schemas.js`; `wrap()` and
  `guard()` in `server/src/sockets/wrap.js`; `unhandledRejection` logging in
  `server/src/processHandlers.js`, installed by `start()`.
- **Why.**
  - *Strip, not strict:* the shipped frontend sends extra fields (`join_queue.user` is a whole
    profile; `make_move` carries `fen`/`san`/`captured`). Strict mode would reject live clients
    during a rolling deploy (no regressions > rulebook wording). Stripping gives the same safety:
    a key the schema does not name never reaches a service, so it can no longer be relayed to
    another user.
  - *Slug ids:* production ids are UUIDs, but the 600-test server suite uses readable ids
    (`white-user`, `game-1`). The slug charset excludes every character that has meaning in a
    PostgREST filter or a Redis key separator, which is the property that matters here; socket
    ids only ever reach `.eq()` (parameterised) and Redis keys. Next.js route handlers, where ids
    are interpolated into `.or()` strings, use strict `z.string().uuid()` (S7, PR 2).
  - *Ack shape:* the brief is explicit and newer than the rulebook sketch; one shape is used for
    every failure (`invalid_payload`, `internal_error`, or a domain reason such as `illegal_move`).
  - `time_control` / `is_rated` accept `null` as "not given": the frontend builds them from
    optional chains.
- **Deviation recorded.** NODE-08 `.strict()` and the `code` key are not followed, for the
  reasons above. NODE-07 says unknown errors and `uncaughtException` must log and exit; only the
  `unhandledRejection` logger the brief asked for was added, and it logs without exiting so one
  stray rejection cannot end every live game. `uncaughtException` keeps Node's default (exit).

## F-004

**Socket identity comes from a handshake token verified by Supabase Auth (S2, G13).**

- **Context.** The `authenticate` event stored whatever user id the client sent. Every
  identity-dependent check on the game server (turn order, chat sender, queue ownership) sat on
  top of that claim, so anyone could act as anyone.
- **Options.**
  1. Verification: (a) verify the JWT locally with the project JWT secret; (b) verify against
     the JWKS with `jose`; (c) `supabase.auth.getUser(token)` on the server's Supabase client.
  2. Signed-out visitors: (a) allow anonymous connections with no identity; (b) refuse them.
  3. `leave_queue` / `join_queue` payload ids: (a) reject payloads that carry a different id;
     (b) ignore payload ids entirely.
- **Decision.** 1c, 2b, 3b.
  - `server/src/services/tokenVerifier.js` wraps `auth.getUser`; `server/src/sockets/auth.js`
    is the `io.use` middleware. It rejects with `unauthorized` when the token is missing,
    malformed, unknown, or when verification throws (fail closed, SEC-09), and stores
    `socket.data.userId`.
  - On connection the server registers the session, joins `user_<id>` and runs the reconnect
    logic that `authenticate` used to run. The `authenticate` handler and the `authenticated`
    reply are deleted.
  - Handlers overwrite the acting id from `socket.data.userId` (`join_queue.user`,
    `from_user_id` on requests, `to_user_id` on accepts); the schemas do not even name those
    keys, so they are stripped before a service sees them.
  - Frontend: `lib/socket/connection.ts` passes `auth: (cb) => cb({ token })`, read from the
    Supabase session on every connect and reconnect. `SocketProvider` creates the socket only
    while a profile is loaded and closes it on sign-out. All `emit('authenticate')` calls are gone.
- **Why.**
  - *`getUser`*: it works unchanged for legacy HS256 projects and for projects on asymmetric
    signing keys, needs no extra secret on the game server, and also catches revoked sessions.
    The cost is one Auth round trip per connection (not per event), which is acceptable.
  - *Refuse anonymous sockets*: no page uses the socket while signed out (the lobby player count
    comes from Supabase presence, not `queue_status`), so an anonymous connection has no feature
    to serve and would only be an unauthenticated entry point (least privilege).
  - *Ignore rather than reject payload ids*: the deployed frontend still sends
    `join_queue.user` and `leave_queue(<id>)`. Ignoring them keeps old tabs working through a
    rolling deploy while making the values irrelevant.
- **Known limits (logged for the next phase).**
  - The token is checked when the connection is made. A socket that stays connected past the
    token's expiry keeps its identity until it reconnects (NODE-14 territory).
  - socket.io does not retry a handshake the server refused, so the client retries an
    `unauthorized` refusal itself every 5 s (covers a token that was mid-refresh).
  - **Deploy order:** an old frontend cannot connect to the new server (it sends no token), and
    a new frontend works against the old server but is not protected by it. Deploy the server
    and the frontend together; see the report's manual steps.

## F-005

**`join_game` links only the two players; everyone else is a spectator (S9).**

- **Context.** `join_game` linked *any* caller to the game in `userActiveGame` before the game
  was even loaded. When that socket disconnected, the server recorded a disconnect for the
  "black" side (anything that is not white), and the global clock forfeited black after 20 s.
  A stranger could end any game by joining and leaving.
- **Options.** (a) reject `join_game` from non-participants; (b) let them into the room as
  spectators but never link them; (c) keep linking and fix only the side calculation.
- **Decision.** (b). The link is created after the game is loaded and only when the verified
  user is `whiteId` or `blackId`. `handleDisconnect` re-checks participation before touching
  the game (defence in depth). `spectate_game` is unchanged and never linked.
- **Why.** Spectating through the game URL is an existing feature (the page shows a
  "Spectating" badge and calls `join_game` for every visitor), so (a) would remove it.
  (c) leaves a non-player able to pause a game's clock. With (b) a spectator receives state and
  broadcasts but has no path to the disconnect, clock or result logic.
- **Not changed.** Games are still publicly watchable by anyone signed in who knows the id.
  Private-game creators waiting on their invite page still join the room before the game exists
  in Redis; they are linked when the game starts and their page joins again.

## F-006

**Rematch and challenge requests are stored server-side; answers consume them (S4).**

- **Context.** `rematch_accept` / `challenge_accept` created a game between the two ids in the
  payload with the payload's time control, rated flag and colour. No request had to exist, so
  any socket could start a rated game between two other people, or force a game on someone.
  `rematch_decline` was relayed to whatever id the payload named.
- **Options.**
  1. Store: (a) in-process `Map`; (b) Redis key with TTL.
  2. Atomic read-and-delete: (a) `GETDEL`; (b) Lua script; (c) `MULTI` / `GET` / `DEL` / `EXEC`.
  3. Terms source: (a) the accept payload, checked against the stored request; (b) the stored
     request only.
- **Decision.** 1b, 2c, 3b.
  - `server/src/repositories/pendingRequestsRepository.js`: key
    `pending:<kind>:<requester>:<target>`, value = the proposed terms, TTL 60 s. `take()` reads
    and deletes in one transaction. Redis errors are **not** swallowed here (fail closed).
  - `socialService`: `request` stores then relays; `accept` and `decline` first `take` the
    request from `<payload.from_user_id>` to the verified answerer. No pending request →
    `{ ok:false, error:'no_pending_request' }` and nothing is emitted or created.
  - Rematch vs challenge differences (events, stored terms, seating) are a strategy table, so a
    third request type is a new entry, not another `if` (SOLID-03).
  - Accept/decline schemas accept only `from_user_id`; terms and colours sent with an answer are
    stripped before the service runs.
- **Why.**
  - *Redis + TTL*: survives a redeploy inside the 60 s window and is shared across instances
    (NODE-17); the TTL gives expiry for free. 60 s comfortably covers the UI's 30 s toast.
  - *MULTI/EXEC*: atomic on every Redis version and on Upstash. `GETDEL` needs Redis ≥ 6.2 and
    the deployed version is not known; Lua would work but is harder to fake faithfully in tests.
  - *Stored terms only*: one source of truth; there is nothing left for an accepter to tamper with.
- **Side effects (medium/low items fixed because the fix made them unavoidable).**
  - **F1** — `rematch_decline` now reaches the opponent: the client names the requester and the
    server notifies that requester. Previously the client addressed it to its own id.
  - **G16** — challenge colours are now right: the stored `color` is the challenger's choice.
    The Navbar no longer sends an (inverted) colour, and a missing colour means random instead
    of "challenger is black".
- **Known limits.** `from_username` / `by_username` are still display strings supplied by the
  client (length-capped by the schema); the ids next to them are verified. A rematch request's
  terms come from the requester's payload rather than from the finished game, exactly like a
  fresh challenge; the target still has to accept.

## F-007

**The game server validates every move itself with chess.js (S1, S10).**

- **Context.** `make_move` asked the engine to validate only when the payload had a `move`
  field. The frontend never sent one, so validation was skipped on every move and the client's
  FEN was stored as the position. When the engine was unreachable the client FEN was accepted
  too, and with no client FEN the stored FEN was deleted. `moves.uci` (NOT NULL) was written as
  `undefined`, so move rows very likely never persisted.
- **Options.**
  1. Where legality is decided: (a) keep the engine call but make it mandatory; (b) chess.js in
     the game server.
  2. What the server trusts as the position: (a) the stored FEN only; (b) the UCI history
     replayed from the start; (c) the stored FEN, upgraded to the replayed history when the
     history reproduces exactly that FEN.
  3. Concurrency: (a) keep `getGame` → validate → `updateGame`; (b) one atomic
     read–decide–write per game.
  4. Rejections: (a) drop silently; (b) `move_rejected { game_id, reason }` to the sender plus a
     fresh `game_state_sync`.
- **Decision.** 1b, 2c, 3b, 4b.
  - `server/src/domain/chessRules.js` (pure): `positionOf(game)` and `playMove(game, {from,to,promotion})`
    return server-computed `uci`, `san`, `fen`, `flags`, `captured`.
  - `server/src/domain/moveAuthorization.js` (pure): game exists → active → caller is a player →
    it is their turn (side to move read from the FEN). Reasons are an ordered table.
  - `gameStateRepository.mutateGame(gameId, fn)`: read, decide and write under the per-game
    lock. `moveRecorder.submit` uses it, so the same move sent twice is applied once.
  - The state gains `startFen`; `moveLog` entries are `{ move: <uci>, fen, san }`, all computed
    by the server. The schema accepts only `game_id`, `from`, `to`, `promotion`; a client `fen`,
    `san`, `move` or `captured` is stripped before the service runs.
  - `move_made` keeps the field names the page reads (`from`, `to`, `fen`, `san`, `captured`,
    `flags`, `whiteMs`, `blackMs`) and adds `move` (UCI); `promotion` appears only on a promotion.
  - The engine is no longer a dependency of `gameService`. There is no fallback path.
  - Frontend: `make_move` sends squares only; `move_rejected` clears the optimistic markers and
    the resync restores the board.
- **Why.**
  - *chess.js in-process*: legality must not depend on a second service being up (S10), and a
    network hop per move is latency for nothing. The library is pure, so the rules live in
    `domain/` and are unit-tested without mocks (SOLID-07, TEST-03).
  - *FEN as authority, history as an upgrade*: games already in Redis at deploy time have move
    logs without UCI, and games restored from the database after a restart have no log at all.
    Requiring a replayable history would brick them. The FEN alone gives full legality; the
    history only adds what a FEN cannot carry (threefold repetition, needed by S3). A history
    that is missing, corrupt or inconsistent is ignored rather than trusted.
  - *Atomic transition*: two rapid `make_move` events could both pass validation against the
    same position. The existing lock only covered the write.
  - *Tell the sender*: the page updates optimistically; without a rejection plus resync a
    refused move would leave the two boards different.
- **Trade-offs / limits.**
  - Replaying the history is O(moves) per move (well under a millisecond for a normal game).
  - Repetition history is lost across a server restart (the restore starts a new history at the
    restored FEN). Legality is unaffected.
  - The lock is per process. A multi-instance deployment needs a Redis-side transition
    (NODE-17), which is out of scope here and listed for the next phase.
  - `engineClient.validateMove` and the engine's `/validate-move` endpoint are now unused by the
    game server; they are left in place (PR 2 protects the endpoint) and listed as dead code.

## F-008

**Results are decided by the server through one finalizer (S3).**

- **Context.** The page ran chess.js, decided the game was over and emitted `game_end` with a
  result string. The server accepted that event from any socket (no participant check), parsed
  the winner by substring (`includes('white')` first, so "black beat white" was a white win),
  rated the game, and fell back to the client's `time_control` / `is_rated`. Resignation was
  the same event with a different reason.
- **Options.**
  1. Who ends a game: (a) keep the client event but verify the claim; (b) the server
     adjudicates after each move, plus a `resign` event.
  2. Finalization code: (a) leave it inside `gameService`; (b) one `endGame(gameId, {winner, reason})`
     module used by move endings and resignation.
  3. `games.result` for a decisive game: (a) keep writing `null`; (b) `white_wins` / `black_wins`
     (the schema comment); (c) `white` / `black` / `draw` (the server's own vocabulary).
  4. Clock and abandonment endings: (a) leave untouched; (b) route through `endGame`;
     (c) keep their code but share the atomic active → completed transition.
- **Decision.** 1b, 2b, 3c, 4c.
  - `server/src/domain/adjudication.js` (pure): an ordered rule table — checkmate, stalemate,
    insufficient material, threefold repetition, fifty-move rule. `gameService.makeMove`
    adjudicates the position after every accepted move.
  - `server/src/services/gameFinalizer.js`: `endGame` moves Redis active → completed with
    `mutateGame` (only one caller wins), removes the game from the active set, broadcasts
    `game_end`, clears session links, updates the row with the existing `status = 'active'`
    guard, then triggers the review and the rating update once. Time control and rated flag come
    from server state, with fixed defaults.
  - `resign { game_id }`: active participant only; the opponent wins by "Resignation".
  - The client `game_end` handler and schema are deleted. `parseOutcome` is deleted.
  - Frontend: resign emits `resign`; the page no longer detects game over or emits `game_end`;
    the only source of a result is the server's `game_end`.
- **Why.**
  - *Adjudicate on the server*: verifying a client's claim needs the same rules as deciding, so
    the claim adds nothing but an attack surface (NODE-16).
  - *`white` / `black` / `draw`*: every reader was checked (`grep` for `result` / `winner_id`):
    `frontend/features/profile/format.ts` and `frontend/lib/server/profileStats.ts` only test
    `result === 'draw'` and otherwise use `winner_id`; the server's restore path calls
    `resultLabel(row.result)`, which already expects `white` / `black`. So writing the outcome is
    safe for all of them and makes the restore correct. `white_wins` / `black_wins` exists only in
    a schema comment and no code reads it.
  - *Clock path shares the transition, keeps its code*: the brief asked not to change timeout /
    abandonment behaviour. But while the clock wrote `status: 'completed'` with a plain `setGame`,
    a flag fall racing a mate or a resignation could broadcast a second, contradictory `game_end`.
    Using the same `mutateGame` guard there is a three-line change with no behaviour difference
    when there is no race; it is what makes "only one finalizer wins" true.
- **Side effect — G1 fixed.** Finished games used to come back as "Draw" when re-joined after a
  restart (wins were stored with `result: null`, and the restore query did not select the
  column). New rows carry the outcome; for old rows the restore now falls back to `winner_id`
  (`outcomeOfRow`). The restore query selects `result, winner_id`.
- **Behaviour users will notice.** The reason on a finished game is the real one after a
  re-join (it is stored now) instead of "Game over". Draws by insufficient material, threefold
  repetition and the fifty-move rule are detected and end the game; before, only checkmate and
  stalemate ended it, and the two boards could disagree about repetition. "You Lost" after
  resigning appears when the server confirms it (a network round trip) rather than instantly.
- **Not changed (still open).** Timeout / abandonment payloads, the missing review trigger for
  those endings (G3), clocks persisted without the elapsed deduction (G11), a move accepted
  between flag fall and the next tick (G7).

## F-009

**No `offer_draw` / `accept_draw` / `decline_draw` / `abort` events were added.**

- **Context.** The brief says: if the current UI has any other way to end a game (draw offer,
  abort), implement it server-side so no feature is lost.
- **What the UI has.** `features/game/components/ActionBar.tsx` and `SidebarActions.tsx` offer
  sound, flip, step back and **Resign**. There is no draw-offer or abort control anywhere in
  `frontend/` (`grep -ri "draw offer\|offer_draw\|abort"` finds only the `aborted` status type
  and profile-history labels).
- **Decision.** Nothing to port, so nothing was added.
- **Why.** Adding events with no UI would be new, untested product surface in a security PR
  (YAGNI, SOLID-09). `resign` covers the one existing manual ending. The adjudication rule table
  and the single finalizer are the extension points a draw offer would use later.

## F-010

**Independent review of PR 1 before it was opened: fixed vs deferred.**

- **Context.** Before pushing, the PR 1 diff was reviewed by a second, independent pass
  (read-only) focused on impersonation, fail-open paths and races. It found no way for a client
  to act as another user, move for the opponent, decide a result or force a game on someone.
  It did find races around the new atomic transition, reproduced by running the real
  `gameService` + `gameStateRepository` over a fake Redis with latency (not against a live
  server), plus one frontend regression.
- **Fixed in PR 1** (each with a regression test that failed first):
  1. *A disconnect could undo a move.* `handleDisconnect` read the game, then wrote that
     snapshot back with `setGame`; a move accepted in between was overwritten in Redis while
     both boards and the database kept it. Now the disconnect is a `mutateGame` transition.
  2. *A disconnect could make a finished game active again.* Same code; the `status === 'active'`
     check now runs inside the lock.
  3. *A reconnect racing a move forfeited a connected player.* `reconnect` cleared
     `disconnectInfo` with `setGame`; a concurrent move wrote the old marker back and the clock
     ended the game as Abandonment 20 s later. Now a `mutateGame` transition.
  4. *The clock decided on a stale read.* `tickGame` read the game without the lock and
     `endOnClock` only re-checked the status. The verdict (`clockVerdict`, a pure function) is
     now taken again on the state read inside the lock, so a reconnect or a move that lands
     just before adjudication wins.
  5. *The socket closed whenever the profile fetch failed* (regression from S2: the socket was
     keyed on `profile?.id`, and `ProfileProvider` nulls the profile on any failed
     `/api/profile/me`, which it refetches on every token refresh). Mid-game that started the
     abandonment countdown. The socket now belongs to the last profile id seen and closes only
     on Supabase's `SIGNED_OUT` event or an account switch.
- **Why these and not the rest.** 1–4 are what makes the "atomic transition / one finalizer"
  claim of S1 and S3 true; shipping the claim with a hole next to it would be worse than not
  making it. 5 is a regression this PR introduced. All five are small and local.
- **Deferred (pre-existing or outside the listed items; logged for the next phase).**
  - Any one of a player's sockets disconnecting (closing a second tab; an old socket timing out
    after the new one connected) starts the abandonment countdown. Pre-existing.
  - `gameStateRepository.setGame` swallows Redis write errors, so a move or an ending can be
    broadcast without being stored. Pre-existing (the repository's documented contract);
    changing it touches every caller (NODE-17).
  - A database error in finalization is treated like "already finalized": no log, no rating,
    the row stays `active`. Pre-existing in the clock path; the new finalizer kept the same shape.
  - `time_control` is a free string up to 16 characters; `"-5"` parses to a negative clock if
    the target accepts such a challenge. The parsing is pre-existing (`domain/timeControl`);
    tightening the schema risks rejecting values current clients send, so it needs its own pass.
  - A rejected `resign` shows nothing in the UI; a `make_move` can be acked `internal_error`
    after it was applied if finalization throws (the page ignores acks today). Low impact.

## F-011

**Next.js 14.0.3 → 14.2.35 (exact pin), and the one thing the upgrade broke (NEXT-CVE).**

- **Context.** 14.0.3 is exposed to CVE-2025-29927 (middleware authorization bypass, fixed in
  14.2.25) and CVE-2025-55184 / CVE-2025-67779 (RSC denial of service, fixed in 14.2.35). The
  brief limits this phase to the 14.2.x line.
- **Options.** (a) `^14.2.35` range; (b) exact `14.2.35`.
- **Decision.** (b) for `next`; `@next/eslint-plugin-next` moves to `^14.2.35`. The repository
  has no `eslint-config-next` (the flat config uses the plugin directly), so there was nothing
  else to bump.
- **Why exact.** The version *is* the fix. A range could resolve lower from a stale lockfile or a
  mirror, and a guard test (`__tests__/security/nextVersion.test.ts`) asserts both the installed
  version and the declared one.
- **What the patch upgrade broke.** `next build` failed prerendering `/login`:
  "useSearchParams() should be wrapped in a suspense boundary" (enforced since 14.1). Jest and
  `tsc` do not catch this; it was found by running a production build. `app/login/page.tsx` now
  renders its form inside `<Suspense>`. Nothing else needed changing: the full build completes
  and the test, type and lint gates are unchanged.
- **Not done.** NX-01 says 14.x must not ship after this stopgap; the move to 15.5 / 16.4 is
  out of scope here and stays at the top of the next phase. `typescript.ignoreBuildErrors` and
  `eslint.ignoreDuringBuilds` are still set in `next.config.js` (S12, not a listed item). CI does
  not run `next build`, which is why this break was invisible to the test suite.

## F-012

**Next.js route handlers identify the caller with `supabase.auth.getUser()` (S5).**

- **Context.** `lib/server/identity.ts` base64-decoded the access token in the
  `sb-<ref>-auth-token` cookie, read `sub` and `exp`, and never checked the signature. The
  handlers then queried with the service-role client (which bypasses RLS). A hand-made cookie
  with someone else's id acted as that user on every route. `/api/games/[id]` used
  `getSession()`, which also only reads the cookie.
- **Options.**
  1. Verification: (a) verify the JWT locally with the JWT secret; (b) `getClaims()` (local
     verification against the JWKS, falling back to a network call for HS256 projects);
     (c) `getUser()` (Supabase Auth checks signature, expiry and revocation).
  2. `@supabase/ssr`: (a) stay on 0.1.0 with the `get/set/remove` cookie API; (b) upgrade to
     current and use `getAll/setAll`.
  3. Cookie encoding after the upgrade: (a) the new default (`base64url`); (b) `raw`.
  4. Routes that used to answer signed-out callers with an empty 200 (`friends/pending`,
     `friends/status`, `games/active`, `friends`): (a) keep the soft answer; (b) 401.
  5. Public-profile routes (`profile/[username]`, `/games`, `/stats`), which had no check at
     all: (a) leave public; (b) require a signed-in caller.
- **Decision.** 1c, 2b, 3b, 4b, 5b.
  - `requireUser()` → `{ ok: true, userId } | { ok: false, response: 401 }`, built on
    `createSessionClient(cookies()).auth.getUser()`. Any error, missing user or thrown lookup is
    "not signed in" (fail closed). The old decoders and `getSessionUser` are deleted.
  - Every handler under `app/api/**` calls `requireUser()` before creating the service-role
    client, except four that are public on purpose, each marked with a comment:
    `auth/login` and `auth/signup` (they create the session/account), `leaderboard` (usernames
    and ratings, identical for every caller), `maverick-move` (the offline "play the computer"
    page works signed out and touches no user data).
  - `@supabase/ssr` 0.1.0 → 0.12.7. Its peer dependency forced `@supabase/supabase-js` in the
    frontend to ^2.119 here rather than in PR 3 (logged; the server and engine upgrades stay in PR 3).
  - Every identity-reading route exports `dynamic = 'force-dynamic'` (NX-11).
- **Why.**
  - *`getUser()`*: it is what the brief specifies, works for HS256 and asymmetric projects alike,
    and honours sign-out/revocation. Cost: one Auth round trip per API request, where there was
    none. `getClaims()` removes that cost once the project is on asymmetric signing keys; that
    switch is a one-line change in `getVerifiedUserId` and is listed for the next phase.
  - *`raw` cookie encoding*: `middleware.ts` parses the session cookie itself for its optimistic
    redirect, and existing browsers hold cookies in the old raw format. `base64url` would have
    logged everyone out and made the middleware redirect every protected page to `/login`.
    `raw` keeps both working with no migration (backwards-compatible rollout).
  - *401 instead of soft answers*: every caller already handles a non-OK response
    (`res.ok ? … : fallback`), so the UI is unchanged, and "unauthenticated → 401" becomes
    uniform and testable.
  - *Profile routes need a session*: `/profile`, `/challenge` and `/leaderboard` are behind the
    login wall in `middleware.ts`, so no signed-out page reads them. Leaving them open would let
    anyone enumerate users through a service-role query with no session at all.
- **Found while verifying (would not have been caught by Jest).** A production `next build`
  showed that a `try/catch` around `cookies()` swallowed Next's "dynamic server usage" signal,
  so GET handlers such as `/api/notifications` were candidates for prerendering: a 401 baked in
  at build time and served to everyone. `cookies()` is now called outside the `try`, the routes
  are `force-dynamic`, and a test asserts the signal propagates.
- **Not changed.** `middleware.ts` still makes its redirect decision from the unverified cookie.
  That is allowed as an optimistic check (NX-09) and is no longer the last line of defence, since
  every route handler verifies. `/api/debug/session` still exists in production (S12, not a
  listed item); it now answers only its own signed-in caller. `lib/supabase/middleware.ts`
  (unused `updateSession`) still uses the deprecated cookie API.

## F-013

**Every route param, query value and body is parsed with zod; filter strings take UUIDs only (S7).**

- **Context.** `GET /api/friends?userId=…` put the raw query value into a PostgREST `.or()`
  filter string (`requester_id.eq.<value>,addressee_id.eq.<value>`). A value containing `,`
  or `(` rewrote the filter, and the query ran with the service-role key. Elsewhere `limit` /
  `offset` went through `Number()` unchecked (NaN reached `.range()`), a `null` JSON body threw,
  and the signup route applied no username rule at all.
- **Options.**
  1. Where filter strings are built: (a) keep them next to each query and validate the inputs
     at each route; (b) one module of builders that itself refuses non-UUIDs.
  2. Usernames: (a) one strict regex everywhere; (b) a strict rule for *new* names and a wider,
     still safe one for *lookups*.
  3. Invalid route params: (a) always 400; (b) 400 for ids on mutating friend routes, 404 for
     "which resource" params (`games/[id]`, `profile/[username]`).
- **Decision.** 1b, 2b, 3b.
  - `lib/server/filters.ts`: `participantFilter`, `eitherSideFilter`, `betweenUsersFilter`. Each
    validates its arguments with `z.string().uuid()` and throws otherwise. No other code
    interpolates into a filter string.
  - `lib/server/validation.ts`: the schemas plus `parseInput` / `parseJsonBody`, which return
    the data or a ready 400. The rejected input is never echoed back.
  - Applied in every route: UUID params, enum `action` / `field`, integer `limit` (1–50, capped)
    and `offset` (0–100 000), bounded strings for bodies, a time-control pattern with a
    1–180 minute range for private games.
- **Why.**
  - *Builders that refuse*: validation at the route protects today's callers; a builder that
    cannot produce an unsafe string protects the next caller too (and the verified user id is
    checked as well, at no cost).
  - *Two username rules*: new names follow the rule the signup form already shows
    (`[A-Za-z0-9_]{3,20}`), now enforced on the server. Lookups go through parameterised
    `.eq('username', …)`, so they cannot inject; a single strict rule there would make any
    older account whose name contains `.` or `-` unreachable. The lookup rule
    (`[A-Za-z0-9_.-]{1,40}`) only keeps out separators and oversized values.
  - *404 for resource params*: a malformed game id or username names nothing, so "not found" is
    the accurate answer and matches what the pages already handle.
- **Behaviour changes.** A private game with a time control outside 1–180 minutes (or not of
  the form `10`, `5+3` or a preset id) is refused with 400. Signup with a username outside the
  form's rule is refused by the server too. `?limit=abc` is a 400 instead of an empty page.
- **Not changed.** `PATCH /api/profile/me` still nulls fields that are omitted (F18).

## F-014

**Game and profile responses are allow-listed DTOs (S8).**

- **Context.** `GET /api/games/[id]` returned the whole `games` row (`select *`) to anyone,
  signed in or not, including `invite_token` and `invite_expires_at`. The Express
  `GET /api/games/join/:token`, `POST /api/games/join/:token` and the `game_start` socket
  broadcast also sent the whole row. `GET /api/profile/[username]` returned every profile
  column of another user (`sex`, `is_public`, Glicko deviation/volatility).
- **Options.** (a) delete the secret keys from the row before responding (deny-list);
  (b) select only the needed columns; (c) build the response from an allow-list of keys.
- **Decision.** (c).
  - Frontend `lib/server/dto.ts`: `toGameDto` (game columns + a public summary of the embedded
    players) and `toPublicProfileDto`. Used by `GET` and `PATCH /api/games/[id]` and
    `GET /api/profile/[username]`. `GET /api/games/[id]` requires a signed-in caller (S5).
  - Server `src/domain/gameDto.js`: `toPublicGame`, exposed through the private-game service
    and used by both invite endpoints and by `socialService.announceGameStart`.
- **Why.**
  - *Allow-list over deny-list*: a deny-list protects only against the columns someone
    remembered. PR 3 moves the token to its own table; until then, and for any column added
    later, an allow-list fails safe.
  - *Not "select fewer columns"*: the live database has drifted from the migrations before
    (`clock_deadline`, `peak_*` are read by the code but created by no migration here).
    Selecting a column that does not exist is a 400 from PostgREST for every request, whereas
    picking keys from whatever `*` returns cannot break a page.
- **Audit of the other routes** (what each returns):
  - `games/active`: a fixed column list, no token. `games/private/create`: `{ token, game_id }`
    to the creator, which is the point of the route.
  - `profile/me`, `notifications`: the caller's own rows. `profile/[username]/games`, `/stats`,
    `leaderboard`, `friends*`: fixed column lists or computed values, no secret columns.
  - Socket `match_found` still spreads the inserted `games` row (its invite columns are null
    for matchmaking games) and the opponent's queue entry including `socketId` (G12, not a
    listed item; logged for the next phase).
- **Behaviour change.** None for the UI: the keys kept are the ones the game, result, review,
  join and profile pages read (checked with `grep` over `features/` and `app/`).

## F-015

**Every engine endpoint except `GET /health` requires a shared secret (ENG-AUTH).**

- **Context.** The FastAPI engine was open to the internet: anyone who knew the Render URL could
  run Stockfish analyses (CPU), ask for computer moves, and POST `/analyse-game` with any
  `game_id`, which **writes** accuracy and move classifications into that `games` row with the
  service-role key.
- **Options.**
  1. Caller authentication: (a) network allow-list; (b) a shared secret header; (c) per-caller
     signed tokens.
  2. No secret configured: (a) run open (as today); (b) refuse.
  3. `/analyse-game` target check: (a) trust the caller now that it is authenticated;
     (b) also verify the game exists and is completed.
  4. Callers without a secret: (a) send the request and let the engine refuse it; (b) do not
     send it.
- **Decision.** 1b, 2b, 3b, 4b.
  - `chess-engine/auth.py`: `require_engine_key`, a FastAPI dependency comparing `X-Engine-Key`
    with `ENGINE_SHARED_SECRET` using `hmac.compare_digest`. No secret → 503 and an error log;
    wrong or missing key → 401. `main.py` attaches it to every router except health, and a test
    walks `app.routes` so a new route cannot be added unprotected without failing.
  - `/docs`, `/redoc` and `/openapi.json` are switched off.
  - `/analyse-game`: `game_id` must be a UUID; `services/review.game_review_status` looks the game
    up first (404 unknown, 409 not completed, 503 if the database is unconfigured or the lookup
    fails); the write itself also filters on `status = 'completed'`.
  - Callers: the game server's `engineClient` (validate / analyse / analyze) and the Next.js
    `/api/maverick-move` proxy send the header. Both read `ENGINE_SHARED_SECRET` from server-side
    env only; neither sends a request when it is unset (the server rejects the call, the proxy
    answers 503). The frontend proxy also adopts `GAMBIT_ENGINE_URL` with `ENGINE_URL` as fallback.
- **Why.**
  - *Shared secret*: Render, Railway and Vercel have no shared private network or stable egress
    IPs on the plans in use, so an allow-list is not available; per-caller tokens add key
    management for two callers that are both ours. One secret, compared in constant time, is the
    smallest thing that closes the hole.
  - *Refuse without a secret*: "unset means open" is exactly the state being fixed.
  - *Still check the game*: authentication says who is calling, not that the request makes
    sense. The game server only asks for a review after it has completed the game, so the check
    costs one indexed lookup and removes "overwrite the review of any game" even for a caller
    that holds the secret.
- **Deploy consequence (see the report's manual steps).** Set the same `ENGINE_SHARED_SECRET` on
  Render, Railway and Vercel **before or together with** this deploy. An engine deployed without
  it answers 503 to everything except `/health`; a game server without it skips analysis and
  post-game review (moves and results are unaffected, they no longer use the engine).
- **Not changed.** `/validate-move` and `engineClient.validateMove` still exist but nothing calls
  them since F-007 (dead code, listed for removal). `scripts/test-deployment.sh` only probes
  `/health`, which stays public.

## F-016

**`GET /health` returns its Stockfish instance to the pool (G18).**

- **Context.** `/health` called `get_stockfish_instance()` and never released it. Render probes
  `/health` continuously, so after `STOCKFISH_POOL_SIZE` probes the pool was empty and every
  analysis answered 503 (after a 10 s wait) until the process restarted.
- **Decision.** The handler uses the pool's context manager (`with seams.get_engine(1) as sf`),
  which puts the instance back on exit, including on an exception.
- **Why the context manager and not an explicit release.** It is the pool's own acquire/release
  pairing, so there is no path that forgets the second half.
- **Test.** `tests/test_health_pool.py` runs against the *real* pool functions (filled with fake
  engines), not the acquire/release doubles the other tests patch in: it probes `/health` five
  times the pool size and then runs an analysis successfully. The old code fails it.

## F-017

**`profiles`: users can change four cosmetic columns of their own row and nothing else (S11).**

- **Context.** RLS decides which *rows* a role may touch, not which *columns*. The
  `profiles_update` policy (`USING (auth.uid() = id)`) therefore let any signed-in user update
  every column of their own row with the public API key: `rating_rapid`, `wins`,
  `games_played`, … The `profiles_insert` policy was `WITH CHECK (true)`: anyone, signed in or
  not, could insert a profile row for any id.
- **Options.**
  1. Protect ratings with: (a) a trigger that rejects changes to rating columns; (b) column
     privileges; (c) move ratings to a separate table.
  2. `INSERT` for `authenticated`: (a) grant it on the non-rating columns; (b) grant nothing.
  3. Revoke only `INSERT, UPDATE` (the brief's wording), or also `DELETE` / `TRUNCATE`.
- **Decision.** 1b, 2b, and revoke everything but `SELECT`.
  - `REVOKE ALL … FROM PUBLIC, anon, authenticated`; `GRANT SELECT` to both API roles;
    `GRANT UPDATE (display_name, bio, country, avatar_url)` to `authenticated`;
    `GRANT ALL` to `service_role`.
  - `profiles_insert`: `TO authenticated WITH CHECK ((select auth.uid()) = id)`.
    `profiles_update`: `TO authenticated`, the same predicate on `USING` and `WITH CHECK`.
- **Why.**
  - *Column privileges*: this is the mechanism Postgres has for exactly this, it is enforced
    before any policy or trigger runs, and it fails loudly (`42501`) rather than silently.
    SEC-04 asks for it by name. A separate ratings table is the cleaner long-term shape but a
    much larger change (every reader), so it is left for later.
  - *Which columns*: derived from the code. `PATCH /api/profile/me` is the only profile edit
    path and writes exactly `display_name`, `bio`, `country`, `avatar_url`. `sex` and
    `is_public` exist in the schema but no code edits them, so they are not granted.
  - *No INSERT grant*: every profile insert in the app goes through the service role (signup,
    the OAuth callback, the auto-create in `GET /api/profile/me`); `grep` finds no client-side
    `.from('profiles').insert`. The corrected policy stays in place as the second line of
    defence if a grant is ever added back.
  - *DELETE / TRUNCATE too*: no client path uses them, and `TRUNCATE` is not subject to RLS at
    all. Least privilege costs nothing here.
- **Unaffected.** The game server (ratings, statistics) and the Next.js routes use the
  service-role / secret key, which bypasses RLS and keeps full privileges. Reading profiles is
  unchanged.
- **Also removed: `frontend/app/actions/auth.ts`.** A `'use server'` action,
  `createProfile({ userId, username, email })`, that inserted a profile for **any caller-supplied
  user id** with the service-role key and no authentication. Nothing imports it, so Next.js
  does not expose it today and it could not have worked (it writes an `email` column that does
  not exist). It was found while listing every writer of `profiles` for this item; leaving a
  ready-made, unauthenticated service-role insert one import away from being live is the kind of
  thing this phase exists to remove.
- **Tests.** `supabase/tests/01_profiles_rls.test.sql` (31 assertions, as `authenticated`, `anon`
  and `service_role`): rating/statistics updates raise `42501` and the row is checked unchanged;
  display fields update; another user's row is affected 0 times; inserts are refused; the policy
  definitions and the exact set of updatable columns are asserted. Run against the old schema,
  22 of the 31 fail.

## F-018

**Invite tokens live in `public.game_invites`, not on `public.games` (INV-TOKEN).**

- **Context.** `games` has the policy "Games are viewable by everyone" (`USING (true)`), and it
  carried `invite_token` and `invite_expires_at`. With nothing but the public API key anyone
  could `select invite_token from games where status = 'waiting'` and join other people's
  private games. S8 stopped the *application* from returning the token; the *database* still
  handed it out.
- **Options.**
  1. (a) column privileges on `games` (revoke `SELECT (invite_token)`); (b) a narrower `SELECT`
     policy on `games`; (c) move the token to its own table.
  2. Rollout: (a) one migration that adds the table and drops the columns; (b) expand →
     deploy → contract in two files.
  3. Invites created by the *old* code between "expand" and the new deploy: (a) accept that
     they are lost; (b) mirror them with a trigger until "contract".
- **Decision.** 1c, 2b, 3b.
  - **(a) `20261112100100_game_invites_expand.sql`**: `game_invites(game_id pk → games on delete
    cascade, token unique not null, expires_at, created_at)`, RLS enabled with **no policies**,
    `REVOKE ALL` from `PUBLIC, anon, authenticated`, backfill from `games`, and a trigger that
    mirrors `games.invite_token` writes into the new table.
  - **Code**: the game server (`gameInvitesRepository`, `privateGameService`) and the Next.js
    `POST /api/games/private/create` insert the game without any token column and store the
    invite separately; a lookup goes token → `game_invites` → `games` by id. If the invite
    cannot be stored the game row is deleted again.
  - **(b) `20261112100300_game_invites_contract.sql`**: one more backfill, drop the trigger, the
    function, the index and both columns.
- **Why.**
  - *Own table*: column-level `SELECT` revokes break `select *` for the API roles (PostgREST
    answers 401/403 for the whole request), and every existing reader of `games` uses `*`. A
    row policy cannot hide a column. A separate table with RLS and no policies is invisible to
    the API roles by construction, which is also what the brief specifies.
  - *Two steps*: dropping the columns in the same migration would break the running server (it
    filters `games` by `invite_token`) for as long as the deploy takes, and makes the migration
    impossible to roll back without data loss.
  - *Mirror trigger*: invites are valid for 48 hours. Without it, an invite created in the
    minutes between applying (a) and the new server going live would be a dead link.
- **Deploy order (also in the report).**
  1. Apply `20261112100000`, `…100100` (expand) and `…100200`.
  2. Deploy the game server and the frontend from this PR.
  3. Apply `…100300` (contract).
  `supabase db push` applies every pending file at once, so do not use it for this release
  unless step 2 is already done; apply the files individually (SQL editor or `psql -f`) and then
  record them with `supabase migration repair --status applied <version>`.
- **Rollback.** Before (b): redeploy the old code; the columns are still there and the trigger
  kept them authoritative for anything the old code wrote, but invites created by the *new*
  code exist only in `game_invites`, so those links stop working (they can be copied back with
  one `UPDATE … FROM game_invites`). After (b): re-add the two columns and copy the tokens back
  from `game_invites` before redeploying old code.
- **Behaviour.** None visible. The creator still gets the token once, from the create route;
  the join page still resolves it through the game server. The server no longer logs the token
  when an invite has expired.
- **Tests.** `supabase/tests/02_game_invites.test.sql` (13 assertions): `anon` and `authenticated`
  get `42501` on any access to `game_invites`; a `games` row has no token columns;
  `service_role` reads the invite; one invite per game; cascade on delete.
