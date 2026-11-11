import { createInitialGameState, gameReducer, type GameAction, type GameState } from '@/features/game/state/gameReducer'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

const run = (actions: GameAction[], from: GameState = createInitialGameState()) => actions.reduce(gameReducer, from)

describe('initial state', () => {
    test('matches the legacy useState defaults', () => {
        const s = createInitialGameState()
        expect(s).toMatchObject({
            fen: START_FEN, gameData: null, myColor: 'spectator', selectedSq: null, legalDests: [], lastMove: null,
            moveList: [], fenSnapshots: [], viewIndex: null, flipped: false, soundOn: true, activeTab: 'Moves',
            chatMsg: '', connected: true, pendingPromotion: null, whiteRatingChange: null, blackRatingChange: null,
            showGameOverModal: false, whiteTime: 600, blackTime: 600, gameOver: null, rematchState: 'idle',
            rematchFromUser: '', resignConfirm: false, clockActive: false,
        })
        expect(s.chatLog).toEqual([{ from: 'System', text: 'Game started. Good luck!' }])
    })
})

describe('field identity (effects keyed on these must not re-run spuriously)', () => {
    test('an action leaves untouched fields with the same reference', () => {
        const s0 = run([{ type: 'historyRestored', fenSnapshots: [AFTER_E4], moveList: ['e4'], lastMove: { from: 'e2', to: 'e4' } }])
        const s1 = gameReducer(s0, { type: 'chatDraftChanged', text: 'hi' })
        expect(s1.fenSnapshots).toBe(s0.fenSnapshots)
        expect(s1.moveList).toBe(s0.moveList)
        expect(s1.lastMove).toBe(s0.lastMove)
        expect(s1.gameOver).toBe(s0.gameOver)
    })

    test('rematchExpired returns the same state object unless a request is showing', () => {
        const s = createInitialGameState()
        expect(gameReducer(s, { type: 'rematchExpired' })).toBe(s)
        const received = gameReducer(s, { type: 'rematchReceived', fromUsername: 'Bob' })
        expect(gameReducer(received, { type: 'rematchExpired' }).rematchState).toBe('idle')
        const sent = gameReducer(s, { type: 'rematchStateSet', value: 'sent' })
        expect(gameReducer(sent, { type: 'rematchExpired' })).toBe(sent)
    })

    test('gameEnded always stores a new object (re-arms the 400 ms modal timer like setGameOver({...}))', () => {
        const info = { result: 'Draw', reason: 'Agreement' }
        const a = gameReducer(createInitialGameState(), { type: 'gameEnded', info })
        const b = gameReducer(a, { type: 'gameEnded', info })
        expect(a.gameOver).toEqual(info)
        expect(a.gameOver).not.toBe(info)
        expect(b.gameOver).not.toBe(a.gameOver)
    })
})

describe('seat', () => {
    test('white unflips, black flips, spectator keeps the current orientation', () => {
        const flipped = run([{ type: 'flipToggled' }])
        expect(gameReducer(flipped, { type: 'seatResolved', myColor: 'white' })).toMatchObject({ myColor: 'white', flipped: false })
        expect(run([{ type: 'seatResolved', myColor: 'black' }])).toMatchObject({ myColor: 'black', flipped: true })
        expect(gameReducer(flipped, { type: 'seatResolved', myColor: 'spectator' })).toMatchObject({ myColor: 'spectator', flipped: true })
    })
})

