# Gambit – Deployment Guide

## Architecture
- **Frontend** → Vercel (Next.js 16)
- **Server** → Railway (Node/Express/Socket.io)
- **Engine** → Render (Python/FastAPI/Stockfish)
- **Database** → Supabase (PostgreSQL + Auth)
- **Cache** → Upstash Redis (or Railway Redis add-on)

---

## 1. Supabase Setup

### 1a. Create Project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Choose a strong database password — save it somewhere safe
3. Wait for the project to provision (~2 min)

### 1b. Run Migrations
1. Go to **SQL Editor** in the Supabase dashboard
2. Run each file in `supabase/migrations/` in numeric order:
   - `00001_...sql` → `00002_...sql` → ... → latest
3. Verify: go to **Table Editor** — you should see `profiles`, `games`, `friendships`, `notifications`, `messages` tables

**Order constraint: `20261114100000_drop_legacy_clock_columns.sql`** drops
`games.white_time_ms` / `black_time_ms`. Apply it **only after every game-server replica and the
web app run the M2 release or later** (an older server writes `white_time_ms` when a player
disconnects; an older web app selects it). The migration refuses to run while a function,
policy or view in `public` still names either column. On a fresh project (nothing deployed
yet) it is safe to apply with the others. pgTAP: `supabase/tests/04_legacy_clock_columns.test.sql`.

