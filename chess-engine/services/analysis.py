"""
Position analysis and move classification (chess.com / Lichess style scoring).

Pure functions over an already-acquired Stockfish instance; acquiring and
releasing pool instances stays with the caller (engine.py owns the pool).
`engine` re-exports win_percent / move_accuracy / analyze_move_cp /
compute_game_accuracy, so `from engine import ...` keeps working.
"""

import math
from typing import Any

import chess

# MATE_CP is re-exported: callers and tests import it from here.
from services.perspective import MATE_CP as MATE_CP
from services.perspective import evaluation_for, for_color, line_white_score

BRILLIANT_DELTA = -30  # played move beats the engine's top choice by > 30cp
BEST_MAX_LOSS = 10  # cp_loss below this is "Best" / "Great move"
# Remaining cp_loss bands (inclusive upper bound) checked in order.
LOSS_BANDS = ((25, "Excellent"), (50, "Good"), (100, "Inaccuracy"), (200, "Mistake"))
MISS_MARGIN = 150  # Miss: best line was >= +150 and the move threw away > 150cp
ANALYZE_TOP_LINES = 3

# (cp_loss, classification, eval_before, eval_after, eval_best, best_uci, played_uci, accuracy);
# every eval is from the MOVER's point of view (services/perspective.py).
MoveAnalysis = tuple[Any, str, Any, Any, Any, str | None, str | None, float]


def win_percent(cp: float) -> float:
    """
    Convert a centipawn evaluation (from the mover's perspective) to a win
    probability in [0, 100], using the same logistic mapping chess.com / Lichess
    use for their accuracy model.
    """
    return 50.0 + 50.0 * (2.0 / (1.0 + math.exp(-0.00368208 * cp)) - 1.0)


def move_accuracy(win_before: float, win_after: float) -> float:
    """
    Per-move accuracy (0..100) from the drop in win% caused by the move.
    A move that keeps your win% flat scores ~100; a move that tanks it scores low.
    This is the chess.com/Lichess per-move accuracy formula.
    """
    drop = max(0.0, win_before - win_after)
    acc = 103.1668 * math.exp(-0.04354 * drop) - 3.1669
    return max(0.0, min(100.0, acc))


def top_line_cp(top_move: dict) -> int:
    """
    Score of one `get_top_moves()` line in centipawns, from WHITE's point of view
    (the `stockfish` package reports both Centipawn and Mate that way).

    A forced mate has no centipawn score: it is worth +MATE_CP when White mates
    (Mate > 0) and -MATE_CP when Black mates (Mate < 0), never 0.
    """
    return line_white_score(top_move)


def _best_cp_for_mover(top_moves: list, player_color: chess.Color) -> int:
    """Score of the engine's top line from the mover's point of view (0 without a line)."""
    if not top_moves:
        return 0
    return for_color(line_white_score(top_moves[0]), player_color)


def parse_played_move(board: chess.Board, text: str) -> chess.Move | None:
    """
    The legal move `text` names in `board`, or None.

    UCI is tried first ("e2e4", "a7a8q"); only when `text` is not a legal UCI
    move is it read as SAN ("Nbd7", "exd5", "O-O-O"). The length of the string
    says nothing about its notation. A null move is not a played move.
    """
    text = text.strip()
    for parse in (board.parse_uci, board.parse_san):
        try:
            move = parse(text)
        except ValueError:  # invalid, illegal or ambiguous in this notation
            continue
        if move:
            return move
    return None


