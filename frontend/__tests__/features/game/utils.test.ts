import { Chess } from 'chess.js'
import * as sounds from '@/lib/sounds'
import * as moveEffects from '@/features/game/utils/moveEffects'
import { isPromotionMove, playMoveSoundFor } from '@/features/game/utils/moveEffects'
import { historyStorageKey, saveHistory, stepBackIndex, stepForwardIndex } from '@/features/game/utils/history'
import { seatFor } from '@/features/game/utils/seat'
import { deriveGameView } from '@/features/game/utils/gameView'
import { getFormatRating } from '@/features/game/utils/seatView'
import { outcomeFlags } from '@/features/game/utils/outcome'
import { gameStatus, type StatusInput } from '@/features/game/utils/gameStatus'
import { captureCount, capturesText, materialBalance } from '@/features/game/utils/material'
import { checkedKingSquare } from '@/lib/chess/board'
import * as payloads from '@/features/game/payloads'
import { rematchTerms } from '@/features/game/payloads'
import { createInitialGameState } from '@/features/game/state/gameReducer'

jest.mock('@/lib/sounds', () => ({
    playMoveSound: jest.fn(), playCaptureSound: jest.fn(), playCastleSound: jest.fn(), playCheckSound: jest.fn(),
    playCheckmateSound: jest.fn(), playPromoteSound: jest.fn(), playGameStartSound: jest.fn(), playGameEndSound: jest.fn(),
}))

beforeEach(() => jest.clearAllMocks())

describe('moveEffects', () => {
    test('the client has no game-over detector: results are decided by the server [S3]', () => {
        // Was `detectGameOver`, whose verdict the page showed and reported to the server.
        expect(moveEffects).not.toHaveProperty('detectGameOver')
    })

    test('playMoveSoundFor priority: mate > check > castle > promotion > capture > move', () => {
        const quiet = new Chess()
        playMoveSoundFor(quiet, 'kp', true)
        expect(sounds.playCastleSound).toHaveBeenCalledTimes(1)
        playMoveSoundFor(quiet, 'p', true)
        expect(sounds.playPromoteSound).toHaveBeenCalledTimes(1)
        playMoveSoundFor(quiet, '', 'p')
        expect(sounds.playCaptureSound).toHaveBeenCalledTimes(1)
        playMoveSoundFor(quiet, undefined, undefined)
        expect(sounds.playMoveSound).toHaveBeenCalledTimes(1)
        playMoveSoundFor(new Chess('4k3/8/8/8/8/8/8/4R1K1 b - - 0 1'), 'k', true)
        expect(sounds.playCheckSound).toHaveBeenCalledTimes(1)
    })

    test('isPromotionMove only for pawns reaching their last rank', () => {
        expect(isPromotionMove({ type: 'p', color: 'w' }, 'a8')).toBe(true)
        expect(isPromotionMove({ type: 'p', color: 'b' }, 'a1')).toBe(true)
        expect(isPromotionMove({ type: 'p', color: 'w' }, 'a1')).toBe(false)
        expect(isPromotionMove({ type: 'q', color: 'w' }, 'a8')).toBe(false)
        expect(isPromotionMove(undefined as never, 'a8')).toBe(false)
    })
})

describe('history', () => {
    test('step indexes: snapshots are post-move FENs, so the last one IS the live board [F6]', () => {
        // Was: back from live landed on index 1 of 2 (the live position) and forward from live jumped to 0.
        expect(stepBackIndex(null, 2)).toBe(0)
        expect(stepBackIndex(null, 3)).toBe(1)
        expect(stepBackIndex(null, 1)).toBe(0)
        expect(stepBackIndex(1, 3)).toBe(0)
        expect(stepBackIndex(0, 2)).toBe(0)
        expect(stepForwardIndex(0, 3)).toBe(1)
        expect(stepForwardIndex(1, 3)).toBeNull()
        expect(stepForwardIndex(0, 2)).toBeNull()
        expect(stepForwardIndex(1, 2)).toBeNull()
        expect(stepForwardIndex(null, 2)).toBeNull()
    })

    test('saveHistory writes the legacy JSON under gambit-game-<id> and swallows storage errors', () => {
        saveHistory(historyStorageKey('g1'), { fenSnapshots: ['f'], moveList: ['e4'], lastMove: null })
        expect(localStorage.getItem('gambit-game-g1')).toBe('{"fenSnapshots":["f"],"moveList":["e4"],"lastMove":null}')
        const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
        expect(() => saveHistory('k', { fenSnapshots: [], moveList: [], lastMove: null })).not.toThrow()
        spy.mockRestore()
    })
})

test('seatFor: white wins a tie, unknown ids spectate', () => {
    expect(seatFor({ white_id: 'a', black_id: 'a' }, 'a')).toBe('white')
    expect(seatFor({ white_id: 'a', black_id: 'b' }, 'b')).toBe('black')
    expect(seatFor({ white_id: 'a', black_id: 'b' }, 'c')).toBe('spectator')
})

