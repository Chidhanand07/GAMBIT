# GAMBIT – MASTER REFERENCE DOCUMENT
> Read this entire file before touching any code. This is the single source of truth for the project.
> Last updated: April 2026

---

## TABLE OF CONTENTS
1. [What This Project Is](#1-what-this-project-is)
2. [Architecture at a Glance](#2-architecture-at-a-glance)
3. [Directory Map](#3-directory-map)
4. [How to Start Everything](#4-how-to-start-everything)
5. [Environment Variables](#5-environment-variables)
6. [Database Schema](#6-database-schema)
7. [Auth System – CRITICAL READ](#7-auth-system--critical-read)
8. [Key Files and Their Responsibilities](#8-key-files-and-their-responsibilities)
9. [DO NOT TOUCH – Danger Zones](#9-do-not-touch--danger-zones)
10. [Safe to Edit – Common Change Areas](#10-safe-to-edit--common-change-areas)
11. [Socket Events Reference](#11-socket-events-reference)
12. [Rating System](#12-rating-system)
13. [Clock System – How It Works](#13-clock-system--how-it-works)
14. [Game Flow – End to End](#14-game-flow--end-to-end)
15. [Common Bugs and Their Root Causes](#15-common-bugs-and-their-root-causes)
16. [Logic Decisions Made and Why](#16-logic-decisions-made-and-why)
17. [Pending TODOs](#17-pending-todos)
18. [Deployment](#18-deployment)

---

## 1. WHAT THIS PROJECT IS

**Gambit** is a full-stack online chess platform. Players can:
- Play online games (matchmaking or private invite)
- Play blitz, bullet, rapid, classical, or custom time controls
- Challenge friends directly
- See live ratings (Glicko-2), game history, win/loss record
- View a leaderboard
- Request and accept friends
- Analyse games with a Stockfish engine
- Resume interrupted games
- Get notified if opponent disconnects (30-second grace period)

**Tech Stack:**
| Layer | Technology | Port |
|-------|-----------|------|
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS | 3000 |
| Backend | Node.js + Express + Socket.io | 3001 |
| Chess Engine | Python + FastAPI + python-chess + Stockfish | 8001 |
| Database | Supabase (PostgreSQL + Auth) | cloud |

---

## 2. ARCHITECTURE AT A GLANCE

```
Browser (Next.js client)
  │
  ├─── HTTP REST ──────────► Next.js API Routes (/app/api/**)
  │                              │
  │                              └─── Supabase Admin Client (service role key)
  │                                      │
  │                                      └─── PostgreSQL (profiles, games, etc.)
  │
  ├─── Socket.io ──────────► Node/Express Server (port 3001)
  │                              │
  │                              ├─── Supabase Admin Client
  │                              ├─── MatchmakingService
  │                              ├─── RatingService (Glicko-2)
  │                              └─── FriendsService
  │
  └─── HTTP ───────────────► Python/FastAPI (port 8001) [Stockfish engine]
```

**Key architectural decisions:**
- Auth is HTTP-only cookie based. The browser CANNOT read the token. All auth reads happen server-side by parsing the `sb-<ref>-auth-token` cookie.
- Next.js API routes use the Supabase SERVICE ROLE KEY — this bypasses Row Level Security (RLS). This is intentional.
- The Node server also uses the service role key for the same reason.
- Socket.io rooms: `game_<gameId>` for game events, `user_<userId>` for personal events (challenges, rematches).
- All profile API routes have `export const dynamic = 'force-dynamic'` to prevent Next.js caching stale data.

---

## 3. DIRECTORY MAP

```
Gambit/
├── readme_first.md              ← YOU ARE HERE
├── complete_fixes.md            ← Full history of every fix made
├── setup.md                     ← Original setup notes
├── README.md                    ← Public-facing readme
├── package.json                 ← Root (no real code, just workspace)
├── .env.example                 ← Template for env vars
│
├── frontend/                    ← Next.js 14 App Router
│   ├── .env.local               ← Frontend secrets (NEVER COMMIT)
│   ├── app/
│   │   ├── layout.tsx           ← Root layout with providers
│   │   ├── page.tsx             ← Landing page (/)
│   │   ├── globals.css          ← CSS variables, Tailwind base
│   │   ├── login/page.tsx       ← Login form
│   │   ├── signup/page.tsx      ← Signup form
│   │   ├── lobby/page.tsx       ← Game lobby (matchmaking, private game)
│   │   ├── game/[id]/page.tsx   ← MAIN GAME PAGE ← most complex file
│   │   ├── leaderboard/page.tsx ← Leaderboard
│   │   ├── analysis/page.tsx    ← Game analysis with Stockfish
│   │   ├── settings/page.tsx    ← Profile settings + avatar upload
│   │   ├── offline/page.tsx     ← Offline practice (no account needed)
│   │   ├── reset-password/page.tsx
│   │   ├── challenge/[username]/page.tsx ← Send challenge to a user
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/route.ts      ← POST login
│   │       │   └── signup/route.ts     ← POST signup
│   │       ├── profile/
│   │       │   ├── me/route.ts         ← GET my profile, PATCH update
│   │       │   └── [username]/
│   │       │       ├── route.ts        ← GET profile by username
│   │       │       ├── games/route.ts  ← GET paginated game history
│   │       │       └── stats/route.ts  ← GET stats breakdown by category
│   │       ├── games/
│   │       │   ├── [id]/route.ts       ← GET game by ID, PATCH update
│   │       │   └── active/route.ts     ← GET caller's active game (if any)
│   │       ├── friends/
│   │       │   ├── route.ts            ← GET friends list
│   │       │   ├── request/route.ts    ← POST send friend request
│   │       │   ├── pending/route.ts    ← GET incoming requests
│   │       │   ├── status/[username]/route.ts ← GET friendship status
│   │       │   └── [id]/route.ts       ← PUT accept/decline, DELETE unfriend
│   │       └── leaderboard/route.ts    ← GET top players by rating
│   │
│   ├── components/
│   │   ├── Navbar.tsx           ← Auth state, online count, challenge toasts
│   │   ├── SocketProvider.tsx   ← Socket.io client singleton + reconnect
│   │   └── ProfileProvider.tsx  ← Shared profile context (avoids duplicate /me fetches)
│   │
│   └── lib/
│       ├── sounds.ts            ← Audio helpers (move, capture, check, game end)
│       └── supabase/
│           ├── client.ts        ← Browser Supabase client
│           ├── server.ts        ← Server Supabase client (cookie-based)
│           └── middleware.ts    ← Supabase middleware helper
│
├── server/                      ← Node.js backend
│   ├── server.js                ← MAIN SERVER FILE ← everything in one file
│   ├── supabase.js              ← Supabase admin client (service role)
│   ├── .env                     ← Server secrets (NEVER COMMIT)
│   └── services/
│       ├── matchmaking.js       ← Queue + rating-based matching
│       ├── rating.js            ← Glicko-2 rating calculation
│       └── friends.js           ← Private game creation, token management
│
├── chess-engine/                ← Python FastAPI + Stockfish
│   ├── main.py                  ← FastAPI app (POST /analyze)
│   ├── engine.py                ← Stockfish wrapper
│   └── requirements.txt
│
└── supabase/
    └── migrations/
        ├── 00001_initial_schema.sql   ← Core tables (profiles, games, moves, etc.)
        ├── 00002_profile_fields.sql   ← Extra profile columns
        ├── 00003_rls_policies.sql     ← Row Level Security policies
        ├── 00004_friendships.sql      ← Friendships + notifications tables
        ├── 00005_fix_rating_precision.sql
        └── 00010_fix_rls.sql
```

---

## 4. HOW TO START EVERYTHING

Open 3 separate terminals:

**Terminal 1 – Frontend (Next.js)**
```bash
cd "/Users/chidanandh/Desktop/Python folders/Chess/Chess/Gambit/frontend"
npm run dev
# Runs on http://localhost:3000
```

**Terminal 2 – Backend (Node server)**
```bash
cd "/Users/chidanandh/desktop/Python Folders/Chess/Chess/Gambit/server"
npm run dev
# Runs on http://localhost:3001
# Watch mode: auto-restarts on file save
```

**Terminal 3 – Chess Engine (Python, optional)**
```bash
cd "/Users/chidanandh/desktop/Python Folders/Chess/Chess/Gambit/chess-engine"
source venv/bin/activate
uvicorn main:app --port 8001
# Only needed for /analysis page and move quality scoring
# Game play works without this
```

**Check everything is working:**
- Frontend: http://localhost:3000
- Server health: http://localhost:3001/api/health → `{"status":"ok"}`
- Engine health: http://localhost:8001 (if running)

---

## 5. ENVIRONMENT VARIABLES

### `frontend/.env.local` (Next.js — all MUST be set)
```
NEXT_PUBLIC_SUPABASE_URL=https://fmwobjpbrrdeiaulhqwp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from Supabase dashboard>
SUPABASE_SERVICE_ROLE_KEY=<service role key — NEVER prefix with NEXT_PUBLIC_>
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

### `server/.env` (Node server — all MUST be set)
```
PORT=3001
SUPABASE_URL=https://fmwobjpbrrdeiaulhqwp.supabase.co
SUPABASE_SERVICE_KEY=<service role key>       ← OR use SUPABASE_SERVICE_ROLE_KEY
FRONTEND_URL=http://localhost:3000
GAMBIT_ENGINE_URL=http://127.0.0.1:8001
```

**IMPORTANT:**
- The Node server accepts EITHER `SUPABASE_SERVICE_KEY` OR `SUPABASE_SERVICE_ROLE_KEY` (falls back to second if first missing). See `server/supabase.js`.
- On startup the server logs which key it found: `[supabase] Using service key from SUPABASE_SERVICE_KEY`. If it logs `FATAL: Neither...`, ALL database writes will silently fail.
- `SUPABASE_SERVICE_ROLE_KEY` must NEVER be prefixed with `NEXT_PUBLIC_` — it would be exposed to the browser.

---

## 6. DATABASE SCHEMA

### Core tables (Supabase PostgreSQL)

**profiles**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | = auth.users.id |
| username | TEXT UNIQUE | Used in URLs, immutable after set |
| display_name | TEXT | Shown in UI, editable |
| avatar_url | TEXT | Supabase Storage URL |
| bio | TEXT | |
| country | TEXT | |
| rating_bullet | DECIMAL(5,2) | Default 1200 |
| rating_blitz | DECIMAL(5,2) | Default 1200 |
| rating_rapid | DECIMAL(5,2) | Default 1200 |
| rating_classical | DECIMAL(5,2) | Default 1200 |
| rating_rd | FLOAT | Glicko-2 Rating Deviation (optional, default 100) |
| rating_vol | FLOAT | Glicko-2 Volatility (optional, default 0.06) |
| games_played | INTEGER | Updated after every game |
| wins | INTEGER | |
| losses | INTEGER | |
| draws | INTEGER | |
| peak_bullet/blitz/rapid/classical | INT | Optional peak tracking |
| created_at | TIMESTAMPTZ | |

**games**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| white_id | UUID → profiles | |
| black_id | UUID → profiles | |
| time_control | TEXT | Minutes as string: "3", "10", "30" |
| increment | INTEGER | Seconds per move added |
| status | TEXT | `waiting` / `active` / `completed` |
| result | TEXT | `draw` / null |
| winner_id | UUID → profiles | null for draw |
| fen | TEXT | Current board position (updated on each move) |
| white_time_ms | INTEGER | Remaining ms for white (updated on each move) |
| black_time_ms | INTEGER | Remaining ms for black (updated on each move) |
| clock_deadline | TIMESTAMPTZ | Absolute time when current player's clock expires |
| is_rated | BOOLEAN | Default true for matchmaking, false for private |
| invite_token | VARCHAR(12) | For private games |
| invite_expires_at | TIMESTAMPTZ | |
| white_accuracy | DECIMAL | Set after engine analysis |
| black_accuracy | DECIMAL | |
| started_at | TIMESTAMPTZ | |
| ended_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

**Required SQL to run in Supabase SQL Editor (if not already done):**
```sql
-- Add clock persistence columns (REQUIRED for clock resume to work)
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS white_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS black_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS clock_deadline TIMESTAMPTZ;

-- Add fen column (REQUIRED for game resume to show correct board)
ALTER TABLE games ADD COLUMN IF NOT EXISTS fen TEXT;

-- Glicko-2 precision columns (OPTIONAL but recommended)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rating_rd FLOAT DEFAULT 100;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rating_vol FLOAT DEFAULT 0.06;

-- Peak rating columns (OPTIONAL)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS peak_bullet INT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS peak_blitz INT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS peak_rapid INT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS peak_classical INT;

-- is_rated flag (REQUIRED for rated/unrated distinction)
ALTER TABLE games ADD COLUMN IF NOT EXISTS is_rated BOOLEAN DEFAULT false;
```

**friendships**
```
id, requester_id, addressee_id, status (pending/accepted/declined), created_at, updated_at
UNIQUE(requester_id, addressee_id)
```

**notifications**
```
id, user_id, type, title, body, read (BOOLEAN), created_at
```

**RLS note:** All server-side code uses the SERVICE ROLE KEY which bypasses RLS entirely. RLS policies exist but only matter for direct browser → Supabase calls (which we avoid).

---

## 7. AUTH SYSTEM – CRITICAL READ

This is the most important section. Do not change how auth works without reading this.

### How auth works
1. User logs in → `POST /api/auth/login` → Next.js API route calls Supabase auth → Supabase sets HTTP-only cookie `sb-<ref>-auth-token` (may be chunked: `sb-<ref>-auth-token.0`, `.1`, `.2`...)
2. All server-side auth reads parse this cookie directly by:
   - Reading `sb-<ref>-auth-token` or assembling chunks `sb-<ref>-auth-token.0` through `.9`
   - JSON parsing the value
   - Extracting `access_token` (JWT)
   - Base64-decoding the JWT payload
   - Extracting `sub` (= userId)
3. There is NO Supabase Auth network call on the hot path. This is intentional for performance.

### Where this pattern lives
- `frontend/app/api/games/active/route.ts` — `getUserId()` function (canonical example)
- `frontend/app/api/profile/me/route.ts` — same pattern

### What NOT to do
- Do NOT call `supabase.auth.getUser()` in the browser to get the userId — it returns null when the session is in HTTP-only cookies only. Always use `/api/profile/me` to get the userId from the browser.
- Do NOT use `supabase.auth.getSession()` from a browser component to make auth decisions
- Do NOT store `userId` in React state from browser auth calls — use `/api/profile/me` or the `ProfileProvider` context

### After login
- Use `window.location.assign('/lobby')` NOT `router.push('/lobby')`. The push doesn't trigger a full page reload, so the cookie isn't re-read by the middleware. The `window.location.assign` forces a fresh load.

### Middleware
- `frontend/middleware.ts` — protects routes. Reads cookie, verifies token, redirects to `/login` if invalid.
- Protected routes: `/game/**, /lobby, /profile/**, /settings, /leaderboard, /challenge/**`

---

## 8. KEY FILES AND THEIR RESPONSIBILITIES

### `frontend/app/game/[id]/page.tsx` ← Most complex file (877+ lines)
This is the main game page. It manages:
- Board state via `chessRef` (chess.js Chess instance)
- `fen` state (current position string, drives board re-render)
- `fenSnapshots[]` — array of FEN strings for move history navigation
- `moveList[]` — array of SAN strings (e.g. "e4", "Nf3")
- `gameOver` state — set when game ends; triggers modal
- `viewIndex` — null = live position, number = viewing historical move
- `myColor` — 'white' | 'black' | 'spectator'
- Clock: `whiteTime`, `blackTime` (seconds remaining, for display)
- `gameDataRef` — ref that always has latest game data (avoids stale closure)

**Critical pattern — move commit flow:**
1. `commitMove(from, to, promotion)` — validates, updates `chessRef`, sets `fen`/`lastMove` locally for immediate visual feedback. Does NOT update `moveList` or `fenSnapshots`.
2. Emits `make_move` to server.
3. Server echoes `move_made` to ALL sockets in the room (including sender).
4. `onMoveMade` handler (runs for everyone) adds to `moveList` and `fenSnapshots`. This is the SINGLE source of truth for move history.

**Why this way:** Prevents double-entries. If `commitMove` also added to history, the sender would see every move twice.

**gameDataRef pattern:** `commitMove` is a `useCallback` with deps `[socket, params.id, myColor, soundOn]`. `gameData` is NOT in deps. Without the ref, `gameData` is always null in the closure → `game_end` emits with undefined player IDs → server skips stats update. The ref solves the stale closure problem.

### `server/server.js` ← Main server (everything in one file)
Contains:
- Express REST routes (health, matchmaking status, game creation, friends)
- Socket.io event handlers (authenticate, join_game, make_move, game_end, chat, rematch, challenge, disconnect)
- In-memory Maps: `userSockets`, `socketUsers`, `userActiveGame`, `disconnectTimers`, `gameClocks`
- `startClockTimer(gameId)` — starts/restarts the server-side clock timeout for a game

### `server/services/rating.js` ← Glicko-2 rating
- `processGameEnd(gameId, whiteId, blackId, result, timeControl, isRated)` — updates stats for all games, updates ratings for rated games only
- Rating change is CAPPED at ±50 per game
- Default RD is 100 (not 350) to prevent huge swings
- `result`: 'white' | 'black' | 'draw'

### `frontend/components/Navbar.tsx`
- Fetches `/api/profile/me` on mount to determine if user is logged in
- Shows skeleton while loading (prevents flash of login buttons)
- Online count via Supabase Realtime Presence on channel `gambit-online-users`
- Listens for `challenge_request` socket events and shows bottom-right toast

### `frontend/components/SocketProvider.tsx`
- Creates ONE socket.io connection at app level
- Emits `_reconnected` event when socket reconnects so game page can re-authenticate and rejoin

### `frontend/components/ProfileProvider.tsx`
- Fetches `/api/profile/me` once and shares via React context
- Prevents multiple components from independently calling `/api/profile/me`

---

## 9. DO NOT TOUCH – DANGER ZONES

### Never change these without reading the full auth section first:
- `frontend/middleware.ts` — changing protected route patterns will break auth
- `frontend/app/api/auth/login/route.ts` and `signup/route.ts` — changing how cookies are set will break all downstream auth reads
- The `getUserId()` cookie parsing function (in `active/route.ts`, `me/route.ts`) — this is fragile by design; Supabase's cookie format is proprietary

### Never remove `export const dynamic = 'force-dynamic'` from:
- `frontend/app/api/profile/[username]/route.ts`
- `frontend/app/api/profile/[username]/stats/route.ts`
- `frontend/app/api/profile/[username]/games/route.ts`
- `frontend/app/api/profile/me/route.ts`
- Any new profile/user API routes you create

**Why:** Without it, Next.js caches the response and the profile page shows stale data (e.g., 1200 rating after 4 games).

### Never use `supabase.auth.getUser()` in browser components
Use `fetch('/api/profile/me')` or the `useProfile()` context hook instead.

### Never add to `moveList` or `fenSnapshots` in `commitMove`
These must ONLY be updated in `onMoveMade`. Doing both causes every move to appear twice in the move list.

### Never use `router.push()` after login/signup
Use `window.location.assign()` instead. Full page reload required for cookie to propagate.

### Never set `SUPABASE_SERVICE_ROLE_KEY` as a `NEXT_PUBLIC_` env var
It would be exposed in the browser JavaScript bundle.

### Do not change `server/server.js` socket event handler names without updating the frontend
The frontend listens for exact event names: `move_made`, `game_end`, `rating_updated`, `chat_message`, `opponent_disconnected`, `opponent_reconnected`, `clock_sync`, `rematch_request`, `rematch_ready`, `rematch_declined`, `challenge_request`, `challenge_ready`, `challenge_declined`, `match_found`, `game_start`.

---

## 10. SAFE TO EDIT – COMMON CHANGE AREAS

| What you want to change | File(s) to edit |
|------------------------|----------------|
| UI styling / colors | `frontend/app/globals.css` (CSS vars), `tailwind.config.ts` |
| Add a new page | Create `frontend/app/<page-name>/page.tsx`, add to middleware.ts protected list if auth-required |
| Add a new API route | Create `frontend/app/api/<path>/route.ts`, add `export const dynamic = 'force-dynamic'` if it reads from DB |
| Change time control options | `frontend/app/lobby/page.tsx` → `BASE_TIME_CONTROLS` array |
| Change rating cap per game | `server/services/rating.js` → `const MAX_CHANGE = 50` |
| Change disconnect timeout | `server/server.js` → `const DISCONNECT_TIMEOUT_MS = 30000` |
| Add a new socket event | Add in `server/server.js` AND add listener in `frontend/app/game/[id]/page.tsx` socket useEffect |
| Board piece styling | `frontend/app/game/[id]/page.tsx` → `ChessBoard` component |
| Sound effects | `frontend/lib/sounds.ts` |
| Game-over modal | `frontend/app/game/[id]/page.tsx` → search for `showGameOverModal` |
| Profile fields | Update `profiles` table, then `frontend/app/settings/page.tsx`, `frontend/app/api/profile/me/route.ts` PATCH handler |
| Matchmaking rating range | `server/services/matchmaking.js` |

---

## 11. SOCKET EVENTS REFERENCE

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `authenticate` | `userId: string` | Link socket to userId. Must be called after connect and on reconnect. |
| `join_queue` | `{ user: {id, rating, games_played}, time_control, increment }` | Enter matchmaking |
| `leave_queue` | `userId: string` | Exit matchmaking |
| `join_game` | `gameId: string` | Join a game room. Server inits clock and sends clock_sync. |
| `spectate_game` | `gameId: string` | Join as spectator |
| `make_move` | `{ game_id, from, to, promotion, fen, san, captured }` | Submit a move |
| `send_message` | `{ game_id, from (username), text }` | Send chat message |
| `game_end` | `{ game_id, result, reason, white_id, black_id, is_rated, time_control }` | Report game over (checkmate/resign) |
| `rematch_request` | `{ from_user_id, to_user_id, time_control, is_rated, from_username }` | Ask for rematch |
| `rematch_accept` | `{ from_user_id, to_user_id, time_control, is_rated }` | Accept rematch |
| `rematch_decline` | `{ to_user_id }` | Decline rematch |
| `challenge_request` | `{ from_user_id, to_user_id, from_username, time_control, is_rated, color }` | Challenge a user |
| `challenge_accept` | `{ from_user_id, to_user_id, time_control, is_rated, color }` | Accept challenge |
| `challenge_decline` | `{ from_user_id, by_username }` | Decline challenge |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `match_found` | `{ id, white_id, black_id }` | Matchmaking found a game |
| `game_start` | `{ id, ...game }` | Private game started (second player joined) |
| `move_made` | `{ game_id, from, to, fen, san, captured, whiteMs, blackMs }` | Move broadcast to all in room |
| `game_end` | `{ game_id, result, reason, white_id, black_id }` | Game ended (can be server-initiated for time/disconnect) |
| `clock_sync` | `{ whiteMs, blackMs }` | Server sends current remaining times (on join or reconnect) |
| `rating_updated` | `{ white: {oldRating, newRating, change}, black: {...} }` | After rated game ends |
| `chat_message` | `{ game_id, from, text }` | Chat broadcast |
| `opponent_disconnected` | `{ userId, timeoutSeconds: 30 }` | Opponent lost connection |
| `opponent_reconnected` | `{ userId }` | Opponent reconnected within grace period |
| `rematch_request` | `{ from_user_id, from_username }` | Incoming rematch request |
| `rematch_ready` | `{ game_id }` | Rematch game created, both redirect |
| `rematch_declined` | `{}` | Opponent declined rematch |
| `challenge_request` | `{ from_user_id, from_username, time_control, is_rated, color }` | Incoming challenge |
| `challenge_ready` | `{ game_id }` | Challenge accepted, both redirect |
| `challenge_declined` | `{ by: username }` | Challenge declined |
| `_reconnected` | (none) | Custom event emitted by SocketProvider on reconnect |

---

## 12. RATING SYSTEM

**Algorithm:** Glicko-2 (via `glicko2` npm package)

**Time control → rating category:**
| Minutes | Category | Column |
|---------|---------|--------|
| ≤ 2 | Bullet | `rating_bullet` |
| ≤ 5 | Blitz | `rating_blitz` |
| ≤ 15 | Rapid | `rating_rapid` |
| > 15 | Classical | `rating_classical` |

**How it's called:**
```
server/server.js → game_end handler → ratingService.processGameEnd(gameId, whiteId, blackId, outcome, timeControl, isRated)
```

**Protections applied (to prevent huge swings):**
- Default RD (Rating Deviation) = 100, capped at max 150. (Supabase default was 350 which caused -279 rating changes.)
- Max change per game = ±50 regardless of Glicko-2 output.

**Stats (games_played, wins, losses, draws) update for ALL games** (rated and unrated).
**Rating columns update only for rated games** (`is_rated = true`).

**Idempotency:** The server's `game_end` DB update uses `.eq('status', 'active')` — only the first caller processes the game. If both players and the server clock all try to end the game simultaneously, only one succeeds.

---

## 13. CLOCK SYSTEM – HOW IT WORKS

This is the most complex part. Read carefully before touching it.

### Server-side clock (authoritative)
The server maintains a `gameClocks` Map in memory:
```js
gameClocks: Map<gameId, {
    whiteMs: number,      // remaining ms for white
    blackMs: number,      // remaining ms for black
    turn: 'w' | 'b',     // whose turn it is
    lastTick: number,     // Date.now() of last move or resume
    active: boolean,      // false = paused (disconnected player or pre-first-move)
    whiteId: string,
    blackId: string,
    isRated: boolean,
    timeControl: string,
    timerId: NodeJS.Timeout | null  // clearTimeout handle
}>
```

**Clock lifecycle:**
1. **Game created:** Clock is NOT started yet.
2. **First player joins** (`join_game`): Server loads game from DB, creates clock entry with full time, `active: false`.
3. **First move made** (`make_move`): Clock becomes `active: true`. Server starts `setTimeout` for current player's remaining time.
4. **Subsequent moves:** Server deducts elapsed time from mover, switches turn, restarts timer for new current player.
5. **Timer fires:** Server directly emits `game_end` to the game room, updates DB, processes ratings.
6. **Player disconnects:** Clock pauses (deducts elapsed, sets `active: false`, clears timer).
7. **Player reconnects** (within 30s): Clock resumes, timer restarts.
8. **Game ends** (any reason): Clock stopped, timer cleared, entry deleted from Map.

### DB persistence (survives server restart)
On every `make_move`, the server saves to the `games` row:
- `fen` — current board position
- `white_time_ms` / `black_time_ms` — remaining times
- `clock_deadline` — `NOW() + current_player_remaining_ms` (absolute wall-clock deadline)

On `join_game` if the game is NOT in `gameClocks` (server restarted):
1. Load from DB: `fen`, `white_time_ms`, `black_time_ms`, `clock_deadline`
2. Compute current player's real remaining = `Math.max(0, clock_deadline - Date.now())`
3. Restore clock and start timer immediately

### Frontend clock (display only)
The frontend has a `setInterval` that decrements the current player's display time by 1 every second. This is ONLY for smooth visual display. It does NOT trigger game end. The server is the sole authority on time expiry.

On `move_made`, the server includes `whiteMs` and `blackMs` in the broadcast. The frontend syncs its display from these values, so drift never accumulates.

On `clock_sync` event (sent when joining), the frontend immediately updates both times.

### Why client clock does NOT trigger game end
Before this fix, the client's `setInterval` called `setGameOver` when time reached 0. This meant:
- Only the player whose browser was running the expired clock saw the game end
- The other player never got notified
- Stats never updated

Now: server fires `game_end` to the entire game room — both players see it simultaneously.

---

## 14. GAME FLOW – END TO END

### Matchmaking game
1. Player A clicks "Play Online" → `join_queue` socket event with rating + time control
2. `MatchmakingService` finds Player B (within rating range, expands every 10s)
3. Server creates a game row in Supabase (`status: 'active'`)
4. Emits `match_found` to both players with game_id
5. Both browsers navigate to `/game/<id>`
6. Each browser loads game data via `GET /api/games/<id>`
7. Each browser emits `authenticate` + `join_game` via socket
8. Server sends `clock_sync` to each joining socket
9. White makes first move → clock starts

### Private game
1. Player A clicks "Play a Friend" → configures time/color/rated → "Generate Link"
2. `POST /api/games/private/create` on Node server → creates game row with invite_token
3. Player A gets invite link `/join/<token>`
4. Player B visits link → `POST /api/games/join/<token>` → sets black_id, status=active
5. Server emits `game_start` to the game room
6. Both redirect to `/game/<id>`

### Game end conditions
| Condition | Who detects | How |
|-----------|------------|-----|
| Checkmate / Stalemate | Frontend (chess.js) | `commitMove` calls `chess.isGameOver()`, emits `game_end` socket event |
| Resignation | Frontend | Resign button emits `game_end` with reason='Resignation' |
| Time expiry | Server | `startClockTimer` setTimeout fires, server emits `game_end` |
| Abandonment | Server | 30s disconnect timer fires, server emits `game_end` |

After `game_end` is emitted (by whoever), the server:
1. Idempotently updates `games` row: `status=completed`, `winner_id`, `ended_at` (`.eq('status', 'active')` guard prevents double processing)
2. Calls `ratingService.processGameEnd` → updates profiles
3. Emits `rating_updated` to the game room

---

## 15. COMMON BUGS AND THEIR ROOT CAUSES

Study these before debugging anything. Most bugs recur.

### "Stats show 0 / rating not updating"
**Root cause A:** `gameData` was null in `commitMove` closure (stale capture). `game_end` emitted with `white_id: undefined`. Server's guard `if (!data.white_id || !data.black_id) return` skips everything.
**Fix:** Use `gameDataRef.current` in `commitMove` instead of `gameData`.

**Root cause B:** `SUPABASE_SERVICE_KEY` env var not set on Node server. All profile UPDATEs silently fail.
**Fix:** Check server startup logs for `[supabase]` lines. Must see "Using service key from...".

### "Double moves in move list"
**Root cause:** `commitMove` added to `moveList`/`fenSnapshots` locally AND `onMoveMade` added again when server echoed the move back.
**Fix:** Only add in `onMoveMade`. Never in `commitMove`.

### "Only one player sees game over"
**Root cause:** Client-side `setInterval` called `setGameOver` locally without emitting `game_end` to server. Other player never notified.
**Fix:** Server-side clock timer emits `game_end` to entire room. Client clock is display-only.

### "Clock resets on rejoin / game restarts"
**Root cause A:** Game page always called `setWhiteTime(mins * 60)` on load, regardless of whether game was in progress.
**Fix:** Check if `gd.fen` differs from starting position (`isResume`). Skip clock preset and start sound if resuming.

**Root cause B:** Server `gameClocks` is in-memory. Server restart clears it.
**Fix:** Persist `white_time_ms`, `black_time_ms`, `clock_deadline` to DB on every move. Restore from DB on `join_game`.

### "Profile shows stale rating (1200) even after games played"
**Root cause:** Next.js caches API route responses. Profile page kept serving the cached 1200 response.
**Fix:** Add `export const dynamic = 'force-dynamic'` to all profile API routes. Add `{ cache: 'no-store' }` to all `fetch()` calls in profile page.

### "Double chat messages"
**Root cause:** `sendChat` called `setChatLog` locally AND the server broadcast `chat_message` back to sender, adding it again.
**Fix:** Remove local `setChatLog` from `sendChat`. Server echo is the single source of truth.

### "Lobby: private game returns 400 / userId null"
**Root cause:** `supabase.auth.getUser()` in browser returns null when session is HTTP-only cookie.
**Fix:** Fetch userId via `fetch('/api/profile/me')` instead.

### "Rating changed by -249 or +300"
**Root cause:** Glicko-2 with RD=350 (maximum uncertainty) causes huge rating changes.
**Fix:** Cap RD at 150 (default 100), cap change at ±50 per game in `rating.js`.

### "Auth flash: login buttons briefly show for logged-in users"
**Root cause:** `user = null` on mount, async profile fetch takes ~200ms.
**Fix:** `authLoading = true` on mount, show skeleton div instead of login buttons until fetch resolves.

### "router.push('/lobby') doesn't work after login"
**Root cause:** `router.push` doesn't trigger full page reload, so middleware doesn't re-read the new cookie.
**Fix:** `window.location.assign('/lobby')`.

---

## 16. LOGIC DECISIONS MADE AND WHY

### Why HTTP-only cookies instead of localStorage for auth?
Supabase sets the session as HTTP-only by default when using SSR package. This is more secure (XSS can't steal the token). The tradeoff is that the browser can't read it — all auth must go through server-side API routes.

### Why parse the cookie manually instead of using Supabase's SSR client?
`createServerClient` from `@supabase/ssr` requires cookie getter/setter functions and makes a network call to validate. For high-frequency API routes (e.g., `/api/profile/me` called on every navbar render), we just decode the JWT locally without a network round-trip.

### Why is `server.js` one big file?
It was built iteratively. Refactoring into separate files is a future task. Don't split it without testing every socket event.

### Why does `commitMove` NOT update moveList/fenSnapshots?
Because the server echoes `move_made` back to the sender. If we added locally in `commitMove` AND in `onMoveMade`, every move would appear twice. The server echo is the single source of truth.

### Why is the server clock authoritative (not client)?
A client clock can only notify itself. When white's time expires on white's browser, the `setGameOver` call only affects white's UI. Black's browser doesn't know. The server clock fires `io.to(room).emit('game_end', ...)` — both players get it simultaneously.

### Why persist clock to DB on every move?
The Node server is in-memory. If it restarts mid-game, `gameClocks` is empty. Without DB persistence, rejoining would reset clocks to full time. The `clock_deadline` (absolute wall-clock timestamp) lets the server compute true remaining time after a restart.

### Why cap rating change at ±50?
The Glicko-2 default RD of 350 means the algorithm has maximum uncertainty, causing ±200 swings per game. For a chess platform with many games per day, this makes ratings meaningless. Capping at ±50 keeps ratings stable while still reflecting performance.

### Why `export const dynamic = 'force-dynamic'` on profile API routes?
Next.js 14 statically renders route handlers that don't use dynamic features. A GET route that queries Supabase but doesn't use `cookies()` or `headers()` would be rendered once and cached forever. The profile would show 1200 rating even after 100 games.

### Why `window.location.assign` instead of `router.push` after login?
Next.js `router.push` is client-side navigation — it doesn't re-run middleware. The auth cookie is set by the server, but middleware only runs on full page requests. `window.location.assign` triggers a full page load, middleware runs, the user is recognized as authenticated.

---

## 17. PENDING TODOs

### Critical / Must be done
- [ ] **Run the clock persistence SQL** (see Section 6) — without this, clocks reset on server restart
- [ ] **Create `avatars` storage bucket in Supabase** (Storage → New Bucket → name: `avatars`, Public: true) — avatar upload silently fails without it
- [ ] **Run Glicko-2 column migration** — `rating_rd` and `rating_vol` columns improve rating calculation accuracy

### High priority
- [ ] **Peak rating tracking** — store when a player's rating exceeds their previous peak; add `peak_<category>` update logic in `rating.js`
- [ ] **Game analysis persistence** — save Stockfish analysis results to `white_accuracy`/`black_accuracy` columns; currently only computed live
- [ ] **Move table** — save individual moves to the `moves` table during play for full game replay from DB (currently, move history is in-memory only and lost on page refresh)
- [ ] **PGN export** — generate PGN string from move list; add download button on game-over modal

### Medium priority
- [ ] **Rematch with same settings** — currently always creates a new random-color game; should offer same settings as original game
- [ ] **Spectator mode** — socket join works but no UI for spectators
- [ ] **Daily games** — time control card exists in lobby but logic not implemented (1440 min games need persistent turn tracking)
- [ ] **Offline challenge notifications** — challenges only work if recipient has socket connected; no push notification for offline users
- [ ] **Board themes** — add alternative piece/board color themes
- [ ] **Pre-moves** — allow move input while opponent is thinking

### Low priority / Nice to have
- [ ] **Tournament system** — bracket management, round-robin support
- [ ] **Puzzles** — daily chess puzzle mode
- [ ] **Openings database** — show opening name when player enters known opening lines
- [ ] **Game search / filter** — filter profile game history by color, result, time control

### Infrastructure
- [ ] **Split `server.js`** into separate route files — it's getting long
- [ ] **Add server-side move validation** — currently server trusts client's move; should validate with chess.js server-side to prevent cheating
- [ ] **Rate limiting** on API routes — prevent abuse
- [ ] **Google OAuth** — route exists at `/auth/callback` but Google provider must be enabled in Supabase dashboard

---

## 18. DEPLOYMENT

### Frontend → Vercel
- `frontend/` is deployed to Vercel
- All `NEXT_PUBLIC_*` and `SUPABASE_SERVICE_ROLE_KEY` must be set in Vercel dashboard → Project → Settings → Environment Variables
- `NEXT_PUBLIC_SOCKET_URL` must point to the Railway URL in production (not localhost)

### Backend → Railway
- `server/` is deployed to Railway
- `server/.env` vars must be set in Railway dashboard
- `FRONTEND_URL` must be set to the Vercel domain for CORS

### Chess Engine → Render
- `chess-engine/` is deployed to Render
- `GAMBIT_ENGINE_URL` on the Node server must point to the Render URL

### `vercel.json` notes
- The root `vercel.json` handles routing if needed
- The frontend `next.config.js` (if it exists) may have rewrites

### Important: CORS
The Node server's CORS whitelist is in `server/server.js`:
```js
origin: ['http://localhost:3000', 'http://127.0.0.1:3000', process.env.FRONTEND_URL]
```
When deploying, `FRONTEND_URL` must be the exact Vercel domain (e.g. `https://gambit.vercel.app`).

---

## QUICK REFERENCE CARD

```
START:
  Terminal 1: cd frontend && npm run dev          (port 3000)
  Terminal 2: cd server && npm run dev            (port 3001)
  Terminal 3: cd chess-engine && uvicorn main:app --port 8001 (optional)

CHECK HEALTH:
  http://localhost:3001/api/health → {"status":"ok"}

KEY ENV VARS TO VERIFY:
  frontend/.env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SOCKET_URL
  server/.env: SUPABASE_URL, SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY), FRONTEND_URL

IF STATS AREN'T UPDATING:
  1. Check server logs for "[supabase] Using service key from..." line
  2. Check game_end is being emitted with white_id AND black_id (not undefined)
  3. Check gameDataRef.current is set in game page before game ends

IF PROFILE SHOWS STALE DATA:
  Check: export const dynamic = 'force-dynamic' is in the API route file
  Check: fetch() calls use { cache: 'no-store' }

IF CLOCK RESETS ON REJOIN:
  Run the SQL: ALTER TABLE games ADD COLUMN IF NOT EXISTS white_time_ms INTEGER, ...
  Check server logs for clock_deadline being saved

IF DOUBLE MOVES IN LIST:
  commitMove must NOT call setFenSnapshots or setMoveList
  Only onMoveMade should add to those arrays

TYPE CHECK:
  cd frontend && npx tsc --noEmit    (should produce no output = clean)
```
