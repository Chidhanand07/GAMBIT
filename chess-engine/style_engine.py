"""
MAVERICK style policy: loads style_model.pt and ranks moves "like the user".

The model is optional. When the weights are missing, fail their checksum or
cannot be read, the style model is "unavailable": `_load_model()` answers None,
/style-move answers 503 and the computer opponent plays without it.
"""

from typing import Any

import chess
import torch

from config import MODEL_PATH, MODEL_SHA256, MODEL_URL
from model import StylePolicyNet, encode_board, get_device, index_to_from_to, legal_move_mask
from services.model_store import MODEL_READY, ensure_model
from services.model_store import download_to as download_model

MODEL_LOAD_FAILED = "load_failed"

_device = get_device()
_model = None
# Outcome of the one attempt to obtain and load the weights (None = not tried yet).
_model_status: str | None = None


def _read_weights() -> StylePolicyNet:
    m = StylePolicyNet().to(_device)
    # weights_only: the checkpoint must be plain tensors, never pickled code.
    state_dict = torch.load(MODEL_PATH, map_location=_device, weights_only=True)
    m.load_state_dict(state_dict)
    m.eval()
    return m


def _load_model() -> StylePolicyNet | None:
    """The loaded network, or None when the style model is unavailable. Tried once per process."""
    global _model, _model_status
    if _model_status is not None:
        return _model
    status = ensure_model(MODEL_PATH, MODEL_URL, MODEL_SHA256, download=download_model)
    if status == MODEL_READY:
        try:
            _model = _read_weights()
        except Exception as e:
            print(f"[style_engine] WARNING: {MODEL_PATH} could not be loaded: {e}")
            status = MODEL_LOAD_FAILED
    _model_status = status
    if _model is None:
        print(f"[style_engine] WARNING: style model unavailable ({status}); MAVERICK plays without it.")
    else:
        print(f"[style_engine] Loaded {MODEL_PATH} on device={_device}")
    return _model


_load_model()


def style_model_loaded() -> bool:
    return _model is not None


def style_model_status() -> str | None:
    """MODEL_READY when loaded; otherwise why the style model is unavailable."""
    return _model_status


def get_style_move(fen: str, top_k: int = 3) -> dict[str, Any] | None:
    model = _load_model()
    if model is None:
        return None

    try:
        board = chess.Board(fen)
    except ValueError as e:
        raise ValueError(f"Invalid FEN: {fen}") from e

    board_tensor = encode_board(fen)
    x = torch.from_numpy(board_tensor).unsqueeze(0).to(_device)

    with torch.no_grad():
        logits = model(x)[0]

    mask = legal_move_mask(fen)
    if mask.sum() == 0:
        return None

    mask_tensor = torch.from_numpy(mask).to(_device)
    masked_logits = logits.masked_fill(~mask_tensor, float("-inf"))
    probs = torch.softmax(masked_logits, dim=0)

    k = min(top_k, int(mask.sum()))
    top_probs, top_indices = torch.topk(probs, k)

    candidates = []
    for prob, idx in zip(top_probs.tolist(), top_indices.tolist(), strict=False):
        from_sq, to_sq = index_to_from_to(idx)
        matches = [m for m in board.legal_moves if m.from_square == from_sq and m.to_square == to_sq]
        if not matches:
            continue
        move = matches[0]
        candidates.append(
            {
                "san": board.san(move),
                "uci": move.uci(),
                "confidence": round(prob, 4),
            }
        )

    if not candidates:
        return None

    return {"fen": fen, "top_move": candidates[0], "candidates": candidates}
