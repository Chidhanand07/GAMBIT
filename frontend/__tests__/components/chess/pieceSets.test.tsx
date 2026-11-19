// PIECE-SETS (ADR F-147): the shared Piece draws the set the nearest provider names; the settings
// provider applies the saved set app-wide and the Settings preview shows the draft's set.
import { fireEvent, render, screen } from '@testing-library/react'
import { Board } from '@/components/chess/Board'
import { Piece } from '@/components/chess/Piece'
import { PieceSetProvider } from '@/components/chess/pieceSets'
import { SettingsProvider } from '@/features/settings/SettingsProvider'
import { BoardPreview } from '@/features/settings/components/BoardPreview'
import { DEFAULT_SETTINGS, parseSettings } from '@/features/settings/model'
import { BOARD_ROWS } from '@/features/settings/rows'
import { settingsStore } from '../../helpers/settingsStore'

jest.mock('@/lib/sounds', () => ({ setSoundsEnabled: jest.fn(), playPreviewMoveSound: jest.fn() }))

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'

describe('Piece', () => {
    test('Gambit (default, no provider): the SVG artwork, no text glyph', () => {
        const { container } = render(<Piece color="w" type="k" />)
        expect(container.querySelector('svg')).toHaveAttribute('data-piece-set', 'gambit')
        expect(container.querySelector('text')).toBeNull()
        expect(container.querySelectorAll('rect').length).toBeGreaterThan(0)
    })

    test.each([
        ['classic', 'w', '♚︎', ['fill-piece-glyph-white', 'stroke-piece-glyph-black']],
        ['classic', 'b', '♚︎', ['fill-piece-glyph-black']],
        ['lineart', 'w', '♔︎', ['fill-piece-glyph-black']],
        ['lineart', 'b', '♔︎', ['fill-piece-glyph-neo']],
    ] as const)('%s %s king: glyph %p in the mockup colours, text presentation', (set, color, glyph, classes) => {
        const { container } = render(<PieceSetProvider value={set}><Piece color={color} type="k" /></PieceSetProvider>)
        const text = container.querySelector('text')!
        expect(text.textContent).toBe(glyph)
        expect(text).toHaveClass('font-symbols', ...classes)
        expect(container.querySelector('svg')).toHaveAttribute('data-piece-set', set)
    })

    test('only Classic white carries the outline stroke', () => {
        const { container } = render(
            <PieceSetProvider value="classic"><Piece color="w" type="q" /><Piece color="b" type="q" /></PieceSetProvider>,
        )
        const [white, black] = container.querySelectorAll('text')
        expect(white).toHaveAttribute('paint-order', 'stroke')
        expect(black).not.toHaveAttribute('paint-order')
    })
})

describe('applied app-wide and previewed', () => {
    test('the saved set reaches every board under the settings provider', () => {
        const { container } = render(
            <SettingsProvider store={settingsStore({ ...DEFAULT_SETTINGS, pieceSet: 'lineart' })}>
                <Board fen={START} label="Game board" />
            </SettingsProvider>,
        )
        const sets = new Set([...container.querySelectorAll('svg[data-piece-set]')].map((s) => s.getAttribute('data-piece-set')))
        expect([...sets]).toEqual(['lineart'])
        expect(container.querySelectorAll('svg[data-piece-set]')).toHaveLength(32)
    })

    test('the preview follows the draft, not the saved set', () => {
        const { container } = render(
            <SettingsProvider store={settingsStore()}>
                <BoardPreview settings={{ ...DEFAULT_SETTINGS, pieceSet: 'classic' }} />
            </SettingsProvider>,
        )
        expect(container.querySelector('svg[data-piece-set]')).toHaveAttribute('data-piece-set', 'classic')
        fireEvent.click(screen.getByRole('button', { name: 'Play e2 to e4' }))
        expect(container.querySelector('svg[data-piece-set="gambit"]')).toBeNull()
    })

    test('the "Piece set" row offers the three sets of the mockup, after Board theme; bad values parse to Gambit', () => {
        const row = BOARD_ROWS[1]
        expect(row).toMatchObject({ key: 'pieceSet', label: 'Piece set', hint: 'Style of the pieces on the board.' })
        expect(row.kind === 'choice' && row.options.map((o) => o.label)).toEqual(['Gambit', 'Classic', 'Line art'])
        expect(parseSettings({ pieceSet: 'neon' }).pieceSet).toBe('gambit')
        expect(parseSettings({ pieceSet: 'lineart' }).pieceSet).toBe('lineart')
    })
})
