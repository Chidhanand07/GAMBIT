"""
ENG-DEPTH-BOUND: POST /analyze accepts a search depth between MIN_ANALYSIS_DEPTH
and MAX_ANALYSIS_DEPTH (config.py) and answers 422 otherwise, before a
Stockfish instance is taken. /analyze is the only endpoint that takes a depth.
"""

import chess
import pytest

import config
from routers.analysis import DEFAULT_ANALYSIS_DEPTH
from tests.test_fen_validation import ExplodingStockfish

START = chess.STARTING_FEN
APP_DEPTH = 18  # what the analysis page and the game server request


def test_the_bound_is_a_named_setting_that_admits_what_the_app_requests():
    assert config.MIN_ANALYSIS_DEPTH == 1
    assert config.MIN_ANALYSIS_DEPTH <= APP_DEPTH <= config.MAX_ANALYSIS_DEPTH
    assert config.MIN_ANALYSIS_DEPTH <= DEFAULT_ANALYSIS_DEPTH <= config.MAX_ANALYSIS_DEPTH


@pytest.mark.parametrize(
    "depth",
    [config.MAX_ANALYSIS_DEPTH + 1, 99, 10_000, 0, -1, "deep", 12.5, None],
)
def test_a_depth_outside_the_bound_is_a_422_and_never_reaches_the_engine(client, stockfish, depth):
    stockfish.instance = ExplodingStockfish()
    res = client.post("/analyze", json={"fen": START, "depth": depth})
    assert res.status_code == 422  # was 200 with any integer, e.g. depth 10000


@pytest.mark.parametrize("depth", [config.MIN_ANALYSIS_DEPTH, APP_DEPTH, config.MAX_ANALYSIS_DEPTH])
def test_a_depth_inside_the_bound_is_used(client, stockfish, depth):
    assert client.post("/analyze", json={"fen": START, "depth": depth}).status_code == 200
    assert stockfish.instance.depth == depth


def test_without_a_depth_the_default_is_used(client, stockfish):
    assert client.post("/analyze", json={"fen": START}).status_code == 200
    assert stockfish.instance.depth == DEFAULT_ANALYSIS_DEPTH
