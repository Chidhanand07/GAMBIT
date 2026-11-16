import { fireEvent, render, screen } from '@testing-library/react'
import { Clock } from '@/components/chess/Clock'
import { MoveList } from '@/components/chess/MoveList'
import { PlayerBar } from '@/components/chess/PlayerBar'

describe('Clock', () => {
    test('formats the time; gold when running, coral when low, surface otherwise', () => {
        const { rerender } = render(<Clock seconds={185} active label="Your clock" />)
        const clock = screen.getByRole('timer', { name: 'Your clock' })
        expect(clock).toHaveTextContent('3:05')
        expect(clock).toHaveClass('bg-accent', 'text-on-accent', 'font-mono')
        rerender(<Clock seconds={12} active label="Your clock" low />)
        expect(clock).toHaveClass('bg-danger')
        rerender(<Clock seconds={185} active={false} label="Your clock" />)
        expect(clock).toHaveClass('bg-surface', 'text-ink')
    })
})

describe('PlayerBar', () => {
    test('name, rating, country, captures, draining bar and the clock slot; gold ring when to move', () => {
        const { container } = render(
            <PlayerBar name="chiruparande" rating="1228" country="IN" side="black" active captures="♟♟ +1" timePercent={40} clock={<span>clock</span>} />,
        )
        expect(screen.getByText('chiruparande')).toHaveClass('font-bold')
        expect(screen.getByText('1228')).toHaveClass('font-mono')
        expect(screen.getByText('IN')).toBeInTheDocument()
        expect(screen.getByText('♟♟ +1')).toHaveClass('font-symbols')
        expect(screen.getByText('clock')).toBeInTheDocument()
        expect(container.firstElementChild).toHaveClass('border-accent')
        expect(container.querySelector<HTMLElement>('[style*="width"]')!.style.width).toBe('40%')
    })

    test('not to move: subtle ring; low time turns the bar coral', () => {
        const { container } = render(<PlayerBar name="me" side="white" active={false} timePercent={5} low />)
        expect(container.firstElementChild).toHaveClass('border-line-subtle')
        expect(container.querySelector('[style*="width"]')).toHaveClass('bg-danger')
    })
})

describe('MoveList', () => {
    test('empty state', () => {
        render(<MoveList moves={[]} />)
        expect(screen.getByText('No moves yet.')).toBeInTheDocument()
    })

    test('numbered pairs; the current ply is marked and moves are buttons when selectable', () => {
        const onSelectPly = jest.fn()
        render(<MoveList moves={['e4', 'e5', 'f4']} currentPly={2} onSelectPly={onSelectPly} />)
        expect(screen.getByText('1.')).toHaveClass('text-ink-faint')
        expect(screen.getByText('2.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'f4' })).toHaveAttribute('aria-current', 'step')
        fireEvent.click(screen.getByRole('button', { name: 'e5' }))
        expect(onSelectPly).toHaveBeenCalledWith(1)
    })
})
