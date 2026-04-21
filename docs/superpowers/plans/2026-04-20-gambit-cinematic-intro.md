# Gambit Cinematic Intro Animation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-viewport 20-second cinematic knight intro animation (first visit only) and a persistent ambient background canvas for the landing and lobby pages.

**Architecture:** Two React components using the Canvas API with `requestAnimationFrame` loops. `KnightIntro.tsx` renders a 10-phase particle animation that ends by erasing the canvas (revealing the real page underneath via `destination-out` compositing). `KnightBackground.tsx` runs as an ambient z-index -1 canvas with a landing mode (knight watermark + orbitals) and a lobby mode (roaming knight silhouettes). Both components are lazy-imported into `page.tsx` and `lobby/page.tsx`.

**Tech Stack:** React 18, TypeScript, Canvas API (2D context, Path2D, `devicePixelRatio`, `globalCompositeOperation`), `requestAnimationFrame`, `performance.now()`, localStorage (first-visit gate), CSS custom properties, lucide-react

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| CREATE | `frontend/components/ui/KnightIntro.tsx` | Full-viewport cinematic intro with 10-phase animation, particle system, orbital system, shockwave reveal |
| CREATE | `frontend/components/ui/KnightBackground.tsx` | Ambient z-index -1 canvas with landing/lobby modes |
| MODIFY | `frontend/app/page.tsx` | Lazy-import KnightIntro + KnightBackground, add introComplete gate |
| MODIFY | `frontend/app/lobby/page.tsx` | Lazy-import KnightBackground in lobby mode |
| MODIFY | `frontend/app/globals.css` | Add `shudder` keyframe + `.shudder`, `#page-container` CSS, `.page-reveal` |

---

## Shared Constants (reference for all tasks)

```ts
// Timing (seconds from animation start)
const PHASE = {
  DRIFT_END:      2.0,   // particles drift in space
  ATTRACT_END:    5.5,   // particles spiral into formation
  LOCK_END:       6.5,   // particles snap to exact positions
  SOLIDIFY_END:   8.5,   // sweep solidification fills knight
  OUTLINE_END:   11.0,   // perimeter tracer runs
  TITLE_END:     14.0,   // title + buttons fade in
  ACCEL_END:     16.0,   // tracer accelerates to blur
  FLASH_END:     17.0,   // white flash
  SHOCKWAVE_END: 19.5,   // shockwave ring expands
  SETTLE_END:    20.0,   // page settles
} as const;

// Particle counts
const FORMATION_COUNT = 400;
const AMBIENT_COUNT   = 50;
const ORBITAL_COUNT   = 3;

// Colors
const ACCENT = '#C4965A';
const ACCENT_RGB = { r: 196, g: 150, b: 90 };
```

---

## Task 1: Project Scaffolding + CSS Additions

**Files:**
- Modify: `frontend/app/globals.css`
- Create: `frontend/components/ui/` (directory, via file creation)

- [ ] **Step 1: Add shudder keyframe and utility classes to globals.css**

Open `frontend/app/globals.css`. After the `@keyframes clockPulse { ... }` block, add:

```css
@keyframes shudder {
  0%,100% { transform: translate(0,0) rotate(0deg); }
  20%      { transform: translate(-3px, 2px) rotate(-0.5deg); }
  40%      { transform: translate(3px, -2px) rotate(0.5deg); }
  60%      { transform: translate(-2px, 3px) rotate(-0.3deg); }
  80%      { transform: translate(2px, -1px) rotate(0.3deg); }
}

.shudder {
  animation: shudder 0.35s ease-in-out;
}

#page-container {
  opacity: 0;
  transition: opacity 0.6s ease;
}

#page-container.page-reveal {
  opacity: 1;
}
```

- [ ] **Step 2: Verify globals.css compiles (run dev server briefly)**

```bash
cd /Users/chidanandh/Desktop/Python\ folders/Chess/Chess/Gambit/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors about globals.css (CSS isn't type-checked by tsc, so clean output means no import issues).

- [ ] **Step 3: Commit**

```bash
git add frontend/app/globals.css
git commit -m "chore: add shudder keyframe, page-container reveal classes for cinematic intro"
```

---

## Task 2: Knight SVG Path + Pixel Sampler Utility

**Files:**
- Create: `frontend/components/ui/KnightIntro.tsx` (initial file with knight path + sampler only)

The knight silhouette is drawn via a `Path2D` from an SVG path string, then an offscreen canvas samples it to extract ~400 formation particle positions.

- [ ] **Step 1: Create KnightIntro.tsx with path and sampler**

Create `frontend/components/ui/KnightIntro.tsx` with this content:

```tsx
"use client";

import { useEffect, useRef, useCallback } from 'react';

// ── Knight SVG path (scaled to ~300×300 viewBox) ──────────────────────────
// Simplified chess knight silhouette outline
const KNIGHT_PATH_D = `
  M 150 270
  C 130 265 110 255 100 240
  C 90 225 95 210 105 200
  C 115 190 120 180 115 165
  C 110 150 100 140 95 125
  C 88 105 90 85 100 70
  C 110 55 125 45 140 40
  C 150 36 155 38 158 42
  C 162 36 170 30 178 28
  C 188 26 195 30 198 38
  C 205 35 212 36 215 42
  C 220 38 228 40 230 48
  C 235 45 240 50 238 58
  C 242 60 244 68 240 75
  C 248 80 250 90 245 100
  C 252 108 252 120 245 130
  C 238 140 225 145 215 148
  C 220 158 222 170 218 182
  C 225 188 228 200 224 212
  C 230 220 230 235 222 245
  C 212 258 195 268 175 272
  Z
  M 130 100
  C 125 95 128 88 135 90
  C 140 92 138 100 130 100
  Z
`;

