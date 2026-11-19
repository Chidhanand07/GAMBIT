'use client';

import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Square } from 'chess.js';
import { cn } from '@/lib/design/cn';
import {
    assignPieceIds,
    BOARD_SIZE,
    gridPosition,
    parsePlacement,
    squaresFor,
    type BoardOrientation,
    type PieceColor,
    type PieceType,
    type PlacedPiece,
} from './boardModel';
import { BoardSquare, type SquareMark } from './BoardSquare';
import { FRAMES, THEMES, type BoardFrame, type BoardTheme } from './boardStyles';
import { Piece, pieceName } from './Piece';

export interface BoardMove {
    from: Square;
    to: Square;
}

export interface BoardProps {
    /** The position: a full FEN or just its piece-placement field. */
    fen: string;
    /** Which side is at the bottom. Default white. */
    orientation?: BoardOrientation;
    selectedSquare?: Square | null;
    /** Legal destinations of the selected piece: a dot on empty squares, a capture tint on pieces. */
    legalDestinations?: readonly Square[];
    lastMove?: BoardMove | null;
    /** The king in check, if any. */
    checkSquare?: Square | null;
    /** Called with the clicked square; squares are buttons only when this is set. */
    onSquareClick?: (square: Square) => void;
    showCoordinates?: boolean;
    theme?: BoardTheme;
    frame?: BoardFrame;
    /** Slide pieces between squares (420ms); off under reduced motion regardless. */
    animate?: boolean;
    /** Accessible name of the board. */
    label?: string;
    /** Overlays drawn above the pieces (promotion picker, game-over tint). */
    children?: ReactNode;
    className?: string;
}

const CELL_PERCENT = 100 / BOARD_SIZE;

/** Keeps piece ids across positions so moved pieces slide (derived state, updated during render). */
function usePlacedPieces(fen: string): PlacedPiece[] {
    const [state, setState] = useState(() => ({ fen, pieces: assignPieceIds([], parsePlacement(fen)) }));
    if (state.fen !== fen) {
        const next = { fen, pieces: assignPieceIds(state.pieces, parsePlacement(fen)) };
        setState(next);
        return next.pieces;
    }
    return state.pieces;
}

interface PieceSlotProps {
    color: PieceColor;
    type: PieceType;
    col: number;
    row: number;
    animate: boolean;
}

const PieceSlot = memo(function PieceSlot({ color, type, col, row, animate }: PieceSlotProps) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                'g-piece-slot pointer-events-none absolute flex h-[12.5%] w-[12.5%] items-center justify-center',
                !animate && 'g-instant',
            )}
            style={{ left: `${col * CELL_PERCENT}%`, top: `${row * CELL_PERCENT}%` }}
        >
            <Piece color={color} type={type} className="h-[86%] w-[86%] drop-shadow-piece" />
        </span>
    );
});

const HERO_LAST_FILL = { light: 'bg-board-hero-last-light', dark: 'bg-board-hero-last-dark' } as const;

function markFor(sq: Square, props: BoardProps, occupied: boolean): SquareMark {
    if (props.legalDestinations?.includes(sq) && occupied) return 'capture';
    if (props.selectedSquare === sq) return 'selected';
    if (props.checkSquare === sq) return 'check';
    if (props.lastMove?.from === sq || props.lastMove?.to === sq) return 'last';
    return 'none';
}

/** Square fill and tint; Home.dc.html paints the hero board's last move as solid gold squares instead. */
function fillAndMark(mark: SquareMark, light: boolean, theme: BoardTheme, frame: BoardFrame) {
    const tone = light ? 'light' : 'dark';
    if (frame === 'hero' && mark === 'last') return { fill: HERO_LAST_FILL[tone], mark: 'none' as const };
    return { fill: THEMES[theme][tone], mark };
}

interface SquareContext {
    props: BoardProps;
    theme: BoardTheme;
    frame: BoardFrame;
    showCoordinates: boolean;
    piece: PlacedPiece | undefined;
}

/** Everything a square shows, from its square name and on-screen index (0 = top-left). */
function squareView(sq: Square, index: number, { props, theme, frame, showCoordinates, piece }: SquareContext) {
    const col = index % BOARD_SIZE;
    const row = Math.floor(index / BOARD_SIZE);
    const light = (col + row) % 2 === 0;
    const colors = THEMES[theme];
    return {
        square: sq,
        ...fillAndMark(markFor(sq, props, Boolean(piece)), light, theme, frame),
        ink: light ? colors.lightInk : colors.darkInk,
        dot: !piece && Boolean(props.legalDestinations?.includes(sq)),
        preview: frame === 'preview',
        rankLabel: showCoordinates && col === 0 ? sq[1] : null,
        fileLabel: showCoordinates && row === BOARD_SIZE - 1 ? sq[0] : null,
        label: piece ? `${sq}, ${pieceName(piece.color, piece.type)}` : sq,
    };
}

/**
 * The 8×8 board (Game.dc.html): squares with last-move / check / selection / capture tints and
 * legal-move dots underneath, SVG pieces on top sliding 420ms between squares. Presentational:
 * the position and marks come in as props, clicks go out through `onSquareClick`.
 */
export function Board(props: BoardProps) {
    const {
        fen,
        orientation = 'white',
        theme = 'maple',
        frame = 'game',
        animate = true,
        showCoordinates = false,
    } = props;
    const pieces = usePlacedPieces(fen);
    const bySquare = new Map(pieces.map((p) => [p.square, p]));
    // One stable click handler for every square, so a new callback identity re-renders none of them.
    const clickRef = useRef(props.onSquareClick);
    useEffect(() => {
        clickRef.current = props.onSquareClick;
    });
    const onClick = useCallback((sq: Square) => clickRef.current?.(sq), []);
    const interactive = Boolean(props.onSquareClick);
    const label = props.label ?? 'Chess board';
    return (
        <div
            role={interactive ? 'group' : 'img'}
            aria-label={label}
            className={cn(
                'relative box-border aspect-square select-none overflow-hidden',
                FRAMES[frame],
                props.className,
            )}
        >
            <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">
                {squaresFor(orientation).map((sq, i) => (
                    <BoardSquare
                        key={sq}
                        {...squareView(sq, i, { props, theme, frame, showCoordinates, piece: bySquare.get(sq) })}
                        onClick={interactive ? onClick : undefined}
                    />
                ))}
            </div>
            {pieces.map((p) => {
                const { col, row } = gridPosition(p.square, orientation);
                return <PieceSlot key={p.id} color={p.color} type={p.type} col={col} row={row} animate={animate} />;
            })}
            {props.children}
        </div>
    );
}
