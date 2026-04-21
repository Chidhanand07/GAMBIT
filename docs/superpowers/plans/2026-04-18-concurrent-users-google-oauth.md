# Concurrent Users & Google OAuth Fix – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow multiple users to play simultaneously without session bleed, and fix Google OAuth so it reliably lands users on /lobby.

**Architecture:** Next.js 14 frontend ↔ Node/Socket.io server ↔ Supabase. The two root problems are: (1) the OAuth callback doesn't handle Supabase's implicit token flow — only PKCE — so Google sign-in silently fails if Supabase sends a hash fragment instead of a `?code=` param; (2) SocketProvider never re-emits `authenticate`/`join_game` after a reconnect, so any dropped connection mid-game kills move sync for that player permanently.

**Tech Stack:** Next.js 14, @supabase/ssr 0.1.0, socket.io-client, TypeScript

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| MODIFY | `frontend/app/auth/callback/route.ts` | Add implicit-flow fallback + better error redirect |
| CREATE | `frontend/app/auth/callback/page.tsx` | Client component that catches `#access_token` hash fragment and sets session |
| MODIFY | `frontend/components/SocketProvider.tsx` | Expose `reconnect` event so pages can re-join rooms |
| MODIFY | `frontend/app/game/[id]/page.tsx` | Re-authenticate + re-join game room on socket reconnect |
| MODIFY | `frontend/app/lobby/page.tsx` | Re-authenticate socket on reconnect |
| MODIFY | `server/server.js` | Track userId→socketId map so server can re-notify reconnected player |

---

## Task 1: Fix Google OAuth – Supabase Dashboard (Manual Step)

Before any code changes, the Supabase project must allow the callback URL.

- [ ] **Step 1: Add callback URL to Supabase allowed redirect list**

In the Supabase dashboard:
1. Go to **Authentication → URL Configuration**
2. Under **Redirect URLs**, add:
   ```
   http://localhost:3000/auth/callback
   ```
   (and your production URL when deploying, e.g. `https://yourdomain.com/auth/callback`)
3. Make sure **Site URL** is set to `http://localhost:3000`
4. Click Save.

Without this step, Supabase rejects the `redirectTo` parameter and OAuth silently fails.

---

## Task 2: Fix OAuth Callback – Handle Both PKCE and Implicit Flow

**Files:**
- Modify: `frontend/app/auth/callback/route.ts`
- Create: `frontend/app/auth/callback/page.tsx`

**Why two files?** Supabase's OAuth can return tokens in two ways:
- **PKCE flow** (server-side): redirects to `/auth/callback?code=abc123` → server exchanges code for session
- **Implicit flow** (client-side): redirects to `/auth/callback#access_token=xyz` → the `#` fragment is never sent to the server; only JavaScript can read it

Currently the route handler only handles PKCE. If Supabase uses implicit, `code` is `null` → user lands on `/login?error=no_code`. The fix: keep the server route for PKCE, and add a client page that picks up the hash fragment.

- [ ] **Step 1: Rewrite `frontend/app/auth/callback/route.ts`**

```ts
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/lobby'
    const errorParam = searchParams.get('error')

    // Supabase sometimes passes an error param
    if (errorParam) {
        return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorParam)}`, request.url))
    }

    // No code = implicit flow (token is in URL hash, only JS can read it)
    // Render the client page which will pick up the hash fragment
    if (!code) {
        return NextResponse.redirect(new URL(`/auth/callback?implicit=1&next=${encodeURIComponent(next)}`, request.url))
    }

    // PKCE flow: exchange code for session and attach cookies to redirect
    const response = NextResponse.redirect(new URL(next, request.url))

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get: (name: string) => request.cookies.get(name)?.value,
                set: (name: string, value: string, options: Record<string, unknown>) => {
                    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
                },
                remove: (name: string, options: Record<string, unknown>) => {
                    response.cookies.set(name, '', { ...options as Parameters<typeof response.cookies.set>[2], maxAge: 0 })
                },
            },
        }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error || !data.user) {
        console.error('[auth/callback] exchangeCodeForSession failed:', error?.message)
        return NextResponse.redirect(new URL('/login?error=oauth_failed', request.url))
    }

    await ensureProfile(data.user.id, data.user.email, data.user.user_metadata?.avatar_url)

    return response
}

