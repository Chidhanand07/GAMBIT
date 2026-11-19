import { memo, type ReactElement } from 'react';
import type { PieceColor, PieceType } from './boardModel';
import { usePieceSet, type PieceSet } from './pieceSets';

// The GAMBIT piece set (design/HANDOFF.md §4.4): path data from pieceImg() in Main.dc.html on a
// 45×45 viewBox. Fills, outlines and detail strokes are the piece-* tokens.

const BASE = (
    <>
        <rect x="9" y="37" width="27" height="4" rx="2" />
        <rect x="12" y="33.5" width="21" height="3.5" rx="1.7" />
    </>
);

/** The logo knight, scaled into the 45×45 square. */
const KNIGHT_BODY = (
    <g transform="translate(-2.4 -4.14) scale(0.8)">
        <g transform="translate(1.8 0)">
            <path d="M23 50C22 44 24 39 29.5 35L24 37.6C22.8 38 21.4 37.6 20.6 36.7L13.5 30.2C12.8 29.4 13 28.2 14 27.6L23.2 22.6C24 21.6 24.3 20.4 24.8 19L25.2 10.8L30.2 16.2C31.8 15.2 33.6 14.8 35.5 14.8C43 15.5 47.5 23.5 47 32C46.7 38 45 44 43.5 50Z" />
        </g>
    </g>
);

const BODIES: Record<PieceType, ReactElement> = {
    p: (
        <>
            <circle cx="22.5" cy="13" r="5.5" />
            <path d="M15 33.5C15 27 19 24 20 19.5H25C26 24 30 27 30 33.5Z" />
        </>
    ),
    r: (
        <>
            <path d="M13 10.5H18V14.5H21V10.5H24V14.5H27V10.5H32V19H13Z" />
            <path d="M15.5 19H29.5L31 33.5H14Z" />
        </>
    ),
    b: (
        <>
            <circle cx="22.5" cy="6" r="2.3" />
            <path d="M22.5 8C28.5 12.5 29.5 17 27 21C25.5 23 25 24 25 25.5H20C20 24 19.5 23 18 21C15.5 17 16.5 12.5 22.5 8Z" />
            <path d="M17 25.5H28C28 29.5 30.5 31 31.5 33.5H13.5C14.5 31 17 29.5 17 25.5Z" />
        </>
    ),
    q: (
        <>
            <path d="M11.5 14L16 26L19 13L22.5 26L26 13L29 26L33.5 14L31.5 33.5H13.5Z" />
            <circle cx="11.5" cy="12.5" r="2.2" />
            <circle cx="17.5" cy="10" r="2.2" />
            <circle cx="22.5" cy="9" r="2.2" />
            <circle cx="27.5" cy="10" r="2.2" />
            <circle cx="33.5" cy="12.5" r="2.2" />
        </>
    ),
    k: (
        <>
            <rect x="21" y="2.5" width="3" height="10" rx="1" />
            <rect x="17.5" y="5.5" width="10" height="3" rx="1" />
            <path d="M22.5 13C29.500 13 32 17 30.500 22C29.500 25.500 31.500 28.500 32.500 33.500H12.500C13.500 28.500 15.500 25.500 14.500 22C13 17 15.500 13 22.500 13Z" />
        </>
    ),
    n: KNIGHT_BODY,
};

/** Detail marks, drawn over the body in the detail colour. */
function Detail({ type, className }: { type: PieceType; className: string }) {
    if (type === 'b')
        return <path d="M21 14.5L24.5 18" strokeWidth="1.4" strokeLinecap="round" fill="none" className={className} />;
    if (type === 'r')
        return (
            <path d="M16 22H29" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.6" className={className} />
        );
    if (type === 'n') return <circle cx="23.2" cy="17.2" r="1.4" stroke="none" className={className} />;
    return null;
}

