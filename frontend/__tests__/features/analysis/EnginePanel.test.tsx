/**
 * [F-103] The engine readout is built from the design's label / value rows ("Game info" in
 * Game.dc.html): no bespoke card, no colours outside the tokens.
 */
import { render, screen, within } from '@testing-library/react'
import { EnginePanel } from '@/features/analysis/components/EnginePanel'

const rowsOf = (el: HTMLElement) => Array.from(el.children).map(r => Array.from(r.children).map(c => c.textContent))

describe('EnginePanel readout', () => {
    test('evaluation, best move, depth and (when sent) the first eight moves of the line', () => {
        const data = { score: 0.35, mate: null, best_move: 'e2e4', pv: 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7' }
        render(<EnginePanel enabled onToggle={jest.fn()} data={data} failed={false} />)
        const readout = screen.getByRole('group', { name: 'Engine evaluation' })
        expect(rowsOf(readout)).toEqual([
            ['Evaluation', '+0.3'],
            ['Best move', 'e2e4'],
            ['Depth', '18'],
            ['Line', 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6'],
        ])
        // the rows are the shared InfoRow: hairline above, muted label, mono value
        const first = readout.children[0] as HTMLElement
        expect(first).toHaveClass('border-t-1', 'border-line-subtle')
        expect(within(first).getByText('Evaluation')).toHaveClass('text-ink-muted')
        expect(within(first).getByText('+0.3')).toHaveClass('font-mono', 'font-bold')
    })

    test('no readout while the engine is off or has nothing yet', () => {
        const { rerender } = render(<EnginePanel enabled={false} onToggle={jest.fn()} data={null} failed={false} />)
        expect(screen.queryByRole('group', { name: 'Engine evaluation' })).toBeNull()
        rerender(<EnginePanel enabled onToggle={jest.fn()} data={null} failed={false} />)
        expect(screen.queryByRole('group', { name: 'Engine evaluation' })).toBeNull()
    })
})
