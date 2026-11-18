import { act, renderHook } from '@testing-library/react'
import { Chess } from 'chess.js'
import type { ReactNode } from 'react'

jest.mock('@/lib/sounds', () => ({
    playMoveSound: jest.fn(),
    playCaptureSound: jest.fn(),
    playCheckSound: jest.fn(),
    playGameEndSound: jest.fn(),
    setSoundsEnabled: jest.fn(),
}))

import { usePlayerInput } from '@/features/offline/hooks/usePlayerInput'
import { DEFAULT_SETTINGS, type UserSettings } from '@/features/settings/model'
import { SettingsProvider } from '@/features/settings/SettingsProvider'

/** White pawn on a7, one step from promoting. */
const PROMOTION_FEN = '7k/P7/8/8/8/8/8/4K3 w - - 0 1'

function setup(changes: Partial<UserSettings>, blocked = false) {
    const stored = { ...DEFAULT_SETTINGS, ...changes }
    const wrapper = ({ children }: { children: ReactNode }) => (
        <SettingsProvider store={{ load: () => stored, save: jest.fn() }}>{children}</SettingsProvider>
    )
    const game = new Chess(PROMOTION_FEN)
    const deps = { setLastMove: jest.fn(), refresh: jest.fn(), maverickMove: jest.fn() }
    const hook = renderHook(() => usePlayerInput({ game, playerColor: 'w', blocked, ...deps }), { wrapper })
    const click = (sq: string) => act(() => hook.result.current.onSquareClick(sq))
    return { game, deps, hook, click }
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

describe('usePlayerInput promotion (MAVERICK board)', () => {
    test('auto-queen on (default): the pawn becomes a queen and MAVERICK is asked to reply', () => {
        const { game, deps, hook, click } = setup({})
        click('a7')
        click('a8')
        expect(hook.result.current.pendingPromotion).toBeNull()
        expect(game.get('a8')).toEqual({ type: 'q', color: 'w' })
        expect(deps.setLastMove).toHaveBeenCalledWith({ from: 'a7', to: 'a8' })
        act(() => jest.advanceTimersByTime(250))
        expect(deps.maverickMove).toHaveBeenCalledTimes(1)
    })

    test('auto-queen off: the move waits for the chosen piece, then plays it', () => {
        const { game, deps, hook, click } = setup({ autoQueen: false })
        click('a7')
        click('a8')
        expect(hook.result.current.pendingPromotion).toEqual({ from: 'a7', to: 'a8' })
        expect(game.get('a7')).toEqual({ type: 'p', color: 'w' })
        act(() => hook.result.current.promote('n'))
        expect(hook.result.current.pendingPromotion).toBeNull()
        expect(game.get('a8')).toEqual({ type: 'n', color: 'w' })
        expect(deps.setLastMove).toHaveBeenCalledWith({ from: 'a7', to: 'a8' })
    })

    test('clearInput drops a pending promotion without moving', () => {
        const { game, hook, click } = setup({ autoQueen: false })
        click('a7')
        click('a8')
        act(() => hook.result.current.clearInput())
        expect(hook.result.current.pendingPromotion).toBeNull()
        expect(hook.result.current.selectedSquare).toBeNull()
        expect(game.get('a7')).toEqual({ type: 'p', color: 'w' })
    })
})
