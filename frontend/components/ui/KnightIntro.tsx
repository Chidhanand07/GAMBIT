"use client";

import { useEffect, useRef, useCallback, useState } from 'react';


// ── Timing constants ──────────────────────────────────────────────────────
const PHASE = {
  DRIFT_END:     2.0,
  ATTRACT_END:   5.5,
  LOCK_END:      6.5,
  SOLIDIFY_END:  8.5,
  OUTLINE_END:  11.0,
  TITLE_END:    14.0,   // GAMBIT title fully visible
  HOLD_END:     16.0,   // hold for 2s, then fade begins
  SETTLE_END:   17.5,   // animation fully done, call onComplete
} as const;

const ACCENT_R = 196, ACCENT_G = 150, ACCENT_B = 90;
const FORMATION_COUNT = 400;
const AMBIENT_COUNT   = 50;
const ORBITAL_COUNT   = 3;

// ── Easing ────────────────────────────────────────────────────────────────
const easeInOut = (t: number) => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
const easeOut   = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp     = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp      = (a: number, b: number, t: number) => a + (b - a) * t;

// ── Particle types ────────────────────────────────────────────────────────
interface FormationParticle {
  x: number; y: number;
  sx: number; sy: number;
  tx: number; ty: number;
  vx: number; vy: number;
  radius: number;
  alpha: number;
  delay: number;
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
  angle: number;
  speed: number;
  a: number; b: number;
  tilt: number;
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
    sx: 0, sy: 0,
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

// ── Offscreen sampler: returns N points inside the knight silhouette ──────
export function sampleKnightPoints(
  count: number,
  destW: number,
  destH: number
): { x: number; y: number }[] {
  const SIZE = 320;
  const off = document.createElement('canvas');
  off.width = SIZE; off.height = SIZE;
  const ctx = off.getContext('2d')!;

  // Use chess knight unicode glyph — guaranteed to look like Image #4
  ctx.fillStyle = '#fff';
  ctx.font = `bold 260px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\u265E', SIZE / 2, SIZE / 2 + 10);

  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const filled: { x: number; y: number }[] = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (img.data[(y * SIZE + x) * 4 + 3] > 64) {
        filled.push({ x, y });
      }
    }
  }

  const step = Math.max(1, Math.floor(filled.length / count));
  const sampled = filled.filter((_, i) => i % step === 0).slice(0, count);

  const scale = Math.min(destW, destH) * 0.52 / SIZE;
  const ox = (destW - SIZE * scale) / 2;
  const oy = (destH - SIZE * scale) / 2;

  return sampled.map(pt => ({ x: pt.x * scale + ox, y: pt.y * scale + oy }));
}

export function sampleKnightPerimeter(
  count: number,
  destW: number,
  destH: number
): { x: number; y: number }[] {
  const SIZE = 320;
  const off = document.createElement('canvas');
  off.width = SIZE; off.height = SIZE;
  const ctx = off.getContext('2d')!;

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 4;
  ctx.font = `bold 260px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText('\u265E', SIZE / 2, SIZE / 2 + 10);

  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const edge: { x: number; y: number }[] = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (img.data[(y * SIZE + x) * 4 + 3] > 64) {
        edge.push({ x, y });
      }
    }
  }

  const step = Math.max(1, Math.floor(edge.length / count));
  const sampled = edge.filter((_, i) => i % step === 0).slice(0, count);

  const scale = Math.min(destW, destH) * 0.52 / SIZE;
  const ox = (destW - SIZE * scale) / 2;
  const oy = (destH - SIZE * scale) / 2;

  return sampled.map(pt => ({ x: pt.x * scale + ox, y: pt.y * scale + oy }));
}

