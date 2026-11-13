"""
SUPABASE-KEYS: the engine reads Supabase's new secret key (SUPABASE_SECRET_KEY)
and falls back to the legacy SUPABASE_SERVICE_KEY; the pinned supabase-py
accepts the new `sb_secret_...` key format.
"""

import importlib

import pytest

import config

KEY_VARS = ("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_KEY")


@pytest.fixture
def reload_config(monkeypatch):
    """Re-import config.py under a given environment (it reads env vars at import)."""

    def _reload(**env):
        for name in KEY_VARS:
            monkeypatch.delenv(name, raising=False)
        for name, value in env.items():
            monkeypatch.setenv(name, value)
        return importlib.reload(config)

    yield _reload
    monkeypatch.undo()
    importlib.reload(config)


def test_new_secret_key_wins_over_the_legacy_name(reload_config):
    cfg = reload_config(SUPABASE_SECRET_KEY="sb_secret_new", SUPABASE_SERVICE_KEY="legacy")
    assert cfg.SUPABASE_KEY == "sb_secret_new"


def test_legacy_service_key_still_works(reload_config):
    assert reload_config(SUPABASE_SERVICE_KEY="legacy").SUPABASE_KEY == "legacy"


def test_an_empty_new_key_falls_back_to_the_legacy_one(reload_config):
    assert reload_config(SUPABASE_SECRET_KEY="", SUPABASE_SERVICE_KEY="legacy").SUPABASE_KEY == "legacy"


def test_no_key_means_no_database_client(reload_config):
    assert reload_config().SUPABASE_KEY == ""


@pytest.mark.parametrize("key", ["sb_secret_abcDEF123_xyz", "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig"])
def test_the_pinned_supabase_client_accepts_new_and_legacy_key_formats(key):
    # supabase==2.0.2 raised "Invalid API key" for anything that was not JWT-shaped.
    from supabase import create_client

    assert create_client("https://example.supabase.co", key) is not None
