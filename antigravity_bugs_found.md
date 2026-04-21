# Antigravity — Deep Audit & Zero-Day Vulnerability Report
> **Date:** 2026-04-21
> **Scope:** Full codebase strict audit — backend, frontend, sockets, database schema, auth, and UX.
> **Status:** Living document. Bugs marked ✅ are resolved.

---

## 🔴 CRITICAL — Broken Core Features

### BUG-C1 🔴 "Play a Friend" Invite Link Generation Silently Fails (CONFIRMED)
**Files:**
- `frontend/app/lobby/page.tsx` (line 501–524) — **Inline handler (BROKEN)**
- `frontend/app/lobby/page.tsx` (line 176–207) — `handleCreatePrivate` function (correct but unused from modal)

**Root Cause:**
There are **two separate implementations** of the invite link generation in the lobby. The inline button's `onClick` handler (line 510) calls `/api/games/private/create` **without an `Authorization: Bearer` header**:
```javascript
// ❌ BROKEN — no auth header
const res = await fetch(`${socketUrl}/api/games/private/create`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: profile.id, timeControl, color, isRated })
});
```
The backend `requireUserId()` immediately rejects this with **401 Unauthorized**. The `catch {}` block silently swallows the error and resets to `'config'` state — so the user sees nothing but the spinner briefly disappearing. The correct `handleCreatePrivate` function (line 176) fetches the session and includes the Bearer token, but **it is never called** — the button calls its own inline handler instead.

**Impact:** "Play a Friend" / invite link generation is **completely non-functional**.
**Fix:** Wire the inline button to call `handleCreatePrivate()` which already has correct auth, or merge the inline handler to include `Authorization` header.

---

### BUG-C2 🔴 Challenge Notifications Never Delivered to Recipient (CONFIRMED)
**Files:**
- `server/server.js` (line 592–594)
- `frontend/app/challenge/[username]/page.tsx` (line 51–59)
- `frontend/components/Navbar.tsx` (line 48–62)

**Root Cause:**
The server correctly routes `challenge_request` to the target user's socket room via `io.to('user_${data.to_user_id}').emit('challenge_request', data)`. The Navbar correctly listens on `challenge_request` and shows a banner. **However**, the `socket.join('user_${userId}')` in the server requires an `authenticate` event to be emitted first (line 322–325). 

The **recipient** only joins their `user_` room when they emit `authenticate`. This happens in the SocketProvider when the profile is loaded, but there is **no guarantee the recipient is currently online/connected** when a challenge is sent. If the recipient:
- Opened the app before the challenger visited their profile
- Has a stale socket connection
- Is on any page that doesn't explicitly re-authenticate the socket

...they **will never receive the challenge event** because the socket room delivery silently fails. There is **no fallback persistence** — no database notification is created for challenges, unlike friend requests.

**Further issue:** The `challenge_request` arrives as a live socket event but is **never written to the `notifications` table**. If the recipient is offline, the challenge is permanently lost.

**Impact:** Challenges are invisible to the recipient in most real-world scenarios.
**Fix:** On `challenge_request`, also insert a row into `notifications` table with `type: 'challenge'` payload. On reconnect/page load, check for pending challenge notifications.

---

## 🔴 CRITICAL — Concurrency & Race Conditions

### BUG-A1 🔴 Python Engine Stateful Thread-Tearing
**File:** `chess-engine/engine.py` (`get_stockfish_instance`)

**Description:** The Singleton returns the *same mutable Stockfish instance* to all FastAPI threads simultaneously. If Thread A (background analysis) and Thread B (user browser request) both hit the engine:
1. Thread A calls `sf.set_fen_position(fen_A)`
2. Thread B calls `sf.set_fen_position(fen_B)`  
3. Thread A calls `sf.get_evaluation()` → *Receives results for Thread B's board!*

**Impact:** Cross-contamination of engine evaluations. Analysis outputs wildly incorrect results or crashes the subprocess pipe with interleaved UCI commands.
**Fix:** Object Pool of Stockfish instances using Python's `queue.Queue` (4–8 instances minimum).

---

