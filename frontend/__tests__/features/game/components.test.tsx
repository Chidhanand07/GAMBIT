import { clockStyle, getFormatRating } from '@/features/game/components/PlayerStrip'
import { squareBackground } from '@/features/game/components/Square'
import { outcomeFlags } from '@/features/game/components/GameOverModal'

jest.mock('next/link', () => ({ __esModule: true, default: ({ children }: any) => children }))

describe('getFormatRating (the shared categories: ≤2 bullet, ≤5 blitz, ≤29 rapid, ≥30 classical) [F7]', () => {
    const p = { username: 'u', rating_bullet: 1001.6, rating_blitz: 1100, rating_rapid: 1200.4, rating_classical: 1300 }
    test.each([
        ['1', 1002], ['2+1', 1002], ['3', 1100], ['5', 1100], ['6', 1200], ['9', 1200], ['10', 1200], ['29', 1200], ['30', 1300], ['abc', 1200], [undefined, 1200], ['', 1200],
    ])('%s → %s', (tc, expected) => expect(getFormatRating(p, tc as string | undefined)).toBe(expected))

    test('no player → 1200; missing bucket → 1200', () => {
        expect(getFormatRating(null, '1')).toBe(1200)
        expect(getFormatRating({ username: 'u' }, '1')).toBe(1200)
    })
})

test('clockStyle precedence: critical > mine+active > active > idle', () => {
    expect(clockStyle(true, true, true).color).toBe('#E74C3C')
    expect(clockStyle(false, true, true).color).toBe('var(--accent)')
    expect(clockStyle(false, false, true).color).toBe('var(--text-primary)')
    expect(clockStyle(false, true, false).color).toBe('var(--text-tertiary)')
})

test('squareBackground: check overrides selection, selection overrides last move', () => {
    const base = { isLight: true, isSelected: false, isLastMove: false, isInCheck: false }
    expect(squareBackground(base)).toBe('var(--board-light)')
    expect(squareBackground({ ...base, isLight: false, isLastMove: true })).toBe('rgba(196,150,90,0.4)')
    expect(squareBackground({ ...base, isSelected: true, isLastMove: true })).toBe('rgba(250,250,100,0.55)')
    expect(squareBackground({ ...base, isSelected: true, isInCheck: true })).toBe('rgba(192,57,43,0.75)')
})

test('outcomeFlags: spectators never win or lose but can see a draw', () => {
    expect(outcomeFlags('White wins', 'white')).toEqual({ isSpectator: false, isWin: true, isDraw: false, isLoss: false })
    expect(outcomeFlags('White wins', 'black')).toEqual({ isSpectator: false, isWin: false, isDraw: false, isLoss: true })
    expect(outcomeFlags('Draw', 'spectator')).toEqual({ isSpectator: true, isWin: false, isDraw: true, isLoss: false })
})
