# Redis Game State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-memory `gameClocks` Map with Redis-backed game state so that game position, clocks, and move history survive server restarts and are perfectly synced between players.

**Architecture:** Redis stores each active game as a JSON blob (`game:{id}`) with a 24-hour TTL. A single global 1-second ticker replaces per-game `setInterval` timers; it reads all active game IDs from a Redis Set, decrements the active player's clock, and emits `clock_sync` to all clients in the game room. When a player joins or reconnects, the server emits `game_state_sync` with the full FEN + move log + clocks from Redis — eliminating all five refresh/sync bugs. Supabase continues to store permanent records (games, moves, ratings). In-memory Maps (`userSockets`, `socketUsers`, `userActiveGame`) stay in memory since they are transient per-process state.

**Tech Stack:** Node.js, ioredis, socket.io, @supabase/supabase-js, Next.js 14, TypeScript

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| CREATE | `server/lib/redis.js` | ioredis client singleton |
| CREATE | `server/lib/gameStore.js` | All Redis get/set/update/delete ops for game state |
| CREATE | `server/services/clock.js` | Single global 1-second clock ticker |
| MODIFY | `server/services/matchmaking.js` | Write game state to Redis after creating a matched game |
| MODIFY | `server/services/friends.js` | Write game state to Redis after creating/joining private game |
| MODIFY | `server/server.js` | Rewrite join_game, make_move, disconnect, authenticate handlers; fix missing `await requireUserId`; start global clock |
| CREATE | `server/__tests__/gameStore.test.js` | Unit tests for Redis game store |
| MODIFY | `frontend/app/game/[id]/page.tsx` | Consume `game_state_sync`; replace local countdown with server-authoritative clock |
| MODIFY | `frontend/app/lobby/page.tsx` | Fix presence: add `join`/`leave` handlers, `untrack` on cleanup |
| MODIFY | `frontend/components/Navbar.tsx` | Same presence fix |

---

## Task 1: Fix Critical Auth Bug (missing `await`)

**Files:**
- Modify: `server/server.js` (friend + notification endpoints, ~lines 244–378)

`requireUserId` is `async` but every friend/notification endpoint calls it without `await`. Each `if (!meId) return` check passes because a Promise is truthy. All Supabase queries then receive a Promise object as the user ID and silently fail or return empty.

- [ ] **Step 1: Fix all missing `await` in one replace-all**

In `server/server.js`, replace every occurrence of:
```js
const meId = requireUserId(req, res); if (!meId) return;
```
with:
```js
const meId = await requireUserId(req, res); if (!meId) return;
```

There are exactly 10 occurrences (friends status, request, list, accept, delete, pending, decline, notifications get, notification read, read-all). Verify with:
```bash
grep -n "const meId = requireUserId" server/server.js
```
Expected: 0 matches (all fixed).

- [ ] **Step 2: Verify the fix**

```bash
grep -n "requireUserId" "/Users/chidanandh/desktop/Python Folders/Chess/Chess/Gambit/server/server.js"
```
Expected: every line containing `requireUserId` should also contain `await`.

- [ ] **Step 3: Commit**

```bash
cd "/Users/chidanandh/desktop/Python Folders/Chess/Chess/Gambit"
git add server/server.js
git commit -m "fix: add missing await to requireUserId in all friend/notification endpoints"
```

---

## Task 2: Install ioredis and Create Redis Client

**Files:**
- Create: `server/lib/redis.js`
- Modify: `server/package.json`

- [ ] **Step 1: Install ioredis**

```bash
cd "/Users/chidanandh/desktop/Python Folders/Chess/Chess/Gambit/server"
npm install ioredis
```

Expected: `ioredis` appears in `package.json` dependencies.

- [ ] **Step 2: Create `server/lib/redis.js`**

```js
const Redis = require('ioredis')

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    retryStrategy: (times) => {
        if (times > 3) {
            console.error('[Redis] Connection failed after 3 retries — game state will fall back to in-memory')
            return null
        }
        return Math.min(times * 200, 2000)
    },
    lazyConnect: true,
    maxRetriesPerRequest: 2,
})

redis.on('connect', () => console.log('[Redis] Connected'))
redis.on('error', (err) => console.error('[Redis] Error:', err.message))

module.exports = redis
```

- [ ] **Step 3: Add `REDIS_URL` to `.env`**

Open `server/.env` and add (if not present):
```
REDIS_URL=redis://127.0.0.1:6379
```

- [ ] **Step 4: Verify Redis is running locally**

```bash
redis-cli ping
```
Expected: `PONG`

If Redis is not installed:
- Mac: `brew install redis && brew services start redis`
- Linux: `sudo apt install redis-server && sudo service redis start`

- [ ] **Step 5: Commit**

```bash
cd "/Users/chidanandh/desktop/Python Folders/Chess/Chess/Gambit"
git add server/lib/redis.js server/package.json server/package-lock.json
git commit -m "feat: add ioredis client with retry strategy"
```

---

## Task 3: Create Redis Game Store

**Files:**
- Create: `server/lib/gameStore.js`
- Create: `server/__tests__/gameStore.test.js`

The game state schema stored in Redis:
```js
{
  id: string,
  fen: string,                  // current board FEN
  whiteId: string,
  blackId: string,
  whiteClockMs: number,         // remaining time in ms
  blackClockMs: number,
  activeSide: 'w' | 'b',       // whose clock is running
  status: 'active' | 'completed',
  result: 'white' | 'black' | 'draw' | null,
  reason: string | null,
  moveLog: Array<{san, uci, fenAfter, whiteClockMs, blackClockMs, timestamp}>,
  timeControl: string,          // e.g. "10" or "5+3"
  incrementMs: number,          // increment in ms
  isRated: boolean,
  lastMoveAt: number,           // Date.now() when last move was made (null = clock not started)
  disconnectInfo: {             // null when both connected
    userId: string,
    side: 'white' | 'black',
    at: number                  // Date.now() of disconnect
  } | null,
}
```

- [ ] **Step 1: Write failing tests for gameStore**

Create `server/__tests__/gameStore.test.js`:

