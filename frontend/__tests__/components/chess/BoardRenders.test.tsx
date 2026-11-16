/**
 * "Re-renders only changed squares": BoardSquare is memoised, so a move re-renders just the
 * squares whose props changed. Counted by wrapping the memoised component.
 */
const renders = new Map<string, number>()
jest.mock('@/components/chess/BoardSquare', () => {
    const actual = jest.requireActual('@/components/chess/BoardSquare')
    const React = jest.requireActual('react')
    const Inner = actual.BoardSquare.type
    const Counted = (props: { square: string }) => {
        renders.set(props.square, (renders.get(props.square) ?? 0) + 1)
        return React.createElement(Inner, props)
    }
    return { ...actual, BoardSquare: React.memo(Counted) }
})

import { render } from '@testing-library/react'
import { Board } from '@/components/chess/Board'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

test('a move re-renders only the squares it touched; a new click handler re-renders none', () => {
    const { rerender } = render(<Board fen={START} onSquareClick={() => {}} />)
    renders.clear()
    rerender(<Board fen={AFTER_E4} lastMove={{ from: 'e2', to: 'e4' }} onSquareClick={() => {}} />)
    expect([...renders.keys()].sort()).toEqual(['e2', 'e4'])
    renders.clear()
    rerender(<Board fen={AFTER_E4} lastMove={{ from: 'e2', to: 'e4' }} onSquareClick={() => {}} />)
    expect(renders.size).toBe(0)
})
