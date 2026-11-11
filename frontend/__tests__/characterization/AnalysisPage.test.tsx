/**
 * Characterization tests for app/analysis/page.tsx (PR 10/13, fe-shell).
 *
 * Pins the board interaction, move navigation (buttons + arrow keys), the
 * engine fetch (URL, options, 500 ms debounce), import tab and FEN copy.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { jsonResponse } from './fakeSocket'

import AnalysisPage from '@/app/analysis/page'

const ENGINE_URL = 'http://127.0.0.1:3001/api/analysis/engine'
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

let fetchMock: jest.Mock
let writeText: jest.Mock
let alertSpy: jest.SpyInstance

beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SOCKET_URL
    fetchMock = jest.fn(async () => jsonResponse({ score: 0.34, best_move: 'e7e5', pv: 'e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7' }))
    ;(global as any).fetch = fetchMock
    writeText = jest.fn()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {})
})
afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
})

function boardSquares(container: HTMLElement) {
    return Array.from(container.querySelectorAll('.board-inner-frame > div')) as HTMLElement[]
}
/** Find a square by algebraic name, given the board orientation. */
function square(container: HTMLElement, sq: string, flipped = false) {
    const file = sq.charCodeAt(0) - 97
    const rank = Number(sq[1]) - 1
    const idx = flipped ? rank * 8 + (7 - file) : (7 - rank) * 8 + file
    return boardSquares(container)[idx]
}
const fenText = () => screen.getByText(/ [wb] (K|Q|k|q|-)/, { selector: 'div.font-mono' }).textContent
const click = (el: Element) => fireEvent.click(el)
const playE4 = (c: HTMLElement) => {
    click(square(c, 'e2'))
    click(square(c, 'e4'))
}

describe('initial render', () => {
    test('renders 64 squares, the start position, analysis tab and empty move list', () => {
        const { container } = render(<AnalysisPage />)
        expect(boardSquares(container)).toHaveLength(64)
        expect(within(square(container, 'e1')).getByRole('img')).toHaveAttribute('alt', 'wk')
        expect(within(square(container, 'e1')).getByRole('img')).toHaveAttribute('src', '/pieces/classic/wk.png')
        expect(square(container, 'a1').textContent).toBe('1a')
        expect(screen.getByText('Stockfish 16')).toBeInTheDocument()
        expect(screen.getByText('Enable engine to evaluate the current position.')).toBeInTheDocument()
        expect(screen.getByText('Make a move or import a game to see the move list')).toBeInTheDocument()
        expect(fenText()).toBe(START_FEN)
        expect(fetchMock).not.toHaveBeenCalled()
    })
})

