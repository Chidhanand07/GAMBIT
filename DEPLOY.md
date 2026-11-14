# Gambit – Deployment Guide

## Architecture
- **Web app** → Vercel (Next.js 16, React 19), project root `frontend/`
- **Game server** → Railway (Node 26, Express 5, Socket.IO), built from `server/Dockerfile`
- **Engine** → Render (Python 3.11, FastAPI, Stockfish), built from `chess-engine/Dockerfile`
- **Database and Auth** → Supabase (Postgres, Auth, Realtime presence, Storage for avatars)
- **Redis** → a Railway Redis add-on or Upstash (game server); Upstash REST (web app rate limits)

How the pieces talk to each other: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Local development: [`setup.md`](setup.md).

## Deploy order

**A new installation**, in this order:

1. Supabase: create the project and apply **every** migration in `supabase/migrations/` (section 1).
2. Redis (section 2).
3. Engine on Render (section 3). Note its URL.
4. Game server on Railway (section 4), pointing at the engine. Note its URL.
5. Web app on Vercel (section 5), pointing at the game server and the engine.
6. Put the Vercel URL into the game server's `CORS_ORIGINS` and into Supabase Auth's URL
   configuration, then run the checklist in section 6.

`ENGINE_SHARED_SECRET` must have the same value on all three platforms before any of them serves traffic.

**Upgrading an existing installation**: some migrations must wait for code, and some code must wait
for a migration. The constraints that still apply:

| Migration | Rule |
|---|---|
| `20261112100300_game_invites_contract.sql` | Only after the game server and web app that read `public.game_invites` are live (the high-risk PR 3 release or later). |
| `20261113100000_rating_atomic.sql` | **Before** deploying a game server from the M3 release or later: that server rates games through `public.apply_game_result`, which this file creates. |
| `20261114100000_drop_legacy_clock_columns.sql` | Only after **every** game-server replica and the web app run M2 or later. |
| `20261114200000_profiles_revoke_service_role_update.sql` | Only after the L3 web app is live (it writes profile edits as the signed-in user). |

Code-only rules:
- Deploy the web app before you run the game server on more than one replica (section 4b-2):
  the current web app connects with WebSocket only, so no sticky sessions are needed.
- Apply migrations to a staging project first, then production.

On a fresh project nothing is deployed yet, so all migrations can be applied together.

---

## 1. Supabase Setup

### 1a. Create Project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Choose a strong database password and keep it somewhere safe (the schema drift check needs it, section 9)
3. Wait for the project to provision (~2 min)

### 1b. Run Migrations
1. Go to **SQL Editor** in the Supabase dashboard
2. Run each file in `supabase/migrations/` **one at a time, in file-name order**:

   | # | File | What it does |
   |---|---|---|
   | 1 | `00001_initial_schema.sql` | tables `profiles`, `games`, `moves`, `messages`, `matchmaking_queue`, `friendships`, `notifications` |
   | 2 | `00002_profile_fields.sql` | display name, bio, country |
   | 3 | `00003_rls_policies.sql` | first RLS policies |
   | 4 | `00004_friendships.sql` | `friendships` (if missing) and its RLS |
   | 5 | `00005_fix_rating_precision.sql` | wider rating columns |
   | 6 | `00006_schema_fixes.sql` | missing profile and game columns, indexes (was a second `00005`, ADR F-020) |
   | 7 | `00010_fix_rls.sql` | clean set of `profiles` policies |
   | 8 | `00011_fix_clock_columns.sql` | no-op marker for the clock columns |
   | 9 | `20261112100000_profiles_lockdown.sql` | column privileges on `profiles` (S11) |
   | 10 | `20261112100100_game_invites_expand.sql` | `game_invites` table (service role only) |
   | 11 | `20261112100200_drop_matchmaking_queue.sql` | drops the unused queue table; refuses to run while any public table lacks RLS |
   | 12 | `20261112100300_game_invites_contract.sql` | removes the invite columns from `games` |
   | 13 | `20261113100000_rating_atomic.sql` | `public.apply_game_result`, `games.rated_at` |
   | 14 | `20261114100000_drop_legacy_clock_columns.sql` | drops `games.white_time_ms` / `black_time_ms` |
   | 15 | `20261114200000_profiles_revoke_service_role_update.sql` | `service_role` loses `UPDATE` on `profiles` |

   On an existing project, follow the rollout rules in **Deploy order** above.
3. If you apply files by hand and use the Supabase CLI history, record each one:
   `supabase migration repair --status applied <version>`.
4. Verify: **Table Editor** shows `profiles`, `games`, `moves`, `messages`, `friendships`,
   `notifications` and `game_invites` (no `matchmaking_queue`).

Notes on the late migrations:
- `20261114100000_drop_legacy_clock_columns.sql` refuses to run while a function, policy or view in
  `public` still names either column. pgTAP: `supabase/tests/04_legacy_clock_columns.test.sql`.
