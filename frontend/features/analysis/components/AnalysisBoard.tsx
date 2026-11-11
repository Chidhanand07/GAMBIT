import type { Chess, Move } from 'chess.js';
import Piece from '@/components/ui/Piece';
import { coordsToSq } from '@/lib/chess/board';

const ASCENDING = [0, 1, 2, 3, 4, 5, 6, 7];
const DESCENDING = [7, 6, 5, 4, 3, 2, 1, 0];
const LIGHT = '#F0D9B5';
const DARK = '#B58863';

function squareBackground(isLight: boolean, isSelected: boolean, isLastMove: boolean) {
    if (isSelected) return 'rgba(246,246,105,0.6)';
    if (isLastMove) return isLight ? 'rgba(205,163,80,0.55)' : 'rgba(196,150,70,0.55)';
    return isLight ? LIGHT : DARK;
}

const labelStyle = (isLight: boolean) => ({ color: isLight ? DARK : LIGHT, opacity: 0.8 });

type BoardPiece = ReturnType<Chess['board']>[number][number];

interface SquareProps {
    sq: string;
    piece: BoardPiece;
    isLight: boolean;
    background: string;
    isTarget: boolean;
    rankLabel: number | null;
    fileLabel: string | null;
    onClick: (square: string) => void;
}

function AnalysisSquare({ sq, piece, isLight, background, isTarget, rankLabel, fileLabel, onClick }: SquareProps) {
    return (
        <div
            onClick={() => onClick(sq)}
            className="relative flex items-center justify-center cursor-pointer"
            style={{ background }}
        >
            {rankLabel !== null && (
                <span
                    className="absolute top-0.5 left-0.5 text-[9px] font-semibold pointer-events-none z-10 select-none"
                    style={labelStyle(isLight)}
                >
                    {rankLabel}
                </span>
            )}
            {fileLabel !== null && (
                <span
                    className="absolute bottom-0.5 right-0.5 text-[9px] font-semibold pointer-events-none z-10 select-none"
                    style={labelStyle(isLight)}
                >
                    {fileLabel}
                </span>
            )}
            {isTarget && !piece && (
                <div
                    className="w-[28%] h-[28%] rounded-full pointer-events-none"
                    style={{ background: 'rgba(0,0,0,0.18)' }}
                />
            )}
            {isTarget && piece && (
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ boxShadow: 'inset 0 0 0 4px rgba(0,0,0,0.22)' }}
                />
            )}
            {piece && <Piece color={piece.color} type={piece.type} />}
        </div>
    );
}

interface BoardProps {
    game: Chess;
    isFlipped: boolean;
    selectedSquare: string | null;
    legalTargets: string[];
    lastMove: Move | undefined;
    onSquareClick: (square: string) => void;
}

/** The 8×8 analysis board with coordinates, selection, legal targets and last-move highlight. */
export function AnalysisBoard({ game, isFlipped, selectedSquare, legalTargets, lastMove, onSquareClick }: BoardProps) {
    const boardState = game.board();
    const ranks = isFlipped ? ASCENDING : DESCENDING;
    const files = isFlipped ? DESCENDING : ASCENDING;
    const edge = isFlipped ? 7 : 0;
    const isLastMove = (sq: string) => lastMove?.from === sq || lastMove?.to === sq;
    return (
        <div
            className="relative"
            style={{ width: 'min(calc(100vh - 200px), calc(100vw - 380px), 580px)', aspectRatio: '1' }}
        >
            <div className="board-outer-frame w-full h-full p-[3px]">
                <div className="board-inner-frame w-full h-full grid grid-cols-8 grid-rows-8">
                    {ranks.map((rank) =>
                        files.map((file) => {
                            const sq = coordsToSq(file, rank);
                            const isLight = (file + rank) % 2 === 1;
                            return (
                                <AnalysisSquare
                                    key={sq}
                                    sq={sq}
                                    piece={boardState[7 - rank][file]}
                                    isLight={isLight}
                                    background={squareBackground(isLight, selectedSquare === sq, isLastMove(sq))}
                                    isTarget={legalTargets.includes(sq)}
                                    rankLabel={file === edge ? rank + 1 : null}
                                    fileLabel={rank === edge ? sq[0] : null}
                                    onClick={onSquareClick}
                                />
                            );
                        }),
                    )}
                </div>
            </div>
        </div>
    );
}