```js
/**
 * Tests for Redis game store operations.
 * Redis is mocked via jest.mock so no running Redis needed.
 */
jest.mock('../lib/redis', () => {
    const store = new Map()
    return {
        setex: jest.fn((key, _ttl, val) => { store.set(key, val); return Promise.resolve('OK') }),
        get: jest.fn((key) => Promise.resolve(store.get(key) ?? null)),
        del: jest.fn((key) => { store.delete(key); return Promise.resolve(1) }),
        smembers: jest.fn(() => Promise.resolve([])),
        sadd: jest.fn(() => Promise.resolve(1)),
        srem: jest.fn(() => Promise.resolve(1)),
        on: jest.fn(),
    }
})

const { getGame, setGame, updateGame, deleteGame, addActiveGame, removeActiveGame, getActiveGameIds } = require('../lib/gameStore')

const SAMPLE_GAME = {
    id: 'abc123',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    whiteId: 'user-w',
    blackId: 'user-b',
    whiteClockMs: 600000,
    blackClockMs: 600000,
    activeSide: 'w',
    status: 'active',
    result: null,
    reason: null,
    moveLog: [],
    timeControl: '10',
    incrementMs: 0,
    isRated: true,
    lastMoveAt: null,
    disconnectInfo: null,
}

test('setGame stores and getGame retrieves', async () => {
    await setGame('abc123', SAMPLE_GAME)
    const game = await getGame('abc123')
    expect(game).toMatchObject({ id: 'abc123', whiteId: 'user-w' })
})

test('getGame returns null for missing key', async () => {
    const game = await getGame('nonexistent')
    expect(game).toBeNull()
})

test('updateGame merges partial update', async () => {
    await setGame('abc123', SAMPLE_GAME)
    const updated = await updateGame('abc123', { whiteClockMs: 550000 })
    expect(updated.whiteClockMs).toBe(550000)
    expect(updated.blackClockMs).toBe(600000) // unchanged
})

test('deleteGame removes key', async () => {
    await setGame('abc123', SAMPLE_GAME)
    await deleteGame('abc123')
    const game = await getGame('abc123')
    expect(game).toBeNull()
})

test('addActiveGame / getActiveGameIds / removeActiveGame', async () => {
    const redis = require('../lib/redis')
    redis.smembers.mockResolvedValueOnce(['game1', 'game2'])
    await addActiveGame('game1')
    const ids = await getActiveGameIds()
    expect(ids).toContain('game1')
    await removeActiveGame('game1')
    expect(redis.srem).toHaveBeenCalledWith('active_games', 'game1')
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd "/Users/chidanandh/desktop/Python Folders/Chess/Chess/Gambit/server"
npx jest __tests__/gameStore.test.js --no-coverage 2>&1 | tail -15
```
Expected: `Cannot find module '../lib/gameStore'`

- [ ] **Step 3: Create `server/lib/gameStore.js`**

```js
const redis = require('./redis')

const GAME_TTL = 86400 // 24 hours in seconds
const ACTIVE_SET = 'active_games'

function gameKey(gameId) { return `game:${gameId}` }

async function getGame(gameId) {
    const raw = await redis.get(gameKey(gameId))
    if (!raw) return null
    return JSON.parse(raw)
}

async function setGame(gameId, game) {
    await redis.setex(gameKey(gameId), GAME_TTL, JSON.stringify(game))
    return game
}

async function updateGame(gameId, updates) {
    const game = await getGame(gameId)
    if (!game) throw new Error(`Game ${gameId} not found in Redis`)
    const updated = { ...game, ...updates }
    await setGame(gameId, updated)
    return updated
}

async function deleteGame(gameId) {
    await redis.del(gameKey(gameId))
}

async function addActiveGame(gameId) {
    await redis.sadd(ACTIVE_SET, gameId)
}

async function removeActiveGame(gameId) {
    await redis.srem(ACTIVE_SET, gameId)
}

async function getActiveGameIds() {
    return redis.smembers(ACTIVE_SET)
}

module.exports = { getGame, setGame, updateGame, deleteGame, addActiveGame, removeActiveGame, getActiveGameIds }
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd "/Users/chidanandh/desktop/Python Folders/Chess/Chess/Gambit/server"
npx jest __tests__/gameStore.test.js --no-coverage 2>&1 | tail -15
```
Expected: `Tests: 5 passed, 5 total`

- [ ] **Step 5: Commit**

```bash
cd "/Users/chidanandh/desktop/Python Folders/Chess/Chess/Gambit"
git add server/lib/gameStore.js server/__tests__/gameStore.test.js
git commit -m "feat: add Redis game store with get/set/update/delete and active game set"
```

---

## Task 4: Create Global Clock Ticker

**Files:**
- Create: `server/services/clock.js`

This replaces all per-game `setInterval` and `setTimeout` clock logic in `server.js`. A single `setInterval` runs every 1 second. It reads all active game IDs from the Redis Set, loads each game, computes the exact elapsed time since `lastMoveAt`, and deducts it. Expired clocks trigger game-over.

- [ ] **Step 1: Create `server/services/clock.js`**

