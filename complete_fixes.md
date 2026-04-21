# Gambit Platform – Complete Fix Log

## Architecture Overview
- **Frontend:** Next.js 14 App Router (port 3000) — TypeScript, Tailwind CSS
- **Backend:** Node/Express + Socket.io (port 3001)
- **Engine:** Python/Stockfish (port 8001)
- **Database:** Supabase (PostgreSQL + Auth)
- **Auth pattern:** HTTP-only cookies parsed manually (chunked `sb-<ref>-auth-token` cookie → JWT decode → `sub` = userId). No Supabase Auth network call on hot path.

---

## Session 1 – Auth, Lobby, Profile Foundation

### ✅ Fixed: Navbar auth flash
- **Problem:** Navbar showed "Log In / Sign Up" buttons briefly on every page load for authenticated users.
- **Root cause:** `user = null` on mount, async fetch takes ~200ms, buttons flash in that gap.
- **Fix:** Added `authLoading = true` state; show skeleton div instead of login buttons while loading.
- **File:** `frontend/components/Navbar.tsx`

### ✅ Fixed: `actions/auth.ts` admin client wrong type
- **Problem:** `createServerClient` from `@supabase/ssr` used for admin operations — requires cookie handlers, throws on server actions.
- **Fix:** Replaced with `createClient` from `@supabase/supabase-js` (plain admin client).
- **File:** `frontend/app/actions/auth.ts`

### ✅ Fixed: Lobby private game userId = null
- **Problem:** `handleCreatePrivate` called `supabase.auth.getUser()` in browser — returns null when session is HTTP-only cookie only.
- **Fix:** Fetch userId from `/api/profile/me` instead.
- **File:** `frontend/app/lobby/page.tsx`

### ✅ Created: Google OAuth callback route
- **File:** `frontend/app/auth/callback/route.ts`
- Auto-creates profile for first-time Google OAuth users with username derived from email.

### ✅ Fixed: Login/signup redirect not working
- **Problem:** `router.push('/lobby')` after login didn't navigate properly.
- **Fix:** Changed to `window.location.assign('/lobby')` for full page reload that re-reads cookie.
- **Files:** `frontend/app/login/page.tsx`, `frontend/app/signup/page.tsx`

### ✅ Created: Game history API route
- **File:** `frontend/app/api/profile/[username]/games/route.ts`
- Queries Supabase for completed games with player profile joins. Paginated (limit/offset).

### ✅ Fixed: Profile page redesign
- Complete Chess.com-style layout: header with avatar/online dot, tabs (Overview/Games/Stats/Friends), rating cards, record bar, recent games list.
- **File:** `frontend/app/profile/[username]/page.tsx`

---

## Session 2 – Game System, Rating, Friends

### ✅ Fixed: TypeScript JSX Fragment error in game page
- **Problem:** Game-over modal added as second sibling to `<div>` in `return()` — React requires single root.
- **Fix:** Wrapped entire return in `<>...</>` Fragment.
- **File:** `frontend/app/game/[id]/page.tsx`

### ✅ Fixed: `||` and `??` mixing in template literals
- **Problem:** `TS5076: '||' and '??' operations cannot be mixed without parentheses`
- **Fix:** Changed `?? 'White'` to `|| 'White'` in player display name template strings.
- **File:** `frontend/app/game/[id]/page.tsx`

### ✅ Fixed: GameRow interface missing rating fields
- **Problem:** `game.white?.rating_rapid` type error — interface only had `username` and `display_name`.
- **Fix:** Added all 4 rating fields to `GameRow.white` and `GameRow.black` interface.
- **File:** `frontend/app/profile/[username]/page.tsx`

### ✅ Fixed: Record (wins/losses/draws) not updating
- **Problem:** Server called `supabase.rpc('increment_game_stats', ...)` for unrated games — RPC doesn't exist in Supabase, silently fails.
- **Fix:** Replaced with direct `profiles` SELECT + UPDATE for both players.
- **File:** `server/server.js` → `game_end` socket handler

### ✅ Fixed: Rating not updating (Glicko-2 silent failure)
- **Problem:** `rating.js` selected `rating_rd, rating_vol` columns that don't exist in the `profiles` table → entire Supabase query failed.
- **Fix:** Removed those columns from the SELECT. They remain optional in the UPDATE (guarded by `'rating_rd' in wp`).
- **File:** `server/services/rating.js`

