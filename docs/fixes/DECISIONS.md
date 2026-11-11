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
