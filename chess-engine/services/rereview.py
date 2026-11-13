"""
Re-run stored game reviews (ENG-PERSPECTIVE backfill; ADR F-061).

Reviews written before the perspective fix scored every White move wrongly.
This module picks completed games that already have a stored review, builds
each review again and either reports what would change (dry run, the
default) or writes it. Only REVIEW_COLUMNS are ever written, through
services/review.save_review, which also requires status = 'completed':
ratings, results and statuses are never touched.

The command line lives in scripts/rereview_games.py; everything here takes
its dependencies as arguments so it is tested with fakes.
"""

from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

from services.review import COMPLETED_STATUS, REVIEW_COLUMNS

SELECT_COLUMNS = "id, pgn, ended_at, " + ", ".join(REVIEW_COLUMNS)
PAGE_SIZE = 200

OUTCOME_UNCHANGED = "unchanged"
OUTCOME_WOULD_CHANGE = "would_change"
OUTCOME_UPDATED = "updated"
OUTCOME_NO_MOVES = "no_moves"
OUTCOME_FAILED = "failed"


@dataclass(frozen=True)
class Selection:
    """Which stored reviews to redo: newest first, optionally since a time, by id, or capped."""

    since: str | None = None
    limit: int | None = None
    game_ids: tuple[str, ...] = ()


@dataclass
class Result:
    game_id: str
    outcome: str
    changes: dict = field(default_factory=dict)
    error: str | None = None


def _query(db: Any, selection: Selection, start: int, end: int) -> Any:
    query = (
        db.table("games")
        .select(SELECT_COLUMNS)
        .eq("status", COMPLETED_STATUS)
        .not_.is_("white_move_classifications", "null")
        .not_.is_("pgn", "null")
    )
    if selection.since:
        query = query.gte("ended_at", selection.since)
    if selection.game_ids:
        query = query.in_("id", list(selection.game_ids))
    return query.order("ended_at", desc=True).range(start, end)


def select_games(db: Any, selection: Selection, page_size: int = PAGE_SIZE) -> list[dict]:
    """Completed games with a stored review that match `selection`, page by page."""
    rows: list[dict] = []
    while selection.limit is None or len(rows) < selection.limit:
        want = page_size if selection.limit is None else min(page_size, selection.limit - len(rows))
        page = getattr(_query(db, selection, len(rows), len(rows) + want - 1).execute(), "data", None) or []
        rows.extend(page)
        if len(page) < want:
            break
    return rows


def _classes(entries: Any) -> list:
    return [entry.get("classification") for entry in entries or []]


def diff_review(stored: dict, fresh: dict) -> dict:
    """What a fresh review changes in a stored one: accuracies (old, new) and re-labelled moves."""
    changes: dict = {}
    for column in ("white_accuracy", "black_accuracy"):
        if stored.get(column) != fresh.get(column):
            changes[column] = (stored.get(column), fresh.get(column))
    for column in ("white_move_classifications", "black_move_classifications"):
        old, new = _classes(stored.get(column)), _classes(fresh.get(column))
        relabelled = sum(1 for a, b in zip(old, new, strict=False) if a != b) + abs(len(old) - len(new))
        if relabelled:
            changes[column] = relabelled
    return changes


def rereview_one(row: dict, build: Callable[[str], dict | None], save: Callable[[str, dict], bool], apply: bool):
    """Rebuild one game's review; write it only when `apply` and it changed."""
    game_id = row["id"]
    try:
        fresh = build(row.get("pgn") or "")
        if fresh is None:
            return Result(game_id, OUTCOME_NO_MOVES)
        update = {column: fresh[column] for column in REVIEW_COLUMNS}
        changes = diff_review(row, update)
        if not changes:
            return Result(game_id, OUTCOME_UNCHANGED)
        if not apply:
            return Result(game_id, OUTCOME_WOULD_CHANGE, changes)
        if not save(game_id, update):
            return Result(game_id, OUTCOME_FAILED, changes, "save failed")
        return Result(game_id, OUTCOME_UPDATED, changes)
    except Exception as e:  # one bad game must not stop the batch
        return Result(game_id, OUTCOME_FAILED, error=str(e))


def rereview_games(rows: Iterable[dict], build, save, apply: bool, concurrency: int) -> list[Result]:
    """rereview_one for every row, at most `concurrency` at a time, results in row order."""
    if concurrency < 1:
        raise ValueError("concurrency must be at least 1")
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        return list(pool.map(lambda row: rereview_one(row, build, save, apply), rows))
