"""
Re-run stored game reviews after the evaluation-perspective fix (ADR F-061).

Dry run by default: rebuilds each selected review with Stockfish and prints
what would change, writing nothing. `--apply` writes the new reviews (only
the review columns; never ratings). Run from chess-engine/ with the engine's
environment (SUPABASE_URL, SUPABASE_SECRET_KEY, STOCKFISH_PATH):

    python -m scripts.rereview_games [--since 2026-01-01] [--limit 50]
        [--game-id <uuid> ...] [--concurrency 2] [--apply]
"""

import argparse
import sys
from datetime import datetime
from types import SimpleNamespace
from uuid import UUID

DEFAULT_CONCURRENCY = 2
MAX_CONCURRENCY = 8  # one Stockfish instance per worker; never more than the pool
EXIT_OK = 0
EXIT_FAILURES = 1
EXIT_UNAVAILABLE = 2


def _positive_int(text: str) -> int:
    value = int(text)
    if value < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    return value


def _concurrency(text: str) -> int:
    value = _positive_int(text)
    if value > MAX_CONCURRENCY:
        raise argparse.ArgumentTypeError(f"must be at most {MAX_CONCURRENCY}")
    return value


def _since(text: str) -> str:
    try:
        return datetime.fromisoformat(text).isoformat()
    except ValueError as e:
        raise argparse.ArgumentTypeError("must be an ISO date or date-time, e.g. 2026-11-01") from e


def _game_id(text: str) -> str:
    try:
        return str(UUID(text))
    except ValueError as e:
        raise argparse.ArgumentTypeError("must be a game UUID") from e


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m scripts.rereview_games", description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="write the new reviews (default: dry run)")
    parser.add_argument("--since", type=_since, help="only games that ended at or after this time")
    parser.add_argument("--limit", type=_positive_int, help="at most this many games, newest first")
    parser.add_argument("--game-id", dest="game_ids", type=_game_id, action="append", default=[], help="repeatable")
    parser.add_argument("--concurrency", type=_concurrency, default=DEFAULT_CONCURRENCY)
    return parser.parse_args(argv)


def selection_from(args: argparse.Namespace):
    from services.rereview import Selection

    return Selection(since=args.since, limit=args.limit, game_ids=tuple(args.game_ids))


def _reviewer(engine, review, depth: int):
    """build(pgn) on a pool instance taken per game (bounded by the pool and the worker count)."""

    def build(pgn: str):
        sf = engine.get_stockfish_instance(depth=depth)
        if sf is None:
            raise RuntimeError("engine unavailable")
        try:
            return review.review_pgn(sf, pgn)
        finally:
            engine.release_stockfish_instance(sf)

    return build


def report(results, apply: bool, out=sys.stdout) -> int:
    """Print one line per game and a summary; the exit code says whether anything failed."""
    counts: dict[str, int] = {}
    for result in results:
        counts[result.outcome] = counts.get(result.outcome, 0) + 1
        detail = result.error or ", ".join(f"{k}: {v}" for k, v in result.changes.items())
        print(f"{result.game_id}  {result.outcome}  {detail}".rstrip(), file=out)
    mode = "APPLIED" if apply else "DRY RUN (nothing written; pass --apply to write)"
    print(f"{mode}: {len(results)} games; " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())), file=out)
    return EXIT_FAILURES if counts.get("failed") else EXIT_OK


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    from supabase import create_client

    import config
    import engine
    from services import rereview, review

    if not (config.SUPABASE_URL and config.SUPABASE_KEY):
        print("SUPABASE_URL and SUPABASE_SECRET_KEY must be set", file=sys.stderr)
        return EXIT_UNAVAILABLE
    db = create_client(config.SUPABASE_URL, config.SUPABASE_KEY)
    rows = rereview.select_games(db, selection_from(args))
    seams = SimpleNamespace(supabase=db)
    results = rereview.rereview_games(
        rows,
        build=_reviewer(engine, review, review.REVIEW_DEPTH),
        save=lambda game_id, update: review.save_review(seams, game_id, update),
        apply=args.apply,
        concurrency=args.concurrency,
    )
    return report(results, args.apply)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
