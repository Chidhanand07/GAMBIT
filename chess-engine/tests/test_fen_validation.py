"""
G19: every endpoint that takes a FEN answers 400 "Invalid FEN: ..." for a FEN
that python-chess cannot parse. Never a 500, never an engine call.
"""

import chess
import pytest
from fastapi import HTTPException

from routers.fen import parse_fen
from tests.conftest import FakeStockfish

START = chess.STARTING_FEN

BAD_FENS = [
    "garbage",
    "",
    "   ",
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1",  # seven ranks
    "rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",  # nine squares in a rank
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1",  # no such side to move
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e9 0 1",  # no such en-passant square
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - x 1",  # half-move clock is not a number
]

# (path, the rest of a valid request body)
FEN_ENDPOINTS = [
    ("/validate-move", {"move": "e2e4"}),
    ("/valid-moves", {"move": ""}),
    ("/analyze", {}),
    ("/classify-move", {"move": "e2e4"}),
    ("/style-move", {}),
    ("/computer-move", {}),
]


class ExplodingStockfish(FakeStockfish):
    """An engine that must not be reached: a real Stockfish process dies on a bad FEN."""

    def set_fen_position(self, fen):
        raise AssertionError(f"the engine was given an unvalidated FEN: {fen!r}")


@pytest.mark.parametrize("path,body", FEN_ENDPOINTS)
@pytest.mark.parametrize("fen", BAD_FENS)
def test_an_invalid_fen_is_a_400_on_every_fen_endpoint(client, stockfish, path, body, fen):
    stockfish.instance = ExplodingStockfish()
    res = client.post(path, json={"fen": fen, **body})
    assert res.status_code == 400
    assert res.json()["detail"].startswith("Invalid FEN: ")


@pytest.mark.parametrize("path,body", FEN_ENDPOINTS)
def test_an_invalid_fen_is_a_400_even_when_the_engine_is_down(client, path, body):
    # The request is wrong whether or not Stockfish is up: 400, not 503.
    assert client.post(path, json={"fen": "garbage", **body}).status_code == 400


def test_classify_move_bad_fen_does_not_raise_a_500(client, stockfish):
    # The report's reproduction: chess.Board(fen) raised an uncaught ValueError.
    res = client.post("/classify-move", json={"fen": "not a fen", "move": "e2e4"})
    assert res.status_code == 400


@pytest.mark.parametrize("path,body", FEN_ENDPOINTS)
def test_a_valid_fen_still_passes(client, stockfish, path, body):
    assert client.post(path, json={"fen": START, **body}).status_code == 200


@pytest.mark.parametrize("path,body", FEN_ENDPOINTS)
def test_a_missing_fen_is_still_a_422(client, path, body):
    assert client.post(path, json=body).status_code == 422


# ── the shared helper ────────────────────────────────────────────────────────


def test_parse_fen_returns_the_board():
    board = parse_fen("7k/P7/8/8/8/8/8/K7 w - - 0 1")
    assert isinstance(board, chess.Board)
    assert board.fen() == "7k/P7/8/8/8/8/8/K7 w - - 0 1"


@pytest.mark.parametrize("fen", BAD_FENS)
def test_parse_fen_raises_400(fen):
    with pytest.raises(HTTPException) as err:
        parse_fen(fen)
    assert err.value.status_code == 400
    assert err.value.detail.startswith("Invalid FEN: ")