// ── Offscreen sampler: returns N points inside the knight silhouette ──────
export function sampleKnightPoints(
  count: number,
  destW: number,
  destH: number
): { x: number; y: number }[] {
  // Render path on a small offscreen canvas
  const SIZE = 300;
  const off = document.createElement('canvas');
  off.width = SIZE; off.height = SIZE;
  const ctx = off.getContext('2d')!;
  const p = new Path2D(KNIGHT_PATH_D);
  ctx.fillStyle = '#fff';
  ctx.fill(p);

  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const filled: { x: number; y: number }[] = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (img.data[(y * SIZE + x) * 4 + 3] > 128) {
        filled.push({ x, y });
      }
    }
  }

  // Subsample down to `count`
  const step = Math.max(1, Math.floor(filled.length / count));
  const sampled = filled.filter((_, i) => i % step === 0).slice(0, count);

  // Scale from 300×300 to canvas dimensions, centered
  const scale = Math.min(destW, destH) * 0.55 / SIZE;
  const ox = (destW - SIZE * scale) / 2;
  const oy = (destH - SIZE * scale) / 2;

  return sampled.map(p => ({
    x: p.x * scale + ox,
    y: p.y * scale + oy,
  }));
}

export default function KnightIntro({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Placeholder — full implementation in Task 4
    const timer = setTimeout(onComplete, 500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#0F0D0B' }}
    />
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/chidanandh/Desktop/Python\ folders/Chess/Chess/Gambit/frontend && npx tsc --noEmit 2>&1
```

Expected: Clean (no errors).

- [ ] **Step 3: Commit**

```bash
git add frontend/components/ui/KnightIntro.tsx
git commit -m "feat: add KnightIntro scaffold with knight path2D and pixel sampler"
```

---

## Task 3: Particle System Data Structures + Initialization

**Files:**
- Modify: `frontend/components/ui/KnightIntro.tsx`

- [ ] **Step 1: Add particle type definitions and factory at the top of KnightIntro.tsx**

After the `KNIGHT_PATH_D` constant, add:

```ts
// ── Timing constants ──────────────────────────────────────────────────────
const PHASE = {
  DRIFT_END:      2.0,
  ATTRACT_END:    5.5,
  LOCK_END:       6.5,
  SOLIDIFY_END:   8.5,
  OUTLINE_END:   11.0,
  TITLE_END:     14.0,
  ACCEL_END:     16.0,
  FLASH_END:     17.0,
  SHOCKWAVE_END: 19.5,
  SETTLE_END:    20.0,
} as const;

const ACCENT_R = 196, ACCENT_G = 150, ACCENT_B = 90;
const FORMATION_COUNT = 400;
const AMBIENT_COUNT   = 50;

// ── Particle types ────────────────────────────────────────────────────────
interface FormationParticle {
  // Current position
  x: number; y: number;
  // Drift start position (before attract)
  sx: number; sy: number;
  // Target (formation) position
  tx: number; ty: number;
  // Velocity (used during drift)
  vx: number; vy: number;
  // Visual
  radius: number;
  alpha: number;
  // Stagger delay for attraction phase (0–1.5s offset)
  delay: number;
  // Breathing phase offset
  breathPhase: number;
}

interface AmbientParticle {
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  alpha: number;
  maxAlpha: number;
}

interface OrbitalParticle {
  angle: number;        // current angle on ellipse
  speed: number;        // rad/sec
  a: number; b: number; // semi-major, semi-minor axes (canvas px)
  tilt: number;         // rotation of the ellipse plane (radians)
  radius: number;
  trailLength: number;
}

// ── Factory functions ─────────────────────────────────────────────────────
function makeFormationParticle(
  tx: number, ty: number,
  cw: number, ch: number
): FormationParticle {
  const angle = Math.random() * Math.PI * 2;
  const dist  = 200 + Math.random() * 400;
  return {
    x: cw / 2 + Math.cos(angle) * dist,
    y: ch / 2 + Math.sin(angle) * dist,
    sx: 0, sy: 0, // will be set from initial x,y after first position
    tx, ty,
    vx: (Math.random() - 0.5) * 0.5,
    vy: (Math.random() - 0.5) * 0.5,
    radius: 1 + Math.random() * 1.5,
    alpha: 0.3 + Math.random() * 0.4,
    delay: Math.random() * 1.5,
    breathPhase: Math.random() * Math.PI * 2,
  };
}

function makeAmbientParticle(cw: number, ch: number): AmbientParticle {
  const maxAlpha = 0.05 + Math.random() * 0.15;
  return {
    x: Math.random() * cw,
    y: Math.random() * ch,
    vx: (Math.random() - 0.5) * 0.15,
    vy: (Math.random() - 0.5) * 0.15,
    radius: 0.5 + Math.random() * 1.5,
    alpha: 0,
    maxAlpha,
  };
}

function makeOrbital(index: number, cw: number, ch: number): OrbitalParticle {
  const base = Math.min(cw, ch) * 0.35;
  return {
    angle: (index / ORBITAL_COUNT) * Math.PI * 2,
    speed: 0.4 + index * 0.15,
    a: base * (0.9 + index * 0.15),
    b: base * (0.45 + index * 0.08),
    tilt: (index * Math.PI) / 3,
    radius: 2 + index * 0.5,
    trailLength: 18 + index * 6,
  };
}
const ORBITAL_COUNT = 3;
```

- [ ] **Step 2: Replace useEffect in KnightIntro with real initialization**

Replace the `useEffect` placeholder with:

```tsx
const stateRef = useRef<{
  formation: FormationParticle[];
  ambient: AmbientParticle[];
  orbitals: OrbitalParticle[];
  rafId: number;
  startTime: number;
} | null>(null);

const initParticles = useCallback((cw: number, ch: number) => {
  const targets = sampleKnightPoints(FORMATION_COUNT, cw, ch);
  const formation = targets.map(t => makeFormationParticle(t.x, t.y, cw, ch));
  // Record start positions
  formation.forEach(p => { p.sx = p.x; p.sy = p.y; });
  const ambient = Array.from({ length: AMBIENT_COUNT }, () => makeAmbientParticle(cw, ch));
  const orbitals = Array.from({ length: ORBITAL_COUNT }, (_, i) => makeOrbital(i, cw, ch));
  return { formation, ambient, orbitals };
}, []);
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/chidanandh/Desktop/Python\ folders/Chess/Chess/Gambit/frontend && npx tsc --noEmit 2>&1
```

Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/ui/KnightIntro.tsx
git commit -m "feat: add particle data structures and factory functions to KnightIntro"
```

---

## Task 4: Animation Loop — Phases 1–4 (Drift → Attract → Lock → Solidify)

**Files:**
- Modify: `frontend/components/ui/KnightIntro.tsx`

- [ ] **Step 1: Add easing helpers at the top of KnightIntro.tsx**

After the factory functions, add:

```ts
// ── Easing ────────────────────────────────────────────────────────────────
const easeInOut = (t: number) => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
const easeOut   = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp     = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp      = (a: number, b: number, t: number) => a + (b - a) * t;
```

- [ ] **Step 2: Add `drawPhase1to4` function**

Add this function before the `KnightIntro` component default export:

```ts
function drawPhase1to4(
  ctx: CanvasRenderingContext2D,
  cw: number, ch: number,
  t: number,    // elapsed seconds
  dpr: number,
  formation: FormationParticle[],
  ambient: AmbientParticle[],
  orbitals: OrbitalParticle[],
) {
  ctx.clearRect(0, 0, cw, ch);

  // ── Background ──────────────────────────────────────────────────────────
  ctx.fillStyle = '#0F0D0B';
  ctx.fillRect(0, 0, cw, ch);

  // ── Ambient particles ───────────────────────────────────────────────────
  ambient.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0) p.x = cw; if (p.x > cw) p.x = 0;
    if (p.y < 0) p.y = ch; if (p.y > ch) p.y = 0;
    // Fade in during first 2 seconds
    p.alpha = clamp(p.alpha + (t < 2 ? 0.005 : 0), 0, p.maxAlpha);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(196,150,90,${p.alpha})`;
    ctx.fill();
  });

  // ── Orbital particles ───────────────────────────────────────────────────
  const cx = cw / 2, cy = ch / 2;
  orbitals.forEach((orb, oi) => {
    orb.angle += orb.speed * 0.016; // ~60fps step
    // Draw trail
    for (let ti = 0; ti < orb.trailLength; ti++) {
      const ta = orb.angle - ti * 0.04;
      const ex = Math.cos(ta) * orb.a;
      const ey = Math.sin(ta) * orb.b;
      const px = cx + ex * Math.cos(orb.tilt) - ey * Math.sin(orb.tilt);
      const py = cy + ex * Math.sin(orb.tilt) + ey * Math.cos(orb.tilt);
      const fade = (1 - ti / orb.trailLength) * 0.7;
      const r = orb.radius * (1 - ti / orb.trailLength);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},${fade})`;
      ctx.fill();
    }
    // Draw head
    const hx = cx + Math.cos(orb.angle) * orb.a * Math.cos(orb.tilt) - Math.sin(orb.angle) * orb.b * Math.sin(orb.tilt);
    const hy = cy + Math.cos(orb.angle) * orb.a * Math.sin(orb.tilt) + Math.sin(orb.angle) * orb.b * Math.cos(orb.tilt);
    ctx.beginPath();
    ctx.arc(hx, hy, orb.radius * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,220,160,0.9)`;
    ctx.fill();
  });

  // ── Formation particles ─────────────────────────────────────────────────
  formation.forEach(p => {
    if (t < PHASE.DRIFT_END) {
      // Phase 1: gentle drift
      p.x += p.vx; p.y += p.vy;
    } else if (t < PHASE.ATTRACT_END) {
      // Phase 2: spiral attract (staggered)
      const attractT = t - PHASE.DRIFT_END;
      const myT = clamp((attractT - p.delay) / (PHASE.ATTRACT_END - PHASE.DRIFT_END - p.delay), 0, 1);
      const progress = easeInOut(myT);
      p.x = lerp(p.sx, p.tx, progress);
      p.y = lerp(p.sy, p.ty, progress);
    } else if (t < PHASE.LOCK_END) {
      // Phase 3: snap to exact position
      const snapT = (t - PHASE.ATTRACT_END) / (PHASE.LOCK_END - PHASE.ATTRACT_END);
      const progress = easeOut(snapT);
      p.x = lerp(p.x, p.tx, progress * 0.15);
      p.y = lerp(p.y, p.ty, progress * 0.15);
    } else {
      // Phase 4+: at target
      p.x = p.tx; p.y = p.ty;
    }

    // Record start position once drifting begins (for attract lerp)
    if (t >= PHASE.DRIFT_END && t < PHASE.DRIFT_END + 0.02) {
      p.sx = p.x; p.sy = p.y;
    }

    // Breathing oscillation (phases 3+)
    let bRadius = p.radius;
    if (t >= PHASE.LOCK_END) {
      bRadius += Math.sin(t * 2.5 + p.breathPhase) * 0.3;
    }

    // Alpha ramp: starts at p.alpha, fully bright at lock
    let alpha = p.alpha;
    if (t >= PHASE.ATTRACT_END) {
      const lockT = clamp((t - PHASE.ATTRACT_END) / (PHASE.LOCK_END - PHASE.ATTRACT_END), 0, 1);
      alpha = lerp(p.alpha, 1.0, easeOut(lockT));
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, bRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},${alpha})`;
    ctx.fill();
  });

  // ── Phase 4: sweep solidification (8.5–10s would be handled here) ───────
  if (t >= PHASE.LOCK_END && t < PHASE.SOLIDIFY_END) {
    const sweepT = (t - PHASE.LOCK_END) / (PHASE.SOLIDIFY_END - PHASE.LOCK_END);
    const sweepProgress = easeInOut(sweepT);
    // Clip region: everything above a horizontal scan line
    const scanY = ch * sweepProgress;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cw, scanY);
    ctx.clip();
    // Fill knight silhouette solid
    const scale = Math.min(cw, ch) * 0.55 / 300;
    const ox = (cw - 300 * scale) / 2;
    const oy = (ch - 300 * scale) / 2;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    const knight = new Path2D(KNIGHT_PATH_D);
    ctx.fillStyle = `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},0.85)`;
    ctx.fill(knight);
    ctx.restore();
    ctx.restore();
  }
}
```

