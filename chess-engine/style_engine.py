import os
import chess
import torch

from model import StylePolicyNet, encode_board, legal_move_mask, index_to_from_to, get_device

MODEL_PATH = os.environ.get("STYLE_MODEL_PATH", "style_model.pt")

_device = get_device()
_model = None


def _load_model():
    global _model
    if _model is not None:
        return _model
    if not os.path.exists(MODEL_PATH):
        print(f"[style_engine] WARNING: {MODEL_PATH} not found — /style-move will be unavailable.")
        return None
    m = StylePolicyNet().to(_device)
    state_dict = torch.load(MODEL_PATH, map_location=_device)
    m.load_state_dict(state_dict)
    m.eval()
    _model = m
    print(f"[style_engine] Loaded {MODEL_PATH} on device={_device}")
    return _model


_load_model()


def style_model_loaded() -> bool:
    return _model is not None


def get_style_move(fen: str, top_k: int = 3):
    model = _load_model()
    if model is None:
        return None

    try:
        board = chess.Board(fen)
    except ValueError:
        raise ValueError(f"Invalid FEN: {fen}")

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
    for prob, idx in zip(top_probs.tolist(), top_indices.tolist()):
        from_sq, to_sq = index_to_from_to(idx)
        matches = [m for m in board.legal_moves
                   if m.from_square == from_sq and m.to_square == to_sq]
        if not matches:
            continue
        move = matches[0]
        candidates.append({
            "san": board.san(move),
            "uci": move.uci(),
            "confidence": round(prob, 4),
        })

    if not candidates:
        return None

    return {"fen": fen, "top_move": candidates[0], "candidates": candidates}
