# Gambit

An online chess platform: rated matchmaking and private invite games with server-run clocks,
Glicko-2 ratings per time-control category, post-game reviews from Stockfish, a computer opponent
(MAVERICK), friends, challenges and a leaderboard.

## Stack

| Part | Stack | Deployed to |
|---|---|---|
| `frontend/` | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS | Vercel |
| `server/` | Node 26, Express 5, Socket.IO, Redis (ioredis), CommonJS | Railway (Docker) |
| `chess-engine/` | Python 3.11, FastAPI, python-chess, Stockfish, PyTorch (style model) | Render (Docker) |
| `supabase/` | Postgres migrations and pgTAP tests, Supabase Auth | Supabase |

The game server is authoritative: it verifies the player's Supabase token in the socket handshake,
validates every move, runs the clocks and decides every result. More in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Quick start (local)

Needs Node 26 (`nvm use`), Python 3.11, Redis, Stockfish and a Supabase project. Full steps:
[`setup.md`](setup.md).

```bash
npm run install:all                                   # root, server/ and frontend/ node_modules
cd chess-engine && python3.11 -m venv venv && ./venv/bin/pip install -r requirements-dev.txt && cd ..

cp server/.env.example server/.env                    # then fill in the values
cp frontend/.env.example frontend/.env.local
cp chess-engine/.env.example chess-engine/.env
```

Run each service in its own terminal:

```bash
cd server && npm run dev                              # game server on :3001 (loads server/.env)
cd frontend && npm run dev                            # web app on http://localhost:3000
cd chess-engine && set -a && source .env && set +a && venv/bin/uvicorn main:app --port 8001 --reload
```

The engine does not read `.env` itself, hence the `source`. `npm run dev` at the root starts all
three with `concurrently`, but its engine process gets no variables from `chess-engine/.env`.

## Tests

```bash
npm test                     # all three suites
npm run test:server          # cd server && npx jest
npm run test:frontend        # cd frontend && npx jest
npm run test:engine          # cd chess-engine && ./venv/bin/python -m pytest -q
```

Supabase, the engine and the network are faked; no `.env` is needed. Server tests that run the real
Redis Lua scripts use `REDIS_TEST_URL` or a local `redis-server` and are skipped without one. Engine
tests against a real Stockfish binary are skipped when none is installed. Database tests (pgTAP) need
the Supabase CLI and Docker: `supabase start && supabase db reset && supabase test db`.
Lint, type and format gates per package: [`setup.md`](setup.md#7-tests-and-gates).

CI (`.github/workflows/`) runs the same suites on every pull request; see
[DEPLOY.md §8](DEPLOY.md#8-ci-and-security-checks-github).

## Documentation

- [`setup.md`](setup.md): local development
- [`DEPLOY.md`](DEPLOY.md): deployment, environment variables per platform, deploy order, operations
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): components, layers and main flows
- [`docs/ENGINEERING_RULES.md`](docs/ENGINEERING_RULES.md): the rulebook (mandatory)
- [`readme_first.md`](readme_first.md): orientation for new contributors
- [`docs/fixes/DECISIONS.md`](docs/fixes/DECISIONS.md): decision log (ADRs F-001 onward)