### BUG-A2 🔴 Redis `updateGame` Asynchronous Overwrite
**File:** `server/lib/gameStore.js` (lines 28–34)

**Description:** The `updateGame` function is an unguarded Read-Modify-Write cycle. In Bullet chess, two socket events arriving within milliseconds will:
1. Both read the same `game` snapshot from Redis
2. Both apply their changes to *that same stale snapshot*
3. The second write completely zeros out the first write's move/clock changes

**Impact:** Clock rollbacks, erased moves, disconnected FEN during fast play.
**Fix:** Use a Redis Lua Script for atomic JSON mutation, or a per-game mutex lock in Node.

---

## 🟠 HIGH — Data Sync & Functional Gaps

### BUG-B1 🟠 No Notification Created When Friend Request Is Sent
**Files:** `server/server.js` (line 204), `supabase/migrations/00001_initial_schema.sql` (line 99–106)

**Description:** When a friend request is sent via `POST /api/friends/request`, the server inserts to the `friendships` table but **never inserts a row into `notifications`**. The `notifications` table exists and has the correct schema with `type`, `payload`, `read` fields. The Navbar polls `/api/notifications` and listens for real-time updates, but the friend request event never appears there.

**Impact:** Recipients have no in-app notification badge that someone sent them a friend request unless they navigate to their own Friends tab manually.
**Fix:** After inserting into `friendships`, also `INSERT INTO notifications (user_id, type, payload)` targeting the `addressee_id`.

---

### BUG-B2 🟠 Challenge Page Has No "Not Logged In" Guard
**File:** `frontend/app/challenge/[username]/page.tsx` (line 48–61)

**Description:** `handleSend()` checks `!myProfile` and returns early, but shows no error to the user. If `myProfile` is null (not logged in or profile loading failed), the button press does nothing silently — the button text doesn't change, there's no redirect to login, and no error message appears.

**Impact:** Logged-out users can reach the challenge page and get stuck with an unresponsive button.
**Fix:** Show a login prompt or redirect to `/login?redirect=/challenge/${username}` if `!myProfile`.

---

### BUG-B3 🟠 Supabase Clock Snapshot Contention on Every Move
**File:** `server/server.js` (lines 648–655)

**Description:** A `supabase.from('games').update({white_time_ms, black_time_ms})` fires **on every clock tick** (every 1,000ms globally for all active games). At scale, this causes severe PostgreSQL row-level write contention.

**Fix:** Since Redis is the authoritative real-time state, only flush clock/FEN to PostgreSQL on `game_end`.

---

### BUG-B4 🟠 Frontend Clock Rubber-banding
**File:** `frontend/app/game/[id]/page.tsx`

**Description:** Frontend uses a local `setInterval` to count down UI clocks AND listens for `clock_sync` from the server. When the `clock_sync` payload arrives with network jitter, the hard state override fights the local interval causing visible time jumps.

**Fix:** Gently interpolate against `serverTimestamp` differential rather than hard-overriding.

---

### BUG-B5 🟠 Notifications Table Has No INSERT RLS Policy
**File:** `supabase/migrations/00001_initial_schema.sql` (lines 147–155)

**Description:** The `notifications` table has RLS policies for `SELECT` and `UPDATE`, but **no `INSERT` policy**. The server uses the Supabase service role key for writes (bypasses RLS), but if any future code tries to insert notifications using a user-scoped client, it will silently fail.

**Impact:** Any client-side notification creation will be blocked with no error shown.
**Fix:** Add `CREATE POLICY "Service can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);` or ensure all inserts go through service role.

---

### BUG-A3 🟠 Supabase Trigger Contention on Clock Snapshots
*(Already documented above as BUG-B3)*

---

## 🟡 MEDIUM — Edge Cases & UX Gaps

### BUG-M1 🟡 Lobby "Play a Friend" Modal — Second Button (handleCreatePrivate) Dead Code
**File:** `frontend/app/lobby/page.tsx`

**Description:** `handleCreatePrivate()` (line 176) is never called from any button in the rendered UI. The "Generate Invite Link" button uses its own inline handler instead. This function is orphaned dead code.

---