### ✅ Fixed: Game-over modal aesthetics and positioning
- **Replaced:** Chess.com green (`#6aaa64`) buttons with app's `bg-accent` / `bg-elevated` theme colors.
- **Positioning:** Changed from `fixed inset-0 flex items-center justify-center` (viewport center) to same fixed approach but with `pointer-events-none` wrapper so it appears centered in the viewport over the board without interfering with other UI.
- **File:** `frontend/app/game/[id]/page.tsx`

### ✅ Added: Rematch system
- "Rematch" button emits `rematch_request` via socket to opponent.
- Opponent sees accept/decline modal with ✓/✗ buttons.
- If accepted: server creates a new private game via `friendsService`, both players redirected.
- **Files:** `server/server.js` (new socket handlers), `frontend/app/game/[id]/page.tsx`

### ✅ Added: "New Game" goes to lobby
- "New Game" button in game-over modal navigates to `/lobby`.
- **File:** `frontend/app/game/[id]/page.tsx`

### ✅ Added: Rating change shown in game-over modal
- `rating_updated` socket event sets `whiteRatingChange` / `blackRatingChange`.
- Modal shows `+N` or `-N` rating change below result text.
- **File:** `frontend/app/game/[id]/page.tsx`

### ✅ Created: Stats API route
- **File:** `frontend/app/api/profile/[username]/stats/route.ts`
- Returns: `{ total, wins, losses, draws, ratings: {bullet,blitz,rapid,classical}, byCategory: {bullet: {played,wins,losses,draws}, ...} }`
- Aggregates completed games from DB by time control classification.

### ✅ Fixed: Stats tab — real data
- Replaced hardcoded placeholder charts with real stat cards.
- Shows total games, W/L/D counts (large numbers), and per-category breakdown with mini win bars.
- **File:** `frontend/app/profile/[username]/page.tsx`

### ✅ Added: Challenge system
- **New page:** `frontend/app/challenge/[username]/page.tsx`
  - Time control selector (7 presets)
  - Rated toggle
  - Color picker (White / Random / Black)
  - "Send Challenge" button → `socket.emit('challenge_request', ...)`
  - Shows "Challenge Sent…" state and "Declined" if rejected
- **Challenge button** on profile header links to `/challenge/[username]`
- **Challenge button** on each friend card in friends tab
- **Server handlers:** `challenge_request` → `challenge_accept` → creates game → both redirect; `challenge_decline` → notifies challenger
- **Files:** `server/server.js`, `frontend/app/challenge/[username]/page.tsx`, `frontend/app/profile/[username]/page.tsx`

### ✅ Added: Live challenge notifications in Navbar
- Incoming `challenge_request` socket events show a bottom-right toast banner anywhere on the site.
- Accept → `challenge_accept` socket → both players redirect to new game.
- Decline → `challenge_decline` socket → challenger sees "Declined" state.
- **File:** `frontend/components/Navbar.tsx`

### ✅ Fixed: Friends search
- Added search input in friends tab header — filters by username or display_name client-side.
- **File:** `frontend/app/profile/[username]/page.tsx`

### ✅ Created: Settings page with avatar upload
- **File:** `frontend/app/settings/page.tsx`
- Sidebar nav (Public Profile / Account sections)
- Camera button triggers hidden `<input type="file">` → uploads to Supabase Storage `avatars/` bucket → updates `avatar_url` in profile
- Display name, bio, country fields save via `PATCH /api/profile/me`
- Account section shows read-only username + 4 ratings
- **File:** `frontend/app/api/profile/me/route.ts` — PATCH now also accepts `avatarUrl`

### ✅ Fixed: Display name not used throughout
- Changed all `profile.username` references to `profile.display_name || profile.username`
- **Files:** `frontend/components/Navbar.tsx`, `frontend/app/game/[id]/page.tsx`

### ✅ Fixed: Online user count inaccurate
- **Root cause:** Each user joined their own unique channel `online-users-${profile.id}-${Date.now()}` — never sees other users.
- **Fix:** All users join the same shared channel `gambit-online-users`.
- **File:** `frontend/components/Navbar.tsx`

