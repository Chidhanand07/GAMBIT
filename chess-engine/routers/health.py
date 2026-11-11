"""GET /health."""

from fastapi import APIRouter

from seams import EngineSeams


def build_router(seams: EngineSeams) -> APIRouter:
    router = APIRouter()

    @router.get("/health")
    def health():
        # KNOWN BUG (preserved): the pool instance acquired here is never released,
        # so every /health call permanently removes one Stockfish from the pool
        # (pool exhausted after STOCKFISH_POOL_SIZE calls). Fix: release_stockfish_instance(sf).
        sf = seams.get_stockfish_instance(depth=1)
        status = "Engine unavailable" if not sf else "online"
        return {"status": "ok", "engine": status}

    return router
