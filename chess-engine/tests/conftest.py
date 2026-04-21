"""
Conftest: mock the stockfish package so tests run without the binary installed.
The singleton in engine.py is patched to return None, and individual tests
that need a Stockfish instance provide their own MagicMock.
"""
import sys
from unittest.mock import MagicMock

# Stub out the stockfish module before any test imports engine.py
stockfish_stub = MagicMock()
stockfish_stub.Stockfish = MagicMock
sys.modules.setdefault('stockfish', stockfish_stub)
