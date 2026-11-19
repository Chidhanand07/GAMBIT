import { normalizeFen } from '@/features/analysis/board'
import { whiteShare } from '@/features/analysis/components/EvalBar'
import { QUICK_POSITIONS, isShowing } from '@/features/analysis/quickPositions'

describe('whiteShare (eval bar split)', () => {
    test('50/50 without an evaluation, proportional within ±6, clamped beyond', () => {
        expect(whiteShare(null)).toBe(50)
        expect(whiteShare({ score: 3, mate: null, best_move: 'e2e4' })).toBe(75)
        expect(whiteShare({ score: -1.5, mate: null, best_move: 'e2e4' })).toBe(37.5)
        expect(whiteShare({ score: 100, mate: 2, best_move: 'e2e4' })).toBe(100)
        expect(whiteShare({ score: -100, mate: -1, best_move: 'e2e4' })).toBe(0)
    })
})

describe('normalizeFen / isShowing', () => {
    test('normalizes an unusable en-passant square; null for an invalid FEN', () => {
        expect(normalizeFen('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2')).toBe(
            'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        )
        expect(normalizeFen('garbage')).toBeNull()
    })

    test('a preset is showing when the board FEN matches it after normalization', () => {
        const sicilian = QUICK_POSITIONS.find((q) => q.name === 'Sicilian Defense')!
        expect(isShowing(sicilian, 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')).toBe(true)
        expect(isShowing(sicilian, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(false)
        expect(QUICK_POSITIONS.every((q) => normalizeFen(q.fen) !== null)).toBe(true)
    })
})