```js
const { getGame, setGame, getActiveGameIds, removeActiveGame } = require('../lib/gameStore')
const { supabase } = require('../supabase')

let globalTicker = null

function parseIncrement(timeControl) {
    const parts = String(timeControl || '0').split('+')
    return (parseInt(parts[1]) || 0) * 1000
}

/**
 * Finalizes a game that ended by clock expiry or abandonment.
 * Updates Supabase and emits rating_updated.
 */
async function finalizeExpiredGame(io, gameId, game, winnerId, loserId, reason) {
    const outcome = winnerId === game.whiteId ? 'white' : 'black'

    // Idempotent update
    const { data: updated } = await supabase.from('games')
        .update({
            status: 'completed',
            winner_id: winnerId,
            ended_at: new Date().toISOString(),
        })
        .eq('id', gameId)
        .eq('status', 'active')
        .select('id')
        .maybeSingle()

    if (!updated) return // already finalized

    try {
        const ratingService = require('./rating')
        const changes = await ratingService.processGameEnd(
            gameId, game.whiteId, game.blackId, outcome, game.timeControl, game.isRated
        )
        if (changes) io.to(`game_${gameId}`).emit('rating_updated', changes)
    } catch (e) {
        console.error('[clock] rating error:', e.message)
    }
}

function startGlobalClock(io) {
    if (globalTicker) return

    globalTicker = setInterval(async () => {
        try {
            const gameIds = await getActiveGameIds()
            if (!gameIds.length) return

            await Promise.all(gameIds.map(async (gameId) => {
                try {
                    const game = await getGame(gameId)
                    if (!game || game.status !== 'active' || !game.lastMoveAt) return

                    const now = Date.now()
                    const elapsed = now - game.lastMoveAt
                    const side = game.activeSide

                    const remaining = side === 'w'
                        ? Math.max(0, game.whiteClockMs - elapsed)
                        : Math.max(0, game.blackClockMs - elapsed)

                    const wMs = side === 'w' ? remaining : game.whiteClockMs
                    const bMs = side === 'b' ? remaining : game.blackClockMs

                    // Broadcast live times to both players
                    io.to(`game_${gameId}`).emit('clock_sync', {
                        whiteMs: wMs,
                        blackMs: bMs,
                        serverTimestamp: now,
                    })

                    // Check disconnect grace period (20 seconds)
                    if (game.disconnectInfo) {
                        const disconnectElapsed = now - game.disconnectInfo.at
                        if (disconnectElapsed >= 20000) {
                            // Grace period expired
                            const loserSide = game.disconnectInfo.side
                            const loserId = loserSide === 'white' ? game.whiteId : game.blackId
                            const winnerId = loserSide === 'white' ? game.blackId : game.whiteId
                            const result = loserSide === 'white' ? 'Black wins' : 'White wins'

                            await setGame(gameId, { ...game, status: 'completed', result: loserSide === 'white' ? 'black' : 'white', reason: 'abandonment' })
                            await removeActiveGame(gameId)

                            io.to(`game_${gameId}`).emit('game_end', {
                                game_id: gameId, result, reason: 'Abandonment',
                                white_id: game.whiteId, black_id: game.blackId,
                            })
                            await finalizeExpiredGame(io, gameId, game, winnerId, loserId, 'abandonment')
                        }
                        // Clock is paused during disconnect — don't check timeout
                        return
                    }

                    // Check clock timeout
                    if (remaining <= 0) {
                        const loserIsWhite = side === 'w'
                        const loserId = loserIsWhite ? game.whiteId : game.blackId
                        const winnerId = loserIsWhite ? game.blackId : game.whiteId
                        const result = loserIsWhite ? 'Black wins' : 'White wins'

                        await setGame(gameId, { ...game, status: 'completed', result: loserIsWhite ? 'black' : 'white', reason: 'time' })
                        await removeActiveGame(gameId)

                        io.to(`game_${gameId}`).emit('game_end', {
                            game_id: gameId, result, reason: 'Time',
                            white_id: game.whiteId, black_id: game.blackId,
                            is_rated: game.isRated, time_control: game.timeControl,
                        })
                        await finalizeExpiredGame(io, gameId, game, winnerId, loserId, 'time')
                    }
                } catch (e) {
                    console.error(`[clock] game ${gameId} error:`, e.message)
                }
            }))
        } catch (e) {
            console.error('[clock] ticker error:', e.message)
        }
    }, 1000)

    console.log('[Clock] Global ticker started')
}

function stopGlobalClock() {
    if (globalTicker) {
        clearInterval(globalTicker)
        globalTicker = null
    }
}

module.exports = { startGlobalClock, stopGlobalClock, finalizeExpiredGame, parseIncrement }
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/chidanandh/desktop/Python Folders/Chess/Chess/Gambit"
git add server/services/clock.js
git commit -m "feat: add global 1-second clock ticker with disconnect grace period and timeout handling"
```

---

## Task 5: Update Matchmaking to Write Game State to Redis

**Files:**
- Modify: `server/services/matchmaking.js`

After creating a game in Supabase, also write the initial game state to Redis so `join_game` can load it immediately.

- [ ] **Step 1: Rewrite `createGame` in `server/services/matchmaking.js`**

Replace the entire `createGame` method (lines 110–132):

```js
async createGame(p1, p2) {
    this.queue.delete(p1.user_id);
    this.queue.delete(p2.user_id);

    let white, black;
    if (Math.random() > 0.5) { white = p1; black = p2; }
    else { white = p2; black = p1; }

    const { data, error } = await supabase.from('games').insert({
        white_id: white.user_id,
        black_id: black.user_id,
        time_control: p1.time_control,
        increment: p1.increment,
        status: 'active',
        started_at: new Date().toISOString()
    }).select().single();

    if (error || !data) {
        console.error('[matchmaking] createGame error:', error?.message)
        return
    }

    const { parseIncrement } = require('./clock')
    const { setGame, addActiveGame } = require('../lib/gameStore')
    const mins = parseInt(p1.time_control) || 10
    const clockMs = mins * 60 * 1000
    const incrementMs = parseIncrement(p1.time_control)

    const gameState = {
        id: data.id,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        whiteId: white.user_id,
        blackId: black.user_id,
        whiteClockMs: clockMs,
        blackClockMs: clockMs,
        activeSide: 'w',
        status: 'active',
        result: null,
        reason: null,
        moveLog: [],
        timeControl: p1.time_control,
        incrementMs,
        isRated: true,
        lastMoveAt: null, // clock starts on first move
        disconnectInfo: null,
    }

    await setGame(data.id, gameState)
    await addActiveGame(data.id)

    this.io.to(white.socketId).emit('match_found', { ...data, color: 'white', opponent: black });
    this.io.to(black.socketId).emit('match_found', { ...data, color: 'black', opponent: white });
}
```

Also add the require at the top of the file (after line 2):
```js
// (these are required lazily inside createGame to avoid circular deps)
```
No top-level require needed since we use lazy requires inside the method.

- [ ] **Step 2: Commit**

```bash
cd "/Users/chidanandh/desktop/Python Folders/Chess/Chess/Gambit"
git add server/services/matchmaking.js
git commit -m "feat: write initial game state to Redis after matchmaking creates a game"
```

---

## Task 6: Update Private Game Creation to Write to Redis

**Files:**
- Modify: `server/services/friends.js`

- [ ] **Step 1: Update `joinPrivateGame` in `server/services/friends.js`**

Add the Redis write after the Supabase update (replace the return at the end of `joinPrivateGame`):