function drawPhase1to4(
  ctx: CanvasRenderingContext2D,
  cw: number, ch: number,
  t: number,
  formation: FormationParticle[],
  ambient: AmbientParticle[],
  orbitals: OrbitalParticle[],
) {
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = '#0F0D0B';
  ctx.fillRect(0, 0, cw, ch);

  // Ambient particles
  ambient.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0) p.x = cw; if (p.x > cw) p.x = 0;
    if (p.y < 0) p.y = ch; if (p.y > ch) p.y = 0;
    p.alpha = clamp(p.alpha + (t < 2 ? 0.005 : 0), 0, p.maxAlpha);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},${p.alpha})`;
    ctx.fill();
  });

  // Orbital particles
  const cx = cw / 2, cy = ch / 2;
  orbitals.forEach(orb => {
    orb.angle += orb.speed * 0.016;
    for (let ti = 0; ti < orb.trailLength; ti++) {
      const ta = orb.angle - ti * 0.04;
      const ex = Math.cos(ta) * orb.a;
      const ey = Math.sin(ta) * orb.b;
      const px = cx + ex * Math.cos(orb.tilt) - ey * Math.sin(orb.tilt);
      const py = cy + ex * Math.sin(orb.tilt) + ey * Math.cos(orb.tilt);
      const fade = (1 - ti / orb.trailLength) * 0.7;
      const r = orb.radius * (1 - ti / orb.trailLength);
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.1, r), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},${fade})`;
      ctx.fill();
    }
    const hx = cx + Math.cos(orb.angle) * orb.a * Math.cos(orb.tilt) - Math.sin(orb.angle) * orb.b * Math.sin(orb.tilt);
    const hy = cy + Math.cos(orb.angle) * orb.a * Math.sin(orb.tilt) + Math.sin(orb.angle) * orb.b * Math.cos(orb.tilt);
    ctx.beginPath();
    ctx.arc(hx, hy, orb.radius * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,220,160,0.9)`;
    ctx.fill();
  });

  // Formation particles
  formation.forEach(p => {
    if (t < PHASE.DRIFT_END) {
      p.x += p.vx; p.y += p.vy;
    } else if (t < PHASE.ATTRACT_END) {
      const attractT = t - PHASE.DRIFT_END;
      const myT = clamp(
        (attractT - p.delay) / (PHASE.ATTRACT_END - PHASE.DRIFT_END - p.delay),
        0, 1
      );
      const progress = easeInOut(myT);
      p.x = lerp(p.sx, p.tx, progress);
      p.y = lerp(p.sy, p.ty, progress);
    } else if (t < PHASE.LOCK_END) {
      const snapT = (t - PHASE.ATTRACT_END) / (PHASE.LOCK_END - PHASE.ATTRACT_END);
      const progress = easeOut(snapT);
      p.x = lerp(p.x, p.tx, progress * 0.15);
      p.y = lerp(p.y, p.ty, progress * 0.15);
    } else {
      p.x = p.tx; p.y = p.ty;
    }

    if (t >= PHASE.DRIFT_END && t < PHASE.DRIFT_END + 0.02) {
      p.sx = p.x; p.sy = p.y;
    }

    let bRadius = p.radius;
    if (t >= PHASE.LOCK_END) {
      bRadius += Math.sin(t * 2.5 + p.breathPhase) * 0.3;
    }

    let alpha = p.alpha;
    if (t >= PHASE.ATTRACT_END) {
      const lockT = clamp((t - PHASE.ATTRACT_END) / (PHASE.LOCK_END - PHASE.ATTRACT_END), 0, 1);
      alpha = lerp(p.alpha, 1.0, easeOut(lockT));
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.1, bRadius), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},${alpha})`;
    ctx.fill();
  });

  // Phase 4: sweep solidification
  if (t >= PHASE.LOCK_END && t < PHASE.SOLIDIFY_END) {
    const sweepT = (t - PHASE.LOCK_END) / (PHASE.SOLIDIFY_END - PHASE.LOCK_END);
    const sweepProgress = easeInOut(sweepT);
    const scanY = ch * sweepProgress;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cw, scanY);
    ctx.clip();
    // Draw knight glyph solid
    const glyphSize = Math.min(cw, ch) * 0.52;
    const fontSize = Math.round(glyphSize * 0.82);
    ctx.font = `bold ${fontSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},0.85)`;
    ctx.fillText('\u265E', cw / 2, ch / 2 + glyphSize * 0.03);
    ctx.restore();
  }
}

function drawPhase5to7(
  ctx: CanvasRenderingContext2D,
  cw: number, ch: number,
  t: number,
  perimeterPoints: { x: number; y: number }[],
  orbitals: OrbitalParticle[],
) {
  // Keep knight visible as solid glyph
  const glyphSize = Math.min(cw, ch) * 0.52;
  const fontSize = Math.round(glyphSize * 0.82);
  ctx.font = `bold ${fontSize}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},0.85)`;
  ctx.fillText('\u265E', cw / 2, ch / 2 + glyphSize * 0.03);

  // Continue orbital particles during title phase
  const cx = cw / 2, cy = ch / 2;
  orbitals.forEach(orb => {
    orb.angle += orb.speed * 0.016;
    for (let ti = 0; ti < orb.trailLength; ti++) {
      const ta = orb.angle - ti * 0.04;
      const ex = Math.cos(ta) * orb.a;
      const ey = Math.sin(ta) * orb.b;
      const px = cx + ex * Math.cos(orb.tilt) - ey * Math.sin(orb.tilt);
      const py = cy + ex * Math.sin(orb.tilt) + ey * Math.cos(orb.tilt);
      const fade = (1 - ti / orb.trailLength) * 0.7;
      const r = orb.radius * (1 - ti / orb.trailLength);
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.1, r), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},${fade})`;
      ctx.fill();
    }
    const hx = cx + Math.cos(orb.angle) * orb.a * Math.cos(orb.tilt) - Math.sin(orb.angle) * orb.b * Math.sin(orb.tilt);
    const hy = cy + Math.cos(orb.angle) * orb.a * Math.sin(orb.tilt) + Math.sin(orb.angle) * orb.b * Math.cos(orb.tilt);
    ctx.beginPath();
    ctx.arc(hx, hy, orb.radius * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,220,160,0.9)`;
    ctx.fill();
  });

  const total = perimeterPoints.length;
  if (total === 0) return;

  const traceElapsed = t - PHASE.SOLIDIFY_END;
  const traceDuration = PHASE.OUTLINE_END - PHASE.SOLIDIFY_END;
  const traceT = clamp(traceElapsed / traceDuration, 0, 1);
  const headIdx = Math.min(Math.floor(traceT * total), total - 1);

  // Gold glow dot at tracer head
  if (headIdx >= 0 && headIdx < total) {
    const head = perimeterPoints[headIdx];
    const grd = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 10);
    grd.addColorStop(0, 'rgba(255,240,200,1)');
    grd.addColorStop(0.4, `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},0.8)`);
    grd.addColorStop(1, 'rgba(196,150,90,0)');
    ctx.beginPath();
    ctx.arc(head.x, head.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // Bright core
    ctx.beginPath();
    ctx.arc(head.x, head.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
  }
}


