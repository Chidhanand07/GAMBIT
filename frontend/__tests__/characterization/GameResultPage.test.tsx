/**
 * Characterization tests for app/game/[id]/result/page.tsx (PR 10/13, fe-shell).
 *
 * Pins the GET /api/games/:id fetch, the 3 s polling while analysis runs
 * (max 20 tries; an error stops it until "Try again" — F16), loading/error/analysing
 * states, the review board, player cards, eval graph, caption and move list.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { jsonResponse } from './fakeSocket'

jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, className }: any) => <a href={href} className={className}>{children}</a> }))

import GameResultPage from '@/app/game/[id]/result/page'
import { routeParams } from '../helpers/params'

const WHITE_CLS = [
    { ply: 1, move: 'e2e4', san: 'e4', classification: 'Book', accuracy: 100, best_move: 'e2e4', eval_white: 30 },
    { ply: 3, move: 'g1f3', san: 'Nf3', classification: 'Best', accuracy: 100, best_move: 'g1f3', eval_white: 40 },
    { ply: 5, move: 'f1c4', san: 'Bc4', classification: 'Inaccuracy', accuracy: 70, best_move: 'f1b5', eval_white: -900 },
]
const BLACK_CLS = [
    { ply: 2, move: 'e7e5', san: 'e5', classification: 'Book', accuracy: 100, best_move: 'e7e5', eval_white: 25 },
    { ply: 4, move: 'b8c6', san: 'Nc6', classification: 'Mistake', accuracy: 50, best_move: 'd7d6', eval_white: 100 },
    { notAPly: true, classification: 'Mistake' },
]
const GAME = {
    id: 'g1', white_id: 'w', black_id: 'b',
    white: { id: 'w', username: 'whiteuser', display_name: 'White Disp', rating_rapid: 1500.4 },
    black: { id: 'b', username: 'blackuser', display_name: null, rating_rapid: null },
    white_accuracy: 88.26, black_accuracy: 5,
    white_move_classifications: WHITE_CLS, black_move_classifications: BLACK_CLS,
    myColor: 'white',
}

let fetchMock: jest.Mock
let responses: (() => any)[]
beforeEach(() => {
    jest.useFakeTimers()
    responses = []
    fetchMock = jest.fn(async () => (responses.length ? responses.shift()!() : jsonResponse(GAME)))
    ;(global as any).fetch = fetchMock
})
afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
})

async function settle() {
    for (let i = 0; i < 5; i++) await act(async () => {})
}
async function renderPage(id = 'g1') {
    const utils = render(<GameResultPage params={routeParams({ id })} />)
    await settle()
    return utils
}
const click = (el: Element) => fireEvent.click(el)
const squares = (c: HTMLElement) => Array.from(c.querySelectorAll('.grid-cols-8.grid-rows-8 > div')) as HTMLElement[]
function square(c: HTMLElement, sq: string, flipped = false) {
    const file = sq.charCodeAt(0) - 97
    const rank = Number(sq[1]) - 1
    return squares(c)[flipped ? rank * 8 + (7 - file) : (7 - rank) * 8 + file]
}
const ctrls = (c: HTMLElement) => Array.from(c.querySelectorAll('button.w-9.h-9')) as HTMLElement[]

describe('states and fetching', () => {
    test('shows loading first, then fetches /api/games/:id with no options', async () => {
        render(<GameResultPage params={routeParams({ id: 'abc' })} />)
        expect(screen.getByText('Loading game…')).toBeInTheDocument()
        await settle()
        expect(fetchMock.mock.calls).toEqual([['/api/games/abc']])
        expect(screen.getByRole('heading', { name: 'Game Review' })).toBeInTheDocument()
    })

    test('non-ok response shows the error state and stops polling [F16]', async () => {
        fetchMock.mockImplementation(async () => jsonResponse({}, false))
        await renderPage()
        expect(screen.getByText("Couldn't load this game.")).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Back to lobby' })).toHaveAttribute('href', '/lobby')
        await act(async () => { jest.advanceTimersByTime(30_000) })
        await settle()
        // Was (LEGACY): kept polling every 3 s after the error.
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    test('a thrown fetch shows the error state and stops polling too [F16]', async () => {
        fetchMock.mockImplementation(async () => { throw new Error('net') })
        await renderPage()
        expect(screen.getByText("Couldn't load this game.")).toBeInTheDocument()
        await act(async () => { jest.advanceTimersByTime(30_000) })
        await settle()
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    test('an error mid-analysis stops polling; "Try again" loads and resumes polling [F16]', async () => {
        const pending = { ...GAME, white_move_classifications: null, black_move_classifications: null }
        responses = [() => jsonResponse(pending), () => jsonResponse({}, false), () => jsonResponse(pending)]
        await renderPage()
        expect(screen.getByText('Analysing your game…')).toBeInTheDocument()
        await act(async () => { jest.advanceTimersByTime(3000) })
        await settle()
        expect(screen.getByText("Couldn't load this game.")).toBeInTheDocument()
        await act(async () => { jest.advanceTimersByTime(30_000) })
        expect(fetchMock).toHaveBeenCalledTimes(2)
        click(screen.getByRole('button', { name: 'Try again' }))
        await settle()
        expect(fetchMock).toHaveBeenCalledTimes(3)
        expect(screen.getByText('Analysing your game…')).toBeInTheDocument()
        await act(async () => { jest.advanceTimersByTime(3000) })
        await settle()
        expect(fetchMock).toHaveBeenCalledTimes(4)
        expect(screen.getByRole('heading', { name: 'Game Review' })).toBeInTheDocument()
    })

    test('analysing state polls every 3 s until classifications appear', async () => {
        const pending = { ...GAME, white_move_classifications: [], black_move_classifications: null }
        responses = [() => jsonResponse(pending), () => jsonResponse(pending)]
        await renderPage()
        expect(screen.getByText('Analysing your game…')).toBeInTheDocument()
        expect(screen.getByText('Stockfish depth 18 is reviewing every move.')).toBeInTheDocument()
        await act(async () => { jest.advanceTimersByTime(2999) })
        expect(fetchMock).toHaveBeenCalledTimes(1)
        await act(async () => { jest.advanceTimersByTime(1) })
        await settle()
        expect(fetchMock).toHaveBeenCalledTimes(2)
        await act(async () => { jest.advanceTimersByTime(3000) })
        await settle()
        expect(screen.getByRole('heading', { name: 'Game Review' })).toBeInTheDocument()
        await act(async () => { jest.advanceTimersByTime(30000) })
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    test('polling stops after 20 tries', async () => {
        const pending = { ...GAME, white_move_classifications: null, black_move_classifications: null }
        fetchMock.mockImplementation(async () => jsonResponse(pending))
        await renderPage()
        for (let i = 0; i < 25; i++) {
            await act(async () => { jest.advanceTimersByTime(3000) })
            await settle()
        }
        expect(fetchMock).toHaveBeenCalledTimes(20)
    })

    test('unmount clears the pending poll timer', async () => {
        fetchMock.mockImplementation(async () => jsonResponse({ ...GAME, white_move_classifications: null, black_move_classifications: null }))
        const { unmount } = await renderPage()
        unmount()
        await act(async () => { jest.advanceTimersByTime(10000) })
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})

describe('review screen', () => {
    test('player cards: names, ratings, accuracy, est. performance and classification counts', async () => {
        await renderPage()
        expect(screen.getByText('White Disp')).toBeInTheDocument()
        expect(screen.getByText('White · 1500')).toBeInTheDocument()
        expect(screen.getByText('blackuser')).toBeInTheDocument()
        expect(screen.getByText('Black')).toBeInTheDocument()
        expect(screen.getByText('88.3')).toBeInTheDocument()
        expect(screen.getByText('Est. performance ~2383')).toBeInTheDocument()
        expect(screen.getByText('Est. performance ~200')).toBeInTheDocument()
        const whiteCard = screen.getByText('White Disp').closest('.bg-surface') as HTMLElement
        expect(within(whiteCard).getByText('Inaccuracy')).toBeInTheDocument()
        expect(within(whiteCard).getByText('Best')).toBeInTheDocument()
        const blackCard = screen.getByText('blackuser').closest('.bg-surface') as HTMLElement
        expect(within(blackCard).getByText('Mistake').parentElement!.nextSibling!.textContent).toBe('2')
    })

    test('starts at ply 0 with the start position and Starting position caption', async () => {
        const { container } = await renderPage()
        expect(screen.getByText('Starting position')).toBeInTheDocument()
        expect(screen.getByText('0 / 5')).toBeInTheDocument()
        expect(within(square(container, 'e2')).getByRole('img')).toHaveAttribute('alt', 'wp')
        expect(container.querySelector('polyline')!.getAttribute('points')).toBe('0.0,30.8 120.0,31.0 240.0,30.4 360.0,28.0 480.0,64.0')
        expect(container.querySelectorAll('svg.cursor-pointer line')).toHaveLength(1)
    })

    test('controls step through plies; caption shows classification and best-move SAN', async () => {
        const { container } = await renderPage()
        const [first, prev, next, last, flip] = ctrls(container)
        click(next)
        expect(screen.getByText('1 / 5')).toBeInTheDocument()
        expect(screen.getByText(/e4 — Book/)).toBeInTheDocument()
        expect(square(container, 'e4').querySelector('.bg-yellow-400\\/35')).not.toBeNull()
        click(last)
        expect(screen.getByText('5 / 5')).toBeInTheDocument()
        expect(screen.getByText(/Bc4 — Inaccuracy/)).toBeInTheDocument()
        expect(screen.getByText('· best was Bb5', { exact: false })).toBeInTheDocument()
        expect(square(container, 'b5').querySelector('.ring-4')).not.toBeNull()
        expect(container.querySelector('.absolute.-top-3.-right-3')!.textContent).toBe('?!')
        click(next)
        expect(screen.getByText('5 / 5')).toBeInTheDocument()
        click(prev)
        expect(screen.getByText(/Nc6 — Mistake/)).toBeInTheDocument()
        click(first)
        click(prev)
        expect(screen.getByText('0 / 5')).toBeInTheDocument()
        click(flip)
        expect(within(square(container, 'e1', true)).getByRole('img')).toHaveAttribute('alt', 'wk')
    })

    test('move list pills seek to their ply', async () => {
        await renderPage()
        click(screen.getByRole('button', { name: /^Nf3/ }))
        expect(screen.getByText('3 / 5')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^Nf3/ })).toHaveClass('bg-hover')
        expect(screen.getByText('Nf3 — Best')).toBeInTheDocument()
    })

    test('clicking the eval graph seeks proportionally', async () => {
        const { container } = await renderPage()
        const svg = container.querySelector('svg.cursor-pointer') as SVGElement
        svg.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 10, right: 100, bottom: 10, x: 0, y: 0, toJSON: () => ({}) })
        fireEvent.click(svg, { clientX: 41 })
        expect(screen.getByText('2 / 5')).toBeInTheDocument()
        expect(container.querySelectorAll('svg.cursor-pointer line')).toHaveLength(2)
    })

    test('flips the board when the viewer is black', async () => {
        fetchMock.mockImplementation(async () => jsonResponse({ ...GAME, myColor: 'black' }))
        const { container } = await renderPage()
        expect(within(square(container, 'e1', true)).getByRole('img')).toHaveAttribute('alt', 'wk')
    })

    test('missing names fall back to White/Black and accuracy to an em dash', async () => {
        fetchMock.mockImplementation(async () => jsonResponse({ ...GAME, white: null, black: null, white_accuracy: null, black_accuracy: undefined }))
        await renderPage()
        expect(screen.getAllByText('—')).toHaveLength(2)
        expect(screen.queryByText(/Est. performance/)).toBeNull()
        expect(screen.getAllByText('White').length).toBeGreaterThan(0)
    })
})
