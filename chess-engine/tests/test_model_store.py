"""
ENGINE-BUILD: the MAVERICK weights are either on disk or fetched once from
MAVERICK_MODEL_URL and checked against MAVERICK_MODEL_SHA256. A file that is
missing, cannot be fetched or does not match the checksum leaves the style
model "unavailable"; it never crashes the engine and is never loaded.

No test touches the network: the downloader is injected.
"""

import hashlib
import os

import chess
import pytest

import computer_engine
import style_engine
from services import model_store
from services.model_store import (
    MODEL_CHECKSUM_MISMATCH,
    MODEL_CHECKSUM_REQUIRED,
    MODEL_DOWNLOAD_FAILED,
    MODEL_MISSING,
    MODEL_READY,
    ensure_model,
    sha256_of,
)

START = chess.STARTING_FEN
URL = "https://models.example.test/style_model.pt"
GOOD = b"genuine weights"
GOOD_SHA = hashlib.sha256(GOOD).hexdigest()
REAL_MODEL = os.path.join(os.path.dirname(__file__), "..", "style_model.pt")


class Downloader:
    """Stands in for the HTTP download: writes `payload` to the destination."""

    def __init__(self, payload=GOOD, error=None):
        self.payload = payload
        self.error = error
        self.calls = []

    def __call__(self, url, dest):
        self.calls.append((url, dest))
        if self.payload is not None:
            with open(dest, "wb") as f:
                f.write(self.payload)
        if self.error:
            raise self.error


def never(url, dest):
    raise AssertionError("the model must not be downloaded")


@pytest.fixture
def path(tmp_path):
    return str(tmp_path / "style_model.pt")


def leftovers(path):
    return sorted(os.listdir(os.path.dirname(path)))


# ── sha256_of ────────────────────────────────────────────────────────────────


def test_sha256_of_matches_hashlib(tmp_path):
    f = tmp_path / "blob"
    f.write_bytes(b"x" * 3_000_000)  # more than one read chunk
    assert sha256_of(str(f)) == hashlib.sha256(b"x" * 3_000_000).hexdigest()


def test_sha256_of_an_empty_file(tmp_path):
    f = tmp_path / "empty"
    f.write_bytes(b"")
    assert sha256_of(str(f)) == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


# ── ensure_model: file already there ─────────────────────────────────────────


def test_a_present_file_is_ready_without_any_configuration(path):
    open(path, "wb").write(GOOD)
    assert ensure_model(path, "", "", download=never) == MODEL_READY


def test_a_present_file_is_never_downloaded_again(path):
    open(path, "wb").write(GOOD)
    assert ensure_model(path, URL, GOOD_SHA, download=never) == MODEL_READY


def test_a_present_file_is_checked_when_a_checksum_is_configured(path):
    open(path, "wb").write(b"something else")
    assert ensure_model(path, "", GOOD_SHA, download=never) == MODEL_CHECKSUM_MISMATCH
    assert os.path.exists(path)  # nothing told us to replace it: it is left alone, just not used


def test_a_present_file_with_the_wrong_checksum_is_replaced_by_a_verified_download(path):
    open(path, "wb").write(b"old weights")
    dl = Downloader()
    assert ensure_model(path, URL, GOOD_SHA, download=dl) == MODEL_READY
    assert open(path, "rb").read() == GOOD
    assert len(dl.calls) == 1


def test_the_checksum_may_be_written_in_upper_case_or_with_spaces(path):
    open(path, "wb").write(GOOD)
    assert ensure_model(path, "", f"  {GOOD_SHA.upper()}\n", download=never) == MODEL_READY


# ── ensure_model: file missing ───────────────────────────────────────────────


def test_missing_without_a_url_is_missing(path):
    assert ensure_model(path, "", "", download=never) == MODEL_MISSING
    assert ensure_model(path, "", GOOD_SHA, download=never) == MODEL_MISSING


def test_missing_with_a_url_is_downloaded_and_verified(path):
    dl = Downloader()
    assert ensure_model(path, URL, GOOD_SHA, download=dl) == MODEL_READY
    assert open(path, "rb").read() == GOOD
    assert dl.calls[0][0] == URL
    assert leftovers(path) == ["style_model.pt"]  # no partial file left behind


