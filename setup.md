# Gambit – Local Development Setup

Three services run locally: the web app (port 3000), the game server (3001) and the engine (8001).
They need Redis and a Supabase project. Deployment is in [`DEPLOY.md`](DEPLOY.md); how the parts fit
together is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js + npm | 26 | `.nvmrc` says 26: `nvm use`. Both packages declare `engines: 26.x`. |
| Python | 3.11 | The engine's Docker image and CI use 3.11. |
| Redis | 7 recommended | `brew install redis && brew services start redis`, or `docker run -p 6379:6379 redis:7-alpine`. The server needs Lua and Streams. |
| Stockfish | any recent | `brew install stockfish` (on `PATH`), or Debian `apt-get install stockfish` (then `STOCKFISH_PATH=/usr/games/stockfish`). |
| Supabase | cloud project, or the CLI + Docker | See section 2. |

## 2. Supabase

**Cloud project:** create one, then apply every file in `supabase/migrations/` in file-name order
(SQL Editor, one file at a time; the list is in [DEPLOY.md §1b](DEPLOY.md#1b-run-migrations)).
Create the public `avatars` Storage bucket if you want avatar uploads (DEPLOY.md §1c). Copy the
Project URL, the publishable key (`sb_publishable_…`) and the secret key (`sb_secret_…`) from
**Settings → API Keys**.

**Local stack (CLI + Docker):** from the repo root,
```bash
supabase start          # Postgres, Auth and the API in Docker (supabase/config.toml)
supabase db reset       # applies every migration to an empty database
supabase status         # prints the API URL and the keys to use below
```

The legacy `anon` / `service_role` keys and their old variable names still work as fallbacks.

## 3. Install dependencies

```bash
npm run install:all     # root (concurrently), server/ and frontend/

cd chess-engine
python3.11 -m venv venv
./venv/bin/pip install -r requirements-dev.txt    # requirements.txt + pytest, ruff
cd ..
```

## 4. Environment files

Each service has its own file; copy the example and fill it in. The root `.env.example` only points
to these three. The full meaning of every variable is in the per-platform tables of
[DEPLOY.md](DEPLOY.md) (§3c engine, §4b game server, §5b web app).

| Service | File | Loaded by |
|---|---|---|
| Game server | `server/.env` (from `server/.env.example`) | the server itself (`dotenv`) |
| Web app | `frontend/.env.local` (from `frontend/.env.example`) | Next.js |
| Engine | `chess-engine/.env` (from `chess-engine/.env.example`) | **nobody**: the engine does not load a `.env` file; export it in the shell (section 5) |

Minimum values for local development:

- **All three:** the same `ENGINE_SHARED_SECRET` (`openssl rand -hex 32`). Without it the engine
  answers 503 on every endpoint except `/health`, the server skips analysis and reviews, and
  "play the computer" answers 503.
- **Server:** `SUPABASE_URL`, `SUPABASE_SECRET_KEY`. Defaults that need no change locally:
  `PORT` 3001, `REDIS_URL` `redis://127.0.0.1:6379`, `GAMBIT_ENGINE_URL` `http://localhost:8001`.
  `CORS_ORIGINS` is not needed outside production: `http://localhost:3000` and
  `http://127.0.0.1:3000` are always allowed.
- **Web app:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`. Defaults: `NEXT_PUBLIC_SOCKET_URL` `http://127.0.0.1:3001`,
  `GAMBIT_ENGINE_URL` `http://localhost:8001`. Without the Upstash variables the web rate limits are
  off (one warning in the log), which is fine locally.
- **Engine:** `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (only needed to store post-game reviews).
  Leave `STOCKFISH_PATH` unset when `stockfish` is on `PATH`.

Never commit these files, and never give the secret key a `NEXT_PUBLIC_` prefix.

## 5. Run the services

One terminal each, from the repo root:

```bash
# Game server: http://localhost:3001 (node --watch restarts on save)
cd server && npm run dev

# Web app: http://localhost:3000
cd frontend && npm run dev

# Engine: http://localhost:8001 (exports chess-engine/.env first)
cd chess-engine && set -a && source .env && set +a && venv/bin/uvicorn main:app --port 8001 --reload
```

`npm run dev` at the root starts all three with `concurrently` (engine via `npm run dev:engine`), but
that engine process gets no variables from `chess-engine/.env`: export them in that shell first, or
use the separate terminals above.

The engine can also run as its production image:
```bash
docker build -t gambit-engine chess-engine
docker run --rm -p 8001:8001 --env-file chess-engine/.env gambit-engine
```

## 6. Check it works

```bash
curl http://localhost:3001/readyz      # {"ready":true,"checks":{"redis":"ok","supabase":"ok"}}
curl http://localhost:8001/health      # {"status":"ok","engine":"online"}
scripts/test-deployment.sh             # engine /health, server /api/health and /api/matchmaking/status
```

Then open http://localhost:3000, sign up and play a game in two browsers (or one normal and one
private window).

## 7. Tests and gates

From the repo root: `npm test` runs the three suites below. No `.env` is needed: Supabase, the engine
and the network are faked.

| Package | Tests | Other gates (all run in CI) |
|---|---|---|
| `server/` | `npx jest` | `npm run lint`, `npm run lint:arch` (dependency-cruiser), `npm run format:check`, `npm run lint:baseline` |
| `frontend/` | `npx jest` | `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run lint:baseline`, `npm run build` |
| `chess-engine/` | `./venv/bin/python -m pytest -q` | `./venv/bin/ruff check .`, `./venv/bin/ruff format --check .` |
| `supabase/` | `supabase start && supabase db reset && supabase test db` (pgTAP, `supabase/tests/`) | needs Docker |
| `scripts/` | `node --test scripts/*.test.js scripts/lint-baseline/*.test.js` | `node scripts/sync-shared.js --check` |

- Server tests that exercise the real Redis Lua scripts use `REDIS_TEST_URL`
  (e.g. `REDIS_TEST_URL=redis://127.0.0.1:6379 npx jest`) or start a local `redis-server` if one is
  installed; without either they are skipped with a `SKIPPED: no real Redis` notice.
- Engine tests against a real Stockfish binary run when one is found (`STOCKFISH_PATH`, `PATH`
  or Homebrew) and are skipped otherwise.
- `shared/time-control.json` is copied into the server and the web app by
  `node scripts/sync-shared.js`; edit the file in `shared/`, never a copy.