def _classify(eval_best_cp: Any, eval_after_cp: Any, is_engine_best: bool) -> str:
    raw_delta = eval_best_cp - eval_after_cp  # negative means player beat engine's choice
    cp_loss = max(0, raw_delta)
    # E3: Brilliant — played move is strictly better than engine's top choice
    if raw_delta < BRILLIANT_DELTA:
        return "Brilliant"
    if cp_loss < BEST_MAX_LOSS:
        return "Great move" if is_engine_best else "Best"
    for max_loss, label in LOSS_BANDS:
        if cp_loss <= max_loss:
            return label
    # Miss vs Blunder: a "Miss" is failing to convert a clearly winning/equal
    # position (a big opportunity thrown away) rather than a losing move played
    # from an already-bad spot. chess.com draws this distinction; approximate it.
    if eval_best_cp >= MISS_MARGIN and eval_after_cp < eval_best_cp - MISS_MARGIN:
        return "Miss"
    return "Blunder"


def analyze_move_cp(sf: Any, board_fen: str, move_played_san: str, player_color: chess.Color) -> MoveAnalysis:
    """
    Evaluates a specific move against the engine's best move.
    sf: Stockfish instance
    board_fen: FEN *before* the move is played
    move_played_san: The move played by human in SAN or UCI
    player_color: chess.WHITE or chess.BLACK
    Raises ValueError when the move is not legal in `board_fen` (callers validate first).
    """
    b = chess.Board(board_fen)
    user_move = parse_played_move(b, move_played_san)
    if user_move is None:
        raise ValueError(f"Illegal move {move_played_san!r} in {board_fen}")

    sf.set_fen_position(board_fen)
    # E4: removed sf.get_best_move() — redundant, top_moves[0] has the same info
    top_moves = sf.get_top_moves(2)
    best_move_uci = top_moves[0]["Move"] if top_moves else None
    eval_before_normalized = evaluation_for(sf.get_evaluation(), b, player_color)
    eval_best_cp = _best_cp_for_mover(top_moves, player_color)

    # Eval after user move
    b.push(user_move)
    sf.set_fen_position(b.fen())
    eval_after_cp = evaluation_for(sf.get_evaluation(), b, player_color)
    cp_loss = max(0, eval_best_cp - eval_after_cp)

    # Per-move accuracy from the win% drop (chess.com model): win% of the position
    # if best move is played vs win% after the move actually played.
    acc = move_accuracy(win_percent(eval_best_cp), win_percent(eval_after_cp))
    classification = _classify(eval_best_cp, eval_after_cp, user_move.uci() == best_move_uci)

    return (
        cp_loss,
        classification,
        eval_before_normalized,
        eval_after_cp,
        eval_best_cp,
        best_move_uci,
        user_move.uci(),
        round(acc, 1),
    )


def compute_game_accuracy(cp_losses: list) -> float:
    if not cp_losses:
        return 100.0
    avg_loss = sum(cp_losses) / len(cp_losses)
    raw_accuracy = 103.1668 * math.exp(-0.04354 * avg_loss) - 3.1669
    return round(max(0.0, min(100.0, raw_accuracy)), 1)


def analyse_position(sf: Any, fen: str) -> dict:
    """
    Best move, evaluation and top lines for `fen` (body of POST /analyze).

    `evaluation` and every line score are from WHITE's point of view, as the
    `stockfish` package reports them (services/perspective.py); the analysis
    page's eval bar reads them that way.
    """
    sf.set_fen_position(fen)
    evaluation = sf.get_evaluation()
    top_moves = sf.get_top_moves(ANALYZE_TOP_LINES)
    lines = [{"move": m["Move"], "centipawn": m.get("Centipawn"), "mate": m.get("Mate")} for m in top_moves]
    return {
        "best_move": top_moves[0]["Move"] if top_moves else None,
        "evaluation": {"type": evaluation["type"], "value": evaluation["value"]},
        "lines": lines,
    }


def classify_move(sf: Any, fen: str, move: str) -> dict:
    """Classification of a single move (body of POST /classify-move)."""
    board = chess.Board(fen)
    cp_loss, classification, _eb, _ea, _ebest, best_uci, _played, _acc = analyze_move_cp(sf, fen, move, board.turn)
    return {"classification": classification, "cp_loss": cp_loss, "best_move": best_uci}
