"""
Where the MAVERICK style weights come from (ENGINE-BUILD).

The weights normally ship with the code (style_model.pt next to main.py). When
that file is absent and MAVERICK_MODEL_URL is set, `ensure_model` downloads it
once and accepts it only if its SHA-256 equals MAVERICK_MODEL_SHA256. A
checkpoint is a pickle, so a file from the network is never handed to
torch.load without that check. Anything else is reported as a status other
than MODEL_READY; the caller then runs without the style model.
"""

import hashlib
import logging
import os
import re
import urllib.request
from collections.abc import Callable

log = logging.getLogger("model_store")

# Outcomes of `ensure_model`. Only MODEL_READY means the file may be loaded.
MODEL_READY = "ready"
MODEL_MISSING = "missing"
MODEL_CHECKSUM_REQUIRED = "checksum_required"
MODEL_CHECKSUM_MISMATCH = "checksum_mismatch"
MODEL_DOWNLOAD_FAILED = "download_failed"

DOWNLOAD_SUFFIX = ".download"
DOWNLOAD_TIMEOUT_SECONDS = 60
MAX_MODEL_BYTES = 512 * 1024 * 1024  # refuse to fill the disk; the shipped model is ~26 MB
CHUNK_BYTES = 1024 * 1024
SHA256_HEX = re.compile(r"[0-9a-f]{64}")
ALLOWED_URL_PREFIX = "https://"

Downloader = Callable[[str, str], None]


def sha256_of(path: str) -> str:
    """Hex SHA-256 of the file at `path` (what `shasum -a 256 <file>` prints)."""
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(CHUNK_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_to(url: str, dest: str) -> None:
    """Stream `url` (https only) into `dest`; raises on any failure or above MAX_MODEL_BYTES."""
    if not url.startswith(ALLOWED_URL_PREFIX):
        raise ValueError("the model URL must start with https://")
    request = urllib.request.Request(url, headers={"User-Agent": "gambit-engine"})
    written = 0
    with urllib.request.urlopen(request, timeout=DOWNLOAD_TIMEOUT_SECONDS) as response, open(dest, "wb") as out:
        for chunk in iter(lambda: response.read(CHUNK_BYTES), b""):
            written += len(chunk)
            if written > MAX_MODEL_BYTES:
                raise ValueError(f"the model is larger than {MAX_MODEL_BYTES} bytes")
            out.write(chunk)


def _remove(path: str) -> None:
    try:
        os.remove(path)
    except FileNotFoundError:
        pass


def _fetch_verified(path: str, url: str, sha256: str, download: Downloader) -> str:
    """Download to a temporary name; it becomes `path` only after the checksum matched."""
    if not url.startswith(ALLOWED_URL_PREFIX):
        log.error("MAVERICK_MODEL_URL must start with https://; the style model is unavailable")
        return MODEL_DOWNLOAD_FAILED
    partial = path + DOWNLOAD_SUFFIX
    try:
        download(url, partial)
        actual = sha256_of(partial)
    except Exception as e:
        log.error("Downloading the style model failed: %s", e)
        _remove(partial)
        return MODEL_DOWNLOAD_FAILED
    if actual != sha256:
        log.error("The downloaded style model has SHA-256 %s, expected %s; it was deleted", actual, sha256)
        _remove(partial)
        return MODEL_CHECKSUM_MISMATCH
    os.replace(partial, path)
    log.info("Downloaded and verified the style model (%s)", path)
    return MODEL_READY


def ensure_model(path: str, url: str, sha256: str, download: Downloader = download_to) -> str:
    """
    Make sure a trustworthy model file is at `path`; returns one of the MODEL_* values.

    - The file is there: MODEL_READY. If a checksum is configured the file must
      match it; a file that does not is not used (and is replaced when a URL is set).
    - The file is absent and no URL is set: MODEL_MISSING.
    - A URL is set: the checksum is mandatory (MODEL_CHECKSUM_REQUIRED without a
      well-formed one, and nothing is downloaded). The download is kept only
      if it matches (else MODEL_CHECKSUM_MISMATCH / MODEL_DOWNLOAD_FAILED).
    """
    url = url.strip()
    sha256 = sha256.strip().lower()
    present = os.path.exists(path)

    if present and not sha256:
        return MODEL_READY
    if not present and not url:
        return MODEL_MISSING
    if not SHA256_HEX.fullmatch(sha256):
        log.error("MAVERICK_MODEL_SHA256 must be the 64 hex characters of the model's SHA-256")
        return MODEL_CHECKSUM_REQUIRED
    if present and sha256_of(path) == sha256:
        return MODEL_READY
    if not url:
        log.error("%s does not match MAVERICK_MODEL_SHA256; the style model is unavailable", path)
        return MODEL_CHECKSUM_MISMATCH
    return _fetch_verified(path, url, sha256, download)
