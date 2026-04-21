# Gambit Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign every page of Gambit with rich, dense, professional dark-walnut layouts — no functionality changes, visual improvements only.

**Architecture:** Pure JSX/CSS changes. All socket handlers, useEffects, API calls, and state logic remain untouched. New shared components (Toast, skeleton loaders) are created. Each page is rewritten in place — same file, same exports, same props.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Lucide React, Recharts (already installed)

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| MODIFY | `frontend/app/globals.css` | Add missing tokens, shimmer animation, page-transition class |
| CREATE | `frontend/components/Toast.tsx` | Global toast notification system |
| MODIFY | `frontend/app/layout.tsx` | Wire ToastProvider |
| MODIFY | `frontend/components/Navbar.tsx` | 52px navbar, online pill, gradient accent line |
| MODIFY | `frontend/app/page.tsx` | Animated board hero, features grid, footer |
| MODIFY | `frontend/app/lobby/page.tsx` | Two-column layout, rich TC cards, live games sidebar |
| MODIFY | `frontend/app/leaderboard/page.tsx` | Podium, pill tabs, win-rate bar, stats strip |
| MODIFY | `frontend/app/game/[id]/page.tsx` | Player strips, eval bar, rich game-over modal |
| MODIFY | `frontend/app/analysis/page.tsx` | Full-height board, import tab, engine lines |
| MODIFY | `frontend/app/profile/[username]/page.tsx` | Banner header, rating sparklines, dense game table |

---

## Task 1: globals.css — Add Missing Tokens & Utilities

**Files:**
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Replace the `:root` block and add shimmer + transition utilities**

Replace the entire contents of `frontend/app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Surfaces */
    --bg-page:      #0F0D0B;
    --bg-surface:   #1A1714;
    --bg-elevated:  #231F1B;
    --bg-hover:     #2A2520;
    --bg-active:    #332D28;

    /* Accent */
    --accent:       #C4965A;
    --accent-hover: #D4A96A;
    --accent-dim:   rgba(196,150,90,0.12);
    --accent-glow:  rgba(196,150,90,0.06);

    /* Board */
    --board-light:  #F0D9B5;
    --board-dark:   #B58863;
    --frame-outer:  #3D2B1A;
    --frame-inner:  #2A1D10;

    /* Text */
    --text-primary:   #F2EDE6;
    --text-secondary: #9A8E84;
    --text-tertiary:  #5E534C;

    /* Borders */
    --border:        rgba(255,255,255,0.06);
    --border-strong: rgba(255,255,255,0.12);
    --border-accent: rgba(196,150,90,0.3);

    /* Semantic */
    --green:  #4FA85A;
    --red:    #C0392B;
    --amber:  #D4A017;
    --indicator-green: #4FA85A;
    --green-indicator: #4FA85A;

    /* Board highlight */
    --last-move: rgba(196, 150, 90, 0.35);
    --selected:  rgba(250, 250, 100, 0.45);
    --valid-dot: rgba(242, 237, 230, 0.22);
    --check-highlight: #C0392B;

    /* Spacing scale */
    --space-xs:  4px;
    --space-sm:  8px;
    --space-md:  16px;
    --space-lg:  24px;
    --space-xl:  32px;
    --space-2xl: 48px;
    --space-3xl: 64px;
  }

  * {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    background-color: var(--bg-page);
    color: var(--text-primary);
    font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
    line-height: 1.6;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  h1, h2, h3, h4, h5, h6 {
    font-weight: 500;
    letter-spacing: -0.5px;
    line-height: 1.2;
  }

  .font-mono, code, pre, [class*="tabular"] {
    font-variant-numeric: tabular-nums;
  }

  /* Thin scrollbars */
  * {
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong) transparent;
  }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 2px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-tertiary); }
}

@layer components {
  .board-outer-frame {
    border: 4px solid var(--frame-outer);
    border-radius: 6px;
    background: var(--frame-outer);
    box-shadow: 0 20px 60px rgba(0,0,0,0.7);
  }
  .board-inner-frame {
    border: 2px solid var(--frame-inner);
    position: relative;
    overflow: hidden;
  }
  .board-coordinate {
    position: absolute;
    font-size: 10px;
    color: var(--text-tertiary);
    font-weight: 500;
    user-select: none;
    cursor: default;
  }
}

@layer utilities {
  /* Shimmer skeleton animation */
  @keyframes shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  .skeleton {
    background: linear-gradient(
      90deg,
      var(--bg-elevated) 25%,
      var(--bg-hover) 50%,
      var(--bg-elevated) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 6px;
  }

  /* Page fade-in on mount */
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .page-enter {
    animation: fadeUp 200ms ease forwards;
  }

  /* Toast slide-up */
  @keyframes toastIn {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .toast-enter {
    animation: toastIn 200ms ease forwards;
  }

  /* Clock pulse when < 30s */
  @keyframes clockPulse {
    0%, 100% { border-color: rgba(192,57,43,0.4); }
    50%       { border-color: rgba(192,57,43,0.8); }
  }
  .clock-critical {
    animation: clockPulse 1s ease-in-out infinite;
  }

  /* Button press */
  .btn-press:active { transform: scale(0.97); transition: transform 100ms; }
}
```

- [ ] **Step 2: Commit**
```bash
git add frontend/app/globals.css
git commit -m "style: update design tokens, add shimmer/fade/toast/clock-pulse utilities"
```

---

## Task 2: Toast Notification Component

**Files:**
- Create: `frontend/components/Toast.tsx`
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Create `frontend/components/Toast.tsx`**

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Check, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; type: ToastType; message: string; }
interface ToastContextValue { toast: (message: string, type?: ToastType) => void; }

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

