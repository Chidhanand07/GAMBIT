// ── Shared chess piece image (chess.com classic set) ─────────────────────────
// Renders a board piece as a PNG from /public/pieces/classic. Used by the online
// game board, the analysis board, and the MAVERICK computer board so every board
// looks identical.

type PieceColor = 'w' | 'b';

export default function Piece({ color, type }: { color: PieceColor; type: string }) {
    const file = `/pieces/classic/${color}${type.toLowerCase()}.png`;
    return (
        <img
            src={file}
            alt={`${color}${type}`}
            draggable={false}
            className="select-none pointer-events-none w-[82%] h-[82%] object-contain"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
        />
    );
}