describe('payloads', () => {
    test('there is no game_end payload builder: the client cannot report a result [S3]', () => {
        expect(payloads).not.toHaveProperty('gameEndPayload')
    })

    test('rematch terms default to time_control="10", is_rated=false when the row lacks them', () => {
        expect(rematchTerms(undefined)).toEqual({ time_control: '10', is_rated: false })
    })
})

describe('deriveGameView', () => {
    const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const state = (over: object = {}) => ({
        ...createInitialGameState(),
        gameData: {
            white_id: 'w-id', black_id: 'b-id', time_control: '5', is_rated: true,
            white: { username: 'alice', display_name: 'Alice', rating_blitz: 1512.4 }, black: { username: 'bob' },
        } as never,
        whiteTime: 10, blackTime: 200, whiteRatingChange: 5,
        ...over,
    })
    const view = (over: object = {}, opts: { turn?: 'w' | 'b'; mine?: boolean; inCheck?: boolean; online?: string[]; away?: boolean; fen?: string; watching?: number | null } = {}) =>
        deriveGameView({
            state: state(over),
            liveChess: { turn: () => opts.turn ?? 'w', inCheck: () => opts.inCheck ?? false },
            displayFen: opts.fen ?? START,
            isMyTurn: opts.mine ?? false,
            onlineUserIds: new Set(opts.online ?? []),
            opponentDisconnected: opts.away ?? false,
            watching: opts.watching,
        })

    test('unflipped: black on top; the side to move is active; ratings by time control with the change', () => {
        const v = view()
        expect(v.top).toMatchObject({ side: 'black', name: 'bob', seconds: 200, active: false, rating: '1200', href: '/profile/bob' })
        expect(v.bottom).toMatchObject({ side: 'white', name: 'Alice', seconds: 10, active: true, rating: '1512 +5' })
        expect(v.status).toEqual({ text: 'Alice is thinking...', tone: 'wait' })
    })

    test('each bar carries the two-letter country chip of its player, none without a known country [F-126]', () => {
        const v = view({
            gameData: {
                white_id: 'w-id', black_id: 'b-id', time_control: '5',
                white: { username: 'alice', country: 'India' }, black: { username: 'bob', country: 'Atlantis' },
            },
        })
        expect(v.bottom.country).toBe('IN')
        expect(v.top.country).toBeNull()
    })

    test('time bar and low clock: percentage of the base time; low under 30 s, never after the game', () => {
        expect(view().bottom).toMatchObject({ timePercent: 3, low: true })
        expect(view().top).toMatchObject({ timePercent: 67, low: false })
        expect(view({ gameOver: { result: 'Draw', reason: 'Stalemate' } }).bottom).toMatchObject({ low: false, active: false })
    })

    test('flipped puts white on top; game over clears both active rings', () => {
        const v = view({ flipped: true, gameOver: { result: 'Draw', reason: 'Stalemate' } })
        expect(v.top).toMatchObject({ side: 'white', active: false })
        expect(v.bottom.active).toBe(false)
        expect(v.status).toEqual({ text: 'Stalemate. The game is a draw.', tone: 'over' })
    })

    test('isMe marks only the bar of my own colour; a spectator has none [F4]', () => {
        const bars = (over: object) => [view(over).top.isMe, view(over).bottom.isMe]
        expect(bars({ myColor: 'spectator' })).toEqual([false, false])
        expect(bars({ myColor: 'white' })).toEqual([false, true])
        expect(bars({ myColor: 'black', flipped: true })).toEqual([false, true])
        expect(bars({ myColor: 'white', flipped: true })).toEqual([true, false])
    })

    test('online: me by my connection; the opponent by presence, not while reported away', () => {
        expect(view({ myColor: 'white' }, { online: ['b-id'] }).top.online).toBe(true)
        expect(view({ myColor: 'white' }, { online: ['b-id'], away: true }).top.online).toBe(false)
        expect(view({ myColor: 'white' }, { online: [] }).top.online).toBe(false)
        expect(view({ myColor: 'white', connected: false }).bottom.online).toBe(false)
    })

    test('title, subtitle and pills for a player and a spectator', () => {
        expect(view({ myColor: 'white' }).header).toEqual({
            title: 'Game vs bob', subtitle: 'Blitz · 5 min · you play White', timeControl: 'Blitz 5 min', pills: ['Rated', 'Blitz 5 min'],
        })
        expect(view({ myColor: 'spectator' }).header).toMatchObject({ title: 'Alice vs bob', subtitle: 'Blitz · 5 min · spectating', pills: ['Rated', 'Blitz 5 min', 'Spectating'] })
    })

    test('[F-102] "N watching" pill (Game.dc.html) only when a spectator count is passed in', () => {
        expect(view({ myColor: 'white' }, { watching: 3 }).header.pills).toEqual(['Rated', 'Blitz 5 min', '3 watching'])
        expect(view({ myColor: 'white' }, { watching: 0 }).header.pills).toEqual(['Rated', 'Blitz 5 min', '0 watching'])
        expect(view({ myColor: 'white' }, { watching: null }).header.pills).toEqual(['Rated', 'Blitz 5 min'])
    })

    test('[F-102] the country chip comes from the player when the game API sends it', () => {
        const v = view({ myColor: 'white', gameData: { ...(state().gameData as object), white: { username: 'alice', display_name: 'Alice', country: 'IN' } } })
        expect(v.bottom.country).toBe('IN')
        expect(v.top.country).toBeNull()
    })

    test('game info: move number, captures, material from my side, my clock', () => {
        const fen = 'rnb1kbnr/pppp1ppp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 4' // black lost the queen and a pawn, white a pawn
        const v = view({ myColor: 'white', moveList: ['e4', 'e5', 'Qh5', 'Qxh5'] }, { fen })
        expect(v.info).toEqual({ move: '3', captures: '1', material: 'You +9', myClock: '0:10' })
        expect(v.bottom.captures).toBe('\u265B\u265F +9')
        expect(v.top.captures).toBe('\u265F')
        expect(view({ myColor: 'black' }, { fen }).info.material).toBe('Alice +9')
        expect(view({ myColor: 'spectator' }).info).toMatchObject({ material: 'Even', myClock: null })
    })

    test('names fall back to username then colour; my turn reads "Your move"', () => {
        expect(view({}, { turn: 'b' }).status.text).toBe('bob is thinking...')
        expect(deriveGameView({
            state: createInitialGameState(), liveChess: { turn: () => 'b', inCheck: () => false }, displayFen: START,
            isMyTurn: false, onlineUserIds: new Set(), opponentDisconnected: false,
        }).status.text).toBe('Black is thinking...')
        expect(view({}, { turn: 'b', mine: true }).status).toEqual({ text: 'Your move', tone: 'move' })
        expect(view({}, { mine: true, inCheck: true }).status.text).toBe('Your move. You are in check')
    })
})

