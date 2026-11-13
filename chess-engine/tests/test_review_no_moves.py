"""
G21: a review is only stored for a game that has moves. Input that is empty,
is not PGN, or parses to a game without a single legal move never writes
accuracy to the games row (it used to write 100 / 100), and a side that made
no move gets no accuracy instead of a perfect one.
"""

import pytest

import main
from services import review
from tests.test_api import GAME_ID, PGN, FakeSupabase

NO_MOVE_PGNS = [
    "",
    "   \n\t ",
    "hello world",
    "not a pgn at all {",
    "\x00\x01\x02",
    "<html><body>502 Bad Gateway</body></html>",
    '{"pgn": "1. e4 e5"}',
    '[Event "GAMBIT"]\n[Site "GAMBIT"]\n\n*',  # headers only
    '[Event "GAMBIT"]\n\n1-0',  # a result without moves
    "1. e5 *",  # the first move is illegal: nothing can be replayed
    "1. Ke2 *",
]


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase()
    monkeypatch.setattr(main, "supabase", fake)
    return fake


# ── the background task ──────────────────────────────────────────────────────


@pytest.mark.parametrize("pgn", NO_MOVE_PGNS)
def test_a_game_without_moves_is_never_written(db, stockfish, pgn):
    status = main.run_full_game_analysis(GAME_ID, pgn)
    assert db.updates == []
    assert status == review.ANALYSIS_NO_MOVES
    assert stockfish.released == 1  # the engine still goes back to the pool


def test_a_real_game_is_written_and_reports_saved(db, stockfish):
    assert main.run_full_game_analysis(GAME_ID, PGN) == review.ANALYSIS_SAVED
    assert len(db.updates) == 1


def test_no_engine_reports_engine_unavailable(db):
    assert main.run_full_game_analysis(GAME_ID, PGN) == review.ANALYSIS_ENGINE_UNAVAILABLE
    assert db.updates == []


def test_a_failed_database_write_is_not_reported_as_saved(monkeypatch, stockfish):
    class Broken:
        def table(self, _):
            raise RuntimeError("db down")

    monkeypatch.setattr(main, "supabase", Broken())
    assert main.run_full_game_analysis(GAME_ID, PGN) == review.ANALYSIS_NOT_SAVED


def test_no_database_is_not_reported_as_saved(monkeypatch, stockfish):
    monkeypatch.setattr(main, "supabase", None)
    assert main.run_full_game_analysis(GAME_ID, PGN) == review.ANALYSIS_NOT_SAVED


def test_a_side_that_made_no_move_has_no_accuracy(db, stockfish):
    # White moved once, Black never did: Black must not be credited with 100.
    main.run_full_game_analysis(GAME_ID, "1. e4 *")
    (write,) = db.updates
    update = write["update"]
    assert 0 <= update["white_accuracy"] <= 100
    assert update["black_accuracy"] is None
    assert len(update["white_move_classifications"]) == 1
    assert update["black_move_classifications"] == []


# ── pure helpers ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize("pgn", NO_MOVE_PGNS)
def test_parse_game_with_moves_is_none_without_moves(pgn):
    assert review.parse_game_with_moves(pgn) is None


@pytest.mark.parametrize("pgn,plies", [(PGN, 6), ("1. e4 *", 1), ("1. e4 e5 2. Nf3", 3), ("e4 e5", 2)])
def test_parse_game_with_moves_returns_the_game(pgn, plies):
    game = review.parse_game_with_moves(pgn)
    assert len(list(game.mainline_moves())) == plies


def test_average_accuracy_of_no_moves_is_none_not_100():
    assert review._average_accuracy([]) is None
    assert review._average_accuracy([80.0, 90.0]) == 85.0
    assert review._average_accuracy([0.0]) == 0.0


# ── the endpoint ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize("pgn", NO_MOVE_PGNS)
def test_analyse_game_refuses_a_pgn_without_moves(client, stockfish, db, monkeypatch, pgn):
    calls = []
    monkeypatch.setattr(main, "run_full_game_analysis", lambda gid, p: calls.append(gid))
    res = client.post("/analyse-game", json={"game_id": GAME_ID, "pgn": pgn, "time_control": "10"})
    assert res.status_code == 422
    assert res.json()["detail"] == "PGN has no moves"
    assert calls == []
    assert db.calls == []  # refused before the database is even asked