### BUG-M2 🟡 Join Page — Creator Detection Logic Is Fragile
**File:** `frontend/app/join/[token]/page.tsx` (line 43, 100)

**Description:** Creator is detected via `me.id === (game.white_id || game.black_id)`. If `game.white_id` is `null` (creator chose Black), the `||` falls back to `game.black_id`. However, if `game.black_id` is also falsy, the creator will see the "Accept & Play" button instead of the waiting spinner, and clicking it will attempt to join their own game.

**Fix:** Track creator via `game.creator_id` field, or at minimum check both IDs explicitly: `me.id === game.white_id || me.id === game.black_id`.

---

### BUG-M3 🟡 OAuth Callback Cookie Propagation Race
**File:** `frontend/app/auth/callback/route.ts`

**Description:** PKCE session cookie is set, but using `NextResponse.redirect` without applying cookie payloads to the request mutation object can cause middleware to miss the auth token on first render, flickering users back to the login screen momentarily.

---

### BUG-M4 🟡 Rematch Accept — Color Assignment Is Deterministic from Requester
**File:** `server/server.js` (line 597–609)

**Description:** In `challenge_accept`, the `hostId` is derived from `challengerColor === 'white' ? data.from_user_id : data.to_user_id`. For rematches (`rematch_accept`), the color is hardcoded to `'random'` but the logic still seeds `from_user_id` as white host. This means the same player always gets White in rematches until a true random resolution is implemented.

---

### BUG-M5 🟡 `notifications/read-all` Route Conflict
**File:** `server/server.js` (line 305)

**Description:** `PUT /api/notifications/read-all` is registered **before** `PUT /api/notifications/:id/read` (line 293). Express routing is order-sensitive. The string `read-all` will be captured by `:id` param before reaching the `read-all` handler if route ordering is ever changed. Currently works but is fragile.

**Fix:** Register the more-specific `/read-all` route before the wildcard `/:id/read` (currently correct, but document explicitly).

---

### BUG-M6 🟡 Lobby Custom Time Control Picker Has No Validation
**File:** `frontend/app/lobby/page.tsx`

**Description:** The custom time control modal allows `customMin = 0` and `customInc = 0` (both set via `setCustomMin`/`setCustomInc` without minimum guards). Sending a game with `0+0` time control to the server will create a game that immediately triggers timeout for both players.

**Fix:** Enforce `min >= 1` or show validation error.

---

### BUG-M7 🟡 Duplicate Socket Auth on Queue Join
**File:** `frontend/app/lobby/page.tsx` (lines 157–168)

**Description:** `handlePlayOnline` emits `authenticate` followed immediately by `join_queue`. The `authenticate` handler on the server does async work (Redis game lookups). If `join_queue` arrives before `authenticate` completes, `userId` won't be in `userSockets` yet and the queue join may lack proper user identity.

**Fix:** Chain `join_queue` inside the `authenticate` handler's callback or use `socket.once('authenticated', ...)` confirmation pattern.

---

## 🔵 LOW — Style, Consistency, & Minor

### BUG-L1 🔵 `handleCreatePrivate` Dead Code
`handleCreatePrivate` function at lobby page line 176 is never invoked. Remove or wire it to the modal button.

### BUG-L2 🔵 Challenge Page Shows All 7 Time Controls in a 4-Column Grid Overflow
**File:** `frontend/app/challenge/[username]/page.tsx` (line 100)
7 controls in a `grid-cols-4` layout causes the last 3 to wrap onto a second row misaligned. A `grid-cols-3` or `grid-cols-4 sm:grid-cols-7` would fix this.

### BUG-L3 🔵 `antigravity_bugs_found.md` Referenced Inline but Never Appears in Navbar/UI
The bug file exists on disk but has no link from the app itself. A `/admin/bugs` route would make this useful for the developer dashboard.

### BUG-L4 🔵 Login Page Not Listed in `NEXT_PUBLIC_SOCKET_URL` Fallbacks
Auth pages that POST to the Node backend directly (signup, join) all individually hardcode `'http://127.0.0.1:3001'` fallback. Should be centralized in a `lib/config.ts` constant.

---



---

