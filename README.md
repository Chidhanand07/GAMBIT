# Gambit

A production-ready, full-stack chess platform with an accuracy-based rating system, real-time smart matchmaking, and a friends system.

## Architecture & Tech Stack
- **Frontend**: Next.js 14, Tailwind CSS, TypeScript (deployed to Vercel)
- **Backend API Server**: Node.js, Express, Socket.io (deployed to Railway)
- **Chess Engine Microservice**: Python FastAPI, `python-chess`, Stockfish (deployed to Render)
- **Database / Auth**: Supabase (PostgreSQL, Realtime subscriptions, Auth)

## Local Development Requirements
- Node.js >= 18
- Python >= 3.10
- Supabase CLI (optional, but recommended if running DB locally instead of cloud)

## One-Command Setup

1. Rename `.env.example` to respective `.env` files internally:
   - `cp .env.example frontend/.env.local`
   - `cp .env.example server/.env`
   - `cp .env.example chess-engine/.env`
2. Populate the Supabase credentials in those newly created `.env` files.
3. Install all dependencies:
   ```bash
   npm run install:all
   ```
4. Start the entire stack concurrently:
   ```bash
   npm run dev
   ```

## Deployment Guide - Fully Automated

### Step 1: Supabase Setup
1. Create a new Supabase project.
2. Run the SQL files from `supabase/migrations/` in the SQL Editor (run them in order).
3. Enable **Realtime** on these tables: `games`, `moves`, `messages`, `notifications`, `profiles`.
4. Grab your `URL`, `anon key` and `service_role key`.

### Step 2: Deploy Chess Engine to Render
1. Connect your repo in Render and choose **New Web Service**.
2. Render will automatically detect the `render.yaml` configuration in the `chess-engine` folder and set up the Python container.
3. Add the `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` environment variables in Render.
4. Note your Render URL (e.g. `https://gambit-engine.onrender.com`).

### Step 3: Deploy Backend Server to Railway
1. Connect your repo in Railway.
2. Ensure you specify the root directory as `server` (or Railway will use the `server/railway.toml`).
3. Set the following variables in Railway:
   - `PORT=3000` (or leave default, Railway assigns dynamically)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `GAMBIT_ENGINE_URL` (points to the Render URL from Step 2)
   - `FRONTEND_URL` (Wait until Vercel is deployed, then add it here for CORS)
4. Note your Railway URL (e.g. `https://gambit-production.up.railway.app`).

### Step 4: Deploy Frontend to Vercel
1. Point Vercel to your repository. The `vercel.json` and internal Next.js detection will handle the build.
2. Important: Set the `Root Directory` in Vercel settings to `frontend/`.
3. Add these variables in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SOCKET_URL` (points to the Railway URL from Step 3)
4. Deploy.

### Step 5: Final Wiring
1. In Railway, ensure `FRONTEND_URL` matches your Vercel URL.
2. In Supabase, go to **Authentication -> URL Configuration** and add your Vercel URL as a valid redirect URL.

### Step 6: Test Deployment Verification
1. Verify Vercel loads without client-side errors.
2. Verify Engine is up: Try to `GET /health` on the Render URL.
3. Verify Server is up: Check Socket connections in browser Network tab.
4. Try to start a game. It should spin until matched.
5. Create an invite link via \"Private Game\".
6. Send the link to a second incognito browser and join.
7. Finish the game and confirm the `Accuracy Ranking` arc gauge loads via the asynchronous analysis webhook.
8. Check if Supabase `games` row successfully stored `white_accuracy` and `black_accuracy`.
9. Send a friend request from User A to User B.
10. Accept friend request and see live status.