- [ ] **Step 3: Wire the animation loop into KnightIntro useEffect**

Replace the entire `useEffect` in `KnightIntro`:

```tsx
useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  let mounted = true;

  const resize = () => {
    canvas.width  = window.innerWidth  * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width  = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  };
  resize();
  window.addEventListener('resize', resize);

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const cw = window.innerWidth, ch = window.innerHeight;
  const { formation, ambient, orbitals } = initParticles(cw, ch);
  stateRef.current = { formation, ambient, orbitals, rafId: 0, startTime: performance.now() };

  const loop = () => {
    if (!mounted || !stateRef.current) return;
    const t = (performance.now() - stateRef.current.startTime) / 1000;

    if (t < PHASE.SOLIDIFY_END) {
      drawPhase1to4(ctx, cw, ch, t, dpr,
        stateRef.current.formation,
        stateRef.current.ambient,
        stateRef.current.orbitals);
    }

    if (t >= PHASE.SETTLE_END) {
      onComplete();
      return;
    }

    stateRef.current.rafId = requestAnimationFrame(loop);
  };

  stateRef.current.rafId = requestAnimationFrame(loop);

  return () => {
    mounted = false;
    window.removeEventListener('resize', resize);
    if (stateRef.current) cancelAnimationFrame(stateRef.current.rafId);
  };
}, [initParticles, onComplete]);
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/chidanandh/Desktop/Python\ folders/Chess/Chess/Gambit/frontend && npx tsc --noEmit 2>&1
```

