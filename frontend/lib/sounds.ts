// Game sounds. The clips are created (and start preloading) the first time any sound plays, not
// when this module loads: every page imports it through the settings provider, and a visitor of
// the landing page should not download 77 KB of audio they never hear (F-111).

const SOURCES = {
    move:       '/audio/move-self.mp3',
    capture:    '/audio/capture.mp3',
    castle:     '/audio/castle.mp3',
    check:      '/audio/check.mp3',
    checkmate:  '/audio/checkmate.mp3',
    matchstart: '/audio/matchstart.mp3',
    promote:    '/audio/promote.mp3',
} as const;

type SoundKey = keyof typeof SOURCES;

let clips: Record<SoundKey, HTMLAudioElement> | null = null;

/** Every clip, created with `preload = 'auto'` on first use; null outside a browser. */
function loadedClips(): Record<SoundKey, HTMLAudioElement> | null {
    if (clips || typeof window === 'undefined') return clips;
    const made = {} as Record<SoundKey, HTMLAudioElement>;
    for (const key of Object.keys(SOURCES) as SoundKey[]) {
        const audio = new Audio(SOURCES[key]);
        audio.preload = 'auto';
        made[key] = audio;
    }
    clips = made;
    return clips;
}

/** The "Move sounds" setting (features/settings/SettingsProvider); on until it says otherwise. */
let soundsEnabled = true;

/** Turns every game sound on or off app-wide. */
export function setSoundsEnabled(enabled: boolean) {
    soundsEnabled = enabled;
}

function play(key: SoundKey, force = false) {
    if (!soundsEnabled && !force) return;
    try {
        const sfx = loadedClips()?.[key];
        if (!sfx) return;
        sfx.currentTime = 0;
        sfx.play().catch(() => {/* autoplay policy — ignore */});
    } catch { /* ignore */ }
}

export function playMoveSound()       { play('move'); }
/** The Settings live preview's move click: follows the unsaved draft, not the saved setting. */
export function playPreviewMoveSound() { play('move', true); }
export function playCaptureSound()    { play('capture'); }
export function playCastleSound()     { play('castle'); }
export function playCheckSound()      { play('check'); }
export function playCheckmateSound()  { play('checkmate'); }
export function playPromoteSound()    { play('promote'); }
export function playGameStartSound()  { play('matchstart'); }

/**
 * End-of-game sound. There is no dedicated win clip, so a win plays the bright promotion
 * chime and anything else (loss, draw, abort) the heavier checkmate clip (F17: `won` used
 * to be ignored, so every ending sounded like a loss).
 */
export function playGameEndSound(won: boolean) {
    play(won ? 'promote' : 'checkmate');
}
