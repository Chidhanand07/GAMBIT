/**
 * Characterization tests for app/offline/page.tsx (PR 10/13, fe-shell).
 *
 * Pins the setup screen, the /api/maverick-move request (URL, options, body),
 * reply timing (250 ms after the player's move, 500 ms when the player is
 * Black, 400 ms minimum thinking beat), error messages, takeback, resign and
 * the sounds played.
 *
 * [REDESIGN-GAME] The game screen now uses the live game's board, player bars, controls card and
 * move list (Game.dc.html): squares are found by data-square, pieces by data-piece, marks by
 * aria-pressed / data-dot / data-mark; "Thinking…" is the status line "MAVERICK is thinking...",
 * and the Game Over overlay is the controls card's result state (status + Rematch).
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { jsonResponse } from './fakeSocket'

jest.mock('@/lib/sounds', () => ({
    playMoveSound: jest.fn(),
    playCaptureSound: jest.fn(),
    playCheckSound: jest.fn(),
    playGameEndSound: jest.fn(),
    playGameStartSound: jest.fn(),
    setSoundsEnabled: jest.fn(),
}))
import * as sounds from '@/lib/sounds'

import ComputerPage from '@/app/offline/page'
import { DEFAULT_SETTINGS, type UserSettings } from '@/features/settings/model'
import { SettingsProvider } from '@/features/settings/SettingsProvider'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

let fetchMock: jest.Mock
let replies: string[]

beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    replies = ['e7e5', 'b8c6', 'g8f6']
    fetchMock = jest.fn(async () => jsonResponse({ uci: replies.shift() }))
    ;(global as any).fetch = fetchMock
})
afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
})

const click = (el: Element) => fireEvent.click(el)
const squares = (c: HTMLElement) => Array.from(c.querySelectorAll('[data-square]')) as HTMLElement[]
const square = (c: HTMLElement, sq: string) => c.querySelector(`[data-square="${sq}"]`) as HTMLElement
const isSelected = (el: HTMLElement) => el.getAttribute('aria-pressed') === 'true'
/** The piece drawn on `sq` (pieces are positioned over the grid by percentage). */
function pieceOn(c: HTMLElement, sq: string, black = false): string | null {
    const file = sq.charCodeAt(0) - 97
    const rank = Number(sq[1]) - 1
    const [col, row] = black ? [7 - file, rank] : [file, 7 - rank]
    const slot = Array.from(c.querySelectorAll<HTMLElement>('.g-piece-slot')).find(
        (el) => el.style.left === `${col * 12.5}%` && el.style.top === `${row * 12.5}%`,
    )
    return slot?.querySelector('svg')?.getAttribute('data-piece') ?? null
}
const THINKING = 'MAVERICK is thinking...'
async function flush(ms: number) {
    await act(async () => { jest.advanceTimersByTime(ms) })
    for (let i = 0; i < 5; i++) await act(async () => {})
}
function start(opts: { difficulty?: string; color?: string } = {}) {
    const utils = render(<ComputerPage />)
    if (opts.difficulty) click(screen.getByRole('button', { name: new RegExp(`^${opts.difficulty}`) }))
    if (opts.color) click(screen.getByRole('button', { name: new RegExp(opts.color) }))
    click(screen.getByRole('button', { name: 'Start Game' }))
    return utils
}
/** Start a game under a SettingsProvider holding `changes` over the default settings. */
function startWithSettings(changes: Partial<UserSettings>) {
    const stored = { ...DEFAULT_SETTINGS, ...changes }
    const utils = render(
        <SettingsProvider store={{ load: () => stored, save: jest.fn() }}>
            <ComputerPage />
        </SettingsProvider>,
    )
    click(screen.getByRole('button', { name: 'Start Game' }))
    return utils
}
const moveLog = () => screen.getByText('Moves').parentElement!

