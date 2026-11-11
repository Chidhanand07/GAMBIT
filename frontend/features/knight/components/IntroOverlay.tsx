/** Skip button (always visible) and the GAMBIT title that fades in during phase 6. */
export function IntroOverlay({ overlayAlpha, onSkip }: { overlayAlpha: number; onSkip: () => void }) {
    return (
        <>
            {/* Skip button — always visible */}
            <button
                onClick={onSkip}
                style={{
                    position: 'absolute',
                    top: 24,
                    right: 24,
                    background: 'rgba(255,255,255,0.08)',
                    border: '0.5px solid rgba(255,255,255,0.2)',
                    color: 'rgba(255,255,255,0.6)',
                    borderRadius: 8,
                    padding: '6px 16px',
                    fontSize: 13,
                    cursor: 'pointer',
                    backdropFilter: 'blur(4px)',
                    zIndex: 10,
                }}
            >
                Skip
            </button>

            {/* GAMBIT cinematic title — fades in during phase 6 */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: overlayAlpha,
                    pointerEvents: 'none',
                }}
            >
                <div
                    style={{
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
                    }}
                >
                    GAMBIT
                </div>
            </div>
        </>
    );
}
