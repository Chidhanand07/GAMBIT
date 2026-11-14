"""
ENG-CLASSIFY-ILLEGAL: POST /classify-move answers 400 for a move that is not
legal in the FEN (it used to answer 200 "Mistake"). Checked at the boundary,
before a Stockfish instance is taken from the pool.
"""

import chess
import pytest

from services.analysis import analyze_move_cp
from tests.test_fen_validation import ExplodingStockfish

START = chess.STARTING_FEN
CHECKMATED = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"  # no legal move at all


@pytest.mark.parametrize(
    "fen,move",
    [
        (START, "e2e5"),  # UCI-shaped, illegal
        (START, "e7e5"),  # the other side's move
        (START, "Nbd7"),  # SAN-shaped, illegal here
        (START, "zz9"),
        (START, ""),
        (START, "0000"),  # a null move is not a played move
        (CHECKMATED, "e1d1"),
    ],
)
def test_an_illegal_move_is_a_400_and_never_reaches_the_engine(client, stockfish, fen, move):
    stockfish.instance = ExplodingStockfish()
    res = client.post("/classify-move", json={"fen": fen, "move": move})
    assert res.status_code == 400  # was 200 {"classification": "Mistake", ...}
    assert res.json()["detail"].startswith("Illegal move: ")


def test_an_illegal_move_is_a_400_even_when_the_engine_is_down(client):
    assert client.post("/classify-move", json={"fen": START, "move": "e2e5"}).status_code == 400


@pytest.mark.parametrize("move", ["e2e4", "e4", "Nf3", "g1f3"])
def test_a_legal_move_in_uci_or_san_is_still_classified(client, stockfish, move):
    assert client.post("/classify-move", json={"fen": START, "move": move}).status_code == 200


def test_the_service_refuses_an_illegal_move_instead_of_calling_it_a_mistake(stockfish):
    with pytest.raises(ValueError):
        analyze_move_cp(stockfish.instance, START, "e2e5", chess.WHITE)
