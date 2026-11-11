"""
model.py — board encoding and the 4096-class move space the style model uses.
"""
import random

import chess
import numpy as np
import pytest
import torch

from model import (NUM_MOVE_CLASSES, StylePolicyNet, encode_board, index_to_from_to,
                   legal_move_mask, move_to_index)


def test_encode_board_shape_and_piece_counts():
    planes = encode_board(chess.STARTING_FEN)
    assert planes.shape == (13, 8, 8)
    assert planes.dtype == np.float32
    assert planes[:12].sum() == 32           # 32 pieces
    assert planes[0].sum() == 8              # white pawns
    assert planes[11].sum() == 1             # black king
    assert planes[12].all()                  # white to move


def test_encode_board_side_to_move_plane():
    fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    assert not encode_board(fen)[12].any()


def test_encode_board_places_pieces_on_the_right_squares():
    planes = encode_board(chess.STARTING_FEN)
    row, col = divmod(chess.E1, 8)
    assert planes[5, row, col] == 1.0        # white king on e1
    row, col = divmod(chess.D8, 8)
    assert planes[10, row, col] == 1.0       # black queen on d8


def test_move_index_round_trip():
    for uci in ('e2e4', 'a1h8', 'h8a1', 'e7e8q', 'g1f3'):
        idx = move_to_index(uci)
        assert 0 <= idx < NUM_MOVE_CLASSES
        frm, to = index_to_from_to(idx)
        mv = chess.Move.from_uci(uci)
        assert (frm, to) == (mv.from_square, mv.to_square)


def test_legal_move_mask_matches_legal_moves_on_random_positions():
    rng = random.Random(1)
    for _ in range(30):
        b = chess.Board()
        for _ in range(rng.randint(0, 40)):
            moves = list(b.legal_moves)
            if not moves:
                break
            b.push(rng.choice(moves))
        mask = legal_move_mask(b.fen())
        expected = {move_to_index(m.uci()) for m in b.legal_moves}
        assert set(np.flatnonzero(mask)) == expected


def test_legal_move_mask_is_empty_when_mated():
    mated = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'
    assert legal_move_mask(mated).sum() == 0


def test_network_outputs_one_logit_per_move_class():
    net = StylePolicyNet()
    x = torch.from_numpy(encode_board(chess.STARTING_FEN)).unsqueeze(0)
    with torch.no_grad():
        out = net(x)
    assert out.shape == (1, NUM_MOVE_CLASSES)
    assert torch.isfinite(out).all()


def test_shipped_weights_load_into_the_network():
    import os
    path = os.path.join(os.path.dirname(__file__), '..', 'style_model.pt')
    if not os.path.exists(path):
        pytest.skip('style_model.pt not present')
    net = StylePolicyNet()
    # weights_only=True: the checkpoint must be plain tensors, never pickled code.
    net.load_state_dict(torch.load(path, map_location='cpu', weights_only=True))