@pytest.mark.parametrize("sha", ["", "   ", "abc123", "z" * 64, GOOD_SHA + "00", "sha256:" + GOOD_SHA])
def test_a_url_without_a_usable_checksum_downloads_nothing(path, sha):
    assert ensure_model(path, URL, sha, download=never) == MODEL_CHECKSUM_REQUIRED
    assert leftovers(path) == []


def test_a_download_that_does_not_match_the_checksum_is_deleted(path):
    dl = Downloader(payload=b"tampered weights")
    assert ensure_model(path, URL, GOOD_SHA, download=dl) == MODEL_CHECKSUM_MISMATCH
    assert not os.path.exists(path)
    assert leftovers(path) == []


def test_an_empty_download_is_a_checksum_mismatch(path):
    assert ensure_model(path, URL, GOOD_SHA, download=Downloader(payload=b"")) == MODEL_CHECKSUM_MISMATCH
    assert leftovers(path) == []


@pytest.mark.parametrize("error", [OSError("connection reset"), TimeoutError("timed out"), ValueError("too large")])
def test_a_failed_download_leaves_nothing_behind(path, error):
    dl = Downloader(payload=GOOD[:5], error=error)  # died half-way through
    assert ensure_model(path, URL, GOOD_SHA, download=dl) == MODEL_DOWNLOAD_FAILED
    assert leftovers(path) == []


def test_a_failed_download_keeps_a_mismatching_file_but_does_not_use_it(path):
    open(path, "wb").write(b"old weights")
    dl = Downloader(payload=None, error=OSError("offline"))
    assert ensure_model(path, URL, GOOD_SHA, download=dl) == MODEL_DOWNLOAD_FAILED
    assert open(path, "rb").read() == b"old weights"


@pytest.mark.parametrize("url", ["http://models.example.test/m.pt", "file:///etc/passwd", "ftp://x/m.pt", "m.pt"])
def test_only_https_urls_are_fetched(path, url):
    assert ensure_model(path, url, GOOD_SHA, download=never) == MODEL_DOWNLOAD_FAILED
    assert leftovers(path) == []


def test_the_default_downloader_refuses_a_url_that_is_not_https(path):
    with pytest.raises(ValueError):
        model_store.download_to("http://models.example.test/m.pt", path)
    assert not os.path.exists(path)


# ── style_engine: loading, and reporting "unavailable" ───────────────────────


@pytest.fixture
def fresh_style_engine(monkeypatch, tmp_path):
    """style_engine as at process start, pointed at an empty directory, with no network."""
    monkeypatch.setattr(style_engine, "_model", None)
    monkeypatch.setattr(style_engine, "_model_status", None)
    monkeypatch.setattr(style_engine, "MODEL_PATH", str(tmp_path / "style_model.pt"))
    monkeypatch.setattr(style_engine, "MODEL_URL", "")
    monkeypatch.setattr(style_engine, "MODEL_SHA256", "")
    monkeypatch.setattr(style_engine, "download_model", never)
    return style_engine


def test_the_tracked_model_is_loaded_and_ready():
    assert style_engine.style_model_loaded() is True
    assert style_engine.style_model_status() == MODEL_READY


def test_a_missing_model_is_unavailable_not_a_crash(fresh_style_engine):
    assert fresh_style_engine._load_model() is None
    assert fresh_style_engine.style_model_loaded() is False
    assert fresh_style_engine.style_model_status() == MODEL_MISSING
    assert fresh_style_engine.get_style_move(START) is None


def test_the_model_is_downloaded_verified_and_loaded(fresh_style_engine, monkeypatch):
    real = open(REAL_MODEL, "rb").read()
    dl = Downloader(payload=real)
    monkeypatch.setattr(fresh_style_engine, "MODEL_URL", URL)
    monkeypatch.setattr(fresh_style_engine, "MODEL_SHA256", hashlib.sha256(real).hexdigest())
    monkeypatch.setattr(fresh_style_engine, "download_model", dl)

    assert fresh_style_engine._load_model() is not None
    assert fresh_style_engine.style_model_status() == MODEL_READY
    assert fresh_style_engine.get_style_move(START)["top_move"]["uci"]
    fresh_style_engine._load_model()
    assert len(dl.calls) == 1


