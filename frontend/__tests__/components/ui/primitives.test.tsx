import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Pill } from '@/components/ui/Pill'
import { Slider } from '@/components/ui/Slider'
import { StatTile } from '@/components/ui/StatTile'
import { Tabs } from '@/components/ui/Tabs'
import { Tile } from '@/components/ui/Tile'

jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ children, href, ...rest }: any) => (
        <a href={href} {...rest}>{children}</a>
    ),
}))

describe('Button', () => {
    test('primary is a gold pill with the .gb hover; outline/ghost/danger change colours only', () => {
        render(
            <>
                <Button>Play Online</Button>
                <Button variant="outline">Computer</Button>
                <Button variant="ghost">Mark all read</Button>
                <Button variant="danger">Resign</Button>
            </>,
        )
        const primary = screen.getByRole('button', { name: 'Play Online' })
        expect(primary).toHaveAttribute('type', 'button')
        expect(primary).toHaveClass('gb', 'bg-accent', 'text-on-accent', 'rounded-pill', 'min-h-[44px]')
        expect(screen.getByRole('button', { name: 'Computer' })).toHaveClass('border-1.5', 'border-line-muted', 'bg-transparent')
        expect(screen.getByRole('button', { name: 'Mark all read' })).toHaveClass('text-accent')
        expect(screen.getByRole('button', { name: 'Resign' })).toHaveClass('border-danger', 'text-danger')
    })

    test('sizes set the height; a caller class replaces the default padding; href renders a link', () => {
        const onClick = jest.fn()
        render(
            <>
                <Button size="2xl" className="px-[22px]" onClick={onClick}>
                    Big
                </Button>
                <Button href="/lobby" variant="outline">
                    Go
                </Button>
            </>,
        )
        const big = screen.getByRole('button', { name: 'Big' })
        expect(big).toHaveClass('min-h-[56px]', 'px-[22px]', 'text-[17px]')
        expect(big).not.toHaveClass('px-[28px]')
        fireEvent.click(big)
        expect(onClick).toHaveBeenCalledTimes(1)
        expect(screen.getByRole('link', { name: 'Go' })).toHaveAttribute('href', '/lobby')
    })
})

describe('Tabs', () => {
    function Harness() {
        const [tab, setTab] = useState<'overview' | 'stats'>('overview')
        return (
            <Tabs
                label="Profile sections"
                value={tab}
                onChange={setTab}
                items={[
                    { id: 'overview', label: 'Overview' },
                    { id: 'stats', label: 'Stats' },
                ]}
            />
        )
    }

    test('a labelled group of aria-pressed buttons; clicking selects', () => {
        render(<Harness />)
        expect(screen.getByRole('group', { name: 'Profile sections' })).toBeInTheDocument()
        const overview = screen.getByRole('button', { name: 'Overview' })
        const stats = screen.getByRole('button', { name: 'Stats' })
        expect(overview).toHaveAttribute('aria-pressed', 'true')
        expect(overview).toHaveClass('bg-ink', 'text-on-accent', 'min-h-[44px]')
        fireEvent.click(stats)
        expect(stats).toHaveAttribute('aria-pressed', 'true')
        expect(overview).toHaveAttribute('aria-pressed', 'false')
    })
})

describe('Slider', () => {
    test('shows the label, value text and range; reports numbers', () => {
        const onChange = jest.fn()
        render(<Slider label="Minutes per side" valueText="10 min" min={1} max={60} value={10} onChange={onChange} />)
        const input = screen.getByRole('slider', { name: 'Minutes per side' })
        expect(input).toHaveAttribute('aria-valuetext', '10 min')
        expect(screen.getByText('10 min')).toBeInTheDocument()
        expect(screen.getByText('60')).toBeInTheDocument()
        fireEvent.change(input, { target: { value: '25' } })
        expect(onChange).toHaveBeenCalledWith(25)
    })
})