- `20261114200000_profiles_revoke_service_role_update.sql` (S8-PRIV): applied before the L3 web app is
  live, profile edits from the old web app fail with a permission error until the deploy (ratings are
  unaffected: they go through `apply_game_result`). Rollback:
  `GRANT UPDATE ON TABLE public.profiles TO service_role;`.

The same migrations and the pgTAP tests in `supabase/tests/` run in CI on an empty database
(job `Database (Supabase)`, section 8).

### 1c. Storage bucket for avatars
The settings page uploads avatars from the browser to a Storage bucket named `avatars`. No migration
creates it: create a **public** bucket `avatars` in **Storage**, with a policy that lets signed-in
users upload. Without it the avatar upload fails; nothing else is affected.

### 1d. Enable Google OAuth (optional)
1. Go to **Authentication → Providers → Google**
2. Enable it, add your Google Cloud OAuth Client ID and Secret
3. Authorized redirect URI in Google Cloud Console: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
4. In Supabase **Auth → URL Configuration**:
   - Site URL: `https://your-app.vercel.app`
   - Redirect URLs: add `https://your-app.vercel.app/auth/callback`

### 1e. Get Your Keys
From **Settings → API Keys**:
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL` (Vercel) and `SUPABASE_URL` (Railway, Render)
- **Publishable key** (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Vercel)
- **Secret key** (`sb_secret_…`) → `SUPABASE_SECRET_KEY` on Vercel, Railway and Render (**never expose it client-side, never prefix it with `NEXT_PUBLIC_`**; the web app throws an error instead of using an `sb_secret_` key found in a public variable)

The legacy `anon` / `service_role` keys are deprecated at the end of 2026. The old variable names are
still read as fallbacks, so an existing deployment keeps working until you switch; when both a new and
an old name are set, the new one wins. The fallbacks are listed in each platform's table below.

Realtime: the online-player count uses Realtime **presence** on the channel `gambit-online-users`.
No table needs to be added to a Realtime publication.

---

## 2. Redis

The game server keeps live games, the matchmaking queue, pending challenges and rematches, clock tick
locks, rate limits, the result outbox and the Socket.IO adapter stream in Redis. It needs Lua
(`EVAL`), Streams (`XADD` / `XREAD BLOCK`) and `SET … PX NX`. Redis 7 is recommended; CI uses
`redis:7-alpine`.

- **Railway Redis add-on** (recommended, especially with more than one replica): use its connection
  URL (`redis://…`) as `REDIS_URL`.
- **Upstash**: create a Redis database in the region closest to Railway, enable TLS and use the
  `rediss://default:PASSWORD@HOST:PORT` URL as `REDIS_URL`. Every blocking `XREAD` of the Socket.IO
  adapter is a billed command on Upstash.

### 2b. REST credentials for the Next.js rate limiter (Vercel)

Vercel functions reach Upstash over HTTPS (REST API), not the Redis protocol. In the Upstash
console open the database → **REST API** and copy:
- **UPSTASH_REDIS_REST_URL** (e.g. `https://xxx.upstash.io`)
- **UPSTASH_REDIS_REST_TOKEN** (the read-write token, not the read-only one)

Set both on **Vercel only** (Production and Preview), never with `NEXT_PUBLIC_`. They are not
needed on Railway or Render. The same database the game server uses is fine (keys are prefixed
`gambit:rl:`). If either is missing, the rate limits on login, signup, friend requests and
`/api/maverick-move` are OFF: the app logs `[rate-limit] … not configured` once per instance and
lets requests through. The game server's own limits (moves, chat, queue joins, challenges,
analysis, username checks, invite look-ups) use `REDIS_URL` and need nothing extra.
The limiter uses `PEXPIRE … NX` (Redis 7 semantics); this has not been verified against Upstash.

---

## 3. Chess Engine → Render

The engine is deployed as a **Docker** service. `chess-engine/Dockerfile` is the one
definition of its runtime: Python 3.11, the Python dependencies and Stockfish
(`apt-get install stockfish`). The root `render.yaml` only points Render at that file;
there is no build or start command to keep in sync, and nothing to install by hand.

