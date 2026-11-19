// Deterministic pseudo-random numbers for the intro splash (design/HANDOFF.md §4.3).
// Pure and seed-indexed, so the server and the client compute the same particles; never Math.random.

/** `frac(sin(n·91.7 + 13.3) · 43758.5453)`: a value in [0, 1) fixed for each `n`. */
export function rnd(n: number): number {
    const x = Math.sin(n * 91.7 + 13.3) * 43758.5453;
    return x - Math.floor(x);
}

/** One splash particle, as the CSS custom properties `.gsp` reads (`--x`, `--y`, `--s`, `--d`). */
export interface SplashParticle {
    /** Start offset from the centre, e.g. "-412px". */
    x: string;
    y: string;
    /** Diameter, e.g. "3.4px". */
    s: string;
    /** Animation delay, e.g. "0.87s". */
    d: string;
}

/** Seed offsets per property, as in Home.dc.html (`rnd(i)`, `rnd(i + 200)`, …). */
const SEED = { angle: 0, radius: 200, size: 400, delay: 600 } as const;
/** Particles start on a ring 260–780px out, squashed to 70% vertically. */
const MIN_RADIUS = 260;
const RADIUS_SPREAD = 520;
const VERTICAL_SQUASH = 0.7;
/** 2–5px dots; delays staggered up to 1.4s. */
const MIN_SIZE = 2;
const SIZE_SPREAD = 3;
const MAX_DELAY_S = 1.4;

export const SPLASH_PARTICLE_COUNT = 90;

/** The `i`-th particle (Home.dc.html `renderVals`, `v.sparks`). */
export function splashParticle(i: number): SplashParticle {
    const angle = rnd(i + SEED.angle) * Math.PI * 2;
    const radius = MIN_RADIUS + rnd(i + SEED.radius) * RADIUS_SPREAD;
    return {
        x: `${Math.round(Math.cos(angle) * radius)}px`,
        y: `${Math.round(Math.sin(angle) * radius * VERTICAL_SQUASH)}px`,
        s: `${(MIN_SIZE + rnd(i + SEED.size) * SIZE_SPREAD).toFixed(1)}px`,
        d: `${(rnd(i + SEED.delay) * MAX_DELAY_S).toFixed(2)}s`,
    };
}

/** All splash particles, in order. */
export function splashParticles(count: number = SPLASH_PARTICLE_COUNT): SplashParticle[] {
    return Array.from({ length: count }, (_, i) => splashParticle(i));
}

/** Wordmark letter-spacing at the start and end of `.gsw` (Home.dc.html), in em. */
export const WORDMARK_SPACING_EM = { from: 0.7, to: 0.3 } as const;

export interface WordmarkLetter {
    letter: string;
    /** Horizontal offset at the start of the animation, in em, relative to the final layout. */
    offsetEm: number;
}

/**
 * Per-letter start offsets that reproduce the `.gsw` letter-spacing animation with transforms.
 * In a centred line where every letter carries trailing spacing `s`, letter `i` of `n` sits at
 * `const + (i − n/2)·s`, so widening `s` by Δ moves it by `(i − n/2)·Δ`, and an eased spacing
 * equals the same easing on that translate.
 */
export function wordmarkLetters(word: string): WordmarkLetter[] {
    const letters = Array.from(word);
    const delta = WORDMARK_SPACING_EM.from - WORDMARK_SPACING_EM.to;
    const centre = letters.length / 2;
    // Rounded so float noise (e.g. -1.2000000000000002) never reaches the style attribute.
    return letters.map((letter, i) => ({ letter, offsetEm: Math.round((i - centre) * delta * 1000) / 1000 }));
}