# Round 2 Audit — Deep Server & Full Stack Analysis
> **Date:** 2026-04-21 (Audit Round 2)
> **Scope:** Full server.js, all services (friends.js, clock.js, matchmaking.js, rating.js, gameStore.js), all frontend pages, database schema, auth flow

---

## 🔴 CRITICAL — Server-side Logic Bombs

### BUG-S1 🔴 `game_end` Socket Event Is Client-Authoritative — Exploitable
**File:** `server/server.js` (line 524–565)

**Description:** The `game_end` socket handler accepts `data.white_id`, `data.black_id`, `data.result`, and `data.time_control` **directly from the client socket payload** without any server-side verification:
```javascript
socket.on('game_end', async (data) => {
    // data comes directly from the frontend commitMove() call
    const outcome = data.result?.toLowerCase().includes('white') ? 'white' : 'black'
    await supabase.from('games').update({ status: 'completed', winner_id: ... })
    await ratingService.processGameEnd(data.game_id, data.white_id, data.black_id, outcome, data.time_control, data.is_rated)
```
Any player can **forge a `game_end` socket event** by calling `socket.emit('game_end', { game_id: '...', result: 'White wins', white_id: myId, ... })` from their browser console, granting themselves a win, rating gain, and win counter increment.

**Impact:** Complete **rating manipulation** and **win fraud**. This is the most critical security vulnerability in the entire codebase.
**Fix:** The server must verify the chess position from Redis (using `game.fen` and chess.js) to confirm the game is actually over before accepting a client-emitted `game_end`. Never trust the client's `result` field.

---

### BUG-S2 🔴 `make_move` Does Not Verify the Moving Player's Identity
**File:** `server/server.js` (line 437–518)

**Description:** The `make_move` handler reads `game.activeSide` but **never checks whether the socket that sent the move actually corresponds to the player whose turn it is**:
```javascript
socket.on('make_move', async (data) => {
    const game = await getGame(data.game_id);
    if (!game || game.status !== 'active') return;
    // ❌ NO check: is the user sending this move actually the active side?
    const movedSide = game.activeSide;
```
`socketUsers.get(socket.id)` is available to resolve the socket to a userId. But it is never compared to `game.whiteId` or `game.blackId`. A **spectator or the opposing player** can send moves on their opponent's turn.

**Impact:** Any connected spectator (or even the opponent) can make moves on behalf of the wrong player, manipulating the game outcome.
**Fix:** Before processing: `const userId = socketUsers.get(socket.id); const expectedId = game.activeSide === 'w' ? game.whiteId : game.blackId; if (userId !== expectedId) return;`

---

### BUG-S3 🔴 Matchmaking `join_queue` Trusts Entire User Object from Client
**File:** `server/server.js` (line 340–342) + `services/matchmaking.js` (line 14–34)

**Description:** The `join_queue` socket event is called with `data.user = myProfile` from the frontend. The server passes `data.user` directly to `matchmaking.joinQueue(data.user, ...)`. The matchmaking service reads `user.rating` for pairing. A client can forge any rating (`socket.emit('join_queue', { user: { id: myId, rating: 9999 }, ... })`) to match against high-rated players.

**Impact:** Rating spoofing in matchmaking queue. Players can fake a 3000+ rating to be placed in any bracket.
**Fix:** Look up the player's actual rating from Supabase using the authenticated `userId` from `socketUsers`. Never trust rating from the client.

---

### BUG-S4 🔴 `decline` route in `server.js` Still Uses `updated_at` Column
**File:** `server/server.js` (line 271)

**Description:** After the previous fix removed `updated_at` from the accept endpoint, the **decline** endpoint was missed:
```javascript
app.put('/api/friends/:id/decline', async (req, res) => {
    const { error } = await supabase.from('friendships')
        .update({ status: 'declined', updated_at: new Date().toISOString() }) // ❌ column doesn't exist
```
The `friendships` table schema has no `updated_at` column (confirmed in migration). This causes **declining a friend request to silently fail** on the Supabase side (the row is not updated, RLS returns an error, and the UI appears to hang or revert).

**Impact:** Users cannot decline friend requests. The UI may appear to succeed client-side but the row stays in `pending` forever.
**Fix:** Remove `updated_at: new Date().toISOString()` from the decline update payload — same fix as was applied to accept.

