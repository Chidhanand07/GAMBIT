/**
 * Characterization tests for app/game/[id]/page.tsx (PR 02/19).
 *
 * These pin what the live game page does TODAY so the upcoming split into
 * hooks/components/reducer can prove zero behaviour change. Only the stable
 * seams are mocked (socket, profile, router, link, sounds, fetch). Expected
 * values come from running the legacy page, not from a spec; known oddities
 * are asserted as-is and called out with "LEGACY:" comments.
 *
 * [REDESIGN-GAME] Re-pointed at the Game.dc.html markup: the same behaviours, found through the new
 * board (data-square / data-piece), clocks (role="timer", "5:00"), status line ("Your move",
 * "Bob is thinking...", "Checkmate. You win!"), chat card, confirmation dialogs and result state.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createFakeSocket, jsonResponse } from './fakeSocket'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn(), prefetch: jest.fn() }) }))
jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ children, href, className }: any) => <a href={href} className={className}>{children}</a>,
}))
jest.mock('@/lib/sounds', () => ({
    playMoveSound: jest.fn(),
    playCaptureSound: jest.fn(),
    playCastleSound: jest.fn(),
    playCheckSound: jest.fn(),
    playCheckmateSound: jest.fn(),
    playPromoteSound: jest.fn(),
    playGameStartSound: jest.fn(),
    playGameEndSound: jest.fn(),
}))

const socket = createFakeSocket()
let profile: any = null
jest.mock('@/components/SocketProvider', () => ({ useSocket: () => socket }))
jest.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile }) }))
jest.mock('@/components/PresenceProvider', () => ({ usePresence: () => ({ onlineCount: 2, onlineUserIds: new Set(['opp']) }) }))
jest.mock('@/components/Toast', () => ({ useToast: () => ({ toast: jest.fn() }) }))

import GamePage from '@/app/game/[id]/page'
import * as sounds from '@/lib/sounds'
import { routeParams } from '../helpers/params'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'

const ME = { id: 'me', username: 'me1', display_name: 'Me Display', rating_blitz: 1400 }
const baseGame = () => ({
    id: 'g1',
    white_id: 'me',
    black_id: 'opp',
    time_control: '5',
    is_rated: true,
    fen: START_FEN,
    white: { username: 'alice', display_name: 'Alice', rating_blitz: 1512.4, rating_rapid: 1600 },
    black: { username: 'bob', display_name: 'Bob', rating_blitz: 1487.6, rating_rapid: 1450 },
})

let gameRow: any
let fetchMock: jest.Mock

beforeEach(() => {
    socket.reset()
    push.mockClear()
    jest.clearAllMocks()
    localStorage.clear()
    profile = { ...ME }
    gameRow = baseGame()
    fetchMock = jest.fn(async (url: string) =>
        url === '/api/games/g1' ? jsonResponse(gameRow) : jsonResponse(null, false))
    ;(global as any).fetch = fetchMock
})
afterEach(() => {
    jest.useRealTimers()
})

async function renderGame(id = 'g1') {
    const utils = render(<GamePage params={routeParams({ id })} />)
    // game data loaded once a player strip shows a name
    await screen.findAllByText(/Alice|Bob/)
    return utils
}

/** A board square (a button while I may move, else a plain cell). */
function square(sq: string): HTMLElement {
    return document.querySelector(`[data-square="${sq}"]`) as HTMLElement
}
/** The square under the top-left corner of the board (a8 unflipped, h1 flipped). */
const topLeftSquare = () => document.querySelectorAll('[data-square]')[0].getAttribute('data-square')
/** The piece drawn on `sq`: pieces are positioned over the grid by percentage. */
function pieceOn(sq: string, flipped = false): string | null {
    const file = sq.charCodeAt(0) - 97
    const rank = parseInt(sq[1], 10) - 1
    const [col, row] = flipped ? [7 - file, rank] : [file, 7 - rank]
    const slot = Array.from(document.querySelectorAll<HTMLElement>('.g-piece-slot')).find(
        (el) => el.style.left === `${col * 12.5}%` && el.style.top === `${row * 12.5}%`,
    )
    return slot?.querySelector('svg')?.getAttribute('data-piece') ?? null
}
const clockTexts = () => screen.getAllByRole('timer').map(e => e.textContent)
const click = (el: Element) => fireEvent.click(el)
const flipButton = () => screen.getAllByRole('button', { name: 'Flip' })[0]
const resignButton = () => screen.queryAllByRole('button', { name: 'Resign' })[0]
/** One chat line ("<who> <text>"). */
const chatLine = (text: string) => screen.getByText((_, el) => el?.className === 'text-[14px]' && el.textContent === text)
const chatInput = () => screen.getByRole('textbox', { name: 'Chat message' })

// ── Mount ───────────────────────────────────────────────────────────────────

