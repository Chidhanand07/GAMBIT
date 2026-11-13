"""
Re-review of stored game reviews (services/rereview.py, scripts/rereview_games.py; ADR F-061).
"""

import io
import threading
import time

import pytest
from postgrest import SyncPostgrestClient

from scripts import rereview_games as cli
from services import rereview, review
from services.rereview import Selection

GAME_A = "11111111-1111-4111-8111-111111111111"
GAME_B = "22222222-2222-4222-8222-222222222222"
PGN = '[Event "GAMBIT"]\n\n1. e4 e5 *'


def stored(game_id=GAME_A, white_cls=("Inaccuracy",), white_acc=60.0):
    return {
        "id": game_id,
        "pgn": PGN,
        "ended_at": "2026-11-01T00:00:00+00:00",
        "white_accuracy": white_acc,
        "black_accuracy": 100.0,
        "white_move_classifications": [{"classification": c} for c in white_cls],
        "black_move_classifications": [{"classification": "Book"}],
        "critical_moments": [],
    }


def fresh_review(white_cls=("Book",), white_acc=100.0):
    return {
        "white_accuracy": white_acc,
        "black_accuracy": 100.0,
        "white_move_classifications": [{"classification": c} for c in white_cls],
        "black_move_classifications": [{"classification": "Book"}],
        "critical_moments": [],
    }


# ── selection: the real PostgREST query builder (no network) ────────────────


def built_params(selection):
    query = rereview._query(_Root(SyncPostgrestClient("http://db.invalid")), selection, 0, 9)
    return str(query.request.params)


class _Root:
    """`db.table(name)` like the supabase client, over a bare PostgREST client."""

    def __init__(self, client):
        self.client = client

    def table(self, name):
        return self.client.from_(name)


def test_only_completed_games_with_a_stored_review_and_a_pgn_are_selected():
    params = built_params(Selection())
    assert "status=eq.completed" in params
    assert "white_move_classifications=not.is.null" in params
    assert "pgn=not.is.null" in params
    assert "order=ended_at.desc" in params
    assert "offset=0&limit=10" in params
    assert "rating" not in params


def test_since_and_game_ids_narrow_the_selection():
    params = built_params(Selection(since="2026-11-01T00:00:00", game_ids=(GAME_A, GAME_B)))
    assert "ended_at=gte.2026-11-01T00%3A00%3A00" in params
    assert f"id=in.%28{GAME_A}%2C{GAME_B}%29" in params


class PagedGames:
    """Answers `range(start, end)` pages from `total` fake rows and records each range."""

    def __init__(self, total):
        self.rows = [stored(f"{i:08d}-0000-4000-8000-000000000000") for i in range(total)]
        self.ranges = []

    def table(self, _name):
        return self

    def __getattr__(self, _name):  # select / eq / not_ / is_ / gte / in_ / order: chainable
        return lambda *a, **k: self

    @property
    def not_(self):
        return self

    def range(self, start, end):
        self.ranges.append((start, end))
        self._page = self.rows[start : end + 1]
        return self

    def execute(self):
        return type("Result", (), {"data": self._page})()


@pytest.mark.parametrize(
    "total,limit,expected_count,expected_ranges",
    [
        (5, None, 5, [(0, 1), (2, 3), (4, 5)]),
        (4, None, 4, [(0, 1), (2, 3), (4, 5)]),
        (10, 3, 3, [(0, 1), (2, 2)]),
        (0, None, 0, [(0, 1)]),
    ],
)
def test_selection_pages_until_exhausted_or_the_limit(total, limit, expected_count, expected_ranges):
    db = PagedGames(total)
    rows = rereview.select_games(db, Selection(limit=limit), page_size=2)
    assert len(rows) == expected_count
    assert db.ranges == expected_ranges


# ── diff / one game ─────────────────────────────────────────────────────────


def test_diff_reports_accuracy_and_relabelled_moves():
    changes = rereview.diff_review(stored(), fresh_review())
    assert changes == {"white_accuracy": (60.0, 100.0), "white_move_classifications": 1}


def test_diff_of_an_identical_review_is_empty():
    assert rereview.diff_review(stored(white_cls=("Book",), white_acc=100.0), fresh_review()) == {}


def test_dry_run_never_saves():
    saves = []
    result = rereview.rereview_one(stored(), lambda _pgn: fresh_review(), lambda *a: saves.append(a), apply=False)
    assert result.outcome == rereview.OUTCOME_WOULD_CHANGE
    assert saves == []


