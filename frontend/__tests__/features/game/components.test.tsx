import { clockStyle, getFormatRating } from '@/features/game/components/PlayerStrip'
import { squareBackground } from '@/features/game/components/Square'
import { render, screen } from '@testing-library/react'
import GameOverModal, { outcomeFlags } from '@/features/game/components/GameOverModal'
import HistoryControls from '@/features/game/components/HistoryControls'

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
    const none = { isAborted: false }
    expect(outcomeFlags('White wins', 'white')).toEqual({ isSpectator: false, isWin: true, isDraw: false, isLoss: false, ...none })
    expect(outcomeFlags('White wins', 'black')).toEqual({ isSpectator: false, isWin: false, isDraw: false, isLoss: true, ...none })
    expect(outcomeFlags('Draw', 'spectator')).toEqual({ isSpectator: true, isWin: false, isDraw: true, isLoss: false, ...none })
})

describe('an aborted game is nobody\'s loss [FIRST-MOVE]', () => {
    test.each(['white', 'black'] as const)('outcomeFlags for %s: neither win, draw nor loss', (color) => {
        expect(outcomeFlags('Aborted', color)).toEqual({ isSpectator: false, isWin: false, isDraw: false, isLoss: false, isAborted: true })
    })

    test('the modal says "Game aborted" and that nothing was rated, not "You Lost"', () => {
        const noop = () => {}
        render(
            <GameOverModal
                gameOver={{ result: 'Aborted', reason: 'Aborted' }}
                myColor="white"
                ratingChange={null}
                rematchState="idle"
                onClose={noop}
                onReview={noop}
                onNewGame={noop}
                onRematch={noop}
            />,
        )
        expect(screen.getByText('Game aborted')).toBeInTheDocument()
        expect(screen.getByText('No game was played · not rated')).toBeInTheDocument()
        expect(screen.queryByText('You Lost')).not.toBeInTheDocument()
        expect(screen.queryByText(/^by /)).not.toBeInTheDocument()
    })
})

test('HistoryControls: at live the forward button is disabled (it would stay live); in history it steps [F6]', () => {
    const goToMove = jest.fn()
    const { rerender } = render(<HistoryControls viewIndex={null} snapshotCount={3} isLive goToMove={goToMove} />)
    const buttons = () => screen.getAllByRole('button')
    expect(buttons()[2]).toBeDisabled()
    buttons()[1].click()
    expect(goToMove).toHaveBeenLastCalledWith(1)
    rerender(<HistoryControls viewIndex={0} snapshotCount={3} isLive={false} goToMove={goToMove} />)
    buttons()[2].click()
    expect(goToMove).toHaveBeenLastCalledWith(1)
})
