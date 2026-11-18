/**
 * The live game screen's presentational pieces (Game.dc.html) [REDESIGN-GAME]. Rewritten from the
 * old strip/square/modal/history-controls tests: the behaviours they pinned are asserted on the
 * new markup here, in utils.test.ts and in characterization/GamePage.test.tsx.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ControlsCard } from '@/features/game/components/ControlsCard'
import { FocusActions, GameActionsGrid } from '@/features/game/components/GameActions'
import { ChatCard } from '@/features/game/components/ChatCard'
import { ConfirmDialogs } from '@/features/game/components/ConfirmDialogs'
import { GameInfoCard } from '@/features/game/components/GameInfoCard'
import { GameLayout } from '@/features/game/components/GameLayout'
import { BoardTools } from '@/features/game/components/BoardTools'
import { PromotionPicker } from '@/features/game/components/PromotionPicker'

jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ children, href, className }: any) => <a href={href} className={className}>{children}</a>,
}))

const actions = (over = {}) => ({
    isPlayer: true, over: false, onFlip: jest.fn(), onDraw: jest.fn(), onResign: jest.fn(), ...over,
})
const status = { text: 'Your move', tone: 'move' as const }

describe('ControlsCard', () => {
    test('status line is a polite live region; Flip / Draw / Resign in that order', () => {
        const a = actions()
        render(<ControlsCard status={status} end={null}><GameActionsGrid {...a} /></ControlsCard>)
        expect(screen.getByText('Your move').parentElement).toHaveAttribute('aria-live', 'polite')
        const names = screen.getAllByRole('button').map((b) => b.textContent)
        expect(names).toEqual(['Flip', 'Draw', 'Resign'])
        fireEvent.click(screen.getByRole('button', { name: 'Resign' }))
        fireEvent.click(screen.getByRole('button', { name: 'Draw' }))
        fireEvent.click(screen.getByRole('button', { name: 'Flip' }))
        expect([a.onResign, a.onDraw, a.onFlip].map((f) => f.mock.calls.length)).toEqual([1, 1, 1])
        expect(screen.queryByRole('button', { name: 'Rematch' })).toBeNull()
    })

    test('a spectator gets Flip only', () => {
        render(<ControlsCard status={status} end={null}><GameActionsGrid {...actions({ isPlayer: false })} /></ControlsCard>)
        expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Flip'])
    })

    test('result state: Draw and Resign disabled, Rematch and New game shown', () => {
        const end = { rematchState: 'idle' as const, onRematch: jest.fn(), onNewGame: jest.fn() }
        render(<ControlsCard status={{ text: 'Checkmate. You win!', tone: 'over' }} end={end}><GameActionsGrid {...actions({ over: true })} /></ControlsCard>)
        expect(screen.getByRole('button', { name: 'Resign' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Draw' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Flip' })).toBeEnabled()
        fireEvent.click(screen.getByRole('button', { name: 'Rematch' }))
        fireEvent.click(screen.getByRole('button', { name: 'New game' }))
        expect(end.onRematch).toHaveBeenCalledTimes(1)
        expect(end.onNewGame).toHaveBeenCalledTimes(1)
    })

    test.each([
        ['sent', 'Waiting…'],
        ['declined', 'Declined'],
    ] as const)('rematch %s: a disabled "%s"', (rematchState, label) => {
        const end = { rematchState, onRematch: jest.fn(), onNewGame: jest.fn() }
        render(<ControlsCard status={status} end={end}><GameActionsGrid {...actions({ over: true })} /></ControlsCard>)
        expect(screen.getByRole('button', { name: label })).toBeDisabled()
    })

    test('a spectator gets New game but no Rematch after the result', () => {
        const end = { rematchState: null, onRematch: jest.fn(), onNewGame: jest.fn() }
        render(<ControlsCard status={status} end={end}><GameActionsGrid {...actions({ isPlayer: false, over: true })} /></ControlsCard>)
        expect(screen.queryByRole('button', { name: 'Rematch' })).toBeNull()
        expect(screen.getByRole('button', { name: 'New game' })).toBeInTheDocument()
    })
})

test('FocusActions: Draw / Flip / Resign in a column; spectators get Flip only', () => {
    const { rerender } = render(<FocusActions {...actions()} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Draw', 'Flip', 'Resign'])
    rerender(<FocusActions {...actions({ isPlayer: false })} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Flip'])
})

describe('ConfirmDialogs', () => {
    const props = (open: 'draw' | 'resign' | null) => ({
        open, opponentName: 'Bob', rated: true,
        onConfirmResign: jest.fn(), onConfirmDraw: jest.fn(), onCancel: jest.fn(),
    })

    test('resign: a focus-trapped alert dialog; confirm and keep playing', () => {
        const p = props('resign')
        render(<ConfirmDialogs {...p} />)
        const dialog = screen.getByRole('alertdialog', { name: 'Resign this game?' })
        expect(dialog).toHaveAttribute('aria-modal', 'true')
        expect(dialog).toHaveTextContent("You will lose this game and rating points. This can't be undone.")
        expect(within(dialog).getByRole('button', { name: 'Yes, resign' })).toHaveFocus()
        fireEvent.click(within(dialog).getByRole('button', { name: 'Keep playing' }))
        fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, resign' }))
        expect(p.onCancel).toHaveBeenCalledTimes(1)
        expect(p.onConfirmResign).toHaveBeenCalledTimes(1)
    })

    test('draw: names the opponent; Escape cancels', () => {
        const p = props('draw')
        render(<ConfirmDialogs {...p} />)
        const dialog = screen.getByRole('alertdialog', { name: 'Offer a draw to Bob?' })
        expect(dialog).toHaveTextContent('Bob can accept or decline. If they decline, the game continues.')
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(p.onCancel).toHaveBeenCalledTimes(1)
        fireEvent.click(within(dialog).getByRole('button', { name: 'Offer draw' }))
        expect(p.onConfirmDraw).toHaveBeenCalledTimes(1)
    })

    test('nothing open: no dialog; an unrated game names no rating loss', () => {
        const { rerender } = render(<ConfirmDialogs {...props(null)} />)
        expect(screen.queryByRole('alertdialog')).toBeNull()
        rerender(<ConfirmDialogs {...props('resign')} rated={false} />)
        expect(screen.getByRole('alertdialog')).toHaveTextContent("You will lose this game. This can't be undone.")
    })
})

describe('ChatCard', () => {
    const base = {
        lines: [], me: { id: 'me', username: 'me1' }, opponentName: 'Bob', canChat: true, draft: '',
        onDraftChange: jest.fn(), onSend: jest.fn(), onQuickReply: jest.fn(),
    }

    test('empty: invites the player to talk to the opponent; quick replies send as they are', () => {
        render(<ChatCard {...base} />)
        expect(screen.getByText('Say something to Bob.')).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: 'Chat message' })).toHaveAttribute('maxLength', '140')
        fireEvent.click(screen.getByRole('button', { name: 'Nice move' }))
        expect(base.onQuickReply).toHaveBeenCalledWith('Nice move')
    })

    test('my lines read "You" (server-verified sender id); others link to their profile; latest 5 only', () => {
        const lines = [
            ...Array.from({ length: 4 }, (_, i) => ({ from: 'bob', text: `old ${i}`, fromUserId: 'opp' })),
            { from: 'me1', text: 'mine', fromUserId: 'me' },
            { from: 'bob', text: 'last', fromUserId: 'opp' },
        ]
        render(<ChatCard {...base} lines={lines} />)
        expect(screen.queryByText('old 0')).toBeNull()
        expect(screen.getByText('You').parentElement).toHaveTextContent('You mine')
        expect(screen.getAllByRole('link', { name: 'bob' })[0]).toHaveAttribute('href', '/profile/bob')
    })

    test('spectators read only', () => {
        render(<ChatCard {...base} canChat={false} />)
        expect(screen.getByText('No messages yet.')).toBeInTheDocument()
        expect(screen.queryByRole('textbox')).toBeNull()
        expect(screen.queryByRole('button')).toBeNull()
    })
})

test('GameInfoCard: the five rows; a spectator has no "Your clock"', () => {
    const info = { move: '4', captures: '2', material: 'You +3', myClock: '2:41' }
    const { rerender } = render(<GameInfoCard info={info} timeControl="Blitz 3 min" />)
    for (const text of ['Game info', 'Move', '4', 'Captures', '2', 'You +3', 'Blitz 3 min', 'Your clock', '2:41'])
        expect(screen.getByText(text)).toBeInTheDocument()
    rerender(<GameInfoCard info={{ ...info, myClock: null }} timeControl="Blitz 3 min" />)
    expect(screen.queryByText('Your clock')).toBeNull()
})

test('BoardTools: Focus mode toggles with aria-pressed; sound toggle keeps its name', () => {
    const onToggleFocus = jest.fn()
    const { rerender } = render(<BoardTools focus={false} onToggleFocus={onToggleFocus} soundOn onToggleSound={jest.fn()} />)
    const focus = screen.getByRole('button', { name: 'Focus mode' })
    expect(focus).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(focus)
    expect(onToggleFocus).toHaveBeenCalled()
    rerender(<BoardTools focus onToggleFocus={onToggleFocus} soundOn={false} onToggleSound={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Exit focus' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Toggle sound' })).toHaveAttribute('aria-pressed', 'false')
})

test('GameLayout: focus mode drops the title and side panels and shows the focus actions', () => {
    const header = { title: 'Game vs Bob', subtitle: 'Blitz · 3 min · you play White' }
    const props = { title: header.title, subtitle: header.subtitle, pills: ['Rated', 'Blitz 3 min'], boardTools: null, board: <div>BOARD</div>, focusActions: <div>ACTIONS</div>, aside: <div>ASIDE</div> }
    const { rerender } = render(<GameLayout focus={false} {...props} />)
    expect(screen.getByRole('heading', { name: 'Game vs Bob' })).toBeInTheDocument()
    expect(screen.getByText('Rated')).toBeInTheDocument()
    expect(screen.getByText('ASIDE')).toBeInTheDocument()
    expect(screen.queryByText('ACTIONS')).toBeNull()
    rerender(<GameLayout focus {...props} />)
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByText('ASIDE')).toBeNull()
    expect(screen.getByText('ACTIONS')).toBeInTheDocument()
    expect(screen.getByText('BOARD')).toBeInTheDocument()
})

test('PromotionPicker: four named choices in order, reporting the piece letter', () => {
    const onSelect = jest.fn()
    render(<PromotionPicker color="w" onSelect={onSelect} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Queen', 'Rook', 'Bishop', 'Knight'])
    fireEvent.click(screen.getByRole('button', { name: 'Knight' }))
    expect(onSelect).toHaveBeenCalledWith('n')
})