describe('setup screen', () => {
    test('shows difficulties, colour choices and Start Game; no fetch', () => {
        render(<ComputerPage />)
        expect(screen.getByRole('heading', { name: 'Play MAVERICK' })).toBeInTheDocument()
        expect(screen.getByText('Plays your style — makes real mistakes')).toBeInTheDocument()
        expect(screen.getByText('Plays like you, but avoids blunders')).toBeInTheDocument()
        expect(screen.getByText('Style moves sharpened by Stockfish')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^Medium/ }).getAttribute('style')).toContain('var(--accent)')
        expect(screen.getByRole('button', { name: /^Easy/ }).getAttribute('style')).toContain('var(--border)')
        expect(screen.getByRole('button', { name: /White/ }).getAttribute('style')).toContain('var(--accent)')
        expect(screen.getByRole('button', { name: /Random/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Black/ })).toBeInTheDocument()
        expect(fetchMock).not.toHaveBeenCalled()
    })
})

describe('playing as white', () => {
    test('start plays the start sound and shows the board with MAVERICK header', () => {
        const { container } = start()
        expect(sounds.playGameStartSound).toHaveBeenCalledTimes(1)
        expect(squares(container)).toHaveLength(64)
        expect(screen.getByText('MAVERICK')).toBeInTheDocument()
        expect(screen.getByText('medium')).toBeInTheDocument()
        expect(screen.getByText('Your move')).toBeInTheDocument()
        expect(screen.getByText('No moves yet.')).toBeInTheDocument()
        expect(pieceOn(container, 'e1')).toBe('wk')
        expect(squares(container)[0]).toHaveAttribute('data-square', 'a8')
        expect(square(container, 'a1').textContent).toContain('1')
        expect(square(container, 'a1').textContent).toContain('a')
        expect(screen.getByRole('button', { name: /Takeback/ })).toBeDisabled()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    test('player move then MAVERICK reply after 250 ms with exact request; 400 ms minimum think', async () => {
        const { container } = start({ difficulty: 'Hard' })
        click(square(container, 'e2'))
        expect(isSelected(square(container, 'e2'))).toBe(true)
        expect(square(container, 'e4').querySelector('[data-dot]')).not.toBeNull()
        click(square(container, 'e4'))
        expect(sounds.playMoveSound).toHaveBeenCalledTimes(1)
        expect(within(moveLog()).getByText('e4')).toBeInTheDocument()
        await flush(249)
        expect(fetchMock).not.toHaveBeenCalled()
        await flush(1)
        expect(fetchMock.mock.calls).toEqual([['/api/maverick-move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen: AFTER_E4, difficulty: 'hard' }),
        }]])
        expect(screen.getByText(THINKING)).toBeInTheDocument()
        expect(within(moveLog()).queryByText('e5')).toBeNull()
        await flush(400)
        expect(within(moveLog()).getByText('e5')).toBeInTheDocument()
        expect(screen.queryByText(THINKING)).toBeNull()
        expect(screen.getByText('Your move')).toBeInTheDocument()
        expect(sounds.playMoveSound).toHaveBeenCalledTimes(2)
        expect(square(container, 'e7').querySelector('[data-mark="last"]')).not.toBeNull()
    })

    test('clicks are ignored while MAVERICK is thinking and on its turn', async () => {
        const { container } = start()
        click(square(container, 'e2'))
        click(square(container, 'e4'))
        click(square(container, 'e7'))
        expect(isSelected(square(container, 'e7'))).toBe(false)
        await flush(250)
        click(square(container, 'd2'))
        expect(isSelected(square(container, 'd2'))).toBe(false)
        await flush(400)
        click(square(container, 'd2'))
        expect(isSelected(square(container, 'd2'))).toBe(true)
        click(square(container, 'd2'))
        expect(isSelected(square(container, 'd2'))).toBe(false)
    })

    test('reselects own piece on illegal target; clears on empty illegal square', () => {
        const { container } = start()
        click(square(container, 'e2'))
        click(square(container, 'g1'))
        expect(isSelected(square(container, 'g1'))).toBe(true)
        click(square(container, 'g4'))
        expect(isSelected(square(container, 'g1'))).toBe(false)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Takeback undoes both moves; Resign shows the result state', async () => {
        const { container } = start()
        click(square(container, 'e2'))
        click(square(container, 'e4'))
        await flush(650)
        click(screen.getByRole('button', { name: /Takeback/ }))
        expect(screen.getByText('No moves yet.')).toBeInTheDocument()
        click(screen.getByRole('button', { name: /Resign/ }))
        expect(sounds.playGameEndSound).toHaveBeenCalledWith(false)
        // Was: a "Game Over" overlay on the board with Rematch / New Setup.
        expect(screen.getByText('You resigned')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Rematch' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Resign/ })).toBeDisabled()
        expect(screen.queryByText('Your move')).toBeNull()
        click(screen.getByRole('button', { name: 'New game' }))
        expect(screen.getByRole('heading', { name: 'Play MAVERICK' })).toBeInTheDocument()
    })

    test('Rematch restarts the game', () => {
        start()
        click(screen.getByRole('button', { name: /Resign/ }))
        click(screen.getByRole('button', { name: 'Rematch' }))
        expect(screen.queryByText('You resigned')).toBeNull()
        expect(screen.queryByRole('button', { name: 'Rematch' })).toBeNull()
        expect(sounds.playGameStartSound).toHaveBeenCalledTimes(2)
    })

    test('New game returns to setup keeping the previous choices', () => {
        start({ difficulty: 'Easy' })
        click(screen.getByRole('button', { name: 'New game' }))
        expect(screen.getByRole('button', { name: /^Easy/ }).getAttribute('style')).toContain('var(--accent)')
    })

    test('player checkmate (fool\'s mate reversed) shows win text and plays end sound(true)', async () => {
        replies = ['f7f6', 'g7g5']
        const { container } = start()
        click(square(container, 'e2')); click(square(container, 'e4'))
        await flush(650)
        click(square(container, 'a2')); click(square(container, 'a3'))
        await flush(650)
        click(square(container, 'd1')); click(square(container, 'h5'))
        expect(sounds.playGameEndSound).toHaveBeenCalledWith(false) // soundFor: checkmate
        expect(sounds.playGameEndSound).toHaveBeenCalledWith(true)
        expect(screen.getByText('You win by checkmate!')).toBeInTheDocument()
        await flush(1000)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })
})

describe('board preferences (Settings)', () => {
    test('defaults: legal-move dots and the last-move tint after MAVERICK replies', async () => {
        const { container } = start()
        click(square(container, 'e2'))
        expect(container.querySelectorAll('[data-dot]')).toHaveLength(2)
        click(square(container, 'e4'))
        await flush(250)
        await flush(400)
        const last = Array.from(container.querySelectorAll('[data-mark="last"]')).map(m => m.parentElement!.getAttribute('data-square'))
        expect(last).toEqual(['e7', 'e5'])
    })

    test('switched off: no dots, no last-move tint, no coordinates; the theme colours the squares', async () => {
        const { container } = startWithSettings({ highlightLegalMoves: false, highlightLastMove: false, showCoordinates: false, boardTheme: 'slate' })
        expect(square(container, 'a1').textContent).toBe('')
        expect(square(container, 'a1').className).toContain('bg-board-slate-dark')
        click(square(container, 'e2'))
        expect(container.querySelectorAll('[data-dot]')).toHaveLength(0)
        click(square(container, 'e4'))
        await flush(250)
        await flush(400)
        expect(pieceOn(container, 'e5')).toBe('bp')
        expect(container.querySelectorAll('[data-mark="last"]')).toHaveLength(0)
    })
})

describe('engine errors', () => {
    test('non-ok response uses body.detail, then body.error, then status', async () => {
        fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 503, json: async () => ({ detail: 'Detail msg', error: 'Err msg' }) }))
        const { container } = start()
        click(square(container, 'e2')); click(square(container, 'e4'))
        await flush(250)
        expect(screen.getByText('Detail msg')).toBeInTheDocument()

        fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 503, json: async () => ({ error: 'Err msg' }) }))
        click(screen.getByRole('button', { name: 'New game' }))
        click(screen.getByRole('button', { name: 'Start Game' }))
        expect(screen.queryByText('Detail msg')).toBeNull()
        click(square(container, 'e2')); click(square(container, 'e4'))
        await flush(250)
        expect(screen.getByText('Err msg')).toBeInTheDocument()

        fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 500, json: async () => { throw new Error('bad json') } }))
        click(screen.getByRole('button', { name: 'New game' }))
        click(screen.getByRole('button', { name: 'Start Game' }))
        click(square(container, 'e2')); click(square(container, 'e4'))
        await flush(250)
        expect(screen.getByText('Engine error (500)')).toBeInTheDocument()
    })

    test('a thrown error without message uses the fallback text', async () => {
        fetchMock.mockImplementationOnce(async () => { throw {} })
        const { container } = start()
        click(square(container, 'e2')); click(square(container, 'e4'))
        await flush(250)
        expect(screen.getByText('MAVERICK is unavailable. Is the engine running?')).toBeInTheDocument()
        expect(screen.queryByText(THINKING)).toBeNull()
        expect(screen.getByRole('alert')).toHaveTextContent('MAVERICK is unavailable. Is the engine running?')
    })
})

