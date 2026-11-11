import { useEffect, useState } from 'react';
import { Chess } from 'chess.js';

// ── Animated demo board ───────────────────────────────────────────────────────
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const DEMO_MOVES = ['e2e4', 'e7e5', 'f2f4', 'e5f4', 'g1f3', 'g7g5', 'h2h4', 'g5g4'];
const MOVE_INTERVAL_MS = 900;
const RESET_DELAY_MS = 3000;
const GLYPHS: Record<string, string> = {
    wK: '♔',
    wQ: '♕',
    wR: '♖',
    wB: '♗',
    wN: '♘',
    wP: '♙',
    bK: '♚',
    bQ: '♛',
    bR: '♜',
    bB: '♝',
    bN: '♞',
    bP: '♟',
};
const FILES = [0, 1, 2, 3, 4, 5, 6, 7];
const RANKS = [7, 6, 5, 4, 3, 2, 1, 0];
const FILE_A_CHAR_CODE = 97;

type Square = ReturnType<Chess['board']>[number][number];
interface LastMove {
    from: string;
    to: string;
}

function squareBackground(isLight: boolean, isLast: boolean) {
    if (isLast) return isLight ? 'rgba(196,150,90,0.6)' : 'rgba(196,150,90,0.45)';
    return isLight ? '#F0D9B5' : '#B58863';
}

function DemoPiece({ piece }: { piece: NonNullable<Square> }) {
    const white = piece.color === 'w';
    return (
        <span
            className="select-none"
            style={{
                fontSize: 'clamp(14px,4.5vw,38px)',
                lineHeight: 1,
                fontFamily: 'serif',
                color: white ? '#FFFFFF' : '#1A1A1A',
                textShadow: white
                    ? '0 1px 3px rgba(0,0,0,0.7),0 0 1px rgba(0,0,0,0.5)'
                    : '0 1px 0 rgba(255,255,255,0.2)',
                filter: white ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' : 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))',
            }}
        >
            {GLYPHS[`${piece.color}${piece.type.toUpperCase()}`]}
        </span>
    );
}

function DemoSquare({ piece, isLight, isLast }: { piece: Square; isLight: boolean; isLast: boolean }) {
    return (
        <div
            style={{ background: squareBackground(isLight, isLast) }}
            className="relative flex items-center justify-center"
        >
            {piece && <DemoPiece piece={piece} />}
        </div>
    );
}

/** Plays the King's Gambit on a loop: one move every 900 ms, reset 3 s after the last move. */
function useDemoGame() {
    const [fen, setFen] = useState(START_FEN);
    const [lastMove, setLastMove] = useState<LastMove | null>(null);

    useEffect(() => {
        const g = new Chess();
        let idx = 0;
        const tick = () => {
            if (idx < DEMO_MOVES.length) {
                const uci = DEMO_MOVES[idx];
                const from = uci.slice(0, 2),
                    to = uci.slice(2, 4);
                g.move({ from, to });
                setFen(g.fen());
                setLastMove({ from, to });
                idx++;
            } else {
                setTimeout(() => {
                    g.reset();
                    setFen(g.fen());
                    setLastMove(null);
                    idx = 0;
                }, RESET_DELAY_MS);
            }
        };
        const timer = setInterval(tick, MOVE_INTERVAL_MS);
        return () => clearInterval(timer);
    }, []);

    return { fen, lastMove };
}

export function AnimatedBoard() {
    const { fen, lastMove } = useDemoGame();

    const board = new Chess();
    try {
        board.load(fen);
    } catch {
        /* keep the start position if the FEN does not load */
    }
    const squares = board.board();

    return (
        <div className="relative w-full max-w-[360px] mx-auto">
            <div className="board-outer-frame p-[3px]">
                <div className="board-inner-frame w-full aspect-square grid grid-cols-8 grid-rows-8">
                    {RANKS.map((rank) =>
                        FILES.map((file) => {
                            const sq = `${String.fromCharCode(FILE_A_CHAR_CODE + file)}${rank + 1}`;
                            const isLast = lastMove?.from === sq || lastMove?.to === sq;
                            return (
                                <DemoSquare
                                    key={sq}
                                    piece={squares[7 - rank][file]}
                                    isLight={(file + rank) % 2 === 1}
                                    isLast={isLast}
                                />
                            );
                        }),
                    )}
                </div>
            </div>
            <p className="text-center text-xs mt-3 tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                King&apos;s Gambit · 1. e4 e5 2. f4 exf4 3. Nf3 g5 4. h4
            </p>
        </div>
    );
}