### 3a. Create the service
**Blueprint (recommended):** [render.com](https://render.com) → New → Blueprint → connect the
repo. Render reads the root `render.yaml` and creates `gambit-engine` (it redeploys only when
`chess-engine/**` or `render.yaml` change).

**By hand:** New Web Service → connect the repo → **Language: Docker** →
**Dockerfile Path** `./chess-engine/Dockerfile` → **Docker Build Context Directory**
`./chess-engine` → **Health Check Path** `/health`. Leave the build and start commands empty.

An engine service created earlier with the native Python runtime must be recreated as Docker.

To run the same image locally:
```bash
docker build -t gambit-engine chess-engine
docker run --rm -p 8001:8001 --env-file chess-engine/.env gambit-engine
```

### 3b. Stockfish and `STOCKFISH_PATH`
`STOCKFISH_PATH` is the path of the Stockfish binary the engine starts.

| Where | Value |
|-------|-------|
| Docker / Render | **Do not set it.** The Dockerfile installs Stockfish and sets `STOCKFISH_PATH=/usr/games/stockfish` (where Debian puts it; that directory is not on `PATH`). The image build fails if the binary is missing. |
| macOS without Docker | unset: `brew install stockfish` puts `stockfish` on `PATH`, which is the default. |
| Debian/Ubuntu without Docker | `apt-get install stockfish`, then `STOCKFISH_PATH=/usr/games/stockfish`. |

If `GET /health` answers `"engine": "Engine unavailable"`, the binary was not found at that path.

### 3c. Environment variables (Render)
Read in `chess-engine/config.py`, once at startup. `render.yaml` declares the required variables and
the model download pair; values marked `sync: false` there are entered in the dashboard.

| Variable | Required | Default | What it does | Secret |
|---|---|---|---|---|
| `ENGINE_SHARED_SECRET` | **yes** | empty | Callers must send it as `X-Engine-Key`. While it is empty every endpoint except `GET /health` answers 503; a wrong key gets 401. Same value on Railway and Vercel (`openssl rand -hex 32`). | yes |
| `SUPABASE_URL` | yes, for reviews | empty | Project URL. Used to check that a game exists and is completed, and to write its review. | no |
| `SUPABASE_SECRET_KEY` | yes, for reviews | empty | Secret key (`sb_secret_…`). Fallback: `SUPABASE_SERVICE_KEY`. Without URL and key, `POST /analyse-game` answers 503 "Game lookup unavailable" and no review is stored. | yes |
| `STOCKFISH_POOL_SIZE` | no | `4` (`render.yaml` sets `2`) | Number of Stockfish instances. `2` on the free tier. | no |
| `ENGINE_MAX_QUEUE` | no | `2 × STOCKFISH_POOL_SIZE` | Requests allowed to **wait** for an instance beyond those in use. Beyond it: 503 `{"detail":"Engine busy"}` with `Retry-After`. | no |
| `ENGINE_QUEUE_TIMEOUT_SECONDS` | no | `5` | Longest wait for an instance before 503 "Engine busy". Must be > 0 (the engine refuses to start otherwise). `GET /health` never waits; post-game reviews are checked when requested and then wait. | no |
| `STOCKFISH_PATH` | no | `stockfish` on `PATH` | Do not set on Render: the Dockerfile sets `/usr/games/stockfish` (3b). | no |
| `STYLE_MODEL_PATH` | no | `style_model.pt` (app directory) | Where the MAVERICK weights are read from / downloaded to. | no |
| `MAVERICK_MODEL_URL` | no | empty | https URL to download the weights from when the file is missing (3e). Leave empty while `style_model.pt` ships in the image. Never put a token in it. | no |
| `MAVERICK_MODEL_SHA256` | with `MAVERICK_MODEL_URL` | empty | SHA-256 the downloaded file must have (3e). When set, a file already on disk must match it too. | no |
| `PORT` | set by Render | `8001` | The container listens on it (`uvicorn … --port ${PORT:-8001}` in the Dockerfile). | no |

`POST /analyze` accepts depths 1..20 only (`MIN_ANALYSIS_DEPTH` / `MAX_ANALYSIS_DEPTH` in
`config.py`; ADR F-063); the app asks for 18. These are constants, not variables.

Scores at the engine's HTTP boundary are always from **White's** point of view
(`services/perspective.py`, ADR F-060).

### 3d. Get the URL
After deploy, copy the URL e.g. `https://gambit-engine.onrender.com`. It is `GAMBIT_ENGINE_URL` on
Railway and on Vercel.

> **Note**: Render free tier spins down after 15 min of inactivity. Upgrade to Starter ($7/mo) to keep it always-on.

### 3e. The MAVERICK style model (`style_model.pt`)
The computer opponent's "plays like me" network is the file `chess-engine/style_model.pt`
(about 26 MB). It is **tracked in git**, so the Docker image contains it and nothing has to
be uploaded: leave `MAVERICK_MODEL_URL` and `MAVERICK_MODEL_SHA256` empty.

The download is the fallback for an image that does not contain the file (for example if the
weights are later taken out of git, or to roll out new weights without a commit):

1. Compute the checksum of the exact file you are going to host:
   ```bash
   shasum -a 256 style_model.pt        # Linux: sha256sum style_model.pt
   ```
2. Upload the file somewhere that serves it over **https** at a stable, direct URL (a
   `curl -L <url> -o check.pt` must give back the same bytes): a GitHub Release asset of this
   repository, a public Supabase Storage bucket, Cloudflare R2 / S3, or a Hugging Face model
   repository (`…/resolve/main/style_model.pt`). The URL must work without credentials; do not
   put a token in it.
3. On Render set `MAVERICK_MODEL_URL` to that URL and `MAVERICK_MODEL_SHA256` to the 64 hex
   characters from step 1, then redeploy.

At startup the engine downloads the file only if it is not already on disk (or if the file on
disk does not match the checksum), verifies the SHA-256 and only then loads it. Render's disk
is ephemeral, so this happens again after every deploy or restart. If the URL is set without
a checksum, the download fails, or the checksum does not match (the file is deleted), the
style model is **unavailable**: the engine still starts, `GET /style-move/health` answers
`{"model_loaded": false}`, `POST /style-move` answers 503, and `POST /computer-move` keeps
working with Stockfish's move instead of the style move. The reason is in the service log
(`style model unavailable (checksum_mismatch)` and similar).

---

## 4. Node Server → Railway

### 4a. Create Project
1. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. **Root Directory**: `server`
3. Railway builds `server/Dockerfile` (set in `server/railway.toml`): `node:26-alpine`,
   `NODE_ENV=production`, `npm ci --omit=dev`, runs as the unprivileged `node` user, `node server.js`.
   The Node version comes from that file, not from a Railway setting.

### 4b. Environment variables (Railway)
Go to your service → **Variables**. Every variable is read in `server/src/config/env.js`, at the
moment it is used (not once at startup).

| Variable | Required | Default | What it does | Secret |
|---|---|---|---|---|
| `SUPABASE_URL` | **yes** | none | Project URL. Unset: the server logs `[supabase] FATAL` and every database call fails. | no |
| `SUPABASE_SECRET_KEY` | **yes** | none | Secret key (`sb_secret_…`), used for game rows, moves, chat, notifications, `apply_game_result` and token verification. Fallbacks, in order: `SUPABASE_SERVICE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. The startup log names the variable it used. | yes |
| `REDIS_URL` | **yes** | `redis://127.0.0.1:6379` | Redis for game state, queue, locks, rate limits, outbox and the Socket.IO adapter (section 2). `/readyz` fails while Redis does not answer. | yes (contains the password) |
| `CORS_ORIGINS` | **yes** in production | none | Comma-separated exact browser origins, e.g. `https://your-app.vercel.app,https://your-domain.com` (no wildcards, no path, no trailing slash). Guards HTTP CORS and the socket handshake. Outside production `http://localhost:3000` and `http://127.0.0.1:3000` are always added. | no |
| `CORS_PREVIEW_ORIGIN_REGEX` | no | unset | Your project's Vercel preview URLs only, e.g. `^https://gambit-[a-z0-9-]+-yourteam\.vercel\.app$`. Must start with `^https://` and end with `\.vercel\.app$`, and must not match other people's `*.vercel.app` hosts. | no |
| `FRONTEND_URL` | deprecated | unset | One origin, read only when `CORS_ORIGINS` is not set. | no |
| `GAMBIT_ENGINE_URL` | **yes** | `http://localhost:8001` | Engine base URL (section 3d). Fallback: `ENGINE_URL` (deprecated, logs a warning). In production a missing URL logs a warning. | no |
| `ENGINE_SHARED_SECRET` | **yes** | unset | Sent to the engine as `X-Engine-Key`. Unset: the server does not call the engine (no analysis, no game review) and logs a warning in production. Same value as on Render. | yes |
| `SOCKET_ADAPTER` | no | `redis` | `redis`: Socket.IO rooms and broadcasts span every replica through Redis Streams. `none`: in-process only, for a single local instance. | no |
| `LOG_LEVEL` | no | `info` | pino level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. | no |
| `ERROR_WEBHOOK_URL` | no | unset | `https://` webhook that gets one JSON POST per fatal error, HTTP 500, socket `internal_error`, failed token verification, rating-function error and stuck game result (`text`/`content` summary for Slack/Discord, plus `error`, `context`, `release`). At most 20 a minute; credential-like context keys are redacted. A non-https URL (other than localhost) is ignored with a warning. Unset: errors are only logged. | yes |
| `PORT` | set by Railway | `3001` | Do not set it yourself. | no |
| `NODE_ENV` | set by the Dockerfile | `production` | Turns on the production checks above. Do not override. | no |
| `RAILWAY_GIT_COMMIT_SHA` | set by Railway | unset | The `release` field of error reports. | no |

A missing `CORS_ORIGINS` in production, or an unsafe `CORS_PREVIEW_ORIGIN_REGEX`, does not stop the
process from starting: the origin check runs per request and throws, so every HTTP request
(including `/readyz`) and every socket handshake fails, and Railway keeps the previous deploy
live (4e). Fix the variable and redeploy.

### 4b-2. Running more than one replica
The game server keeps no game state in process memory: games, the matchmaking queue, pending
challenges and rematches live in Redis; moves and endings are compare-and-set writes; the clock
ticker takes a per-game Redis lock; Socket.IO rooms span replicas via the Redis Streams adapter.
A test plays a full game with White and Black on two different instances over one Redis
(`server/__tests__/integration/twoInstances.test.js`). It is therefore safe to raise Railway's
replica count, **after** all of the following:

1. `SOCKET_ADAPTER` is unset or `redis` on every replica.
2. Redis supports Lua (`EVAL`) and Streams (`XADD`/`XREAD BLOCK`). Railway Redis and Redis ≥ 6.2
   do. Upstash supports both, but every blocking `XREAD` counts as a command: with two or more
   replicas, a Railway Redis add-on (or a fixed-price Upstash plan) is the cheaper choice.
3. Clients connect with the WebSocket transport only (`frontend/lib/socket/connection.ts`; the
   server also accepts only `websocket`), so no sticky sessions are needed. Keep an old web app
   from talking to a multi-replica server: deploy the web app first, then scale.
4. Start with 2 replicas, run the two-replica manual test in section 6, then scale further.

Rollback: scale to 1 replica first, then deploy the previous build. The `{mm}:*` and `clocktick:*`
keys expire on their own; players who were in the queue must search again.

### 4b-3. Game results the database did not take (result outbox)
If Supabase is unreachable when a game ends, the server retries the `games` row 3 times, then
keeps it in Redis (`{outbox}:item:<gameId>`) and a worker on one replica writes it later (every
5 s, backoff 5 s doubling to 5 min) and then rates the game. Each try is logged
(`[outbox] game <id>: ...`). After 12 failed tries, or one hour, the item is **parked**: a
`fatal` log line `[outbox] game <id>: result still not persisted after N re-drives; parked for an
operator` (and an error report if `ERROR_WEBHOOK_URL` is set). Parked items are kept until
someone acts:

```
redis-cli -u "$REDIS_URL" ZRANGE '{outbox}:parked' 0 -1          # which games
redis-cli -u "$REDIS_URL" GET '{outbox}:item:<gameId>'            # the row, last error, attempts
# Fix the cause, then queue it again (one more try; it parks again if it still fails):
redis-cli -u "$REDIS_URL" ZREM '{outbox}:parked' '<gameId>'
redis-cli -u "$REDIS_URL" ZADD '{outbox}:due' 0 '<gameId>'
```

Re-driving is safe to repeat: the row is written only while it is still `active`, and the rating
function applies a game once (`games.rated_at`).

### 4c. Get the URL
After deploy → **Settings → Domains** → generate a Railway domain e.g. `https://gambit-server.up.railway.app`.
This becomes `NEXT_PUBLIC_SOCKET_URL` on Vercel.

### 4d. Verify
Hit `https://gambit-server.up.railway.app/readyz`: it should return `200` with
`{ "ready": true, "checks": { "redis": "ok", "supabase": "ok" } }`. `/livez` (and the older
`/api/health`) answer `{ "status": "ok" }` while the process is up. Every response carries an
`X-Request-Id` (a sane incoming one is kept); the server logs it and forwards it to the engine and
Supabase.

### 4e. Healthcheck and shutdown
`server/railway.toml` sets `healthcheckPath = "/readyz"` (NODE-21, ADR F-071). Railway calls it when a new
deploy starts and only switches traffic once it answers 200: Redis must answer `PING` and Supabase
a one-row query, each within 2 s. **If Redis or Supabase is down, the new deploy does not go
live and the previous one keeps serving; this is intended** (a replica that cannot reach Redis
cannot run games). Railway does not use the healthcheck after the deploy is live, so an outage
later does not restart running replicas. Railway's config-as-code takes precedence over the
dashboard's healthcheck setting; the dashboard shows the value from the file after the next deploy.

On `SIGTERM` (a redeploy or scale-down) the server answers `/readyz` with 503 `draining`, stops its
timers, tells clients `server_shutdown` so they reconnect (to another replica if there is one), and
exits within a 20 s drain window. An uncaught exception or unhandled rejection is logged as `fatal`
and the process exits so Railway restarts it (`restartPolicyType = "ON_FAILURE"`).

---

## 5. Frontend → Vercel

### 5a. Import Project
1. [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. **Root Directory**: `frontend`. Vercel detects Next.js; there is no `vercel.json` and no build
   setting to change.
3. Node version: 26.x, read from `frontend/package.json` `engines`. If the project pins a Node version
   in its settings, set it to 26.x.

### 5b. Environment variables (Vercel)
**Settings → Environment Variables**, for **Production** and **Preview** (and **Development** if you use
`vercel dev`). `NEXT_PUBLIC_*` values are compiled into the browser bundle at build time: changing one
needs a redeploy (5d). Everything without the prefix stays on the server (`frontend/lib/server/**`
is `server-only`).

| Variable | Required | Default | What it does | Secret |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **yes** | none | Supabase project URL (browser and server clients). | no |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **yes** | none | Publishable key (`sb_publishable_…`). Fallback: `NEXT_PUBLIC_SUPABASE_ANON_KEY`. An `sb_secret_` value here is refused with an error. | no (public by design) |
| `SUPABASE_SECRET_KEY` | **yes** | none | Secret key (`sb_secret_…`) for the route handlers' admin client (signup, games, friends, notifications, leaderboard, profile reads). Fallbacks, in order: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY`. **Never** with `NEXT_PUBLIC_`. | yes |
| `NEXT_PUBLIC_SOCKET_URL` | **yes** | `http://127.0.0.1:3001` | Game server URL (section 4c): the socket, `/api/analysis/engine`, the username check and invite look-ups. | no |
| `GAMBIT_ENGINE_URL` | yes, for "play the computer" | `http://localhost:8001` | Engine URL, used by `/api/maverick-move` only. Fallback: `ENGINE_URL`. | no |
| `ENGINE_SHARED_SECRET` | yes, for "play the computer" | unset | Sent to the engine as `X-Engine-Key`. Unset: `/api/maverick-move` answers 503 "Engine not configured". Same value as on Render. | yes |
| `UPSTASH_REDIS_REST_URL` | **yes** in production | unset | Upstash REST URL for the rate limits (2b). Either Upstash variable unset: rate limits are off. | no (server-only) |
| `UPSTASH_REDIS_REST_TOKEN` | **yes** in production | unset | Upstash REST read-write token (2b). | yes |

Avatars from `*.supabase.co` and `lh3.googleusercontent.com` are optimized by `next/image`; the list is
`frontend/lib/imageHosts.json` (other hosts render unoptimized). Add a host there, not in `next.config.js`.

### 5c. Deploy
Click **Deploy**. First build takes ~2 min.

After deploy, copy your Vercel URL (e.g. `https://gambit.vercel.app`) and:
- Add it to `CORS_ORIGINS` on Railway (exact origin, no trailing slash)
- Update Supabase **Auth → URL Configuration**: Site URL, and `https://<your-app>/auth/callback` in Redirect URLs

### 5d. Redeploy after updating env vars
Any time you change env vars in Vercel → **Deployments → Redeploy** the latest deployment.

---

## 6. Post-Deploy Verification Checklist

`scripts/test-deployment.sh` checks the engine's `/health`, the server's `/api/health` and
`/api/matchmaking/status`; point it at production with
`TEST_ENGINE_URL=https://… TEST_SERVER_URL=https://… scripts/test-deployment.sh`. Then by hand:

```
[ ] GET https://gambit-server.up.railway.app/readyz → 200 { "ready": true, … }
[ ] GET https://gambit-engine.onrender.com/health → { "status": "ok", "engine": "online" }
[ ] https://gambit.vercel.app/ → intro animation plays
[ ] Sign up new account → redirected to /lobby, profile created in Supabase
[ ] Log in → navbar shows avatar, no flash of "Log In" buttons
[ ] /lobby → online count shows correctly
[ ] Play → matchmaking finds game, board loads
[ ] Make moves → clocks count down correctly
[ ] Disconnect tab → opponent sees countdown banner that actually decrements
[ ] Game ends → rating change shown, review appears on the result page
[ ] /lobby → Generate Invite Link works, /join/[token] loads correctly
[ ] Challenge notification → appears top-right, auto-dismisses after 30s
[ ] Rematch request → appears bottom-right toast
[ ] /profile/[username] → shows stats, games list, online dot
[ ] /analysis → engine evaluation works
[ ] /offline → the computer opponent answers moves
[ ] /leaderboard → shows ranked players
[ ] Two replicas: open two browsers with two accounts until the Railway logs show them on
    different replicas (pino `socketId`/hostname), then play a game to the end: moves, clocks,
    chat, resign and rematch reach both sides; one rating change; /readyz is 200 on both
[ ] Two replicas: restart one replica mid-game → its player reconnects to the other and the game
    continues (clocks did not run twice)
```

---

## 7. Common Issues

### Socket connection fails, or requests answer 403 `origin_not_allowed`
The browser's origin is not in `CORS_ORIGINS` on Railway. It must match exactly (`https://`, host,
no trailing slash). Preview deployments need `CORS_PREVIEW_ORIGIN_REGEX`.

### Every request to the game server fails with a 500 and the deploy never goes live
`CORS_ORIGINS` is missing in production, or `CORS_PREVIEW_ORIGIN_REGEX` was refused. The error names
the variable (`[config] CORS_ORIGINS is required in production` / `CORS_PREVIEW_ORIGIN_REGEX …`).

### "Engine unavailable" on analysis
Render free tier spun down. Wait 30s for cold start, or upgrade to Starter plan. If it stays
that way, Stockfish was not found: see section 3b (`STOCKFISH_PATH`).

### "Engine busy" (503)
Every Stockfish instance is in use and the wait queue is full. Raise `STOCKFISH_POOL_SIZE` (and the
instance size) or `ENGINE_MAX_QUEUE` on Render.

### No analysis or game review at all
`ENGINE_SHARED_SECRET` is missing on Railway or differs from Render's value (the engine answers 401),
or `GAMBIT_ENGINE_URL` points at the wrong host. In production the server logs a `[config]` warning
for a missing secret or URL.

### The computer opponent plays, but not "like me"
`GET /style-move/health` (with the `X-Engine-Key` header) answers `{"model_loaded": false}`:
the style model is unavailable and MAVERICK is playing Stockfish's moves. See section 3e.

### Profile not created after signup
Check Supabase Table Editor → `profiles`. If empty after signup, verify `SUPABASE_SECRET_KEY` (or the
legacy `SUPABASE_SERVICE_ROLE_KEY`) is set correctly in Vercel env vars.

### Redis connection errors in Railway logs
Make sure `REDIS_URL` uses `rediss://` (TLS) for Upstash. A Railway Redis add-on uses `redis://`
(no TLS): check which one you're using.

### Invite link generates but /join/[token] shows "not found"
Invite tokens live in `public.game_invites` (written by the web app with the secret key, read by the
game server). Check that `20261112100100_game_invites_expand.sql` is applied and that both services
use the same Supabase project. Only games that are still `waiting` have an invite page.

### Avatar upload fails
The `avatars` Storage bucket is missing or does not allow uploads (section 1c).

---

## 8. CI and Security Checks (GitHub)

| Workflow (file) | Job names (status checks) | When |
|---|---|---|
| Tests (`tests.yml`) | `Server (Node)`, `Frontend (Next.js)`, `Chess engine (Python)`, `Database (Supabase)` | push to `main`/`preprod`, every PR, manual |
| CodeQL (`codeql.yml`) | `CodeQL (javascript-typescript)`, `CodeQL (python)` | push to `main`/`preprod`, every PR, Mondays, manual |
| Dependency audit (`dependency-audit.yml`) | `Dependency audit` | push, PR, Mondays, manual |
| Schema drift (`schema-drift.yml`) | `Schema drift (Supabase)` | daily, manual (needs secrets, 8c) |

The jobs use Node from `.nvmrc` (26) and Python 3.11. `Server (Node)` runs ESLint,
dependency-cruiser, Prettier, the lint-baseline ratchet, Jest against a real `redis:7-alpine`
service, and the self-tests in `scripts/`. `Frontend (Next.js)` runs `tsc`, ESLint, Prettier, the
ratchet, Jest and a production `next build` with placeholder values. `Chess engine (Python)` runs
Ruff and pytest (Stockfish is faked). `Database (Supabase)` starts a local Supabase stack, applies
every migration to an empty database (`supabase db reset`) and runs the pgTAP tests (`supabase test db`).

### 8a. Repository settings (one-time, owner)
1. **Settings → Advanced Security**: enable **Dependency graph**, **Dependabot alerts**, **Dependabot security updates**, **Secret scanning** and **Push protection** (SEC-10, GIT-06).
2. **Code scanning → CodeQL analysis**: leave it on **Advanced** (the repo ships `.github/workflows/codeql.yml`). If "Default" setup is switched on, GitHub rejects the workflow's uploads.
3. **Rulesets** for `main` and `preprod`: require `Server (Node)`, `Frontend (Next.js)`, `Chess engine (Python)`, `Database (Supabase)`, `Dependency audit`, `CodeQL (javascript-typescript)` and `CodeQL (python)`. Do not require `Schema drift (Supabase)` (it runs on a schedule).
4. Create the labels `dependencies`, `server`, `frontend`, `chess-engine` and `ci` (Dependabot applies them to its PRs).

Dependabot (`.github/dependabot.yml`) checks `server` and `frontend` (npm), `chess-engine` (pip) and the
workflows (GitHub Actions) weekly and opens its PRs against `preprod`: minor and patch updates grouped,
each major on its own. Dependabot *security* updates ignore that setting and target the default branch:
retarget them to `preprod` before merging.

### 8b. Dependency audit and approved exceptions (SEC-11)
The `Dependency audit` check fails when:
- `server` or `frontend` has a **high or critical** advisory in its production dependencies (`npm audit --omit=dev --audit-level=high`);
- `chess-engine` has **any** known vulnerability (`pip-audit -r requirements.txt`; pip-audit reports no severity, so it cannot be limited to high/critical).

Run it locally from the repo root (no `npm install` needed; the pip audit needs `pip install pip-audit`):
```bash
node scripts/dependency-audit.js npm server
node scripts/dependency-audit.js npm frontend
node scripts/dependency-audit.js pip chess-engine
```

The fix is to upgrade the dependency. When that is not possible yet, add an exception to `.github/dependency-audit-allowlist.json` in a reviewed PR:
```json
{
  "exceptions": [
    {
      "id": "GHSA-xxxx-xxxx-xxxx",
      "scope": "server",
      "reason": "Why it is not exploitable here, or why the fix cannot ship yet.",
      "approvedBy": "github-handle",
      "expires": "2026-12-31"
    }
  ]
}
```
Every field is required. `scope` is `server`, `frontend` or `chess-engine` (one entry per package tree), and `expires` may be at most 90 days ahead. An expired or incomplete entry fails the check; an entry that no longer matches a finding only warns, so delete it once the upgrade lands.

Prefer upgrading (or removing) the direct dependency that pulls a vulnerable package; use an npm `overrides` entry only when no direct upgrade exists, and record why and when it can go. The audit went green on 2026-11-14 with an empty allow-list and no `overrides` (socket.io/socket.io-client 4.8.4, zod 4, nanoid 3.3.20, axios removed from the server, FastAPI 0.162 with Starlette ≥ 1.3.1 in the engine). Each service must be redeployed (the engine image rebuilt) for a dependency fix to reach production.

### 8c. GitHub repository secrets
Only the schema drift check uses secrets. Tests, CodeQL and the dependency audit need none (the
frontend build in CI uses placeholder values written in `tests.yml`).

| Secret | Required | What it is | Used by |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | for the drift check | Personal access token from supabase.com → Account → Access Tokens | `schema-drift.yml` |
| `SUPABASE_DB_PASSWORD` | for the drift check | The project's database password | `schema-drift.yml` |
| `SUPABASE_PROJECT_REF` | for the drift check | The project ref (the id in the project URL) | `schema-drift.yml` |

Until all three are set the drift job passes with a "skipped" notice.

---

## 9. Check for Schema Drift (Supabase)

Drift means the hosted database no longer matches `supabase/migrations`: somebody changed it in the dashboard or SQL Editor, or a merged migration was never applied. The check is read-only.

**In CI:** the `Schema drift` workflow (job `Schema drift (Supabase)`) runs daily and from **Actions → Schema drift → Run workflow**. It needs the three repository secrets from section 8c and passes with a "skipped" notice until all are set. It is not a PR check (it needs secrets), so do not add it to a ruleset's required checks.

**By hand** (needs the Supabase CLI and Docker running):
```bash
supabase login                      # once
supabase link <project-ref>         # once per clone; asks for the database password
scripts/schema-drift.sh             # exit 0 = no drift, 1 = drift (prints the SQL), 2 = could not check
```
The script runs `supabase db diff --remote --schema public` (`--linked` on CLI 2.x) and fails when the diff contains SQL. Set `SCHEMA_DRIFT_SCHEMAS=public,other` to compare more schemas. It also prints `supabase migration list --remote` for information.

**When drift is found**
1. Read the printed SQL: it is what would turn the migrations' schema into the remote's.
2. If the remote change should stay, capture it: `supabase migration new <name>`, put the SQL in the new file, add pgTAP tests where it touches RLS or functions, and open a PR to `preprod`.
3. If it should not stay, write a migration that reverts it and ship that the same way.
4. If the SQL shows a repo migration that was never applied, apply it through the normal migration deploy, not by pasting it into the SQL Editor.
5. Never fix drift by editing the remote by hand, and never edit an already-applied migration file (SEC-08). If only the history table disagrees (`migration list` shows a version on one side), reconcile it with `supabase migration repair`.

> Not yet verified: the script and workflow follow the Supabase CLI v3.1.0 reference but have not been run against a real project. Confirm the first manual run before relying on the schedule.

---

## 10. Re-run Stored Game Reviews (after the evaluation-perspective fix)

Reviews written before the ENG-PERSPECTIVE fix (ADR F-060) scored every White move wrongly (1.e4 showed as "Inaccuracy") and drew White's moves upside down on the eval graph. `chess-engine/scripts/rereview_games.py` rebuilds the stored reviews of completed games. It writes only the review columns (`white_accuracy`, `black_accuracy`, `white_move_classifications`, `black_move_classifications`, `critical_moments`), only on rows whose `status` is `completed`, and never ratings, results or statuses.

Run it once after the fix is deployed, from a shell on the engine service (Render → the engine → **Shell**), which already has `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `STOCKFISH_PATH`:
```bash
cd /app                                                   # chess-engine/ when run locally
python -m scripts.rereview_games --limit 20               # DRY RUN: prints what would change, writes nothing
python -m scripts.rereview_games --apply --concurrency 2  # writes the new reviews
```
Options: `--since 2026-11-01` (games that ended at or after that time; games without `ended_at` are skipped by it), `--limit N` (newest first), `--game-id <uuid>` (repeatable), `--concurrency N` (1–8, default 2; each worker holds one Stockfish instance, so keep it at or below `STOCKFISH_POOL_SIZE` while the service is serving players). Each game takes a depth-18 Stockfish pass per move, so a large backfill takes a while: start with `--limit`, then widen. Exit code 0 = no failures, 1 = some games failed (listed; rerun with `--game-id`), 2 = Supabase not configured. Re-running is safe: an unchanged review is not rewritten.