describe('moves and navigation', () => {
    test('selecting a piece shows legal targets; making a move updates list, counter and FEN', () => {
        const { container } = render(<AnalysisPage />)
        click(square(container, 'e2'))
        expect(square(container, 'e2').style.background).toBe('rgba(246, 246, 105, 0.6)')
        expect(square(container, 'e4').querySelector('.rounded-full')).not.toBeNull()
        click(square(container, 'e4'))
        expect(screen.getByRole('button', { name: 'e4' })).toBeInTheDocument()
        expect(screen.getByText('Move 1 / 1')).toBeInTheDocument()
        expect(fenText()).toBe(AFTER_E4)
        expect(square(container, 'e2').style.background).toBe('rgba(205, 163, 80, 0.55)')
    })

    test('clicking an opponent piece does nothing; illegal target clears selection; own piece reselects', () => {
        const { container } = render(<AnalysisPage />)
        click(square(container, 'e7'))
        expect(square(container, 'e7').style.background).not.toBe('rgba(246, 246, 105, 0.6)')
        click(square(container, 'e2'))
        click(square(container, 'g1'))
        expect(square(container, 'g1').style.background).toBe('rgba(246, 246, 105, 0.6)')
        click(square(container, 'e5'))
        expect(square(container, 'g1').style.background).not.toBe('rgba(246, 246, 105, 0.6)')
        expect(screen.queryByText(/Move \d/)).toBeNull()
    })

    test('nav buttons and arrow keys step through history', () => {
        const { container } = render(<AnalysisPage />)
        playE4(container)
        click(square(container, 'e7'))
        click(square(container, 'e5'))
        expect(screen.getByText('Move 2 / 2')).toBeInTheDocument()
        click(screen.getByTitle('First'))
        expect(screen.getByText('Start')).toBeInTheDocument()
        expect(fenText()).toBe(START_FEN)
        click(screen.getByTitle('Next'))
        expect(screen.getByText('Move 1 / 2')).toBeInTheDocument()
        click(screen.getByTitle('Last'))
        expect(screen.getByText('Move 2 / 2')).toBeInTheDocument()
        click(screen.getByTitle('Previous'))
        expect(screen.getByText('Move 1 / 2')).toBeInTheDocument()
        fireEvent.keyDown(window, { key: 'ArrowLeft' })
        expect(screen.getByText('Start')).toBeInTheDocument()
        fireEvent.keyDown(window, { key: 'ArrowLeft' })
        expect(screen.getByText('Start')).toBeInTheDocument()
        fireEvent.keyDown(window, { key: 'ArrowRight' })
        fireEvent.keyDown(window, { key: 'ArrowRight' })
        fireEvent.keyDown(window, { key: 'ArrowRight' })
        expect(screen.getByText('Move 2 / 2')).toBeInTheDocument()
        click(screen.getByRole('button', { name: 'e4' }))
        expect(screen.getByText('Move 1 / 2')).toBeInTheDocument()
        expect(fenText()).toBe(AFTER_E4)
    })

    test('a move from an earlier position truncates later history', () => {
        const { container } = render(<AnalysisPage />)
        playE4(container)
        click(square(container, 'e7'))
        click(square(container, 'e5'))
        click(screen.getByTitle('Previous'))
        click(square(container, 'd7'))
        click(square(container, 'd5'))
        expect(screen.getByText('Move 2 / 2')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'd5' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'e5' })).toBeNull()
    })

    test('arrow keys are ignored while typing in a textarea', () => {
        const { container } = render(<AnalysisPage />)
        playE4(container)
        click(screen.getByRole('button', { name: 'Import' }))
        fireEvent.keyDown(screen.getByPlaceholderText('Paste FEN string…'), { key: 'ArrowLeft' })
        click(screen.getByRole('button', { name: 'Analysis' }))
        expect(screen.getByText('Move 1 / 1')).toBeInTheDocument()
    })

    test('flip reverses orientation; reset clears history', () => {
        const { container } = render(<AnalysisPage />)
        playE4(container)
        click(screen.getByTitle('Flip board'))
        expect(within(square(container, 'e1', true)).getByRole('img')).toHaveAttribute('alt', 'wk')
        expect(boardSquares(container)[0].textContent).toBe('1')
        expect(square(container, 'h1', true).textContent).toBe('1')
        expect(square(container, 'h8', true).textContent).toBe('8h')
        click(screen.getByTitle('Reset board'))
        expect(screen.getByText('Make a move or import a game to see the move list')).toBeInTheDocument()
        expect(fenText()).toBe(START_FEN)
    })
})

