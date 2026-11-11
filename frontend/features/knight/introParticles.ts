// Particle model, timing and easing for components/ui/KnightIntro.tsx.
import { sampleKnightPoints } from './introSampling';

// ── Timing constants ──────────────────────────────────────────────────────
export const PHASE = {
    DRIFT_END: 2.0,
    ATTRACT_END: 5.5,
    LOCK_END: 6.5,
    SOLIDIFY_END: 8.5,
    OUTLINE_END: 11.0,
    TITLE_END: 14.0, // GAMBIT title fully visible
    HOLD_END: 16.0, // hold for 2s, then fade begins
    SETTLE_END: 17.5, // animation fully done, call onComplete
} as const;

export const ACCENT_R = 196,
    ACCENT_G = 150,
    ACCENT_B = 90;
const FORMATION_COUNT = 400;
const AMBIENT_COUNT = 50;
export const ORBITAL_COUNT = 3;

// ── Easing ────────────────────────────────────────────────────────────────
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ── Particle types ────────────────────────────────────────────────────────
export interface FormationParticle {
    x: number;
    y: number;
    sx: number;
    sy: number;
    tx: number;
    ty: number;
    vx: number;
    vy: number;
    radius: number;
    alpha: number;
    delay: number;
    breathPhase: number;
}

export interface AmbientParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    alpha: number;
    maxAlpha: number;
}

export interface OrbitalParticle {
    angle: number;
    speed: number;
    a: number;
    b: number;
    tilt: number;
    radius: number;
    trailLength: number;
}

export interface Point {
    x: number;
    y: number;
}

// ── Factory functions ─────────────────────────────────────────────────────
function makeFormationParticle(target: Point, cw: number, ch: number): FormationParticle {
    const angle = Math.random() * Math.PI * 2;
    const dist = 200 + Math.random() * 400;
    return {
        x: cw / 2 + Math.cos(angle) * dist,
        y: ch / 2 + Math.sin(angle) * dist,
        sx: 0,
        sy: 0,
        tx: target.x,
        ty: target.y,
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

/** Formation particles start scattered and fly to points inside the knight silhouette. */
export function initParticles(cw: number, ch: number) {
    const targets = sampleKnightPoints(FORMATION_COUNT, cw, ch);
    const formation = targets.map((t) => makeFormationParticle(t, cw, ch));
    formation.forEach((p) => {
        p.sx = p.x;
        p.sy = p.y;
    });
    const ambient = Array.from({ length: AMBIENT_COUNT }, () => makeAmbientParticle(cw, ch));
    const orbitals = Array.from({ length: ORBITAL_COUNT }, (_, i) => makeOrbital(i, cw, ch));
    return { formation, ambient, orbitals };
}
