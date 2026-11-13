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
| `FRONTEND_URL` | `https://your-app.vercel.app` (set after Vercel deploy) |
| `GAMBIT_ENGINE_URL` | `https://gambit-engine.onrender.com` (canonical; the old `ENGINE_URL` is read as a deprecated fallback and logs a warning) |
| `ENGINE_SHARED_SECRET` | the same value as on Render. Sent to the engine as `X-Engine-Key`; without it the server does not call the engine (no analysis, no game review). |
| `PORT` | **do not set** — Railway injects this automatically |

### 4c. Get the URL
After deploy → **Settings → Domains** → generate a Railway domain e.g. `https://gambit-server.up.railway.app`
This becomes `NEXT_PUBLIC_SOCKET_URL` in the frontend.

### 4d. Verify
Hit `https://gambit-server.up.railway.app/api/health` — should return `{ "status": "ok" }`.

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
[ ] GET https://gambit-server.up.railway.app/api/health → { "status": "ok" }
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