def test_apply_saves_only_the_review_columns():
    saves = []
    result = rereview.rereview_one(
        stored(), lambda _pgn: {**fresh_review(), "rating": 9999}, lambda *a: saves.append(a) or True, apply=True
    )
    assert result.outcome == rereview.OUTCOME_UPDATED
    ((game_id, update),) = saves
    assert game_id == GAME_A
    assert set(update) == set(review.REVIEW_COLUMNS)
    assert not any("rating" in column or column in ("result", "status") for column in update)


def test_an_unchanged_review_is_not_rewritten():
    saves = []
    row = stored(white_cls=("Book",), white_acc=100.0)
    result = rereview.rereview_one(row, lambda _pgn: fresh_review(), lambda *a: saves.append(a), apply=True)
    assert result.outcome == rereview.OUTCOME_UNCHANGED and saves == []


def test_no_moves_and_errors_are_reported_not_raised():
    assert rereview.rereview_one(stored(), lambda _pgn: None, None, apply=True).outcome == rereview.OUTCOME_NO_MOVES

    def boom(_pgn):
        raise RuntimeError("engine unavailable")

    failed = rereview.rereview_one(stored(), boom, None, apply=True)
    assert (failed.outcome, failed.error) == (rereview.OUTCOME_FAILED, "engine unavailable")
    not_saved = rereview.rereview_one(stored(), lambda _pgn: fresh_review(), lambda *a: False, apply=True)
    assert not_saved.outcome == rereview.OUTCOME_FAILED


# ── the batch: bounded concurrency, order kept ──────────────────────────────


def test_the_batch_never_runs_more_than_concurrency_games_at_once():
    lock, active, peak = threading.Lock(), [0], [0]

    def build(_pgn):
        with lock:
            active[0] += 1
            peak[0] = max(peak[0], active[0])
        time.sleep(0.02)
        with lock:
            active[0] -= 1
        return fresh_review()

    rows = [stored(f"{i:08d}-0000-4000-8000-000000000000") for i in range(8)]
    results = rereview.rereview_games(rows, build, lambda *a: True, apply=True, concurrency=2)
    assert peak[0] == 2
    assert [r.game_id for r in results] == [row["id"] for row in rows]


def test_concurrency_must_be_positive():
    with pytest.raises(ValueError):
        rereview.rereview_games([], None, None, apply=False, concurrency=0)


# ── command line ────────────────────────────────────────────────────────────


def test_the_default_is_a_dry_run_over_every_stored_review():
    args = cli.parse_args([])
    assert args.apply is False
    assert cli.selection_from(args) == Selection()
    assert args.concurrency == cli.DEFAULT_CONCURRENCY


def test_all_options_parse():
    args = cli.parse_args(
        ["--apply", "--since", "2026-11-01", "--limit", "5", "--game-id", GAME_A, "--game-id", GAME_B]
        + ["--concurrency", "3"]
    )
    assert args.apply is True and args.concurrency == 3
    assert cli.selection_from(args) == Selection(since="2026-11-01T00:00:00", limit=5, game_ids=(GAME_A, GAME_B))


@pytest.mark.parametrize(
    "argv",
    [
        ["--limit", "0"],
        ["--limit", "-3"],
        ["--since", "yesterday"],
        ["--game-id", "g1"],
        ["--concurrency", "0"],
        ["--concurrency", str(cli.MAX_CONCURRENCY + 1)],
        ["--unknown"],
    ],
)
def test_bad_options_are_refused(argv):
    with pytest.raises(SystemExit):
        cli.parse_args(argv)


def test_the_report_counts_outcomes_and_fails_when_a_game_failed():
    out = io.StringIO()
    results = [
        rereview.Result(GAME_A, rereview.OUTCOME_WOULD_CHANGE, {"white_accuracy": (60.0, 100.0)}),
        rereview.Result(GAME_B, rereview.OUTCOME_FAILED, error="engine unavailable"),
    ]
    assert cli.report(results, apply=False, out=out) == cli.EXIT_FAILURES
    text = out.getvalue()
    assert "DRY RUN" in text and "failed=1" in text and "would_change=1" in text
    assert cli.report(results[:1], apply=True, out=io.StringIO()) == cli.EXIT_OK


def test_the_reviewer_returns_the_instance_to_the_pool(engine_switch):
    import engine
    from tests.conftest import FakeStockfish

    engine_switch.instance = FakeStockfish()
    build = cli._reviewer(engine, review, review.REVIEW_DEPTH)
    update = build(PGN)
    assert set(update) == set(review.REVIEW_COLUMNS)
    assert engine_switch.released == 1
    assert engine_switch.instance.depth == review.REVIEW_DEPTH


def test_the_reviewer_fails_when_no_engine_is_available(engine_switch):
    import engine

    with pytest.raises(RuntimeError):
        cli._reviewer(engine, review, review.REVIEW_DEPTH)(PGN)
