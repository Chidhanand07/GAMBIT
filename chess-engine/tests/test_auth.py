"""
ENG-AUTH: every engine endpoint except GET /health requires the shared secret
in the X-Engine-Key header, and the engine fails closed without one configured.
"""

import chess
import pytest
from fastapi.testclient import TestClient

import config
import main
from tests.conftest import ENGINE_TEST_KEY

START = chess.STARTING_FEN
GAME_ID = "11111111-1111-4111-8111-111111111111"
PGN = '[Event "GAMBIT"]\n\n1. e4 e5 *'

# (method, path, json body) for every route the app serves besides /health.
PROTECTED = [
    ("post", "/validate-move", {"fen": START, "move": "e2e4"}),
    ("post", "/valid-moves", {"fen": START, "move": "e2e4"}),
    ("post", "/analyse-game", {"game_id": GAME_ID, "pgn": PGN, "time_control": "10"}),
    ("post", "/analyze", {"fen": START, "depth": 5}),
    ("post", "/classify-move", {"fen": START, "move": "e2e4"}),
    ("get", "/style-move/health", None),
    ("post", "/style-move", {"fen": START}),
    ("post", "/computer-move", {"fen": START, "difficulty": "easy"}),
]


def call(client, method, path, body, headers=None):
    kwargs = {"headers": headers or {}}
    if body is not None:
        kwargs["json"] = body
    return getattr(client, method)(path, **kwargs)


@pytest.fixture
def anonymous():
    """A client that sends no X-Engine-Key."""
    return TestClient(main.app)


def test_the_protected_list_covers_every_route_except_health():
    served = {
        (next(iter(r.methods - {"HEAD", "OPTIONS"})).lower(), r.path) for r in main.app.routes if hasattr(r, "methods")
    }
    assert served - {("get", "/health")} == {(m, p) for m, p, _ in PROTECTED}


@pytest.mark.parametrize("method,path,body", PROTECTED)
def test_missing_key_is_401(anonymous, method, path, body):
    res = call(anonymous, method, path, body)
    assert res.status_code == 401
    assert res.json() == {"detail": "Invalid engine key"}


@pytest.mark.parametrize("method,path,body", PROTECTED)
@pytest.mark.parametrize("key", ["wrong", "", ENGINE_TEST_KEY + "x", ENGINE_TEST_KEY[:-1], ENGINE_TEST_KEY.upper()])
def test_wrong_key_is_401(anonymous, method, path, body, key):
    assert call(anonymous, method, path, body, {"X-Engine-Key": key}).status_code == 401


@pytest.mark.parametrize("method,path,body", PROTECTED)
def test_correct_key_reaches_the_handler(client, method, path, body):
    # Whatever the handler answers (200, 4xx for the input, 503 for no engine), it is not an auth failure.
    res = call(client, method, path, body)
    assert res.status_code != 401
    assert res.json().get("detail") != "Engine authentication is not configured"


@pytest.mark.parametrize("method,path,body", PROTECTED)
@pytest.mark.parametrize("unset", ["", None])
def test_no_secret_configured_fails_closed_with_503(monkeypatch, caplog, method, path, body, unset):
    monkeypatch.setattr(config, "ENGINE_SHARED_SECRET", unset)
    client = TestClient(main.app)
    # Not even a caller who sends *something* gets through when the engine has no secret.
    for headers in ({}, {"X-Engine-Key": ""}, {"X-Engine-Key": "anything"}):
        res = call(client, method, path, body, headers)
        assert res.status_code == 503
        assert res.json() == {"detail": "Engine authentication is not configured"}
    assert "ENGINE_SHARED_SECRET is not set" in caplog.text


def test_the_key_is_compared_in_constant_time(monkeypatch, anonymous):
    import auth

    seen = []
    real = auth.hmac.compare_digest
    monkeypatch.setattr(auth.hmac, "compare_digest", lambda a, b: seen.append((a, b)) or real(a, b))
    anonymous.post("/valid-moves", json={"fen": START, "move": "e2e4"}, headers={"X-Engine-Key": "guess"})
    assert seen == [(b"guess", ENGINE_TEST_KEY.encode())]


def test_non_ascii_key_is_rejected_not_a_500(anonymous):
    res = anonymous.post(
        "/valid-moves", json={"fen": START, "move": "e2e4"}, headers={"X-Engine-Key": "café".encode("latin-1")}
    )
    assert res.status_code == 401


def test_health_stays_public_and_minimal(anonymous, monkeypatch):
    assert anonymous.get("/health").json() == {"status": "ok", "engine": "Engine unavailable"}
    monkeypatch.setattr(config, "ENGINE_SHARED_SECRET", "")
    assert TestClient(main.app).get("/health").status_code == 200


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_the_api_schema_is_not_served(anonymous, path):
    assert anonymous.get(path).status_code == 404
