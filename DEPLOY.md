# Gambit – Deployment Guide

## Architecture
- **Frontend** → Vercel (Next.js 14)
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
From **Settings → API**:
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`
- `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_KEY` (**never expose this client-side**)

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

### 3a. Install Stockfish on Render
Render supports custom apt packages. In your service settings → **Environment** → add:
```
STOCKFISH_PATH=/usr/bin/stockfish
```
And in **Build Command**:
```bash
apt-get install -y stockfish && pip install -r requirements.txt
```

### 3b. Create Web Service
1. [render.com](https://render.com) → New Web Service → connect your repo
2. **Root Directory**: `chess-engine`
3. **Runtime**: Python 3
4. **Build Command**: `apt-get install -y stockfish && pip install -r requirements.txt`
5. **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### 3c. Environment Variables
| Key | Value |
|-----|-------|
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | service role key |
| `STOCKFISH_PATH` | `/usr/bin/stockfish` |
| `STOCKFISH_POOL_SIZE` | `2` (free tier) or `4` (paid) |
| `PYTHON_VERSION` | `3.11.0` |

### 3d. Get the URL
After deploy, copy the URL e.g. `https://gambit-engine.onrender.com` — needed for the server's `GAMBIT_ENGINE_URL`.

> **Note**: Render free tier spins down after 15 min of inactivity. Upgrade to Starter ($7/mo) to keep it always-on.

---

## 4. Node Server → Railway

### 4a. Create Project
1. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. **Root Directory**: `server`
3. Railway auto-detects Node and runs `npm install && npm start`

### 4b. Environment Variables
Go to your service → **Variables** tab and add:

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | service role key |
| `REDIS_URL` | `rediss://...` from Upstash |
| `FRONTEND_URL` | `https://your-app.vercel.app` (set after Vercel deploy) |
| `GAMBIT_ENGINE_URL` | `https://gambit-engine.onrender.com` |
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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `NEXT_PUBLIC_SOCKET_URL` | Railway server URL (e.g. `https://gambit-server.up.railway.app`) |

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
Render free tier spun down. Wait 30s for cold start, or upgrade to Starter plan.

### Profile not created after signup
Check Supabase SQL Editor → `profiles` table. If empty after signup, verify `SUPABASE_SERVICE_ROLE_KEY` is set correctly in Vercel env vars.

### Redis connection errors in Railway logs
Make sure `REDIS_URL` uses `rediss://` (TLS) not `redis://` for Upstash. Railway Redis add-on uses `redis://` (no TLS) — check which you're using.

### Invite link generates but /join/[token] shows "not found"
The game row in Supabase may not have the `invite_token` or `invite_expires_at` columns. Re-run the migrations that add those columns.
