/**
 * Tests for server/services/friends.js
 * Validates the atomic join protection (BUG-S5 fix).
 */

// Track calls to the mocked supabase chain
let mockUpdateResult = { data: { id: 'game-1', status: 'active', white_id: 'u1', black_id: 'u2' }, error: null };
let mockSelectResult = { data: { id: 'game-1', status: 'waiting', white_id: 'u1', black_id: null, invite_token: 'tok', invite_expires_at: new Date(Date.now() + 3600000).toISOString(), is_rated: true, time_control: '10' }, error: null };

const mockMaybeSingle = jest.fn();
const mockSingle = jest.fn();
const mockEqChain = { eq: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), maybeSingle: mockMaybeSingle, single: mockSingle };
const mockUpdateChain = { eq: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), maybeSingle: mockMaybeSingle };
const mockFromChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnValue(mockEqChain),
    single: mockSingle,
};

jest.mock('../supabase', () => ({
    supabase: { from: jest.fn().mockReturnValue(mockFromChain) },
}));

const friendsService = require('../services/friends');

describe('joinPrivateGame', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFromChain.select.mockReturnThis();
        mockFromChain.eq.mockReturnThis();
        mockFromChain.update.mockReturnValue(mockEqChain);
        mockEqChain.eq.mockReturnThis();
        mockEqChain.select.mockReturnThis();
        mockSingle.mockResolvedValue(mockSelectResult);
        mockMaybeSingle.mockResolvedValue(mockUpdateResult);
    });

    test('returns updated game on success', async () => {
        mockMaybeSingle.mockResolvedValue({
            data: { id: 'game-1', status: 'active', white_id: 'u1', black_id: 'u2' },
            error: null,
        });

        const game = await friendsService.joinPrivateGame('tok', 'u2');
        expect(game.status).toBe('active');
        expect(game.black_id).toBe('u2');
    });

    test('throws when game already started (maybeSingle returns null)', async () => {
        mockMaybeSingle.mockResolvedValue({ data: null, error: null });

        await expect(friendsService.joinPrivateGame('tok', 'u2'))
            .rejects.toThrow('Game already started or not found');
    });

    test('creator rejoining returns existing game without double-join', async () => {
        // Creator (u1 = white) re-joins — should return game immediately
        const game = await friendsService.joinPrivateGame('tok', 'u1');
        // Update should NOT have been called (early return)
        expect(mockFromChain.update).not.toHaveBeenCalled();
        expect(game.white_id).toBe('u1');
    });
});