describe('engine error retry [F13]', () => {
    const failOnce = () => fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 503, json: async () => ({ detail: 'Engine down' }) }))

    test('an engine error shows Retry; retrying asks again and plays the reply', async () => {
        failOnce()
        const { container } = start()
        click(square(container, 'e2')); click(square(container, 'e4'))
        await flush(250)
        expect(screen.getByText('Engine down')).toBeInTheDocument()
        click(screen.getByRole('button', { name: 'Retry' }))
        await flush(400)
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(JSON.parse(fetchMock.mock.calls[1][1].body).fen).toBe(AFTER_E4)
        expect(screen.queryByText('Engine down')).toBeNull()
        expect(screen.getByText('Your move')).toBeInTheDocument()
    })

    test('as Black, a failed opening move can be retried (nothing else could restart MAVERICK)', async () => {
        failOnce()
        replies = ['e2e4']
        start({ color: 'Black' })
        await flush(500)
        expect(screen.getByText('Engine down')).toBeInTheDocument()
        click(screen.getByRole('button', { name: 'Retry' }))
        await flush(400)
        expect(screen.getByText('Your move')).toBeInTheDocument()
    })

    test('retries are bounded: after 3 failed retries Retry is replaced by a hint', async () => {
        fetchMock.mockImplementation(async () => ({ ok: false, status: 503, json: async () => ({ detail: 'Engine down' }) }))
        const { container } = start()
        click(square(container, 'e2')); click(square(container, 'e4'))
        await flush(250)
        for (let i = 0; i < 3; i++) {
            click(screen.getByRole('button', { name: 'Retry' }))
            await flush(0)
        }
        expect(fetchMock).toHaveBeenCalledTimes(4)
        expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
        expect(screen.getByText(/Start a new game/)).toBeInTheDocument()
    })
})

