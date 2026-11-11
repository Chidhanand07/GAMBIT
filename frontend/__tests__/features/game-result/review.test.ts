import {
    estRating,
    mergeClassifications,
    moveHighlights,
    playerName,
    replayPositions,
    tallyClassifications,
    uciToPretty,
} from '@/features/game-result/review';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const mv = (ply: number, move: string, classification = 'Good'): any => ({
    ply, move, san: move, classification, accuracy: 0, best_move: move, eval_white: 0,
});

describe('estRating', () => {
    test('null in, null out; clamps to 200..2900; rounds acc*27', () => {
        expect(estRating(null)).toBeNull()
        expect(estRating(0)).toBe(200)
        expect(estRating(50)).toBe(1350)
        expect(estRating(88.26)).toBe(2383)
        expect(estRating(200)).toBe(2900)
    })
})

describe('mergeClassifications', () => {
    test('null game → []; merges, drops non-numeric ply, sorts', () => {
        expect(mergeClassifications(null)).toEqual([])
        const g: any = {
            white_move_classifications: [mv(3, 'g1f3'), mv(1, 'e2e4')],
            black_move_classifications: [mv(2, 'e7e5'), { classification: 'x' }],
        }
        expect(mergeClassifications(g).map((m) => m.ply)).toEqual([1, 2, 3])
        expect(mergeClassifications({ white_move_classifications: null } as any)).toEqual([])
    })
})

describe('replayPositions', () => {
    test('start FEN first, one FEN per legal move, stops at the first illegal move', () => {
        const fens = replayPositions([mv(1, 'e2e4'), mv(2, 'e7e5'), mv(3, 'e1e3'), mv(4, 'g1f3')])
        expect(fens).toHaveLength(3)
        expect(fens[0]).toBe(START)
    })
    test('defaults promotion to queen', () => {
        const fens = replayPositions([mv(1, 'a2a4')])
        expect(fens).toHaveLength(2)
    })
})

describe('tallyClassifications', () => {
    test('counts per label; null/undefined → {}', () => {
        expect(tallyClassifications(null)).toEqual({})
        expect(tallyClassifications(undefined)).toEqual({})
        expect(tallyClassifications([mv(1, 'a', 'Best'), mv(2, 'b', 'Best'), mv(3, 'c', 'Miss')])).toEqual({ Best: 2, Miss: 1 })
    })
})

describe('uciToPretty', () => {
    test('SAN when legal, UCI when fen missing or move illegal', () => {
        expect(uciToPretty(START, 'g1f3')).toBe('Nf3')
        expect(uciToPretty(undefined, 'g1f3')).toBe('g1f3')
        expect(uciToPretty(START, 'e2e5')).toBe('e2e5')
    })
})

describe('moveHighlights / playerName', () => {
    test('slices from/to squares or undefined', () => {
        expect(moveHighlights(null)).toEqual({ lastFrom: undefined, lastTo: undefined, bestFrom: undefined, bestTo: undefined })
        expect(moveHighlights({ ...mv(1, 'e7e8q'), best_move: 'd2d4' })).toEqual({ lastFrom: 'e7', lastTo: 'e8', bestFrom: 'd2', bestTo: 'd4' })
    })
    test('display_name, then username, then fallback', () => {
        expect(playerName({ display_name: 'D', username: 'u' }, 'White')).toBe('D')
        expect(playerName({ display_name: '', username: 'u' }, 'White')).toBe('u')
        expect(playerName(null, 'Black')).toBe('Black')
    })
})
