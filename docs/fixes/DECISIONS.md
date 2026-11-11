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
