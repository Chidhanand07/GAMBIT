import { Chess } from 'chess.js'
import * as sounds from '@/lib/sounds'
import * as moveEffects from '@/features/game/utils/moveEffects'
import { isPromotionMove, playMoveSoundFor } from '@/features/game/utils/moveEffects'
import { historyStorageKey, saveHistory, stepBackIndex, stepForwardIndex } from '@/features/game/utils/history'
import { seatFor } from '@/features/game/utils/seat'
import { deriveGameView } from '@/features/game/utils/gameView'
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
    test('step indexes (snapshots are post-move FENs; first back from live lands on the last one)', () => {
        expect(stepBackIndex(null, 2)).toBe(1)
        expect(stepBackIndex(0, 2)).toBe(0)
        expect(stepForwardIndex(0, 2)).toBe(1)
        expect(stepForwardIndex(1, 2)).toBeNull()
        expect(stepForwardIndex(null, 2)).toBe(0)
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
    const state = () => ({
        ...createInitialGameState(),
        gameData: { white: { username: 'alice', display_name: 'Alice' }, black: { username: 'bob' } } as never,
        whiteTime: 10, blackTime: 20, whiteRatingChange: 5,
    })

    test('unflipped: black on top; the side to move is active', () => {
        const v = deriveGameView(state(), { turn: () => 'w' }, false)
        expect(v.top).toMatchObject({ time: 20, isActive: false, ratingChange: null })
        expect(v.bottom).toMatchObject({ time: 10, isActive: true, ratingChange: 5 })
        expect(v.turnIndicator).toEqual({ isWhiteToMove: true, label: "Alice's turn" })
    })

    test('flipped puts white on top; game over clears active clocks and the indicator', () => {
        const v = deriveGameView({ ...state(), flipped: true, gameOver: { result: 'Draw', reason: 'x' } }, { turn: () => 'w' }, true)
        expect(v.top).toMatchObject({ time: 10, isActive: false })
        expect(v.bottom.isActive).toBe(false)
        expect(v.turnIndicator).toBeNull()
    })

    test('label falls back to username then colour; my turn wins', () => {
        expect(deriveGameView(state(), { turn: () => 'b' }, false).turnIndicator?.label).toBe("bob's turn")
        expect(deriveGameView(createInitialGameState(), { turn: () => 'b' }, false).turnIndicator?.label).toBe("Black's turn")
        expect(deriveGameView(state(), { turn: () => 'b' }, true).turnIndicator?.label).toBe('Your turn')
    })
})