async function ensureProfile(userId: string, email?: string, avatarUrl?: string) {
    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: existing } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle()
    if (existing) return

    const baseUsername = (email ?? '').split('@')[0]
        .replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 15) || 'player'

    let username = baseUsername
    for (let i = 1; i <= 99; i++) {
        const { data: taken } = await admin.from('profiles').select('id').eq('username', username).maybeSingle()
        if (!taken) break
        username = `${baseUsername}${i}`
    }

    await admin.from('profiles').insert({
        id: userId,
        username,
        avatar_url: avatarUrl ?? null,
        rating_bullet: 1200, rating_blitz: 1200, rating_rapid: 1200, rating_classical: 1200,
        games_played: 0, wins: 0, losses: 0, draws: 0,
        created_at: new Date().toISOString(),
    })
}
```

- [ ] **Step 2: Create `frontend/app/auth/callback/page.tsx`**

This client component runs when `?implicit=1` is in the URL. It reads the `#access_token` fragment, calls `supabase.auth.setSession`, then redirects to `/lobby`.

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Suspense } from 'react'

function CallbackHandler() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const next = searchParams.get('next') ?? '/lobby'
        const hash = window.location.hash.substring(1)

        if (!hash) {
            // No hash either — something went wrong
            router.replace('/login?error=oauth_failed')
            return
        }

        const params = new URLSearchParams(hash)
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')

        if (!accessToken || !refreshToken) {
            router.replace('/login?error=oauth_failed')
            return
        }

        const supabase = createClient()
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
            .then(({ error }) => {
                if (error) {
                    setError(error.message)
                    return
                }
                router.replace(next)
            })
    }, [router, searchParams])

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center text-text-secondary">
                Sign-in failed: {error}
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
        </div>
    )
}

export default function CallbackPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
            </div>
        }>
            <CallbackHandler />
        </Suspense>
    )
}
```

- [ ] **Step 3: TypeScript check**
```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**
```bash
git add frontend/app/auth/callback/route.ts frontend/app/auth/callback/page.tsx
git commit -m "fix: handle both PKCE and implicit OAuth flows in auth callback"
```

---

## Task 3: Fix SocketProvider – Reconnect Event

**Files:**
- Modify: `frontend/components/SocketProvider.tsx`

When the socket drops and reconnects (network hiccup, server restart), all room memberships are lost. The game page and lobby need to know so they can re-emit `join_game` and `authenticate`. We expose this via a `reconnect` socket event that pages can listen to.

- [ ] **Step 1: Rewrite `frontend/components/SocketProvider.tsx`**

```tsx
'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { usePathname } from 'next/navigation';

const SocketContext = createContext<Socket | null>(null);

export function useSocket() {
    return useContext(SocketContext);
}

const AUTH_PAGES = ['/login', '/signup', '/reset-password'];

export default function SocketProvider({ children }: { children: React.ReactNode }) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const pathname = usePathname();
    const isAuthPage = AUTH_PAGES.some(p => pathname === p);

    useEffect(() => {
        if (isAuthPage) return;

        const url = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001';

        const s = io(url, {
            autoConnect: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 8000,
            transports: ['websocket', 'polling'],
        });

        s.on('connect', () => {
            console.log('[Socket] Connected:', s.id)
            // Signal pages to re-authenticate and re-join rooms
            s.emit('_reconnected')
        });
        s.on('connect_error', (err) => console.warn('[Socket] Connection error:', err.message));
        s.on('disconnect', (reason) => console.warn('[Socket] Disconnected:', reason));

        socketRef.current = s;
        setSocket(s);

        return () => {
            s.disconnect();
            socketRef.current = null;
            setSocket(null);
        };
    }, [isAuthPage]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
}
```

Note: `_reconnected` is emitted on **every** connect (including the first). Pages guard against this by checking their own state (e.g., `myProfile` and `gameId` must be truthy before acting).

- [ ] **Step 2: Commit**
```bash
git add frontend/components/SocketProvider.tsx
git commit -m "fix: emit _reconnected on every socket connect for room re-join"
```

---

## Task 4: Fix Game Page – Rejoin Room on Reconnect

**Files:**
- Modify: `frontend/app/game/[id]/page.tsx`

After a reconnect, the socket has a new connection ID and is in no rooms. Add a listener for `_reconnected` that re-emits `authenticate` and `join_game` so move events resume.

Also add a small "Reconnecting…" banner so players see the connection state.

- [ ] **Step 1: Add reconnect state and banner**

At the top of `GamePage`, add one state variable after the existing state block:

```tsx
const [connected, setConnected] = useState(true)
```

- [ ] **Step 2: Add reconnect listener to the socket useEffect**

In the socket `useEffect` (the one that starts with `if (!socket || !myProfile) return`), add these lines right after `socket.emit('join_game', params.id)`:

```tsx
const onReconnected = () => {
    setConnected(false)
    // Brief delay so the banner is visible before rooms are re-joined
    setTimeout(() => {
        socket.emit('authenticate', myProfile.id)
        socket.emit('join_game', params.id)
        setConnected(true)
    }, 400)
}

const onDisconnect = () => setConnected(false)
const onConnect = () => setConnected(true)

socket.on('_reconnected', onReconnected)
socket.on('disconnect', onDisconnect)
socket.on('connect', onConnect)
```

