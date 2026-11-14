"""
FEN and move validation at the HTTP boundary, shared by the routers.

A FEN python-chess cannot parse, or a move that is not legal in it, is the
caller's mistake: 400, before a Stockfish instance is taken from the pool or
the style model is consulted.
"""

import chess
from fastapi import HTTPException

from services.analysis import parse_played_move

HTTP_BAD_REQUEST = 400


def parse_fen(fen: str) -> chess.Board:
    """The board for `fen`, or HTTP 400 "Invalid FEN: <reason>"."""
    try:
        return chess.Board(fen)
    except ValueError as e:
        raise HTTPException(status_code=HTTP_BAD_REQUEST, detail=f"Invalid FEN: {e}") from e


def parse_legal_move(board: chess.Board, text: str) -> chess.Move:
    """The legal move `text` (UCI or SAN) names in `board`, or HTTP 400 "Illegal move: <text>"."""
    move = parse_played_move(board, text)
    if move is None:
        raise HTTPException(status_code=HTTP_BAD_REQUEST, detail=f"Illegal move: {text!r} in this position")
    return move
