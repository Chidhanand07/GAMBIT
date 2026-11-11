/**
 * Characterization tests for app/offline/page.tsx (PR 10/13, fe-shell).
 *
 * Pins the setup screen, the /api/maverick-move request (URL, options, body),
 * reply timing (250 ms after the player's move, 500 ms when the player is
 * Black, 400 ms minimum thinking beat), error messages, takeback, resign and
 * the sounds played.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { jsonResponse } from './fakeSocket'

jest.mock('@/lib/sounds', () => ({
    playMoveSound: jest.fn(),
    playCaptureSound: jest.fn(),
    playCheckSound: jest.fn(),
    playGameEndSound: jest.fn(),
    playGameStartSound: jest.fn(),
}))
import * as sounds from '@/lib/sounds'

import ComputerPage from '@/app/offline/page'

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
const squares = (c: HTMLElement) => Array.from(c.querySelectorAll('.grid-cols-8.grid-rows-8 > div')) as HTMLElement[]
function square(c: HTMLElement, sq: string, black = false) {
    const file = sq.charCodeAt(0) - 97
    const rank = Number(sq[1]) - 1
    const idx = black ? rank * 8 + (7 - file) : (7 - rank) * 8 + file
    return squares(c)[idx]
}
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
        expect(within(square(container, 'e1')).getByRole('img')).toHaveAttribute('alt', 'wk')
        expect(square(container, 'a1').textContent).toContain('1')
        expect(square(container, 'a1').textContent).toContain('a')
        expect(screen.getByRole('button', { name: /Takeback/ })).toBeDisabled()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    test('player move then MAVERICK reply after 250 ms with exact request; 400 ms minimum think', async () => {
        const { container } = start({ difficulty: 'Hard' })
        click(square(container, 'e2'))
        expect(square(container, 'e2').querySelector('.bg-amber-300\\/45')).not.toBeNull()
        expect(square(container, 'e4').querySelector('.bg-black\\/25')).not.toBeNull()
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
        expect(screen.getByText('Thinking…')).toBeInTheDocument()
        expect(within(moveLog()).queryByText('e5')).toBeNull()
        await flush(400)
        expect(within(moveLog()).getByText('e5')).toBeInTheDocument()
        expect(screen.queryByText('Thinking…')).toBeNull()
        expect(sounds.playMoveSound).toHaveBeenCalledTimes(2)
        expect(square(container, 'e7').querySelector('.bg-yellow-400\\/30')).not.toBeNull()
    })

    test('clicks are ignored while MAVERICK is thinking and on its turn', async () => {
        const { container } = start()
        click(square(container, 'e2'))
        click(square(container, 'e4'))
        click(square(container, 'e7'))
        expect(square(container, 'e7').querySelector('.bg-amber-300\\/45')).toBeNull()
        await flush(250)
        click(square(container, 'd2'))
        expect(square(container, 'd2').querySelector('.bg-amber-300\\/45')).toBeNull()
        await flush(400)
        click(square(container, 'd2'))
        expect(square(container, 'd2').querySelector('.bg-amber-300\\/45')).not.toBeNull()
        click(square(container, 'd2'))
        expect(square(container, 'd2').querySelector('.bg-amber-300\\/45')).toBeNull()
    })

    test('reselects own piece on illegal target; clears on empty illegal square', () => {
        const { container } = start()
        click(square(container, 'e2'))
        click(square(container, 'g1'))
        expect(square(container, 'g1').querySelector('.bg-amber-300\\/45')).not.toBeNull()
        click(square(container, 'g4'))
        expect(square(container, 'g1').querySelector('.bg-amber-300\\/45')).toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Takeback undoes both moves; Resign shows Game Over overlay', async () => {
        const { container } = start()
        click(square(container, 'e2'))
        click(square(container, 'e4'))
        await flush(650)
        click(screen.getByRole('button', { name: /Takeback/ }))
        expect(screen.getByText('No moves yet.')).toBeInTheDocument()
        click(screen.getByRole('button', { name: /Resign/ }))
        expect(sounds.playGameEndSound).toHaveBeenCalledWith(false)
        expect(screen.getByRole('heading', { name: 'Game Over' })).toBeInTheDocument()
        expect(screen.getByText('You resigned')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Resign/ })).toBeDisabled()
        expect(screen.queryByText('Your move')).toBeNull()
        click(screen.getByRole('button', { name: 'New Setup' }))
        expect(screen.getByRole('heading', { name: 'Play MAVERICK' })).toBeInTheDocument()
    })

    test('Rematch restarts the game', () => {
        start()
        click(screen.getByRole('button', { name: /Resign/ }))
        click(screen.getByRole('button', { name: 'Rematch' }))
        expect(screen.queryByText('Game Over')).toBeNull()
        expect(sounds.playGameStartSound).toHaveBeenCalledTimes(2)
    })

    test('New Game returns to setup keeping the previous choices', () => {
        start({ difficulty: 'Easy' })
        click(screen.getByRole('button', { name: /New Game/ }))
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

describe('engine errors', () => {
    test('non-ok response uses body.detail, then body.error, then status', async () => {
        fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 503, json: async () => ({ detail: 'Detail msg', error: 'Err msg' }) }))
        const { container } = start()
        click(square(container, 'e2')); click(square(container, 'e4'))
        await flush(250)
        expect(screen.getByText('Detail msg')).toBeInTheDocument()

        fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 503, json: async () => ({ error: 'Err msg' }) }))
        click(screen.getByRole('button', { name: /New Game/ }))
        click(screen.getByRole('button', { name: 'Start Game' }))
        expect(screen.queryByText('Detail msg')).toBeNull()
        click(square(container, 'e2')); click(square(container, 'e4'))
        await flush(250)
        expect(screen.getByText('Err msg')).toBeInTheDocument()

        fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 500, json: async () => { throw new Error('bad json') } }))
        click(screen.getByRole('button', { name: /New Game/ }))
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
        expect(screen.queryByText('Thinking…')).toBeNull()
    })
})

describe('playing as black', () => {
    test('board is flipped and MAVERICK moves first after 500 ms with the start FEN', async () => {
        replies = ['e2e4']
        const { container } = start({ color: 'Black', difficulty: 'Easy' })
        expect(within(square(container, 'e1', true)).getByRole('img')).toHaveAttribute('alt', 'wk')
        expect(screen.queryByText('Your move')).toBeNull()
        await flush(499)
        expect(fetchMock).not.toHaveBeenCalled()
        await flush(1)
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ fen: START_FEN, difficulty: 'easy' })
        await flush(400)
        expect(screen.getByText('Your move')).toBeInTheDocument()
    })

    test('random colour resolves with Math.random (< 0.5 → white)', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.7)
        const { container } = start({ color: 'Random' })
        expect(within(square(container, 'e1', true)).getByRole('img')).toHaveAttribute('alt', 'wk')
    })
})
