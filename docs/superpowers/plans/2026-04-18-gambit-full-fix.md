# Gambit Platform — Full Fix & Design Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 36 diagnosed issues across the Gambit chess platform — from broken server credentials and hardcoded URLs to missing pages and Socket.io integration — then apply a full Chess.com/Lichess-quality design upgrade.

**Architecture:** Next.js 14 frontend (App Router) + Node.js Express/Socket.io server + Python FastAPI chess engine + Supabase (auth, database, realtime). Fixes flow from server credentials → API wiring → frontend feature connections → design layer.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Supabase SSR, chess.js, Socket.io, Python FastAPI, Stockfish

---

## PHASE 1 — Critical Server & Auth Fixes

### Task 1: Fill server/.env with real Supabase credentials

**Files:**
- Modify: `server/.env`

The Node server currently has placeholder Supabase credentials. The real credentials are in `frontend/.env.local`. Copy the Supabase URL and use the service role key.

- [ ] **Step 1: Update server/.env**

Replace the file content entirely:

```env
PORT=3001
SUPABASE_URL="https://fmwobjpbrrdeiaulhqwp.supabase.co"
SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtd29ianBicnJkZWlhdWxocXdwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ1MDUxNiwiZXhwIjoyMDkyMDI2NTE2fQ.jSjUiMbTHYYaot1TRho3PwcJpNd-WN1nl7-4MV2P-7E"
GAMBIT_ENGINE_URL="http://127.0.0.1:8001"
FRONTEND_URL="http://localhost:3000"
```

- [ ] **Step 2: Update chess-engine/.env**

```env
PORT=8001
SUPABASE_URL="https://fmwobjpbrrdeiaulhqwp.supabase.co"
SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtd29ianBicnJkZWlhdWxocXdwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ1MDUxNiwiZXhwIjoyMDkyMDI2NTE2fQ.jSjUiMbTHYYaot1TRho3PwcJpNd-WN1nl7-4MV2P-7E"
# STOCKFISH_PATH="/usr/local/bin/stockfish"
```

- [ ] **Step 3: Verify server can connect (manual check)**

Start the server: `cd server && npm start`
Expected output: `Node server running on port 3001`
No `Missing SUPABASE credentials` warning.

---

### Task 2: Harden the Supabase browser client

**Files:**
- Modify: `frontend/lib/supabase/client.ts`

The current `!` assertions silently produce `ERR_NAME_NOT_RESOLVED` when env vars are missing. Add explicit validation.

- [ ] **Step 1: Replace client.ts**

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars. Ensure frontend/.env.local contains ' +
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY'
    )
  }

  return createBrowserClient(url, key)
}
```

---

### Task 3: Create RLS fix migration

**Files:**
- Create: `supabase/migrations/00010_fix_rls.sql`

Migration 00001 has a SELECT policy and 00003 adds a duplicate SELECT + an INSERT. Running both will throw duplicate policy errors. This migration cleans and resets all profile policies.

- [ ] **Step 1: Create the migration file**

```sql
-- 00010_fix_rls.sql
-- Resets all RLS policies on profiles to a clean, non-conflicting state.

ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "allow_insert_own_profile" ON profiles;
DROP POLICY IF EXISTS "Profiles are publicly readable" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON profiles;
DROP POLICY IF EXISTS "allow_select_all_profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "allow_update_own_profile" ON profiles;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  WITH CHECK (true);

CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (true);

CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Ensure column defaults are present
ALTER TABLE profiles
  ALTER COLUMN rating_bullet    SET DEFAULT 1200,
  ALTER COLUMN rating_blitz     SET DEFAULT 1200,
  ALTER COLUMN rating_rapid     SET DEFAULT 1200,
  ALTER COLUMN rating_classical SET DEFAULT 1200,
  ALTER COLUMN games_played     SET DEFAULT 0,
  ALTER COLUMN wins             SET DEFAULT 0,
  ALTER COLUMN losses           SET DEFAULT 0,
  ALTER COLUMN draws            SET DEFAULT 0,
  ALTER COLUMN total_moves_analysed SET DEFAULT 0;
```

- [ ] **Step 2: Run this SQL in Supabase Dashboard → SQL Editor**

Paste and execute. Expected: no errors.

---

## PHASE 2 — Fix All Broken Features

### Task 4: Fix all hardcoded `localhost:3001` URLs

**Files:**
- Modify: `frontend/app/lobby/page.tsx` (line 44)
- Modify: `frontend/app/analysis/page.tsx` (line 38)
- Modify: `frontend/app/join/[invite_token]/page.tsx` (lines 22, 42)
- Modify: `frontend/app/profile/[username]/page.tsx` (line 59)

All four files use literal `http://localhost:3001`. Replace with `process.env.NEXT_PUBLIC_SOCKET_URL`.