Expected: Clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/ui/KnightIntro.tsx
git commit -m "feat: implement animation phases 1-4 (drift/attract/lock/solidify)"
```

---

## Task 5: Animation Phases 5–7 (Outline Tracer → Title Fade → Acceleration)

**Files:**
- Modify: `frontend/components/ui/KnightIntro.tsx`

- [ ] **Step 1: Add perimeter sampler helper**

After `sampleKnightPoints`, add:

```ts
function sampleKnightPerimeter(count: number, destW: number, destH: number): { x: number; y: number }[] {
  const SIZE = 300;
  const off = document.createElement('canvas');
  off.width = SIZE + 2; off.height = SIZE + 2;
  const ctx = off.getContext('2d')!;
  const p = new Path2D(KNIGHT_PATH_D);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke(p);
  const img = ctx.getImageData(0, 0, SIZE + 2, SIZE + 2);
  const edge: { x: number; y: number }[] = [];
  for (let y = 0; y < SIZE + 2; y++) {
    for (let x = 0; x < SIZE + 2; x++) {
      if (img.data[(y * (SIZE + 2) + x) * 4 + 3] > 128) edge.push({ x, y });
    }
  }
  const step = Math.max(1, Math.floor(edge.length / count));
  const sampled = edge.filter((_, i) => i % step === 0).slice(0, count);
  const scale = Math.min(destW, destH) * 0.55 / SIZE;
  const ox = (destW - SIZE * scale) / 2;
  const oy = (destH - SIZE * scale) / 2;
  return sampled.map(p => ({ x: p.x * scale + ox, y: p.y * scale + oy }));
}
```

- [ ] **Step 2: Add `drawPhase5to7` function**

Add before the `KnightIntro` export:

```ts
function drawPhase5to7(
  ctx: CanvasRenderingContext2D,
  cw: number, ch: number,
  t: number,
  perimeterPoints: { x: number; y: number }[],
  tracerAngle: React.MutableRefObject<number>,
) {
  // Draw knight solid fill (maintained from phase 4)
  const scale = Math.min(cw, ch) * 0.55 / 300;
  const ox = (cw - 300 * scale) / 2, oy = (ch - 300 * scale) / 2;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  const knight = new Path2D(KNIGHT_PATH_D);
  ctx.fillStyle = `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},0.85)`;
  ctx.fill(knight);
  ctx.restore();

  if (t >= PHASE.OUTLINE_END) return; // tracer done

  // Phase 5: outline tracer
  const traceT = clamp((t - PHASE.SOLIDIFY_END) / (PHASE.OUTLINE_END - PHASE.SOLIDIFY_END), 0, 1);
  // Exponential acceleration in phase 7 (ACCEL_END)
  const isAccel = t >= PHASE.TITLE_END;
  const speed = isAccel
    ? Math.pow((t - PHASE.TITLE_END) / (PHASE.ACCEL_END - PHASE.TITLE_END), 2) * 6 + 1
    : 1;

  const totalPoints = perimeterPoints.length;
  const visibleCount = Math.floor(traceT * totalPoints * speed);
  const headIdx = Math.min(visibleCount, totalPoints - 1);

  // Draw gold glow dot at head
  if (headIdx >= 0 && headIdx < totalPoints) {
    const head = perimeterPoints[headIdx];
    const grd = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 8);
    grd.addColorStop(0, 'rgba(255,240,200,1)');
    grd.addColorStop(0.5, `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},0.8)`);
    grd.addColorStop(1, 'rgba(196,150,90,0)');
    ctx.beginPath();
    ctx.arc(head.x, head.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
  }
}
```

- [ ] **Step 3: Update the animation loop to call drawPhase5to7**

In the `loop` function inside `useEffect`, update the conditional block:

```ts
if (t < PHASE.SOLIDIFY_END) {
  drawPhase1to4(ctx, cw, ch, t, dpr,
    stateRef.current.formation, stateRef.current.ambient, stateRef.current.orbitals);
} else if (t < PHASE.ACCEL_END) {
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = '#0F0D0B';
  ctx.fillRect(0, 0, cw, ch);
  drawPhase5to7(ctx, cw, ch, t, perimeterRef.current, tracerAngleRef);
}
```

Add these refs inside the component (after `stateRef`):

```tsx
const perimeterRef = useRef<{ x: number; y: number }[]>([]);
const tracerAngleRef = useRef(0);
```

Initialize perimeter in the `resize` / `initParticles` block:

```ts
perimeterRef.current = sampleKnightPerimeter(600, cw, ch);
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/chidanandh/Desktop/Python\ folders/Chess/Chess/Gambit/frontend && npx tsc --noEmit 2>&1
```

Expected: Clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/ui/KnightIntro.tsx
git commit -m "feat: add outline tracer animation phase 5-7 to KnightIntro"
```

