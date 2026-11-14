"""
Caller authentication for the engine API (ENG-AUTH).

The engine is only meant to be called by GAMBIT's own servers (the game server
and the Next.js route handlers). They present a shared secret in the
`X-Engine-Key` header; `require_engine_key` is the FastAPI dependency main.py
attaches to every router except /health.

Fail closed: with no secret configured the protected endpoints answer 503
rather than running open.
"""

import hmac
import logging

from fastapi import Header, HTTPException

import config

logger = logging.getLogger(__name__)

NOT_CONFIGURED = "Engine authentication is not configured"
INVALID_KEY = "Invalid engine key"


def require_engine_key(x_engine_key: str | None = Header(default=None)) -> None:
    """Reject the request unless X-Engine-Key equals ENGINE_SHARED_SECRET."""
    # Read through the module at call time so a changed setting (tests) is seen.
    secret = config.ENGINE_SHARED_SECRET
    if not secret:
        logger.error("ENGINE_SHARED_SECRET is not set: refusing every protected engine request")
        raise HTTPException(status_code=503, detail=NOT_CONFIGURED)
    # Bytes, so a non-ASCII header value is a mismatch instead of a TypeError.
    presented = (x_engine_key or "").encode("utf-8")
    if not hmac.compare_digest(presented, secret.encode("utf-8")):
        raise HTTPException(status_code=401, detail=INVALID_KEY)
