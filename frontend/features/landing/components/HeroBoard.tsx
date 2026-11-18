import { Board } from '@/components/chess/Board';
import { HERO_POSITION } from '../landingContent';

/** The landing board: a static King's Gambit position with the last move (h2–h4) highlighted. */
export function HeroBoard() {
    return (
        <>
            <Board
                fen={HERO_POSITION.fen}
                lastMove={HERO_POSITION.lastMove}
                frame="hero"
                animate={false}
                label={HERO_POSITION.label}
            />
            <span className="text-center text-[13px] text-ink-muted">{HERO_POSITION.caption}</span>
        </>
    );
}
