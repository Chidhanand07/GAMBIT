import { cellAt, cellIndex, columnsFor, glyphForCell, TRAIL_GLYPH_RULES } from '@/lib/design/glyphIndex'

const VS = '︎'
const KNIGHT = `♞${VS}`
const BISHOP = `♝${VS}`
const ROOK = `♜${VS}`
const QUEEN = `♛${VS}`
const KING = `♚${VS}`

describe('glyphForCell (HANDOFF §4.1)', () => {
    test('each rule matches its own an+b cells, starting at b', () => {
        expect(glyphForCell(4)).toBe(KNIGHT)
        expect(glyphForCell(11)).toBe(KNIGHT)
        expect(glyphForCell(8)).toBe(BISHOP)
        expect(glyphForCell(30)).toBe(BISHOP)
        expect(glyphForCell(12)).toBe(ROOK)
        expect(glyphForCell(29)).toBe(ROOK)
        expect(glyphForCell(19)).toBe(QUEEN)
        expect(glyphForCell(48)).toBe(QUEEN)
        expect(glyphForCell(25)).toBe(KING)
        expect(glyphForCell(66)).toBe(KING)
    })

    test('cells before an offset and off every progression have no glyph', () => {
        for (const n of [1, 2, 3, 5, 6, 7, 9, 10, 13, 14]) expect(glyphForCell(n)).toBe('')
        expect(glyphForCell(-3)).toBe('')
    })

    test('later rules win where progressions overlap', () => {
        const owners = (n: number) => TRAIL_GLYPH_RULES.filter((r) => n >= r.offset && (n - r.offset) % r.step === 0)
        let checked = 0
        for (let n = 1; n <= 2000; n++) {
            const hits = owners(n)
            if (hits.length > 1) {
                expect(glyphForCell(n)).toBe(hits[hits.length - 1].glyph)
                checked++
            }
        }
        expect(checked).toBeGreaterThan(10)
        // Concrete overlaps: 19 is ♝(11·1+8) and ♛(29·0+19) → ♛; 25 is ♞(7·3+4) and ♚ → ♚; 46 is ♞ and ♜(17·2+12) → ♜.
        expect(glyphForCell(19)).toBe(QUEEN)
        expect(glyphForCell(25)).toBe(KING)
        expect(glyphForCell(46)).toBe(ROOK)
    })

    test('the CSS nth-child rules carry the same steps, offsets and order', () => {
        expect(TRAIL_GLYPH_RULES.map((r) => `${r.step}n+${r.offset}`)).toEqual(['7n+4', '11n+8', '17n+12', '29n+19', '41n+25'])
    })
})

describe('grid geometry', () => {
    test('cellIndex is 1-based in row-major (DOM) order', () => {
        expect(cellIndex(0, 0, 18)).toBe(1)
        expect(cellIndex(3, 0, 18)).toBe(4)
        expect(cellIndex(0, 1, 18)).toBe(19)
    })

    test('cellAt floors the point into its cell', () => {
        expect(cellAt(0, 0, 80)).toEqual({ col: 0, row: 0 })
        expect(cellAt(79.9, 80, 80)).toEqual({ col: 0, row: 1 })
        expect(cellAt(241, 159, 80)).toEqual({ col: 3, row: 1 })
    })

    test('columnsFor matches repeat(auto-fill, 80px) and never drops below one', () => {
        expect(columnsFor(1440, 80)).toBe(18)
        expect(columnsFor(1439, 80)).toBe(17)
        expect(columnsFor(10, 80)).toBe(1)
    })
})