describe('mount', () => {
    test('fetches /api/games/<id> exactly once with no options', async () => {
        await renderGame()
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock.mock.calls[0]).toEqual(['/api/games/g1'])
    })

    test('emits join_game (never authenticate) exactly once per game, even after my colour resolves [F2]', async () => {
        await renderGame()
        // Was (LEGACY): the socket effect depended on myColor, so resolving the seat re-emitted the join.
        // S2: identity travels in the socket handshake, so no `authenticate` is emitted.
        expect(socket.emit.mock.calls).toEqual([['join_game', 'g1']])
    })

    test('a refreshed profile object (same user) does not re-join or re-register handlers [F2]', async () => {
        const { rerender } = await renderGame()
        const registrations = socket.on.mock.calls.length
        profile = { ...ME }
        rerender(<GamePage params={routeParams({ id: 'g1' })} />)
        expect(socket.emitted('join_game')).toEqual(['g1'])
        expect(socket.on.mock.calls.length).toBe(registrations)
    })

    test('a socket that is still connecting joins once, on connect, not twice [F2]', async () => {
        socket.connected = false
        await renderGame()
        expect(socket.emitted('join_game')).toEqual([])
        socket.connected = true
        socket.serverSends('connect')
        expect(socket.emitted('join_game')).toEqual(['g1'])
    })

    test('handlers read the current seat: game_end after the seat resolved plays the win sound for white [F2]', async () => {
        await renderGame()
        socket.serverSends('game_end', { game_id: 'g1', result: 'White wins', reason: 'Checkmate' })
        expect(sounds.playGameEndSound).toHaveBeenCalledWith(true)
    })

    test('signed-out viewer: no socket emits, but the game still loads as spectator', async () => {
        profile = null
        await renderGame()
        expect(socket.emit).not.toHaveBeenCalled()
        expect(screen.getByText('Spectating')).toBeInTheDocument()
    })

    test('subscribes to exactly these socket events', async () => {
        await renderGame()
        expect(socket.listenedEvents()).toEqual([
            'chat_message', 'clock_sync', 'connect', 'disconnect', 'game_end', 'game_state_sync',
            'move_made', 'move_rejected', 'opponent_disconnected', 'opponent_reconnected', 'rating_updated',
            'rematch_declined', 'rematch_ready', 'rematch_request',
        ])
    })

    test('unmount removes every handler it registered', async () => {
        const { unmount } = await renderGame()
        const registered = socket.on.mock.calls.slice(-14)
        unmount()
        expect(socket.listenedEvents()).toEqual([])
        for (const [event, handler] of registered) {
            expect(socket.off).toHaveBeenCalledWith(event, handler)
        }
    })

    test('a failed game fetch sends the user back to the lobby', async () => {
        fetchMock.mockImplementation(async () => jsonResponse({ error: 'nope' }, false))
        render(<GamePage params={routeParams({ id: 'g1' })} />)
        await waitFor(() => expect(push).toHaveBeenCalledWith('/lobby'))
    })

    test('white player: board not flipped, black on top, white (me) on bottom, clocks preset from time_control minutes', async () => {
        await renderGame()
        expect(pieceOn('e1')).toBe('wk')
        expect(pieceOn('e8')).toBe('bk')
        expect(topLeftSquare()).toBe('a8')
        expect(pieceOn('a8')).toBe('br')
        const names = screen.getAllByRole('link', { name: /^(Alice|Bob)$/ }).map(a => a.textContent)
        expect(names).toEqual(['Bob', 'Alice'])
        expect(names.length).toBe(2)
        expect(screen.getByRole('link', { name: 'Bob' })).toHaveAttribute('href', '/profile/bob')
        expect(clockTexts()).toEqual(['5:00', '5:00'])
        // ratings for a 5-minute game come from rating_blitz, rounded
        expect(screen.getByText('1512')).toBeInTheDocument()
        expect(screen.getByText('1488')).toBeInTheDocument()
        expect(screen.getByText('You')).toBeInTheDocument()
        expect(screen.getByText('Your move')).toBeInTheDocument()
        expect(screen.getByText('No moves yet.')).toBeInTheDocument()
        // title, pills and game info from the game row
        expect(screen.getByRole('heading', { name: 'Game vs Bob' })).toBeInTheDocument()
        expect(screen.getByText('Blitz · 5 min · you play White')).toBeInTheDocument()
        expect(screen.getByText('Rated')).toBeInTheDocument()
        expect(screen.getAllByText('Blitz 5 min')).toHaveLength(2) // pill + info row
    })

    test('spectators see no "You" badge on either strip [F4]', async () => {
        profile = { ...ME, id: 'spectator-id' }
        await renderGame()
        expect(screen.queryByText('You')).not.toBeInTheDocument()
    })

    test('the "You" badge follows my strip when I flip the board [F4]', async () => {
        await renderGame()
        click(flipButton())
        const badge = screen.getByText('You')
        expect(badge.parentElement).toHaveTextContent('Alice')
    })

    test('black player: board flipped, white on top', async () => {
        profile = { ...ME, id: 'opp' }
        await renderGame()
        expect(topLeftSquare()).toBe('h1')
        expect(pieceOn('h1', true)).toBe('wr')
        const names = screen.getAllByRole('link', { name: /^(Alice|Bob)$/ }).map(a => a.textContent)
        expect(names).toEqual(['Alice', 'Bob'])
        expect(screen.getByText('Alice is thinking...')).toBeInTheDocument()
    })

    test('player rating bucket follows time_control minutes (<3 bullet, <10 blitz, >=30 classical, else rapid)', async () => {
        gameRow.time_control = '15+10'
        await renderGame()
        expect(screen.getByText('1600')).toBeInTheDocument()
        expect(screen.getByText('1450')).toBeInTheDocument()
        expect(clockTexts()).toEqual(['15:00', '15:00'])
    })

    test('non-numeric time_control falls back to 10-minute clocks', async () => {
        gameRow.time_control = 'rapid'
        await renderGame()
        expect(clockTexts()).toEqual(['10:00', '10:00'])
    })

    test('start sound plays once for a fresh game', async () => {
        await renderGame()
        expect(sounds.playGameStartSound).toHaveBeenCalledTimes(1)
    })

    test('the game loads once per id: a refreshed profile object does not refetch it', async () => {
        const { rerender } = await renderGame()
        profile = { ...ME }
        rerender(<GamePage params={routeParams({ id: 'g1' })} />)
        await act(async () => {})
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    test('the loaded game reads the CURRENT sound setting: muted before the fetch resolves, no start sound', async () => {
        let resolve!: (r: unknown) => void
        fetchMock.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
        render(<GamePage params={routeParams({ id: 'g1' })} />)
        click(screen.getAllByTitle('Toggle sound')[0])
        await act(async () => { resolve(jsonResponse(gameRow)) })
        await screen.findAllByText(/Alice|Bob/)
        // Was: the fetch callback closed over the first render's soundOn (true) and played it.
        expect(sounds.playGameStartSound).not.toHaveBeenCalled()
    })

    test('a profile that arrives after the game loaded still resolves my seat', async () => {
        profile = null
        const { rerender } = await renderGame()
        expect(screen.getByText('Spectating')).toBeInTheDocument()
        profile = { ...ME }
        rerender(<GamePage params={routeParams({ id: 'g1' })} />)
        expect(screen.getByText('Your move')).toBeInTheDocument()
    })

    test('restored history is read once per game id, not on every render', async () => {
        const spy = jest.spyOn(Storage.prototype, 'getItem')
        const { rerender } = await renderGame()
        const reads = spy.mock.calls.filter(([k]) => k === 'gambit-game-g1').length
        rerender(<GamePage params={routeParams({ id: 'g1' })} />)
        click(screen.getAllByTitle('Toggle sound')[0])
        expect(spy.mock.calls.filter(([k]) => k === 'gambit-game-g1').length).toBe(reads)
        expect(reads).toBe(1)
    })

    test('a resumed game (non-start FEN) loads the position and skips the start sound', async () => {
        gameRow.fen = AFTER_E4
        await renderGame()
        expect(sounds.playGameStartSound).not.toHaveBeenCalled()
        expect(pieceOn('e4')).toBe('wp')
        expect(screen.getByText('Bob is thinking...')).toBeInTheDocument()
    })

    test('restores move history from localStorage key gambit-game-<id>', async () => {
        localStorage.setItem('gambit-game-g1', JSON.stringify({
            fenSnapshots: [AFTER_E4, AFTER_E4_E5], moveList: ['e4', 'e5'], lastMove: { from: 'e7', to: 'e5' },
        }))
        gameRow.fen = undefined
        await renderGame()
        expect(screen.getByRole('button', { name: 'e4' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'e5' })).toBeInTheDocument()
        expect(pieceOn('e5')).toBe('bp')
    })
})

// ── Server events ───────────────────────────────────────────────────────────

describe('server events', () => {
    test('game_state_sync loads FEN, move list and clocks (ms -> rounded s)', async () => {
        await renderGame()
        socket.serverSends('game_state_sync', {
            fen: AFTER_E4_E5,
            moveLog: [
                { move: 'e2e4', fen: AFTER_E4, san: 'e4' },
                { move: 'e7e5', fen: AFTER_E4_E5, san: 'e5' },
            ],
            whiteMs: 123_499, blackMs: 59_500, activeSide: 'white', clockActive: false, whiteId: 'me', blackId: 'opp',
        })
        expect(pieceOn('e5')).toBe('bp')
        expect(screen.getByText('1.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'e4' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'e5' })).toBeInTheDocument()
        expect(clockTexts()).toEqual(['1:00', '2:03']) // [top=black, bottom=white]
        expect(screen.getByText('Your move')).toBeInTheDocument()
    })

    test('game_state_sync with an empty moveLog keeps the existing move list', async () => {
        await renderGame()
        socket.serverSends('game_state_sync', { fen: AFTER_E4, moveLog: [], whiteMs: 1000, blackMs: 2000, clockActive: false })
        expect(screen.getByText('No moves yet.')).toBeInTheDocument()
        expect(clockTexts()).toEqual(['0:02', '0:01'])
    })

    test('move_made appends SAN, updates board and clocks, and persists history to localStorage', async () => {
        await renderGame()
        socket.serverSends('move_made', { game_id: 'g1', from: 'e2', to: 'e4', fen: AFTER_E4, san: 'e4', whiteMs: 298_400, blackMs: 300_000 })
        expect(screen.getByRole('button', { name: 'e4' })).toBeInTheDocument()
        expect(pieceOn('e4')).toBe('wp')
        expect(pieceOn('e2')).toBeNull()
        expect(clockTexts()).toEqual(['5:00', '4:58'])
        expect(screen.getByText('Bob is thinking...')).toBeInTheDocument()
        expect(JSON.parse(localStorage.getItem('gambit-game-g1')!)).toEqual({
            fenSnapshots: [AFTER_E4], moveList: ['e4'], lastMove: { from: 'e2', to: 'e4' },
        })
        expect(sounds.playMoveSound).toHaveBeenCalledTimes(1)
    })

    test('move_made for another game id is ignored', async () => {
        await renderGame()
        socket.serverSends('move_made', { game_id: 'other', from: 'e2', to: 'e4', fen: AFTER_E4, san: 'e4' })
        expect(screen.getByText('No moves yet.')).toBeInTheDocument()
    })

    test('move_made with the same FEN twice is de-duplicated', async () => {
        await renderGame()
        const ev = { game_id: 'g1', from: 'e2', to: 'e4', fen: AFTER_E4, san: 'e4' }
        socket.serverSends('move_made', ev)
        socket.serverSends('move_made', ev)
        expect(screen.getAllByRole('button', { name: 'e4' })).toHaveLength(1)
    })

    test('move_made without clock fields leaves clocks untouched', async () => {
        await renderGame()
        socket.serverSends('move_made', { game_id: 'g1', from: 'e2', to: 'e4', fen: AFTER_E4, san: 'e4' })
        expect(clockTexts()).toEqual(['5:00', '5:00'])
    })

    test('move_made that delivers checkmate plays the mate sound; the result appears only with the server’s game_end [S3]', async () => {
        await renderGame()
        const mated = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'
        socket.serverSends('move_made', { game_id: 'g1', from: 'd8', to: 'h4', fen: mated, san: 'Qh4#' })
        expect(sounds.playCheckmateSound).toHaveBeenCalled()
        // Nothing is inferred from the local board...
        expect(screen.queryByText(/^Checkmate\./)).not.toBeInTheDocument()
        expect(screen.getByText('Your move. You are in check')).toBeInTheDocument()
        expect(document.querySelector('[data-square="e1"] [data-mark="check"]')).not.toBeNull()
        expect(socket.emitted('game_end')).toEqual([])
        // ...the server's verdict is what the page shows.
        socket.serverSends('game_end', { game_id: 'g1', result: 'Black wins', reason: 'Checkmate', white_id: 'me', black_id: 'opp' })
        expect(await screen.findByText('Checkmate. Bob wins.')).toBeInTheDocument()
    })

    test('clock_sync without serverTs overrides both clocks', async () => {
        await renderGame()
        socket.serverSends('clock_sync', { whiteMs: 61_000, blackMs: 9_400 })
        expect(clockTexts()).toEqual(['0:09', '1:01'])
    })

    test('clock_sync subtracts network lag (Date.now - serverTs) from the side to move only', async () => {
        await renderGame()
        jest.spyOn(Date, 'now').mockReturnValue(10_000)
        socket.serverSends('clock_sync', { whiteMs: 125_000, blackMs: 60_000, serverTs: 8_000 })
        expect(clockTexts()).toEqual(['1:00', '2:03'])
        ;(Date.now as jest.Mock).mockRestore()
    })

    test('clock_sync after load prevents the game fetch from resetting the clocks', async () => {
        let resolveFetch!: (v: any) => void
        fetchMock.mockImplementation(() => new Promise(r => { resolveFetch = r }))
        render(<GamePage params={routeParams({ id: 'g1' })} />)
        socket.serverSends('clock_sync', { whiteMs: 42_000, blackMs: 41_000 })
        await act(async () => { resolveFetch(jsonResponse(gameRow)) })
        await screen.findAllByText('Alice')
        expect(clockTexts()).toEqual(['0:41', '0:42'])
    })

    test('chat_message for this game is appended in the chat card; other games ignored', async () => {
        await renderGame()
        // Was: a 'System' welcome line in a Chat tab; now the card's empty state.
        expect(screen.getByText('Say something to Bob.')).toBeInTheDocument()
        socket.serverSends('chat_message', { game_id: 'g1', from: 'bob', text: 'hi there', from_user_id: 'opp' })
        socket.serverSends('chat_message', { game_id: 'zzz', from: 'eve', text: 'spam' })
        expect(screen.getByText(/hi there/)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'bob' })).toHaveAttribute('href', '/profile/bob')
        expect(screen.queryByText(/spam/)).not.toBeInTheDocument()
        // My own line (server-verified sender) reads "You".
        socket.serverSends('chat_message', { game_id: 'g1', from: 'me1', text: 'hello', from_user_id: 'me' })
        expect(chatLine('You hello')).toBeInTheDocument()
    })

    test('game_end for this game shows the result state: verdict, Rematch and New game', async () => {
        await renderGame()
        // Was: a modal after 400 ms; the result now shows in the controls card at once (Game.dc.html).
        socket.serverSends('game_end', { game_id: 'g1', result: 'White wins', reason: 'Timeout' })
        expect(screen.getByText('Timeout. You win!')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'New game' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Rematch' })).toBeInTheDocument()
        // resign can no longer be used and the turn line is replaced once the game is over
        expect(resignButton()).toBeDisabled()
        expect(screen.queryByText('Your move')).not.toBeInTheDocument()
        expect(sounds.playGameEndSound).toHaveBeenCalledWith(true)
    })

    test('game_end for another game is ignored', async () => {
        await renderGame()
        socket.serverSends('game_end', { game_id: 'g9', result: 'White wins', reason: 'Timeout' })
        expect(resignButton()).toBeEnabled()
        expect(screen.queryByRole('button', { name: 'Rematch' })).not.toBeInTheDocument()
    })

    test('game_end with a Draw result says the game is a draw', async () => {
        await renderGame()
        socket.serverSends('game_end', { game_id: 'g1', result: 'Draw', reason: 'Agreement' })
        expect(await screen.findByText('Agreement. The game is a draw.')).toBeInTheDocument()
    })

    test('an aborted game is nobody\'s loss and is not rated [FIRST-MOVE]', async () => {
        await renderGame()
        socket.serverSends('game_end', { game_id: 'g1', result: 'Aborted', reason: 'Aborted' })
        expect(screen.getByText('Game aborted. Not rated.')).toBeInTheDocument()
        expect(screen.queryByText(/wins\./)).not.toBeInTheDocument()
    })

    test('rating_updated shows signed changes on both player bars', async () => {
        await renderGame()
        socket.serverSends('rating_updated', {
            white: { oldRating: 1500, newRating: 1508, change: 8 },
            black: { oldRating: 1500, newRating: 1492, change: -8 },
        })
        // Was: "+8" / "-8" beside the strip ratings and "Rating +8" in the modal.
        expect(screen.getByText('1512 +8')).toBeInTheDocument()
        expect(screen.getByText('1488 -8')).toBeInTheDocument()
        socket.serverSends('game_end', { game_id: 'g1', result: 'White wins', reason: 'Resignation' })
        expect(await screen.findByText('Bob resigned. You win!')).toBeInTheDocument()
        expect(screen.getByText('1512 +8')).toBeInTheDocument()
    })

    test('opponent_disconnected shows a countdown banner that ticks; opponent_reconnected hides it', async () => {
        jest.useFakeTimers()
        await renderGame()
        socket.serverSends('opponent_disconnected', { timeoutSeconds: 15 })
        expect(screen.getByText(/Opponent disconnected — they have 15s to reconnect/)).toBeInTheDocument()
        act(() => { jest.advanceTimersByTime(3000) })
        expect(screen.getByText(/they have 12s to reconnect/)).toBeInTheDocument()
        socket.serverSends('opponent_reconnected')
        expect(screen.queryByText(/Opponent disconnected/)).not.toBeInTheDocument()
    })

    test('opponent_disconnected without timeoutSeconds defaults to 20s', async () => {
        await renderGame()
        socket.serverSends('opponent_disconnected', {})
        expect(screen.getByText(/they have 20s to reconnect/)).toBeInTheDocument()
    })

    test('socket disconnect shows "Reconnecting…"; connect hides it and re-emits join_game', async () => {
        await renderGame()
        socket.serverSends('disconnect')
        expect(screen.getByText('Reconnecting…')).toBeInTheDocument()
        socket.emit.mockClear()
        socket.serverSends('connect')
        expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument()
        expect(socket.emit.mock.calls).toEqual([['join_game', 'g1']])
    })
})

// ── Clock ticking ───────────────────────────────────────────────────────────

describe('clock tick', () => {
    test('clocks do not tick before the server activates them', async () => {
        jest.useFakeTimers()
        await renderGame()
        act(() => { jest.advanceTimersByTime(5000) })
        expect(clockTexts()).toEqual(['5:00', '5:00'])
    })

    test('after a move, the side to move loses one second per second (display only)', async () => {
        jest.useFakeTimers()
        await renderGame()
        socket.serverSends('move_made', { game_id: 'g1', from: 'e2', to: 'e4', fen: AFTER_E4, san: 'e4', whiteMs: 300_000, blackMs: 300_000 })
        act(() => { jest.advanceTimersByTime(3000) })
        expect(clockTexts()).toEqual(['4:57', '5:00'])
    })

    test('game_state_sync with clockActive=true starts the ticking for the side in the FEN', async () => {
        jest.useFakeTimers()
        await renderGame()
        socket.serverSends('game_state_sync', { fen: START_FEN, moveLog: [], whiteMs: 10_000, blackMs: 10_000, clockActive: true })
        act(() => { jest.advanceTimersByTime(2000) })
        expect(clockTexts()).toEqual(['0:10', '0:08'])
    })

    test('clock stops ticking while the opponent is disconnected', async () => {
        jest.useFakeTimers()
        await renderGame()
        socket.serverSends('game_state_sync', { fen: START_FEN, moveLog: [], whiteMs: 10_000, blackMs: 10_000, clockActive: true })
        socket.serverSends('opponent_disconnected', { timeoutSeconds: 20 })
        act(() => { jest.advanceTimersByTime(3000) })
        expect(clockTexts()).toEqual(['0:10', '0:10'])
    })
})

// ── Making moves ────────────────────────────────────────────────────────────

describe('making moves', () => {
    test('click own pawn then a legal square emits make_move with squares only — no fen/san/captured [S1]', async () => {
        await renderGame()
        click(square('e2'))
        click(square('e4'))
        // The server computes the position, SAN and capture flag itself; the client only names the move.
        expect(socket.emitted('make_move')).toEqual([{ game_id: 'g1', from: 'e2', to: 'e4', promotion: 'q' }])
        expect(pieceOn('e4')).toBe('wp')
        // optimistic update does NOT add to the move list; the server echo does
        expect(screen.getByText('No moves yet.')).toBeInTheDocument()
    })

    test('move_rejected + the resync that follows snap the board back to the server position [S1]', async () => {
        await renderGame()
        click(square('e2'))
        click(square('e4'))
        expect(pieceOn('e4')).toBe('wp') // optimistic
        socket.serverSends('move_rejected', { game_id: 'g1', reason: 'illegal_move' })
        socket.serverSends('game_state_sync', { fen: START_FEN, moveLog: [], whiteMs: 300_000, blackMs: 300_000, clockActive: false })
        expect(pieceOn('e4')).toBeNull()
        expect(pieceOn('e2')).toBe('wp')
        expect(screen.getByText('No moves yet.')).toBeInTheDocument()
        // ...and the player can move again from the real position.
        click(square('d2'))
        click(square('d4'))
        expect(socket.emitted('make_move')).toHaveLength(2)
    })

    test('a move_rejected for another game is ignored', async () => {
        await renderGame()
        click(square('e2'))
        click(square('e4'))
        socket.serverSends('move_rejected', { game_id: 'other', reason: 'illegal_move' })
        expect(pieceOn('e4')).toBe('wp')
    })

    test('clicking an illegal destination deselects without emitting', async () => {
        await renderGame()
        click(square('e2'))
        click(square('e5'))
        click(square('e4'))
        expect(socket.emitted('make_move')).toEqual([])
    })

    test('clicking an opponent piece does nothing', async () => {
        await renderGame()
        click(square('e7'))
        click(square('e5'))
        expect(socket.emitted('make_move')).toEqual([])
    })

    test('cannot move when it is not my turn', async () => {
        profile = { ...ME, id: 'opp' }
        await renderGame()
        click(square('e7'))
        click(square('e5'))
        expect(socket.emitted('make_move')).toEqual([])
    })

    test('black can move after white has moved (flipped board coordinates)', async () => {
        profile = { ...ME, id: 'opp' }
        await renderGame()
        socket.serverSends('move_made', { game_id: 'g1', from: 'e2', to: 'e4', fen: AFTER_E4, san: 'e4' })
        click(square('e7'))
        click(square('e5'))
        expect(socket.emitted('make_move')).toEqual([{ game_id: 'g1', from: 'e7', to: 'e5', promotion: 'q' }])
    })

    test('a capture is sent like any other move (the server reports `captured`)', async () => {
        await renderGame()
        socket.serverSends('game_state_sync', {
            fen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', moveLog: [],
            whiteMs: 300_000, blackMs: 300_000, clockActive: true,
        })
        click(square('e4'))
        click(square('d5'))
        expect(socket.emitted('make_move')).toEqual([{ game_id: 'g1', from: 'e4', to: 'd5', promotion: 'q' }])
    })

    test('pawn reaching the last rank opens the promotion picker and emits the chosen piece', async () => {
        await renderGame()
        socket.serverSends('game_state_sync', { fen: '7k/P7/8/8/8/8/8/4K3 w - - 0 1', moveLog: [], whiteMs: 1000, blackMs: 1000, clockActive: false })
        click(square('a7'))
        click(square('a8'))
        expect(screen.getByText('Choose promotion')).toBeInTheDocument()
        expect(socket.emitted('make_move')).toEqual([])
        const options = screen.getAllByRole('button', { name: /Queen|Rook|Bishop|Knight/ }).map(b => b.textContent)
        expect(options).toEqual(['Queen', 'Rook', 'Bishop', 'Knight'])
        click(screen.getByRole('button', { name: /Knight/ }))
        expect(socket.emitted('make_move')).toEqual([{ game_id: 'g1', from: 'a7', to: 'a8', promotion: 'n' }])
        expect(screen.queryByText('Choose promotion')).not.toBeInTheDocument()
    })

    test('my checkmating move emits make_move only; I never report the result, the server announces it [S3]', async () => {
        await renderGame()
        socket.serverSends('game_state_sync', {
            fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', moveLog: [],
            whiteMs: 300_000, blackMs: 300_000, clockActive: true,
        })
        click(square('h5'))
        click(square('f7'))
        // Was: ['make_move', 'game_end'] — the client told the server who won.
        expect(socket.emit.mock.calls.filter(([e]) => e === 'make_move' || e === 'game_end').map(([e]) => e)).toEqual(['make_move'])
        expect(socket.emitted('make_move')[0]).toMatchObject({ from: 'h5', to: 'f7' })
        expect(screen.queryByText(/^Checkmate\./)).not.toBeInTheDocument()
        socket.serverSends('game_end', { game_id: 'g1', result: 'White wins', reason: 'Checkmate', white_id: 'me', black_id: 'opp' })
        expect(await screen.findByText('Checkmate. You win!')).toBeInTheDocument()
    })
})

// ── History navigation ──────────────────────────────────────────────────────

describe('history navigation', () => {
    async function twoMoves() {
        await renderGame()
        socket.serverSends('move_made', { game_id: 'g1', from: 'e2', to: 'e4', fen: AFTER_E4, san: 'e4' })
        socket.serverSends('move_made', { game_id: 'g1', from: 'e7', to: 'e5', fen: AFTER_E4_E5, san: 'e5' })
    }

    test('the first ArrowLeft from live shows the position before the last move; ArrowRight returns live [F6]', async () => {
        await twoMoves()
        fireEvent.keyDown(document, { key: 'ArrowLeft' })
        // Was (LEGACY): snapshots hold post-move FENs, so the first press showed "move 2 of 2" = the live board.
        expect(screen.getByText(/Viewing move 1 of 2/)).toBeInTheDocument()
        expect(pieceOn('e5')).toBeNull()
        expect(pieceOn('e4')).toBe('wp')
        fireEvent.keyDown(document, { key: 'ArrowLeft' })
        expect(screen.getByText(/Viewing move 1 of 2/)).toBeInTheDocument() // clamps at 0
        fireEvent.keyDown(document, { key: 'ArrowRight' })
        expect(screen.queryByText(/Viewing move/)).not.toBeInTheDocument()
        expect(pieceOn('e5')).toBe('bp')
        fireEvent.keyDown(document, { key: 'ArrowRight' })
        expect(screen.queryByText(/Viewing move/)).not.toBeInTheDocument() // already live
    })

    test('arrow keys are ignored while typing in an input', async () => {
        await twoMoves()
        fireEvent.keyDown(chatInput(), { key: 'ArrowLeft' })
        expect(screen.queryByText(/Viewing move/)).not.toBeInTheDocument()
    })

    test('clicking a move in the list jumps there; "Return to live" goes back', async () => {
        await twoMoves()
        click(screen.getByRole('button', { name: 'e4' }))
        expect(screen.getByText(/Viewing move 1 of 2/)).toBeInTheDocument()
        click(screen.getByRole('button', { name: 'Return to live' }))
        expect(screen.queryByText(/Viewing move/)).not.toBeInTheDocument()
    })

    test('while viewing history I cannot move', async () => {
        await twoMoves()
        fireEvent.keyDown(document, { key: 'ArrowLeft' })
        click(square('d2'))
        click(square('d4'))
        expect(socket.emitted('make_move')).toEqual([])
    })

    test('a new move_made snaps back to live', async () => {
        await twoMoves()
        fireEvent.keyDown(document, { key: 'ArrowLeft' })
        socket.serverSends('move_made', {
            game_id: 'g1', from: 'g1', to: 'f3',
            fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', san: 'Nf3',
        })
        expect(screen.queryByText(/Viewing move/)).not.toBeInTheDocument()
        expect(screen.getByText('2.')).toBeInTheDocument()
    })
})

// ── Chat ────────────────────────────────────────────────────────────────────

describe('chat', () => {
    test('Enter emits send_message {game_id, from: username, text} and clears the input without echoing locally', async () => {
        await renderGame()
        const input = chatInput()
        fireEvent.change(input, { target: { value: '  hello there  ' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        // LEGACY: the field is `text`; the server persists `data.message` (known bug)
        expect(socket.emitted('send_message')).toEqual([{ game_id: 'g1', from: 'me1', text: 'hello there' }])
        expect(input).toHaveValue('')
        expect(screen.queryByText(/hello there/)).not.toBeInTheDocument()
    })

    test('Send button sends the draft; whitespace-only messages are not sent', async () => {
        await renderGame()
        fireEvent.change(chatInput(), { target: { value: '   ' } })
        click(screen.getByRole('button', { name: 'Send' }))
        expect(socket.emitted('send_message')).toEqual([])
        fireEvent.change(chatInput(), { target: { value: 'gl' } })
        click(screen.getByRole('button', { name: 'Send' }))
        expect(socket.emitted('send_message')).toEqual([{ game_id: 'g1', from: 'me1', text: 'gl' }])
    })

    test('quick replies send at once (Game.dc.html) and leave the draft alone', async () => {
        await renderGame()
        // Was: quick-chat buttons ('Good luck!', 'GG', 'Thanks!', '?!') filled the input.
        const quick = ['Good luck', 'Nice move', 'Good game', 'Thanks'].map(n => screen.getByRole('button', { name: n }).textContent)
        expect(quick).toEqual(['Good luck', 'Nice move', 'Good game', 'Thanks'])
        fireEvent.change(chatInput(), { target: { value: 'draft' } })
        click(screen.getByRole('button', { name: 'Good game' }))
        expect(socket.emitted('send_message')).toEqual([{ game_id: 'g1', from: 'me1', text: 'Good game' }])
        expect(chatInput()).toHaveValue('draft')
    })

    test('spectators see chat but have no input', async () => {
        profile = { ...ME, id: 'spectator-id' }
        await renderGame()
        socket.serverSends('chat_message', { game_id: 'g1', from: 'bob', text: 'hi', from_user_id: 'opp' })
        expect(chatLine('bob hi')).toBeInTheDocument()
        expect(screen.queryByRole('textbox', { name: 'Chat message' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Good luck' })).not.toBeInTheDocument()
    })
})

// ── Resign and draw ─────────────────────────────────────────────────────────

describe('resign', () => {
    test('Resign asks for confirmation; Keep playing backs out without emitting', async () => {
        await renderGame()
        click(resignButton())
        const dialog = screen.getByRole('alertdialog', { name: 'Resign this game?' })
        click(within(dialog).getByRole('button', { name: 'Keep playing' }))
        expect(socket.emitted('resign')).toEqual([])
        expect(socket.emitted('game_end')).toEqual([])
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    test('Escape closes the confirmation without emitting', async () => {
        await renderGame()
        click(resignButton())
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
        expect(socket.emitted('resign')).toEqual([])
    })

    test('confirming emits `resign` { game_id } (no result, no ids); the loss shows when the server ends the game [S3]', async () => {
        await renderGame()
        click(resignButton())
        click(screen.getByRole('button', { name: 'Yes, resign' }))
        // Was: game_end with a client-chosen result, player ids, rated flag and time control.
        expect(socket.emitted('resign')).toEqual([{ game_id: 'g1' }])
        expect(socket.emitted('game_end')).toEqual([])
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
        expect(screen.queryByText(/resigned/)).not.toBeInTheDocument()
        expect(sounds.playGameEndSound).not.toHaveBeenCalled()

        socket.serverSends('game_end', { game_id: 'g1', result: 'Black wins', reason: 'Resignation', white_id: 'me', black_id: 'opp' })
        expect(await screen.findByText('You resigned. Bob wins.')).toBeInTheDocument()
        expect(sounds.playGameEndSound).toHaveBeenCalledWith(false)
    })

    test('resigning as black sends the same `resign` { game_id }: the server works out the winner [S3]', async () => {
        profile = { ...ME, id: 'opp' }
        delete gameRow.is_rated
        delete gameRow.time_control
        await renderGame()
        click(resignButton())
        click(screen.getByRole('button', { name: 'Yes, resign' }))
        expect(socket.emitted('resign')).toEqual([{ game_id: 'g1' }])
        expect(socket.emitted('game_end')).toEqual([])
    })

    test('spectators get no resign or draw button', async () => {
        profile = { ...ME, id: 'spectator-id' }
        await renderGame()
        expect(resignButton()).toBeUndefined()
        expect(screen.queryByRole('button', { name: 'Draw' })).not.toBeInTheDocument()
        expect(screen.getByText('Spectating')).toBeInTheDocument()
    })
})

describe('draw', () => {
    test('Draw asks for confirmation naming the opponent; confirming emits nothing yet (no server draw flow)', async () => {
        await renderGame()
        click(screen.getAllByRole('button', { name: 'Draw' })[0])
        const dialog = screen.getByRole('alertdialog', { name: 'Offer a draw to Bob?' })
        socket.emit.mockClear()
        click(within(dialog).getByRole('button', { name: 'Offer draw' }))
        // TODO(draw-offer): expect draw_offer once the server flow is approved (design/DRAW-OFFER-PROPOSAL.md).
        expect(socket.emit).not.toHaveBeenCalled()
        expect(fetchMock).toHaveBeenCalledTimes(1) // the game load only: no PATCH of games.draw_offer
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
        expect(screen.getByText('Your move')).toBeInTheDocument()
    })

    test('Cancel closes the draw confirmation', async () => {
        await renderGame()
        click(screen.getAllByRole('button', { name: 'Draw' })[0])
        click(screen.getByRole('button', { name: 'Cancel' }))
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
})

// ── Result state & rematch ──────────────────────────────────────────────────

describe('result state and rematch', () => {
    async function endedGame() {
        await renderGame()
        socket.serverSends('game_end', { game_id: 'g1', result: 'Black wins', reason: 'Timeout' })
        await screen.findByText('Timeout. Bob wins.')
    }

    test('Rematch emits rematch_request with this exact payload, then shows Waiting…', async () => {
        await endedGame()
        click(screen.getByRole('button', { name: 'Rematch' }))
        // S2: no from_user_id — the server takes the sender from the socket handshake.
        expect(socket.emitted('rematch_request')).toEqual([{
            to_user_id: 'opp', from_username: 'Me Display', time_control: '5', is_rated: true,
        }])
        const waiting = screen.getByRole('button', { name: 'Waiting…' })
        expect(waiting).toBeDisabled()
    })

    test('from_username falls back to username when there is no display_name', async () => {
        profile = { ...ME, display_name: null }
        await endedGame()
        click(screen.getByRole('button', { name: 'Rematch' }))
        expect(socket.emitted('rematch_request')[0].from_username).toBe('me1')
    })

    test('rematch_declined turns the button into a disabled "Declined"', async () => {
        await endedGame()
        click(screen.getByRole('button', { name: 'Rematch' }))
        socket.serverSends('rematch_declined')
        expect(screen.getByRole('button', { name: 'Declined' })).toBeDisabled()
    })

    test('rematch_ready navigates to the new game', async () => {
        await endedGame()
        socket.serverSends('rematch_ready', { game_id: 'g2' })
        expect(push).toHaveBeenCalledWith('/game/g2')
    })

    test('New game goes to the lobby', async () => {
        await endedGame()
        click(screen.getByRole('button', { name: 'New game' }))
        expect(push).toHaveBeenCalledWith('/lobby')
    })

    test('after the game the moves can be reviewed from the move list', async () => {
        await renderGame()
        socket.serverSends('move_made', { game_id: 'g1', from: 'e2', to: 'e4', fen: AFTER_E4, san: 'e4' })
        socket.serverSends('game_end', { game_id: 'g1', result: 'Draw', reason: 'Agreement' })
        // Was: a "Game Review" button in the modal jumping to the first move.
        click(await screen.findByRole('button', { name: 'e4' }))
        expect(screen.getByText(/Viewing move 1 of 1/)).toBeInTheDocument()
    })

    test('spectators see the verdict with names and no Rematch button', async () => {
        profile = { ...ME, id: 'spectator-id' }
        await renderGame()
        socket.serverSends('game_end', { game_id: 'g1', result: 'White wins', reason: 'Checkmate' })
        expect(await screen.findByText('Checkmate. Alice wins.')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Rematch' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'New game' })).toBeInTheDocument()
    })

    test('incoming rematch_request shows a prompt with name, time control and rated flag', async () => {
        await renderGame()
        socket.serverSends('rematch_request', { from_user_id: 'opp', from_username: 'Bob' })
        expect(screen.getByText('Bob wants a rematch')).toBeInTheDocument()
        expect(screen.getByText('5 min · Rated')).toBeInTheDocument()
    })

    const rematchPrompt = () => screen.getByText('Bob wants a rematch').closest('[role="status"]') as HTMLElement

    test('accepting emits rematch_accept naming only the requester and hides the prompt [S4]', async () => {
        await renderGame()
        socket.serverSends('rematch_request', { from_user_id: 'opp', from_username: 'Bob' })
        const [, accept] = within(rematchPrompt()).getAllByRole('button')
        expect(accept).toHaveTextContent('Accept')
        click(accept)
        // S4: no terms and no own id — the server uses the request it stored.
        expect(socket.emitted('rematch_accept')).toEqual([{ from_user_id: 'opp' }])
        expect(screen.queryByText('Bob wants a rematch')).not.toBeInTheDocument()
    })

    test('declining emits rematch_decline naming the REQUESTER, so the opponent is told [S4]', async () => {
        await renderGame()
        socket.serverSends('rematch_request', { from_user_id: 'opp', from_username: 'Bob' })
        const [decline] = within(rematchPrompt()).getAllByRole('button')
        expect(decline).toHaveTextContent('Decline')
        click(decline)
        // Was: addressed to my own id (legacy bug F1), so the opponent never heard about it.
        expect(socket.emitted('rematch_decline')).toEqual([{ from_user_id: 'opp' }])
        expect(screen.queryByText('Bob wants a rematch')).not.toBeInTheDocument()
    })

    test('an unanswered rematch prompt auto-dismisses after 30 s', async () => {
        jest.useFakeTimers()
        await renderGame()
        socket.serverSends('rematch_request', { from_user_id: 'opp', from_username: 'Bob' })
        act(() => { jest.advanceTimersByTime(29_999) })
        expect(screen.getByText('Bob wants a rematch')).toBeInTheDocument()
        act(() => { jest.advanceTimersByTime(1) })
        expect(screen.queryByText('Bob wants a rematch')).not.toBeInTheDocument()
    })

    test('a second rematch request restarts the 30 s window instead of inheriting the first timer [F3]', async () => {
        jest.useFakeTimers()
        await renderGame()
        socket.serverSends('rematch_request', { from_user_id: 'opp', from_username: 'Bob' })
        act(() => { jest.advanceTimersByTime(20_000) })
        socket.serverSends('rematch_request', { from_user_id: 'opp', from_username: 'Bob' })
        act(() => { jest.advanceTimersByTime(10_000) }) // the first request's 30 s are up
        expect(screen.getByText('Bob wants a rematch')).toBeInTheDocument()
        act(() => { jest.advanceTimersByTime(19_999) })
        expect(screen.getByText('Bob wants a rematch')).toBeInTheDocument()
        act(() => { jest.advanceTimersByTime(1) })
        expect(screen.queryByText('Bob wants a rematch')).not.toBeInTheDocument()
    })

    test('unmounting clears the pending rematch timer [F3]', async () => {
        jest.useFakeTimers()
        const { unmount } = await renderGame()
        socket.serverSends('rematch_request', { from_user_id: 'opp', from_username: 'Bob' })
        unmount()
        expect(jest.getTimerCount()).toBe(0)
    })
})

// ── Board controls ──────────────────────────────────────────────────────────

describe('board controls', () => {
    test('Flip swaps orientation and player bars', async () => {
        await renderGame()
        click(flipButton())
        expect(topLeftSquare()).toBe('h1')
        expect(pieceOn('h1', true)).toBe('wr')
        const names = screen.getAllByRole('link', { name: /^(Alice|Bob)$/ }).map(a => a.textContent)
        expect(names).toEqual(['Alice', 'Bob'])
    })

    test('toggling sound off silences move sounds without re-joining the game [F2]', async () => {
        await renderGame()
        const registrations = socket.on.mock.calls.length
        click(screen.getAllByTitle('Toggle sound')[0])
        // Was (LEGACY): soundOn was a dependency of the socket effect, so toggling re-emitted join_game.
        expect(socket.emitted('join_game')).toEqual(['g1'])
        expect(socket.on.mock.calls.length).toBe(registrations)
        socket.serverSends('move_made', { game_id: 'g1', from: 'e2', to: 'e4', fen: AFTER_E4, san: 'e4' })
        expect(sounds.playMoveSound).not.toHaveBeenCalled()
        click(screen.getAllByTitle('Toggle sound')[0])
        socket.serverSends('move_made', { game_id: 'g1', from: 'e7', to: 'e5', fen: AFTER_E4_E5, san: 'e5' })
        expect(sounds.playMoveSound).toHaveBeenCalledTimes(1)
    })

    test('focus mode hides the title and side panels and puts Draw / Flip / Resign beside the board', async () => {
        await renderGame()
        click(screen.getByRole('button', { name: 'Focus mode' }))
        expect(screen.getByRole('button', { name: 'Exit focus' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.queryByRole('heading')).not.toBeInTheDocument()
        expect(screen.queryByText('Game info')).not.toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: /^(Draw|Flip|Resign)$/ }).map(b => b.textContent)).toEqual(['Draw', 'Flip', 'Resign'])
        click(screen.getByRole('button', { name: 'Resign' }))
        expect(screen.getByRole('alertdialog', { name: 'Resign this game?' })).toBeInTheDocument()
        click(screen.getByRole('button', { name: 'Keep playing' }))
        click(screen.getByRole('button', { name: 'Exit focus' }))
        expect(screen.getByRole('heading', { name: 'Game vs Bob' })).toBeInTheDocument()
    })

    test('focus mode ends with the game', async () => {
        await renderGame()
        click(screen.getByRole('button', { name: 'Focus mode' }))
        socket.serverSends('game_end', { game_id: 'g1', result: 'Draw', reason: 'Stalemate' })
        expect(screen.getByRole('button', { name: 'Focus mode' })).toHaveAttribute('aria-pressed', 'false')
        expect(screen.getByText('Stalemate. The game is a draw.')).toBeInTheDocument()
    })

    test('the selected piece and its legal destinations are marked; the last move is highlighted', async () => {
        await renderGame()
        click(square('e2'))
        expect(square('e2')).toHaveAttribute('aria-pressed', 'true')
        expect(square('e3').querySelector('[data-dot]')).not.toBeNull()
        expect(square('e4').querySelector('[data-dot]')).not.toBeNull()
        socket.serverSends('move_made', { game_id: 'g1', from: 'e2', to: 'e4', fen: AFTER_E4, san: 'e4' })
        expect(square('e2').querySelector('[data-mark="last"]')).not.toBeNull()
        expect(square('e4').querySelector('[data-mark="last"]')).not.toBeNull()
    })

    test('player bars: the opponent online from presence; the clock of the side to move is active', async () => {
        await renderGame()
        const [top, bottom] = screen.getAllByRole('timer')
        expect(top).toHaveAttribute('data-active', 'false')
        expect(bottom).toHaveAttribute('data-active', 'true')
        expect(bottom).toHaveAccessibleName('Your clock')
        expect(top).toHaveAccessibleName('Black clock')
    })
})
