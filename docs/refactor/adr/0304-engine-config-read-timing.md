# ADR 0304 — Engine env vars read once in config.py at import time

- **Status:** accepted (PR 17)

## Context

The engine read `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (main.py),
`STOCKFISH_PATH`, `STOCKFISH_POOL_SIZE` (engine.py) and `STYLE_MODEL_PATH`
(style_engine.py) at module import. No other env vars are read (grep for
`environ`/`getenv`/`dotenv`).

## Decision

`chess-engine/config.py` reads all five with the same names and defaults at
its import. `engine`, `style_engine` and `main` import the values as their
own module globals (`engine.POOL_SIZE`, `engine.STOCKFISH_PATH`,
`style_engine.MODEL_PATH`, `main.SUPABASE_URL`, `main.SUPABASE_KEY`), so code
that reads or patches those attributes at call time behaves as before.

## Why

The process environment does not change between the legacy reads, which
all happened during `import main`, so values are identical. The one edge:
an invalid `STOCKFISH_POOL_SIZE` (non-integer) now raises during the import
of *any* engine module (e.g. `import style_engine` alone), rather than only
when `engine` is imported. In production `main` imported `engine` first, so
the service fails at startup exactly as before.
