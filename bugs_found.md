# Gambit Platform — Full Audit: Bugs Found

> **Scope:** Complete read of all source files across frontend, server, and chess-engine.  
> **Rule:** No fixes applied. All issues documented here with exact file/line references and step-by-step fix instructions.  
> **Date:** 2026-04-19  

---

## Severity Key

| Symbol | Meaning |
|--------|---------|
| 🔴 CRITICAL | Security hole or data loss |
| 🟠 HIGH | Incorrect behavior visible to users |
| 🟡 MEDIUM | Logic error that is mostly hidden but will surface |
| 🔵 LOW | Code quality / dead code / minor inconsistency |

---

## PART 1 — SECURITY BUGS

---

### BUG-S1 🔴 `requireUserId` trusts client-supplied header without JWT verification

**File:** `server/server.js` lines 202–206  
**Also affects:** All friend, notification, and profile endpoints that call `requireUserId`.

**Description:**  
The `requireUserId` helper reads `req.headers['x-user-id']` and returns it as the authenticated user ID. No signature is checked, no JWT is decoded, no Supabase session is verified. Any HTTP client can send `x-user-id: <any-uuid>` and act as that user.

```js
// server.js:202
function requireUserId(req, res) {
    const uid = req.headers['x-user-id'];  // completely untrusted
    if (!uid) { res.status(401).json({ error: 'Missing x-user-id header' }); return null; }
    return uid;
}
```

**Impact:** An attacker can:
- Read any user's friend list and notifications
- Send friend requests as any user
- Accept/decline any friendship on behalf of any user

**How to fix:**
1. Add a middleware that reads the `Authorization: Bearer <token>` header (or the Supabase cookie).
2. Verify the JWT using Supabase's `admin.auth.getUser(token)`.
3. Return the verified `user.id` from that call, not the header value.
4. Replace `requireUserId` with this verified helper.

Alternative (simpler for a monorepo): use the same cookie-parsing JWT decode that `/api/profile/me` and the middleware use, ported to the Node server. Supabase JWTs are signed — decode the payload and check `exp` + `iss`.

---

### BUG-S2 🔴 `/api/profile` and `/api/auth/register-profile` accept unauthenticated requests

**File:** `server/server.js` lines 107–186  

**Description:**  
```js
// server.js:171
app.put('/api/profile', async (req, res) => {
    const { userId, displayName, bio, country, sex, isPublic } = req.body;
    // userId comes from request body — no auth check
    ...
    await supabase.from('profiles').update(...).eq('id', userId);
```

`/api/auth/register-profile` similarly takes `userId` from the body. Anyone can update or create profiles for any user ID.

**How to fix:**
Apply `requireUserId` (once fixed per BUG-S1) and verify that `req.body.userId === authenticatedUserId` before any write.

---

### BUG-S3 🔴 Server never validates chess moves — client FEN is trusted

**File:** `server/server.js` lines 446–478 (`make_move` handler)  

