'use client';

import { useCallback, useEffect, useState, type AnimationEvent, type CSSProperties } from 'react';
import { KnightGlyph } from '@/components/ui/KnightMark';
import { splashParticles, wordmarkLetters } from '@/lib/design/seededRandom';

/** sessionStorage key: the splash plays once per browser session. */
export const INTRO_SEEN_KEY = 'gambit_intro_seen';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
/** The overlay's own fade-out keyframe (`.gsplash` in app/globals.css); it ends the splash. */
const FADE_OUT_ANIMATION = 'gsout';
const WORDMARK = 'GAMBIT';

const PARTICLES = splashParticles();
const LETTERS = wordmarkLetters(WORDMARK);

const prefersReducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches;

/** True the first time in this session (and records the visit); storage errors count as seen. */
function firstVisitThisSession(): boolean {
    try {
        if (window.sessionStorage.getItem(INTRO_SEEN_KEY)) return false;
        window.sessionStorage.setItem(INTRO_SEEN_KEY, '1');
        return true;
    } catch {
        return false;
    }
}

/** Escape skips the splash, like the Skip button. */
function useEscapeKey(onEscape: () => void) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onEscape();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onEscape]);
}

/**
 * "GAMBIT" closing from .7em to .3em letter-spacing (Home.dc.html `.gsw`), drawn with the final
 * spacing and one transform per letter (`--o`, its offset in em at the start; F-113): the same
 * frames, but composited, so the wordmark never relayouts, never shifts and never becomes the
 * page's largest text.
 */
function Wordmark() {
    return (
        <span role="img" aria-label={WORDMARK} className="gsw pl-[0.3em] font-display text-[64px] font-bold text-ink">
            {LETTERS.map(({ letter, offsetEm }, i) => (
                <span key={i} aria-hidden="true" className="gsl" style={{ '--o': `${offsetEm}em` } as CSSProperties}>
                    {letter}
                </span>
            ))}
        </span>
    );
}

function SplashOverlay({ onDone }: { onDone: () => void }) {
    useEscapeKey(onDone);
    const onAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && e.animationName === FADE_OUT_ANIMATION) onDone();
    };
    return (
        <div className="gsplash" role="presentation" data-testid="intro-splash" onAnimationEnd={onAnimationEnd}>
            {PARTICLES.map((p, i) => (
                <span
                    key={i}
                    className="gsp"
                    style={{ '--x': p.x, '--y': p.y, '--s': p.s, '--d': p.d } as CSSProperties}
                />
            ))}
            <div className="relative flex flex-col items-center gap-[18px]">
                <span className="gsk">
                    <KnightGlyph width={150} height={180} tone="accent" className="inline align-baseline drop-shadow-splash-knight" />
                </span>
                <Wordmark />
                <span className="gst text-[16px] tracking-[0.04em] text-ink-muted">Chess, perfected.</span>
            </div>
            <button
                type="button"
                onClick={onDone}
                className="absolute right-5 top-5 min-h-[44px] rounded-pill border-1.5 border-line bg-splash-skip px-5 text-[14px] font-semibold text-ink"
            >
                Skip
            </button>
        </div>
    );
}

/**
 * The landing intro (design/HANDOFF.md §4.3, Home.dc.html): 90 gold particles converge, the
 * knight, wordmark and tagline follow, then the overlay fades out. Client-only: it mounts after
 * hydration, so the page underneath renders (and paints) first. Once per session, never under
 * reduced motion; Skip or Escape ends it, "Replay intro" plays it again.
 */
export default function IntroSplash() {
    // Each play gets a fresh key so the CSS animations restart from zero.
    const [run, setRun] = useState<number | null>(null);
    const stop = useCallback(() => setRun(null), []);

    useEffect(() => {
        if (!prefersReducedMotion() && firstVisitThisSession()) setRun(1);
    }, []);

    const replay = () => {
        if (!prefersReducedMotion()) setRun((r) => (r ?? 0) + 1);
    };

    return (
        <>
            {run !== null && <SplashOverlay key={run} onDone={stop} />}
            {/* Drawn 40px tall as in the mockup; the ::before strip makes the hit area 44px (F-113). */}
            <button
                type="button"
                onClick={replay}
                className="fixed bottom-5 left-5 z-20 min-h-[40px] rounded-pill border-1 border-line bg-surface-header px-4 text-[13px] font-semibold text-ink-muted before:absolute before:inset-x-0 before:-inset-y-[3px] before:content-['']"
            >
                Replay intro
            </button>
        </>
    );
}