**Rollout order for `20261114200000_profiles_revoke_service_role_update.sql` (S8-PRIV):** deploy
the frontend first (its `PATCH /api/profile/me` now writes through the signed-in user's session),
then apply this migration. It revokes `UPDATE` on `profiles` from `service_role`; applied before
the new frontend is live, profile edits from the old frontend fail with a permission error until
the deploy (ratings are unaffected: they go through `apply_game_result`). Rollback:
`GRANT UPDATE ON TABLE public.profiles TO service_role;`.

### 1c. Enable Google OAuth (optional)
1. Go to **Authentication → Providers → Google**
2. Enable it, add your Google Cloud OAuth Client ID and Secret
3. Authorized redirect URI in Google Cloud Console: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
4. In Supabase **Auth → URL Configuration**:
   - Site URL: `https://your-app.vercel.app`
   - Redirect URLs: add `https://your-app.vercel.app/auth/callback`

### 1d. Get Your Keys
From **Settings → API Keys**:
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`
- **Publishable key** (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- **Secret key** (`sb_secret_…`) → `SUPABASE_SECRET_KEY` on Vercel, Railway and Render (**never expose this client-side, never prefix it with `NEXT_PUBLIC_`**)

The legacy `anon` / `service_role` keys are deprecated at the end of 2026. The old variable names are still read as fallbacks, so an existing deployment keeps working until you switch:
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (frontend), `SUPABASE_SERVICE_ROLE_KEY` (frontend server code), `SUPABASE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` (game server), `SUPABASE_SERVICE_KEY` (engine). When both a new and an old name are set, the new one wins.

---

## 2. Redis (Upstash — recommended, free tier available)

1. Go to [upstash.com](https://upstash.com) → Create Database
2. Choose **Redis**, region closest to your Railway server
3. Enable **TLS** (required for production)
4. Copy the **REST URL** or **Redis URL** (`rediss://default:PASSWORD@HOST:PORT`)
5. This becomes `REDIS_URL` in the server env vars

Alternatively, add a **Redis add-on** directly in Railway (simpler but costs ~$5/mo).

---

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

---

## 3. Chess Engine → Render

The engine is deployed as a **Docker** service. `chess-engine/Dockerfile` is the one
definition of its runtime: Python 3.11, the Python dependencies and Stockfish
(`apt-get install stockfish`). The root `render.yaml` only points Render at that file;
there is no build or start command to keep in sync, and nothing to install by hand.

### 3a. Create the service
**Blueprint (recommended):** [render.com](https://render.com) → New → Blueprint → connect the
repo. Render reads the root `render.yaml` and creates `gambit-engine`.

**By hand:** New Web Service → connect the repo → **Language: Docker** →
**Dockerfile Path** `./chess-engine/Dockerfile` → **Docker Build Context Directory**
`./chess-engine` → **Health Check Path** `/health`. Leave the build and start commands empty.

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

### 3c. Environment Variables
| Key | Value |
|-----|-------|
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_SECRET_KEY` | Supabase secret key (`sb_secret_…`); legacy `SUPABASE_SERVICE_KEY` still read |
| `STOCKFISH_POOL_SIZE` | `2` (free tier) or `4` (paid) |
| `ENGINE_MAX_QUEUE` | optional; requests allowed to WAIT for a Stockfish instance beyond the `STOCKFISH_POOL_SIZE` in use (default `2 × STOCKFISH_POOL_SIZE`). Beyond it: 503 `{"detail":"Engine busy"}` + `Retry-After`. |
| `ENGINE_QUEUE_TIMEOUT_SECONDS` | optional; longest wait for an instance before 503 "Engine busy" (default `5`, must be > 0). `GET /health` never waits; post-game reviews are checked when requested and then wait. |
| `ENGINE_SHARED_SECRET` | a long random string (`openssl rand -hex 32`). **Required**: until it is set every endpoint except `GET /health` answers 503. Use the same value on Railway and Vercel. |
| `MAVERICK_MODEL_URL` | optional, see 3e. Leave empty while `style_model.pt` ships in the image. |
| `MAVERICK_MODEL_SHA256` | required whenever `MAVERICK_MODEL_URL` is set, see 3e. |
| `STYLE_MODEL_PATH` | optional; where the weights file is read from / downloaded to (default `style_model.pt` in the app directory). |
| `STOCKFISH_PATH` | not set on Render, see 3b. |

`PORT` is assigned by Render; the container listens on it (8001 when it is unset).

### 3d. Get the URL
After deploy, copy the URL e.g. `https://gambit-engine.onrender.com` — needed for the server's `GAMBIT_ENGINE_URL`.

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
3. Railway builds `server/Dockerfile` (set in `server/railway.toml`): Node 26, `npm ci --omit=dev`, `node server.js`. The Node version comes from that file, not from a Railway setting.

### 4b. Environment Variables
Go to your service → **Variables** tab and add:

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_SECRET_KEY` | Supabase secret key (`sb_secret_…`); legacy `SUPABASE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` still read |
| `REDIS_URL` | `rediss://...` from Upstash |
| `CORS_ORIGINS` | **Required.** Comma-separated exact browser origins, e.g. `https://your-app.vercel.app,https://your-domain.com` (no wildcards, no trailing slash). The same list guards HTTP CORS and the game socket handshake. |
| `CORS_PREVIEW_ORIGIN_REGEX` | Optional. Your project's Vercel preview URLs only, e.g. `^https://gambit-[a-z0-9-]+-yourteam\.vercel\.app$`. The server refuses to start if the pattern would match other people's `*.vercel.app` hosts. |
| `FRONTEND_URL` | Deprecated: read only when `CORS_ORIGINS` is not set. |
| `GAMBIT_ENGINE_URL` | `https://gambit-engine.onrender.com` (canonical; the old `ENGINE_URL` is read as a deprecated fallback and logs a warning) |
| `ENGINE_SHARED_SECRET` | the same value as on Render. Sent to the engine as `X-Engine-Key`; without it the server does not call the engine (no analysis, no game review). |
| `SOCKET_ADAPTER` | Optional. `redis` (default): Socket.IO rooms and broadcasts span every replica through Redis Streams. `none`: in-process only, for a single local instance. |
| `ERROR_WEBHOOK_URL` | Optional (SEC-12). An `https://` webhook that gets one JSON POST per fatal error, HTTP 500, socket `internal_error`, failed token verification, rating-function error and stuck game result (`text`/`content` summary for Slack/Discord, plus `error`, `context`, `release`). At most 20 a minute; credential-like context keys are redacted. A secret: store it as a Railway variable. Unset: errors are only logged. The release tag comes from Railway's `RAILWAY_GIT_COMMIT_SHA` (set automatically). |
| `PORT` | **do not set** — Railway injects this automatically |

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
3. Clients connect with the WebSocket transport only (the frontend does since this release), so
   no sticky sessions are needed. Keep the old frontend from talking to a multi-replica server:
   deploy the frontend first, then scale.
4. Start with 2 replicas, run the two-replica manual test in section 6, then scale further.

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
function applies a game once.

### 4c. Get the URL
After deploy → **Settings → Domains** → generate a Railway domain e.g. `https://gambit-server.up.railway.app`
This becomes `NEXT_PUBLIC_SOCKET_URL` in the frontend.

### 4d. Verify
Hit `https://gambit-server.up.railway.app/readyz` — should return `200` with
`{ "ready": true, "checks": { "redis": "ok", "supabase": "ok" } }`. `/livez` (and the older
`/api/health`) only say the process is up.

### 4e. Healthcheck
`server/railway.toml` sets `healthcheckPath = "/readyz"` (NODE-21). Railway calls it when a new
deploy starts and only switches traffic once it answers 200: Redis must answer `PING` and Supabase
a one-row query, each within 2 s. **If Redis or Supabase is down, the new deploy does not go
live and the previous one keeps serving; this is intended** (a replica that cannot reach Redis
cannot run games). Railway does not use the healthcheck after the deploy is live, so an outage
later does not restart running replicas. Railway's config-as-code takes precedence over the
dashboard's healthcheck setting; the dashboard shows the value from the file after the next deploy.

---

## 5. Frontend → Vercel

### 5a. Import Project
1. [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Vercel will auto-detect Next.js from `vercel.json` in the repo root
3. **No need to change** Framework Preset or Output Directory — `vercel.json` handles it

### 5b. Environment Variables
Go to **Settings → Environment Variables** and add all of these for **Production**, **Preview**, and **Development**:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (`sb_publishable_…`); legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` still read |
| `SUPABASE_SECRET_KEY` | Supabase secret key (`sb_secret_…`), server-side only; legacy `SUPABASE_SERVICE_ROLE_KEY` still read |
| `NEXT_PUBLIC_SOCKET_URL` | Railway server URL (e.g. `https://gambit-server.up.railway.app`) |
| `UPSTASH_REDIS_REST_URL` | Upstash REST URL (see 2b). Server-only. |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST read-write token (see 2b). Server-only. |
| `GAMBIT_ENGINE_URL` | Render engine URL. Server-side only (used by `/api/maverick-move`); the old `ENGINE_URL` still works. |
| `ENGINE_SHARED_SECRET` | the same value as on Render. Server-side only: **never** prefix with `NEXT_PUBLIC_`. Without it "play the computer" answers 503. |

### 5c. Deploy
Click **Deploy**. First build takes ~2 min.

After deploy, copy your Vercel URL (e.g. `https://gambit.vercel.app`) and:
- Update `FRONTEND_URL` in Railway server env vars to this URL
- Update Supabase Auth → URL Configuration → Site URL and Redirect URLs

### 5d. Redeploy after updating env vars
Any time you change env vars in Vercel → **Deployments → Redeploy** the latest deployment.

---

## 6. Post-Deploy Verification Checklist

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
[ ] Game ends → rating change shown, analysis queued
[ ] /lobby → Generate Invite Link works, /join/[token] loads correctly
[ ] Challenge notification → appears top-right, auto-dismisses after 30s
[ ] Rematch request → appears bottom-right toast
[ ] /profile/[username] → shows stats, games list, online dot
[ ] /analysis → engine evaluation works
[ ] /leaderboard → shows ranked players
[ ] Two replicas: open two browsers with two accounts until the Railway logs show them on
    different replicas (pino `socketId`/hostname), then play a game to the end: moves, clocks,
    chat, resign and rematch reach both sides; one rating change; /readyz is 200 on both
[ ] Two replicas: restart one replica mid-game → its player reconnects to the other and the game
    continues (clocks did not run twice)
```

---

## 7. Common Issues

### Socket connection fails (CORS error)
Make sure `FRONTEND_URL` in Railway exactly matches your Vercel URL (with `https://`, no trailing slash).

### "Engine unavailable" on analysis
Render free tier spun down. Wait 30s for cold start, or upgrade to Starter plan. If it stays
that way, Stockfish was not found: see section 3b (`STOCKFISH_PATH`).

### The computer opponent plays, but not "like me"
`GET /style-move/health` (with the `X-Engine-Key` header) answers `{"model_loaded": false}`:
the style model is unavailable and MAVERICK is playing Stockfish's moves. See section 3e.

### Profile not created after signup
Check Supabase SQL Editor → `profiles` table. If empty after signup, verify `SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`) is set correctly in Vercel env vars.

### Redis connection errors in Railway logs
Make sure `REDIS_URL` uses `rediss://` (TLS) not `redis://` for Upstash. Railway Redis add-on uses `redis://` (no TLS) — check which you're using.

### Invite link generates but /join/[token] shows "not found"
The game row in Supabase may not have the `invite_token` or `invite_expires_at` columns. Re-run the migrations that add those columns.

---

## 8. CI Security Checks (GitHub)

### 8a. Repository settings (one-time, owner)
1. **Settings → Advanced Security**: enable **Dependency graph**, **Dependabot alerts**, **Dependabot security updates**, **Secret scanning** and **Push protection** (SEC-10, GIT-06).
2. **Code scanning → CodeQL analysis**: leave it on **Advanced** (the repo ships `.github/workflows/codeql.yml`). If "Default" setup is switched on, GitHub rejects the workflow's uploads.
3. **Rulesets** for `main` and `preprod`: add the required checks `Dependency audit`, `CodeQL (javascript-typescript)` and `CodeQL (python)` next to the test checks.
4. Create the labels `dependencies`, `server`, `frontend`, `chess-engine` and `ci` (Dependabot applies them to its PRs).

Dependabot (`.github/dependabot.yml`) opens its weekly PRs against `preprod`. Dependabot *security* updates ignore that setting and target the default branch: retarget them to `preprod` before merging.

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

---

## 9. Check for Schema Drift (Supabase)

Drift means the hosted database no longer matches `supabase/migrations`: somebody changed it in the dashboard or SQL Editor, or a merged migration was never applied. The check is read-only.

**In CI:** the `Schema drift` workflow (job `Schema drift (Supabase)`) runs daily and from **Actions → Schema drift → Run workflow**. It needs three repository secrets and passes with a "skipped" notice until all are set:

| Secret | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Personal access token from supabase.com → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | The project's database password |
| `SUPABASE_PROJECT_REF` | The project ref (the id in the project URL) |

It is not a PR check (it needs secrets), so do not add it to a ruleset's required checks.

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