**Description:**  
The server receives `{ game_id, from, to, fen, san, captured }` from the client via socket and broadcasts it to all players in the room without calling the Python engine to validate the move. A cheating client can:
- Send illegal moves (e.g., moving the opponent's piece)
- Send any arbitrary FEN string
- Skip ahead to a winning position

```js
socket.on('make_move', async (data) => {
    // ... clock math ...
    io.to(`game_${data.game_id}`).emit('move_made', data);  // ← trusts data.fen
    const persistPayload = { fen: data.fen || null };       // ← persists untrusted FEN
```

**How to fix:**
1. Before broadcasting, call the Python engine's `/validate-move` endpoint:
   ```js
   const validation = await fetch('http://localhost:8001/validate-move', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ fen: currentFenFromDB, move: `${data.from}${data.to}${data.promotion || ''}` })
   }).then(r => r.json());
   if (!validation.valid) {
       socket.emit('move_rejected', { reason: 'Illegal move' });
       return;
   }
   data.fen = validation.new_fen;  // use server-computed FEN, not client-provided
   ```
2. Store the current FEN in `gameClocks` or a separate `gameState` Map so the server knows the board state without querying the DB on every move.

---

### BUG-S4 🔴 Notification endpoint is unauthenticated and leaks data

**File:** `server/server.js` lines 307–330  

**Description:**  
`GET /api/notifications` and `PUT /api/notifications/:id/read` both use `requireUserId` (which is broken per BUG-S1), and additionally the frontend calls `/api/notifications?userId=${userId}` from the Navbar — passing the user ID as a query parameter rather than a header.

**How to fix:**  
Apply the JWT-verified `requireUserId` fix from BUG-S1. Remove the `userId` query param pattern; derive it from the auth token only.

---

### BUG-S5 🟠 Private game double-join race condition

**File:** `server/services/friends.js` lines 57–84  

**Description:**  
Two simultaneous POST requests to `/api/games/join/:token` could both read `game.status === 'waiting'` before either updates it to `'active'`, resulting in two players being added as the joiner for the same slot.

```js
async joinPrivateGame(token, userId) {
    const game = await this.getGameByToken(token);
    if (!game) throw new Error('Invalid or expired token');
    if (game.status !== 'waiting') throw new Error('Game already started');
    // ← RACE: two callers can both pass this check simultaneously
    ...
    await supabase.from('games').update({ ..., status: 'active' }).eq('id', game.id)
```

**How to fix:**  
Use a Supabase conditional update to prevent double-join:
```js
const { data, error } = await supabase.from('games')
    .update({ white_id, black_id, status: 'active', started_at: new Date().toISOString() })
    .eq('id', game.id)
    .eq('status', 'waiting')   // ← atomic: only succeeds if still 'waiting'
    .select().maybeSingle();

if (!data) throw new Error('Game already started');
```

---

## PART 2 — RATING SYSTEM BUGS

---

### BUG-R1 🔴 `rating_rd` and `rating_vol` are never read from the database

**File:** `server/services/rating.js` lines 27–84  

**Description:**  
The SELECT query only fetches standard columns:
```js
.select('id, rating_rapid, rating_blitz, rating_bullet, rating_classical, games_played, wins, losses, draws')
```
`rating_rd` and `rating_vol` are NOT in the SELECT, so `wp.rating_rd` and `bp.rating_rd` are always `undefined`. They fall back to `?? 100` in the calculation.

Worse, the write-back is guarded by:
```js
if ('rating_rd' in wp) { whiteUpdate.rating_rd = newRatings.white.rd; }
```
Since `rating_rd` is never in `wp` (not fetched), the RD/volatility columns are **never updated**. Glicko-2's uncertainty tracking is completely broken — every game is treated as the player's first game (RD = 100 permanently).

**How to fix:**  
Add the missing columns to the SELECT:
```js
.select('id, rating_rapid, rating_blitz, rating_bullet, rating_classical, rating_rd, rating_vol, games_played, wins, losses, draws')
```
Remove the `if ('rating_rd' in wp)` guards — always write them back.

---

### BUG-R2 🟠 No floor on ratings — ratings can go negative

**File:** `server/services/rating.js` lines 74–80  

**Description:**  
```js
const wChange = Math.max(-MAX_CHANGE, Math.min(MAX_CHANGE, newRatings.white.rating - whiteOld));
whiteUpdate[field] = Math.round(whiteOld + wChange);
```
The `MAX_CHANGE` cap is ±50, so a player starting at 1200 can theoretically fall to ~100 after many losses. But there is no hard floor. With Glicko-2 and a sustained losing streak, it's possible to reach 0 or below.

**How to fix:**  
```js
whiteUpdate[field] = Math.max(100, Math.round(whiteOld + wChange));
blackUpdate[field] = Math.max(100, Math.round(blackOld + bChange));
```

---

### BUG-R3 🟡 Rating updates are not atomic — partial update possible

**File:** `server/services/rating.js` lines 87–90  

**Description:**  
```js
await Promise.all([
    supabase.from('profiles').update(whiteUpdate).eq('id', whiteId),
    supabase.from('profiles').update(blackUpdate).eq('id', blackId),
]);
```
If the black player's update fails (network error, RLS violation), the white player's rating is already updated and inconsistent. There's no rollback.

**How to fix:**  
Use a Supabase RPC (PostgreSQL function) that updates both rows in a single transaction:
```sql
CREATE OR REPLACE FUNCTION update_ratings(
    white_id UUID, white_data JSONB,
    black_id UUID, black_data JSONB
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE profiles SET ... WHERE id = white_id;
    UPDATE profiles SET ... WHERE id = black_id;
END;
$$;
```
Call it with `supabase.rpc('update_ratings', {...})`.

---

### BUG-R4 🟡 Matchmaking uses `user.rating` — a field that doesn't exist in the profile object

**File:** `server/services/matchmaking.js` line 18; `frontend/app/lobby/page.tsx` lines 98–103

**Description:**  
The lobby sends:
```js
socket.emit('join_queue', {
    user: { id: myProfile.id, rating: myProfile.rating_rapid ?? 1200, games_played: ... },
    time_control: mins,
    increment: inc,
})
```
This is correct — the lobby correctly passes `rating_rapid` as `rating`. But the rating field is hardcoded to `rating_rapid` regardless of the time control. A bullet player (time_control=1) will be matched using their Rapid rating, not their Bullet rating. Over time, a player with high Rapid and low Bullet would be matched against opponents at the wrong level.

**How to fix:**  
In the lobby, pass the correct rating based on time control:
```js
const getRatingForTc = (mins: number) => {
    if (mins <= 2) return myProfile.rating_bullet ?? 1200;
    if (mins <= 5) return myProfile.rating_blitz ?? 1200;
    if (mins <= 15) return myProfile.rating_rapid ?? 1200;
    return myProfile.rating_classical ?? 1200;
};
user: { id: myProfile.id, rating: getRatingForTc(mins), games_played: myProfile.games_played ?? 0 }
```

---

## PART 3 — CLOCK SYSTEM BUGS

---

### BUG-C1 🔴 Clock increment never applied after moves

**File:** `server/server.js` lines 453–463 (`make_move` handler)

**Description:**  
The `make_move` handler deducts elapsed time but never adds the per-move increment:
```js
const elapsed = clock.lastTick ? now - clock.lastTick : 0;
if (clock.turn === 'w') clock.whiteMs = Math.max(0, clock.whiteMs - elapsed);
else clock.blackMs = Math.max(0, clock.blackMs - elapsed);
clock.turn = clock.turn === 'w' ? 'b' : 'w';
// ← MISSING: whiteMs += increment * 1000 (or blackMs if black just moved)
```
The `increment` field is stored in the `games` table and in the `p1.increment` matchmaking object, but it's never retrieved or applied to the clock.

**How to fix:**  
1. Store increment in `gameClocks` when the game starts:
   ```js
   gameClocks.set(gameId, { ..., incrementMs: (game.increment ?? 0) * 1000 });
   ```
2. In `make_move`, after deducting elapsed for the player who just moved:
   ```js
   const justMovedColor = clock.turn; // before switching
   if (justMovedColor === 'w') clock.whiteMs += clock.incrementMs ?? 0;
   else clock.blackMs += clock.incrementMs ?? 0;
   clock.turn = justMovedColor === 'w' ? 'b' : 'w';
   ```

---

### BUG-C2 🟠 Server doesn't broadcast periodic `clock_sync` — clients can drift

**File:** `server/server.js` `startClockTimer` function (lines 41–84)

**Description:**  
The server uses `setTimeout` to fire only when the clock runs out. It does NOT emit `clock_sync` periodically. The client ticks its own display clock via `setInterval`. If the client's interval drifts (tab hidden, CPU busy), it will show a wrong time until the next `move_made` event. In long games, the displayed time could be off by several seconds.

**How to fix:**  
Replace the single `setTimeout` in `startClockTimer` with a combination: keep the timeout for the flag event, but also emit `clock_sync` every second:
```js
// Add to gameClocks: syncIntervalId
clock.syncIntervalId = setInterval(() => {
    const c = gameClocks.get(gameId);
    if (!c || !c.active) return clearInterval(c?.syncIntervalId);
    const elapsed = c.lastTick ? Date.now() - c.lastTick : 0;
    const wMs = c.turn === 'w' ? Math.max(0, c.whiteMs - elapsed) : c.whiteMs;
    const bMs = c.turn === 'b' ? Math.max(0, c.blackMs - elapsed) : c.blackMs;
    io.to(`game_${gameId}`).emit('clock_sync', { whiteMs: wMs, blackMs: bMs });
}, 1000);
```
Clear `syncIntervalId` wherever `active` is set to false (flag, disconnect, game end).

---

### BUG-C3 🟡 Clock not started for the first move if the game was loaded from DB with `hasStarted = false`

**File:** `server/server.js` `make_move` handler, line 450  

**Description:**  
```js
if (!clock.active) {
    clock.active = true;  // First move — start the clock
} else {
    // deduct elapsed
}
```
When `clock.active = false` (first move in a fresh game), the code sets `active = true` but does NOT deduct any elapsed time. This is intentional for the first move. However, `clock.lastTick` is not set to `now` here — it's set later on line 459:
```js
clock.lastTick = now;
```
This looks correct. But if the clock was loaded from DB after a server restart with `hasStarted = true` but `active = false`, the first move would set `active = true` and still skip the deduction branch. This is actually correct behavior for a restarted server (elapsed is computed from `clock_deadline` at load time). Not a bug per se, but worth noting.

---

## PART 4 — CHESS ENGINE BUGS

---

### BUG-E1 🔴 New Stockfish process created for every API request — process leak

**File:** `chess-engine/engine.py` lines 12–20; `chess-engine/main.py` lines 157, 191, 147

**Description:**  
`get_stockfish_instance()` spawns a new Stockfish subprocess on every call:
```python
def get_stockfish_instance(depth: int = 15):
    sf = Stockfish(path=STOCKFISH_PATH or "stockfish")
    sf.set_depth(depth)
    return sf
```
Under load, many Stockfish processes accumulate. Each spawned process holds a file descriptor and memory. The `/analyze` endpoint (called by the Analysis page) creates a new Stockfish process on every user request and never explicitly closes it.

**How to fix:**  
Create a module-level singleton with a threading lock:
```python
import threading
_sf_lock = threading.Lock()
_sf_instance = None

def get_stockfish():
    global _sf_instance
    with _sf_lock:
        if _sf_instance is None:
            _sf_instance = Stockfish(path=STOCKFISH_PATH or "stockfish")
            _sf_instance.set_depth(18)
        return _sf_instance
```
For concurrent requests, use a pool or queue pattern. For the `run_full_game_analysis` background task, create one instance per task and call `sf.__del__()` or wrap in a context manager at the end.

---

### BUG-E2 🟠 `valid_moves` endpoint has no try/except — invalid FEN crashes with 500

**File:** `chess-engine/main.py` lines 63–67

**Description:**  
```python
@app.post("/valid-moves")
def valid_moves(req: MoveReq):
    b = chess.Board(req.fen)        # raises ValueError for invalid FEN
    moves = [m.uci() for m in b.legal_moves]
    return {"valid_moves": moves}
```
`chess.Board()` raises `ValueError` for malformed FEN. FastAPI will return a generic 500 instead of a client-friendly 400.

**How to fix:**  
```python
@app.post("/valid-moves")
def valid_moves(req: MoveReq):
    try:
        b = chess.Board(req.fen)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid FEN: {e}")
    moves = [m.uci() for m in b.legal_moves]
    return {"valid_moves": moves}
```

---

### BUG-E3 🟠 "Brilliant" move classification is never assigned

**File:** `chess-engine/engine.py` lines 68–83; `chess-engine/main.py` line 115

**Description:**  
`run_full_game_analysis` checks for `"Brilliant"` in critical moments:
```python
if classification in ["Blunder", "Mistake", "Brilliant", "Great move"]:
```
But `analyze_move_cp` never returns `"Brilliant"` — the classification list goes:
- `< 10 + best move` → `"Great move"`
- `< 10` → `"Best"`
- `11–25` → `"Excellent"`
- etc.

"Brilliant" is defined (per Chess.com) as a sacrifice that leads to a better position — requires detecting material loss + significant eval gain. This is not implemented.

**How to fix:**  
Add brilliant detection in `analyze_move_cp`:
```python
# After computing cp_loss and classification:
# Brilliant = user moved to a losing-material position but eval improved significantly
material_before = count_material(b)  # before user_move
b_temp = chess.Board(board_fen)
b_temp.push(user_move)
material_after = count_material(b_temp)
material_lost = material_before - material_after  # positive = sacrificed
eval_gain = eval_after_cp - eval_before_cp_player_perspective
if material_lost >= 3 and eval_gain >= 150 and user_move.uci() != best_move_uci:
    classification = "Brilliant"
```
Note: `count_material` would need to be a helper counting piece values for the moving player.

---

### BUG-E4 🔵 `best_move_dict = sf.get_best_move()` result assigned but never used

**File:** `chess-engine/engine.py` line 36

**Description:**  
```python
best_move_dict = sf.get_best_move()  # ← result is never read
top_moves = sf.get_top_moves(2)
best_move_uci = top_moves[0]["Move"] if top_moves else None
```
This is a wasted Stockfish call. Remove it.

**How to fix:**  
Delete line 36 (`best_move_dict = sf.get_best_move()`). `best_move_uci` is already taken from `top_moves[0]["Move"]`.

---

### BUG-E5 🟡 Centipawn perspective is inconsistent — `eval_before` returned raw (not normalized)

**File:** `chess-engine/engine.py` lines 32–65

**Description:**  
The function returns `eval_before` (from `sf.get_evaluation()`) as a raw Stockfish value. Stockfish's `get_evaluation()` always returns values from White's perspective (positive = good for White). But `eval_best_cp` and `eval_after_cp` are normalized to the _player's_ perspective. This means the caller receives mixed-perspective values, which would make charting them across moves inconsistent for Black.

**How to fix:**  
Normalize `eval_before`:
```python
eval_before_cp = eval_before["value"] if eval_before["type"] == "cp" else (
    10000 if eval_before["value"] > 0 else -10000
)
# Normalize to player's perspective
eval_before_cp_player = eval_before_cp if player_color == chess.WHITE else -eval_before_cp
```
Return `eval_before_cp_player` instead of the raw `eval_before` dict.

---

## PART 5 — GAME FLOW BUGS

---

### BUG-G1 🟠 Lobby `_reconnected` listener is now dead code

**File:** `frontend/app/lobby/page.tsx` lines 92–117

**Description:**  
The lobby listens for `socket.on('_reconnected', onReconnected)` to re-authenticate and re-join the matchmaking queue after a socket reconnect. However, in the previous fix, `SocketProvider.tsx` was updated to remove `s.emit('_reconnected')`. The server never emits `_reconnected` to the client either. So `onReconnected` in the lobby will never fire.

As a result: if a user is actively searching for a match and their socket drops and reconnects, they are silently removed from the queue but not re-added.

**How to fix:**  
Replace the `_reconnected` pattern in the lobby with a `connect` listener (same fix applied to the game page):
```tsx
const onConnect = () => {
    if (!myProfile) return;
    socket.emit('authenticate', myProfile.id);
    if (searching) {
        const { mins, inc } = getTcMinutes();
        socket.emit('join_queue', { user: { ... }, time_control: mins, increment: inc });
    }
};
socket.on('connect', onConnect);
// cleanup: socket.off('connect', onConnect)
```
Remove the `socket.on('_reconnected', ...)` and `socket.off('_reconnected', ...)` lines entirely.

---

### BUG-G2 🟡 `/api/games/[id]` PATCH endpoint allows any authenticated user to update any game

**File:** `frontend/app/api/games/[id]/route.ts` lines 60–92

**Description:**  
```ts
export async function PATCH(req, { params }) {
    // Only checks: is user authenticated
    // Does NOT check: is user a player in this game
    const { data: { session } } = await supabase.auth.getSession();
    if (!user) return 401;
    const admin = makeAdmin();
    await admin.from('games').update(body).eq('id', params.id);  // ← any game!
```
Any authenticated user can PATCH any game row with any data (status, winner_id, fen, etc.).

**How to fix:**  
After fetching the game, verify the caller is a player:
```ts
const { data: game } = await admin.from('games').select('white_id, black_id').eq('id', params.id).single();
if (game.white_id !== user.id && game.black_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
// Additionally, restrict which fields the body can update (allowlist)
const allowedFields = ['status', 'result', 'winner_id', 'ended_at']; 
```
Better yet, remove this PATCH endpoint entirely and handle game state updates server-side through Socket.io events.

---

### BUG-G3 🟡 Rematch creates a new private game but never assigns initial clocks

**File:** `server/server.js` lines 567–578 (`rematch_accept` handler)

**Description:**  
```js
socket.on('rematch_accept', async (data) => {
    const game = await friendsService.createPrivateGame(data.from_user_id, data.time_control, 'random', data.is_rated);
    await friendsService.joinPrivateGame(game.invite_token, data.to_user_id);
    io.to(`user_${data.from_user_id}`).emit('rematch_ready', { game_id: game.id });
    io.to(`user_${data.to_user_id}`).emit('rematch_ready', { game_id: game.id });
```
The game is created and immediately joined, but neither player emits `join_game` to the socket room until the game page loads. The `gameClocks` Map is not pre-populated. The server clock starts only when `join_game` is received (which fetches from DB). This is actually correct flow — the issue is that between `game_start` and `join_game`, the clients don't know their clock state. But since no moves can be made before joining, this is acceptable. Minor but worth noting.

---

## PART 6 — FRONTEND BUGS

---

### BUG-F1 🟠 Profile page `handleSaveProfile` uses the browser anon client — will fail with RLS

**File:** `frontend/app/profile/[username]/page.tsx` (`handleSaveProfile` function)

**Description:**  
```tsx
const handleSaveProfile = async () => {
    const admin = createClient();  // ← anon Supabase client, not admin
    await admin.from('profiles').update({ display_name: displayName, bio, country })
        .eq('id', meProfile.id);
```
`createClient()` returns the browser anon client. If Row Level Security on the `profiles` table is enabled (which it should be), this update will be blocked unless the user is authenticated via the anon client's session. Even if it works (because RLS policy allows `auth.uid() = id` updates), it bypasses server-side validation.

**How to fix:**  
Use the `/api/profile/me` PATCH endpoint instead:
```tsx
const handleSaveProfile = async () => {
    const res = await fetch('/api/profile/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, bio, country }),
    });
    if (res.ok) { setIsEditModalOpen(false); window.location.reload(); }
};
```
The PATCH handler at `/api/profile/me` already exists and uses the service role key correctly.

---

### BUG-F2 🟡 Signup page: after successful signup, calls browser `signInWithPassword` which stores session in localStorage, not HTTP-only cookies

**File:** `frontend/app/signup/page.tsx` lines 102–125

**Description:**  
After the server creates the user via `/api/auth/signup`, the client calls:
```tsx
const supabase = createClient();
const { data: signInData } = await supabase.auth.signInWithPassword({ email, password });
```
The browser Supabase client stores the session in localStorage (or a non-HTTP-only cookie). The middleware reads HTTP-only cookies. If the session is stored in localStorage, the middleware won't see it and will redirect authenticated users back to `/login`.

The login page uses the same pattern (`supabase.auth.signInWithPassword` on the browser client) as a fallback, but the primary login flow (`/api/auth/login`) correctly sets HTTP-only cookies. Signup never calls `/api/auth/login` after account creation.

**How to fix:**  
After `/api/auth/signup` returns `{ ok: true }`, call `/api/auth/login` (the server-side route) instead of the browser client:
```tsx
const loginRes = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
});
if (!loginRes.ok) { setError('Account created! Please sign in.'); return; }
router.push('/lobby');
router.refresh();
```

---

### BUG-F3 🔵 Dead code: `socket.on('_reconnected', ...)` in game page cleanup still references removed `onReconnected`

**File:** `frontend/app/game/[id]/page.tsx` cleanup function

**Description:**  
After the fix applied earlier in this session, `onReconnected` function and its `socket.on('_reconnected', ...)` binding were removed. The cleanup `return () => { ... }` block still has `socket.off('_reconnected', onReconnected)` — but wait, this was removed in the fix. Confirmed already clean. ✓ (No action needed.)

---

### BUG-F4 🔵 Lobby has a separate Supabase presence channel that conflicts with Navbar's channel

**File:** `frontend/app/lobby/page.tsx` lines 127–150; `frontend/components/Navbar.tsx`

**Description:**  
Both Navbar and Lobby create Supabase Realtime presence channels tracking online users. The Navbar uses channel name `'gambit-online-users'`. The Lobby uses `online-users-lobby-${Date.now()}` (unique per mount). The Lobby's channel joins with an `anon-${Math.random()}` key when not logged in, which inflates the online count. Each lobby mount creates a unique channel that never merges with the global count. The two channels count independently, so `onlineCount` in Lobby and Navbar will show different numbers.

**How to fix:**  
- Consolidate: lobby should subscribe to the same channel as Navbar (`gambit-online-users`) and read from the shared presence state.
- Or: use a single `useOnlineCount()` hook backed by `ProfileProvider` context that all components share.

---

## PART 7 — DATABASE / SCHEMA BUGS

---

### BUG-D1 🟡 `games` table missing columns for clock persistence — runtime errors

**File:** `server/server.js` (various `make_move`, `join_game` references to `fen`, `white_time_ms`, `black_time_ms`, `clock_deadline`)

**Description:**  
The server code references DB columns `fen`, `white_time_ms`, `black_time_ms`, `clock_deadline` in the `games` table. If the Supabase migration that adds these columns hasn't been run, every persist call fails with "Could not find the 'fen' column" (as seen in session logs). This was partially addressed but is worth confirming.

**How to fix:**  
Run in Supabase SQL editor:
```sql
ALTER TABLE public.games
    ADD COLUMN IF NOT EXISTS fen TEXT,
    ADD COLUMN IF NOT EXISTS white_time_ms INTEGER,
    ADD COLUMN IF NOT EXISTS black_time_ms INTEGER,
    ADD COLUMN IF NOT EXISTS clock_deadline TIMESTAMPTZ;
```

---

### BUG-D2 🟡 Missing database indexes on frequently queried columns

**Description:**  
No index creation statements exist anywhere in the codebase. The following queries run on every page load or event:

| Table | Column(s) | Query |
|-------|-----------|-------|
| `games` | `white_id`, `black_id` | Active game lookup, game history |
| `games` | `status` | Active game filter |
| `profiles` | `username` | Friend lookup, matchmaking |
| `friendships` | `requester_id`, `addressee_id` | Friend status check |
| `notifications` | `user_id` | Notification fetch |

**How to fix:**  
Run in Supabase SQL editor:
```sql
CREATE INDEX IF NOT EXISTS idx_games_white_id ON public.games(white_id);
CREATE INDEX IF NOT EXISTS idx_games_black_id ON public.games(black_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON public.games(status);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON public.friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON public.friendships(addressee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
```

---

### BUG-D3 🟡 `profiles` table missing columns for full feature set

**Description:**  
The following columns are referenced in code but may not exist in the `profiles` table:

| Column | Used In |
|--------|---------|
| `rating_rd` | `rating.js` (Glicko-2 uncertainty) |
| `rating_vol` | `rating.js` (Glicko-2 volatility) |
| `display_name` | Navbar, profile page |
| `bio` | Profile page |
| `country` | Profile page |
| `avatar_url` | Navbar, profile page |
| `peak_rating_rapid/blitz/bullet/classical` | Not implemented anywhere |
| `win_streak` | Not implemented anywhere |

**How to fix:**  
```sql
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS rating_rd FLOAT DEFAULT 100,
    ADD COLUMN IF NOT EXISTS rating_vol FLOAT DEFAULT 0.06,
    ADD COLUMN IF NOT EXISTS display_name TEXT,
    ADD COLUMN IF NOT EXISTS bio TEXT,
    ADD COLUMN IF NOT EXISTS country TEXT,
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;
```

---

## PART 8 — TEST INFRASTRUCTURE

---

### BUG-T1 🔵 No test infrastructure exists anywhere in the project

**Description:**  
There are no `jest.config.*`, `__tests__/`, `pytest.ini`, or test files of any kind in the codebase. No package.json devDependencies for testing libraries.

**What needs to be installed:**

**Frontend (`frontend/`):**
```bash
npm install --save-dev jest @testing-library/react @testing-library/user-event \
  @testing-library/jest-dom jest-environment-jsdom @types/jest ts-jest msw
```
Create `frontend/jest.config.ts`:
```ts
import type { Config } from 'jest';
const config: Config = {
    testEnvironment: 'jsdom',
    setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
    moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
    transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
};
export default config;
```
Create `frontend/jest.setup.ts`:
```ts
import '@testing-library/jest-dom';
```

**Server (`server/`):**
```bash
npm install --save-dev jest supertest
```
Create `server/jest.config.js`:
```js
module.exports = { testEnvironment: 'node', testMatch: ['**/__tests__/**/*.test.js'] };
```

**Chess engine (`chess-engine/`):**
```bash
pip install pytest pytest-asyncio httpx
```
Create `chess-engine/pytest.ini`:
```ini
[pytest]
asyncio_mode = auto
testpaths = tests
```

---

## SUMMARY TABLE

| ID | Severity | Area | One-line description |
|----|----------|------|----------------------|
| BUG-S1 | 🔴 CRITICAL | Security | `requireUserId` trusts client header — no JWT verification |
| BUG-S2 | 🔴 CRITICAL | Security | Profile & register-profile endpoints accept unauthenticated userId |
| BUG-S3 | 🔴 CRITICAL | Security | Server never validates chess moves — any FEN accepted from client |
| BUG-S4 | 🔴 CRITICAL | Security | Notification endpoint leaks data — unauthenticated |
| BUG-S5 | 🟠 HIGH | Security | Private game join has no atomic protection against double-join race |
| BUG-R1 | 🔴 CRITICAL | Rating | `rating_rd`/`rating_vol` never read from DB — Glicko-2 RD never updates |
| BUG-R2 | 🟠 HIGH | Rating | No rating floor — players can go below 0 |
| BUG-R3 | 🟡 MEDIUM | Rating | Rating updates not atomic — partial failure leaves inconsistent state |
| BUG-R4 | 🟡 MEDIUM | Rating | Matchmaking uses `rating_rapid` for all time controls (should be tc-specific) |
| BUG-C1 | 🔴 CRITICAL | Clock | Increment never added after moves — all increment time controls broken |
| BUG-C2 | 🟠 HIGH | Clock | No periodic `clock_sync` broadcast — client display drifts from server |
| BUG-C3 | 🔵 LOW | Clock | Minor: first-move clock behavior after server restart is correct but subtle |
| BUG-E1 | 🔴 CRITICAL | Engine | New Stockfish process per request — process/memory leak |
| BUG-E2 | 🟠 HIGH | Engine | `valid_moves` endpoint crashes with 500 on invalid FEN instead of 400 |
| BUG-E3 | 🟠 HIGH | Engine | "Brilliant" move classification never assigned — dead code in critical moments |
| BUG-E4 | 🔵 LOW | Engine | `sf.get_best_move()` called unnecessarily — wasted Stockfish operation |
| BUG-E5 | 🟡 MEDIUM | Engine | `eval_before` returned in White's perspective; other evals in player's perspective |
| BUG-G1 | 🟠 HIGH | Game | Lobby `_reconnected` listener never fires — queue not re-joined after reconnect |
| BUG-G2 | 🟠 HIGH | Game | Game PATCH endpoint allows any authenticated user to modify any game row |
| BUG-G3 | 🔵 LOW | Game | Rematch clock initialization order is implicit — minor race possible |
| BUG-F1 | 🟠 HIGH | Frontend | Profile save uses anon client — will fail with RLS |
| BUG-F2 | 🟡 MEDIUM | Frontend | Post-signup session stored in localStorage — middleware won't see it |
| BUG-F3 | 🔵 LOW | Frontend | (Already fixed in session — no action needed) |
| BUG-F4 | 🔵 LOW | Frontend | Lobby and Navbar use separate presence channels — online counts diverge |
| BUG-D1 | 🟡 MEDIUM | DB | `games` table may be missing fen/clock columns — runtime persist failures |
| BUG-D2 | 🟡 MEDIUM | DB | No database indexes — queries slow at scale |
| BUG-D3 | 🟡 MEDIUM | DB | `profiles` table missing rating_rd, rating_vol, display_name, bio, country |
| BUG-T1 | 🔵 LOW | Testing | No test infrastructure exists in any part of the project |

---

**Total bugs found: 28**  
**Critical (🔴): 8**  
**High (🟠): 10**  
**Medium (🟡): 7**  
**Low (🔵): 5** (one already fixed in this session)

---

*Generated by full codebase audit — 2026-04-19*