describe('engine', () => {
    test('toggle on: posts {fen, depth: 18} after 500 ms and renders score, best move and 8 pv chips', async () => {
        jest.useFakeTimers()
        const { container } = render(<AnalysisPage />)
        const toggle = screen.getByText('Stockfish 16').parentElement!.parentElement!.querySelector('button')!
        click(toggle)
        expect(screen.getByText('d18')).toBeInTheDocument()
        expect(screen.getByText('Analyzing position…')).toBeInTheDocument()
        act(() => { jest.advanceTimersByTime(499) })
        expect(fetchMock).not.toHaveBeenCalled()
        await act(async () => { jest.advanceTimersByTime(1) })
        expect(fetchMock.mock.calls).toEqual([[ENGINE_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen: START_FEN, depth: 18 }),
        }]])
        // eval bar label + engine panel score
        expect(screen.getAllByText('+0.3')).toHaveLength(2)
        expect(screen.getByText('e7e5', { selector: 'span.text-accent' })).toBeInTheDocument()
        expect(screen.getAllByText(/^[a-h][1-8][a-h][1-8]$/, { selector: 'span.font-mono' })).toHaveLength(8)
        // new position re-queries
        playE4(container)
        await act(async () => { jest.advanceTimersByTime(500) })
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ fen: AFTER_E4, depth: 18 })
        // toggle off clears data
        click(toggle)
        expect(screen.getByText('Enable engine to evaluate the current position.')).toBeInTheDocument()
        expect(screen.queryByText('d18')).toBeNull()
    })

    test('uses NEXT_PUBLIC_SOCKET_URL when set; negative score renders without plus', async () => {
        process.env.NEXT_PUBLIC_SOCKET_URL = 'http://sock.test'
        fetchMock.mockImplementation(async () => jsonResponse({ score: -1.26, best_move: 'd2d4' }))
        jest.useFakeTimers()
        render(<AnalysisPage />)
        click(screen.getByText('Stockfish 16').parentElement!.parentElement!.querySelector('button')!)
        await act(async () => { jest.advanceTimersByTime(500) })
        expect(fetchMock.mock.calls[0][0]).toBe('http://sock.test/api/analysis/engine')
        expect(screen.getByText('-1.3')).toBeInTheDocument()
        expect(screen.getByText('1.3', { selector: 'span.font-mono' })).toBeInTheDocument()
        delete process.env.NEXT_PUBLIC_SOCKET_URL
    })

    test('a fetch failure is swallowed and keeps the spinner', async () => {
        fetchMock.mockImplementation(async () => { throw new Error('offline') })
        jest.useFakeTimers()
        render(<AnalysisPage />)
        click(screen.getByText('Stockfish 16').parentElement!.parentElement!.querySelector('button')!)
        await act(async () => { jest.advanceTimersByTime(500) })
        expect(screen.getByText('Analyzing position…')).toBeInTheDocument()
    })
})

describe('FEN copy', () => {
    test('copies the FEN and shows Copied for 1.5 s', () => {
        jest.useFakeTimers()
        render(<AnalysisPage />)
        click(screen.getByRole('button', { name: 'Copy' }))
        expect(writeText).toHaveBeenCalledWith(START_FEN)
        expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
        act(() => { jest.advanceTimersByTime(1500) })
        expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    })
})

describe('import tab', () => {
    beforeEach(() => {
        render(<AnalysisPage />)
        click(screen.getByRole('button', { name: 'Import' }))
    })

    test('quick position loads the FEN and returns to analysis tab', () => {
        expect(screen.getByText('Quick Positions')).toBeInTheDocument()
        click(screen.getByRole('button', { name: 'Sicilian Defense' }))
        expect(fenText()).toBe('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')
        expect(screen.getByText('Make a move or import a game to see the move list')).toBeInTheDocument()
    })

    test('Load Position with a valid FEN loads it; invalid FEN alerts', () => {
        fireEvent.change(screen.getByPlaceholderText('Paste FEN string…'), { target: { value: '  8/8/8/8/8/8/8/K6k w - - 0 1  ' } })
        click(screen.getByRole('button', { name: 'Load Position' }))
        expect(fenText()).toBe('8/8/8/8/8/8/8/K6k w - - 0 1')
        click(screen.getByRole('button', { name: 'Import' }))
        expect(screen.getByPlaceholderText('Paste FEN string…')).toHaveValue('')
        fireEvent.change(screen.getByPlaceholderText('Paste FEN string…'), { target: { value: 'garbage' } })
        click(screen.getByRole('button', { name: 'Load Position' }))
        expect(alertSpy).toHaveBeenCalledWith('Invalid FEN')
        expect(screen.getByPlaceholderText('Paste FEN string…')).toHaveValue('garbage')
    })

    test('Import Game loads PGN history and jumps to the last move; invalid PGN alerts', () => {
        fireEvent.change(screen.getByPlaceholderText('Paste PGN…'), { target: { value: '1. e4 e5 2. Nf3 Nc6' } })
        click(screen.getByRole('button', { name: 'Import Game' }))
        expect(screen.getByText('Move 4 / 4')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Nc6' })).toBeInTheDocument()
        click(screen.getByRole('button', { name: 'Import' }))
        fireEvent.change(screen.getByPlaceholderText('Paste PGN…'), { target: { value: '1. e5 e4 zz' } })
        click(screen.getByRole('button', { name: 'Import Game' }))
        expect(alertSpy).toHaveBeenCalledWith('Invalid PGN')
    })
})