def test_a_download_with_the_wrong_checksum_is_never_loaded(fresh_style_engine, monkeypatch):
    real = open(REAL_MODEL, "rb").read()  # perfectly loadable, but not the file that was pinned
    monkeypatch.setattr(fresh_style_engine, "MODEL_URL", URL)
    monkeypatch.setattr(fresh_style_engine, "MODEL_SHA256", GOOD_SHA)
    monkeypatch.setattr(fresh_style_engine, "download_model", Downloader(payload=real))

    assert fresh_style_engine._load_model() is None
    assert fresh_style_engine.style_model_status() == MODEL_CHECKSUM_MISMATCH
    assert not os.path.exists(fresh_style_engine.MODEL_PATH)


def test_a_failed_download_is_tried_once_per_process_not_on_every_request(fresh_style_engine, monkeypatch):
    dl = Downloader(payload=None, error=OSError("offline"))
    monkeypatch.setattr(fresh_style_engine, "MODEL_URL", URL)
    monkeypatch.setattr(fresh_style_engine, "MODEL_SHA256", GOOD_SHA)
    monkeypatch.setattr(fresh_style_engine, "download_model", dl)
    for _ in range(3):
        assert fresh_style_engine._load_model() is None
    assert len(dl.calls) == 1
    assert fresh_style_engine.style_model_status() == MODEL_DOWNLOAD_FAILED


def test_a_file_that_is_not_a_checkpoint_is_unavailable_not_a_crash(fresh_style_engine):
    open(fresh_style_engine.MODEL_PATH, "wb").write(b"this is not a torch checkpoint")
    assert fresh_style_engine._load_model() is None
    assert fresh_style_engine.style_model_loaded() is False
    assert fresh_style_engine.style_model_status() == style_engine.MODEL_LOAD_FAILED


def test_a_pickle_that_runs_code_is_refused(fresh_style_engine, tmp_path):
    import pickle

    marker = tmp_path / "pwned"

    class Evil:
        def __reduce__(self):
            return (open, (str(marker), "w"))

    with open(fresh_style_engine.MODEL_PATH, "wb") as f:
        pickle.dump(Evil(), f)
    assert fresh_style_engine._load_model() is None
    assert not marker.exists()


# ── endpoints with the model unavailable ─────────────────────────────────────


def test_style_move_is_503_when_the_model_is_unavailable(client, fresh_style_engine):
    res = client.post("/style-move", json={"fen": START})
    assert res.status_code == 503
    assert res.json()["detail"] == "Style model unavailable"


def test_style_move_health_reports_the_model_as_not_loaded(client, fresh_style_engine):
    assert client.get("/style-move/health").json() == {"model_loaded": False}


def test_style_move_bad_fen_is_still_400_when_the_model_is_unavailable(client, fresh_style_engine):
    assert client.post("/style-move", json={"fen": "bad"}).status_code == 400


def test_style_move_without_legal_moves_is_422_when_the_model_is_loaded(client):
    mated = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
    assert client.post("/style-move", json={"fen": mated}).status_code == 422


@pytest.mark.parametrize("difficulty", ["easy", "medium", "hard"])
def test_computer_move_falls_back_to_stockfish_when_the_model_is_unavailable(
    client, stockfish, fresh_style_engine, difficulty
):
    best = chess.Move.from_uci("d2d4")
    stockfish.instance._best = lambda b: best
    res = client.post("/computer-move", json={"fen": START, "difficulty": difficulty})
    assert res.status_code == 200
    assert res.json()["uci"] == "d2d4"


def test_computer_move_still_answers_without_model_or_engine(client, fresh_style_engine):
    res = client.post("/computer-move", json={"fen": START})
    assert res.status_code == 200
    assert chess.Move.from_uci(res.json()["uci"]) in chess.Board(START).legal_moves


def test_computer_engine_uses_the_same_loader(fresh_style_engine):
    assert computer_engine._model_move_ranking(START) is None
