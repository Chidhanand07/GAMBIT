'use client';

import { useState, type CSSProperties } from 'react';
import { Board } from '@/components/chess/Board';
import { playPreviewMoveSound } from '@/lib/sounds';
import { boardPrefsOf, type UserSettings } from '../model';
import { PreviewCard } from './PreviewCard';

/** The mockup's position: 1…e5 played, White to move (before) and after 2.e4. */
const BEFORE = 'rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR';
const AFTER = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR';
const KNIGHT_TARGETS = ['f3', 'h3'] as const;

/** The draft's board settings on a live board: theme, coordinates, highlights, slide speed and sound. */
export function BoardPreview({ settings }: { settings: UserSettings }) {
    const [moved, setMoved] = useState(false);
    const prefs = boardPrefsOf(settings);
    const slide = { '--piece-slide-duration': `${prefs.slideMs}ms` } as CSSProperties;
    const play = () => {
        setMoved((m) => !m);
        if (prefs.sound) playPreviewMoveSound();
    };
    return (
        <PreviewCard>
            <div style={slide}>
                <Board
                    fen={moved ? AFTER : BEFORE}
                    frame="preview"
                    theme={prefs.theme}
                    animate={prefs.animate}
                    showCoordinates={prefs.showCoordinates}
                    lastMove={
                        prefs.highlightLastMove ? (moved ? { from: 'e2', to: 'e4' } : { from: 'e7', to: 'e5' }) : null
                    }
                    selectedSquare={prefs.highlightLegalMoves ? 'g1' : null}
                    legalDestinations={prefs.highlightLegalMoves ? KNIGHT_TARGETS : []}
                    label="Board preview"
                />
            </div>
            <button
                type="button"
                onClick={play}
                className="min-h-[44px] rounded-pill border-0 bg-accent text-[15px] font-bold text-on-accent"
            >
                {moved ? 'Undo move' : 'Play e2 to e4'}
            </button>
            <span className="text-[13px] text-ink-muted">
                Try it: the move uses your animation speed, highlights and sound.
            </span>
        </PreviewCard>
    );
}