```js
async joinPrivateGame(token, userId) {
    const game = await this.getGameByToken(token);
    if (!game) throw new Error('Invalid or expired token');

    let white_id = game.white_id;
    let black_id = game.black_id;

    if (white_id && white_id === userId) return game;
    if (black_id && black_id === userId) return game;

    if (white_id && !black_id) black_id = userId;
    else if (black_id && !white_id) white_id = userId;

    const { data, error } = await supabase.from('games').update({
        white_id,
        black_id,
        status: 'active',
        started_at: new Date().toISOString()
    }).eq('id', game.id).eq('status', 'waiting').select().maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Game already started or not found');

    // Write initial game state to Redis now that both players are set
    const { setGame, addActiveGame } = require('../lib/gameStore')
    const { parseIncrement } = require('./clock')
    const mins = parseInt(data.time_control) || 10
    const clockMs = mins * 60 * 1000

    const gameState = {
        id: data.id,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        whiteId: data.white_id,
        blackId: data.black_id,
        whiteClockMs: clockMs,
        blackClockMs: clockMs,
        activeSide: 'w',
        status: 'active',
        result: null,
        reason: null,
        moveLog: [],
        timeControl: data.time_control,
        incrementMs: parseIncrement(data.time_control),
        isRated: data.is_rated ?? false,
        lastMoveAt: null,
        disconnectInfo: null,
    }

    await setGame(data.id, gameState)
    await addActiveGame(data.id)

    return data;
}
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/chidanandh/desktop/Python Folders/Chess/Chess/Gambit"
git add server/services/friends.js
git commit -m "feat: write game state to Redis after private game is joined"
```

---

## Task 7: Rewrite `server/server.js` — join_game, make_move, disconnect, authenticate

**Files:**
- Modify: `server/server.js`

This is the largest change. We replace the `gameClocks` Map with Redis calls, remove per-game timers, and emit `game_state_sync` on every join/reconnect.

**Step overview:**
1. Remove `gameClocks` Map and `parseIncrement` function (moved to `clock.js`)
2. Add requires for `gameStore` and `clock`
3. Start global clock after `io` is created
4. Rewrite `join_game` handler
5. Rewrite `authenticate` handler (reconnect path)
6. Rewrite `make_move` handler
7. Rewrite `disconnect` handler
8. Rewrite `game_end` handler

- [ ] **Step 1: Replace imports and initialization block at top of server.js**

Find the block from line 1 through line 44 (the `const DISCONNECT_TIMEOUT_MS = 20000` line). Replace it with:

```js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const MatchmakingService = require('./services/matchmaking');
const friendsService = require('./services/friends');
const ratingService = require('./services/rating');
const { supabase } = require('./supabase');
const { getGame, setGame, updateGame, deleteGame, addActiveGame, removeActiveGame } = require('./lib/gameStore');
const { startGlobalClock, parseIncrement } = require('./services/clock');

const app = express();
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true
}));
app.use(express.json());

const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: process.env.FRONTEND_URL || '*' } });

const matchmaking = new MatchmakingService(io);

// Start single global clock ticker (replaces per-game setInterval)
startGlobalClock(io);

// Track authenticated userId → current socketId for reconnect support
const userSockets = new Map();
// socketId → userId (reverse lookup for disconnect)
const socketUsers = new Map();
// userId → gameId for currently active games
const userActiveGame = new Map();
```

- [ ] **Step 2: Rewrite `join_game` socket handler**

Find the entire `socket.on('join_game', async (gameId) => {` block (lines 422–477) and replace it:

```js
socket.on('join_game', async (gameId) => {
    socket.join(`game_${gameId}`);
    const userId = socketUsers.get(socket.id);
    if (userId) userActiveGame.set(userId, gameId);

    // Load game state from Redis
    let game = await getGame(gameId);

    // If not in Redis (server restart), try to restore from Supabase
    if (!game) {
        const { data: dbGame } = await supabase
            .from('games')
            .select('id, status, white_id, black_id, is_rated, time_control, fen, white_time_ms, black_time_ms, clock_deadline')
            .eq('id', gameId)
            .maybeSingle();

        if (dbGame && dbGame.status === 'active') {
            const mins = parseInt(dbGame.time_control) || 10;
            const totalMs = mins * 60 * 1000;
            let whiteClockMs = dbGame.white_time_ms ?? totalMs;
            let blackClockMs = dbGame.black_time_ms ?? totalMs;
            const fenTurn = dbGame.fen ? (dbGame.fen.split(' ')[1] ?? 'w') : 'w';

            if (dbGame.clock_deadline) {
                const remaining = Math.max(0, new Date(dbGame.clock_deadline).getTime() - Date.now());
                if (fenTurn === 'w') whiteClockMs = remaining;
                else blackClockMs = remaining;
            }

            const hasStarted = dbGame.white_time_ms !== null || dbGame.white_time_ms !== null;
            game = {
                id: gameId,
                fen: dbGame.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                whiteId: dbGame.white_id,
                blackId: dbGame.black_id,
                whiteClockMs,
                blackClockMs,
                activeSide: fenTurn,
                status: 'active',
                result: null,
                reason: null,
                moveLog: [],
                timeControl: dbGame.time_control ?? '10',
                incrementMs: parseIncrement(dbGame.time_control),
                isRated: dbGame.is_rated ?? false,
                lastMoveAt: hasStarted ? Date.now() : null,
                disconnectInfo: null,
            };
            await setGame(gameId, game);
            await addActiveGame(gameId);
        } else if (dbGame && dbGame.status === 'completed') {
            // Game already over — send final state so client shows result
            const outcome = dbGame.winner_id === dbGame.white_id ? 'white'
                : dbGame.winner_id === dbGame.black_id ? 'black' : 'draw';
            const result = outcome === 'white' ? 'White wins' : outcome === 'black' ? 'Black wins' : 'Draw';
            socket.emit('game_end', {
                game_id: gameId, result, reason: dbGame.end_reason || 'Game over',
                white_id: dbGame.white_id, black_id: dbGame.black_id,
            });
            return;
        }
    }

    if (!game) return; // game not found — client will be redirected

    // Compute exact remaining times (elapsed since lastMoveAt)
    const elapsed = (game.status === 'active' && game.lastMoveAt && !game.disconnectInfo)
        ? Date.now() - game.lastMoveAt : 0;
    const wMs = game.activeSide === 'w' ? Math.max(0, game.whiteClockMs - elapsed) : game.whiteClockMs;
    const bMs = game.activeSide === 'b' ? Math.max(0, game.blackClockMs - elapsed) : game.blackClockMs;

    // Send full game state to this specific joining socket
    socket.emit('game_state_sync', {
        fen: game.fen,
        moveLog: game.moveLog,
        whiteMs: wMs,
        blackMs: bMs,
        activeSide: game.activeSide,
        clockActive: game.lastMoveAt !== null,
        status: game.status,
        result: game.result,
    });
});
```