describe('moves', () => {
    test('moveReceived appends history, snaps to live, clears selection, converts ms when present', () => {
        const s = run([
            { type: 'squareSelected', square: 'e2', dests: ['e3', 'e4'] },
            { type: 'historyViewed', index: 0 },
            { type: 'moveReceived', fen: AFTER_E4, from: 'e2', to: 'e4', san: 'e4', whiteMs: 298_400 },
        ])
        expect(s).toMatchObject({
            fen: AFTER_E4, fenSnapshots: [AFTER_E4], moveList: ['e4'], viewIndex: null,
            lastMove: { from: 'e2', to: 'e4' }, selectedSq: null, legalDests: [], whiteTime: 298, blackTime: 600,
        })
    })

    test('moveReceived does not itself activate the clock (clockActivated is dispatched first)', () => {
        expect(run([{ type: 'moveReceived', fen: AFTER_E4, from: 'e2', to: 'e4', san: 'e4' }]).clockActive).toBe(false)
        expect(run([{ type: 'clockActivated' }]).clockActive).toBe(true)
    })

    test('moveCommitted updates the board but not the move list', () => {
        const s = run([
            { type: 'promotionPending', move: { from: 'a7', to: 'a8' } },
            { type: 'moveCommitted', fen: AFTER_E4, from: 'e2', to: 'e4' },
        ])
        expect(s).toMatchObject({ fen: AFTER_E4, lastMove: { from: 'e2', to: 'e4' }, pendingPromotion: null, moveList: [] })
    })

    test('promotionPending clears the selection', () => {
        const s = run([
            { type: 'squareSelected', square: 'a7', dests: ['a8'] },
            { type: 'promotionPending', move: { from: 'a7', to: 'a8' } },
        ])
        expect(s).toMatchObject({ selectedSq: null, legalDests: [], pendingPromotion: { from: 'a7', to: 'a8' } })
    })
})

describe('server sync', () => {
    test('stateSynced with history replaces the lists; without keeps them', () => {
        const base = run([{ type: 'historyRestored', fenSnapshots: ['x'], moveList: ['y'], lastMove: null }])
        const kept = gameReducer(base, { type: 'stateSynced', history: null, whiteMs: 1000, blackMs: 2499, clockActive: true })
        expect(kept.fenSnapshots).toBe(base.fenSnapshots)
        expect(kept).toMatchObject({ whiteTime: 1, blackTime: 2, clockActive: true })
        const replaced = gameReducer(base, {
            type: 'stateSynced', history: { fens: [AFTER_E4], sans: ['e4'] }, whiteMs: 0, blackMs: 0, clockActive: false,
        })
        expect(replaced).toMatchObject({ fenSnapshots: [AFTER_E4], moveList: ['e4'] })
    })

    test('clockSynced takes the server value, but keeps the previous one when the server value is NaN', () => {
        const s = run([{ type: 'clockSynced', whiteMs: 61_000, blackMs: Number.NaN }])
        expect(s.whiteTime).toBe(61)
        expect(s.blackTime).toBe(600)
    })

    test('clockTicked decrements the side to move and floors at 0; any non-"w" side ticks black', () => {
        const s = run([{ type: 'clockPreset', seconds: 1 }, { type: 'clockTicked', side: 'w' }, { type: 'clockTicked', side: 'w' }])
        expect(s.whiteTime).toBe(0)
        expect(run([{ type: 'clockTicked', side: 'x' }]).blackTime).toBe(599)
    })

    test('ratingChanged sets one side at a time', () => {
        const s = run([{ type: 'ratingChanged', side: 'white', change: 8 }])
        expect(s).toMatchObject({ whiteRatingChange: 8, blackRatingChange: null })
    })
})

describe('ui toggles', () => {
    test('sound, flip, tab, chat, connection, resign confirm, modal', () => {
        const s = run([
            { type: 'soundToggled' }, { type: 'flipToggled' }, { type: 'tabSelected', tab: 'Chat' },
            { type: 'chatReceived', line: { from: 'bob', text: 'hi' } }, { type: 'connectionChanged', connected: false },
            { type: 'resignConfirmSet', value: true }, { type: 'gameOverModalShown', visible: true },
        ])
        expect(s).toMatchObject({ soundOn: false, flipped: true, activeTab: 'Chat', connected: false, resignConfirm: true, showGameOverModal: true })
        expect(s.chatLog).toHaveLength(2)
    })
})
