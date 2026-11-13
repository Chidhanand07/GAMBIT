"""
FEN validation at the HTTP boundary, shared by every router that takes a FEN.

A FEN python-chess cannot parse is the caller's mistake: 400, before a
Stockfish instance is taken from the pool or the style model is consulted.
"""

import chess
from fastapi import HTTPException


def parse_fen(fen: str) -> chess.Board:
    """The board for `fen`, or HTTP 400 "Invalid FEN: <reason>"."""
    try:
        return chess.Board(fen)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid FEN: {e}") from e