- [ ] **Step 1: Fix lobby/page.tsx**

Change line 44:
```typescript
// BEFORE
const res = await fetch('http://localhost:3001/api/games/private/create', {
// AFTER
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001'
const res = await fetch(`${socketUrl}/api/games/private/create`, {
```

- [ ] **Step 2: Fix analysis/page.tsx**

Change line 38:
```typescript
// BEFORE
const res = await fetch('http://localhost:3001/api/analysis/engine', {
// AFTER
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001'
const res = await fetch(`${socketUrl}/api/analysis/engine`, {
```

- [ ] **Step 3: Fix join/[invite_token]/page.tsx**

Change lines 22 and 42:
```typescript
// Line 22 - BEFORE
const res = await fetch(`http://localhost:3001/api/games/join/${token}`);
// Line 22 - AFTER
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001'
const res = await fetch(`${socketUrl}/api/games/join/${token}`);

// Line 42 - BEFORE
const res = await fetch(`http://localhost:3001/api/games/join/${token}`, {
// Line 42 - AFTER
const res = await fetch(`${socketUrl}/api/games/join/${token}`, {
```

- [ ] **Step 4: Fix profile/[username]/page.tsx**

Change line 59:
```typescript
// BEFORE
await fetch('http://localhost:3001/api/profile', {
// AFTER
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001'
await fetch(`${socketUrl}/api/profile`, {
```

---

### Task 5: Add missing `PUT /api/profile` endpoint to server

**Files:**
- Modify: `server/server.js`

The profile edit modal calls `PUT /api/profile` but this route doesn't exist. Add it after the existing `/api/games/join/:token` POST route.

- [ ] **Step 1: Add the route in server.js (after line 123)**

```javascript
app.put('/api/profile', async (req, res) => {
    try {
        const { userId, displayName, bio, country, sex, isPublic } = req.body;
        if (!userId) return res.status(400).json({ error: 'Missing userId' });

        const { error } = await supabase
            .from('profiles')
            .update({ display_name: displayName, bio, country, sex, is_public: isPublic })
            .eq('id', userId);

        if (error) return res.status(400).json({ error: error.message });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
```

---

### Task 6: Add `/analyze` endpoint to chess-engine

**Files:**
- Modify: `chess-engine/main.py`

`server/server.js` proxies `POST /api/analysis/engine` to `http://localhost:8001/analyze`. This endpoint doesn't exist. Add it as a single-position analysis wrapper.

- [ ] **Step 1: Add AnalyzeReq model and /analyze endpoint to main.py**

Add after the existing `MoveClassifyReq` model (after line 32):

```python
class AnalyzeReq(BaseModel):
    fen: str
    depth: int = 18
```

Add before the final `@app.post("/classify-move")` route:

```python
@app.post("/analyze")
def analyze_position(req: AnalyzeReq):
    """Single-position analysis for the Analysis page."""
    sf = get_stockfish_instance(depth=req.depth)
    if not sf:
        raise HTTPException(status_code=503, detail="Engine unavailable")

    try:
        sf.set_depth(req.depth)
        sf.set_fen_position(req.fen)
        
        evaluation = sf.get_evaluation()
        top_moves = sf.get_top_moves(3)
        best_move = sf.get_best_move()

        lines = []
        for m in top_moves:
            lines.append({
                "move": m["Move"],
                "centipawn": m.get("Centipawn"),
                "mate": m.get("Mate"),
            })

        return {
            "best_move": best_move,
            "evaluation": {
                "type": evaluation["type"],
                "value": evaluation["value"]
            },
            "lines": lines,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 2: Fix requirements.txt version**

Change `python-chess==1.999` to `python-chess==1.11.2`

---

### Task 7: Fix friends.js color case mismatch

**Files:**
- Modify: `server/services/friends.js`

Lobby sends `'white'`, `'black'`, `'random'` (lowercase). Server checks `'White'` / `'Black'` (capitalized). Color selection is always wrong.

- [ ] **Step 1: Normalize to lowercase in friends.js (lines 19-23)**

```javascript
// BEFORE
if (color === 'White') white_id = userId;
else if (color === 'Black') black_id = userId;
else {
    if (Math.random() > 0.5) white_id = userId;
    else black_id = userId;
}

// AFTER
const colorLower = (color || 'random').toLowerCase();
if (colorLower === 'white') white_id = userId;
else if (colorLower === 'black') black_id = userId;
else {
    if (Math.random() > 0.5) white_id = userId;
    else black_id = userId;
}
```

---

### Task 8: Fix landing page "Sign Up free" button

**Files:**
- Modify: `frontend/app/page.tsx`

The "Sign Up free" button on the landing page is a `<button>` with no handler. Users cannot navigate to signup from the hero.

- [ ] **Step 1: Replace button with Link**

```typescript
// BEFORE
<button className="bg-surface border border-border border-strong hover:bg-elevated px-8 py-3 rounded-md text-text-primary font-medium text-lg transition-colors">
  Sign Up free
</button>

// AFTER
<Link href="/signup" className="bg-surface border border-border hover:bg-elevated px-8 py-3 rounded-md text-text-primary font-medium text-lg transition-colors">
  Sign Up free
</Link>
```

---

### Task 9: Wire real user ID into lobby private game creation

**Files:**
- Modify: `frontend/app/lobby/page.tsx`

`handleCreatePrivate` sends `userId: 'dummy-id'`. Fetch the authenticated user's real ID.

- [ ] **Step 1: Add Supabase auth to lobby page**

At top of the file add the import:
```typescript
import { createClient } from '@/lib/supabase/client';
```

In `handleCreatePrivate`, get the real user before the fetch:
```typescript
const handleCreatePrivate = async () => {
    setInviteState('generating');
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001';
        const res = await fetch(`${socketUrl}/api/games/private/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user?.id || '',
                timeControl: privateTc,
                color: privateColor,
                isRated: privateRated
            })
        });
        const data = await res.json();
        if (data.token) {
            setInviteLink(`${window.location.origin}/join/${data.token}`);
            setInviteState('share');
        } else {
            setInviteState('config');
        }
    } catch (e) {
        setInviteState('config');
    }
};
```

---

### Task 10: Wire real user ID into the join game page

**Files:**
- Modify: `frontend/app/join/[invite_token]/page.tsx`

Currently sends `userId: 'dummy-joiner-id'`. Fetch from Supabase auth.

- [ ] **Step 1: Add auth import and use real userId**

Add import:
```typescript
import { createClient } from '@/lib/supabase/client';
```

Replace `handleAccept`:
```typescript
const handleAccept = async () => {
    setJoining(true);
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setError('You must be logged in to join a game.');
            setJoining(false);
            return;
        }
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001';
        const res = await fetch(`${socketUrl}/api/games/join/${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id })
        });

        if (!res.ok) {
            const err = await res.json();
            setError(err.error || 'Failed to join game');
            setJoining(false);
            return;
        }

        const activeGame = await res.json();
        router.push(`/game/${activeGame.id}`);
    } catch (e) {
        setError('Network error joining game.');
        setJoining(false);
    }
};
```

---

### Task 11: Fix lobby hardcoded online count

**Files:**
- Modify: `frontend/app/lobby/page.tsx`

`onlineCount` is hardcoded to `1243`. Wire it to Supabase Realtime Presence.

- [ ] **Step 1: Replace static count with Supabase Presence**

Replace the `onlineCount` state and add a `useEffect` that subscribes to the `online-users` presence channel. Add `createClient` import if not already present.

```typescript
// Replace static state:
const [onlineCount, setOnlineCount] = useState(1);

// Add useEffect after existing searching useEffect:
useEffect(() => {
    const supabase = createClient();
    let channel: any;

    const setup = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        channel = supabase.channel('online-users-lobby', {
            config: { presence: { key: user?.id || 'anon' } }
        });
        channel.on('presence', { event: 'sync' }, () => {
            const count = Object.keys(channel.presenceState()).length;
            setOnlineCount(Math.max(1, count));
        });
        channel.subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED' && user) {
                await channel.track({ user_id: user.id });
            }
        });
    };

    setup();
    return () => { if (channel) supabase.removeChannel(channel); };
}, []);
```

---

### Task 12: Create missing pages (leaderboard, settings)

**Files:**
- Create: `frontend/app/leaderboard/page.tsx`
- Create: `frontend/app/settings/page.tsx`

Both pages are linked from the Navbar but don't exist, causing 404s.

- [ ] **Step 1: Create leaderboard page**

```typescript
// frontend/app/leaderboard/page.tsx
"use client";

import { useEffect, useState } from 'react';
import { Trophy, Zap, Flame, Timer, BookOpen } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const TIME_CONTROLS = [
    { id: 'all', label: 'All' },
    { id: 'bullet', label: 'Bullet', icon: <Zap size={14} /> },
    { id: 'blitz', label: 'Blitz', icon: <Flame size={14} /> },
    { id: 'rapid', label: 'Rapid', icon: <Timer size={14} /> },
    { id: 'classical', label: 'Classical', icon: <BookOpen size={14} /> },
];

const RATING_FIELD: Record<string, string> = {
    all: 'rating_rapid',
    bullet: 'rating_bullet',
    blitz: 'rating_blitz',
    rapid: 'rating_rapid',
    classical: 'rating_classical',
};

export default function LeaderboardPage() {
    const [filter, setFilter] = useState('all');
    const [players, setPlayers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            const supabase = createClient();
            const field = RATING_FIELD[filter];
            const { data } = await supabase
                .from('profiles')
                .select(`username, display_name, ${field}, games_played, wins, losses`)
                .order(field, { ascending: false })
                .limit(50);
            setPlayers(data || []);
            setLoading(false);
        };
        fetch();
    }, [filter]);

    const ratingField = RATING_FIELD[filter];

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="flex items-center gap-3 mb-8">
                <Trophy size={28} className="text-accent" strokeWidth={1.5} />
                <h1 className="text-3xl text-text-primary font-medium">Leaderboard</h1>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 mb-8 bg-surface border border-border rounded-xl p-1 w-fit">
                {TIME_CONTROLS.map(tc => (
                    <button
                        key={tc.id}
                        onClick={() => setFilter(tc.id)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === tc.id ? 'bg-accent text-surface' : 'text-text-secondary hover:text-text-primary'}`}
                    >
                        {tc.icon}{tc.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
                </div>
            ) : (
                <div className="bg-surface border border-border rounded-xl overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border bg-elevated">
                                <th className="text-left px-4 py-3 text-text-tertiary text-xs uppercase tracking-wider w-12">#</th>
                                <th className="text-left px-4 py-3 text-text-tertiary text-xs uppercase tracking-wider">Player</th>
                                <th className="text-right px-4 py-3 text-text-tertiary text-xs uppercase tracking-wider">Rating</th>
                                <th className="text-right px-4 py-3 text-text-tertiary text-xs uppercase tracking-wider hidden md:table-cell">Games</th>
                                <th className="text-right px-4 py-3 text-text-tertiary text-xs uppercase tracking-wider hidden md:table-cell">Win Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            {players.map((p, i) => {
                                const winRate = p.games_played > 0 ? Math.round((p.wins / p.games_played) * 100) : 0;
                                return (
                                    <tr key={p.username} className={`border-b border-border/50 hover:bg-hover transition-colors ${i < 3 ? 'bg-accent/5' : ''}`}>
                                        <td className="px-4 py-3">
                                            <span className={`text-sm font-bold ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-600' : 'text-text-tertiary'}`}>
                                                {i + 1}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-text-primary text-sm font-medium">{p.display_name || p.username}</span>
                                            <span className="text-text-tertiary text-xs ml-2">@{p.username}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="text-accent font-mono font-medium">{Math.round(p[ratingField] || 0)}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-text-secondary text-sm hidden md:table-cell">{p.games_played}</td>
                                        <td className="px-4 py-3 text-right text-text-secondary text-sm hidden md:table-cell">{winRate}%</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {players.length === 0 && (
                        <div className="text-center py-16 text-text-tertiary">No players yet.</div>
                    )}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Create settings page**

```typescript
// frontend/app/settings/page.tsx
"use client";

import { useState } from 'react';
import { Settings, Bell, Shield, Palette } from 'lucide-react';

export default function SettingsPage() {
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [animationsEnabled, setAnimationsEnabled] = useState(true);

    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <div className="flex items-center gap-3 mb-8">
                <Settings size={28} className="text-accent" strokeWidth={1.5} />
                <h1 className="text-3xl text-text-primary font-medium">Settings</h1>
            </div>

            <div className="space-y-4">
                {/* Appearance */}
                <section className="bg-surface border border-border rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-border bg-elevated flex items-center gap-2">
                        <Palette size={16} className="text-accent" strokeWidth={1.5} />
                        <h2 className="font-medium text-text-primary">Appearance</h2>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-text-primary text-sm font-medium">Board Animations</div>
                                <div className="text-text-tertiary text-xs">Animate piece movements</div>
                            </div>
                            <button onClick={() => setAnimationsEnabled(!animationsEnabled)}
                                className={`w-11 h-6 rounded-full relative transition-colors ${animationsEnabled ? 'bg-accent' : 'bg-board-dark'}`}>
                                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${animationsEnabled ? 'left-[24px]' : 'left-[4px]'}`} />
                            </button>
                        </div>
                    </div>
                </section>

                {/* Sound */}
                <section className="bg-surface border border-border rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-border bg-elevated flex items-center gap-2">
                        <Bell size={16} className="text-accent" strokeWidth={1.5} />
                        <h2 className="font-medium text-text-primary">Sound</h2>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-text-primary text-sm font-medium">Move Sounds</div>
                                <div className="text-text-tertiary text-xs">Play a sound on piece moves</div>
                            </div>
                            <button onClick={() => setSoundEnabled(!soundEnabled)}
                                className={`w-11 h-6 rounded-full relative transition-colors ${soundEnabled ? 'bg-accent' : 'bg-board-dark'}`}>
                                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${soundEnabled ? 'left-[24px]' : 'left-[4px]'}`} />
                            </button>
                        </div>
                    </div>
                </section>

                {/* Privacy */}
                <section className="bg-surface border border-border rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-border bg-elevated flex items-center gap-2">
                        <Shield size={16} className="text-accent" strokeWidth={1.5} />
                        <h2 className="font-medium text-text-primary">Privacy</h2>
                    </div>
                    <div className="p-6 text-text-secondary text-sm">
                        Manage your privacy settings from your <a href="/profile" className="text-accent hover:underline">profile page</a>.
                    </div>
                </section>
            </div>
        </div>
    );
}
```

---

### Task 13: Add Socket.io provider to frontend

**Files:**
- Create: `frontend/components/SocketProvider.tsx`
- Modify: `frontend/app/layout.tsx`

Socket.io-client is in package.json but never instantiated. A provider gives the entire app access to a shared socket instance.

- [ ] **Step 1: Create SocketProvider**

```typescript
// frontend/components/SocketProvider.tsx
"use client";

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SocketContext = createContext<Socket | null>(null);

export function useSocket() {
    return useContext(SocketContext);
}

export default function SocketProvider({ children }: { children: React.ReactNode }) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        const url = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001';
        const s = io(url, {
            autoConnect: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });

        s.on('connect', () => console.log('[Socket] Connected:', s.id));
        s.on('connect_error', (err) => console.warn('[Socket] Connect error:', err.message));
        s.on('disconnect', (reason) => console.warn('[Socket] Disconnected:', reason));

        socketRef.current = s;
        setSocket(s);

        return () => {
            s.disconnect();
        };
    }, []);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
}
```

- [ ] **Step 2: Wrap layout.tsx body with SocketProvider**

```typescript
// frontend/app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Navbar from '@/components/Navbar'
import SocketProvider from '@/components/SocketProvider'

const inter = Inter({
    subsets: ['latin'],
    weight: ['400', '500'],
    display: 'swap',
})

export const metadata: Metadata = {
    title: 'Gambit - Chess, perfected.',
    description: 'Premium chess platform with accuracy rating, smart matchmaking, and friend system.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={inter.className}>
            <body>
                <SocketProvider>
                    <Navbar />
                    <main className="flex-1 w-full bg-page">
                        {children}
                    </main>
                </SocketProvider>
            </body>
        </html>
    )
}
```

---

### Task 14: Fix globals.css — add font smoothing

**Files:**
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Add font smoothing and Roboto Mono reference**

Add after the `@tailwind utilities;` line and within `@layer base`:

```css
* {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

---

### Task 15: Fix offline page crash on invalid localStorage FEN

**Files:**
- Modify: `frontend/app/offline/page.tsx`

If localStorage holds a corrupt FEN, `new Chess(savedFen)` throws and crashes the component.

- [ ] **Step 1: Wrap initialization in try/catch**

```typescript
useEffect(() => {
    const savedFen = localStorage.getItem('offline_fen');
    let newGame: Chess;
    try {
        newGame = new Chess(savedFen || undefined);
    } catch {
        newGame = new Chess();
        localStorage.removeItem('offline_fen');
    }
    setGame(newGame);
    setFen(newGame.fen());
    setMoveHistory(newGame.history());
}, []);
```

---

### Task 16: Fix Navbar createClient and null profile tracking

**Files:**
- Modify: `frontend/components/Navbar.tsx`

Two issues: `createClient()` called at component top-level (new client every render), and presence tracks `undefined` username if profile fetch fails.

- [ ] **Step 1: Move createClient inside useEffect, guard undefined username**

In Navbar component, remove the top-level `const supabase = createClient();` line and instead initialize it inside `setupPresence`:

```typescript
const setupPresence = async () => {
    const supabase = createClient(); // moved inside
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        setUser(user);
        const { data: profileData } = await supabase
            .from('profiles')
            .select('username, rating_rapid')
            .eq('id', user.id)
            .single();
        if (profileData) setProfile(profileData);

        await supabase.removeAllChannels();
        channel = supabase.channel('online-users', {
            config: { presence: { key: user.id } }
        });
        channel.on('presence', { event: 'sync' }, () => {
            const count = Object.keys(channel.presenceState()).length;
            setOnlineCount(count > 0 ? count : 1);
        });
        channel.subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({
                    user_id: user.id,
                    username: profileData?.username || 'unknown'
                });
            }
        });
    }
};
```

Also update `handleLogout` to create a fresh client:
```typescript
const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setIsDropdownOpen(false);
    router.push('/');
    router.refresh();
};
```

---

### Task 17: Fix profile page null safety

**Files:**
- Modify: `frontend/app/profile/[username]/page.tsx`

`winRate` calculation crashes if `games_played` is null. Also `isOnline` is never updated.

- [ ] **Step 1: Guard winRate calculation**

```typescript
const gamesPlayed = profile.games_played ?? 0;
const wins = profile.wins ?? 0;
const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;
```

- [ ] **Step 2: Add online presence detection for profile**

```typescript
useEffect(() => {
    const checkOnline = async () => {
        if (!profile) return;
        const supabase = createClient();
        const channel = supabase.channel('online-users');
        channel.on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            const onlineUserIds = Object.keys(state);
            setIsOnline(onlineUserIds.includes(profile.id));
        });
        channel.subscribe();
        return () => { supabase.removeChannel(channel); };
    };
    if (profile) checkOnline();
}, [profile?.id]);
```

---

## PHASE 3 — Design Upgrade

### Task 18: Redesign landing page (page.tsx)

**Files:**
- Modify: `frontend/app/page.tsx`

Replace static board + basic feature cards with: animated hero, stats bar, richer feature grid, footer.

- [ ] **Step 1: Replace frontend/app/page.tsx**

```typescript
import Link from "next/link";
import { ChevronRight, Zap, Shield, Users, Trophy, BarChart2, Smartphone } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center pt-20 pb-16 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/30 text-accent text-sm px-4 py-1.5 rounded-full mb-8 font-medium">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            Now in open beta
          </div>
          <h1 className="text-5xl md:text-7xl text-text-primary mb-6 tracking-tight font-medium" style={{ letterSpacing: '-1px' }}>
            Chess,<br />perfected.
          </h1>
          <p className="text-lg md:text-xl text-text-secondary mb-10 max-w-xl mx-auto leading-relaxed">
            Real-time matchmaking, Glicko-2 ratings, Stockfish accuracy analysis,
            and a design that doesn&apos;t get in the way.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/lobby" className="bg-accent hover:bg-accent-hover text-surface px-8 py-3.5 rounded-lg font-medium text-base transition-colors flex items-center gap-2 shadow-lg shadow-accent/20">
              Play Now <ChevronRight size={18} strokeWidth={1.5} />
            </Link>
            <Link href="/signup" className="bg-surface border border-border hover:bg-elevated px-8 py-3.5 rounded-lg text-text-primary font-medium text-base transition-colors">
              Create Account
            </Link>
          </div>
        </div>

        {/* Mini board preview */}
        <div className="relative mt-16 max-w-[360px] w-full">
          <div className="w-full aspect-square board-outer-frame p-2">
            <div className="w-full h-full board-inner-frame grid grid-cols-8 grid-rows-8">
              {Array.from({ length: 64 }).map((_, i) => {
                const isLight = (Math.floor(i / 8) + (i % 8)) % 2 === 0;
                return <div key={i} className={`w-full h-full ${isLight ? 'bg-board-light' : 'bg-board-dark'}`} />;
              })}
            </div>
          </div>
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-surface border border-border px-4 py-1.5 rounded-full text-xs text-text-tertiary whitespace-nowrap shadow-lg">
            34,219 games played today
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-16 w-full">
        <h2 className="text-center text-text-tertiary text-xs uppercase tracking-widest mb-12 font-medium">Everything you need to improve</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-surface border border-border p-6 rounded-xl hover:border-accent/40 hover:bg-hover transition-all duration-200">
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center mb-4">
                <f.Icon size={20} className="text-accent" strokeWidth={1.5} />
              </div>
              <h3 className="text-text-primary text-base font-medium mb-2">{f.title}</h3>
              <p className="text-text-secondary text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border mt-auto py-8 px-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-text-tertiary text-sm">
          <span className="text-accent font-medium">Gambit</span>
          <div className="flex gap-6">
            <Link href="/lobby" className="hover:text-text-secondary transition-colors">Play</Link>
            <Link href="/leaderboard" className="hover:text-text-secondary transition-colors">Leaderboard</Link>
            <Link href="/analysis" className="hover:text-text-secondary transition-colors">Analysis</Link>
          </div>
          <span>Built with chess.js &amp; Stockfish</span>
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  { title: 'Live Games', desc: 'Ultra-low latency Socket.io architecture with server-authoritative clock management.', Icon: Zap },
  { title: 'Accuracy Rating', desc: 'Depth-18 Stockfish centipawn loss classification on every move you play.', Icon: BarChart2 },
  { title: 'Smart Matchmaking', desc: 'Expanding-radius Glicko-2 queue that finds equally-rated opponents fast.', Icon: Trophy },
  { title: 'Friends & Invites', desc: 'Create private games and share an invite link or QR code instantly.', Icon: Users },
  { title: 'Offline Mode', desc: 'Full chess board with move validation — zero login, zero server calls.', Icon: Shield },
  { title: 'Mobile Ready', desc: 'Fully responsive down to 375px. Tap to select, tap to move.', Icon: Smartphone },
];
```

---

### Task 19: Redesign auth pages (signup, login)

**Files:**
- Modify: `frontend/app/signup/page.tsx`
- Modify: `frontend/app/login/page.tsx`

Add SVG knight logo, 44px inputs, consistent card styling.

- [ ] **Step 1: Add KnightLogo SVG component at top of each auth file**

Add this component to both `signup/page.tsx` and `login/page.tsx`:

```typescript
function KnightLogo() {
    return (
        <div className="flex items-center justify-center gap-2 mb-8">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 28h16M10 28v-4c0-2 1-3 2-4l2-2c1-1 2-3 2-5V9c0-1-.5-2-1-3l-2-1 1-1 3 1c1 1 2 2 2 4v4l3-3c1-1 2-1 3 0s0 2-1 3l-4 4v6c0 1-1 2-2 2H12c-1 0-2-1-2-2z" stroke="#C4965A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-accent text-xl font-medium">Gambit</span>
        </div>
    );
}
```

- [ ] **Step 2: Update card wrapper in both files**

Replace `<div className="w-full max-w-md bg-surface border border-border p-8 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]">` with:
```typescript
<div className="w-full max-w-[400px] bg-surface border border-border p-10 rounded-[14px] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
```

- [ ] **Step 3: Update input height to 44px in both files**

Replace all `py-2.5` on input elements with `h-[44px] px-4` and add `flex items-center`:
```typescript
// BEFORE
className="w-full bg-elevated border border-border-strong rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent disabled:opacity-50"
// AFTER  
className="w-full h-[44px] bg-elevated border border-border-strong rounded-lg px-4 text-text-primary focus:outline-none focus:ring-0 focus:border-accent focus:ring-[1.5px] focus:ring-accent/30 disabled:opacity-50 transition-colors"
```

- [ ] **Step 4: Update submit button height in both files**

Replace `py-3` on submit buttons with `h-[44px]`:
```typescript
// BEFORE
className="w-full bg-accent hover:bg-accent-hover ... py-3 rounded-lg ..."
// AFTER
className="w-full h-[44px] bg-accent hover:bg-accent-hover ... rounded-lg ..."
```

---

### Task 20: Redesign lobby page

**Files:**
- Modify: `frontend/app/lobby/page.tsx`

Add 3-column time control grid with hover effects, action buttons row, offline card, resume section.

- [ ] **Step 1: Update time control button styles**

Replace the existing time control grid button classNames:
```typescript
// BEFORE
className="bg-surface border border-border hover:border-accent hover:bg-hover transition-all transform hover:-translate-y-0.5 duration-150 rounded-xl p-6 flex flex-col items-center justify-center gap-2 shadow-sm"