---

## 🟠 HIGH — Server & Data Integrity

### BUG-S5 🟠 `joinPrivateGame` Can Double-Join the Creator
**File:** `server/services/friends.js` (line 65–83)

**Description:** In `joinPrivateGame`, when a creator who chose color `random` calls the join endpoint again (e.g., on page reload), the check is:
```javascript
if (white_id && white_id === userId) return game; // Creator rejoining
if (black_id && black_id === userId) return game;
```
This is correct for the happy path. But if `white_id` is `null` (via the `else` branch in create where `black_id = userId`), **line 65–67 is dead unreachable code** that reassigns `white_id = game.white_id` (which is null). The comment says "shouldn't happen based on create" but the create function explicitly sets one side to null.

More critically: the creator's second join attempt returns `game` early (good), but the `.update(...).select().maybeSingle()` on a `status='active'` game would fail silently (as `eq('status','waiting')` filter is not met) — **losing the returned `data` reference** and causing the caller to crash with "Cannot read property 'id' of undefined".

**Impact:** Server reconnect crash if creator reloads / network hiccup during game setup.

---

### BUG-S6 🟠 Clock `finalizeExpiredGame` Called After Redis State Already Set to Completed
**File:** `server/services/clock.js` (line 67–74, 85–93)

**Description:** When a timeout or disconnect abandon fires, the code:
1. `setGame(gameId, { ...game, status: 'completed' })` — updates Redis
2. `removeActiveGame(gameId)` — removes from active set
3. emits `game_end`
4. **then** calls `finalizeExpiredGame(...)` — which does `supabase.update().eq('status','active')`

Because step 1 already marks Redis as `completed`, but step 4's Supabase query uses `.eq('status', 'active')` on the *Supabase* row (which may still be `active`), this usually works. But if the client's `game_end` event fires between steps 1 and 4 and calls the `game_end` socket handler on the server, that handler also calls `supabase.update().eq('status','active')`, creating a **double finalize race** where `ratingService.processGameEnd` is called **twice for the same game**.

**Impact:** Players may receive double rating changes (win +50 twice, or fluctuations). Stats (`games_played`, `wins`) increment twice.

---

### BUG-S7 🟠 Matchmaking Always Marks Games as `isRated: true` Ignoring User Preference
**File:** `server/services/matchmaking.js` (line 152)

**Description:** In `createGame()`, the Redis game object is always initialized with `isRated: true`, regardless of whether the players joined with a rated or unrated preference. The frontend sends no `isRated` field in `join_queue` event data, and the matchmaking service never stores or checks it.

**Impact:** All matchmade games are rated, even if the player wanted a casual game.

---

### BUG-S8 🟠 `send_message` Handler Has No Auth Check — Anonymous Chat Spam
**File:** `server/server.js` (line 520–522)

**Description:**
```javascript
socket.on('send_message', (data) => {
    io.to(`game_${data.game_id}`).emit('chat_message', data);
});
```
There is **zero authentication** on this handler. Any socket client can call `socket.emit('send_message', { game_id: 'any-game-uuid', from: 'fake-name', text: 'spam' })` and inject messages into any game's chat.

**Impact:** Chat spam/abuse in any live game, including impersonation of other users.
**Fix:** Validate `data.game_id` matches a game where `socketUsers.get(socket.id)` is a participant. Set `data.from` from server-side username lookup, not client payload.

---

### BUG-S9 🟠 `spectate_game` Has No Auth or Existence Check
**File:** `server/server.js` (line 433–435)

**Description:**
```javascript
socket.on('spectate_game', (gameId) => {
    socket.join(`game_${gameId}`);
});
```
Any socket can join any game room with any string as `gameId`. They will then receive all `move_made`, `clock_sync`, `game_end`, and chat events for that room.

**Impact:** While spectating is intentional, there's no existence check — a malicious client can probe for valid game IDs by joining random UUIDs.

---

### BUG-S10 🟠 Schema Column Mismatch: `white_time_ms`/`black_time_ms` vs `white_clock_ms`/`black_clock_ms`
**File:** `supabase/migrations/00001_initial_schema.sql` (line 40–41) vs `server/server.js` (line 502–504)

