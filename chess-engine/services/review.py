"""
Post-game review: PGN -> per-move analysis -> Supabase `games` row update.

Runs as a FastAPI background task (queued by POST /analyse-game). Engine pool
and Supabase client are looked up through `seams` at call time (ADR 0301).
"""

import io
from typing import Any

import chess
import chess.pgn

from seams import EngineSeams
from services.analysis import analyze_move_cp
from services.perspective import for_color

REVIEW_DEPTH = 18
# Book: early, sound moves are opening theory rather than "found" moves.
# Heuristic (no polyglot book on the server): first 8 plies with low loss.
BOOK_MAX_PLY = 8
BOOK_MAX_LOSS = 40
BOOK_CLASSES = ("Best", "Excellent", "Good")
CRITICAL_CLASSES = ["Blunder", "Miss", "Mistake", "Brilliant", "Great move"]

# Outcomes of `game_review_status`.
COMPLETED_STATUS = "completed"
REVIEW_OK = "ok"
REVIEW_GAME_NOT_FOUND = "not_found"
REVIEW_GAME_NOT_COMPLETED = "not_completed"
REVIEW_UNAVAILABLE = "unavailable"

# Outcomes of `run_full_game_analysis`. Only ANALYSIS_SAVED means a review was written.
ANALYSIS_SAVED = "saved"
ANALYSIS_NO_MOVES = "no_moves"
ANALYSIS_ENGINE_UNAVAILABLE = "engine_unavailable"
ANALYSIS_NOT_SAVED = "not_saved"


def parse_game_with_moves(pgn: str) -> chess.pgn.Game | None:
    """
    The game in `pgn`, or None when there is not a single move to review.

    python-chess is lenient: text that is not PGN at all still parses to an
    empty game. Empty input, non-PGN input, headers without moves and a game
    whose first move is illegal all answer None, so no review is made up for them.
    """
    game = chess.pgn.read_game(io.StringIO(pgn))
    if game is None or game.next() is None:
        return None
    return game


def _score_ply(sf: Any, board: chess.Board, move: chess.Move, ply: int) -> dict:
    """Analysis fields of one move entry (everything after move_number / ply)."""
    player_color = board.turn
    cp_loss, classification, eb, ea, _ebest, best_uci, played_uci, move_acc = analyze_move_cp(
        sf, board.fen(), move.uci(), player_color
    )
    if ply < BOOK_MAX_PLY and classification in BOOK_CLASSES and cp_loss <= BOOK_MAX_LOSS:
        classification = "Book"
    # The eval graph is WHITE's view (positive: White better), whoever moved;
    # frontend EvalGraph.tsx draws +eval_white above the middle line.
    eval_white = for_color(ea, player_color)
    return {
        "move": played_uci,
        "san": board.san(move),
        "classification": classification,
        "cp_loss": cp_loss,
        "accuracy": move_acc,
        "best_move": best_uci,
        "eval_before": eb,
        "eval_after": ea,
        "eval_white": eval_white,
    }


def _critical_moment(entry: dict, player_color: chess.Color) -> dict:
    side = "White" if player_color == chess.WHITE else "Black"
    return {
        "move_number": entry["move_number"],
        "type": entry["classification"],
        "best_move": entry["best_move"],
        "played_move": entry["move"],
        "eval_before": entry["eval_before"],
        "eval_after": entry["eval_after"],
        "description": f"{side} played a {entry['classification']}",
    }


def _average_accuracy(accuracies: list) -> float | None:
    """Mean per-move accuracy; None (not a perfect 100) for a side that made no move."""
    return round(sum(accuracies) / len(accuracies), 1) if accuracies else None


def _review_game(sf: Any, game: chess.pgn.Game) -> dict:
    """Walk the mainline and build the `games` update payload."""
    board = game.board()
    accuracies: dict[chess.Color, list] = {chess.WHITE: [], chess.BLACK: []}
    classifications: dict[chess.Color, list] = {chess.WHITE: [], chess.BLACK: []}
    critical_moments = []

    move_number = 1
    for ply, move in enumerate(game.mainline_moves()):
        player_color = board.turn
        entry = {"move_number": move_number, "ply": ply, **_score_ply(sf, board, move, ply)}
        accuracies[player_color].append(entry["accuracy"])
        classifications[player_color].append(entry)
        if entry["classification"] in CRITICAL_CLASSES:
            critical_moments.append(_critical_moment(entry, player_color))

        board.push(move)
        if player_color == chess.BLACK:
            move_number += 1

    return {
        "white_accuracy": _average_accuracy(accuracies[chess.WHITE]),
        "black_accuracy": _average_accuracy(accuracies[chess.BLACK]),
        "white_move_classifications": classifications[chess.WHITE],
        "black_move_classifications": classifications[chess.BLACK],
        "critical_moments": critical_moments,
    }


def game_review_status(seams: EngineSeams, game_id: str) -> str:
    """
    Whether a review may be written for `game_id`: one of the REVIEW_* values.

    A review is only ever stored for a game that exists and is completed. If
    the database is not configured or the lookup fails, the answer is
    REVIEW_UNAVAILABLE (fail closed), never "go ahead".
    """
    db = seams.supabase
    if not db:
        return REVIEW_UNAVAILABLE
    try:
        result = db.table("games").select("id, status").eq("id", game_id).limit(1).execute()
    except Exception as e:
        print("Failed to look up game before analysis:", e)
        return REVIEW_UNAVAILABLE
    rows = getattr(result, "data", None) or []
    if not rows:
        return REVIEW_GAME_NOT_FOUND
    return REVIEW_OK if rows[0].get("status") == COMPLETED_STATUS else REVIEW_GAME_NOT_COMPLETED


def _save_review(seams: EngineSeams, game_id: str, update: dict) -> bool:
    """Write the review; True only when the update was sent without an error."""
    db = seams.supabase
    if not db:
        return False
    try:
        # The status filter repeats the pre-check: a review never lands on an unfinished game.
        db.table("games").update(update).eq("id", game_id).eq("status", COMPLETED_STATUS).execute()
        # Note: the eval graph is derived client-side from each move entry's
        # `eval_white`, so no separate `eval_graph` column is required.
    except Exception as e:
        print("Failed to save analysis to supabase:", e)
        return False
    return True


def run_full_game_analysis(game_id: str, pgn: str, seams: EngineSeams) -> str:
    """
    Analyse every move of `pgn` and write the review to `games` (id = game_id).

    Returns one of the ANALYSIS_* values. A game without moves is never
    written: there is nothing to score, and an empty review used to store
    100 / 100 accuracy (G21).
    """
    sf = seams.get_stockfish_instance(depth=REVIEW_DEPTH)
    if not sf:
        print(f"Skipping analysis for {game_id}, engine unavailable")
        return ANALYSIS_ENGINE_UNAVAILABLE
    # Note: sf is already acquired from pool; release in finally below
    try:
        game = parse_game_with_moves(pgn)
        if game is None:
            print(f"Skipping analysis for {game_id}, PGN has no moves")
            return ANALYSIS_NO_MOVES
        saved = _save_review(seams, game_id, _review_game(sf, game))
        return ANALYSIS_SAVED if saved else ANALYSIS_NOT_SAVED
    finally:
        seams.release_stockfish_instance(sf)
