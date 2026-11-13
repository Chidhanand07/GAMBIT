// ── Shared chess piece image (chess.com classic set) ─────────────────────────
// Renders a board piece as a PNG from /public/pieces/classic. Used by the online
// game board, the analysis board, and the MAVERICK computer board so every board
// looks identical.
import Image from 'next/image';

type PieceColor = 'w' | 'b';

/** Intrinsic size of the piece PNGs; CSS scales them to 82 % of the square. */
export const PIECE_IMAGE_PX = 140;

/**
 * next/image with `unoptimized`: the pieces are small, already-sized static sprites (up to
 * 32 on a board), so the optimizer would add a round trip per piece and save nothing; the
 * file is served as-is from /public.
 */
export default function Piece({ color, type }: { color: PieceColor; type: string }) {
    const file = `/pieces/classic/${color}${type.toLowerCase()}.png`;
    return (
        <Image
            src={file}
            alt={`${color}${type}`}
            width={PIECE_IMAGE_PX}
            height={PIECE_IMAGE_PX}
            unoptimized
            draggable={false}
            className="select-none pointer-events-none w-[82%] h-[82%] object-contain"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
        />
    );
}