describe('playing as black', () => {
    test('board is flipped and MAVERICK moves first after 500 ms with the start FEN', async () => {
        replies = ['e2e4']
        const { container } = start({ color: 'Black', difficulty: 'Easy' })
        expect(pieceOn(container, 'e1', true)).toBe('wk')
        expect(squares(container)[0]).toHaveAttribute('data-square', 'h1')
        expect(screen.queryByText('Your move')).toBeNull()
        await flush(499)
        expect(fetchMock).not.toHaveBeenCalled()
        await flush(1)
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ fen: START_FEN, difficulty: 'easy' })
        await flush(400)
        expect(screen.getByText('Your move')).toBeInTheDocument()
    })

    test('Takeback after only MAVERICK\'s opening move is disabled and the game goes on [F13]', async () => {
        replies = ['e2e4', 'g1f3']
        const { container } = start({ color: 'Black' })
        await flush(900)
        expect(screen.getByText('Your move')).toBeInTheDocument()
        const takeback = screen.getByRole('button', { name: /Takeback/ })
        // Was: enabled, and undid e4, leaving White to move with nobody to move it: stuck.
        expect(takeback).toBeDisabled()
        click(takeback)
        expect(screen.getByText('Your move')).toBeInTheDocument()
        click(square(container, 'e7')); click(square(container, 'e5'))
        await flush(650)
        expect(fetchMock).toHaveBeenCalledTimes(2)
        click(screen.getByRole('button', { name: /Takeback/ }))
        expect(screen.getByText('Your move')).toBeInTheDocument()
        expect(within(moveLog()).getByText('e4')).toBeInTheDocument()
    })

    test('random colour resolves with Math.random (< 0.5 → white)', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.7)
        const { container } = start({ color: 'Random' })
        expect(pieceOn(container, 'e1', true)).toBe('wk')
        expect(squares(container)[0]).toHaveAttribute('data-square', 'h1')
    })
})
