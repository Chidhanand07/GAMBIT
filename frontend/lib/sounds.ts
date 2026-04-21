// Preload all audio files for instant playback
function makeAudio(src: string): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    const a = new Audio(src);
    a.preload = 'auto';
    return a;
}

const SFX = {
    move:       makeAudio('/audio/move-self.mp3'),
    capture:    makeAudio('/audio/capture.mp3'),
    castle:     makeAudio('/audio/castle.mp3'),
    check:      makeAudio('/audio/check.mp3'),
    checkmate:  makeAudio('/audio/checkmate.mp3'),
    matchstart: makeAudio('/audio/matchstart.mp3'),
    promote:    makeAudio('/audio/promote.mp3'),
};

function play(key: keyof typeof SFX) {
    try {
        const sfx = SFX[key];
        if (!sfx) return;
        sfx.currentTime = 0;
        sfx.play().catch(() => {/* autoplay policy — ignore */});
    } catch { /* ignore */ }
}

export function playMoveSound()       { play('move'); }
export function playCaptureSound()    { play('capture'); }
export function playCastleSound()     { play('castle'); }
export function playCheckSound()      { play('check'); }
export function playCheckmateSound()  { play('checkmate'); }
export function playPromoteSound()    { play('promote'); }
export function playGameStartSound()  { play('matchstart'); }

export function playGameEndSound(won: boolean) {
    // Generic end (resign, timeout, draw) — reuse checkmate sound for loss, move for draw
    play('checkmate');
}