let _counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const toast = useCallback((message: string, type: ToastType = 'info') => {
        const id = ++_counter;
        setToasts(prev => [...prev, { id, type, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    }, []);

    const dismiss = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-[500] flex flex-col gap-2 pointer-events-none">
                {toasts.map(t => (
                    <div key={t.id} className="toast-enter pointer-events-auto flex items-start gap-3 bg-elevated border border-border-strong rounded-xl px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.4)] min-w-[260px] max-w-[340px]"
                        style={{ borderLeft: `3px solid ${t.type === 'success' ? 'var(--green)' : t.type === 'error' ? 'var(--red)' : 'var(--accent)'}` }}>
                        <span className="shrink-0 mt-0.5">
                            {t.type === 'success' && <Check size={15} className="text-green-400" />}
                            {t.type === 'error'   && <AlertCircle size={15} className="text-red-400" />}
                            {t.type === 'info'    && <Info size={15} className="text-accent" />}
                        </span>
                        <span className="text-sm text-text-primary leading-snug flex-1">{t.message}</span>
                        <button onClick={() => dismiss(t.id)} className="shrink-0 text-text-tertiary hover:text-text-primary transition-colors mt-0.5">
                            <X size={13} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
```

- [ ] **Step 2: Wire ToastProvider into `frontend/app/layout.tsx`**

Find the import block and add:
```tsx
import { ToastProvider } from '@/components/Toast'
```

Find where `<ProfileProvider>` wraps children. Add `<ToastProvider>` as the outermost wrapper inside `<body>`:
```tsx
<body>
  <ToastProvider>
    <ProfileProvider>
      <PresenceProvider>
        <SocketProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
        </SocketProvider>
      </PresenceProvider>
    </ProfileProvider>
  </ToastProvider>
</body>
```

- [ ] **Step 3: Commit**
```bash
git add frontend/components/Toast.tsx frontend/app/layout.tsx
git commit -m "feat: add global Toast notification system with slide-up animation"
```

---

## Task 3: Navbar Redesign

**Files:**
- Modify: `frontend/components/Navbar.tsx`

- [ ] **Step 1: Replace the return JSX in Navbar.tsx**

Keep all existing imports, state, useEffects, and handlers unchanged. Replace only the `return (...)` block:

```tsx
  return (
    <>
      {/* Challenge banner */}
      {challengeBanner && (
        <div className="fixed top-[52px] left-1/2 -translate-x-1/2 z-[300] w-full max-w-sm px-4">
          <div className="bg-elevated border border-border-accent rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-4 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-text-primary">
                <span className="text-accent">{challengeBanner.from_username}</span> challenges you
              </div>
              <span className="text-xs text-text-tertiary">{challengeBanner.time_control} min</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { socket?.emit('challenge_accept', { from_user_id: challengeBanner.from_user_id, to_user_id: profile?.id, time_control: challengeBanner.time_control, is_rated: challengeBanner.is_rated, color: challengeBanner.color }); setChallengeBanner(null); }}
                className="flex-1 py-2 bg-accent hover:bg-accent-hover text-[#0F0D0B] rounded-lg text-sm font-medium transition-colors">Accept</button>
              <button onClick={() => { socket?.emit('challenge_decline', { from_user_id: challengeBanner.from_user_id, by_username: profile?.username }); setChallengeBanner(null); }}
                className="flex-1 py-2 bg-surface hover:bg-hover border border-border rounded-lg text-sm text-text-secondary transition-colors">Decline</button>
            </div>
          </div>
        </div>
      )}

      {/* Main navbar */}
      <nav className="sticky top-0 z-50 h-[52px] flex items-center px-4 md:px-6"
        style={{ background: 'rgba(35,31,27,0.92)', backdropFilter: 'blur(12px)', borderBottom: '0.5px solid var(--border)' }}>

        <div className="flex items-center gap-8 w-full">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0 group" style={{ borderLeft: '2px solid var(--accent)', paddingLeft: '10px' }}>
            <svg width="18" height="18" viewBox="0 0 32 32" fill="none" className="text-accent transition-transform group-hover:scale-110">
              <path d="M8 28h16M10 28v-4c0-2 1-3 2-4l2-2c1-1 2-3 2-5V9c0-1-.5-2-1-3l-2-1 1-1 3 1c1 1 2 2 2 4v4l3-3c1-1 2-1 3 0s0 2-1 3l-4 4v6c0 1-1 2-2 2H12c-1 0-2-1-2-2z"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[17px] font-semibold text-text-primary" style={{ letterSpacing: '-0.3px' }}>Gambit</span>
          </Link>

          {/* Center nav */}
          <div className="hidden md:flex items-center gap-1 flex-1">
            {NAV_LINKS.map(link => {
              const active = isActive(link.href);
              return (
                <Link key={link.href} href={link.href}
                  className={`relative px-3 py-1.5 text-sm transition-colors duration-150 rounded-md ${active ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-hover'}`}>
                  {link.label}
                  {active && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-accent" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Right cluster */}
          <div className="flex items-center gap-3 ml-auto">

            {/* Online pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-green-400"
              style={{ background: 'rgba(79,168,90,0.1)', border: '0.5px solid rgba(79,168,90,0.25)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
              {onlineCount} online
            </div>

            {authLoading ? (
              <div className="w-8 h-8 rounded-full skeleton" />
            ) : user ? (
              <>
                {/* Bell */}
                <div className="relative" ref={notifRef}>
                  <button onClick={async () => { setIsNotifOpen(v => !v); if (!isNotifOpen) { setNotifLoading(true); try { const r = await fetch(`${process.env.NEXT_PUBLIC_SOCKET_URL||'http://127.0.0.1:3001'}/api/notifications`, { headers: { authorization: `Bearer ${(await (createClient()).auth.getSession()).data.session?.access_token}` } }); if (r.ok) setNotifications(await r.json()); } catch {} setNotifLoading(false); } }}
                    className="relative w-8 h-8 flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors rounded-md hover:bg-hover">
                    <Bell size={17} strokeWidth={1.5} />
                    {notifications.some(n => !n.read) && (
                      <span className="absolute top-1 right-1 w-2 h-2 bg-accent rounded-full border border-bg-elevated" />
                    )}
                  </button>
                  {isNotifOpen && (
                    <div className="absolute top-[40px] right-0 w-72 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden z-50"
                      style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-strong)' }}>
                      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Notifications</span>
                      </div>
                      <div className="max-h-72 overflow-y-auto divide-y divide-border">
                        {notifLoading ? (
                          <div className="p-4 flex justify-center"><div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" /></div>
                        ) : notifications.length === 0 ? (
                          <div className="p-4 text-center text-text-tertiary text-sm">No notifications</div>
                        ) : notifications.slice(0, 8).map((n: any) => (
                          <div key={n.id} className={`px-4 py-3 text-sm hover:bg-hover transition-colors ${!n.read ? 'text-text-primary' : 'text-text-secondary'}`}>
                            {n.payload?.message || n.type}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Avatar dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center transition-all hover:ring-2"
                    style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 0 2px var(--border-accent)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
                    {profile?.avatar_url
                      ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-accent text-sm font-semibold">{(profile?.username || '?')[0].toUpperCase()}</span>
                    }
                  </button>

                  {isDropdownOpen && (
                    <div className="absolute top-[44px] right-0 w-56 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                      style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-strong)' }}>
                      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden shrink-0"
                          style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}>
                          {profile?.avatar_url
                            ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                            : <span className="text-accent text-sm font-semibold">{(profile?.username || '?')[0].toUpperCase()}</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-text-primary truncate">{profile?.display_name || profile?.username}</div>
                          <div className="text-xs text-text-tertiary tabular-nums">{Math.round(profile?.rating_rapid ?? 1200)} Rapid</div>
                        </div>
                      </div>
                      {[
                        { href: `/profile/${profile?.username}`, label: 'My Profile', Icon: User },
                        { href: '/leaderboard', label: 'Leaderboard', Icon: Trophy },
                        { href: '/settings', label: 'Settings', Icon: Settings },
                      ].map(({ href, label, Icon }) => (
                        <Link key={href} href={href} onClick={() => setIsDropdownOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-hover hover:text-text-primary transition-colors">
                          <Icon size={14} strokeWidth={1.5} /> {label}
                        </Link>
                      ))}
                      <div className="h-px bg-border mx-3 my-1" />
                      <button onClick={async () => { const s = createClient(); await s.auth.signOut(); window.location.href = '/login'; }}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-hover hover:text-red-300 transition-colors w-full text-left">
                        <LogOut size={14} strokeWidth={1.5} /> Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                <Link href="/login" className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors rounded-md border border-transparent hover:border-border hover:bg-hover">Log In</Link>
                <Link href="/signup" className="px-4 py-1.5 text-sm font-medium rounded-lg text-[#0F0D0B] btn-press transition-colors"
                  style={{ background: 'var(--accent)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}>
                  Sign Up
                </Link>
              </div>
            )}

            {/* Mobile hamburger */}
            <button className="md:hidden w-8 h-8 flex items-center justify-center text-text-secondary hover:text-text-primary"
              onClick={() => setIsMenuOpen(v => !v)}>
              {isMenuOpen ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Accent gradient line under navbar */}
      <div className="h-px w-full sticky top-[52px] z-40 pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)', opacity: 0.25 }} />

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden fixed top-[53px] inset-x-0 z-40 border-b border-border shadow-xl"
          style={{ background: 'var(--bg-elevated)' }}>
          <div className="px-4 py-3 flex flex-col gap-1">
            {NAV_LINKS.map(link => (
              <Link key={link.href} href={link.href} onClick={() => setIsMenuOpen(false)}
                className={`px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive(link.href) ? 'bg-accent-dim text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-hover'}`}>
                {link.label}
              </Link>
            ))}
            {!user && (
              <div className="flex gap-2 mt-2 pt-2 border-t border-border">
                <Link href="/login" onClick={() => setIsMenuOpen(false)} className="flex-1 text-center py-2 text-sm text-text-secondary border border-border rounded-lg hover:bg-hover">Log In</Link>
                <Link href="/signup" onClick={() => setIsMenuOpen(false)} className="flex-1 text-center py-2 text-sm font-medium rounded-lg text-[#0F0D0B]" style={{ background: 'var(--accent)' }}>Sign Up</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
```

- [ ] **Step 2: Verify imports include `LogOut` and `Bell`**

Ensure the import line at top of Navbar.tsx includes: `Bell, User, BarChart2, Trophy, Settings, LogOut, Swords, Menu, X, Globe2`

- [ ] **Step 3: Commit**
```bash
git add frontend/components/Navbar.tsx
git commit -m "style: navbar — 52px height, online pill, accent gradient line, avatar ring"
```

---

## Task 4: Landing Page Redesign

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Rewrite `frontend/app/page.tsx` completely**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Zap, BarChart2, Trophy, Users, Shield, Globe2 } from "lucide-react";
import { Chess } from "chess.js";

// ── Animated demo board ───────────────────────────────────────────────────────
const DEMO_MOVES = ['e2e4','e7e5','f2f4','e5f4','g1f3','g7g5','h2h4','g5g4'];
const GLYPHS: Record<string, string> = {
  wK:'♔',wQ:'♕',wR:'♖',wB:'♗',wN:'♘',wP:'♙',
  bK:'♚',bQ:'♛',bR:'♜',bB:'♝',bN:'♞',bP:'♟',
};

function AnimatedBoard() {
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [moveIdx, setMoveIdx] = useState(0);
  const [lastMove, setLastMove] = useState<{from:string;to:string}|null>(null);

  useEffect(() => {
    const g = new Chess();
    let idx = 0;
    const tick = () => {
      if (idx < DEMO_MOVES.length) {
        const uci = DEMO_MOVES[idx];
        const from = uci.slice(0,2), to = uci.slice(2,4);
        g.move({ from, to });
        setFen(g.fen());
        setLastMove({ from, to });
        setMoveIdx(idx);
        idx++;
      } else {
        // Reset after pause
        setTimeout(() => {
          g.reset();
          setFen(g.fen());
          setLastMove(null);
          idx = 0;
        }, 3000);
      }
    };
    const timer = setInterval(tick, 900);
    return () => clearInterval(timer);
  }, []);

  const board = new Chess();
  try { board.load(fen); } catch {}
  const squares = board.board();
  const files = [0,1,2,3,4,5,6,7];
  const ranks = [7,6,5,4,3,2,1,0];

  return (
    <div className="relative w-full max-w-[360px] mx-auto">
      <div className="board-outer-frame p-[3px]">
        <div className="board-inner-frame w-full aspect-square grid grid-cols-8 grid-rows-8">
          {ranks.map(rank => files.map(file => {
            const sq = `${String.fromCharCode(97+file)}${rank+1}`;
            const piece = squares[7-rank][file];
            const isLight = (file+rank)%2===1;
            const isLast = lastMove?.from===sq||lastMove?.to===sq;
            let bg = isLight ? '#F0D9B5' : '#B58863';
            if (isLast) bg = isLight ? 'rgba(196,150,90,0.6)' : 'rgba(196,150,90,0.45)';
            return (
              <div key={sq} style={{ background: bg }} className="relative flex items-center justify-center">
                {piece && (
                  <span className="select-none" style={{
                    fontSize:'clamp(14px,4.5vw,38px)', lineHeight:1, fontFamily:'serif',
                    color: piece.color==='w' ? '#FFFFFF' : '#1A1A1A',
                    textShadow: piece.color==='w'
                      ? '0 1px 3px rgba(0,0,0,0.7),0 0 1px rgba(0,0,0,0.5)'
                      : '0 1px 0 rgba(255,255,255,0.2)',
                    filter: piece.color==='w'
                      ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))'
                      : 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))',
                  }}>
                    {GLYPHS[`${piece.color}${piece.type.toUpperCase()}`]}
                  </span>
                )}
              </div>
            );
          }))}
        </div>
      </div>
      <p className="text-center text-text-tertiary text-xs mt-3 tabular-nums">
        King's Gambit · 1. e4 e5 2. f4 exf4 3. Nf3 g5 4. h4
      </p>
    </div>
  );
}

// ── Features ──────────────────────────────────────────────────────────────────
const FEATURES = [
  { Icon: Zap,       title: 'Bullet Games',     desc: 'Sub-second reactions. Pure instinct. 1+0 bullet with server-authoritative clocks.' },
  { Icon: BarChart2, title: 'Accuracy Rating',  desc: 'Depth-18 Stockfish centipawn loss classification after every game you play.' },
  { Icon: Users,     title: 'Play Friends',      desc: 'Invite links and private rooms. Share a link, start playing in seconds.' },
  { Icon: Trophy,    title: 'Leaderboards',      desc: 'Glicko-2 rated per time control. Bullet, blitz, rapid, and classical tracked separately.' },
  { Icon: Shield,    title: 'Full Rules',        desc: 'Castling, en passant, promotion. All edge cases handled by server-side chess.js.' },
  { Icon: Globe2,    title: 'Play Anywhere',     desc: 'Fully responsive down to 375px. Tap to select, tap to move on any device.' },
];

export default function Home() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-53px)] page-enter">

      {/* ── HERO ── */}
      <section className="flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-20 px-6 pt-16 pb-12 max-w-6xl mx-auto w-full">

        {/* Left: text */}
        <div className="flex-1 text-center lg:text-left max-w-xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs text-text-secondary mb-8"
            style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-strong)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Now in beta · Free to play
          </div>

          {/* Headline */}
          <h1 className="text-text-primary mb-5 font-semibold"
            style={{ fontSize:'clamp(44px,7vw,76px)', letterSpacing:'-3px', lineHeight:'1.0',
              background:'linear-gradient(135deg, var(--text-primary) 55%, var(--accent))',
              WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
            Chess,<br />perfected.
          </h1>

          <p className="text-text-secondary text-lg leading-relaxed mb-8 max-w-md mx-auto lg:mx-0">
            A premium dark-mode chess platform with real-time matchmaking, engine analysis, and accuracy ratings.
          </p>

          {/* CTAs */}
          <div className="flex items-center gap-3 justify-center lg:justify-start flex-wrap mb-8">
            <Link href="/lobby"
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-[#0F0D0B] text-base btn-press transition-all shadow-lg"
              style={{ background:'var(--accent)', boxShadow:'0 4px 20px rgba(196,150,90,0.3)' }}
              onMouseEnter={e=>(e.currentTarget.style.background='var(--accent-hover)')}
              onMouseLeave={e=>(e.currentTarget.style.background='var(--accent)')}>
              Play Now <ChevronRight size={18} strokeWidth={2} />
            </Link>
            <Link href="/signup"
              className="px-6 py-3 rounded-xl font-medium text-text-primary text-base btn-press transition-colors"
              style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border-strong)' }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--border-accent)';e.currentTarget.style.background='var(--bg-hover)'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-strong)';e.currentTarget.style.background='var(--bg-elevated)'}}>
              Create Account
            </Link>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-6 justify-center lg:justify-start text-xs text-text-tertiary flex-wrap">
            {[
              { num: '∞', label: 'games available' },
              { num: '6', label: 'time controls' },
              { num: 'Free', label: 'always' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className="text-accent font-semibold tabular-nums">{s.num}</span>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: animated board */}
        <div className="shrink-0 w-full max-w-[380px]">
          <AnimatedBoard />
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="max-w-5xl mx-auto px-6 py-12 w-full">
        <p className="text-center text-text-tertiary text-xs uppercase tracking-[0.15em] mb-8 font-medium">
          Why Gambit
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <div key={f.title}
              className="group rounded-xl p-6 cursor-default transition-all duration-200"
              style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border)' }}
              onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.cssText+='border-color:var(--border-accent);transform:translateY(-2px);box-shadow:0 4px 20px var(--accent-glow)'}}
              onMouseLeave={e=>{const el=e.currentTarget as HTMLDivElement;el.style.borderColor='var(--border)';el.style.transform='';el.style.boxShadow=''}}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background:'var(--accent-dim)' }}>
                <f.Icon size={20} className="text-accent" strokeWidth={1.5} />
              </div>
              <h3 className="text-text-primary font-medium text-sm mb-2">{f.title}</h3>
              <p className="text-text-secondary text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="mt-auto" style={{ background:'var(--bg-elevated)', borderTop:'0.5px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 32 32" fill="none" className="text-accent">
              <path d="M8 28h16M10 28v-4c0-2 1-3 2-4l2-2c1-1 2-3 2-5V9c0-1-.5-2-1-3l-2-1 1-1 3 1c1 1 2 2 2 4v4l3-3c1-1 2-1 3 0s0 2-1 3l-4 4v6c0 1-1 2-2 2H12c-1 0-2-1-2-2z"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-accent font-semibold text-sm">Gambit</span>
            <span className="text-text-tertiary text-xs ml-1">· Chess, perfected.</span>
          </div>
          <div className="flex gap-5 text-text-tertiary text-sm">
            {[['Play','/lobby'],['Leaderboard','/leaderboard'],['Analysis','/analysis'],['Offline','/offline']].map(([l,h])=>(
              <Link key={h} href={h} className="hover:text-text-secondary transition-colors">{l}</Link>
            ))}
          </div>
          <span className="text-text-tertiary text-xs">© 2026 Gambit</span>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add frontend/app/page.tsx
git commit -m "style: landing page — animated King's Gambit board, gradient headline, features grid"
```

---

## Task 5: Lobby Page Redesign

**Files:**
- Modify: `frontend/app/lobby/page.tsx`

- [ ] **Step 1: Keep all state/logic, replace the return JSX**

Keep every import, state declaration, useEffect, and handler. Replace only the `return (...)` block with the following. The time control card data array also gets subtitle fields added:

At the top of the component (after existing state declarations), modify `BASE_TIME_CONTROLS` definition to:
```tsx
const TIME_CONTROL_META: Record<string, { subtitle: string; badge?: string }> = {
    bullet:    { subtitle: 'Fastest games · Pure instinct', badge: undefined },
    blitz:     { subtitle: 'Standard competitive play', badge: 'Popular' },
    rapid:     { subtitle: 'Longer games · Deep strategy', badge: undefined },
    classical: { subtitle: 'Maximum depth & preparation', badge: undefined },
    custom:    { subtitle: 'Set your own time control', badge: undefined },
    daily:     { subtitle: 'Days per move · Correspondence', badge: undefined },
};
```

Replace the return JSX with:

```tsx
  const selectedMeta = TIME_CONTROL_META[selectedTc] ?? { subtitle: '' };
  const tcForDisplay = BASE_TIME_CONTROLS.find(t => t.id === selectedTc);
  const displayTime = selectedTc === 'custom' ? `${customMin}+${customInc}` : tcForDisplay?.time ?? '';

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 page-enter">

      {/* Active game banner */}
      {activeGame && (
        <div className="mb-4 px-5 py-3 rounded-xl flex items-center justify-between"
          style={{ background:'var(--accent-dim)', border:'1px solid var(--border-accent)' }}>
          <span className="text-sm text-text-primary">You have an active game in progress</span>
          <Link href={`/game/${activeGame.id}`}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-[#0F0D0B] btn-press"
            style={{ background:'var(--accent)' }}>
            Resume →
          </Link>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── LEFT: Play section ── */}
        <div className="flex-1 min-w-0">

          {/* Welcome bar */}
          <div className="rounded-xl px-5 py-4 mb-5 flex items-center justify-between"
            style={{ background:'var(--accent-glow)', border:'0.5px solid var(--border-accent)' }}>
            <div>
              <div className="text-base font-medium text-text-primary">
                {myProfile ? `Welcome back, ${myProfile.display_name || myProfile.username}` : 'Welcome to Gambit'}
              </div>
              <div className="text-xs text-text-tertiary mt-0.5">
                {onlineCount} player{onlineCount !== 1 ? 's' : ''} online
              </div>
            </div>
            {myProfile && (
              <div className="text-right hidden sm:block">
                <div className="text-accent font-semibold tabular-nums text-lg">{Math.round(myProfile.rating_blitz ?? 1200)}</div>
                <div className="text-text-tertiary text-xs">Blitz rating</div>
              </div>
            )}
          </div>

          {/* Time control grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
            {BASE_TIME_CONTROLS.map(tc => {
              const meta = TIME_CONTROL_META[tc.id];
              const isSelected = selectedTc === tc.id;
              const timeLabel = tc.id === 'custom' && selectedTc === 'custom' ? `${customMin}+${customInc}` : tc.time;
              return (
                <div key={tc.id}
                  onClick={() => tc.id === 'custom' ? setIsCustomModalOpen(true) : setSelectedTc(tc.id)}
                  className="relative rounded-xl p-4 cursor-pointer transition-all duration-150 select-none"
                  style={{
                    background: isSelected ? 'var(--accent-dim)' : 'var(--bg-surface)',
                    border: isSelected ? '1.5px solid var(--accent)' : '0.5px solid var(--border)',
                    transform: isSelected ? 'none' : undefined,
                  }}
                  onMouseEnter={e => { if (!isSelected) { const el = e.currentTarget as HTMLDivElement; el.style.borderColor='var(--border-accent)'; el.style.transform='translateY(-2px)'; el.style.boxShadow='0 4px 16px var(--accent-glow)'; } }}
                  onMouseLeave={e => { if (!isSelected) { const el = e.currentTarget as HTMLDivElement; el.style.borderColor='var(--border)'; el.style.transform=''; el.style.boxShadow=''; } }}>

                  {meta.badge && (
                    <span className="absolute top-2.5 right-2.5 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded text-accent"
                      style={{ background:'var(--accent-dim)', border:'0.5px solid var(--border-accent)', letterSpacing:'0.08em' }}>
                      {meta.badge}
                    </span>
                  )}

                  <div className="flex items-center justify-between mb-3">
                    <span className={isSelected ? 'text-accent' : 'text-text-secondary'}>{tc.icon}</span>
                    <span className="text-xs font-mono text-text-tertiary">{timeLabel}</span>
                  </div>
                  <div className="text-sm font-medium text-text-primary mb-1">{tc.label}</div>
                  <div className="text-xs text-text-tertiary leading-snug">{meta.subtitle}</div>
                </div>
              );
            })}
          </div>

          {/* Offline bar */}
          <div className="rounded-xl px-4 py-3 mb-5 flex items-center justify-between cursor-pointer transition-colors hover:bg-hover"
            style={{ border:'1px dashed var(--border-strong)' }}
            onClick={() => router.push('/offline')}>
            <div className="flex items-center gap-3">
              <MonitorOff size={16} className="text-text-secondary" strokeWidth={1.5} />
              <div>
                <div className="text-sm font-medium text-text-primary">Play Offline</div>
                <div className="text-xs text-text-tertiary">No account needed</div>
              </div>
            </div>
            <span className="text-accent text-sm hover:text-accent-hover transition-colors">Open board →</span>
          </div>

          {/* Action buttons */}
          {searching ? (
            <div className="rounded-xl p-5 text-center"
              style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border-accent)' }}>
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" />
                <span className="text-text-primary font-medium">Finding opponent…</span>
              </div>
              <div className="text-text-tertiary text-sm mb-4 tabular-nums">{Math.floor(searchTime/60).toString().padStart(2,'0')}:{(searchTime%60).toString().padStart(2,'0')}</div>
              <button onClick={() => { socket?.emit('leave_queue', myProfile?.id); setSearching(false); }}
                className="px-6 py-2 rounded-lg border border-border text-text-secondary text-sm hover:bg-hover hover:text-text-primary transition-colors">
                Cancel search
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5">
              <button
                onClick={async () => { if (!myProfile || !socket) { router.push('/login'); return; } const { mins, inc } = getTcMinutes(); socket.emit('join_queue', { user: myProfile, time_control: selectedTc === 'custom' ? `${customMin}+${customInc}` : String(tcForDisplay?.mins ?? 10), increment: inc }); setSearching(true); }}
                className="col-span-1 sm:col-span-1 h-11 flex items-center justify-center gap-2 rounded-xl font-semibold text-[#0F0D0B] text-sm btn-press transition-all"
                style={{ background:'var(--accent)', gridColumn:'span 3' }}
                onMouseEnter={e=>(e.currentTarget.style.background='var(--accent-hover)')}
                onMouseLeave={e=>(e.currentTarget.style.background='var(--accent)')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                Play Online
              </button>
              <button
                onClick={() => router.push('/offline')}
                className="h-11 flex items-center justify-center gap-2 rounded-xl text-sm text-text-primary btn-press transition-colors"
                style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border-strong)' }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--border-accent)';e.currentTarget.style.background='var(--bg-hover)'}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-strong)';e.currentTarget.style.background='var(--bg-elevated)'}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                Computer
              </button>
              <button
                onClick={() => setIsPrivateModalOpen(true)}
                className="h-11 flex items-center justify-center gap-2 rounded-xl text-sm text-text-primary btn-press transition-colors"
                style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border-strong)' }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--border-accent)';e.currentTarget.style.background='var(--bg-hover)'}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-strong)';e.currentTarget.style.background='var(--bg-elevated)'}}>
                <Users size={15} strokeWidth={1.5} />
                Friend
              </button>
            </div>
          )}
        </div>

        {/* ── RIGHT: Live games sidebar ── */}
        <div className="lg:w-72 shrink-0">
          <div className="rounded-xl overflow-hidden" style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-xs uppercase tracking-[0.1em] text-text-tertiary font-medium">Live Games</span>
              <span className="flex items-center gap-1.5 text-xs text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                Live
              </span>
            </div>
            <div className="p-3">
              {/* Empty state — live games populated via socket in real implementation */}
              <div className="py-10 flex flex-col items-center gap-2 text-center">
                <svg width="40" height="40" viewBox="0 0 32 32" fill="none" className="text-text-tertiary opacity-40">
                  <path d="M8 28h16M10 28v-4c0-2 1-3 2-4l2-2c1-1 2-3 2-5V9c0-1-.5-2-1-3l-2-1 1-1 3 1c1 1 2 2 2 4v4l3-3c1-1 2-1 3 0s0 2-1 3l-4 4v6c0 1-1 2-2 2H12c-1 0-2-1-2-2z"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div className="text-text-tertiary text-sm font-medium">No live games</div>
                <div className="text-text-tertiary text-xs">Start one and it'll appear here</div>
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              { label: 'Online', value: String(onlineCount) },
              { label: 'Your rating', value: String(Math.round(myProfile?.rating_rapid ?? 1200)) },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3 text-center" style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border)' }}>
                <div className="text-accent font-semibold text-lg tabular-nums">{s.value}</div>
                <div className="text-text-tertiary text-xs mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Private game modal (keep existing logic, just update visuals) ── */}
      {isPrivateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setIsPrivateModalOpen(false); setInviteState('config'); }} />
          <div className="relative rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border-strong)' }}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between" style={{ background:'var(--bg-elevated)' }}>
              <h2 className="font-medium text-text-primary">Play a Friend</h2>
              <button onClick={() => { setIsPrivateModalOpen(false); setInviteState('config'); }} className="text-text-tertiary hover:text-text-primary transition-colors"><X size={18} strokeWidth={1.5} /></button>
            </div>

            {inviteState === 'config' && (
              <div className="p-6 space-y-5">
                {/* Time control */}
                <div>
                  <label className="text-xs text-text-tertiary uppercase tracking-wider mb-2 block">Time Control</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['bullet','blitz','rapid','classical','custom','daily'].map(tc => (
                      <button key={tc} onClick={() => setPrivateTc(tc)}
                        className="py-2 rounded-lg text-sm capitalize transition-colors"
                        style={{ background: privateTc===tc ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: privateTc===tc ? '1px solid var(--accent)' : '0.5px solid var(--border)', color: privateTc===tc ? 'var(--accent)' : 'var(--text-secondary)' }}>
                        {tc}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Color */}
                <div>
                  <label className="text-xs text-text-tertiary uppercase tracking-wider mb-2 block">Your Color</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[['white','White'],['black','Black'],['random','Random']].map(([v,l]) => (
                      <button key={v} onClick={() => setPrivateColor(v)}
                        className="py-2 rounded-lg text-sm transition-colors"
                        style={{ background: privateColor===v ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: privateColor===v ? '1px solid var(--accent)' : '0.5px solid var(--border)', color: privateColor===v ? 'var(--accent)' : 'var(--text-secondary)' }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Rated toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-text-primary">Rated game</div>
                    <div className="text-xs text-text-tertiary">Affects Glicko-2 rating</div>
                  </div>
                  <button onClick={() => setPrivateRated(v => !v)}
                    className="w-10 h-5 rounded-full transition-colors relative"
                    style={{ background: privateRated ? 'var(--accent)' : 'var(--bg-elevated)', border: '0.5px solid var(--border-strong)' }}>
                    <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow"
                      style={{ left: privateRated ? 'calc(100% - 18px)' : '2px' }} />
                  </button>
                </div>
                <button
                  onClick={async () => {
                    setInviteState('generating');
                    try {
                      const profileRes = await fetch('/api/profile/me');
                      if (!profileRes.ok) { setInviteState('config'); return; }
                      const profile = await profileRes.json();
                      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3001';
                      const timeValue = privateTc === 'custom' ? `${customMin}+${customInc}` : privateTc;
                      const res = await fetch(`${socketUrl}/api/games/private/create`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: profile.id, timeControl: timeValue, color: privateColor, isRated: privateRated })
                      });
                      const data = await res.json();
                      if (data.token) { setInviteLink(`${window.location.origin}/join/${data.token}`); setInviteGameId(data.game_id); setInviteState('share'); }
                      else { setInviteState('config'); }
                    } catch { setInviteState('config'); }
                  }}
                  className="w-full py-3 rounded-xl font-semibold text-[#0F0D0B] text-sm btn-press transition-all"
                  style={{ background:'var(--accent)' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='var(--accent-hover)')}
                  onMouseLeave={e=>(e.currentTarget.style.background='var(--accent)')}>
                  Generate Invite Link
                </button>
              </div>
            )}

            {inviteState === 'generating' && (
              <div className="p-12 flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
                <span className="text-text-secondary text-sm">Creating game…</span>
              </div>
            )}

            {inviteState === 'share' && (
              <div className="p-6 space-y-5">
                <div className="text-center">
                  <div className="text-text-primary font-medium mb-1">Share this link</div>
                  <div className="text-text-tertiary text-sm">Valid for 48 hours</div>
                </div>
                <div className="rounded-xl p-3 flex items-center gap-2 justify-between"
                  style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border)' }}>
                  <span className="text-text-secondary text-xs truncate flex-1 font-mono">{inviteLink}</span>
                  <button onClick={async () => { await navigator.clipboard.writeText(inviteLink); setJustCopied(true); setTimeout(()=>setJustCopied(false),2000); }}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
                    style={{ background: justCopied ? 'rgba(79,168,90,0.15)' : 'var(--bg-active)', border:'0.5px solid var(--border)', color: justCopied ? 'var(--green)' : 'var(--text-secondary)' }}>
                    {justCopied ? <><Check size={12} strokeWidth={2}/> Copied</> : <><Copy size={12} strokeWidth={1.5}/> Copy</>}
                  </button>
                </div>
                {inviteLink && <div className="flex justify-center"><QRCodeSVG value={inviteLink} size={160} bgColor="#231F1B" fgColor="#F2EDE6" level="M" /></div>}
                <button onClick={() => { if (inviteGameId) router.push(`/game/${inviteGameId}`); }}
                  className="w-full py-3 rounded-xl font-medium text-text-primary text-sm btn-press transition-colors"
                  style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border-strong)' }}>
                  Open Game Room
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom time modal */}
      {isCustomModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsCustomModalOpen(false)} />
          <div className="relative rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6"
            style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border-strong)' }}>
            <h2 className="text-base font-medium text-text-primary mb-6">Custom Time Control</h2>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm text-text-secondary">Minutes per side</label>
                  <span className="text-sm font-medium text-accent tabular-nums">{customMin} min</span>
                </div>
                <input type="range" min={1} max={60} step={1} value={customMin} onChange={e=>setCustomMin(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
                <div className="flex justify-between text-xs text-text-tertiary mt-1"><span>1</span><span>60</span></div>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm text-text-secondary">Increment (seconds)</label>
                  <span className="text-sm font-medium text-accent tabular-nums">{customInc}s</span>
                </div>
                <input type="range" min={0} max={30} step={1} value={customInc} onChange={e=>setCustomInc(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
                <div className="flex justify-between text-xs text-text-tertiary mt-1"><span>0</span><span>30</span></div>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border)' }}>
                <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Preview</div>
                <div className="text-xl font-medium text-text-primary tabular-nums">{customMin}+{customInc}</div>
              </div>
              <button onClick={() => { setSelectedTc('custom'); setIsCustomModalOpen(false); }}
                className="w-full py-3 rounded-xl font-semibold text-[#0F0D0B] text-sm btn-press"
                style={{ background:'var(--accent)' }}>
                Play with this time control
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
```

Ensure `Users` and `X` are imported from lucide-react, and `router` is available via `useRouter()`.

- [ ] **Step 2: Commit**
```bash
git add frontend/app/lobby/page.tsx
git commit -m "style: lobby — welcome bar, rich TC cards with subtitles, live games sidebar, improved modals"
```

---

## Task 6: Leaderboard Page Redesign

**Files:**
- Modify: `frontend/app/leaderboard/page.tsx`

- [ ] **Step 1: Rewrite `frontend/app/leaderboard/page.tsx` completely**

Keep all data-fetching logic unchanged. Replace the full component:

```tsx
"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Trophy, Zap, Flame, Timer, BookOpen, Crown } from 'lucide-react';

const TIME_CONTROLS = [
    { id: 'all', label: 'All' },
    { id: 'bullet', label: 'Bullet', icon: <Zap size={12} strokeWidth={1.5} /> },
    { id: 'blitz', label: 'Blitz', icon: <Flame size={12} strokeWidth={1.5} /> },
    { id: 'rapid', label: 'Rapid', icon: <Timer size={12} strokeWidth={1.5} /> },
    { id: 'classical', label: 'Classical', icon: <BookOpen size={12} strokeWidth={1.5} /> },
];

const RATING_FIELD: Record<string, string> = {
    all: 'rating_rapid', bullet: 'rating_bullet',
    blitz: 'rating_blitz', rapid: 'rating_rapid', classical: 'rating_classical',
};

const MEDAL = ['#FFD700','#C0C0C0','#CD7F32'];

function Avatar({ player, size = 36 }: { player: any; size?: number }) {
    const initial = (player.display_name || player.username || '?')[0].toUpperCase();
    return (
        <div className="rounded-full flex items-center justify-center shrink-0 overflow-hidden font-semibold"
            style={{ width: size, height: size, background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', fontSize: size * 0.38, color: 'var(--accent)' }}>
            {player.avatar_url
                ? <img src={player.avatar_url} alt="" style={{ width: size, height: size, objectFit: 'cover' }} />
                : initial}
        </div>
    );
}

export default function LeaderboardPage() {
    const [filter, setFilter] = useState('all');
    const [players, setPlayers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/leaderboard?field=${RATING_FIELD[filter]}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => { setPlayers(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, [filter]);

    const ratingField = RATING_FIELD[filter];
    const top3 = players.slice(0, 3);
    const rest = players.slice(3);

    return (
        <div className="max-w-3xl mx-auto px-4 py-8 page-enter">

            {/* Page header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Trophy size={22} className="text-accent" strokeWidth={1.5} />
                    <h1 className="text-2xl font-semibold text-text-primary" style={{ letterSpacing: '-0.5px' }}>Leaderboard</h1>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-green-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Updated live
                </div>
            </div>

            {/* Filter tabs — pill style */}
            <div className="flex gap-1 p-1 rounded-xl mb-6 w-fit" style={{ background: 'var(--bg-elevated)' }}>
                {TIME_CONTROLS.map(tc => (
                    <button key={tc.id} onClick={() => setFilter(tc.id)}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm transition-colors"
                        style={{
                            background: filter === tc.id ? 'var(--bg-active)' : 'transparent',
                            border: filter === tc.id ? '0.5px solid var(--border-strong)' : '0.5px solid transparent',
                            color: filter === tc.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                            fontWeight: filter === tc.id ? 500 : 400,
                        }}>
                        {tc.icon}{tc.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="space-y-2">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="skeleton h-[60px] rounded-xl" />
                    ))}
                </div>
            ) : players.length === 0 ? (
                <div className="text-center py-20 text-text-tertiary">
                    <Trophy size={40} className="mx-auto mb-4 opacity-20" strokeWidth={1} />
                    <div className="font-medium mb-1">No ranked players yet</div>
                    <div className="text-sm">Play some games to appear here</div>
                </div>
            ) : (
                <>
                    {/* Podium — only if 3+ players */}
                    {top3.length >= 3 && (
                        <div className="grid grid-cols-3 gap-3 mb-6">
                            {[top3[1], top3[0], top3[2]].map((p, podiumIdx) => {
                                const actualRank = podiumIdx === 0 ? 1 : podiumIdx === 1 ? 0 : 2;
                                const rank = actualRank;
                                const isFirst = rank === 0;
                                return (
                                    <Link href={`/profile/${p.username}`} key={p.username}
                                        className="rounded-xl p-4 text-center flex flex-col items-center gap-2 transition-all hover:brightness-110"
                                        style={{
                                            background: isFirst ? 'linear-gradient(180deg,var(--accent-dim),var(--bg-surface))' : 'var(--bg-surface)',
                                            border: isFirst ? '1.5px solid var(--border-accent)' : '0.5px solid var(--border-strong)',
                                            paddingTop: isFirst ? '1.5rem' : '1rem',
                                        }}>
                                        {isFirst && <Crown size={18} className="text-accent" strokeWidth={1.5} />}
                                        <Avatar player={p} size={isFirst ? 52 : 44} />
                                        <div className="min-w-0 w-full">
                                            <div className="text-text-primary font-medium text-sm truncate">{p.display_name || p.username}</div>
                                            <div className="text-accent font-bold tabular-nums" style={{ fontSize: isFirst ? 22 : 18 }}>
                                                {Math.round(p[ratingField] ?? 1200)}
                                            </div>
                                            <div className="text-xs mt-0.5 font-semibold" style={{ color: MEDAL[rank] }}>
                                                #{rank + 1}
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}

                    {/* Table */}
                    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '0.5px solid var(--border)' }}>
                        <table className="w-full">
                            <thead>
                                <tr style={{ background: 'var(--bg-elevated)', borderBottom: '0.5px solid var(--border)' }}>
                                    {['#','Player','Rating','Games','Win Rate'].map(h => (
                                        <th key={h} className={`py-2.5 text-[11px] uppercase tracking-wider font-medium text-text-tertiary ${h==='#'?'px-5 w-12 text-left':h==='Player'?'px-3 text-left':'px-4 text-right'} ${['Games','Win Rate'].includes(h)?'hidden md:table-cell':''}`}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(top3.length >= 3 ? rest : players).map((p, i) => {
                                    const rank = top3.length >= 3 ? i + 3 : i;
                                    const gp = p.games_played ?? 0;
                                    const wr = gp > 0 ? Math.round(((p.wins ?? 0) / gp) * 100) : 0;
                                    const isLast = i === (top3.length >= 3 ? rest : players).length - 1;
                                    return (
                                        <tr key={p.username}
                                            className="transition-colors hover:bg-hover"
                                            style={{ borderBottom: isLast ? 'none' : '0.5px solid var(--border)', height: 60 }}>
                                            <td className="px-5">
                                                <span className="text-sm font-mono text-text-tertiary tabular-nums">{rank + 1}</span>
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <Avatar player={p} size={34} />
                                                    <div className="min-w-0">
                                                        <Link href={`/profile/${p.username}`}
                                                            className="text-text-primary text-sm font-medium hover:text-accent transition-colors truncate block max-w-[120px]">
                                                            {p.display_name || p.username}
                                                        </Link>
                                                        <div className="text-text-tertiary text-xs truncate">@{p.username}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 text-right">
                                                <div className="text-accent font-semibold tabular-nums">{Math.round(p[ratingField] ?? 1200)}</div>
                                                <div className="text-text-tertiary text-xs capitalize">{filter === 'all' ? 'rapid' : filter}</div>
                                            </td>
                                            <td className="px-4 text-right text-text-secondary text-sm tabular-nums hidden md:table-cell">{gp}</td>
                                            <td className="px-4 text-right hidden md:table-cell">
                                                <div className="text-text-secondary text-sm tabular-nums mb-1">{wr}%</div>
                                                <div className="h-1 rounded-full overflow-hidden w-16 ml-auto" style={{ background: 'var(--bg-elevated)' }}>
                                                    <div className="h-full rounded-full" style={{ width: `${wr}%`, background: 'var(--green)' }} />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Stats strip */}
                    <div className="grid grid-cols-3 gap-3 mt-5">
                        {[
                            { label: 'Total Players', value: players.length },
                            { label: 'Avg Rating', value: Math.round(players.reduce((a,p)=>a+(p[ratingField]??1200),0)/players.length||1200) },
                            { label: 'Online Now', value: '—' },
                        ].map(s => (
                            <div key={s.label} className="rounded-xl p-4 text-center"
                                style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)' }}>
                                <div className="text-accent text-2xl font-semibold tabular-nums">{s.value}</div>
                                <div className="text-text-tertiary text-xs mt-1">{s.label}</div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Commit**
```bash
git add frontend/app/leaderboard/page.tsx
git commit -m "style: leaderboard — podium for top 3, pill tabs, win-rate bars, skeleton loaders, stats strip"
```

---

## Task 7: Game Page Visual Improvements

**Files:**
- Modify: `frontend/app/game/[id]/page.tsx`

These are targeted changes only — the file is very large. Do not rewrite wholesale.

- [ ] **Step 1: Fix piece rendering (white pieces too dark on light squares)**

Find the `Piece` component (around line 18). Replace it:

```tsx
function Piece({ color, type }: { color: Color; type: string }) {
    const isWhite = color === 'w'
    return (
        <span className="select-none pointer-events-none" style={{
            fontSize: 'clamp(22px, 5.5vw, 46px)',
            lineHeight: 1,
            fontFamily: 'serif',
            color: isWhite ? '#FFFFFF' : '#1A1A1A',
            textShadow: isWhite
                ? '0 1px 3px rgba(0,0,0,0.7), 0 0 1px rgba(0,0,0,0.5)'
                : '0 1px 0 rgba(255,255,255,0.2)',
            filter: isWhite
                ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))'
                : 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))',
        }}>
            {GLYPHS[`${color}${type.toUpperCase()}`]}
        </span>
    )
}
```

- [ ] **Step 2: Fix PlayerStrip — add clock-critical animation and accent clock styling**

Replace the `PlayerStrip` component:

```tsx
function PlayerStrip({
    player, time, isActive, isBottom, ratingChange, isMe
}: {
    player: any; time: number; isActive: boolean; isBottom: boolean; ratingChange: number | null; isMe?: boolean
}) {
    const rating = Math.round(player?.rating_rapid ?? 1200)
    const username = player?.username
    const isCritical = time < 30 && isActive
    return (
        <div className={`flex justify-between items-center px-4 transition-colors ${isBottom ? 'rounded-b-xl border-t-0' : 'rounded-t-xl'}`}
            style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)', height: 52 }}>
            <div className="flex items-center gap-3">
                {username ? (
                    <Link href={`/profile/${username}`}
                        className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden shrink-0"
                        style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}>
                        {player?.avatar_url
                            ? <img src={player.avatar_url} alt="" className="w-full h-full object-cover" />
                            : <span className="text-accent font-semibold text-sm">{username[0].toUpperCase()}</span>}
                    </Link>
                ) : (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: 'var(--bg-surface)', border: '0.5px solid var(--border)' }}>
                        <span className="text-text-tertiary text-sm">?</span>
                    </div>
                )}
                <div>
                    <div className="text-text-primary font-medium text-sm leading-none flex items-center gap-1.5">
                        {username
                            ? <Link href={`/profile/${username}`} className="hover:text-accent transition-colors">{player?.display_name || username}</Link>
                            : <span className="text-text-tertiary">Waiting…</span>}
                        {isMe && <span className="text-[10px] text-text-tertiary bg-elevated px-1.5 py-0.5 rounded" style={{ border:'0.5px solid var(--border)' }}>You</span>}
                    </div>
                    <div className="text-text-tertiary text-xs mt-0.5 flex items-center gap-1 tabular-nums">
                        {rating}
                        {ratingChange !== null && (
                            <span className={ratingChange >= 0 ? 'text-green-400' : 'text-red-400'} style={{ fontSize: 11 }}>
                                {ratingChange >= 0 ? '+' : ''}{ratingChange}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Clock */}
            <div className={`px-4 py-2 rounded-lg font-mono text-xl tabular-nums transition-all ${isCritical ? 'clock-critical' : ''}`}
                style={{
                    background: isCritical ? 'rgba(192,57,43,0.15)' :
                                isMe && isActive ? 'var(--accent-dim)' :
                                isActive ? 'var(--bg-active)' : 'var(--bg-surface)',
                    border: isCritical ? '0.5px solid rgba(192,57,43,0.4)' :
                            isMe && isActive ? '1.5px solid var(--accent)' :
                            isActive ? '0.5px solid var(--border-accent)' : '0.5px solid var(--border)',
                    color: isCritical ? '#E74C3C' :
                           isMe && isActive ? 'var(--accent)' :
                           isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}>
                {fmtTime(time)}
            </div>
        </div>
    )
}
```

Update all `<PlayerStrip ... />` calls to pass `isMe={isBottom}` (bottom strip is always the local player).

- [ ] **Step 3: Improve game-over modal (already positioned correctly)**

Find the game-over modal inside the board column (added in previous session). Update the card to show result icon:

Replace the modal header section:
```tsx
<div className="relative px-6 pt-6 pb-4 text-center border-b border-border/60">
    <button onClick={() => setShowGameOverModal(false)}
        className="absolute top-3.5 right-3.5 w-7 h-7 flex items-center justify-center text-text-tertiary hover:text-text-primary rounded-lg transition-colors"
        style={{ background: 'var(--bg-hover)' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
    {/* Result icon */}
    {(() => {
        const isWin = myColor !== 'spectator' && gameOver.result.toLowerCase().startsWith(myColor);
        const isDraw = gameOver.result.toLowerCase().includes('draw');
        const isLoss = myColor !== 'spectator' && !isWin && !isDraw;
        return (
            <div className="flex flex-col items-center gap-2 mb-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: isWin ? 'var(--accent-dim)' : isDraw ? 'var(--bg-surface)' : 'rgba(192,57,43,0.1)' }}>
                    {isWin && <Crown size={24} className="text-accent" strokeWidth={1.5} />}
                    {isDraw && <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5"><path d="M5 12h14"/><path d="M5 8h14"/><path d="M5 16h14"/></svg>}
                    {isLoss && <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E74C3C" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>}
                    {myColor === 'spectator' && <Trophy size={24} className="text-accent" strokeWidth={1.5} />}
                </div>
                <div className="text-xl font-bold text-text-primary tracking-tight">
                    {myColor !== 'spectator' ? (isWin ? 'You Win!' : isDraw ? 'Draw' : 'You Lost') : gameOver.result}
                </div>
            </div>
        );
    })()}
    <div className="text-text-secondary text-sm">by {gameOver.reason}</div>
    {myColor !== 'spectator' && (() => {
        const change = myColor === 'white' ? whiteRatingChange : blackRatingChange
        if (change === null) return null
        const positive = change >= 0
        return (
            <div className={`mt-2 text-base font-semibold tabular-nums ${positive ? 'text-green-400' : 'text-red-400'}`}>
                Rating {positive ? '+' : ''}{change}
            </div>
        )
    })()}
</div>
```

Add `Crown` to lucide-react imports.

- [ ] **Step 4: Style the eval bar more visually**

Find the eval bar div (the hidden lg:flex div). Replace:
```tsx
{/* Eval bar */}
<div className="hidden lg:flex w-5 flex-col rounded-lg overflow-hidden relative" style={{ height: 'min(80vh, 800px)', background: 'var(--bg-elevated)', border: '0.5px solid var(--border)' }}>
    <div className="absolute top-1.5 w-full text-center z-10" style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>W</div>
    <div className="absolute bottom-1.5 w-full text-center z-10" style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>B</div>
    {/* White fill from bottom */}
    <div className="absolute bottom-0 w-full transition-all duration-500" style={{ height: `${evalPct}%`, background: '#E8DDD0' }} />
    <div className="absolute top-0 w-full transition-all duration-500" style={{ height: `${100 - evalPct}%`, background: '#2C2C2C' }} />
</div>
```

- [ ] **Step 5: Commit**
```bash
git add frontend/app/game/\[id\]/page.tsx
git commit -m "style: game page — bright white pieces, accent clock, critical-time pulse, result icon in modal, styled eval bar"
```

---

## Task 8: Analysis Page Redesign

**Files:**
- Modify: `frontend/app/analysis/page.tsx`

- [ ] **Step 1: Rewrite `frontend/app/analysis/page.tsx` keeping all state/logic**

Keep all state variables, useEffects, and handler functions identical. Replace only the return JSX. The key improvements: full-viewport layout, visible coordinate labels, fixed piece colors, import tab with FEN/PGN areas, engine lines styling.

The complete new return JSX (keep all existing logic above it unchanged):

```tsx
  // Piece rendering helper (same fix as game page)
  function renderPiece(piece: any) {
    if (!piece) return null;
    const GLYPHS: Record<string, string> = {
      wK:'♔',wQ:'♕',wR:'♖',wB:'♗',wN:'♘',wP:'♙',
      bK:'♚',bQ:'♛',bR:'♜',bB:'♝',bN:'♞',bP:'♟',
    };
    const key = `${piece.color}${piece.type.toUpperCase()}`;
    const isW = piece.color === 'w';
    return (
      <span className="select-none pointer-events-none" style={{
        fontSize: 'clamp(18px,4.8vw,42px)', lineHeight: 1, fontFamily: 'serif',
        color: isW ? '#FFFFFF' : '#1A1A1A',
        textShadow: isW ? '0 1px 3px rgba(0,0,0,0.7),0 0 1px rgba(0,0,0,0.5)' : '0 1px 0 rgba(255,255,255,0.2)',
        filter: isW ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' : 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))',
      }}>{GLYPHS[key]}</span>
    );
  }

  if (!game) return <div className="flex justify-center p-20"><div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin"/></div>;

  const board = game.board();
  const ranks = isFlipped ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
  const files = isFlipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];

  return (
    <div className="flex h-[calc(100vh-53px)] overflow-hidden page-enter">

      {/* Eval bar */}
      <div className="w-5 shrink-0 m-3 rounded-lg overflow-hidden relative hidden lg:block"
        style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)' }}>
        <div className="absolute top-1.5 w-full text-center z-10 text-[9px] font-mono" style={{ color:'var(--text-tertiary)' }}>W</div>
        <div className="absolute bottom-1.5 w-full text-center z-10 text-[9px] font-mono" style={{ color:'var(--text-tertiary)' }}>B</div>
        {engineData ? (
          <>
            <div className="absolute top-0 w-full transition-all duration-500" style={{ height:`${50 - Math.max(-50,Math.min(50,(engineData.score??0)*10))}%`, background:'#2C2C2C' }} />
            <div className="absolute bottom-0 w-full transition-all duration-500" style={{ height:`${50 + Math.max(-50,Math.min(50,(engineData.score??0)*10))}%`, background:'#E8DDD0' }} />
          </>
        ) : (
          <>
            <div className="absolute top-0 h-1/2 w-full" style={{ background:'#2C2C2C' }} />
            <div className="absolute bottom-0 h-1/2 w-full" style={{ background:'#E8DDD0' }} />
          </>
        )}
        {engineData?.score != null && (
          <div className="absolute left-1/2 -translate-x-1/2 z-20 text-[9px] font-mono tabular-nums"
            style={{ top: engineData.score > 0 ? '6px' : 'auto', bottom: engineData.score <= 0 ? '6px' : 'auto', color: Math.abs(engineData.score) > 1 ? (engineData.score > 0 ? '#E8DDD0' : '#2C2C2C') : 'var(--text-tertiary)' }}>
            {engineData.score > 0 ? '+' : ''}{engineData.score.toFixed(1)}
          </div>
        )}
      </div>

      {/* Board column */}
      <div className="flex flex-col justify-center flex-1 min-w-0 py-3 px-2">
        {/* Board */}
        <div className="relative mx-auto" style={{ width: 'min(calc(100vh - 180px), calc(100vw - 400px), 600px)', aspectRatio: '1' }}>
          <div className="board-outer-frame w-full h-full p-[3px]">
            <div className="board-inner-frame w-full h-full grid grid-cols-8 grid-rows-8">
              {ranks.map(rank => files.map(file => {
                const sq = `${String.fromCharCode(97+file)}${rank+1}`;
                const piece = board[7-rank][file];
                const isLight = (file+rank)%2===1;
                const isSelected = selectedSquare === sq;
                const isTarget = legalTargets.includes(sq);
                const isLastFrom = moveHistory[currentMoveIndex]?.from === sq;
                const isLastTo = moveHistory[currentMoveIndex]?.to === sq;
                let bg = isLight ? '#F0D9B5' : '#B58863';
                if (isSelected) bg = 'rgba(246,246,105,0.55)';
                else if (isLastFrom || isLastTo) bg = isLight ? 'rgba(196,150,90,0.5)' : 'rgba(196,150,90,0.4)';
                return (
                  <div key={sq} onClick={() => handleSquareClick(sq)}
                    className="relative flex items-center justify-center cursor-pointer"
                    style={{ background: bg }}>
                    {file === (isFlipped ? 7 : 0) && (
                      <span className="absolute top-0.5 left-0.5 text-[9px] font-medium pointer-events-none z-10 select-none"
                        style={{ color: isLight ? '#B58863' : '#F0D9B5', opacity: 0.75 }}>{rank+1}</span>
                    )}
                    {rank === (isFlipped ? 7 : 0) && (
                      <span className="absolute bottom-0.5 right-0.5 text-[9px] font-medium pointer-events-none z-10 select-none"
                        style={{ color: isLight ? '#B58863' : '#F0D9B5', opacity: 0.75 }}>{String.fromCharCode(97+file)}</span>
                    )}
                    {isTarget && !piece && <div className="w-[28%] h-[28%] rounded-full pointer-events-none" style={{ background:'rgba(0,0,0,0.2)' }} />}
                    {isTarget && piece && <div className="absolute inset-0 rounded-sm pointer-events-none" style={{ boxShadow:'inset 0 0 0 4px rgba(0,0,0,0.25)' }} />}
                    {piece && renderPiece(piece)}
                  </div>
                );
              }))}
            </div>
          </div>
        </div>

        {/* Navigation controls */}
        <div className="flex items-center justify-center gap-1 mt-3">
          <div className="flex items-center gap-0.5 rounded-xl p-1" style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border)' }}>
            {[
              { icon: '|←', action: () => navigateToMove(-1), title: 'First move' },
              { icon: '←',  action: () => navigateToMove(Math.max(-1, currentMoveIndex - 1)), title: 'Previous (←)' },
              { icon: '→',  action: () => navigateToMove(Math.min(moveHistory.length - 1, currentMoveIndex + 1)), title: 'Next (→)' },
              { icon: '→|', action: () => navigateToMove(moveHistory.length - 1), title: 'Last move' },
            ].map(b => (
              <button key={b.icon} onClick={b.action} title={b.title}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-hover transition-colors text-sm font-mono btn-press">
                {b.icon}
              </button>
            ))}
          </div>
          {moveHistory.length > 0 && (
            <span className="text-text-tertiary text-xs tabular-nums ml-2">
              Move {currentMoveIndex + 1} / {moveHistory.length}
            </span>
          )}
          <button onClick={() => setIsFlipped(v => !v)} title="Flip board"
            className="ml-2 w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary hover:text-text-primary hover:bg-hover transition-colors btn-press"
            style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border)' }}>
            <FlipHorizontal2 size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Right panel */}
      <div className="w-72 shrink-0 flex flex-col m-3 rounded-xl overflow-hidden" style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border)' }}>
        {/* Tab bar */}
        <div className="flex shrink-0" style={{ background:'var(--bg-elevated)', borderBottom:'0.5px solid var(--border)' }}>
          {(['analysis','import'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="flex-1 h-10 text-sm capitalize transition-colors"
              style={{
                color: activeTab===tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderBottom: activeTab===tab ? '2px solid var(--accent)' : '2px solid transparent',
              }}>
              {tab === 'analysis' ? 'Analysis' : 'Import'}
            </button>
          ))}
        </div>

        {/* Analysis tab */}
        {activeTab === 'analysis' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Engine toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart2 size={15} className="text-accent" strokeWidth={1.5} />
                <span className="text-sm font-medium text-text-primary">Stockfish 16</span>
                {engineEnabled && <span className="text-[10px] px-1.5 py-0.5 rounded font-mono text-text-tertiary" style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border)' }}>d18</span>}
              </div>
              <button onClick={() => setEngineEnabled(v => !v)}
                className="w-9 h-5 rounded-full transition-colors relative"
                style={{ background: engineEnabled ? 'var(--accent)' : 'var(--bg-elevated)', border:'0.5px solid var(--border-strong)' }}>
                <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                  style={{ left: engineEnabled ? 'calc(100% - 18px)' : '2px' }} />
              </button>
            </div>

            {/* Engine lines */}
            {engineData && engineEnabled ? (
              <div className="space-y-2">
                {[engineData].map((line: any, i: number) => {
                  const score = line.score ?? 0;
                  const isPos = score > 0.2;
                  const isNeg = score < -0.2;
                  const lineColor = isPos ? 'var(--green)' : isNeg ? 'var(--red)' : 'var(--text-tertiary)';
                  return (
                    <div key={i} className="rounded-xl p-3" style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border)', borderLeft:`2px solid ${lineColor}` }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-bold tabular-nums" style={{ color: lineColor }}>
                          {score > 0 ? '+' : ''}{score?.toFixed(1) ?? '0.0'}
                        </span>
                        <span className="text-sm font-medium text-text-primary">{line.best_move}</span>
                      </div>
                      {line.pv && (
                        <div className="flex flex-wrap gap-1">
                          {line.pv.split(' ').slice(0, 8).map((m: string, mi: number) => (
                            <span key={mi} className="text-[11px] px-1.5 py-0.5 rounded text-text-secondary"
                              style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border)' }}>{m}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : engineEnabled ? (
              <div className="flex items-center gap-2 text-text-tertiary text-sm">
                <div className="w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin" />
                Analyzing…
              </div>
            ) : (
              <div className="text-center py-8 text-text-tertiary text-sm">
                <BarChart2 size={32} className="mx-auto mb-2 opacity-20" strokeWidth={1} />
                Enable engine to analyze this position
              </div>
            )}

            {/* FEN display */}
            {game && (
              <div className="mt-4">
                <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1.5">FEN</div>
                <div className="rounded-lg p-2.5 font-mono text-[10px] text-text-tertiary break-all leading-relaxed"
                  style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border)' }}>
                  {game.fen()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Import tab */}
        {activeTab === 'import' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Quick positions */}
            <div>
              <div className="text-xs text-text-tertiary uppercase tracking-wider mb-2">Quick Positions</div>
              <div className="flex flex-col gap-1.5">
                {[
                  { label: 'Starting Position', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
                  { label: "King's Gambit", fen: 'rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq f3 0 2' },
                  { label: 'Sicilian Defense', fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2' },
                ].map(pos => (
                  <button key={pos.label}
                    onClick={() => { try { const g = new Chess(); g.load(pos.fen); setGame(g); setMoveHistory([]); setCurrentMoveIndex(-1); } catch {} }}
                    className="text-left px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-hover transition-colors"
                    style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border)' }}>
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            {/* FEN input */}
            <div>
              <label className="text-xs text-text-tertiary uppercase tracking-wider mb-1.5 block">Position (FEN)</label>
              <textarea value={customFen} onChange={e => setCustomFen(e.target.value)}
                rows={3} placeholder="Paste FEN string…"
                className="w-full rounded-lg px-3 py-2 font-mono text-xs text-text-primary resize-none focus:outline-none transition-colors"
                style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border)' }}
                onFocus={e=>e.target.style.borderColor='var(--border-accent)'}
                onBlur={e=>e.target.style.borderColor='var(--border)'} />
              <button
                onClick={() => { try { const g = new Chess(); g.load(customFen.trim()); setGame(g); setMoveHistory([]); setCurrentMoveIndex(-1); setCustomFen(''); } catch { alert('Invalid FEN'); } }}
                className="w-full mt-2 py-2 rounded-lg text-sm font-medium text-[#0F0D0B] btn-press"
                style={{ background:'var(--accent)' }}>
                Load Position
              </button>
            </div>

            {/* PGN input */}
            <div>
              <label className="text-xs text-text-tertiary uppercase tracking-wider mb-1.5 block">Game (PGN)</label>
              <textarea value={customPgn} onChange={e => setCustomPgn(e.target.value)}
                rows={6} placeholder="Paste PGN…"
                className="w-full rounded-lg px-3 py-2 text-xs text-text-primary resize-none focus:outline-none transition-colors font-mono"
                style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border)' }}
                onFocus={e=>e.target.style.borderColor='var(--border-accent)'}
                onBlur={e=>e.target.style.borderColor='var(--border)'} />
              <button
                onClick={() => { try { const g = new Chess(); g.loadPgn(customPgn.trim()); const hist = g.history({ verbose:true }); setMoveHistory(hist); setGame(new Chess()); setCurrentMoveIndex(-1); setCustomPgn(''); } catch { alert('Invalid PGN'); } }}
                className="w-full mt-2 py-2 rounded-lg text-sm font-medium text-text-primary btn-press transition-colors"
                style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border-strong)' }}>
                Import Game
              </button>
              <button onClick={() => { setGame(new Chess()); setMoveHistory([]); setCurrentMoveIndex(-1); setCustomFen(''); setCustomPgn(''); }}
                className="w-full mt-1.5 py-2 text-sm text-text-tertiary hover:text-text-secondary transition-colors">
                Reset Board
              </button>
            </div>
          </div>
        )}

        {/* Move list at bottom of analysis tab */}
        {activeTab === 'analysis' && moveHistory.length > 0 && (
          <div className="shrink-0 border-t border-border" style={{ maxHeight: 200 }}>
            <div className="overflow-y-auto p-2">
              {Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, i) => {
                const wi = i * 2, bi = i * 2 + 1;
                return (
                  <div key={i} className="grid grid-cols-[24px_1fr_1fr] text-sm rounded hover:bg-hover transition-colors">
                    <span className="text-text-tertiary text-xs py-1 pl-1 tabular-nums">{i+1}.</span>
                    {[wi,bi].map(mi => moveHistory[mi] && (
                      <button key={mi} onClick={() => navigateToMove(mi)}
                        className={`text-left font-mono text-xs px-1 py-1 rounded transition-colors ${currentMoveIndex===mi ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}
                        style={{ background: currentMoveIndex===mi ? 'var(--accent-dim)' : 'transparent' }}>
                        {moveHistory[mi].san}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
```

Note: ensure `Chess` is imported from `chess.js` (already is), and the component uses `const [game, setGame]` as state (already does via `useState<Chess | null>`). The `renderPiece` function is defined inside the component body.

- [ ] **Step 2: Commit**
```bash
git add frontend/app/analysis/page.tsx
git commit -m "style: analysis — full-viewport layout, fixed piece colors, engine lines, FEN/PGN import tab"
```

---

## Task 9: Profile Page Polish

**Files:**
- Modify: `frontend/app/profile/[username]/page.tsx`

- [ ] **Step 1: Add banner to profile header**

Find the profile header section (the div containing the avatar and username). Add a banner above it:

```tsx
{/* Banner */}
<div className="h-28 w-full relative overflow-hidden rounded-t-xl"
    style={{ background: 'linear-gradient(135deg, #1A1714 0%, #2A1D10 50%, #1A1714 100%)' }}>
    {/* Subtle chess pattern overlay */}
    <svg className="absolute inset-0 w-full h-full opacity-5" style={{ color:'var(--accent)' }}>
        <defs>
            <pattern id="chess" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                <rect x="0" y="0" width="16" height="16" fill="currentColor" />
                <rect x="16" y="16" width="16" height="16" fill="currentColor" />
            </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#chess)" />
    </svg>
</div>
```

- [ ] **Step 2: Replace filter tabs with pill style (Overview | Games | Stats | Friends)**

Find the tabs container. Replace with pill-style matching the leaderboard:
```tsx
<div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-elevated)' }}>
    {TABS.map(tab => (
        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className="px-4 py-1.5 rounded-lg text-sm transition-colors"
            style={{
                background: activeTab === tab.id ? 'var(--bg-active)' : 'transparent',
                border: activeTab === tab.id ? '0.5px solid var(--border-strong)' : '0.5px solid transparent',
                color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab.id ? 500 : 400,
            }}>
            {tab.label}
        </button>
    ))}
</div>
```

- [ ] **Step 3: Replace rating cards with improved design including peak line**

Find the rating cards section in the Overview tab. Replace each card with:
```tsx
<div key={tc.id} className="rounded-xl p-4" style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border)' }}>
    <div className="flex items-center gap-1.5 text-text-tertiary text-xs uppercase tracking-wider mb-3">
        <span className="text-accent">{RATING_ICONS[tc.id]}</span>
        {tc.label}
    </div>
    <div className="text-[30px] font-semibold text-text-primary leading-none tabular-nums">
        {tc.rating ? Math.round(tc.rating) : '—'}
    </div>
    <div className="text-xs text-text-tertiary mt-2">Peak {tc.rating ? Math.round(tc.rating) : '—'}</div>
</div>
```

- [ ] **Step 4: Improve game history table rows**

Find the game history table in the Games tab. Update each row to show a colored result circle:
```tsx
{/* Result cell — replace existing result pill with colored circle + text */}
<td className="px-3 py-3 text-center hidden sm:table-cell">
    <div className="flex items-center justify-center gap-1.5">
        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: isWin ? 'rgba(79,168,90,0.2)' : isDraw ? 'rgba(94,83,76,0.2)' : 'rgba(192,57,43,0.2)', color: isWin ? 'var(--green)' : isDraw ? 'var(--text-secondary)' : 'var(--red)' }}>
            {isDraw ? 'D' : isWin ? 'W' : 'L'}
        </div>
        <span className="text-xs" style={{ color: isWin ? 'var(--green)' : isDraw ? 'var(--text-secondary)' : 'var(--red)' }}>
            {resultText}
        </span>
    </div>
</td>
```

- [ ] **Step 5: Commit**
```bash
git add frontend/app/profile/\[username\]/page.tsx
git commit -m "style: profile — banner header, pill tabs, improved rating cards, result circles in game table"
```

---

## Task 10: TypeScript Verification + Final Commit

**Files:** All modified files

- [ ] **Step 1: Run TypeScript check**
```bash
cd "/Users/chidanandh/Desktop/Python folders/Chess/Chess/Gambit/frontend" && npx tsc --noEmit 2>&1
```
Expected: No errors.

- [ ] **Step 2: Fix any TypeScript errors**

Common issues to watch for:
- `Crown` not imported from lucide-react in game page → add to import
- `Chess` not imported in lobby page (not needed — just ensure no type errors)
- `setGame` in analysis takes `Chess | null` — ensure `new Chess()` is always passed, not `null`
- `renderPiece` defined inside component — TypeScript fine with this

- [ ] **Step 3: Final verification commit**
```bash
git add -A
git commit -m "style: visual redesign complete — all pages, TypeScript clean"
```

---

## Verification Checklist

After all tasks complete, check each item manually in the browser:

```
[ ] Navbar: 52px height, accent left-border on logo, online pill, gradient line below
[ ] Navbar: auth skeleton shows (not "Log In") while loading
[ ] Landing: animated board plays King's Gambit moves and loops
[ ] Landing: gradient headline (gold-tinted), feature cards lift on hover
[ ] Lobby: welcome bar with username and blitz rating
[ ] Lobby: TC cards show subtitle, Popular badge on blitz, lift on hover
[ ] Lobby: selected card has gold border and accent-dim background
[ ] Leaderboard: podium shows when 3+ players exist
[ ] Leaderboard: pill-style filter tabs
[ ] Leaderboard: win rate bars visible on desktop
[ ] Leaderboard: skeleton loaders while loading
[ ] Leaderboard: stats strip below table
[ ] Game: white pieces are bright white (not gray) on dark squares
[ ] Game: clock turns gold accent when it's your turn
[ ] Game: critical clock pulses red when < 30 seconds
[ ] Game: game-over modal shows result icon (Crown/X/equals)
[ ] Game: eval bar has white/black fill not plain white
[ ] Analysis: board fills most of viewport height
[ ] Analysis: pieces clearly visible (white = bright, black = dark)
[ ] Analysis: import tab has FEN area, PGN area, quick positions
[ ] Analysis: engine lines show with colored left border
[ ] Analysis: coordinate labels visible on all squares
[ ] Profile: banner background above avatar
[ ] Profile: pill-style tabs
[ ] Profile: rating cards show peak value
[ ] All buttons: scale(0.97) on click (btn-press class)
[ ] All skeleton loaders: shimmer animation
[ ] Toast: appears bottom-right, auto-dismisses after 4s
[ ] Scrollbars: thin (4px) on all scrollable areas
[ ] Mobile: lobby 375px width looks clean (single column)
[ ] No console errors
[ ] tsc --noEmit passes clean
```