---

## Task 6: HTML Overlay (Title + Buttons + Skip) + Phase 6 Title Fade

**Files:**
- Modify: `frontend/components/ui/KnightIntro.tsx`

- [ ] **Step 1: Replace the return JSX with overlay + canvas**

Replace the `return (...)` in `KnightIntro`:

```tsx
// Inside KnightIntro component, add state for overlay alpha
const [overlayAlpha, setOverlayAlpha] = useState(0);
const [showOverlay, setShowOverlay] = useState(false);

// Update overlayAlpha from rAF loop by storing it in stateRef and setting it
// Add to stateRef type: overlayAlpha: number
// In the loop: if t >= PHASE.OUTLINE_END, compute overlayAlpha and call setOverlayAlpha

return (
  <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />

    {/* Skip button — always visible */}
    <button
      onClick={onComplete}
      style={{
        position: 'absolute', top: 24, right: 24,
        background: 'rgba(255,255,255,0.08)',
        border: '0.5px solid rgba(255,255,255,0.2)',
        color: 'rgba(255,255,255,0.6)',
        borderRadius: 8, padding: '6px 16px',
        fontSize: 13, cursor: 'pointer',
        backdropFilter: 'blur(4px)',
        transition: 'opacity 0.2s',
        zIndex: 10,
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
    >
      Skip
    </button>

    {/* Title overlay — fades in during phase 6 */}
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'flex-end',
      paddingBottom: '12vh',
      opacity: overlayAlpha,
      transition: 'opacity 0.1s',
      pointerEvents: overlayAlpha > 0.5 ? 'auto' : 'none',
    }}>
      <div style={{
        fontFamily: 'var(--font-inter, Inter, sans-serif)',
        fontSize: 'clamp(48px, 8vw, 88px)',
        fontWeight: 600,
        letterSpacing: '-3px',
        lineHeight: 1,
        background: 'linear-gradient(135deg, #FFFFFF 55%, #C4965A)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        marginBottom: 12,
        textAlign: 'center',
      }}>
        Gambit
      </div>
      <div style={{
        color: 'rgba(255,255,255,0.45)',
        fontSize: 'clamp(14px, 2vw, 18px)',
        letterSpacing: '0.25em',
        textTransform: 'uppercase',
        marginBottom: 40,
      }}>
        Chess, perfected.
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={onComplete}
          style={{
            background: '#C4965A',
            color: '#0F0D0B',
            border: 'none',
            borderRadius: 12,
            padding: '14px 32px',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 24px rgba(196,150,90,0.35)',
            letterSpacing: '-0.3px',
          }}
        >
          Play Now
        </button>
        <button
          onClick={onComplete}
          style={{
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.8)',
            border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: 12,
            padding: '14px 32px',
            fontSize: 15,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Create Account
        </button>
      </div>
    </div>
  </div>
);
```

- [ ] **Step 2: Drive overlayAlpha from the animation loop**

In the `loop` rAF function, after computing `t`, add:

```ts
if (t >= PHASE.OUTLINE_END && t < PHASE.FLASH_END) {
  const ta = clamp((t - PHASE.OUTLINE_END) / (PHASE.TITLE_END - PHASE.OUTLINE_END), 0, 1);
  setOverlayAlpha(easeOut(ta));
} else if (t >= PHASE.FLASH_END) {
  setOverlayAlpha(0);
}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/chidanandh/Desktop/Python\ folders/Chess/Chess/Gambit/frontend && npx tsc --noEmit 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add frontend/components/ui/KnightIntro.tsx
git commit -m "feat: add HTML title overlay and skip button to KnightIntro"
```

---

## Task 7: White Flash + Shockwave Reveal (Phase 8–9)

**Files:**
- Modify: `frontend/components/ui/KnightIntro.tsx`

- [ ] **Step 1: Add `drawFlashAndShockwave` function**

Add before the `KnightIntro` export:

```ts
function drawFlashAndShockwave(
  ctx: CanvasRenderingContext2D,
  cw: number, ch: number,
  t: number,
) {
  const cx = cw / 2, cy = ch / 2;

  if (t < PHASE.SHOCKWAVE_END) {
    // White flash: 17–17.4s
    if (t < PHASE.FLASH_END + 0.4) {
      const flashT = clamp((t - PHASE.FLASH_END) / 0.4, 0, 1);
      const flashAlpha = flashT < 0.3 ? flashT / 0.3 : 1 - (flashT - 0.3) / 0.7;
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha * 0.95})`;
      ctx.fillRect(0, 0, cw, ch);
    }

    // Shockwave: 17.4s–19.5s
    if (t >= PHASE.FLASH_END + 0.2) {
      const swT = clamp((t - PHASE.FLASH_END - 0.2) / (PHASE.SHOCKWAVE_END - PHASE.FLASH_END - 0.2), 0, 1);
      const maxR = Math.sqrt(cx * cx + cy * cy) * 1.2;
      const r = swT * maxR;
      const thickness = 60 * (1 - swT * 0.7);

      // Outer bloom
      const bloom = ctx.createRadialGradient(cx, cy, Math.max(0, r - thickness * 2), cx, cy, r + thickness);
      bloom.addColorStop(0, 'rgba(196,150,90,0)');
      bloom.addColorStop(0.5, `rgba(196,150,90,${0.15 * (1 - swT)})`);
      bloom.addColorStop(1, 'rgba(196,150,90,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, r + thickness, 0, Math.PI * 2);
      ctx.fillStyle = bloom;
      ctx.fill();

      // destination-out ring: erase canvas so page shows through
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(0, r - thickness / 2), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,0,0,${easeOut(swT)})`;
      ctx.fill();
      ctx.restore();

      // White leading edge
      const edgeGrd = ctx.createRadialGradient(cx, cy, r - 4, cx, cy, r + 4);
      edgeGrd.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - swT)})`);
      edgeGrd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
      ctx.fillStyle = edgeGrd;
      ctx.fill();

      // Gold chromatic fringe (outside)
      ctx.beginPath();
      ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},${0.6 * (1 - swT)})`;
      ctx.stroke();
    }
  }
}
```

- [ ] **Step 2: Update animation loop to call drawFlashAndShockwave**

In the `loop`, extend the phase conditional:

```ts
} else if (t >= PHASE.ACCEL_END && t < PHASE.SETTLE_END) {
  // Background stays dark
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = '#0F0D0B';
  ctx.fillRect(0, 0, cw, ch);
  drawFlashAndShockwave(ctx, cw, ch, t);
}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/chidanandh/Desktop/Python\ folders/Chess/Chess/Gambit/frontend && npx tsc --noEmit 2>&1
```

Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/ui/KnightIntro.tsx
git commit -m "feat: implement white flash and shockwave destination-out reveal in KnightIntro"
```

---

## Task 8: Page Settling + prefersReducedMotion + Performance Gate

**Files:**
- Modify: `frontend/components/ui/KnightIntro.tsx`

- [ ] **Step 1: Add settling phase and perf checks at component top**

At the top of the `KnightIntro` function body, before the refs, add:

```tsx
// Reduced motion: skip immediately
const prefersReduced = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

// Low-perf device: skip if < 4 logical cores
const isLowPerf = typeof navigator !== 'undefined'
  ? (navigator.hardwareConcurrency ?? 4) < 4
  : false;

useEffect(() => {
  if (prefersReduced || isLowPerf) {
    onComplete();
  }
}, [prefersReduced, isLowPerf, onComplete]);
```

- [ ] **Step 2: Add settle phase canvas fade-out**

In `drawFlashAndShockwave`, at the end after shockwave:

```ts
// Settle: final fade to transparent so page is fully visible
if (t >= PHASE.SHOCKWAVE_END) {
  const settleT = clamp((t - PHASE.SHOCKWAVE_END) / (PHASE.SETTLE_END - PHASE.SHOCKWAVE_END), 0, 1);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = `rgba(0,0,0,${settleT})`;
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();
}
```

- [ ] **Step 3: Add shudder effect at flash moment**

In the `loop`, when `t` crosses `PHASE.FLASH_END`:

```ts
// One-shot shudder on flash
if (t >= PHASE.FLASH_END && t < PHASE.FLASH_END + 0.05 && !shudderFiredRef.current) {
  shudderFiredRef.current = true;
  document.getElementById('page-container')?.classList.add('shudder');
  setTimeout(() => document.getElementById('page-container')?.classList.remove('shudder'), 400);
}
```

Add `const shudderFiredRef = useRef(false);` to the component.

- [ ] **Step 4: Type-check**

```bash
cd /Users/chidanandh/Desktop/Python\ folders/Chess/Chess/Gambit/frontend && npx tsc --noEmit 2>&1
```

- [ ] **Step 5: Commit**

```bash
git add frontend/components/ui/KnightIntro.tsx
git commit -m "feat: add settling phase, perf gate, prefersReducedMotion, shudder effect"
```

---

## Task 9: KnightBackground Component

**Files:**
- Create: `frontend/components/ui/KnightBackground.tsx`

- [ ] **Step 1: Create KnightBackground.tsx**

Create `frontend/components/ui/KnightBackground.tsx`:

```tsx
"use client";

import { useEffect, useRef } from 'react';
import { sampleKnightPoints } from './KnightIntro';

interface Props {
  mode: 'landing' | 'lobby';
}

// Valid knight L-move offsets
const KNIGHT_MOVES = [
  [2,1],[2,-1],[-2,1],[-2,-1],
  [1,2],[1,-2],[-1,2],[-1,-2],
];

interface RoamingKnight {
  // Grid position (0–7)
  gx: number; gy: number;
  // Bezier path: start → cp1 → cp2 → end (in canvas px)
  p0: {x:number;y:number}; p1: {x:number;y:number};
  p2: {x:number;y:number}; p3: {x:number;y:number};
  t: number;       // 0→1 progress along bezier
  speed: number;   // bezier units/sec
  alpha: number;
}

function cubicBezier(p0:{x:number;y:number}, p1:{x:number;y:number}, p2:{x:number;y:number}, p3:{x:number;y:number}, t:number) {
  const mt = 1 - t;
  return {
    x: mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x,
    y: mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y,
  };
}

