import { render } from '@testing-library/react'
import { Piece, pieceName } from '@/components/chess/Piece'
import { assignPieceIds, gridPosition, parsePlacement, squaresFor } from '@/components/chess/boardModel'

/** Direct children of an <svg> by tag (jsdom does not support `:scope >` on SVG). */
const kid = (svg: Element, tag: string) => [...svg.children].filter((c) => c.tagName === tag)

describe('Piece', () => {
    test('a decorative 45×45 SVG with the side tokens; base drawn for every piece', () => {
        const { container } = render(<Piece color="w" type="q" />)
        const svg = container.querySelector('svg')!
        expect(svg).toHaveAttribute('viewBox', '0 0 45 45')
        expect(svg).toHaveAttribute('aria-hidden', 'true')
        expect(svg.querySelector('g')).toHaveClass('fill-piece-white-fill', 'stroke-piece-white-line')
        expect(svg.querySelectorAll('rect')).toHaveLength(2)
        expect(svg.querySelectorAll('circle')).toHaveLength(5)
    })

    test('black pieces use the black tokens; bishop and rook carry a detail stroke', () => {
        const { container } = render(
            <>
                <Piece color="b" type="b" />
                <Piece color="b" type="r" />
                <Piece color="b" type="p" />
            </>,
        )
        const [bishop, rook, pawn] = [...container.querySelectorAll('svg')]
        expect(bishop.querySelector('g')).toHaveClass('fill-piece-black-fill', 'stroke-piece-black-line')
        expect(kid(bishop, 'path')[0]).toHaveClass('stroke-piece-black-detail')
        expect(kid(rook, 'path')[0]).toHaveAttribute('opacity', '0.6')
        expect(kid(pawn, 'path')).toHaveLength(0)
    })

    test('the knight is the logo path, its base in its own group, the eye filled', () => {
        const { container } = render(<Piece color="w" type="n" />)
        const svg = container.querySelector('svg')!
        expect(svg.querySelector('g[transform="translate(-2.4 -4.14) scale(0.8)"] path')).not.toBeNull()
        expect(kid(svg, 'g')).toHaveLength(2)
        expect(kid(svg, 'circle')[0]).toHaveClass('fill-piece-white-detail')
    })

    test('is memoised and names pieces', () => {
        expect((Piece as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'))
        expect(pieceName('b', 'k')).toBe('black king')
    })
})

describe('boardModel', () => {
    test('parsePlacement reads FEN or bare placement', () => {
        const pieces = parsePlacement('4k3/8/8/8/8/8/4P3/4K2R w K - 0 1')
        expect(pieces).toEqual([
            { color: 'b', type: 'k', square: 'e8' },
            { color: 'w', type: 'p', square: 'e2' },
            { color: 'w', type: 'k', square: 'e1' },
            { color: 'w', type: 'r', square: 'h1' },
        ])
        expect(parsePlacement('8/8/8/8/8/8/8/8')).toEqual([])
    })

    test('assignPieceIds keeps ids for unmoved and moved pieces, drops captures, mints new ids', () => {
        const start = assignPieceIds([], parsePlacement('4k3/8/8/3p4/4P3/8/8/4K2R'))
        const id = (pieces: typeof start, square: string) => pieces.find((p) => p.square === square)?.id
        // exd5: the e4 pawn moves to d5 and captures.
        const after = assignPieceIds(start, parsePlacement('4k3/8/8/3P4/8/8/8/4K2R'))
        expect(id(after, 'd5')).toBe(id(start, 'e4'))
        expect(id(after, 'e1')).toBe(id(start, 'e1'))
        expect(after).toHaveLength(4)
        // Castling: king and rook both keep their ids.
        const castled = assignPieceIds(after, parsePlacement('4k3/8/8/3P4/8/8/8/5RK1'))
        expect(id(castled, 'g1')).toBe(id(after, 'e1'))
        expect(id(castled, 'f1')).toBe(id(after, 'h1'))
        // Promotion: a new queen id that no earlier piece had.
        const promoted = assignPieceIds(castled, parsePlacement('3Qk3/8/8/8/8/8/8/5RK1'))
        expect(new Set(castled.map((p) => p.id)).has(id(promoted, 'd8')!)).toBe(false)
        expect(new Set(promoted.map((p) => p.id)).size).toBe(promoted.length)
    })

    test('of two same pieces the nearest one is the mover', () => {
        const before = assignPieceIds([], parsePlacement('8/8/8/8/8/8/8/R6R'))
        const after = assignPieceIds(before, parsePlacement('8/8/8/8/8/8/8/1R5R'))
        expect(after.find((p) => p.square === 'b1')!.id).toBe(before.find((p) => p.square === 'a1')!.id)
    })

    test('grid geometry for both orientations', () => {
        expect(gridPosition('a8', 'white')).toEqual({ col: 0, row: 0 })
        expect(gridPosition('e1', 'white')).toEqual({ col: 4, row: 7 })
        expect(gridPosition('e1', 'black')).toEqual({ col: 3, row: 0 })
        expect(squaresFor('white')[0]).toBe('a8')
        expect(squaresFor('black')[0]).toBe('h1')
        expect(squaresFor('black')[63]).toBe('a8')
    })
})
