# ADR 0303 — Apply `raise ... from e` (Ruff B904) in the engine

- **Status:** accepted (PR 17)

## Context

Six `raise` statements inside `except` blocks (`HTTPException` in the
`/valid-moves`, `/analyze`, `/style-move`, `/computer-move` handlers;
`ValueError("Invalid FEN: ...")` in `style_engine.get_style_move` and
`computer_engine.get_computer_move`) were in the legacy B904 ignore list.

## Options

1. Keep them as-is with `# noqa: B904` / the per-file ignore.
2. `raise ... from e` (sets `__cause__`, traceback says "direct cause").
3. `raise ... from None` (hides the original error).

## Decision

Option 2.

## Why

The only observable difference is the exception's `__cause__` /
`__suppress_context__` and the wording of a printed traceback. HTTP status
codes, `detail` strings (built from `str(e)` / the same f-string) and
response bodies are unchanged; FastAPI's `HTTPException` handler never
renders tracebacks, and the `ValueError`s are caught by the routers and
mapped to 400 with `str(e)`, which is unaffected. No code reads `__cause__`
(repo grep). Option 2 keeps the original error attached for debugging, which
option 3 would lose. This lets the legacy B904 ignores be deleted.

Related lint clean-ups recorded here: B905 fixed with `strict=False` (the
legacy, non-strict behaviour); I001 import re-sorting applied only in
`engine.py`, `style_engine.py` and `computer_engine.py` after checking the
import side effects (the stockfish logger level, env reads and the style
model load do not depend on the relative order; `engine` is already imported
before `computer_engine` in production via `main`). The test files keep their
I001/F401 ignores because tests must not be edited in this refactor.