**Description:** The database schema defines columns as `white_clock_ms` and `black_clock_ms`:
```sql
white_clock_ms INTEGER,
black_clock_ms INTEGER,
```
But the server code writes to `white_time_ms` and `black_time_ms`:
```javascript
supabase.from('games').update({
    fen: data.fen,
    white_time_ms: Math.round(whiteClockMs),   // ❌ column doesn't exist
    black_time_ms: Math.round(blackClockMs),   // ❌ column doesn't exist
```
This mismatch means **clock snapshots are never persisted to the database**. On server restart, the restored clocks from `dbGame.white_time_ms` (line 366) will always be null, reverting to the full starting time.

**Impact:** After any server restart during an active game, both players' clocks are reset to the original time control duration. All clock progress is lost.
**Fix:** Either rename the schema columns to `white_time_ms`/`black_time_ms`, or update all server references to use `white_clock_ms`/`black_clock_ms`.

---

### BUG-S11 🟠 Cookie-Based Auth Parser Is Duplicated in 4+ Frontend API Routes
**File:** `frontend/app/api/friends/[id]/route.ts`, `frontend/app/api/friends/pending/route.ts`, `frontend/app/api/notifications/read/route.ts`, etc.

**Description:** The manual JWT cookie parsing logic (the `getUserId` function that reads `sb-*-auth-token` cookies, base64-decodes the JWT, and checks expiry) is **copy-pasted verbatim** across at least 4 API route files. This code:
1. Will silently fail on chunked cookies if `i < 10` loop runs out before reading all chunks
2. Has a 60-second clock skew tolerance that may cause session use-after-expiry
3. Is fragile — any Supabase cookie naming change will break all routes simultaneously

**Impact:** Single point of failure across all frontend API routes. Maintenance nightmare.
**Fix:** Extract into `lib/auth/getCookieUserId.ts` shared utility.

---

## 🟡 MEDIUM — Edge Cases & Logic Errors

### BUG-S12 🟡 `join_queue` Inline Button Skips `authenticate` Socket Step
**File:** `frontend/app/lobby/page.tsx` (line 329–347)

**Description:** The inline "Play Online" button in the lobby does **not** emit `socket.emit('authenticate', myProfile.id)` before joining the queue — unlike the old `handlePlayOnline()` function which did. The server's `join_game` handler relies on `socketUsers.get(socket.id)` to set `userActiveGame`, which only works if the socket was previously authenticated.

**Impact:** New sessions that click play immediately may not have their socket authenticated, so `userActiveGame` is never set, breaking disconnect detection.

---

### BUG-S13 🟡 Matchmaking Queue `setInterval` Is Never Cleared on Server Shutdown
**File:** `server/services/matchmaking.js` (line 11)

**Description:** `setInterval(() => this.matchPlayers(), 1000)` runs forever and has no `clearInterval` reference stored. In test environments or when the server restarts gracefully, this interval leaks and continues running with stale state.

---

### BUG-S14 🟡 `getGameByToken` Uses `.single()` Without Row Guarantee
**File:** `server/services/friends.js` (line 42–55)

**Description:** `supabase.from('games').select(...).eq('invite_token', token).single()` — if no row matches, `.single()` throws an error (PGRST116 "no rows returned"). This is caught by `if (error) return null`, but the error is swallowed. If the `invite_token` column ever has a duplicate (schema has `UNIQUE` but the check is enforced only at DB level), `.single()` would throw on the first row. Use `.maybeSingle()` for safe optional fetches.

---

### BUG-S15 🟡 Rating Field `_ratingField()` Has Wrong Threshold for Classical
**File:** `server/services/rating.js` (line 106–112)

**Description:**
```javascript
_ratingField(timeControl) {
    const mins = parseInt(timeControl) || 10;
    if (mins <= 2) return 'rating_bullet';
    if (mins <= 5) return 'rating_blitz';
    if (mins <= 15) return 'rating_rapid';
    return 'rating_classical';   // ← 16–30 min all go to classical
}
```
A 20-minute game returns `rating_classical`. Standard chess categories are: Bullet ≤2, Blitz 3–5, Rapid 10–60, Classical >60. A 20-minute game should be Rapid, not Classical.

