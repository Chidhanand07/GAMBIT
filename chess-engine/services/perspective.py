"""
Evaluation perspective: the one module that knows which side a score favours.

The `stockfish` package (3.28.0) reports every score from WHITE's point of
view, whoever is to move: `get_evaluation()` multiplies the engine's
side-to-move score by `compare = 1 if "w" in fen_position else -1`
(stockfish/models.py, Stockfish.get_evaluation, lines 499 and 512), and
`get_top_moves()` does the same with `multiplier` (line 546). Positive means
good for White, negative good for Black.

Everything that reads an evaluation goes through these helpers: the review
and /classify-move (services/analysis.py) and MAVERICK (computer_engine.py).
A score "for a colour" is positive when that colour stands better.
"""

import chess

MATE_CP = 10000  # centipawn stand-in for a forced mate
# A centipawn score never reaches a mate score: |cp| is clamped below MATE_CP.
CP_LIMIT = MATE_CP - 1

CP_TYPE = "cp"
MATE_TYPE = "mate"


def clamp_cp(cp: int) -> int:
    """`cp` limited to [-CP_LIMIT, CP_LIMIT], so any forced mate outranks it."""
    return max(-CP_LIMIT, min(CP_LIMIT, cp))


def _mate_for_white(mate_in: int, white_to_move: bool) -> int:
    """
    A mate score in White's view. `mate_in` > 0: White mates; < 0: Black mates.
    `mate_in` == 0 means the side to move is already checkmated; the package
    loses the sign there (0 * -1 == 0), so the side to move decides it.
    """
    if mate_in > 0:
        return MATE_CP
    if mate_in < 0:
        return -MATE_CP
    return -MATE_CP if white_to_move else MATE_CP


def white_score(evaluation: dict, white_to_move: bool) -> int:
    """
    Centipawns from White's view for a `get_evaluation()` result
    ({"type": "cp" | "mate", "value": int}) of a position with `white_to_move`.
    """
    kind, value = evaluation.get("type"), evaluation.get("value")
    if kind == MATE_TYPE:
        return _mate_for_white(int(value), white_to_move)
    if kind == CP_TYPE:
        return clamp_cp(int(value))
    raise ValueError(f"Unknown evaluation type: {kind!r}")


def line_white_score(line: dict) -> int:
    """
    Centipawns from White's view for one `get_top_moves()` line
    ({"Move", "Centipawn", "Mate"}). A line always has a move, so its mate
    distance is never 0; a line without any score is worth 0.
    """
    cp = line.get("Centipawn")
    if cp is not None:
        return clamp_cp(cp)
    mate = line.get("Mate")
    if not mate:
        return 0
    return MATE_CP if mate > 0 else -MATE_CP


def for_color(white_cp: int, color: chess.Color) -> int:
    """A White-view score turned into `color`'s view (and back: the map is its own inverse)."""
    return white_cp if color == chess.WHITE else -white_cp


def evaluation_for(evaluation: dict, board: chess.Board, color: chess.Color) -> int:
    """`get_evaluation()` of `board` (the position the engine was given) from `color`'s view."""
    return for_color(white_score(evaluation, board.turn == chess.WHITE), color)