// AFTER  
className={`bg-surface border hover:border-accent hover:bg-hover transition-all transform hover:-translate-y-0.5 duration-150 rounded-xl p-6 flex flex-col items-center justify-center gap-2 shadow-sm
    ${selectedTc === tc.id ? 'border-accent bg-accent/5' : 'border-border'}`}
```

Add `const [selectedTc, setSelectedTc] = useState('blitz');` to state and `onClick={() => setSelectedTc(tc.id)}` to the button.

- [ ] **Step 2: Replace three stacked action buttons with a proper row**

The existing `<div className="flex flex-col sm:flex-row gap-4">` is fine. Update the Play vs Human button to actually use the selectedTc:
```typescript
<button 
    onClick={() => setSearching(true)}
    className="flex-1 bg-accent hover:bg-accent-hover text-surface font-medium py-4 rounded-xl text-base transition-colors flex items-center justify-center gap-2 shadow-md"
>
    Play Online
</button>
```

---

### Task 21: Upgrade globals.css for design quality

**Files:**
- Modify: `frontend/app/globals.css`

Add `tabular-nums`, improved scrollbar, animation utilities.

- [ ] **Step 1: Update globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --bg-page: #0F0D0B;
    --bg-surface: #1A1714;
    --bg-elevated: #231F1B;
    --bg-hover: #2A2520;
    --board-light: #C8A97A;
    --board-dark: #6B4226;
    --frame-outer: #3D2B1A;
    --frame-inner: #2A1D10;
    --accent: #C4965A;
    --accent-hover: #D9AF78;
    --text-primary: #F2EDE6;
    --text-secondary: #9A8E84;
    --text-tertiary: #5E534C;
    --border: rgba(255, 255, 255, 0.07);
    --border-strong: rgba(255, 255, 255, 0.13);
    --green-indicator: #4FA85A;
    --check-highlight: #C0392B;
    --last-move: rgba(196, 150, 90, 0.35);
    --selected: rgba(250, 250, 100, 0.45);
    --valid-dot: rgba(242, 237, 230, 0.22);
  }

  * {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    @apply bg-page text-text-primary font-sans flex min-h-screen flex-col;
    line-height: 1.6;
  }

  h1, h2, h3, h4, h5, h6 {
    @apply font-medium;
    letter-spacing: -0.5px;
    line-height: 1.2;
  }

  .font-mono, code, pre {
    font-variant-numeric: tabular-nums;
  }
}

@layer components {
  .board-outer-frame {
    @apply border-[3px] border-frame-outer rounded-sm bg-frame-outer shadow-board;
  }

  .board-inner-frame {
    @apply border-2 border-frame-inner relative overflow-hidden;
  }

  .board-coordinate {
    @apply absolute text-[11px] text-text-tertiary font-medium select-none cursor-default;
  }

  ::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
  ::-webkit-scrollbar-track {
    background-color: var(--bg-elevated);
  }
  ::-webkit-scrollbar-thumb {
    background-color: var(--border-strong);
    border-radius: 4px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background-color: var(--text-tertiary);
  }
}
```