describe('Tile', () => {
    test('clock tile: aria-pressed, gold when selected, badge and number', () => {
        const onSelect = jest.fn()
        render(
            <Tile iconPath="M0 0" title="Blitz" blurb="Standard" value="3" unit="min" badge="Popular" selected onSelect={onSelect} />,
        )
        const tile = screen.getByRole('button', { name: /Blitz/ })
        expect(tile).toHaveAttribute('aria-pressed', 'true')
        expect(tile).toHaveClass('tile', 'bg-accent', 'border-accent', 'min-h-[216px]')
        expect(screen.getByText('3')).toHaveClass('tn')
        expect(screen.getByText('Popular')).toHaveClass('bg-on-accent')
        fireEvent.click(tile)
        expect(onSelect).toHaveBeenCalledTimes(1)
    })

    test('wide tile: unselected surface with the meta note', () => {
        render(<Tile variant="wide" iconPath="M0 0" title="Daily" blurb="Days per move" meta="1 day/move" selected={false} onSelect={() => {}} />)
        const tile = screen.getByRole('button', { name: /Daily/ })
        expect(tile).toHaveAttribute('aria-pressed', 'false')
        expect(tile).toHaveClass('bg-surface', 'border-line', 'min-h-[76px]')
        expect(screen.getByText('1 day/move')).toBeInTheDocument()
    })
})

describe('Avatar, Pill, StatTile, Card', () => {
    test('Avatar shows the initial (decorative) or the photo, and a status dot', () => {
        const { container, rerender } = render(<Avatar name="maverick" status="online" />)
        const avatar = container.firstElementChild!
        expect(avatar).toHaveAttribute('aria-hidden', 'true')
        expect(avatar).toHaveTextContent('M')
        expect(avatar.querySelector('.bg-success')).not.toBeNull()
        rerender(<Avatar name="maverick" src="https://img.test/a.png" />)
        expect(container.querySelector('img[src="https://img.test/a.png"]')).not.toBeNull()
    })

    test('Pill: success with a dot, neutral chip', () => {
        render(
            <>
                <Pill dot size="md">
                    1 online
                </Pill>
                <Pill tone="neutral">India</Pill>
            </>,
        )
        expect(screen.getByText('1 online')).toHaveClass('bg-success-bg', 'text-success-ink', 'min-h-[32px]')
        expect(screen.getByText('1 online').querySelector('.bg-success')).not.toBeNull()
        expect(screen.getByText('India')).toHaveClass('border-line', 'bg-bg-base', 'min-h-[28px]')
    })

    test('StatTile and Card', () => {
        render(
            <Card tone="raised" aria-label="Summary">
                <StatTile value="19" label="Wins" tone="success" />
            </Card>,
        )
        expect(screen.getByLabelText('Summary')).toHaveClass('bg-surface-raised', 'rounded-24')
        expect(screen.getByText('19')).toHaveClass('font-mono', 'text-success')
        expect(screen.getByText('Wins')).toHaveClass('text-ink-muted')
    })
})

describe('Dialog', () => {
    function Harness({ onConfirm = jest.fn() }) {
        const [open, setOpen] = useState(false)
        return (
            <>
                <button type="button" onClick={() => setOpen(true)}>
                    Resign
                </button>
                <Dialog open={open} onClose={() => setOpen(false)} title="Resign this game?" role="alertdialog" tone="danger" description="You will lose.">
                    <Button variant="danger-solid" onClick={onConfirm}>
                        Yes, resign
                    </Button>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Keep playing
                    </Button>
                </Dialog>
            </>
        )
    }

    test('opens modal, focuses the first action, traps Tab, Esc closes and restores focus', () => {
        render(<Harness />)
        const opener = screen.getByRole('button', { name: 'Resign' })
        opener.focus()
        fireEvent.click(opener)
        const dialog = screen.getByRole('alertdialog', { name: 'Resign this game?' })
        expect(dialog).toHaveAttribute('aria-modal', 'true')
        expect(dialog).toHaveClass('border-danger')
        const yes = screen.getByRole('button', { name: 'Yes, resign' })
        const keep = screen.getByRole('button', { name: 'Keep playing' })
        expect(yes).toHaveFocus()
        keep.focus()
        fireEvent.keyDown(document, { key: 'Tab' })
        expect(yes).toHaveFocus()
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
        expect(keep).toHaveFocus()
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(screen.queryByRole('alertdialog')).toBeNull()
        expect(opener).toHaveFocus()
    })

    test('a click on the backdrop closes it', () => {
        const { container } = render(<Harness />)
        fireEvent.click(screen.getByRole('button', { name: 'Resign' }))
        fireEvent.click(container.querySelector('.bg-scrim')!)
        expect(screen.queryByRole('alertdialog')).toBeNull()
    })
})