And add these to the cleanup return:
```tsx
socket.off('_reconnected', onReconnected)
socket.off('disconnect', onDisconnect)
socket.off('connect', onConnect)
```

- [ ] **Step 3: Add reconnecting banner to the JSX**

Directly inside the board column `div` (the `flex-1 max-w-[min(80vh,780px)]` div), before `<PlayerStrip player={topPlayer}...`, add:

```tsx
{!connected && (
    <div className="w-full text-center text-xs bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 py-1.5 rounded-lg mb-1 flex items-center justify-center gap-2">
        <div className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        Reconnecting…
    </div>
)}
```

- [ ] **Step 4: TypeScript check**
```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**
```bash
git add "frontend/app/game/[id]/page.tsx"
git commit -m "fix: rejoin game room and re-authenticate on socket reconnect"
```

---

## Task 5: Fix Lobby – Re-authenticate on Reconnect

**Files:**
- Modify: `frontend/app/lobby/page.tsx`

If the socket drops while a user is in the matchmaking queue, the server cleans up their queue entry (disconnect handler). When they reconnect, the UI still shows "Searching…" but the server has no entry. The fix: on reconnect, if `searching` is true, re-emit `authenticate` and `join_queue` automatically. If not searching, just re-authenticate.

- [ ] **Step 1: Add reconnect listener to the socket useEffect in lobby**

Find the socket `useEffect` (starts with `if (!socket) return`) and add inside it, after `socket.on('game_start', onGameStart)`:

```tsx
const onReconnected = () => {
    if (!myProfile) return
    socket.emit('authenticate', myProfile.id)

    if (searching) {
        const { mins, inc } = getTcMinutes()
        socket.emit('join_queue', {
            user: {
                id: myProfile.id,
                rating: myProfile.rating_rapid ?? 1200,
                games_played: myProfile.games_played ?? 0,
            },
            time_control: mins,
            increment: inc,
        })
    }
}

socket.on('_reconnected', onReconnected)
```

And in the cleanup return, add:
```tsx
socket.off('_reconnected', onReconnected)
```

- [ ] **Step 2: TypeScript check**
```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**
```bash
git add frontend/app/lobby/page.tsx
git commit -m "fix: re-authenticate and re-join queue on socket reconnect in lobby"
```

---

## Task 6: Fix Server – Track Player→Socket Mapping

**Files:**
- Modify: `server/server.js`

Currently the server cleans up the matchmaking queue on disconnect (correct), but has no way to notify a reconnected player of their in-progress game. Add a `userId → socketId` map so the server can emit `game_resume` to the correct socket when a player reconnects mid-game.

- [ ] **Step 1: Add the userSocket map and reconnect handler in `server/server.js`**

After `const matchmaking = new MatchmakingService(io);` add:

```js
// Track authenticated userId → current socketId
const userSockets = new Map(); // userId → socketId
```

Inside `io.on('connection', (socket) => {`, update the `authenticate` handler:

```js
socket.on('authenticate', (userId) => {
    userSockets.set(userId, socket.id);
    socket.join(`user_${userId}`);

    // If player was in an active game when they disconnected, let them know
    // so the client can re-join the game room automatically
    // (client already handles this via _reconnected event)
});
```

Inside the `disconnect` handler, clean up the map:

```js
socket.on('disconnect', () => {
    // Clean up matchmaking queue
    for (let [userId, entry] of matchmaking.queue.entries()) {
        if (entry.socketId === socket.id) matchmaking.leaveQueue(userId);
    }
    // Clean up user socket map
    for (let [userId, sid] of userSockets.entries()) {
        if (sid === socket.id) userSockets.delete(userId);
    }
});
```

- [ ] **Step 2: Restart the Node server**
```bash
# Kill existing process and restart
node server/server.js
```

- [ ] **Step 3: Commit**
```bash
git add server/server.js
git commit -m "fix: track userId→socketId map for reconnect support"
```

---

## Verification Checklist

```
[ ] Supabase Auth → Redirect URLs includes http://localhost:3000/auth/callback
[ ] Supabase Auth → Site URL is http://localhost:3000
[ ] Click "Continue with Google" → goes to Google → comes back to /lobby (not /login)
[ ] After Google sign-in, navbar shows avatar (not "Log In")
[ ] Open two browsers, log in as different accounts, select same time control → match found → both land on game page
[ ] Make a move in Browser 1 → appears in Browser 2
[ ] Disconnect Browser 1's network briefly → reconnect → "Reconnecting…" banner shown → moves sync again
[ ] Private game: Browser 1 creates invite → Browser 2 opens link → both land on same game
[ ] tsc --noEmit passes clean
```
