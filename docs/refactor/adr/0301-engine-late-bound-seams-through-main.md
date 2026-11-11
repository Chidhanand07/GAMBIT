# ADR 0301 — Engine routers/services resolve dependencies through `main` at call time

- **Status:** accepted (PR 17)

## Context

PR 17 moves the FastAPI endpoints of `chess-engine/main.py` into `routers/`
and the post-game review into `services/review.py`. The existing tests (which
must pass unchanged) monkeypatch module attributes of `main`:
`main.get_engine`, `main.get_stockfish_instance`,
`main.release_stockfish_instance` (autouse fixture in `tests/conftest.py`,
`monkeypatch.setattr` with `raising=True`, so the names must exist),
`main.supabase` and `main.run_full_game_analysis` (`tests/test_api.py`).
Code that imports these names into another module binds them at import time
and would no longer see the patches.

## Options

1. Keep all endpoints in `main.py` (no restructuring).
2. Routers/services `import main` lazily inside each function (import cycle
   main -> routers -> main, hidden in function bodies).
3. Routers are built by factories `build_router(seams)` and services take a
   `seams` argument; `main.py` passes its own module object
   (`sys.modules[__name__]`), typed by the `seams.EngineSeams` Protocol.
4. Edit the tests to patch the new locations (forbidden: tests stay unchanged).

## Decision

Option 3. `main.py` stays the composition root and keeps `get_engine`,
`get_stockfish_instance`, `release_stockfish_instance`, `supabase`,
`run_full_game_analysis`, `SUPABASE_URL`, `SUPABASE_KEY` and `app` as module
globals. `routers/health.py` and `routers/analysis.py` (the only routers that
use patched names) and `services/review.py` read `seams.<name>` at call time.
`routers/moves.py` and `routers/computer.py` use no patched names and are
plain module-level `APIRouter`s.

## Why

Every lookup happens at the same moment as the legacy global lookup in
`main.py` (e.g. `supabase` is read after the analysis loop, the background
task function is resolved per request), so the test seams and runtime
behaviour are identical, with no import cycle and no edits to tests. The
Protocol documents exactly which names are seams (SOLID-08/09: a real test
seam, plain parameter, no container).