function gridToCanvas(gx: number, gy: number, cw: number, ch: number) {
  const cellW = cw / 8, cellH = ch / 8;
  return { x: (gx + 0.5) * cellW, y: (gy + 0.5) * cellH };
}

function makeRoamingKnight(cw: number, ch: number): RoamingKnight {
  const gx = Math.floor(Math.random() * 8);
  const gy = Math.floor(Math.random() * 8);
  const validMoves = KNIGHT_MOVES
    .map(([dx, dy]) => [gx + dx, gy + dy])
    .filter(([nx, ny]) => nx >= 0 && nx < 8 && ny >= 0 && ny < 8);
  const [ngx, ngy] = validMoves[Math.floor(Math.random() * validMoves.length)] ?? [gx, gy];
  const p0 = gridToCanvas(gx, gy, cw, ch);
  const p3 = gridToCanvas(ngx, ngy, cw, ch);
  // L-shaped cubic bezier: control points follow the L
  const midX = gridToCanvas(ngx, gy, cw, ch).x;
  const midY = gridToCanvas(gx, ngy, cw, ch).y;
  return {
    gx: ngx, gy: ngy,
    p0, p1: { x: midX, y: p0.y }, p2: { x: midX, y: midY }, p3,
    t: 0, speed: 0.25 + Math.random() * 0.15,
    alpha: 0.06 + Math.random() * 0.06,
  };
}

