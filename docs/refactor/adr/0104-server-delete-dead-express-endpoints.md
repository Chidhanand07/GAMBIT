# ADR 0104 — Delete the 13 Express endpoints that have no callers

- **Status:** accepted (PR 06/13, http + sockets)

## Context

`server/server.js` served 13 HTTP endpoints for profiles, private-game
creation, friends and notifications. The browser uses the Next.js API routes
under `frontend/app/api/**` for all of these features. The frontend calls the
Express server (`NEXT_PUBLIC_SOCKET_URL`, default `http://127.0.0.1:3001`) for
only four paths. Keeping the dead copies doubles the attack surface. For
example, `friendshipsRepository` interpolated user ids into PostgREST `.or()`
filters (BUGS.md). It also doubles the review cost of every server change.
The playbook allows deleting code "proven dead by a repo-wide grep".

## Evidence (re-verified on this branch)

**Who calls the Express server.** This grep:

`grep -rnE "NEXT_PUBLIC_SOCKET_URL|socketUrl|SOCKET_URL|localhost:3001|SERVER_URL" frontend scripts render.yaml server/railway.toml .github`

run without `node_modules`, `.next` or tests, finds only these callers:

| Caller | Express path |
|---|---|
| `frontend/app/analysis/page.tsx:32` | `POST /api/analysis/engine` |
| `frontend/app/join/[token]/page.tsx:32` | `GET /api/games/join/:token` |
| `frontend/app/join/[token]/page.tsx:82` | `POST /api/games/join/:token` |
| `frontend/app/signup/page.tsx:44` | `GET /api/users/check-username` |
| `scripts/test-deployment.sh:33` | `GET /api/health` |
| `scripts/test-deployment.sh:36` | `GET /api/matchmaking/status` |
| `server/railway.toml:7` (healthcheckPath) | `GET /api/health` |

Two other matches are not calls:

- `frontend/app/lobby/page.tsx:63` defines `socketUrl` but never uses it. BUGS.md lists it as dead code.
- `frontend/lib/config.ts:1` exports `SOCKET_URL`, but nothing imports it.

`frontend/components/SocketProvider.tsx:32` opens only the Socket.IO connection.

`frontend/middleware.ts` has no rewrites. `frontend/next.config.js` has no `rewrites`. So a relative `fetch('/api/...')` always reaches a Next.js route handler, never Express.

**Per deleted endpoint.** This grep:

`grep -rnF <path> . --exclude-dir={node_modules,.git,.next,.venv,.ruff_cache}`

was run for each path. The table lists every hit outside `server/server.js` and `server/__tests__`.

| Deleted Express endpoint | Hits outside server.js / server tests | Why they are not callers |
|---|---|---|
| `POST /api/auth/register-profile` | none | — |
| `POST /api/games/private/create` | `frontend/app/lobby/page.tsx:169`, frontend tests, `docs/superpowers/plans/*.md`, `readme_first.md:600` | The lobby call is a relative `fetch('/api/games/private/create')`, so it goes to `frontend/app/api/games/private/create/route.ts`. The plans are historical notes. `readme_first.md:600` describes this as the Node server, which is stale prose and not a runbook. |
| `PUT /api/profile` | only `/api/profile/me` and `/api/profile/[username]/…` (Next routes) | Different path, served by Next |
| `GET /api/friends/status/:username` | `frontend/app/profile/[username]/page.tsx:172` (relative), frontend tests | Next route `app/api/friends/status/[username]` |
| `POST /api/friends/request` | `frontend/app/profile/[username]/page.tsx:283` (relative), frontend tests | Next route `app/api/friends/request` |
| `GET /api/friends` | `frontend/app/profile/[username]/page.tsx:201` (relative) | Next route `app/api/friends` |
| `PUT /api/friends/:id/accept` | none (the frontend uses `PUT /api/friends/:id?action=…`) | Next route `app/api/friends/[id]` |
| `DELETE /api/friends/:id` | none from the frontend (Next `app/api/friends/[id]` has its own DELETE) | — |
| `GET /api/friends/requests/pending` | none (the frontend uses `/api/friends/pending`) | — |
| `PUT /api/friends/:id/decline` | none (`?action=decline` on the Next route) | — |
| `GET /api/notifications` | `frontend/components/Navbar.tsx:73` (relative), frontend tests | Next route `app/api/notifications` |
| `PUT /api/notifications/read-all` | none (the frontend uses `PUT /api/notifications/read`, a Next route); one historical plan note | — |
| `PUT /api/notifications/:id/read` | none | — |

No runbook (`README.md`, `DEPLOY.md`, `setup.md`, `render.yaml`,
`scripts/*.sh`, `.github/`) references any of them.

## Options

1. Keep them and move them into `http/routes/` like the live ones.
2. Delete them, their tests, and any code that only they used.

## Decision

Option 2.

**Deleted from `server.js`:**

- the 13 routes;
- the `insertNotification` helper's friend-request use. The challenge use stays in `socialService`.

**Deleted because nothing else used them (grep-proven):**

- `src/repositories/friendshipsRepository.js` (the whole file);
- `notificationsRepository.listRecent`, `markAllRead` and `markRead`. `insert` stays, because `challenge_request` uses it.
- `profilesRepository.findIdByUsername`, `findUsernameById` and `insert`. `findUsernameByUsername`, `findForMatchmaking`, `findRatingsByIds` and `updateById` stay.

**Tests deleted. Only cases that exercise a deleted endpoint or a deleted repository function were removed:**

- From `server/__tests__/http.test.js`:
  - the 13 dead rows of the `PROTECTED` table, which accounts for 26 `test.each` cases. The live `POST /api/games/join/tok` row stays.
  - `a non-Bearer Authorization header is rejected`, which called `GET /api/friends`.
  - `describe('profiles')`: 3 cases.
  - `private games › create returns the token, id and join url`.
  - `describe('friends')`: 6 cases.
  - `describe('notifications')`: 2 cases.
- From `server/__tests__/repositories/supabaseRepositories.test.js`: the rows for the deleted repository functions (12 cases).
- The diff of both files is deletions only. No remaining assertion was edited.

**Coverage that moved:**

- The non-Bearer rejection is still tested. `__tests__/http/routes.test.js` sends it to the live protected `POST /api/games/join/:token`, and `__tests__/http/requireUser.test.js` covers it as a unit test.
- `__tests__/http/routes.test.js` also pins that every deleted path now answers 404 without touching the database.

## Why

The grep above shows that no caller in the repository can reach these
endpoints. The frontend features keep working through their Next.js routes.
Removing them is the deletion of proven-dead code that PLAYBOOK hard
constraint 1 explicitly allows. It also removes the `.or()` filter
interpolation from the server.