### ✅ Fixed: Friend request sending (CORS/auth failure)
- **Root cause:** Profile page called Node server at port 3001 directly (`${socketUrl}/api/friends/*`) with `x-user-id` header. CORS preflight blocked custom headers; also requires Node server to be running for auth.
- **Fix:** Created Next.js API routes for all friend operations (same-origin, cookie-based auth, admin Supabase client):
  - `frontend/app/api/friends/request/route.ts` — POST send request
  - `frontend/app/api/friends/status/[username]/route.ts` — GET check status
  - `frontend/app/api/friends/pending/route.ts` — GET incoming requests
  - `frontend/app/api/friends/route.ts` — GET friends list (supports `?userId=` for public profiles)
  - `frontend/app/api/friends/[id]/route.ts` — PUT accept/decline, DELETE remove
- Updated all profile page fetch calls to use `/api/friends/*` instead of `${socketUrl}/api/friends/*`.
- **Files:** 5 new API routes + `frontend/app/profile/[username]/page.tsx`

---

## Session 3 – Clock System, Rating Caps, Stale Closures, Caching

### ✅ Fixed: Double moves appearing in move list
- **Problem:** Every move appeared twice in the move list and FEN snapshot array.
- **Root cause:** `commitMove` called `setMoveList` and `setFenSnapshots` when the local player moved, then `onMoveMade` added the same move again when the server echoed it back.
- **Fix:** Removed `setFenSnapshots` and `setMoveList` calls entirely from `commitMove`. `onMoveMade` is now the single source of truth for move history — both players' moves flow through it.
- **File:** `frontend/app/game/[id]/page.tsx`

### ✅ Fixed: Stats/ratings not updating after games (stale closure)
- **Problem:** `commitMove` emitted `game_end` with `white_id: undefined, black_id: undefined` → server guard `if (!data.white_id || !data.black_id) return` skipped all rating/stat processing.
- **Root cause:** `gameData` not listed in `commitMove`'s `useCallback` dependencies → stale closure always saw the initial `null` value even after game data loaded.
- **Fix:** Added `gameDataRef = useRef<any>(null)` that stays in sync with `setGameData`. Inside `commitMove`, read `gameDataRef.current` instead of `gameData`. This pattern avoids needing `gameData` in deps (which would cause the callback to re-register on every game data update).
- **File:** `frontend/app/game/[id]/page.tsx`

### ✅ Fixed: Rating change -249/-279 (massive Glicko-2 swings)
- **Root cause:** Glicko-2 with RD=350 (maximum uncertainty) treats every game as high-stakes and produces huge swings on early games.
- **Fix 1:** Cap default RD at 150: `Math.min(wp.rating_rd ?? 100, 150)` — treats new players as having moderate uncertainty rather than maximum.
- **Fix 2:** Cap per-game change at ±50: `Math.max(-50, Math.min(50, newRating - oldRating))` — prevents any single game from changing rating by more than 50 points.
- **File:** `server/services/rating.js`

### ✅ Implemented: Server-side authoritative clock
- **Problem:** Client-side `setInterval` called `setGameOver` locally — only the player whose tab ticked to 0 saw game over. Opponent never received the event.
- **Fix:** 
  - Added `gameClocks` Map on server to store `{ whiteMs, blackMs, turn, lastTick, active, timerId }` per game.
  - `startClockTimer(gameId)`: fires `setTimeout` for remaining time; on expiry broadcasts `game_end` via `io.to(room).emit` to both players simultaneously, updates DB, processes ratings.
  - `make_move`: deducts elapsed ms from active player's clock, switches turn, includes `whiteMs`/`blackMs` in broadcast, persists FEN + clock to DB.
  - `join_game`: loads clock from DB (`white_time_ms`, `black_time_ms`, `clock_deadline`) if not in memory, sends `clock_sync` to rejoining socket.
  - `disconnect`: pauses clock (deducts elapsed, clears timer, sets `active: false`).
  - Client clock is now display-only — does NOT trigger game end.
- **Files:** `server/server.js`, `frontend/app/game/[id]/page.tsx`

