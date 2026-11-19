/**
 * Draw offers on the client [DRAW-OFFER] (ADR F-151): the cadence mirror, the reducer slice,
 * the commands and the Draw button / incoming prompt.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import * as requests from '@/features/game/requestCommands'
import { createInitialGameState, gameReducer } from '@/features/game/state/gameReducer'
import { canOfferDraw } from '@/features/game/utils/drawOffer'
import { GameActionsGrid } from '@/features/game/components/GameActions'
import { RequestPrompt } from '@/features/game/components/RequestPrompt'
import { ACK_POLICY, rejectionMessage } from '@/lib/socket/ack'

describe('canOfferDraw mirrors the server rule', () => {
    test('not before both sides have moved; not while an offer stands', () => {
        expect(canOfferDraw({ color: 'white', plies: 0, pending: false, lastOfferPly: undefined })).toBe(false)
        expect(canOfferDraw({ color: 'black', plies: 1, pending: false, lastOfferPly: undefined })).toBe(false)
        expect(canOfferDraw({ color: 'white', plies: 2, pending: false, lastOfferPly: undefined })).toBe(true)
        expect(canOfferDraw({ color: 'white', plies: 8, pending: true, lastOfferPly: undefined })).toBe(false)
    })

    test('again after two own moves', () => {
        expect(canOfferDraw({ color: 'white', plies: 4, pending: false, lastOfferPly: 2 })).toBe(false)
        expect(canOfferDraw({ color: 'white', plies: 5, pending: false, lastOfferPly: 2 })).toBe(true)
        expect(canOfferDraw({ color: 'black', plies: 5, pending: false, lastOfferPly: 3 })).toBe(false)
        expect(canOfferDraw({ color: 'black', plies: 6, pending: false, lastOfferPly: 3 })).toBe(true)
    })
})

describe('reducer', () => {
    const offered = gameReducer(createInitialGameState(), { type: 'drawOffered', by: 'black', ply: 4 })

    test('drawOffered stores who offered and the ply', () => {
        expect(offered.drawOffer).toBe('black')
        expect(offered.lastDrawOfferPly).toEqual({ black: 4 })
    })

    test('a move, the end of the game and a decline clear the offer; the last ply is kept', () => {
        const moved = gameReducer(offered, { type: 'moveReceived', fen: 'x', from: 'e2', to: 'e4', san: 'e4' })
        expect(moved.drawOffer).toBeNull()
        expect(moved.lastDrawOfferPly).toEqual({ black: 4 })
        const ended = gameReducer(offered, { type: 'gameEnded', info: { result: 'Draw', reason: 'Agreement' } })
        expect(ended.drawOffer).toBeNull()
        expect(gameReducer(offered, { type: 'drawOfferCleared' }).drawOffer).toBeNull()
    })

    test('requestsSynced replaces both from the server', () => {
        const synced = gameReducer(offered, { type: 'requestsSynced', drawOffer: null, lastDrawOfferPly: { white: 2 }, takeback: null, takebackPrefs: {}, premove: null })
        expect(synced.drawOffer).toBeNull()
        expect(synced.lastDrawOfferPly).toEqual({ white: 2 })
    })
})

describe('commands', () => {
    function setup(over = {}) {
        const emit = jest.fn((_e: string, _p: unknown, ack?: (r: unknown) => void) => ack?.({ ok: false, error: 'draw_offer_too_soon' }))
        const notify = jest.fn()
        const dispatch = jest.fn()
        const state = { ...createInitialGameState(), myColor: 'white' as const, ...over }
        const ctx = { socket: { emit } as never, myProfile: null, gameId: 'g1', state, dispatch, notify }
        return { ctx, emit, notify, dispatch }
    }

    test('offer / accept / decline emit the game id only and show a refusal', () => {
        const { ctx, emit, notify, dispatch } = setup()
        requests.offerDraw(ctx)
        requests.acceptDraw(ctx)
        requests.declineDraw(ctx)
        expect(emit.mock.calls.map(([e, p]) => [e, p])).toEqual([
            ['draw_offer', { game_id: 'g1' }],
            ['draw_accept', { game_id: 'g1' }],
            ['draw_decline', { game_id: 'g1' }],
        ])
        expect(notify).toHaveBeenCalledWith(rejectionMessage('draw_offer_too_soon'))
        expect(dispatch).toHaveBeenCalledWith({ type: 'confirmSet', value: null })
        expect(dispatch).toHaveBeenCalledWith({ type: 'drawOfferCleared' })
    })

    test('spectators and finished games send nothing', () => {
        const spectator = setup({ myColor: 'spectator' })
        requests.offerDraw(spectator.ctx)
        const over = setup({ gameOver: { result: 'Draw', reason: 'Agreement' } })
        requests.acceptDraw(over.ctx)
        expect(spectator.emit).not.toHaveBeenCalled()
        expect(over.emit).not.toHaveBeenCalled()
    })

    test('ack policy: offer and accept are never re-sent; a repeated decline that finds nothing is done', () => {
        expect(ACK_POLICY.draw_offer).toEqual({ retryOnce: false })
        expect(ACK_POLICY.draw_accept).toEqual({ retryOnce: false })
        expect(ACK_POLICY.draw_decline).toEqual({ retryOnce: true, doneOnRetry: ['no_pending_request'] })
        expect(rejectionMessage('draw_offer_pending')).toBe('A draw offer is already waiting for an answer.')
    })
})

describe('components', () => {
    const base = { isPlayer: true, over: false, onFlip: jest.fn(), onDraw: jest.fn(), onResign: jest.fn() }

    test('Draw reads "Draw offered" and is disabled while my offer stands', () => {
        render(<GameActionsGrid {...base} drawOffered canOfferDraw={false} />)
        expect(screen.getByRole('button', { name: 'Draw offered' })).toBeDisabled()
    })

    test('Draw is disabled when the server would refuse, enabled otherwise', () => {
        const { rerender } = render(<GameActionsGrid {...base} canOfferDraw={false} />)
        expect(screen.getByRole('button', { name: 'Draw' })).toBeDisabled()
        rerender(<GameActionsGrid {...base} canOfferDraw />)
        fireEvent.click(screen.getByRole('button', { name: 'Draw' }))
        expect(base.onDraw).toHaveBeenCalled()
    })

    test('RequestPrompt: text, then Decline and Accept', () => {
        const onAccept = jest.fn()
        const onDecline = jest.fn()
        render(<RequestPrompt text="Bob offers a draw" onAccept={onAccept} onDecline={onDecline} />)
        expect(screen.getByRole('status')).toHaveTextContent('Bob offers a draw')
        expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Decline', 'Accept'])
        fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
        fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
        expect(onAccept).toHaveBeenCalledTimes(1)
        expect(onDecline).toHaveBeenCalledTimes(1)
    })
})