---

## PHASE 4 — Final Verification

### Task 22: TypeScript check and commit

**Files:** All modified files

- [ ] **Step 1: Run TypeScript check**

```bash
cd /Users/chidanandh/Desktop/Python\ folders/Chess/Chess/Gambit/frontend
npx tsc --noEmit
```

Fix any type errors before proceeding.

- [ ] **Step 2: Verify dev server starts cleanly**

```bash
cd frontend && npm run dev
```

Expected: No compilation errors in terminal. Open http://localhost:3000 — landing page loads.

- [ ] **Step 3: Auth flow check**

1. Navigate to `/signup` — form loads, no console errors
2. Fill form, submit — check Supabase Dashboard → Authentication → Users for new user
3. Navigate to `/login` — sign in → redirected to `/lobby`
4. Navbar shows username and rating
5. `/logout` → redirected to `/`

- [ ] **Step 4: Feature checks**

- `/offline` — board renders, click to select piece, click destination to move, Undo works
- `/analysis` — board renders, import FEN works, engine toggle calls backend
- `/leaderboard` — page loads, shows players (or empty state)
- `/settings` — page loads
- `/profile/[username]` — loads profile data from Supabase

- [ ] **Step 5: Commit all changes**

```bash
cd /Users/chidanandh/Desktop/Python\ folders/Chess/Chess/Gambit
git add -A
git commit -m "fix: full platform audit fixes — server credentials, hardcoded URLs, missing pages, Socket.io provider, design upgrade"
```

