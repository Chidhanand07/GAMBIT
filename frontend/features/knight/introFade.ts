import { PHASE, clamp, easeInOut, easeOut } from './introParticles';

/**
 * Phase 6 title fade-in (11–14 s), hold (14–16 s), then fade the whole intro out (16–17.5 s).
 * Calls the setters exactly as the intro loop did; before 11 s nothing is set.
 */
export function applyIntroFade(
    t: number,
    setOverlayAlpha: (v: number) => void,
    setIntroOpacity: (v: number) => void,
): void {
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
}