describe('gameStatus after the game (server verdicts only)', () => {
    const input = (result: string, reason: string, myColor: StatusInput['myColor'] = 'white'): StatusInput => ({
        gameOver: { result, reason }, myColor, isMyTurn: false, inCheck: false, turn: 'white',
        names: { white: 'Alice', black: 'Bob' },
    })
    test.each([
        ['White wins', 'Checkmate', 'white', 'Checkmate. You win!'],
        ['Black wins', 'Checkmate', 'white', 'Checkmate. Bob wins.'],
        ['Black wins', 'Resignation', 'white', 'You resigned. Bob wins.'],
        ['White wins', 'Resignation', 'white', 'Bob resigned. You win!'],
        ['White wins', 'Resignation', 'spectator', 'Bob resigned. Alice wins.'],
        ['White wins', 'Time', 'black', 'Out of time. Alice wins.'],
        ['Draw', 'Threefold repetition', 'white', 'Threefold repetition. The game is a draw.'],
        ['Aborted', 'Aborted', 'white', 'Game aborted. Not rated.'],
    ] as const)('%s by %s, seen by %s → "%s"', (result, reason, seat, text) => {
        expect(gameStatus(input(result, reason, seat))).toEqual({ text, tone: 'over' })
    })
})

test('outcomeFlags: spectators never win or lose but can see a draw; an abort is nobody\'s loss', () => {
    const none = { isAborted: false }
    expect(outcomeFlags('White wins', 'white')).toEqual({ isSpectator: false, isWin: true, isDraw: false, isLoss: false, ...none })
    expect(outcomeFlags('White wins', 'black')).toEqual({ isSpectator: false, isWin: false, isDraw: false, isLoss: true, ...none })
    expect(outcomeFlags('Draw', 'spectator')).toEqual({ isSpectator: true, isWin: false, isDraw: true, isLoss: false, ...none })
    expect(outcomeFlags('Aborted', 'black')).toEqual({ isSpectator: false, isWin: false, isDraw: false, isLoss: false, isAborted: true })
})

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

describe('material', () => {
    test('start position: nothing captured, even', () => {
        expect(materialBalance('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toEqual({
            capturedBy: { w: [], b: [] }, advantage: 0,
        })
    })
    test('a promotion counts the new queen, not a missing pawn as a capture by the opponent', () => {
        const b = materialBalance('Q6k/8/8/8/8/8/1PPPPPPP/RNBQKBNR w - - 0 1')
        expect(b.capturedBy.b).toEqual([])
        expect(b.advantage).toBe(18 + 10 + 6 + 6 + 7) // two queens, rooks, bishops, knights, seven pawns vs a lone king
    })
    test('captures text lists the most valuable first, with the lead only when ahead', () => {
        expect(capturesText(['q', 'n', 'p'], 3)).toBe('\u265B\u265E\u265F +3')
        expect(capturesText(['p'], -2)).toBe('\u265F')
        expect(captureCount(['e4', 'd5', 'exd5', 'Qxd5'])).toBe(2)
    })
})

test('checkedKingSquare: the king of the side to move, only when in check', () => {
    const { Chess: C } = jest.requireActual('chess.js')
    expect(checkedKingSquare(new C())).toBeNull()
    expect(checkedKingSquare(new C('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'))).toBe('e1')
})
