import { Piece } from '@/components/chess/Piece';
import { cn } from '@/lib/design/cn';
import { heroSquares, type HeroSquareFill } from '../heroBoard';
import { HERO_POSITION } from '../landingContent';

const FILLS: Record<HeroSquareFill, string> = {
    light: 'bg-board-light',
    dark: 'bg-board-dark',
    'last-light': 'bg-board-hero-last-light',
    'last-dark': 'bg-board-hero-last-dark',
};

const SQUARES = heroSquares(HERO_POSITION);

/**
 * The landing board (Home.dc.html): a static King's Gambit position with the last move (h2–h4)
 * in gold. A Server Component with the mockup's own structure (a grid of 64 square cells, each
 * piece at 86% of its cell), so it costs the landing page no client JavaScript.
 */
export function HeroBoard() {
    return (
        <>
            <div className="[container-type:inline-size]">
                <div
                    role="img"
                    aria-label={HERO_POSITION.label}
                    className="grid grid-cols-[repeat(8,minmax(0,1fr))] overflow-hidden rounded-12 border-[10px] border-board-frame shadow-board-hero"
                >
                    {SQUARES.map(({ square, fill, piece }) => (
                        <span
                            key={square}
                            data-square={square}
                            className={cn('flex aspect-square items-center justify-center', FILLS[fill])}
                        >
                            {piece && (
                                <Piece
                                    color={piece.color}
                                    type={piece.type}
                                    className="h-[86%] w-[86%] drop-shadow-piece"
                                />
                            )}
                        </span>
                    ))}
                </div>
            </div>
            <span className="text-center text-[13px] text-ink-muted">{HERO_POSITION.caption}</span>
        </>
    );
}