### ✅ Fixed: Supabase service key env var mismatch
- **Problem:** `server/supabase.js` read `SUPABASE_SERVICE_KEY` but Railway env had `SUPABASE_SERVICE_ROLE_KEY` → admin client initialized with `undefined` key → all DB writes silently failed.
- **Fix:** `const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY` — accepts either name.
- Added startup diagnostic: logs which env var was found, or `FATAL` error if neither is set.
- **File:** `server/supabase.js`

### ✅ Fixed: Game restarts instead of resuming ("Resume Match" restarted the board)
- **Root cause A:** `make_move` handler never saved FEN to DB → `games.fen` always `null` → on rejoin, page assumed starting position.
- **Root cause B:** Page always called `setWhiteTime(mins * 60)` and `playGameStartSound()` unconditionally on load — reset clock even for in-progress games.
- **Root cause C:** `gameClocks` is in-memory only — server restart cleared all clock state.
- **Fix A:** Added `fen: game.fen` save in `make_move` DB update.
- **Fix B:** Added `isResume` detection: `const isResume = gd.fen && gd.fen !== startingFen`. If resuming, skip clock reset and start sound.
- **Fix C:** Added `white_time_ms`, `black_time_ms`, `clock_deadline` columns to `games` table. Restored from DB in `join_game` using `clock_deadline` (absolute timestamp) to compute true remaining time after restart.
- **Files:** `server/server.js`, `frontend/app/game/[id]/page.tsx`
- **Required SQL:**
  ```sql
  ALTER TABLE games 
  ADD COLUMN IF NOT EXISTS white_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS black_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS clock_deadline TIMESTAMPTZ;
  ```

### ✅ Fixed: Profile showing stale 1200 rating (Next.js route caching)
- **Problem:** Profile, stats, and games API routes were cached by Next.js — served same stale JSON even after DB was updated. Leaderboard showed correct ratings but profile showed 1200.
- **Root cause:** Next.js 14 statically caches `route.ts` handlers by default.
- **Fix:** Added `export const dynamic = 'force-dynamic'` to all 4 profile API routes:
  - `frontend/app/api/profile/[username]/route.ts`
  - `frontend/app/api/profile/[username]/stats/route.ts`
  - `frontend/app/api/profile/[username]/games/route.ts`
  - `frontend/app/api/profile/me/route.ts`
- Also added `{ cache: 'no-store' }` to all `fetch()` calls in `frontend/app/profile/[username]/page.tsx`.

### ✅ Created: `readme_first.md` — master reference document
- **File:** `/Users/chidanandh/desktop/Python Folders/Chess/Chess/Gambit/readme_first.md`
- 18 sections covering: architecture, directory map, startup commands, env vars table, full DB schema + required migrations, auth deep dive, key file responsibilities, do-not-touch danger zones, safe-to-edit table, complete socket events reference (client→server and server→client), rating system with Glicko-2 explanation, clock system lifecycle, game flow end-to-end, 10+ common bugs with root causes and fixes, logic decisions, pending TODOs by priority, deployment notes, and quick reference card.

---

## ⚠️ Requires Manual Supabase SQL (user must run)

```sql
-- 1. friendships table (REQUIRED for friend system to work)
CREATE TABLE IF NOT EXISTS public.friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    addressee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(requester_id, addressee_id)
);
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
-- Service role bypasses RLS so no policies needed for our admin client

-- 2. notifications table (for bell icon history)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type VARCHAR(50),
    title TEXT,
    body TEXT,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 3. Clock persistence columns (REQUIRED for resume-game to work)
ALTER TABLE games
ADD COLUMN IF NOT EXISTS white_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS black_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS clock_deadline TIMESTAMPTZ;

-- 4. Optional: Glicko-2 columns (improves rating accuracy)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS rating_rd FLOAT DEFAULT 100,
ADD COLUMN IF NOT EXISTS rating_vol FLOAT DEFAULT 0.06;

-- 4. Optional: Peak rating tracking
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS peak_bullet INT,
ADD COLUMN IF NOT EXISTS peak_blitz INT,
ADD COLUMN IF NOT EXISTS peak_rapid INT,
ADD COLUMN IF NOT EXISTS peak_classical INT;

-- 5. Optional: is_rated flag on games
ALTER TABLE games ADD COLUMN IF NOT EXISTS is_rated BOOLEAN DEFAULT false;
```