- [ ] **Step 3: Rewrite `authenticate` handler (reconnect path)**

Find the entire `socket.on('authenticate', (userId) => {` block (lines 385–412) and replace it:

```js
socket.on('authenticate', async (userId) => {
    userSockets.set(userId, socket.id);
    socketUsers.set(socket.id, userId);
    socket.join(`user_${userId}`);

    // Check if this user was mid-game and disconnected
    const gameId = userActiveGame.get(userId);
    if (!gameId) return;

    const game = await getGame(gameId);
    if (!game || game.status !== 'active') return;

    const isParticipant = game.whiteId === userId || game.blackId === userId;
    if (!isParticipant) return;

    // Cancel disconnect grace period if they reconnected in time
    if (game.disconnectInfo && game.disconnectInfo.userId === userId) {
        await updateGame(gameId, { disconnectInfo: null });
        socket.join(`game_${gameId}`);
        io.to(`game_${gameId}`).emit('opponent_reconnected', { userId });
    }
});
```

- [ ] **Step 4: Rewrite `make_move` handler**

Find the entire `socket.on('make_move', async (data) => {` block (lines 483–578) and replace it:

```js
socket.on('make_move', async (data) => {
    const game = await getGame(data.game_id);
    if (!game || game.status !== 'active') return;

    // S3: Validate move via Python engine
    if (data.move || data.from) {
        const moveUci = data.move || `${data.from}${data.to}${data.promotion || ''}`;
        try {
            const validationRes = await fetch('http://localhost:8001/validate-move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fen: game.fen, move: moveUci }),
            });
            if (validationRes.ok) {
                const validation = await validationRes.json();
                if (!validation.valid) {
                    console.warn('[make_move] illegal move rejected:', moveUci);
                    return;
                }
                data.fen = validation.new_fen;
            }
        } catch (e) {
            console.warn('[make_move] engine validation unavailable:', e.message);
        }
    }

    const now = Date.now();
    const movedSide = game.activeSide;

    // Deduct elapsed time from the player who just moved
    if (game.lastMoveAt !== null) {
        const elapsed = now - game.lastMoveAt;
        if (movedSide === 'w') game.whiteClockMs = Math.max(0, game.whiteClockMs - elapsed);
        else game.blackClockMs = Math.max(0, game.blackClockMs - elapsed);
    }

    // Add increment to the player who just moved
    if (movedSide === 'w') game.whiteClockMs += game.incrementMs;
    else game.blackClockMs += game.incrementMs;

    // Update game state
    const moveEntry = {
        san: data.san,
        uci: data.move || `${data.from}${data.to}${data.promotion || ''}`,
        fenAfter: data.fen,
        whiteClockMs: game.whiteClockMs,
        blackClockMs: game.blackClockMs,
        timestamp: now,
    };
    game.fen = data.fen;
    game.activeSide = movedSide === 'w' ? 'b' : 'w';
    game.lastMoveAt = now;
    game.moveLog = [...game.moveLog, moveEntry];

    await setGame(data.game_id, game);

    // Broadcast move to all in game room (including both players)
    data.whiteMs = game.whiteClockMs;
    data.blackMs = game.blackClockMs;
    io.to(`game_${data.game_id}`).emit('move_made', data);

    // Persist to Supabase (async, non-blocking)
    supabase.from('games').update({
        fen: data.fen || null,
        white_time_ms: Math.round(game.whiteClockMs),
        black_time_ms: Math.round(game.blackClockMs),
        clock_deadline: new Date(now + (game.activeSide === 'w' ? game.whiteClockMs : game.blackClockMs)).toISOString(),
    }).eq('id', data.game_id)
        .then(({ error }) => { if (error) console.error('[make_move] persist:', error.message); });
});
```

- [ ] **Step 5: Rewrite `disconnect` handler**

Find the entire `socket.on('disconnect', () => {` block (lines 680–764) and replace it:

```js
socket.on('disconnect', async () => {
    // Remove from matchmaking
    for (let [userId, entry] of matchmaking.queue.entries()) {
        if (entry.socketId === socket.id) matchmaking.leaveQueue(userId);
    }

    const userId = socketUsers.get(socket.id);
    socketUsers.delete(socket.id);
    if (userId) userSockets.delete(userId);

    if (!userId || !userActiveGame.has(userId)) return;

    const gameId = userActiveGame.get(userId);
    const game = await getGame(gameId);
    if (!game || game.status !== 'active') return;

    const isParticipant = game.whiteId === userId || game.blackId === userId;
    if (!isParticipant) return;

    const side = game.whiteId === userId ? 'white' : 'black';

    // Record disconnect in Redis — global clock ticker will handle the 20-second grace period
    await updateGame(gameId, {
        disconnectInfo: { userId, side, at: Date.now() },
    });

    // Persist clock state to Supabase so we survive a server restart
    supabase.from('games').update({
        white_time_ms: Math.round(game.whiteClockMs),
        black_time_ms: Math.round(game.blackClockMs),
    }).eq('id', gameId).eq('status', 'active').then(() => {});

    io.to(`game_${gameId}`).emit('opponent_disconnected', {
        userId,
        timeoutSeconds: 20,
    });
});
```

- [ ] **Step 6: Rewrite `game_end` handler to clean up Redis**

Find the entire `socket.on('game_end', async (data) => {` block (lines 584–630) and add `removeActiveGame` + `deleteGame` calls. Replace that block:

```js
socket.on('game_end', async (data) => {
    // Clean up Redis and active set
    const game = await getGame(data.game_id);
    if (game) {
        await setGame(data.game_id, { ...game, status: 'completed' });
        await removeActiveGame(data.game_id);
    }

    io.to(`game_${data.game_id}`).emit('game_end', data);

    // Clean up active game tracking
    for (const [uid, gid] of userActiveGame.entries()) {
        if (gid === data.game_id) userActiveGame.delete(uid);
    }

    if (!data.game_id || !data.white_id || !data.black_id) return;

    const outcome = data.result?.toLowerCase().includes('white') ? 'white'
        : data.result?.toLowerCase().includes('black') ? 'black'
        : 'draw';

    const { data: updated } = await supabase.from('games').update({
        status: 'completed',
        result: outcome === 'draw' ? 'draw' : null,
        winner_id: outcome === 'white' ? data.white_id : outcome === 'black' ? data.black_id : null,
        ended_at: new Date().toISOString(),
    }).eq('id', data.game_id).eq('status', 'active').select('id').maybeSingle();

    if (!updated) return;

    const changes = await ratingService.processGameEnd(
        data.game_id, data.white_id, data.black_id, outcome,
        data.time_control ?? '10', data.is_rated ?? false
    );
    if (changes) {
        io.to(`game_${data.game_id}`).emit('rating_updated', changes);
    }
});
```

- [ ] **Step 7: Remove the now-unused `startClockTimer` function**

Find the entire `function startClockTimer(gameId) {` block (lines 46–105) and delete it. Also find and delete the `const DISCONNECT_TIMEOUT_MS = 20000` line and the `const disconnectTimers = new Map()` line.

- [ ] **Step 8: Verify server starts without errors**

```bash
cd "/Users/chidanandh/desktop/Python Folders/Chess/Chess/Gambit/server"
node server.js &
sleep 2
curl http://localhost:3001/api/health
kill %1
```
Expected: `{"status":"ok"}`

- [ ] **Step 9: Commit**

```bash
cd "/Users/chidanandh/desktop/Python Folders/Chess/Chess/Gambit"
git add server/server.js
git commit -m "feat: replace in-memory gameClocks with Redis; rewrite join_game, make_move, disconnect, authenticate handlers"
```

---

## Task 8: Update Frontend — Consume `game_state_sync`, Fix Clock Display

**Files:**
- Modify: `frontend/app/game/[id]/page.tsx`

**Changes:**
1. Add `clockActive` state (false until server confirms clock is running)
2. Add socket listener for `game_state_sync` — restores FEN + move log + clocks on join/reconnect
3. Emit `join_game` as soon as socket is ready (before `myProfile` loads) to join the room ASAP
4. Clock countdown only runs when `clockActive` is true
5. Set `clockActive = true` when first `move_made` arrives
6. If `gd.status === 'completed'`, show game-over state without waiting for socket event

- [ ] **Step 1: Add `clockActive` state**

Find (around line 170):
```tsx
    const clockSyncedRef = useRef(false)
```
Replace with:
```tsx
    const clockSyncedRef = useRef(false)
    const [clockActive, setClockActive] = useState(false)
```

- [ ] **Step 2: Add `game_state_sync` listener and emit `join_game` immediately on socket ready**

Find the socket setup `useEffect` (around line 321):
```tsx
    useEffect(() => {
        if (!socket || !myProfile) return

        socket.emit('authenticate', myProfile.id)
        socket.emit('join_game', params.id)

        const onDisconnect = () => setConnected(false)
        const onConnect = () => {
            // Fires on initial connect AND on every reconnect — re-join is idempotent
            setConnected(true)
            socket.emit('authenticate', myProfile.id)
            socket.emit('join_game', params.id)
        }
        socket.on('disconnect', onDisconnect)
        socket.on('connect', onConnect)
```

Replace the entire block starting from this `useEffect` opening through the closing `}, [socket, myProfile, params.id, myColor, soundOn])` with:

```tsx
    // Join game room immediately — no profile needed to receive moves
    useEffect(() => {
        if (!socket) return
        socket.emit('join_game', params.id)
        const onConnect = () => socket.emit('join_game', params.id)
        socket.on('connect', onConnect)
        return () => socket.off('connect', onConnect)
    }, [socket, params.id])

    // Auth + all game event handlers — run when both socket and profile are ready
    useEffect(() => {
        if (!socket || !myProfile) return

        socket.emit('authenticate', myProfile.id)

        const onDisconnect = () => setConnected(false)
        const onReconnectConnect = () => {
            setConnected(true)
            socket.emit('authenticate', myProfile.id)
        }
        socket.on('disconnect', onDisconnect)
        socket.on('connect', onReconnectConnect)

        const onGameStateSync = (data: {
            fen: string; moveLog: Array<{san: string; fenAfter: string}>
            whiteMs: number; blackMs: number; activeSide: string
            clockActive: boolean; status: string; result: string | null
        }) => {
            if (data.fen) {
                chessRef.current.load(data.fen)
                setFen(data.fen)
            }
            if (data.moveLog?.length > 0) {
                setFenSnapshots(data.moveLog.map(m => m.fenAfter))
                setMoveList(data.moveLog.map(m => m.san))
                setLastMove(null) // will be set from last move entry if needed
            }
            clockSyncedRef.current = true
            setWhiteTime(Math.round(data.whiteMs / 1000))
            setBlackTime(Math.round(data.blackMs / 1000))
            if (data.clockActive) setClockActive(true)
            if (data.status === 'completed' && data.result) {
                const resultText = data.result === 'white' ? 'White wins'
                    : data.result === 'black' ? 'Black wins' : 'Draw'
                setGameOver({ result: resultText, reason: 'Game over' })
            }
        }

        const onMoveMade = (data: { game_id: string; from: string; to: string; promotion?: string; fen: string; san: string; captured?: boolean; whiteMs?: number; blackMs?: number }) => {
            if (data.game_id !== params.id) return
            if (data.fen === lastProcessedFenRef.current) return
            lastProcessedFenRef.current = data.fen
            chessRef.current.load(data.fen)
            setFen(data.fen)
            setFenSnapshots(prev => [...prev, data.fen])
            setViewIndex(null)
            setLastMove({ from: data.from as Square, to: data.to as Square })
            setMoveList(prev => [...prev, data.san])
            setSelectedSq(null)
            setLegalDests([])
            setClockActive(true) // clock is definitely running after first move
            if (data.whiteMs !== undefined) setWhiteTime(Math.round(data.whiteMs / 1000))
            if (data.blackMs !== undefined) setBlackTime(Math.round(data.blackMs / 1000))

            if (soundOn) {
                if (chessRef.current.inCheck()) playCheckSound()
                else if (data.captured) playCaptureSound()
                else playMoveSound()
            }

            if (chessRef.current.isGameOver()) {
                const c = chessRef.current
                const result = c.isCheckmate()
                    ? (c.turn() === 'w' ? 'Black wins' : 'White wins')
                    : 'Draw'
                const reason = c.isCheckmate() ? 'Checkmate' : c.isStalemate() ? 'Stalemate' : 'Draw'
                setGameOver({ result, reason })
                if (soundOn) playGameEndSound(myColor !== 'spectator' && ((c.turn() === 'w' ? 'black' : 'white') === myColor))
            }
        }

        const onChatMessage = (data: { game_id: string; from: string; text: string }) => {
            if (data.game_id !== params.id) return
            setChatLog(prev => [...prev, { from: data.from, text: data.text }])
        }

        const onGameEnd = (data: { game_id: string; result: string; reason: string }) => {
            if (data.game_id !== params.id) return
            setGameOver({ result: data.result, reason: data.reason })
            setClockActive(false)
            if (soundOn) playGameEndSound(data.result.toLowerCase().startsWith(myColor))
        }

        const onRatingUpdated = (data: {
            white: { oldRating: number; newRating: number; change: number }
            black: { oldRating: number; newRating: number; change: number }
        }) => {
            setWhiteRatingChange(data.white.change)
            setBlackRatingChange(data.black.change)
        }

        const onRematchRequest = (data: { from_user_id: string; from_username: string }) => {
            setRematchFromUser(data.from_username)
            setRematchState('received')
        }

        const onRematchReady = (data: { game_id: string }) => {
            router.push(`/game/${data.game_id}`)
        }

        const onRematchDeclined = () => {
            setRematchState('declined')
        }

        const onOpponentDisconnected = (data: { timeoutSeconds: number }) => {
            setOpponentDisconnected(true)
            setDisconnectCountdown(data.timeoutSeconds)
            if (disconnectCountdownRef.current) clearInterval(disconnectCountdownRef.current)
            disconnectCountdownRef.current = setInterval(() => {
                setDisconnectCountdown(prev => {
                    if (prev <= 1) { clearInterval(disconnectCountdownRef.current!); return 0 }
                    return prev - 1
                })
            }, 1000)
        }

        const onOpponentReconnected = () => {
            setOpponentDisconnected(false)
            setDisconnectCountdown(0)
            if (disconnectCountdownRef.current) clearInterval(disconnectCountdownRef.current)
        }

        const onClockSync = (data: { whiteMs: number; blackMs: number }) => {
            clockSyncedRef.current = true
            setWhiteTime(Math.round(data.whiteMs / 1000))
            setBlackTime(Math.round(data.blackMs / 1000))
        }

        socket.on('game_state_sync', onGameStateSync)
        socket.on('move_made', onMoveMade)
        socket.on('chat_message', onChatMessage)
        socket.on('game_end', onGameEnd)
        socket.on('rating_updated', onRatingUpdated)
        socket.on('rematch_request', onRematchRequest)
        socket.on('rematch_ready', onRematchReady)
        socket.on('rematch_declined', onRematchDeclined)
        socket.on('opponent_disconnected', onOpponentDisconnected)
        socket.on('opponent_reconnected', onOpponentReconnected)
        socket.on('clock_sync', onClockSync)

        return () => {
            socket.off('disconnect', onDisconnect)
            socket.off('connect', onReconnectConnect)
            socket.off('game_state_sync', onGameStateSync)
            socket.off('move_made', onMoveMade)
            socket.off('chat_message', onChatMessage)
            socket.off('game_end', onGameEnd)
            socket.off('rating_updated', onRatingUpdated)
            socket.off('rematch_request', onRematchRequest)
            socket.off('rematch_ready', onRematchReady)
            socket.off('rematch_declined', onRematchDeclined)
            socket.off('opponent_disconnected', onOpponentDisconnected)
            socket.off('opponent_reconnected', onOpponentReconnected)
            socket.off('clock_sync', onClockSync)
            if (disconnectCountdownRef.current) clearInterval(disconnectCountdownRef.current)
        }
    }, [socket, myProfile, params.id, myColor, soundOn])
```

- [ ] **Step 3: Add `clockActive` to the clock countdown condition**

Find:
```tsx
    useEffect(() => {
        if (clockRef.current) clearInterval(clockRef.current)
        // Pause display clock when opponent is disconnected (server clock is also paused)
        if (gameOver || !gameData || opponentDisconnected) return
```
Replace with:
```tsx
    useEffect(() => {
        if (clockRef.current) clearInterval(clockRef.current)
        // Only tick locally when server confirms clock is active
        if (gameOver || !gameData || opponentDisconnected || !clockActive) return
```
Also update the dependency array from `[currentTurn, gameOver, gameData, opponentDisconnected]` to `[currentTurn, gameOver, gameData, opponentDisconnected, clockActive]`.

- [ ] **Step 4: Handle completed game state on initial data load**

Find the game data load `useEffect` (around line 275):
```tsx
    useEffect(() => {
        fetch(`/api/games/${params.id}`).then(r => r.ok ? r.json() : null).then(gd => {
            if (!gd) { router.push('/lobby'); return }
            setGameData(gd)
            gameDataRef.current = gd
```

Find the lines that set the initial clock (around line 289):
```tsx
            // Only preset clock if clock_sync hasn't arrived yet (prevents overwriting the synced value)
            if (!clockSyncedRef.current) {
                setWhiteTime(mins * 60)
                setBlackTime(mins * 60)
            }
            if (soundOn && !isResume) playGameStartSound()
        })
    }, [params.id])
```

Replace those lines with:
```tsx
            if (!clockSyncedRef.current) {
                setWhiteTime(mins * 60)
                setBlackTime(mins * 60)
            }
            // Show game-over state if the game is already completed (e.g. player refreshed after abandonment)
            if (gd.status === 'completed' && !gameOver) {
                const outcome = gd.winner_id === gd.white_id ? 'White wins'
                    : gd.winner_id === gd.black_id ? 'Black wins' : 'Draw'
                setGameOver({ result: outcome, reason: 'Game over' })
            }
            if (soundOn && !isResume && gd.status === 'active') playGameStartSound()
        })
    }, [params.id])
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd "/Users/chidanandh/Desktop/Python folders/Chess/Chess/Gambit/frontend"
npx tsc --noEmit 2>&1 | head -30
```
Expected: No errors (or only pre-existing errors unrelated to game page).

- [ ] **Step 6: Commit**