const NAMES: Record<PieceType, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/** Body fill + outline, detail stroke, and the knight's eye fill per side (literal for Tailwind). */
const INK = {
    w: {
        body: 'fill-piece-white-fill stroke-piece-white-line',
        detail: 'stroke-piece-white-detail',
        eye: 'fill-piece-white-detail',
    },
    b: {
        body: 'fill-piece-black-fill stroke-piece-black-line',
        detail: 'stroke-piece-black-detail',
        eye: 'fill-piece-black-detail',
    },
};

interface PieceProps {
    color: PieceColor;
    type: PieceType;
    className?: string;
}

// The Classic and Line art sets (Settings.dc.html, ADR F-147): the mockup draws them as the
// Unicode chess glyphs in Noto Sans Symbols 2 (the app's `font-symbols`), filled (♚…) for
// Classic and outlined (♔…) for Line art, followed by U+FE0E (text, not emoji, presentation).
const TEXT_PRESENTATION = '\uFE0E';
const FILLED: Record<PieceType, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const OUTLINED: Record<PieceType, string> = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' };
/**
 * Glyph size in viewBox units: the mockup's 26px glyph in its 44.75px preview square, while the
 * board draws a piece at 86% of a square on this 45-unit viewBox (26 / (44.75 × 0.86) × 45).
 */
const GLYPH_UNITS = 30.4;
/** Classic white pieces: the mockup's 1px dark text-shadow outline, as a stroke behind the fill. */
const CLASSIC_OUTLINE_UNITS = 2.3;
const CENTER = 22.5;

const GLYPH_INK: Record<Exclude<PieceSet, 'gambit'>, Record<PieceColor, string>> = {
    classic: { w: 'fill-piece-glyph-white stroke-piece-glyph-black', b: 'fill-piece-glyph-black' },
    lineart: { w: 'fill-piece-glyph-black', b: 'fill-piece-glyph-neo' },
};

/** A Classic or Line art piece: one glyph centred on the 45×45 viewBox. */
function GlyphSvg({ color, type, className, set }: PieceProps & { set: Exclude<PieceSet, 'gambit'> }) {
    const glyph = (set === 'classic' ? FILLED : OUTLINED)[type] + TEXT_PRESENTATION;
    const outlined = set === 'classic' && color === 'w';
    return (
        <svg
            viewBox="0 0 45 45"
            aria-hidden="true"
            data-piece={`${color}${type}`}
            data-piece-set={set}
            className={className}
            xmlns="http://www.w3.org/2000/svg"
        >
            <text
                x={CENTER}
                y={CENTER}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={GLYPH_UNITS}
                strokeWidth={outlined ? CLASSIC_OUTLINE_UNITS : undefined}
                paintOrder={outlined ? 'stroke' : undefined}
                className={`font-symbols ${GLYPH_INK[set][color]}`}
            >
                {glyph}
            </text>
        </svg>
    );
}

/** One chess piece in the current piece set (decorative: the board names the square's contents). */
function PieceSvg(props: PieceProps) {
    const set = usePieceSet();
    return set === 'gambit' ? <GambitSvg {...props} /> : <GlyphSvg {...props} set={set} />;
}

/** The GAMBIT set as an inline SVG. */
function GambitSvg({ color, type, className }: PieceProps) {
    const ink = INK[color];
    // The knight's eye is a filled dot; the bishop and rook details are strokes.
    const detail = type === 'n' ? ink.eye : ink.detail;
    return (
        <svg
            viewBox="0 0 45 45"
            aria-hidden="true"
            data-piece={`${color}${type}`}
            data-piece-set="gambit"
            className={className}
            xmlns="http://www.w3.org/2000/svg"
        >
            <g strokeWidth="1.6" strokeLinejoin="round" className={ink.body}>
                {BODIES[type]}
                {type !== 'n' && BASE}
            </g>
            {type === 'n' && (
                <g strokeWidth="1.6" strokeLinejoin="round" className={ink.body}>
                    {BASE}
                </g>
            )}
            <Detail type={type} className={detail} />
        </svg>
    );
}

export const Piece = memo(PieceSvg);
export const pieceName = (color: PieceColor, type: PieceType) => `${color === 'w' ? 'white' : 'black'} ${NAMES[type]}`;