Also **create `avatars` storage bucket** in Supabase dashboard (Storage → New Bucket → name: `avatars`, public: true).

---

## ❌ Known Remaining Issues / Not Implemented

| Issue | Status | Notes |
|-------|--------|-------|
| Avatar upload | Implemented but needs `avatars` bucket created in Supabase dashboard | See SQL section above |
| Glicko-2 RD/Vol not persisted | Partial — base rating updates work; RD/Vol only persist if columns added | See SQL section |
| Peak rating tracking | Not implemented — needs trigger or update in `rating.js` | |
| Challenge from non-friends | Works but recipient must be online (socket) | No offline notification |
| Rematch across browser tabs | Works if opponent has game page open | No persistence if they left |
| Game analysis page | Exists but Stockfish engine must be running separately | Python service on port 8001 |
| Clock resume after server restart | Requires `white_time_ms`/`black_time_ms`/`clock_deadline` columns in DB | Run SQL migration in Session 3 section |
| Move history persistence | In-memory only — reconnecting players lose move list | Would need `moves` table or JSON column |
| Server-side move validation | Not implemented — client sends moves freely | Future: validate FEN on server before accepting |
| Google OAuth | Route exists at `/auth/callback` | Must enable Google provider in Supabase dashboard |
| Notification persistence | Bell icon fetches from `notifications` table — table must exist | |

---

## File Change Summary

### New Files Created
- `frontend/app/api/friends/request/route.ts`
- `frontend/app/api/friends/status/[username]/route.ts`
- `frontend/app/api/friends/pending/route.ts`
- `frontend/app/api/friends/route.ts`
- `frontend/app/api/friends/[id]/route.ts`
- `frontend/app/api/profile/[username]/stats/route.ts`
- `frontend/app/api/profile/[username]/games/route.ts`
- `frontend/app/challenge/[username]/page.tsx`
- `frontend/app/settings/page.tsx`
- `frontend/app/auth/callback/route.ts`

### Modified Files (Sessions 1–2)
- `frontend/components/Navbar.tsx` — auth skeleton, notifications bell, online count fix, challenge banner
- `frontend/components/SocketProvider.tsx` — reconnect signal
- `frontend/app/game/[id]/page.tsx` — game-over modal, rematch, rating display, localStorage persistence, Fragment fix
- `frontend/app/profile/[username]/page.tsx` — full redesign + stats + friends + challenge
- `frontend/app/lobby/page.tsx` — private game userId fix, custom time modal
- `frontend/app/login/page.tsx` — Google button, redirect fix
- `frontend/app/signup/page.tsx` — Google button, redirect fix
- `frontend/app/api/profile/me/route.ts` — PATCH accepts avatarUrl
- `server/server.js` — game_end direct DB updates, rematch/challenge socket handlers, friend endpoints
- `server/services/rating.js` — removed optional column SELECTs, fixed silent failure

### Modified Files (Session 3)
- `frontend/app/game/[id]/page.tsx` — gameDataRef pattern (stale closure fix), double-move fix (single source of truth), server clock sync, isResume detection
- `frontend/app/profile/[username]/page.tsx` — `{ cache: 'no-store' }` on all fetch calls
- `frontend/app/api/profile/[username]/route.ts` — `export const dynamic = 'force-dynamic'`
- `frontend/app/api/profile/[username]/stats/route.ts` — `export const dynamic = 'force-dynamic'`
- `frontend/app/api/profile/[username]/games/route.ts` — `export const dynamic = 'force-dynamic'`
- `frontend/app/api/profile/me/route.ts` — `export const dynamic = 'force-dynamic'`
- `server/server.js` — server-side clock (gameClocks Map, startClockTimer, clock persistence, join_game clock restore, disconnect pause, clock_sync broadcast)
- `server/supabase.js` — dual env var support (SUPABASE_SERVICE_KEY || SUPABASE_SERVICE_ROLE_KEY), startup diagnostics
- `server/services/rating.js` — RD capped at 150, rating change capped ±50

### New Files (Session 3)
- `readme_first.md` — master reference document (architecture, schema, socket events, danger zones, TODOs, everything)