export default function KnightBackground({ mode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    let mounted = true;
    let rafId = 0;

    const resize = () => {
      canvas.width  = window.innerWidth  * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width  = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();
    window.addEventListener('resize', resize);

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    // ── Shared state ─────────────────────────────────────────────────────
    const cw = window.innerWidth, ch = window.innerHeight;
    let angle = 0; // parallax/orbital angle

    // ── Landing mode setup ────────────────────────────────────────────────
    // Knight watermark path (drawn directly via Path2D)
    const KNIGHT_PATH_D = `M 150 270 C 130 265 110 255 100 240 C 90 225 95 210 105 200 C 115 190 120 180 115 165 C 110 150 100 140 95 125 C 88 105 90 85 100 70 C 110 55 125 45 140 40 C 150 36 155 38 158 42 C 162 36 170 30 178 28 C 188 26 195 30 198 38 C 205 35 212 36 215 42 C 220 38 228 40 230 48 C 235 45 240 50 238 58 C 242 60 244 68 240 75 C 248 80 250 90 245 100 C 252 108 252 120 245 130 C 238 140 225 145 215 148 C 220 158 222 170 218 182 C 225 188 228 200 224 212 C 230 220 230 235 222 245 C 212 258 195 268 175 272 Z`;

    // ── Lobby mode setup ──────────────────────────────────────────────────
    const roamers: RoamingKnight[] = mode === 'lobby'
      ? Array.from({ length: 3 }, () => makeRoamingKnight(cw, ch))
      : [];

    let lastTime = performance.now();

    const loop = () => {
      if (!mounted) return;
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      angle += dt * 0.3;

      ctx.clearRect(0, 0, cw, ch);

      if (mode === 'landing') {
        // Watermark knight — faint, centered, slight parallax
        const scale = Math.min(cw, ch) * 0.7 / 300;
        const ox = (cw - 300 * scale) / 2 + Math.sin(angle * 0.5) * 8;
        const oy = (ch - 300 * scale) / 2 + Math.cos(angle * 0.4) * 5;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.scale(scale, scale);
        const knight = new Path2D(KNIGHT_PATH_D);
        ctx.fillStyle = 'rgba(196,150,90,0.04)';
        ctx.fill(knight);
        ctx.restore();

        // 3 orbital particles
        const cx2 = cw / 2, cy2 = ch / 2;
        const orbDefs = [
          { a: Math.min(cw,ch)*0.32, b: Math.min(cw,ch)*0.18, tilt: 0, speed: 1.0, r: 2.5 },
          { a: Math.min(cw,ch)*0.40, b: Math.min(cw,ch)*0.22, tilt: Math.PI/3, speed: 0.7, r: 1.8 },
          { a: Math.min(cw,ch)*0.28, b: Math.min(cw,ch)*0.14, tilt: -Math.PI/4, speed: 1.3, r: 1.5 },
        ];
        orbDefs.forEach(orb => {
          const a = angle * orb.speed;
          const ex = Math.cos(a) * orb.a;
          const ey = Math.sin(a) * orb.b;
          const px = cx2 + ex * Math.cos(orb.tilt) - ey * Math.sin(orb.tilt);
          const py = cy2 + ex * Math.sin(orb.tilt) + ey * Math.cos(orb.tilt);
          // Trail
          for (let ti = 0; ti < 12; ti++) {
            const ta = a - ti * 0.03 * orb.speed;
            const ex2 = Math.cos(ta) * orb.a;
            const ey2 = Math.sin(ta) * orb.b;
            const tx2 = cx2 + ex2 * Math.cos(orb.tilt) - ey2 * Math.sin(orb.tilt);
            const ty2 = cy2 + ex2 * Math.sin(orb.tilt) + ey2 * Math.cos(orb.tilt);
            const fade = (1 - ti / 12) * 0.25;
            ctx.beginPath();
            ctx.arc(tx2, ty2, orb.r * (1 - ti/12), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(196,150,90,${fade})`;
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(px, py, orb.r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,220,150,0.7)';
          ctx.fill();
        });

      } else {
        // Lobby: 3 roaming knights on virtual 8×8 grid
        roamers.forEach((roamer, ri) => {
          roamer.t += dt * roamer.speed;
          if (roamer.t >= 1) {
            // Arrive at target, pick next move
            const validMoves = KNIGHT_MOVES
              .map(([dx, dy]) => [roamer.gx + dx, roamer.gy + dy])
              .filter(([nx, ny]) => nx >= 0 && nx < 8 && ny >= 0 && ny < 8);
            const [ngx, ngy] = validMoves[Math.floor(Math.random() * validMoves.length)] ?? [roamer.gx, roamer.gy];
            const np0 = gridToCanvas(roamer.gx, roamer.gy, cw, ch);
            const np3 = gridToCanvas(ngx, ngy, cw, ch);
            const nmidX = gridToCanvas(ngx, roamer.gy, cw, ch).x;
            const nmidY = gridToCanvas(roamer.gx, ngy, cw, ch).y;
            roamer.p0 = np0; roamer.p3 = np3;
            roamer.p1 = { x: nmidX, y: np0.y };
            roamer.p2 = { x: nmidX, y: nmidY };
            roamer.gx = ngx; roamer.gy = ngy;
            roamer.t = 0;
          }

          const pos = cubicBezier(roamer.p0, roamer.p1, roamer.p2, roamer.p3, Math.min(roamer.t, 1));
          const scale = Math.min(cw, ch) * 0.12 / 300;
          ctx.save();
          ctx.translate(pos.x - 150 * scale, pos.y - 150 * scale);
          ctx.scale(scale, scale);
          const knight = new Path2D(KNIGHT_PATH_D);
          ctx.fillStyle = `rgba(196,150,90,${roamer.alpha})`;
          ctx.fill(knight);
          ctx.restore();
        });
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      mounted = false;
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafId);
    };
  }, [mode]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0,
        zIndex: -1, pointerEvents: 'none',
        opacity: 1,
      }}
    />
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/chidanandh/Desktop/Python\ folders/Chess/Chess/Gambit/frontend && npx tsc --noEmit 2>&1
```

Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/ui/KnightBackground.tsx
git commit -m "feat: create KnightBackground ambient canvas (landing watermark + lobby roaming knights)"
```

---

## Task 10: Integration into page.tsx and lobby/page.tsx

**Files:**
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/app/lobby/page.tsx`

- [ ] **Step 1: Update page.tsx to show KnightIntro on first visit**

At the top of `frontend/app/page.tsx`, add after existing imports:

```tsx
import dynamic from 'next/dynamic';

const KnightIntro = dynamic(() => import('@/components/ui/KnightIntro'), { ssr: false });
const KnightBackground = dynamic(() => import('@/components/ui/KnightBackground'), { ssr: false });
```

Inside the `Home` component, add state:

```tsx
const [showIntro, setShowIntro] = useState(false);
const [introComplete, setIntroComplete] = useState(false);

useEffect(() => {
  const seen = localStorage.getItem('gambit_intro_seen');
  if (!seen) {
    setShowIntro(true);
    localStorage.setItem('gambit_intro_seen', '1');
  } else {
    setIntroComplete(true);
  }
}, []);

const handleIntroComplete = useCallback(() => {
  setShowIntro(false);
  setIntroComplete(true);
  // Reveal page
  const el = document.getElementById('page-container');
  if (el) {
    el.classList.add('page-reveal');
  }
}, []);
```

Wrap the entire return JSX in a `<div id="page-container">` and add the KnightIntro + KnightBackground before it:

```tsx
return (
  <>
    {showIntro && <KnightIntro onComplete={handleIntroComplete} />}
    {introComplete && <KnightBackground mode="landing" />}
    <div
      id="page-container"
      style={{ opacity: introComplete ? 1 : showIntro ? 0 : 1 }}
      className={introComplete ? 'page-reveal' : ''}
    >
      {/* ... existing JSX unchanged ... */}
    </div>
  </>
);
```

- [ ] **Step 2: Update lobby/page.tsx to include KnightBackground**

At the top of `frontend/app/lobby/page.tsx`, add:

```tsx
import dynamic from 'next/dynamic';
const KnightBackground = dynamic(() => import('@/components/ui/KnightBackground'), { ssr: false });
```

In the lobby `return`, add as the first child inside the outermost `<div>`:

```tsx
<KnightBackground mode="lobby" />
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/chidanandh/Desktop/Python\ folders/Chess/Chess/Gambit/frontend && npx tsc --noEmit 2>&1
```

Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/page.tsx frontend/app/lobby/page.tsx
git commit -m "feat: integrate KnightIntro (first visit) and KnightBackground into landing and lobby pages"
```

---

## Verification Checklist

After all tasks complete:

```
[ ] npx tsc --noEmit passes clean (no type errors)
[ ] First visit to / shows cinematic intro (localStorage key not set)
[ ] Second visit skips intro immediately, page is visible
[ ] Intro plays ~20 seconds in correct phase order:
    - Particles drift in space (0-2s)
    - Particles spiral into knight shape (2-5.5s)
    - Particles snap to formation (5.5-6.5s)
    - Sweep solidification fills knight (6.5-8.5s)
    - Gold tracer runs perimeter (8.5-11s)
    - Title + buttons fade in (11-14s)
    - Tracer accelerates (14-16s)
    - White flash (16-17s)
    - Shockwave ring expands, page visible through hole (17-19.5s)
    - Canvas settles/fades, full page visible (19.5-20s)
[ ] Skip button works at any phase
[ ] On devices with prefers-reduced-motion: intro skipped immediately
[ ] On devices with < 4 CPU cores: intro skipped immediately
[ ] Page shudders once at flash moment
[ ] Landing page: faint knight watermark visible at z-index -1, orbiting particles visible
[ ] Lobby page: 3 faint knight silhouettes roam in L-shaped bezier paths across 8×8 grid
[ ] Both background canvases clean up on unmount (no memory leaks)
```

---

## Notes on SVG Path

The `KNIGHT_PATH_D` in this plan is a simplified approximation of a chess knight silhouette. If the shape appears incorrect, replace it with the actual SVG path from a standard chess piece SVG (e.g., from chess piece SVG sets like Merida or CBurnett). The path should fit within a `300×300` viewBox and be closed.