export default function KnightIntro({ onComplete }: { onComplete: () => void }) {
  // Skip intro on reduced motion preference or low-perf devices
  const prefersReduced =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  const isLowPerf =
    typeof navigator !== 'undefined'
      ? (navigator.hardwareConcurrency ?? 4) < 4
      : false;

  useEffect(() => {
    if (prefersReduced || isLowPerf) {
      onComplete();
    }
  }, [prefersReduced, isLowPerf, onComplete]);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const stateRef = useRef<{
    formation: FormationParticle[];
    ambient: AmbientParticle[];
    orbitals: OrbitalParticle[];
    rafId: number;
    startTime: number;
  } | null>(null);

  const perimeterRef = useRef<{ x: number; y: number }[]>([]);
  const [overlayAlpha, setOverlayAlpha] = useState(0);
  const [introOpacity, setIntroOpacity] = useState(1);

  const initParticles = useCallback((cw: number, ch: number) => {
    const targets = sampleKnightPoints(FORMATION_COUNT, cw, ch);
    const formation = targets.map(t => makeFormationParticle(t.x, t.y, cw, ch));
    formation.forEach(p => { p.sx = p.x; p.sy = p.y; });
    const ambient = Array.from({ length: AMBIENT_COUNT }, () => makeAmbientParticle(cw, ch));
    const orbitals = Array.from({ length: ORBITAL_COUNT }, (_, i) => makeOrbital(i, cw, ch));
    return { formation, ambient, orbitals };
  }, []);

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
    perimeterRef.current = sampleKnightPerimeter(600, cw, ch);
    stateRef.current = {
      formation, ambient, orbitals,
      rafId: 0,
      startTime: performance.now(),
    };

    const loop = () => {
      if (!mounted || !stateRef.current) return;
      const t = (performance.now() - stateRef.current.startTime) / 1000;

      if (t < PHASE.SOLIDIFY_END) {
        drawPhase1to4(ctx, cw, ch, t,
          stateRef.current.formation,
          stateRef.current.ambient,
          stateRef.current.orbitals);
      } else if (t < PHASE.SETTLE_END) {
        ctx.clearRect(0, 0, cw, ch);
        ctx.fillStyle = '#0F0D0B';
        ctx.fillRect(0, 0, cw, ch);
        drawPhase5to7(ctx, cw, ch, t, perimeterRef.current, stateRef.current.orbitals);
      }

      // Phase 6: title fade-in (11-14s)
      if (t >= PHASE.OUTLINE_END && t < PHASE.TITLE_END) {
        const ta = clamp((t - PHASE.OUTLINE_END) / (PHASE.TITLE_END - PHASE.OUTLINE_END), 0, 1);
        setOverlayAlpha(easeOut(ta));
      } else if (t >= PHASE.TITLE_END && t < PHASE.HOLD_END) {
        setOverlayAlpha(1);
      } else if (t >= PHASE.HOLD_END) {
        // Simple fade-out of the entire intro
        const fadeT = clamp((t - PHASE.HOLD_END) / (PHASE.SETTLE_END - PHASE.HOLD_END), 0, 1);
        setIntroOpacity(1 - easeInOut(fadeT));
        setOverlayAlpha(1 - easeInOut(fadeT));
      }

      if (t >= PHASE.SETTLE_END) {
        if (mounted) onComplete();
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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, opacity: introOpacity }}>
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
          zIndex: 10,
        }}
      >
        Skip
      </button>

      {/* GAMBIT cinematic title — fades in during phase 6 */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        opacity: overlayAlpha,
        pointerEvents: 'none',
      }}>
        <div style={{
          fontFamily: 'var(--font-inter, Inter, sans-serif)',
          fontSize: 'clamp(72px, 14vw, 140px)',
          fontWeight: 700,
          letterSpacing: '0.25em',
          lineHeight: 1,
          textAlign: 'center',
          background: 'linear-gradient(135deg, #FFFFFF 40%, #C4965A 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          textShadow: 'none',
          filter: 'drop-shadow(0 0 40px rgba(196,150,90,0.5))',
        }}>
          GAMBIT
        </div>
      </div>
    </div>
  );
}