**Impact:** 20-min and 15+10 increment games update the classical rating instead of rapid.

---

### BUG-S16 🟡 `decline` Route in Frontend API Uses Wrong HTTP Verb
**File:** `frontend/app/api/friends/[id]/route.ts` (line 41–64)

**Description:** The single `PUT` handler at `/api/friends/[id]` handles both `accept` and `decline` via `?action=accept|decline` query param. The frontend profile page calls this correctly, but the server (`server.js`) has **separate dedicated endpoints** for accept (`PUT /api/friends/:id/accept`) and decline (`PUT /api/friends/:id/decline`). If any code accidentally calls the Node backend's endpoints instead of the Next.js API route, behavior diverges silently.

---

### BUG-S17 🟡 `send_message` Persists Nothing to `messages` Table
**File:** `server/server.js` (line 520–522)

**Description:** Chat messages are only broadcast via socket and **never persisted** to the `messages` table (which exists in the schema). If either player refreshes during a game, all chat history is lost. The `messages` table (`game_id`, `user_id`, `content`) is completely unused.

---

### BUG-S18 🟡 `notifications` Fetch in Navbar Uses Wrong Backend URL
**File:** `frontend/components/Navbar.tsx` (line 64–71)

**Description:** `fetchNotifications` calls `/api/notifications` — this hits the **Next.js API route**, not the Node server. However, `GET /api/notifications` is defined in `server/server.js` but **not** in the Next.js `/app/api/` directory. There is no `frontend/app/api/notifications/route.ts` file — only `frontend/app/api/notifications/read/route.ts` (for marking read). The GET fetch will return a 404.

**Impact:** The notification bell never loads any notifications; it silently shows "No notifications" even if the `notifications` table has rows.
**Fix:** Create `frontend/app/api/notifications/route.ts` that proxies to the Node server, OR move the GET handler to the Next.js API.

---

## 🔵 LOW — Schema, Config, Consistency

### BUG-S19 🔵 `profiles` Table Missing `display_name`, `bio`, `country`, `sex`, `is_public` Columns
**File:** `supabase/migrations/00001_initial_schema.sql`

**Description:** The server's `PUT /api/profile` handler updates `{ display_name, bio, country, sex, is_public }` on the profiles table, but **none of these columns exist in the schema migration**. The schema only has: `id`, `username`, `avatar_url`, rating fields, stat fields, accuracy fields, `created_at`. These columns were silently added ad-hoc in Supabase without being reflected in the migration file.

**Impact:** The migration file is out of sync with production. Any fresh deployment will miss these columns and all profile update calls will fail silently.
**Fix:** Add the missing columns to the SQL migration file.

### BUG-S20 🔵 `matchmaking_queue` Table Is Never Used
**File:** `supabase/migrations/00001_initial_schema.sql` (line 79–86)

**Description:** The `matchmaking_queue` database table exists in the schema but the actual matchmaking service uses an **in-memory `Map`** exclusively. The table is neither written to nor read from anywhere in the codebase. On server restart, all queued players disappear permanently.

### BUG-S21 🔵 `games.increment` Column Type Mismatch
**File:** `supabase/migrations/00001_initial_schema.sql` (line 34)

**Description:** `increment INTEGER NOT NULL DEFAULT 0` — but the server writes `increment: p1.increment` where `p1.increment` comes from the socket event's `data.increment`, which is parsed by `parseIncrement()` returning milliseconds (e.g., `5000` for 5-second increment). Storing milliseconds in a column named `increment` (implicitly seconds) is inconsistent with all other time representations.

### BUG-S22 🔵 `requireUserId` Is Defined After First Use in `server.js`
**File:** `server/server.js` (line 162)

**Description:** `requireUserId` function is declared at line 162, but the route at line 107 (`POST /api/games/private/create`) calls it. In plain JS with `function` keyword this is hoisted — but it's an `async function`, so hoisting applies. No immediate bug, but poor code structure that can cause maintenance confusion.



