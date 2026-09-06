"""
Model architecture + board/move encoding for the "plays like me" chess bot.

INPUT REPRESENTATION:
  A chess position (FEN) is encoded as a 13 x 8 x 8 tensor:
    - 12 planes: one per (piece type x color) — where each piece currently sits
    - 1 plane: whose turn it is (all 1s if white to move, all 0s if black)

OUTPUT REPRESENTATION:
  A simplified move space of size 4096 = 64 (from-square) x 64 (to-square).
  Promotions are treated as always-queen for this move-index scheme (the vast
  majority of real promotions are to queen anyway); under-promotions are rare
  enough in real games that we don't dedicate output classes to them here.

This keeps the model small enough to train comfortably on an M1 (MPS) while
still being a real position -> move-distribution policy network, not a lookup
table.
"""

import chess
import numpy as np
import torch
import torch.nn as nn

NUM_MOVE_CLASSES = 64 * 64  # from_square * 64 + to_square


def encode_board(fen: str) -> np.ndarray:
    """FEN -> 13x8x8 float32 tensor."""
    board = chess.Board(fen)
    planes = np.zeros((13, 8, 8), dtype=np.float32)

    piece_to_plane = {
        (chess.PAWN, chess.WHITE): 0, (chess.KNIGHT, chess.WHITE): 1,
        (chess.BISHOP, chess.WHITE): 2, (chess.ROOK, chess.WHITE): 3,
        (chess.QUEEN, chess.WHITE): 4, (chess.KING, chess.WHITE): 5,
        (chess.PAWN, chess.BLACK): 6, (chess.KNIGHT, chess.BLACK): 7,
        (chess.BISHOP, chess.BLACK): 8, (chess.ROOK, chess.BLACK): 9,
        (chess.QUEEN, chess.BLACK): 10, (chess.KING, chess.BLACK): 11,
    }

    for square, piece in board.piece_map().items():
        plane_idx = piece_to_plane[(piece.piece_type, piece.color)]
        row, col = divmod(square, 8)
        planes[plane_idx, row, col] = 1.0

    if board.turn == chess.WHITE:
        planes[12, :, :] = 1.0

    return planes


def move_to_index(move_uci: str) -> int:
    """UCI move string (e.g. 'e2e4', 'e7e8q') -> integer class index 0..4095."""
    move = chess.Move.from_uci(move_uci)
    return move.from_square * 64 + move.to_square


def index_to_from_to(index: int):
    """Inverse of move_to_index — returns (from_square, to_square)."""
    return divmod(index, 64)


def legal_move_mask(fen: str) -> np.ndarray:
    """
    Boolean mask of length 4096: True for classes that correspond to at least
    one legal move in this position. Used at inference time to zero out
    illegal moves before sampling, and optionally during training.
    """
    board = chess.Board(fen)
    mask = np.zeros(NUM_MOVE_CLASSES, dtype=bool)
    for move in board.legal_moves:
        mask[move_to_index(move.uci())] = True
    return mask


class StylePolicyNet(nn.Module):
    """
    Small CNN policy network: board position -> move-class logits.

    Architecture: a handful of conv blocks over the 13x8x8 input, then a
    fully-connected head producing 4096 logits (one per from/to square pair).
    Deliberately compact — this is sized for fine-tuning on thousands of
    positions on a laptop GPU (M1 MPS), not for training from scratch on
    millions of positions like a full engine would need.
    """

    def __init__(self, in_channels=13, num_classes=NUM_MOVE_CLASSES):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(in_channels, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.Conv2d(128, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
        )
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Linear(128 * 8 * 8, 512),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(512, num_classes),
        )

    def forward(self, x):
        x = self.conv(x)
        return self.head(x)  # raw logits, shape (batch, 4096)


def get_device():
    """Prefer Apple MPS (M1/M2 GPU), fall back to CUDA, then CPU."""
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")
