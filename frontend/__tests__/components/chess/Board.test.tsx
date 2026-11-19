import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import type { Square } from 'chess.js'
import { Board } from '@/components/chess/Board'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

const sq = (container: HTMLElement, name: string) => container.querySelector<HTMLElement>(`[data-square="${name}"]`)!
const slotOf = (container: HTMLElement, piece: string) =>
    [...container.querySelectorAll<HTMLElement>('.g-piece-slot')].filter((s) => s.querySelector(`[data-piece="${piece}"]`))

/** A minimal click-to-move harness, the way the game/offline/analysis pages drive the board. */
function Harness({ onSquareClick }: { onSquareClick: jest.Mock }) {
    const [selected, setSelected] = useState<Square | null>(null)
    return (
        <Board
            fen={START}
            selectedSquare={selected}
            legalDestinations={selected === 'e2' ? ['e3', 'e4'] : []}
            onSquareClick={(s) => {
                onSquareClick(s)
                setSelected(s === selected ? null : s)
            }}
        />
    )
}

describe('Board', () => {
    test('renders 64 squares and 32 SVG pieces from the FEN; read-only boards are a labelled image', () => {
        const { container } = render(<Board fen={START} label="Starting position" />)
        expect(screen.getByRole('img', { name: 'Starting position' })).toBeInTheDocument()
        expect(container.querySelectorAll('[data-square]')).toHaveLength(64)
        expect(container.querySelectorAll('.g-piece-slot svg')).toHaveLength(32)
        expect(screen.queryAllByRole('button')).toHaveLength(0)
        expect(sq(container, 'a8')).toHaveClass('bg-board-light')
        expect(sq(container, 'h8')).toHaveClass('bg-board-dark')
    })

    test('click to select: squares are named buttons, the callback gets the square, the selection is tinted', () => {
        const onSquareClick = jest.fn()
        const { container } = render(<Harness onSquareClick={onSquareClick} />)
        expect(screen.getByRole('group', { name: 'Chess board' })).toBeInTheDocument()
        const e2 = screen.getByRole('button', { name: 'e2, white pawn' })
        fireEvent.click(e2)
        expect(onSquareClick).toHaveBeenCalledWith('e2')
        expect(e2).toHaveAttribute('aria-pressed', 'true')
        expect(sq(container, 'e2').querySelector('[data-mark="selected"]')).toHaveClass('bg-mark-selected')
        fireEvent.click(screen.getByRole('button', { name: 'e4' }))
        expect(onSquareClick).toHaveBeenLastCalledWith('e4')
    })

    test('legal destinations: dots on empty squares, capture tint on occupied ones', () => {
        const { container } = render(<Board fen={START} selectedSquare="b1" legalDestinations={['a3', 'c3', 'd2']} />)
        expect(sq(container, 'a3').querySelector('[data-dot]')).toHaveClass('bg-mark-dot')
        expect(sq(container, 'c3').querySelector('[data-dot]')).not.toBeNull()
        expect(sq(container, 'd2').querySelector('[data-dot]')).toBeNull()
        expect(sq(container, 'd2').querySelector('[data-mark="capture"]')).toHaveClass('bg-mark-capture')
        expect(container.querySelectorAll('[data-dot]')).toHaveLength(2)
    })

    test('last-move and check highlights', () => {
        const { container } = render(<Board fen={AFTER_E4} lastMove={{ from: 'e2', to: 'e4' }} checkSquare="e8" />)
        expect(sq(container, 'e2').querySelector('[data-mark="last"]')).toHaveClass('bg-mark-last')
        expect(sq(container, 'e4').querySelector('[data-mark="last"]')).not.toBeNull()
        expect(sq(container, 'e8').querySelector('[data-mark="check"]')).toHaveClass('bg-mark-check')
        expect(container.querySelectorAll('[data-mark]')).toHaveLength(3)
    })

    test('flip: black at the bottom puts h1 top-left and moves the pieces', () => {
        const { container, rerender } = render(<Board fen={START} />)
        const grid = container.querySelector('.grid')!
        expect(grid.firstElementChild).toHaveAttribute('data-square', 'a8')
        const king = slotOf(container, 'wk')[0]
        expect([king.style.left, king.style.top]).toEqual(['50%', '87.5%'])
        rerender(<Board fen={START} orientation="black" />)
        expect(grid.firstElementChild).toHaveAttribute('data-square', 'h1')
        expect([king.style.left, king.style.top]).toEqual(['37.5%', '0%'])
    })

    test('a move keeps the moved piece element (it slides) instead of remounting it', () => {
        const { container, rerender } = render(<Board fen={START} />)
        const e2Pawn = container.querySelector<HTMLElement>('.g-piece-slot[style*="left: 50%"][style*="top: 75%"]')!
        rerender(<Board fen={AFTER_E4} lastMove={{ from: 'e2', to: 'e4' }} />)
        expect(e2Pawn.isConnected).toBe(true)
        expect([e2Pawn.style.left, e2Pawn.style.top]).toEqual(['50%', '50%'])
        expect(e2Pawn).not.toHaveClass('g-instant')
        expect(container.querySelectorAll('.g-piece-slot')).toHaveLength(32)
    })

    test('animate={false} makes pieces jump; coordinates show ranks on the left file and files on the bottom rank', () => {
        const { container } = render(<Board fen={START} animate={false} showCoordinates />)
        expect(container.querySelector('.g-piece-slot')).toHaveClass('g-instant')
        // [F-106] was: the opposite square colour (text-board-dark / -light, 2.3:1) — now the dark ink (AA)
        expect(within(sq(container, 'a8')).getByText('8')).toHaveClass('text-on-accent')
        expect(within(sq(container, 'a1')).getByText('1')).toBeInTheDocument()
        expect(within(sq(container, 'a1')).getByText('a')).toBeInTheDocument()
        expect(within(sq(container, 'a1')).getByText('a')).toHaveClass('text-on-accent')
        expect(within(sq(container, 'h1')).getByText('h')).toHaveClass('text-on-accent')
        expect(sq(container, 'e4').textContent).toBe('')
    })

    test('theme and frame classes; overlays render above the pieces', () => {
        const { container } = render(
            <Board fen="8/8/8/8/8/8/8/8" theme="green" frame="hero">
                <div data-testid="overlay" />
            </Board>,
        )
        const board = container.firstElementChild!
        expect(board).toHaveClass('border-[10px]', 'shadow-board-hero', 'aspect-square')
        expect(sq(container, 'a8')).toHaveClass('bg-board-green-light')
        expect(board.lastElementChild).toHaveAttribute('data-testid', 'overlay')
    })
})