---

## File Change Summary

| File | Action | Phase |
|---|---|---|
| `server/.env` | Update credentials | 1 |
| `chess-engine/.env` | Update credentials | 1 |
| `frontend/lib/supabase/client.ts` | Add env var validation | 1 |
| `supabase/migrations/00010_fix_rls.sql` | Create | 1 |
| `frontend/app/lobby/page.tsx` | Fix URL, userId, online count, TC selection | 2 |
| `frontend/app/analysis/page.tsx` | Fix URL | 2 |
| `frontend/app/join/[invite_token]/page.tsx` | Fix URL, real userId | 2 |
| `frontend/app/profile/[username]/page.tsx` | Fix URL, null safety, online | 2 |
| `server/server.js` | Add PUT /api/profile | 2 |
| `chess-engine/main.py` | Add /analyze endpoint | 2 |
| `chess-engine/requirements.txt` | Fix version | 2 |
| `server/services/friends.js` | Fix color case | 2 |
| `frontend/app/page.tsx` | Fix Sign Up button, redesign | 2+3 |
| `frontend/app/leaderboard/page.tsx` | Create | 2 |
| `frontend/app/settings/page.tsx` | Create | 2 |
| `frontend/components/SocketProvider.tsx` | Create | 2 |
| `frontend/app/layout.tsx` | Add SocketProvider, next/font | 2 |
| `frontend/components/Navbar.tsx` | Fix createClient scope, null guard | 2 |
| `frontend/app/offline/page.tsx` | Fix FEN crash | 2 |
| `frontend/app/globals.css` | Add smoothing, tabular-nums, redesign | 3 |
| `frontend/app/signup/page.tsx` | Auth page redesign | 3 |
| `frontend/app/login/page.tsx` | Auth page redesign | 3 |
| `frontend/app/lobby/page.tsx` | TC grid selected state | 3 |
