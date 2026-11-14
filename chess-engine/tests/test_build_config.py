"""
ENGINE-BUILD: one description of how the engine is built.

Stockfish is installed by chess-engine/Dockerfile and nowhere else; the root
render.yaml builds that Dockerfile; every environment variable config.py reads
is documented in .env.example and DEPLOY.md.
"""

import os
import re

ENGINE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REPO_ROOT = os.path.dirname(ENGINE_DIR)


def read(*parts):
    with open(os.path.join(*parts), encoding="utf-8") as f:
        return f.read()


def uncommented(text):
    return "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("#"))


def config_env_vars():
    return sorted(set(re.findall(r'os\.environ\.get\(\s*"([A-Z0-9_]+)"', read(ENGINE_DIR, "config.py"))))


def test_there_is_one_render_blueprint_at_the_repository_root():
    assert os.path.exists(os.path.join(REPO_ROOT, "render.yaml"))
    assert not os.path.exists(os.path.join(ENGINE_DIR, "render.yaml"))


def test_render_builds_the_dockerfile_and_has_no_build_of_its_own():
    blueprint = uncommented(read(REPO_ROOT, "render.yaml"))
    assert re.search(r"^\s*runtime:\s*docker\s*$", blueprint, re.M)
    assert re.search(r"^\s*dockerfilePath:\s*\./chess-engine/Dockerfile\s*$", blueprint, re.M)
    assert re.search(r"^\s*dockerContext:\s*\./chess-engine\s*$", blueprint, re.M)
    for forbidden in ("buildCommand", "startCommand", "apt-get", "pip install", "env: python"):
        assert forbidden not in blueprint


def test_stockfish_is_installed_only_by_the_dockerfile():
    dockerfile = uncommented(read(ENGINE_DIR, "Dockerfile"))
    assert re.search(r"apt-get install[^\n]*\bstockfish\b", dockerfile)
    blueprint = uncommented(read(REPO_ROOT, "render.yaml"))
    assert "install" not in blueprint
    # The Dockerfile owns the path of the binary it installs; a second value here could disagree.
    assert "STOCKFISH_PATH" not in blueprint


def test_the_dockerfile_sets_stockfish_path_and_fails_the_build_without_the_binary():
    dockerfile = uncommented(read(ENGINE_DIR, "Dockerfile"))
    assert re.search(r"^ENV STOCKFISH_PATH=/usr/games/stockfish\s*$", dockerfile, re.M)
    assert 'test -x "$STOCKFISH_PATH"' in dockerfile


def test_the_container_listens_on_the_port_the_platform_assigns():
    assert "${PORT:-8001}" in uncommented(read(ENGINE_DIR, "Dockerfile"))


def test_the_image_does_not_ship_local_environments_or_secrets():
    ignored = read(ENGINE_DIR, ".dockerignore").split()
    for entry in ("venv", ".venv", ".env", "tests"):
        assert entry in ignored
    assert "style_model.pt" not in ignored  # the tracked weights ship in the image


def test_config_reads_the_model_download_settings():
    assert {"MAVERICK_MODEL_URL", "MAVERICK_MODEL_SHA256", "STOCKFISH_PATH", "STYLE_MODEL_PATH"} <= set(
        config_env_vars()
    )


def test_every_env_var_config_reads_is_in_env_example_and_the_deploy_guide():
    env_example = read(ENGINE_DIR, ".env.example")
    deploy = read(REPO_ROOT, "DEPLOY.md")
    for name in config_env_vars():
        assert name in env_example, f"{name} is missing from chess-engine/.env.example"
        assert name in deploy, f"{name} is missing from DEPLOY.md"


def test_the_model_download_settings_are_in_the_render_blueprint():
    blueprint = uncommented(read(REPO_ROOT, "render.yaml"))
    for name in ("MAVERICK_MODEL_URL", "MAVERICK_MODEL_SHA256", "ENGINE_SHARED_SECRET", "SUPABASE_SECRET_KEY"):
        assert re.search(rf"^\s*- key: {name}\s*$", blueprint, re.M), name


def test_the_deploy_guide_explains_the_manual_model_upload():
    deploy = read(REPO_ROOT, "DEPLOY.md")
    assert "shasum -a 256 style_model.pt" in deploy
    assert "apt-get install -y stockfish && pip install" not in deploy  # the old native build
