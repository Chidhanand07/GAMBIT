"""
Late-bound dependencies shared by routers/ and services/ (ADR 0301).

main.py passes ITSELF (the module object) as the `EngineSeams` value, so every
lookup such as `seams.get_engine(...)` or `seams.supabase` reads main's module
global at call time. That keeps the test seams in tests/conftest.py and
tests/test_api.py (monkeypatching `main.get_engine`, `main.supabase`,
`main.run_full_game_analysis`, ...) effective after the code moved out of
main.py, without routers/services importing main (no import cycle).
"""

from collections.abc import Callable
from contextlib import AbstractContextManager
from typing import Any, Protocol


class EngineSeams(Protocol):
    get_engine: Callable[..., AbstractContextManager[Any]]
    get_stockfish_instance: Callable[..., Any]
    release_stockfish_instance: Callable[[Any], None]
    run_full_game_analysis: Callable[[str, str], Any]
    supabase: Any