```bash
cd "/Users/chidanandh/Desktop/Python folders/Chess/Chess/Gambit"
git add "frontend/app/game/[id]/page.tsx"
git commit -m "feat: consume game_state_sync for refresh restore; fix clock drift; handle completed game on load"
```

---

## Task 9: Fix Presence in Lobby and Navbar

**Files:**
- Modify: `frontend/app/lobby/page.tsx`
- Modify: `frontend/components/Navbar.tsx`

Add `join` and `leave` presence handlers (not just `sync`) and call `channel.untrack()` on cleanup so leaving users are immediately removed from the count.

- [ ] **Step 1: Update presence block in `frontend/app/lobby/page.tsx`**

Find the presence `useEffect` block (around lines 126–150):
```tsx
    useEffect(() => {
        let mounted = true;
        const supabase = createClient();
        const presenceKey = myProfile?.id || `anon-${Math.random()}`

        const channel = supabase.channel('gambit-online-users', {
            config: { presence: { key: presenceKey } }
        });
        channel.on('presence', { event: 'sync' }, () => {
            if (!mounted) return;
            const count = Object.keys(channel.presenceState()).length;
            setOnlineCount(Math.max(1, count));
        });
        channel.subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED' && mounted && myProfile) {
                await channel.track({ user_id: myProfile.id });
            }
        });

        return () => {
            mounted = false;
            supabase.removeChannel(channel);
        };
    }, [myProfile?.id]);
```

Replace with:
```tsx
    useEffect(() => {
        let mounted = true;
        if (!myProfile?.id) return;
        const supabase = createClient();

        const channel = supabase.channel('gambit-online-users', {
            config: { presence: { key: myProfile.id } }
        });

        const updateCount = () => {
            if (!mounted) return;
            const count = Object.keys(channel.presenceState()).length;
            setOnlineCount(Math.max(1, count));
        };

        // Register ALL handlers before subscribe()
        channel
            .on('presence', { event: 'sync' }, updateCount)
            .on('presence', { event: 'join' }, updateCount)
            .on('presence', { event: 'leave' }, updateCount);

        channel.subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED' && mounted) {
                await channel.track({ user_id: myProfile.id });
            }
        });

        return () => {
            mounted = false;
            channel.untrack().then(() => supabase.removeChannel(channel));
        };
    }, [myProfile?.id]);
```

- [ ] **Step 2: Apply the same fix to `frontend/components/Navbar.tsx`**

Find the presence `useEffect` block in Navbar.tsx. It has `channel.on('presence', { event: 'sync' }, ...)` followed by `channel.subscribe(...)`. Replace with the same pattern:

```tsx
        // Register ALL handlers before subscribe()
        channel
            .on('presence', { event: 'sync' }, () => {
                if (!mounted) return;
                const state = channel.presenceState();
                setOnlineCount(Math.max(1, Object.keys(state).length));
            })
            .on('presence', { event: 'join' }, () => {
                if (!mounted) return;
                setOnlineCount(prev => prev + 1);
            })
            .on('presence', { event: 'leave' }, () => {
                if (!mounted) return;
                const state = channel.presenceState();
                setOnlineCount(Math.max(1, Object.keys(state).length));
            });

        channel.subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED' && mounted) {
                await channel.track({
                    user_id: profile.id,
                    username: profile?.username || 'unknown'
                });
            }
        });
```

And update the cleanup to call `untrack`:
```tsx
    return () => {
        mounted = false;
        document.removeEventListener('mousedown', handleClickOutside);
        if (channel && supabaseClient) {
            channel.untrack().then(() => supabaseClient!.removeChannel(channel));
        }
    };
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/chidanandh/Desktop/Python folders/Chess/Chess/Gambit"
git add "frontend/app/lobby/page.tsx" frontend/components/Navbar.tsx
git commit -m "fix: add join/leave presence handlers and untrack on cleanup in lobby and navbar"
```

---

## Task 10: Full Verification

- [ ] **Step 1: Start Redis**

```bash
redis-cli ping
```
Expected: `PONG`

- [ ] **Step 2: Start Node server and verify Redis connection**

```bash
cd "/Users/chidanandh/desktop/Python Folders/Chess/Chess/Gambit/server"
node server.js 2>&1 | head -5
```
Expected output includes:
```
[Redis] Connected
[Clock] Global ticker started
Node server running on port 3001
```

- [ ] **Step 3: Run all server tests**

```bash
cd "/Users/chidanandh/desktop/Python Folders/Chess/Chess/Gambit/server"
npx jest --no-coverage 2>&1 | tail -10
```
Expected: All test suites pass (gameStore + rating + friends).

- [ ] **Step 4: Run all frontend tests**

```bash
cd "/Users/chidanandh/Desktop/Python folders/Chess/Chess/Gambit/frontend"
npx jest --no-coverage 2>&1 | tail -10
```
Expected: All tests pass.

- [ ] **Step 5: Manual refresh test**

1. Open two browser windows
2. Start a game (matchmaking or private)
3. Make 3 moves
4. Hard-refresh (`Cmd+Shift+R`) one window
5. Verify: board position correct, move history correct, clocks correct

- [ ] **Step 6: Manual clock sync test**

1. Open two browser windows showing the same active game
2. Wait 30 seconds without moving
3. Verify: both windows show identical clock values (within 1 second)

- [ ] **Step 7: Manual disconnect test**

1. Window A and Window B are in a game
2. Close Window B
3. Verify: Window A shows "Opponent disconnected — 20s to reconnect"
4. Reopen Window B within 20s → game resumes
5. Let 20s pass without reopening → Window A shows "Black/White wins by Abandonment"
6. Check game history to verify the game appears as completed

- [ ] **Step 8: Verify completed game shows result after refresh**

1. Finish a game
2. Hard-refresh the game page
3. Verify: game-over modal appears with correct result

---

## Deployment Notes

**Railway (production):**
1. Add Redis plugin in Railway dashboard (or use Upstash Redis)
2. Copy the `REDIS_URL` to Railway environment variables
3. The server auto-connects on start

**Upstash (free tier alternative):**
1. Sign up at upstash.com → Create Redis database
2. Copy the Redis URL (format: `rediss://...`)
3. Add as `REDIS_URL` in Railway env vars

**Local development:**
- Mac: `brew install redis && brew services start redis`
- The default `redis://127.0.0.1:6379` in `server/lib/redis.js` works out of the box
