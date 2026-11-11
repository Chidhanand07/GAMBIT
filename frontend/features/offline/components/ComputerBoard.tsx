import type { Chess, Square } from 'chess.js';
import Piece from '@/components/ui/Piece';
import { FILES, RANKS } from '@/lib/chess/board';
import type { LastMove, Side } from '../types';

interface SquareProps {
    square: Square;
    file: string;
    rank: string;
    game: Chess;
    isSelected: boolean;
    isLegal: boolean;
    isLast: boolean;
    showRank: boolean;
    showFile: boolean;
    onClick: (square: string) => void;
}

function SquareMarkers({ isLast, isSelected, isCheck }: { isLast: boolean; isSelected: boolean; isCheck: boolean }) {
    return (
        <>
            {isLast && <div className="absolute inset-0 bg-yellow-400/30 pointer-events-none" />}
            {isSelected && <div className="absolute inset-0 bg-amber-300/45 pointer-events-none" />}
            {isCheck && <div className="absolute inset-0 bg-red-500/60 pointer-events-none" />}
        </>
    );
}

interface CoordProps {
    showRank: boolean;
    showFile: boolean;
    rank: string;
    file: string;
    isLight: boolean;
}

function CoordLabels({ showRank, showFile, rank, file, isLight }: CoordProps) {
    const style = { color: isLight ? '#B58863' : '#F0D9B5' };
    return (
        <>
            {showRank && (
                <span
                    className="absolute top-0.5 left-0.5 text-[10px] font-bold opacity-70 z-10 select-none"
                    style={style}
                >
                    {rank}
                </span>
            )}
            {showFile && (
                <span
                    className="absolute bottom-0.5 right-1 text-[10px] font-bold opacity-70 z-10 select-none"
                    style={style}
                >
                    {file}
                </span>
            )}
        </>
    );
}

function ComputerSquare({
    square,
    file,
    rank,
    game,
    isSelected,
    isLegal,
    isLast,
    showRank,
    showFile,
    onClick,
}: SquareProps) {
    const piece = game.get(square);
    const isLight = (FILES.indexOf(file) + RANKS.indexOf(rank)) % 2 === 0;
    const isCheck = piece?.type === 'k' && piece?.color === game.turn() && game.inCheck();
    return (
        <div
            onClick={() => onClick(square)}
            className={`w-full aspect-square flex items-center justify-center relative cursor-pointer ${isLight ? 'bg-board-light' : 'bg-board-dark'}`}
        >
            <SquareMarkers isLast={isLast} isSelected={isSelected} isCheck={isCheck} />
            <CoordLabels showRank={showRank} showFile={showFile} rank={rank} file={file} isLight={isLight} />

            {piece && (
                <div className="w-full h-full flex items-center justify-center z-20">
                    <Piece color={piece.color} type={piece.type} />
                </div>
            )}

            {isLegal && (
                <div
                    className={`absolute z-30 pointer-events-none ${piece ? 'w-full h-full border-4 border-black/25 rounded-full' : 'w-1/3 h-1/3 bg-black/25 rounded-full'}`}
                />
            )}
        </div>
    );
}

interface BoardProps {
    game: Chess;
    playerColor: Side;
    selectedSquare: string | null;
    legalMoves: string[];
    lastMove: LastMove | null;
    onSquareClick: (square: string) => void;
}

/** 8×8 grid oriented with the player's colour at the bottom. */
export function ComputerBoard({ game, playerColor, selectedSquare, legalMoves, lastMove, onSquareClick }: BoardProps) {
    const orderedRanks = playerColor === 'w' ? RANKS : [...RANKS].reverse();
    const orderedFiles = playerColor === 'w' ? FILES : [...FILES].reverse();
    return (
        <div className="grid grid-cols-8 grid-rows-8 w-full aspect-square">
            {orderedRanks.map((rank) =>
                orderedFiles.map((file) => {
                    const square = (file + rank) as Square;
                    return (
                        <ComputerSquare
                            key={square}
                            square={square}
                            file={file}
                            rank={rank}
                            game={game}
                            isSelected={selectedSquare === square}
                            isLegal={legalMoves.includes(square)}
                            isLast={!!lastMove && (lastMove.from === square || lastMove.to === square)}
                            showRank={file === orderedFiles[0]}
                            showFile={rank === orderedRanks[orderedRanks.length - 1]}
                            onClick={onSquareClick}
                        />
                    );
                }),
            )}
        </div>
    );
}
