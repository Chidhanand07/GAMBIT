/**
 * Characterization tests for app/analysis/page.tsx (PR 10/13, fe-shell).
 *
 * Pins the board interaction, move navigation (buttons + arrow keys), the
 * engine fetch (URL, options, 500 ms debounce), import tab and FEN copy.
 *
 * Redesign (Analysis.dc.html, REDESIGN-5): the board is the shared components/chess/Board
 * (square buttons named "e1, white king", marks as data-mark / data-dot), the move counter is a
 * screen-reader status, buttons are named "First move" etc., the engine toggle is a switch, and
 * import feedback is a status line instead of alert() / a tab switch. Each behaviour below is the
 * one pinned before; "was:" notes give the old assertion where it changed shape.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { jsonResponse } from './fakeSocket'

import AnalysisPage from '@/app/analysis/page'
import { DEFAULT_SETTINGS } from '@/features/settings/model'
import { SettingsProvider } from '@/features/settings/SettingsProvider'

const ENGINE_URL = 'http://127.0.0.1:3001/api/analysis/engine'
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const ENGINE_BODY = {
    best_move: 'e7e5',
    evaluation: { type: 'cp', value: 34 },
    lines: [{ move: 'e7e5', centipawn: 34, mate: null }],
}

let fetchMock: jest.Mock
let writeText: jest.Mock

beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SOCKET_URL
    // F14: the engine's real body (chess-engine analyse_position), not { score, best_move, pv }.
    fetchMock = jest.fn(async () => jsonResponse(ENGINE_BODY))
    ;(global as any).fetch = fetchMock
    writeText = jest.fn()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})
afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
})

const sq = (name: string) => document.querySelector(`[data-square="${name}"]`) as HTMLElement
const allSquares = () => Array.from(document.querySelectorAll('[data-square]')) as HTMLElement[]
const mark = (name: string) => sq(name).querySelector('[data-mark]')?.getAttribute('data-mark') ?? null
const hasDot = (name: string) => sq(name).querySelector('[data-dot]') !== null
const fenText = () => document.querySelector('code')!.textContent
const counter = () => screen.getAllByRole('status').find((el) => el.classList.contains('sr-only'))!.textContent
const moves = () => within(screen.getByRole('region', { name: 'Moves' }))
const engineSwitch = () => screen.getByRole('switch', { name: 'Engine' })
const click = (el: Element) => fireEvent.click(el)
const playE4 = () => {
    click(sq('e2'))
    click(sq('e4'))
}
const EMPTY_MOVES = 'Make a move or import a game to see the move list.'

describe('initial render', () => {
    test('renders 64 squares, the start position, analysis tab and empty move list', () => {
        render(<AnalysisPage />)
        expect(allSquares()).toHaveLength(64)
        // was: <img alt="wk" src="/pieces/classic/wk.png"> — the redesign draws SVG pieces
        expect(sq('e1')).toHaveAccessibleName('e1, white king')
        expect(sq('a1').textContent).toBe('1a')
        expect(screen.getByText('Stockfish 16')).toBeInTheDocument()
        expect(screen.getByText('Enable engine to evaluate the current position.')).toBeInTheDocument()
        expect(screen.getByText(EMPTY_MOVES)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Analysis' })).toHaveAttribute('aria-pressed', 'true')
        expect(fenText()).toBe(START_FEN)
        expect(fetchMock).not.toHaveBeenCalled()
    })
})

describe('board preferences (Settings)', () => {
    test('coordinates, legal-move dots and the last-move tint follow the settings (the board hard-codes none of them)', () => {
        const stored = { ...DEFAULT_SETTINGS, showCoordinates: false, highlightLegalMoves: false, highlightLastMove: false }
        render(
            <SettingsProvider store={{ load: () => stored, save: jest.fn() }}>
                <AnalysisPage />
            </SettingsProvider>,
        )
        expect(sq('a1').textContent).toBe('')
        click(sq('e2'))
        expect(hasDot('e4')).toBe(false)
        click(sq('e4'))
        expect(fenText()).toBe(AFTER_E4)
        expect(mark('e4')).toBeNull()
        expect(mark('e2')).toBeNull()
    })
})

describe('moves and navigation', () => {
    test('selecting a piece shows legal targets; making a move updates list, counter and FEN', () => {
        render(<AnalysisPage />)
        click(sq('e2'))
        expect(mark('e2')).toBe('selected')
        expect(sq('e2')).toHaveAttribute('aria-pressed', 'true')
        expect(hasDot('e4')).toBe(true)
        click(sq('e4'))
        expect(moves().getByRole('button', { name: 'e4' })).toBeInTheDocument()
        expect(counter()).toBe('Move 1 / 1')
        expect(fenText()).toBe(AFTER_E4)
        expect(mark('e2')).toBe('last')
        expect(mark('e4')).toBe('last')
    })

    test('clicking an opponent piece does nothing; illegal target clears selection; own piece reselects', () => {
        render(<AnalysisPage />)
        click(sq('e7'))
        expect(mark('e7')).toBeNull()
        click(sq('e2'))
        click(sq('g1'))
        expect(mark('g1')).toBe('selected')
        click(sq('e5'))
        expect(mark('g1')).toBeNull()
        expect(counter()).toBe('')
    })

    test('nav buttons and arrow keys step through history', () => {
        render(<AnalysisPage />)
        playE4()
        click(sq('e7'))
        click(sq('e5'))
        expect(counter()).toBe('Move 2 / 2')
        click(screen.getByRole('button', { name: 'First move' }))
        expect(counter()).toBe('Start')
        expect(fenText()).toBe(START_FEN)
        click(screen.getByRole('button', { name: 'Next move' }))
        expect(counter()).toBe('Move 1 / 2')
        click(screen.getByRole('button', { name: 'Last move' }))
        expect(counter()).toBe('Move 2 / 2')
        click(screen.getByRole('button', { name: 'Previous move' }))
        expect(counter()).toBe('Move 1 / 2')
        fireEvent.keyDown(window, { key: 'ArrowLeft' })
        expect(counter()).toBe('Start')
        fireEvent.keyDown(window, { key: 'ArrowLeft' })
        expect(counter()).toBe('Start')
        fireEvent.keyDown(window, { key: 'ArrowRight' })
        fireEvent.keyDown(window, { key: 'ArrowRight' })
        fireEvent.keyDown(window, { key: 'ArrowRight' })
        expect(counter()).toBe('Move 2 / 2')
        click(moves().getByRole('button', { name: 'e4' }))
        expect(counter()).toBe('Move 1 / 2')
        expect(fenText()).toBe(AFTER_E4)
        expect(moves().getByRole('button', { name: 'e4' })).toHaveAttribute('aria-current', 'step')
    })

    test('a move from an earlier position truncates later history', () => {
        render(<AnalysisPage />)
        playE4()
        click(sq('e7'))
        click(sq('e5'))
        click(screen.getByRole('button', { name: 'Previous move' }))
        click(sq('d7'))
        click(sq('d5'))
        expect(counter()).toBe('Move 2 / 2')
        expect(moves().getByRole('button', { name: 'd5' })).toBeInTheDocument()
        expect(moves().queryByRole('button', { name: 'e5' })).toBeNull()
    })

    test('arrow keys are ignored while typing in a textarea', () => {
        render(<AnalysisPage />)
        playE4()
        click(screen.getByRole('button', { name: 'Import' }))
        fireEvent.keyDown(screen.getByPlaceholderText('Paste FEN string…'), { key: 'ArrowLeft' })
        click(screen.getByRole('button', { name: 'Analysis' }))
        expect(counter()).toBe('Move 1 / 1')
    })

    // was: 'flip reverses orientation; reset clears history' — the design has no Reset button;
    // the "Starting Position" preset is the way back to a fresh line.
    test('flip reverses orientation; the Starting Position preset clears history', () => {
        render(<AnalysisPage />)
        playE4()
        click(screen.getByRole('button', { name: 'Flip board' }))
        expect(allSquares()[0]).toBe(sq('h1'))
        expect(allSquares()[63]).toBe(sq('a8'))
        expect(sq('e1')).toHaveAccessibleName('e1, white king')
        expect(sq('h1').textContent).toBe('1')
        expect(sq('h8').textContent).toBe('8h')
        click(screen.getByRole('button', { name: 'Import' }))
        click(screen.getByRole('button', { name: 'Starting Position' }))
        click(screen.getByRole('button', { name: 'Analysis' }))
        expect(screen.getByText(EMPTY_MOVES)).toBeInTheDocument()
        expect(fenText()).toBe(START_FEN)
    })
})

describe('engine', () => {
    // F14: the engine sends no PV, so none is shown.
    test('toggle on: posts {fen, depth: 18} after 500 ms and renders score and best move', async () => {
        jest.useFakeTimers()
        render(<AnalysisPage />)
        click(engineSwitch())
        expect(engineSwitch()).toHaveAttribute('aria-checked', 'true')
        // was: 'Analyzing position…' spinner
        expect(screen.getByText('Engine on. Evaluating the current position.')).toBeInTheDocument()
        act(() => { jest.advanceTimersByTime(499) })
        expect(fetchMock).not.toHaveBeenCalled()
        await act(async () => { jest.advanceTimersByTime(1) })
        expect(fetchMock.mock.calls).toEqual([[ENGINE_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen: START_FEN, depth: 18 }),
        }]])
        // eval bar (was: its printed label) + engine readout
        expect(screen.getByRole('img', { name: 'Evaluation bar: +0.3' })).toBeInTheDocument()
        expect(screen.getByText('+0.3')).toBeInTheDocument()
        expect(screen.getByText('e7e5')).toBeInTheDocument()
        expect(screen.getByText('d18')).toBeInTheDocument()
        expect(screen.queryByText(/^[a-h][1-8][a-h][1-8] [a-h][1-8]/)).toBeNull()
        // new position re-queries
        playE4()
        await act(async () => { jest.advanceTimersByTime(500) })
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ fen: AFTER_E4, depth: 18 })
        // toggle off clears data
        click(engineSwitch())
        expect(screen.getByText('Enable engine to evaluate the current position.')).toBeInTheDocument()
        expect(screen.queryByText('d18')).toBeNull()
        expect(screen.getByRole('img', { name: 'Evaluation bar: no evaluation' })).toBeInTheDocument()
    })

    test('uses NEXT_PUBLIC_SOCKET_URL when set; negative score renders without plus', async () => {
        process.env.NEXT_PUBLIC_SOCKET_URL = 'http://sock.test'
        fetchMock.mockImplementation(async () => jsonResponse({ best_move: 'd2d4', evaluation: { type: 'cp', value: -126 } }))
        jest.useFakeTimers()
        render(<AnalysisPage />)
        click(engineSwitch())
        await act(async () => { jest.advanceTimersByTime(500) })
        expect(fetchMock.mock.calls[0][0]).toBe('http://sock.test/api/analysis/engine')
        expect(screen.getByText('-1.3')).toBeInTheDocument()
        expect(screen.getByRole('img', { name: 'Evaluation bar: -1.3' })).toBeInTheDocument()
        delete process.env.NEXT_PUBLIC_SOCKET_URL
    })

    // F14 (was: 'a fetch failure is swallowed and keeps the spinner').
    test('a fetch failure shows "Engine unavailable" instead of a spinner', async () => {
        fetchMock.mockImplementation(async () => { throw new Error('offline') })
        jest.useFakeTimers()
        render(<AnalysisPage />)
        click(engineSwitch())
        await act(async () => { jest.advanceTimersByTime(500) })
        expect(screen.getByRole('alert')).toHaveTextContent(/Engine unavailable/)
        expect(screen.queryByText('Engine on. Evaluating the current position.')).toBeNull()
    })

    test('F14: an engine error status shows "Engine unavailable", never a 0.0 evaluation', async () => {
        fetchMock.mockImplementation(async () => ({ ok: false, status: 503, json: async () => ({ error: 'engine_busy' }) }))
        jest.useFakeTimers()
        render(<AnalysisPage />)
        click(engineSwitch())
        await act(async () => { jest.advanceTimersByTime(500) })
        expect(screen.getByText(/Engine unavailable/)).toBeInTheDocument()
        expect(screen.queryByText('0.0')).toBeNull()
        expect(screen.queryByText('+0.0')).toBeNull()
    })

    test('F14: a mate score is shown as M<n>', async () => {
        fetchMock.mockImplementation(async () => jsonResponse({ best_move: 'd8h4', evaluation: { type: 'mate', value: -1 } }))
        jest.useFakeTimers()
        render(<AnalysisPage />)
        click(engineSwitch())
        await act(async () => { jest.advanceTimersByTime(500) })
        expect(screen.getByText('-M1')).toBeInTheDocument()
        expect(screen.getByRole('img', { name: 'Evaluation bar: -M1' })).toBeInTheDocument()
    })
})

describe('loading a position (F14)', () => {
    test('a selection made before loading a position is cleared', () => {
        render(<AnalysisPage />)
        click(sq('e2'))
        expect(hasDot('e4')).toBe(true)
        click(screen.getByRole('button', { name: 'Import' }))
        click(screen.getByRole('button', { name: 'Sicilian Defense' }))
        expect(hasDot('e4')).toBe(false)
        expect(mark('e2')).toBeNull()
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
    const status = (name: RegExp) => screen.getAllByRole('status').find((el) => name.test(el.textContent ?? ''))

    // was: '... and returns to analysis tab' — the design keeps the Import tab and reports the load.
    test('quick position loads the FEN, marks the preset pressed and reports it', () => {
        expect(screen.getByRole('heading', { name: 'Quick positions' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Starting Position' })).toHaveAttribute('aria-pressed', 'true')
        click(screen.getByRole('button', { name: 'Sicilian Defense' }))
        expect(screen.getByRole('button', { name: 'Sicilian Defense' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByRole('button', { name: 'Starting Position' })).toHaveAttribute('aria-pressed', 'false')
        expect(status(/loaded/)).toHaveTextContent('Sicilian Defense loaded.')
        click(screen.getByRole('button', { name: 'Analysis' }))
        expect(fenText()).toBe('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')
        expect(screen.getByText(EMPTY_MOVES)).toBeInTheDocument()
    })

    // was: alert('Invalid FEN')
    test('Load position with a valid FEN loads it; empty or invalid FEN is reported and kept', () => {
        click(screen.getByRole('button', { name: 'Load position' }))
        expect(status(/FEN/)).toHaveTextContent('Paste a FEN first.')
        fireEvent.change(screen.getByLabelText('Load from FEN'), { target: { value: '  8/8/8/8/8/8/8/K6k w - - 0 1  ' } })
        click(screen.getByRole('button', { name: 'Load position' }))
        expect(status(/loaded/)).toHaveTextContent('Position loaded.')
        expect(screen.getByLabelText('Load from FEN')).toHaveValue('')
        fireEvent.change(screen.getByLabelText('Load from FEN'), { target: { value: 'garbage' } })
        click(screen.getByRole('button', { name: 'Load position' }))
        expect(status(/FEN/)).toHaveTextContent("That FEN doesn't look valid.")
        expect(screen.getByLabelText('Load from FEN')).toHaveValue('garbage')
        click(screen.getByRole('button', { name: 'Analysis' }))
        expect(fenText()).toBe('8/8/8/8/8/8/8/K6k w - - 0 1')
    })

    // was: alert('Invalid PGN')
    test('Import game loads PGN history and jumps to the last move; invalid PGN is reported', () => {
        fireEvent.change(screen.getByLabelText('Import game (PGN)'), { target: { value: '1. e4 e5 2. Nf3 Nc6' } })
        click(screen.getByRole('button', { name: 'Import game' }))
        expect(status(/Game received/)).toBeInTheDocument()
        expect(counter()).toBe('Move 4 / 4')
        fireEvent.change(screen.getByLabelText('Import game (PGN)'), { target: { value: '1. e5 e4 zz' } })
        click(screen.getByRole('button', { name: 'Import game' }))
        expect(status(/PGN/)).toHaveTextContent("That PGN doesn't look valid.")
        expect(screen.getByLabelText('Import game (PGN)')).toHaveValue('1. e5 e4 zz')
        click(screen.getByRole('button', { name: 'Analysis' }))
        expect(moves().getByRole('button', { name: 'Nc6' })).toBeInTheDocument()
    })
})
